"""
Gavel — pay-per-query AI oracle for prediction markets.

Endpoints:
  GET  /healthz          — liveness check
  POST /resolve          — get a verdict; optionally post on-chain
"""

from __future__ import annotations

import os
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent import GavelAgent
from onchain import OnchainSettler

load_dotenv()

app = FastAPI(
    title="Gavel",
    description="The AI oracle that calls it.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = GavelAgent()

# Settler is optional — only initialized if the env vars are set.
_settler: Optional[OnchainSettler] = None
def get_settler() -> OnchainSettler:
    global _settler
    if _settler is None:
        _settler = OnchainSettler()
    return _settler


# ---------- Schemas ----------

class ResolveRequest(BaseModel):
    question: str = Field(..., min_length=10, max_length=500)
    blocked_domains: list[str] | None = None
    cutoff_time: str | None = None
    settle_onchain: bool = True


class SourceOut(BaseModel):
    url: str
    title: str
    snippet: str


class OnchainReceiptOut(BaseModel):
    tx_hash: str
    block_number: int
    explorer_url: str
    question_hash: str
    evidence_hash: str
    chain_id: int


class ResolveResponse(BaseModel):
    verdict: str
    confidence: float
    reasoning: str
    sources: list[SourceOut]
    model: str
    elapsed_ms: int
    onchain: OnchainReceiptOut | None = None


# ---------- Routes ----------

@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "gavel"}


@app.post("/resolve", response_model=ResolveResponse)
def resolve(req: ResolveRequest):
    start = time.time()

    # 1. Get verdict from the agent.
    try:
        v = agent.resolve(
            question=req.question,
            blocked_domains=req.blocked_domains,
            cutoff_time=req.cutoff_time,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"agent error: {e}")

    # 2. Optionally post it on-chain.
    onchain_receipt = None
    if req.settle_onchain:
        try:
            settler = get_settler()
            sources_dicts = [s.__dict__ for s in v.sources]
            receipt = settler.post_verdict(
                question=req.question,
                verdict=v.verdict,
                confidence=v.confidence,
                reasoning=v.reasoning,
                sources=sources_dicts,
            )
            onchain_receipt = OnchainReceiptOut(
                tx_hash=receipt.tx_hash,
                block_number=receipt.block_number,
                explorer_url=receipt.explorer_url,
                question_hash=receipt.question_hash,
                evidence_hash=receipt.evidence_hash,
                chain_id=receipt.chain_id,
            )
        except Exception as e:
            # Don't fail the whole request if on-chain fails — just log it.
            # The verdict itself is still useful.
            print(f"⚠️  on-chain settlement failed: {e}")

    elapsed_ms = int((time.time() - start) * 1000)
    return ResolveResponse(
        verdict=v.verdict,
        confidence=v.confidence,
        reasoning=v.reasoning,
        sources=[SourceOut(**s.__dict__) for s in v.sources],
        model=v.model,
        elapsed_ms=elapsed_ms,
        onchain=onchain_receipt,
    )