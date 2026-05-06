## Live on Base Sepolia

- **GavelOracle contract:** [`0x781fF2E176196F2a3fDedA1a892d86FE0Bf42320`](https://sepolia.basescan.org/address/0x781fF2E176196F2a3fDedA1a892d86FE0Bf42320)
- **Deployment tx:** [`0xd7116c7a...`](https://sepolia.basescan.org/tx/0xd7116c7ad010c9e6f4d81b9f65f7285250c9c4df5c9b6cb174542721ae481a52)
- **Network:** Base Sepolia (chain ID 84532)
- **Oracle signer:** [`0x1FBC...D1a3`](https://sepolia.basescan.org/address/0x1FBC0968103F9865eDab69E9F7140B509Cf5D1a3)

## Live API on AWS

- **Endpoint:** https://twm1ztoxud.execute-api.us-east-1.amazonaws.com
- **Health:** `curl https://twm1ztoxud.execute-api.us-east-1.amazonaws.com/healthz`
- **Try a verdict:**
```bash
  curl -X POST https://twm1ztoxud.execute-api.us-east-1.amazonaws.com/resolve \
    -H "Content-Type: application/json" \
    -d '{"question":"Did Argentina win the FIFA World Cup in Qatar 2022?"}'
```
- **Stack:** AWS Lambda (Python 3.11, ARM64) + API Gateway, deployed via SAM
- **Region:** us-east-1
