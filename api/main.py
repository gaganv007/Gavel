"""
Gavel — pay-per-query AI oracle for prediction markets.

Endpoints:
  GET  /healthz          — liveness check
  POST /resolve          — get a verdict for a question
"""

from __future__ import annotations

import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent import GavelAgent

load_dotenv()

app = FastAPI(
    title="Gavel",
    description="The AI oracle that calls it.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten for production
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = GavelAgent()


# ---------- Schemas ----------

class ResolveRequest(BaseModel):
    question: str = Field(..., min_length=10, max_length=500)
    blocked_domains: list[str] | None = None
    cutoff_time: str | None = None


class SourceOut(BaseModel):
    url: str
    title: str
    snippet: str


class ResolveResponse(BaseModel):
    verdict: str
    confidence: float
    reasoning: str
    sources: list[SourceOut]
    model: str
    elapsed_ms: int


# ---------- Routes ----------

@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "gavel"}


@app.post("/resolve", response_model=ResolveResponse)
def resolve(req: ResolveRequest):
    start = time.time()
    try:
        v = agent.resolve(
            question=req.question,
            blocked_domains=req.blocked_domains,
            cutoff_time=req.cutoff_time,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"agent error: {e}")

    elapsed_ms = int((time.time() - start) * 1000)
    return ResolveResponse(
        verdict=v.verdict,
        confidence=v.confidence,
        reasoning=v.reasoning,
        sources=[SourceOut(**s.__dict__) for s in v.sources],
        model=v.model,
        elapsed_ms=elapsed_ms,
    )