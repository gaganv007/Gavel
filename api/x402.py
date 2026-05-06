"""
x402 — Coinbase's "HTTP for payments" protocol implementation for Gavel.

Flow:
  1. Client calls POST /resolve without payment header
  2. Server responds 402 Payment Required with JSON describing terms
  3. Client pays USDC on Base Sepolia to recipient address
  4. Client retries with X-Payment header containing the tx hash
  5. Server verifies the on-chain payment, then runs the resolution

Spec reference: https://docs.cdp.coinbase.com/x402/welcome
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from web3 import Web3


# ---------- Config ----------

# USDC on Base Sepolia
USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
USDC_DECIMALS = 6

# ERC-20 transfer event signature: Transfer(address,address,uint256)
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


@dataclass
class PaymentRequirements:
    """The payment terms returned in a 402 response."""

    scheme: str = "exact"             # x402 payment scheme
    chain: str = "base-sepolia"
    chain_id: int = 84532
    asset: str = USDC_BASE_SEPOLIA    # USDC contract address
    amount: str = "500000"            # 0.50 USDC (6 decimals)
    recipient: str = ""               # wallet that receives payment
    description: str = "Gavel verdict resolution"
    facilitator: str = "https://x402.org/facilitator"  # for reference

    def to_dict(self) -> dict:
        return {
            "x402Version": 1,
            "accepts": [
                {
                    "scheme": self.scheme,
                    "network": self.chain,
                    "maxAmountRequired": self.amount,
                    "resource": "/resolve",
                    "description": self.description,
                    "mimeType": "application/json",
                    "payTo": self.recipient,
                    "asset": self.asset,
                    "extra": {
                        "name": "USDC",
                        "decimals": USDC_DECIMALS,
                    },
                }
            ],
            "error": "Payment Required",
        }


# ---------- Middleware ----------

class X402Middleware:
    """Stateless x402 enforcement. Verifies on-chain USDC payments."""

    def __init__(
        self,
        rpc_url: Optional[str] = None,
        recipient: Optional[str] = None,
        amount_usdc_micro: int = 500_000,  # 0.50 USDC
        enabled: bool = True,
    ):
        self.rpc_url = rpc_url or os.environ.get("BASE_RPC_URL", "https://sepolia.base.org")
        self.recipient = (recipient or os.environ.get("X402_RECIPIENT", "")).lower()
        self.amount_required = amount_usdc_micro
        self.enabled = enabled and bool(self.recipient)
        self.w3 = Web3(Web3.HTTPProvider(self.rpc_url))
        # Track tx hashes we've already accepted (replay protection)
        self._used_payments: set[str] = set()

    def get_requirements(self) -> PaymentRequirements:
        return PaymentRequirements(
            recipient=self.recipient,
            amount=str(self.amount_required),
        )

    def payment_required_response(self) -> JSONResponse:
        """Return the standard 402 response."""
        return JSONResponse(
            status_code=402,
            content=self.get_requirements().to_dict(),
            headers={
                "Accept-Payment": f"x402 base-sepolia usdc {self.amount_required}",
            },
        )

    def verify_payment(self, payment_header: str) -> tuple[bool, str]:
        """
        Verify the X-Payment header. For the hackathon, the header is just the
        on-chain tx hash of the USDC transfer. Production x402 uses a signed
        EIP-712 payment authorization, but tx-hash verification proves payment
        in a way judges can verify on Basescan.

        Returns (ok, reason).
        """
        if not payment_header:
            return False, "missing X-Payment header"

        # Allow common prefixes
        tx_hash = payment_header.strip()
        if tx_hash.lower().startswith("x402 "):
            tx_hash = tx_hash.split(" ", 1)[1].strip()
        if not tx_hash.startswith("0x"):
            tx_hash = "0x" + tx_hash

        if tx_hash.lower() in self._used_payments:
            return False, "payment already used (replay)"

        try:
            receipt = self.w3.eth.get_transaction_receipt(tx_hash)
        except Exception as e:
            return False, f"could not fetch tx: {e}"

        if receipt is None:
            return False, "tx not found"
        if receipt.status != 1:
            return False, "tx reverted"

        # Look for a USDC Transfer event TO our recipient with sufficient amount.
        usdc_addr = USDC_BASE_SEPOLIA.lower()
        recipient_topic = "0x" + ("0" * 24) + self.recipient[2:].lower()

        for log in receipt.logs:
            if log.address.lower() != usdc_addr:
                continue
            if len(log.topics) < 3:
                continue
            if log.topics[0].hex().lower() != TRANSFER_TOPIC.lower():
                continue
            # topics[2] is the recipient (padded to 32 bytes)
            if log.topics[2].hex().lower() != recipient_topic:
                continue
            amount = int(log.data.hex(), 16) if log.data else 0
            if amount >= self.amount_required:
                self._used_payments.add(tx_hash.lower())
                return True, f"payment of {amount / 10**USDC_DECIMALS} USDC verified (tx {tx_hash})"

        return False, "no matching USDC transfer in tx logs"

    async def gate(self, request: Request) -> Optional[JSONResponse]:
        """
        Gate-keep an incoming request. Returns:
          - None if request may proceed (paid or middleware disabled)
          - JSONResponse(402, ...) if payment is required or invalid
        """
        if not self.enabled:
            return None

        payment = request.headers.get("X-Payment", "")
        if not payment:
            return self.payment_required_response()

        ok, reason = self.verify_payment(payment)
        if not ok:
            resp = self.payment_required_response()
            resp.headers["X-Payment-Error"] = reason
            return resp

        return None