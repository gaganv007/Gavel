"""
Gavel on-chain settlement layer.

Takes a Verdict from the agent and posts it to the GavelOracle contract on Base.
Returns the transaction hash + Basescan URL.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from typing import Optional

from eth_account import Account
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware


# Map agent verdict strings to contract enum values.
#   0 = UNRESOLVED
#   1 = YES
#   2 = NO
VERDICT_KIND = {
    "UNRESOLVED": 0,
    "YES": 1,
    "NO": 2,
}

# Minimal ABI — just the functions onchain.py touches.
GAVEL_ORACLE_ABI = [
    {
        "type": "function",
        "name": "postVerdict",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "questionHash", "type": "bytes32"},
            {"name": "kind", "type": "uint8"},
            {"name": "confidenceBps", "type": "uint16"},
            {"name": "evidenceHash", "type": "bytes32"},
        ],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "isResolved",
        "stateMutability": "view",
        "inputs": [{"name": "questionHash", "type": "bytes32"}],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "type": "function",
        "name": "oracleSigner",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
    },
]


@dataclass
class OnchainReceipt:
    tx_hash: str
    block_number: int
    explorer_url: str
    question_hash: str
    evidence_hash: str
    chain_id: int


class OnchainSettler:
    def __init__(
        self,
        rpc_url: Optional[str] = None,
        private_key: Optional[str] = None,
        contract_address: Optional[str] = None,
        explorer_base: str = "https://sepolia.basescan.org",
    ):
        self.rpc_url = rpc_url or os.environ["BASE_RPC_URL"]
        self.private_key = private_key or os.environ["ORACLE_PRIVATE_KEY"]
        self.contract_address = Web3.to_checksum_address(
            contract_address or os.environ["ORACLE_CONTRACT_ADDRESS"]
        )
        self.explorer_base = explorer_base

        self.w3 = Web3(Web3.HTTPProvider(self.rpc_url))
        # Some L2s use a non-standard extra-data field; this middleware is harmless on Base.
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        self.account = Account.from_key(self.private_key)
        self.contract = self.w3.eth.contract(
            address=self.contract_address, abi=GAVEL_ORACLE_ABI
        )

        if not self.w3.is_connected():
            raise RuntimeError(f"could not connect to RPC: {self.rpc_url}")

    # ---------- Hashing ----------

    @staticmethod
    def hash_question(question: str) -> bytes:
        # Match the Solidity contract's keccak256(abi.encodePacked(string)).
        return Web3.keccak(text=question)

    @staticmethod
    def hash_evidence(reasoning: str, sources: list[dict]) -> bytes:
        # Canonical JSON so the same evidence always hashes the same way.
        blob = json.dumps(
            {"reasoning": reasoning, "sources": sources},
            sort_keys=True,
            separators=(",", ":"),
        )
        return Web3.keccak(text=blob)

    # ---------- Posting ----------

    def post_verdict(
        self,
        question: str,
        verdict: str,
        confidence: float,
        reasoning: str,
        sources: list[dict],
    ) -> OnchainReceipt:
        kind = VERDICT_KIND.get(verdict.upper(), 0)
        confidence_bps = max(0, min(10000, int(round(confidence * 10000))))
        question_hash = self.hash_question(question)
        evidence_hash = self.hash_evidence(reasoning, sources)

        # Skip if already resolved on-chain (contract would revert anyway).
        if self.contract.functions.isResolved(question_hash).call():
            raise RuntimeError("question already resolved on-chain")

        # Build, sign, send.
        nonce = self.w3.eth.get_transaction_count(self.account.address)
        chain_id = self.w3.eth.chain_id

        tx = self.contract.functions.postVerdict(
            question_hash,
            kind,
            confidence_bps,
            evidence_hash,
        ).build_transaction(
            {
                "chainId": chain_id,
                "from": self.account.address,
                "nonce": nonce,
                "gas": 200_000,
                "maxFeePerGas": self.w3.to_wei(1, "gwei"),
                "maxPriorityFeePerGas": self.w3.to_wei(0.5, "gwei"),
            }
        )

        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

        if receipt.status != 1:
            raise RuntimeError(f"on-chain tx reverted: {tx_hash.hex()}")

        return OnchainReceipt(
            tx_hash=tx_hash.hex(),
            block_number=receipt.blockNumber,
            explorer_url=f"{self.explorer_base}/tx/{tx_hash.hex()}",
            question_hash="0x" + question_hash.hex(),
            evidence_hash="0x" + evidence_hash.hex(),
            chain_id=chain_id,
        )