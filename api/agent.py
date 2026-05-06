"""
Gavel agent - reasons over web evidence to resolve prediction-market questions.

Resilient against Anthropic API overload by:
  1. Retrying with exponential backoff
  2. Falling back to AWS Bedrock (separate quota pool, AWS-native infra)

Bedrock fallback notes:
  - Bedrock doesn't currently support Anthropic's native web_search tool, so
    the fallback path uses training-data knowledge only. This is lower quality
    but keeps the demo alive when api.anthropic.com is overloaded.
  - The IAM role of the Lambda must allow bedrock:InvokeModel.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import asdict, dataclass, field
from typing import Optional

from anthropic import Anthropic


# ---------- Types ----------

@dataclass
class Source:
    url: str
    title: str
    snippet: str = ""


@dataclass
class Verdict:
    verdict: str
    confidence: float
    reasoning: str
    sources: list[Source] = field(default_factory=list)
    model: str = ""
    raw_response: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ---------- Defaults ----------

DEFAULT_BLOCKED_DOMAINS = [
    "reddit.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "tiktok.com",
    "pinterest.com",
    "quora.com",
    "answers.com",
    "wikihow.com",
]

SYSTEM_PROMPT = """You are Gavel, an evidence-based oracle for prediction markets.

Your job: given a yes/no question, search reputable news sources and return a verdict.

Rules:
1. Only use information you can verify from the web_search results.
2. Prefer reputable news sources: Reuters, AP, BBC, Bloomberg, FT, WSJ, NYT, Guardian, CNBC, official government sources, and primary documents.
3. If the question is about a future event that hasn't happened yet, return UNRESOLVED.
4. If sources conflict or evidence is weak, return UNRESOLVED with low confidence.
5. Cite at least 2 independent sources for any YES or NO verdict.
6. Be conservative. UNRESOLVED is always a valid answer when evidence is thin.

Output format - your FINAL message must be ONLY a JSON object, no prose around it:

{
  "verdict": "YES" | "NO" | "UNRESOLVED",
  "confidence": 0.0 to 1.0,
  "reasoning": "1-3 sentences explaining the evidence",
  "sources": [
    {"url": "...", "title": "...", "snippet": "key quote or fact, < 20 words"}
  ]
}

Do not include markdown code fences. Do not include any text before or after the JSON.
"""

# Bedrock fallback prompt - acknowledges no web search available.
SYSTEM_PROMPT_BEDROCK = SYSTEM_PROMPT + """

NOTE: You are running in a fallback mode without web search. Use only widely-known
facts from your training data. If you can't be highly confident from training-data
knowledge alone, return UNRESOLVED. Sources should still be cited from your
training-data memory of reputable sources.
"""


def _is_overloaded(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "529" in msg
        or "overloaded" in msg
        or "rate_limit" in msg
        or "rate limit" in msg
        or "503" in msg
        or "502" in msg
        or "504" in msg
        or "timeout" in msg
        or "timed out" in msg
        or "connection" in msg
    )


# ---------- Agent ----------

class GavelAgent:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "claude-sonnet-4-5",
        enable_bedrock_fallback: Optional[bool] = None,
    ):
        self.client = Anthropic(api_key=api_key or os.environ["ANTHROPIC_API_KEY"])
        self.model = model
        self.last_model_used = ""

        if enable_bedrock_fallback is None:
            enable_bedrock_fallback = (
                os.environ.get("BEDROCK_FALLBACK_ENABLED", "false").lower() == "true"
            )
        self.enable_bedrock_fallback = enable_bedrock_fallback
        self.bedrock_model_id = os.environ.get(
            "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        )

    # ---- Anthropic primary path ----

    def _call_anthropic(
        self,
        user_prompt: str,
        blocked: list[str],
        max_searches: int,
    ):
        # Retry up to 3 times with exponential backoff on transient errors.
        last_err: Optional[Exception] = None
        for attempt in range(3):
            try:
                return self.client.messages.create(
                    model=self.model,
                    max_tokens=2048,
                    system=SYSTEM_PROMPT,
                    tools=[
                        {
                            "type": "web_search_20250305",
                            "name": "web_search",
                            "max_uses": max_searches,
                            "blocked_domains": blocked,
                        }
                    ],
                    messages=[{"role": "user", "content": user_prompt}],
                )
            except Exception as e:
                last_err = e
                if not _is_overloaded(e) or attempt == 2:
                    raise
                wait_s = 2 ** attempt  # 1s, 2s
                print(f"[gavel-agent] anthropic transient error (attempt {attempt + 1}/3): {e}. retrying in {wait_s}s")
                time.sleep(wait_s)
        raise last_err if last_err else RuntimeError("anthropic exhausted retries")

    # ---- Bedrock fallback path ----

    def _call_bedrock(self, user_prompt: str) -> Optional[Verdict]:
        try:
            import boto3
        except ImportError:
            print("[gavel-agent] bedrock fallback unavailable: boto3 not installed")
            return None

        try:
            region = os.environ.get("AWS_REGION", "us-east-1")
            client = boto3.client("bedrock-runtime", region_name=region)

            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1024,
                "system": SYSTEM_PROMPT_BEDROCK,
                "messages": [{"role": "user", "content": user_prompt}],
            })

            print(f"[gavel-agent] falling back to Bedrock model {self.bedrock_model_id}")
            resp = client.invoke_model(
                modelId=self.bedrock_model_id,
                body=body,
                contentType="application/json",
            )
            payload = json.loads(resp["body"].read())
            text = "".join(
                blk.get("text", "")
                for blk in payload.get("content", [])
                if blk.get("type") == "text"
            )
            self.last_model_used = f"bedrock:{self.bedrock_model_id}"
            verdict = self._parse_verdict(text)
            verdict.model = self.last_model_used
            verdict.raw_response = text
            return verdict
        except Exception as e:
            print(f"[gavel-agent] bedrock fallback failed: {e}")
            return None

    # ---- Public API ----

    def resolve(
        self,
        question: str,
        blocked_domains: Optional[list[str]] = None,
        cutoff_time: Optional[str] = None,
        max_searches: int = 3,
    ) -> Verdict:
        blocked = blocked_domains or DEFAULT_BLOCKED_DOMAINS

        user_prompt = f"Question: {question}\n"
        if cutoff_time:
            user_prompt += f"Resolve as of: {cutoff_time}\n"
        user_prompt += "\nSearch reputable news sources and return your verdict as JSON."

        # 1. Try Anthropic first.
        try:
            response = self._call_anthropic(user_prompt, blocked, max_searches)
            self.last_model_used = self.model
            final_text = "".join(b.text for b in response.content if b.type == "text")
            verdict = self._parse_verdict(final_text)
            verdict.model = self.last_model_used
            verdict.raw_response = final_text
            return verdict
        except Exception as e:
            anthropic_error = e
            print(f"[gavel-agent] anthropic primary path failed: {e}")

        # 2. If Anthropic was overloaded and Bedrock is enabled, try Bedrock.
        if _is_overloaded(anthropic_error) and self.enable_bedrock_fallback:
            verdict = self._call_bedrock(user_prompt)
            if verdict is not None:
                return verdict

        # 3. Out of options.
        raise anthropic_error

    @staticmethod
    def _parse_verdict(text: str) -> Verdict:
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            return Verdict(
                verdict="UNRESOLVED",
                confidence=0.0,
                reasoning="Agent did not return parseable JSON.",
                sources=[],
            )
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError as e:
            return Verdict(
                verdict="UNRESOLVED",
                confidence=0.0,
                reasoning=f"JSON parse error: {e}",
                sources=[],
            )

        sources = [
            Source(
                url=s.get("url", ""),
                title=s.get("title", ""),
                snippet=s.get("snippet", ""),
            )
            for s in data.get("sources", [])
        ]

        return Verdict(
            verdict=str(data.get("verdict", "UNRESOLVED")).upper(),
            confidence=float(data.get("confidence", 0.0)),
            reasoning=str(data.get("reasoning", "")),
            sources=sources,
        )