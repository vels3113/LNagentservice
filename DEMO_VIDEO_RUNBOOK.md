# SatsForTokens Demo Video Runbook (<= 2 minutes)

This runbook is optimized for hackathon recording: minimal typing, deterministic flow, and clear proof beats.

## 1) Demo Storyboard (time-boxed)

- `0:00-0:12` Hook: "Pay sats, unlock tokens instantly with L402."
- `0:12-0:35` Connect: show client+agent+wallet binding (`/api/connect`).
- `0:35-1:00` Challenge: request inference and show `402` + invoice payload.
- `1:00-1:25` Proof + unlock: submit payment proof and stream response.
- `1:25-1:45` Verification beat: show verification token pass/fail signal.
- `1:45-2:00` Latency beat + close: highlight payment-vs-LLM timing and final pitch.

## 2) Recording Prep (before capture)

1. Open one terminal for server logs.
2. Open one terminal for API commands.
3. Open browser on app home (`/`) and transactions page (`/transactions`).
4. Resize terminal font so JSON and headers are readable on screen.

## 3) Golden Path Commands

### 3.1 Start local server (Terminal A)

```bash
DEMO_MODE=true npm run dev
```

Expected on screen:
- Next.js dev server ready.
- Later logs show payment and timing events.

### 3.2 Register client/agent/wallet (Terminal B)

```bash
CONNECTION_ID=$(curl -s -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"clientId":"demo-client","agentId":"demo-agent","walletType":"demo","walletRef":"local-wallet"}' \
  | jq -r '.connectionId')

echo "connectionId=$CONNECTION_ID"
```

Expected on screen:
- Printed `connectionId=...`.

### 3.3 Trigger L402 challenge (402 + invoice)

```bash
RESP=$(curl -s -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Explain L402 in one sentence\",\"clientId\":\"demo-client\",\"agentId\":\"demo-agent\",\"connectionId\":\"$CONNECTION_ID\"}")

echo "$RESP" | jq '{error, invoice, paymentHash, preimage, amountSats, model}'
```

Expected on screen:
- `error: "Payment required"`
- invoice string (`ln...`)
- `paymentHash`
- `preimage` (demo mode only)
- `amountSats`

### 3.4 Submit payment proof and stream response

```bash
PREIMAGE=$(echo "$RESP" | jq -r '.preimage')
curl -N -s -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -H "Authorization: L402 $PREIMAGE" \
  -d "{\"prompt\":\"Explain L402 in one sentence\",\"clientId\":\"demo-client\",\"agentId\":\"demo-agent\",\"connectionId\":\"$CONNECTION_ID\"}"
```

Expected on screen:
- Streamed model output text.
- In browser, "Payment Required" -> "Streaming" -> "Complete".

### 3.5 Show latency evidence

```bash
bash scripts/benchmark-test.sh http://localhost:3000 5
```

Expected on screen:
- Rows with `payment_ms` and `llm_ms`.
- Majority/total pass with `payment <= llm`.

## 4) Verification Beat (Token Check)

If token verification is enabled in your current build, include one pass and one fail shot:

1. Pass: send prompt with verification token and show `X-Verification: passed`.
2. Fail: intentionally omit/mismatch token and show `X-Verification: failed`.

If token verification is not enabled in this branch, call this out once on camera and skip this beat.

## 5) UI Recording Checklist

- [ ] Home screen visible with "Connect Client + Agent + Wallet".
- [ ] 402 state visible with invoice and sats amount.
- [ ] Payment proof input visible (demo prefilled or manual paste).
- [ ] Streaming response state visible.
- [ ] Complete state with timing metrics visible.
- [ ] Transactions page visible with lifecycle statuses.

## 6) Fallback Branch (if live flow fails)

Use this deterministic fallback immediately to avoid a broken recording:

```bash
BASE_URL=http://localhost:3000 bash scripts/closed-loop-demo.sh "Summarize L402 in one sentence"
```

Expected on screen:
- Connect response
- 402 challenge payload
- Extracted proof
- Authorized response

If browser UI fails, keep the full terminal-only demo and narrate:
"Same flow powers the UI: connect, challenge, payment proof, unlock."

## 7) Close Script (final 10 seconds)

"SatsForTokens proves L402-gated inference with client-owned identity, Lightning proof, and fast unlock latency. Bring your own agent and wallet, pay only when you infer."
