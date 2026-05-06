"""
Given a question and an optional cutoff time, returns:
  - verdict: YES | NO | UNRESOLVED
  - confidence: 0.0 to 1.0
  - reasoning: short prose explanation
  - sources: list of {url, title, snippet}
"""

from __future__ import annotations

import json
import os
import re
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
    verdict: str               # "YES" | "NO" | "UNRESOLVED"
    confidence: float          # 0.0 - 1.0
    reasoning: str
    sources: list[Source] = field(default_factory=list)
    model: str = ""
    raw_response: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


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

Output format — your FINAL message must be ONLY a JSON object, no prose around it:

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


# ---------- Agent ----------

class GavelAgent:
    def __init__(self, api_key: Optional[str] = None, model: str = "claude-sonnet-4-5"):
        self.client = Anthropic(api_key=api_key or os.environ["ANTHROPIC_API_KEY"])
        self.model = model

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
        user_prompt += "\nSearch the allowed sources and return your verdict as JSON."

        response = self.client.messages.create(
            model=self.model,
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

        # The agent may use the web_search tool multiple times; the final
        # text block contains the JSON verdict.
        final_text = ""
        for block in response.content:
            if block.type == "text":
                final_text += block.text

        verdict = self._parse_verdict(final_text)
        verdict.model = self.model
        verdict.raw_response = final_text
        return verdict

    @staticmethod
    def _parse_verdict(text: str) -> Verdict:
        # Strip markdown fences if Claude added them
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)

        # Find the JSON object — Claude sometimes adds reasoning above it
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