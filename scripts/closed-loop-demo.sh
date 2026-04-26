#!/usr/bin/env bash
set -euo pipefail

# SDK-style helper for local closed-loop flow:
# connect -> infer (402) -> pay (demo preimage) -> paid infer
#
# Usage:
#   BASE_URL=http://localhost:3000 bash scripts/closed-loop-demo.sh "Explain L402"

BASE_URL="${BASE_URL:-http://localhost:3000}"
PROMPT="${1:-Explain L402 in one sentence}"
CLIENT_ID="${CLIENT_ID:-demo-client}"
AGENT_ID="${AGENT_ID:-demo-agent}"
WALLET_TYPE="${WALLET_TYPE:-demo}"
WALLET_REF="${WALLET_REF:-local-wallet}"
MODEL="${MODEL:-meta-llama/llama-3.1-8b-instruct:free}"

echo "[1/4] Connect client+agent..."
CONNECT_RESP="$(curl -sS -X POST "$BASE_URL/api/connect" \
  -H "Content-Type: application/json" \
  -d "{
    \"clientId\":\"$CLIENT_ID\",
    \"agentId\":\"$AGENT_ID\",
    \"walletType\":\"$WALLET_TYPE\",
    \"walletRef\":\"$WALLET_REF\"
  }")"

CONNECTION_ID="$(echo "$CONNECT_RESP" | jq -r '.connectionId // empty')"
if [[ -z "$CONNECTION_ID" ]]; then
  echo "Connect failed:"
  echo "$CONNECT_RESP"
  exit 1
fi
echo "Connected: $CONNECTION_ID"

echo "[2/4] Request unpaid inference (expect 402)..."
UNPAID_RESP="$(curl -sS -X POST "$BASE_URL/api/infer" \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\":\"$PROMPT\",
    \"clientId\":\"$CLIENT_ID\",
    \"agentId\":\"$AGENT_ID\",
    \"connectionId\":\"$CONNECTION_ID\",
    \"model\":\"$MODEL\"
  }")"

PAYMENT_HASH="$(echo "$UNPAID_RESP" | jq -r '.paymentHash // empty')"
PREIMAGE="$(echo "$UNPAID_RESP" | jq -r '.preimage // empty')"
AMOUNT_SATS="$(echo "$UNPAID_RESP" | jq -r '.amountSats // empty')"

if [[ -z "$PREIMAGE" || -z "$PAYMENT_HASH" ]]; then
  echo "Unpaid infer did not return expected 402 payload:"
  echo "$UNPAID_RESP"
  exit 1
fi
echo "Challenge received: paymentHash=$PAYMENT_HASH amountSats=$AMOUNT_SATS"

echo "[3/4] Simulate pay step (demo mode preimage)..."
echo "Using preimage from challenge payload."

echo "[4/4] Retry with L402 proof..."
curl -sS -X POST "$BASE_URL/api/infer" \
  -H "Content-Type: application/json" \
  -H "Authorization: L402 $PREIMAGE" \
  -d "{
    \"prompt\":\"$PROMPT\",
    \"clientId\":\"$CLIENT_ID\",
    \"agentId\":\"$AGENT_ID\",
    \"connectionId\":\"$CONNECTION_ID\",
    \"model\":\"$MODEL\"
  }"
echo
