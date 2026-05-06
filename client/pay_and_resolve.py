"""
Gavel x402 paying client.

Demonstrates the full Coinbase x402 flow end-to-end:

  1. POST /resolve without payment  ->  HTTP 402 + payment requirements
  2. Send 0.50 USDC on Base Sepolia to the payTo address
  3. POST /resolve again with X-Payment: <tx_hash>
  4. Server verifies the on-chain transfer  ->  returns verdict + settlement tx

Usage:
    export GAVEL_API=http://localhost:8000           # or AWS URL
    export CLIENT_PRIVATE_KEY=0x...                  # any funded Base Sepolia wallet
    python client/pay_and_resolve.py "Did the Boston Celtics win the 2024 NBA Finals?"

Prereqs:
    pip install web3 eth-account requests
    Wallet must have >= 0.50 USDC + a tiny bit of ETH (for gas) on Base Sepolia.
    Faucet USDC: https://faucet.circle.com (Base Sepolia)
    Faucet ETH:  https://www.alchemy.com/faucets/base-sepolia
"""

from __future__ import annotations

import json
import os
import sys
import time

import requests
from eth_account import Account
from web3 import Web3


USDC_BASE_SEPOLIA = Web3.to_checksum_address("0x036CbD53842c5426634e7929541eC2318f3dCF7e")
USDC_DECIMALS = 6

# Minimal ERC-20 ABI - just `transfer`
USDC_ABI = [
    {
        "type": "function",
        "name": "transfer",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "to", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "type": "function",
        "name": "balanceOf",
        "stateMutability": "view",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]


def main():
    api_url = os.environ.get("GAVEL_API", "http://localhost:8000")
    rpc_url = os.environ.get("BASE_RPC_URL", "https://sepolia.base.org")
    private_key = os.environ.get("CLIENT_PRIVATE_KEY", "")

    if len(sys.argv) < 2:
        print("usage: pay_and_resolve.py <question>")
        sys.exit(1)
    if not private_key:
        print("error: set CLIENT_PRIVATE_KEY env var (your Base Sepolia wallet's key)")
        sys.exit(1)

    question = sys.argv[1]
    account = Account.from_key(private_key)
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    usdc = w3.eth.contract(address=USDC_BASE_SEPOLIA, abi=USDC_ABI)

    # Show client wallet balance up front
    bal_micro = usdc.functions.balanceOf(account.address).call()
    print(f"\n--- Gavel x402 paying client ---")
    print(f"client wallet : {account.address}")
    print(f"USDC balance  : {bal_micro / 10**USDC_DECIMALS:.4f} USDC")
    print(f"target API    : {api_url}")
    print(f"question      : {question}")

    # Step 1: unauthenticated call -> expect 402
    print(f"\n[1/4] POST /resolve (no payment)")
    r = requests.post(
        f"{api_url}/resolve",
        json={"question": question},
        timeout=15,
    )
    if r.status_code != 402:
        print(f"  unexpected status {r.status_code}: {r.text[:200]}")
        sys.exit(2)

    terms = r.json()
    accept = terms["accepts"][0]
    pay_to = Web3.to_checksum_address(accept["payTo"])
    amount_required = int(accept["maxAmountRequired"])
    print(f"  -> 402 Payment Required")
    print(f"     payTo     : {pay_to}")
    print(f"     amount    : {amount_required / 10**USDC_DECIMALS:.4f} USDC")
    print(f"     network   : {accept['network']}")
    print(f"     asset     : {accept['asset']}")

    if bal_micro < amount_required:
        print(f"\nerror: insufficient USDC. need {amount_required}, have {bal_micro}")
        print("get testnet USDC from https://faucet.circle.com (Base Sepolia)")
        sys.exit(3)

    # Step 2: pay USDC on Base Sepolia
    print(f"\n[2/4] sending {amount_required / 10**USDC_DECIMALS:.4f} USDC -> {pay_to}")
    nonce = w3.eth.get_transaction_count(account.address)
    chain_id = w3.eth.chain_id
    tx = usdc.functions.transfer(pay_to, amount_required).build_transaction(
        {
            "chainId": chain_id,
            "from": account.address,
            "nonce": nonce,
            "gas": 100_000,
            "maxFeePerGas": w3.to_wei(1, "gwei"),
            "maxPriorityFeePerGas": w3.to_wei(0.5, "gwei"),
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    tx_hex = tx_hash.hex() if tx_hash.hex().startswith("0x") else "0x" + tx_hash.hex()
    print(f"  payment tx   : {tx_hex}")
    print(f"  basescan     : https://sepolia.basescan.org/tx/{tx_hex}")

    print(f"\n[3/4] waiting for confirmation...")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt.status != 1:
        print(f"  payment tx reverted: {tx_hex}")
        sys.exit(4)
    print(f"  confirmed at block {receipt.blockNumber}")

    # Step 4: retry with X-Payment header
    print(f"\n[4/4] POST /resolve  (paid, X-Payment: {tx_hex})")
    r = requests.post(
        f"{api_url}/resolve",
        json={"question": question},
        headers={"X-Payment": tx_hex},
        timeout=120,
    )
    if r.status_code != 200:
        print(f"  unexpected status {r.status_code}: {r.text[:300]}")
        sys.exit(5)

    verdict = r.json()
    print(f"\n--- VERDICT ---")
    print(f"  verdict      : {verdict['verdict']}")
    print(f"  confidence   : {verdict['confidence']:.2%}")
    print(f"  reasoning    : {verdict['reasoning']}")
    print(f"  sources      : {len(verdict['sources'])}")
    for s in verdict["sources"][:3]:
        print(f"    - {s['title'][:80]}")
    if verdict.get("onchain"):
        oc = verdict["onchain"]
        print(f"\n  on-chain settlement:")
        print(f"    tx_hash    : 0x{oc['tx_hash'].lstrip('0x')}")
        print(f"    block      : {oc['block_number']}")
        print(f"    basescan   : {oc['explorer_url']}")
    print(f"\n--- Gavel x402 flow complete in {verdict['elapsed_ms']/1000:.1f}s ---\n")


if __name__ == "__main__":
    main()