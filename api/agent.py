"""
Gavel agent - reasons over web evidence to resolve prediction-market questions.

Resilient against Anthropic 529 overload by:
  1. Retrying with exponential backoff
  2. Falling back across Anthropic model tiers
  3. Falling back to AWS Bedrock as final safety net (different quota pool)
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

# Try in order. When one is 529'd, fall through to the next.
# Different model tiers often have separate quota pools.
MODEL_FALLBACK_CHAIN = [
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",   # version-pinned alias, sometimes routes differently
    "claude-haiku-4-5",              # different tier, often has capacity when Sonnet doesn't
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


def _is_overloaded(exc: Exception) -> bool:
    """Anthropic 529 / generic transient errors that warrant trying another model."""
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
        model_chain: Optional[list[str]] = None,
        enable_bedrock_fallback: bool = True,
    ):
        self.client = Anthropic(api_key=api_key or os.environ["ANTHROPIC_API_KEY"])
        self.model_chain = model_chain or MODEL_FALLBACK_CHAIN
        self.enable_bedrock_fallback = enable_bedrock_fallback
        self.last_model_used = ""

    # ---- Anthropic (primary) ----

    def _call_anthropic(
        self,
        model: str,
        user_prompt: str,
        blocked: list[str],
        max_searches: int,
    ):
        return self.client.messages.create(
            model=model,
            max_tokens=4096,
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

    def _try_anthropic_chain(
        self,
        user_prompt: str,
        blocked: list[str],
        max_searches: int,
    ):
        """Walk model_chain; for each model do up to 2 retries with backoff."""
        last_err: Optional[Exception] = None

        for model in self.model_chain:
            for attempt in range(2):
                try:
                    print(f"[gavel-agent] anthropic attempt: model={model} attempt={attempt + 1}")
                    resp = self._call_anthropic(model, user_prompt, blocked, max_searches)
                    self.last_model_used = model
                    return resp, None
                except Exception as e:
                    last_err = e
                    if not _is_overloaded(e):
                        # Hard error (auth, bad request, etc.) - don't retry
                        return None, e
                    if attempt == 0:
                        time.sleep(1.5)
                        continue
                    # Move on to next model
                    print(f"[gavel-agent] {model} overloaded after retry, trying next...")
                    break

        return None, last_err

    # ---- Bedrock (final fallback) ----

    def _call_bedrock(self, user_prompt: str) -> Optional[Verdict]:
        """
        Last-resort fallback to AWS Bedrock when all Anthropic models are 529'd.
        Bedrock has separate quota pools so it usually works when api.anthropic.com doesn't.

        Note: Bedrock doesn't currently support Anthropic's native web_search tool, so
        the verdict here is based on training-data knowledge only - lower quality but
        keeps the demo alive when Anthropic API is in a major outage.
        """
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
                "system": SYSTEM_PROMPT + "\n\nNOTE: You do NOT have web search in this fallback path. Answer based only on widely-known facts. If you can't be confident, return UNRESOLVED.",
                "messages": [{"role": "user", "content": user_prompt}],
            })

            print("[gavel-agent] falling back to Bedrock (anthropic.claude-sonnet-4-5)")
            resp = client.invoke_model(
                modelId="anthropic.claude-sonnet-4-5-v1:0",
                body=body,
                contentType="application/json",
            )
            payload = json.loads(resp["body"].read())
            text = "".join(
                blk.get("text", "") for blk in payload.get("content", []) if blk.get("type") == "text"
            )
            self.last_model_used = "bedrock:anthropic.claude-sonnet-4-5"
            return self._parse_verdict(text)
        except Exception as e:
            print(f"[gavel-agent] bedrock fallback failed: {e}")
            return None

    # ---- Public API ----

    def resolve(
        self,
        question: str,
        blocked_domains: Optional[list[str]] = None,
        cutoff_time: Optional[str] = None,
        max_searches: int = 5,
    ) -> Verdict:
        blocked = blocked_domains or DEFAULT_BLOCKED_DOMAINS

        user_prompt = f"Question: {question}\n"
        if cutoff_time:
            user_prompt += f"Resolve as of: {cutoff_time}\n"
        user_prompt += "\nSearch reputable news sources and return your verdict as JSON."

        # 1. Try Anthropic chain
        response, err = self._try_anthropic_chain(user_prompt, blocked, max_searches)

        if response is not None:
            final_text = "".join(b.text for b in response.content if b.type == "text")
            verdict = self._parse_verdict(final_text)
            verdict.model = self.last_model_used
            verdict.raw_response = final_text
            return verdict

        # 2. If Anthropic is fully down, try Bedrock
        if err is not None and _is_overloaded(err) and self.enable_bedrock_fallback:
            print(f"[gavel-agent] all Anthropic models overloaded, falling back to Bedrock")
            verdict = self._call_bedrock(user_prompt)
            if verdict is not None:
                verdict.model = self.last_model_used
                return verdict

        # 3. Out of options
        if err is not None:
            raise err
        raise RuntimeError("agent exhausted all model fallbacks")

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