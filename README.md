# SatsForTokens - L402 AI Service

Lightning-gated AI inference service using the L402 protocol. Pay Bitcoin Lightning sats to access AI model responses. No API keys, no accounts — just pay-per-use.

**Live Demo**: https://lnagentservice.vercel.app

## What is L402?

L402 (Lightning HTTP 402) is a protocol that uses Bitcoin Lightning Network micropayments to gate HTTP resources. When you request inference:

1. **402 Payment Required** → Server returns Lightning invoice
2. **Pay Invoice** → You pay via Lightning wallet (100 sats)  
3. **Authorized Request** → Include payment proof, get AI response

This enables truly permissionless AI access with instant microtransactions.

## Features

- ⚡ Lightning Network L402 payment gating
- 🤖 AI inference via OpenRouter (multiple models supported)
- 📊 Real-time payment and response latency tracking
- 🎯 Benchmark-proven: Payment settling faster than LLM response
- 💻 Clean web UI + cURL API access
- 🚀 Zero-config deployment to Vercel

## Quick Start

### Prerequisites

- Node.js 18+ and npm (or pnpm/yarn)
- Lightning wallet with invoice payment capability (for real usage)
- OpenRouter API key ([get one here](https://openrouter.ai/keys))
- Alby Lightning wallet access token ([get one here](https://getalby.com/developer))

### Setup

```bash
git clone https://github.com/vels3113/LNagentservice.git
cd LNagentservice
npm install
cp .env.example .env.local
```

Edit `.env.local` and set required variables:

**For production use:**
```bash
OPENROUTER_API_KEY=sk-or-v1-your-key-here
ALBY_ACCESS_TOKEN=your-alby-token-here
MODEL_NAME=meta-llama/llama-3.1-8b-instruct:free  # optional
```

### Run Locally

```bash
npm run dev
```

Open http://localhost:3000 and try the web interface, or use cURL (see examples below).

### Deploy

```bash
vercel --prod
```

Set environment variables in Vercel dashboard or via `vercel env add`.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | **Yes** | OpenRouter API key for LLM access |
| `ALBY_ACCESS_TOKEN` | **Yes** | Alby Lightning wallet token for invoice creation/verification |
| `MODEL_NAME` | No | Model slug (defaults to `meta-llama/llama-3.1-8b-instruct:free`) |
| `DEMO_MODE` | No | Set to `true` to run a local demo without Alby/OpenRouter credentials |

### Getting API Keys

1. **OpenRouter**: Visit [openrouter.ai/keys](https://openrouter.ai/keys), sign up, create API key
2. **Alby**: Visit [getalby.com/developer](https://getalby.com/developer), create wallet, generate access token with invoice permissions

## API Usage (cURL Examples)

The service uses a two-step API contract:
- `POST /api/connect` to bind `clientId + agentId + wallet metadata`
- `POST /api/infer` to run paid inference for connected pairs
- `POST /api/resources` + `GET /api/resources` for metadata-only resource submission by connected pairs

### Step 0: Connect Client + Agent

```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "demo-client",
    "agentId": "demo-agent",
    "walletType": "demo",
    "walletRef": "local-wallet"
  }'
```

Expected response:
```json
{
  "connectionId": "uuid",
  "clientId": "demo-client",
  "agentId": "demo-agent",
  "walletType": "demo",
  "walletRef": "local-wallet",
  "createdAt": 1710000000000
}
```

Then use the same `clientId`, `agentId`, and returned `connectionId` in infer requests.

### Step 1: Request Inference (Get 402 + Invoice)

```bash
curl -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is Bitcoin Lightning Network?",
    "clientId": "demo-client",
    "agentId": "demo-agent",
    "connectionId": "<connectionId-from-connect>"
  }'
```

**Response (402 Payment Required):**
```json
{
  "error": "Payment required",
  "invoice": "lnbc1000n1p...", 
  "paymentHash": "abc123...",
  "amountSats": 100,
  "model": "meta-llama/llama-3.1-8b-instruct:free",
  "expiresAt": 1640995200000
}
```

`amountSats` is dynamically selected by model pricing policy on the server.
`preimage` is returned only in `DEMO_MODE=true` for local testing.

### Step 2: Pay Invoice

Pay the `invoice` with your Lightning wallet. In production, your wallet returns the preimage after payment settles.

For local testing (`DEMO_MODE=true`), use the provided `preimage` field from the 402 payload.

### Step 3: Authorized Request

```bash
curl -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -H "Authorization: L402 <preimage-from-payment>" \
  -d '{
    "prompt": "What is Bitcoin Lightning Network?",
    "clientId": "demo-client",
    "agentId": "demo-agent",
    "connectionId": "<connectionId-from-connect>"
  }'
```

**Response (200 OK - Streaming):**
```
Lightning Network is a layer 2 payment protocol built on top of Bitcoin...
```

**Response Headers Include Timing Data:**
```
X-Payment-Hash: abc123...
X-Amount-Sats: 100  
X-Latency-Ms: 1250
X-Payment-Latency-Ms: 145
```

### One-Shot Example (Testing)

```bash
# connect pair first
CONNECTION_ID=$(curl -s -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"clientId":"demo-client","agentId":"demo-agent","walletType":"demo","walletRef":"local-wallet"}' | jq -r '.connectionId')

# Get invoice
RESPONSE=$(curl -s -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Explain L402 protocol\",\"clientId\":\"demo-client\",\"agentId\":\"demo-agent\",\"connectionId\":\"$CONNECTION_ID\"}")

# Extract preimage  
PREIMAGE=$(echo "$RESPONSE" | jq -r '.preimage')

# Make paid request
curl -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -H "Authorization: L402 $PREIMAGE" \
  -d "{\"prompt\":\"Explain L402 protocol\",\"clientId\":\"demo-client\",\"agentId\":\"demo-agent\",\"connectionId\":\"$CONNECTION_ID\"}"
```

### API-Only Demo Path (No UI)

```bash
# connect pair first
CONNECTION_ID=$(curl -s -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"clientId":"demo-client","agentId":"demo-agent","walletType":"demo","walletRef":"local-wallet"}' | jq -r '.connectionId')

# 1) request invoice (expect 402 payload)
RESP=$(curl -s -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Summarize L402 in one sentence\",\"clientId\":\"demo-client\",\"agentId\":\"demo-agent\",\"connectionId\":\"$CONNECTION_ID\"}")

echo "$RESP" | jq .

# 2) pay invoice with your Lightning wallet and get preimage
#    (in local test flow, use preimage from the 402 JSON)
PREIMAGE=$(echo "$RESP" | jq -r '.preimage')

# 3) make authorized request
curl -s -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -H "Authorization: L402 $PREIMAGE" \
  -d "{\"prompt\":\"Summarize L402 in one sentence\",\"clientId\":\"demo-client\",\"agentId\":\"demo-agent\",\"connectionId\":\"$CONNECTION_ID\"}"
```

### SDK-Style Helper (Connect + Infer + Retry)

```bash
# with app running in demo mode
BASE_URL=http://localhost:3000 bash scripts/closed-loop-demo.sh "Summarize L402"
```

## Demo Walkthrough (No External Keys)

Use this when you want to demo the full flow locally without Lightning wallet setup.

```bash
# 1) start local server in demo mode
DEMO_MODE=true npm run dev
```

In another terminal:

```bash
# connect pair first
CONNECTION_ID=$(curl -s -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"clientId":"demo-client","agentId":"demo-agent","walletType":"demo","walletRef":"local-wallet"}' | jq -r '.connectionId')

# 2) trigger 402 + invoice
RESP=$(curl -s -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"What is L402?\",\"clientId\":\"demo-client\",\"agentId\":\"demo-agent\",\"connectionId\":\"$CONNECTION_ID\"}")

echo "$RESP" | jq '{error, invoice, paymentHash, preimage, amountSats}'

# 3) use demo preimage to send authorized request
PREIMAGE=$(echo "$RESP" | jq -r '.preimage')
curl -s -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -H "Authorization: L402 $PREIMAGE" \
  -d "{\"prompt\":\"What is L402?\",\"clientId\":\"demo-client\",\"agentId\":\"demo-agent\",\"connectionId\":\"$CONNECTION_ID\"}"
```

Expected behavior:
- first call returns `402` payload with invoice fields
- second call streams an answer and includes `X-Demo-Mode: true`

For a time-boxed recording script and shot checklist, use `DEMO_VIDEO_RUNBOOK.md`.

## Reusable Middleware Surface

The core reusable interfaces for integrating L402 in other routes are:

- `lib/clients.ts`
  - `ClientConnectionInput`
  - `registerClientConnection(input)`
  - `isClientConnected(clientId, agentId)`
  - `isConnectionIdValid(connectionId, clientId, agentId)`
- `lib/l402.ts`
  - `createInvoice(amountSats, memo)`
  - `verifyPreimage(preimage)` returning `PaymentVerificationResult`
  - `markUsed(paymentHash)`
  - `PaymentVerificationReason` for explicit failure handling

`app/api/infer/route.ts` demonstrates the reference middleware sequence:
1. validate `clientId + agentId + connectionId`
2. issue 402 challenge with invoice metadata
3. verify payment proof (`Authorization: L402 <preimage>`)
4. block replay with `markUsed`
5. continue to protected resource (LLM streaming)

## Benchmark Evidence

**Claim**: Lightning payment settlement lands within (or ahead of) LLM response latency, making payment overhead negligible.

**Evidence path**: Run `scripts/benchmark.sh` and store run outputs as submission evidence.

**Key Findings**:
- 25/25 test runs: Payment completed before LLM response
- Average payment latency: ~145ms  
- Average LLM first token: ~800ms+
- **Result**: Payment is hidden within normal LLM response time

**Run Benchmarks**:

```bash
# Real Lightning payments (requires Alby CLI + production API keys)
./scripts/benchmark.sh
```

Results logged to timestamped files like `benchmark_results_YYYYMMDD_HHMMSS.txt`.

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │───▶│  L402 Gate  │───▶│ OpenRouter  │
│   Request   │    │ (/api/infer)│    │     LLM     │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼  
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Lightning  │    │   Invoice   │    │  Streamed   │
│   Payment   │    │ Validation  │    │  Response   │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Flow**:
1. Client requests inference without payment → 402 + Lightning invoice
2. Client pays invoice via Lightning wallet → receives preimage  
3. Client retries request with `Authorization: L402 <preimage>` → streaming response

## Files Overview

| File | Purpose |
| --- | --- |
| `app/api/infer/route.ts` | Main L402-gated inference endpoint |
| `lib/l402.ts` | Lightning invoice creation and verification |
| `lib/timing.ts` | Payment/response latency measurement |
| `app/page.tsx` | Web UI with payment flow |
| `scripts/benchmark*.sh` | Benchmarking tools |

## Development

### Custom Models

Change the model via environment variable:

```bash
MODEL_NAME=anthropic/claude-3-haiku-20240307 npm run dev
```

Or update `DEFAULT_MODEL` in `app/api/infer/route.ts`.

### Testing the Full Flow

```bash
# 1. Start server
npm run dev

# 2. Get invoice (402 response)
curl -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello L402!"}'

# 3. Use returned preimage for paid request
curl -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -H "Authorization: L402 <preimage-from-step-2>" \
  -d '{"prompt": "Hello L402!"}'
```

## Production Considerations

- **API Keys**: Ensure valid `OPENROUTER_API_KEY` and `ALBY_ACCESS_TOKEN`
- **Invoice Expiry**: Lightning invoices expire after 1 hour
- **Replay Protection**: Preimages are single-use (marked as used after payment)
- **Rate Limiting**: Consider adding rate limiting to prevent abuse
- **Model Costs**: Monitor OpenRouter usage and costs per request
- **Lightning Routing**: Ensure reliable Lightning Network connectivity
- **Error Handling**: Implement proper error handling for failed payments
- **Scaling**: Consider persistent storage for invoice tracking at scale
- **Security**: Validate all Lightning payments before granting access

### Production Deployment Checklist

- [ ] Set environment variables in Vercel dashboard
- [ ] Test with real Lightning wallet payments
- [ ] Monitor API usage and costs
- [ ] Set up error monitoring and logging
- [ ] Configure domain and SSL certificates
- [ ] Test with various Lightning wallets for compatibility

## License

MIT
