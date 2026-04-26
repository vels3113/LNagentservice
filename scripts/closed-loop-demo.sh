#!/usr/bin/env bash
set -euo pipefail

# SDK-style helper for local closed-loop flow:
# wallet-auth challenge -> wallet-auth verify -> connect -> infer (402) -> pay (demo preimage) -> paid infer
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

echo "[1/6] Create wallet auth challenge..."
AUTH_CHALLENGE="$(curl -sS -X POST "$BASE_URL/api/auth/wallet/challenge" \
  -H "Content-Type: application/json" \
  -d "{
    \"walletType\":\"$WALLET_TYPE\",
    \"walletRef\":\"$WALLET_REF\"
  }")"

AUTH_PAYMENT_HASH="$(echo "$AUTH_CHALLENGE" | jq -r '.paymentHash // empty')"
AUTH_PREIMAGE="$(echo "$AUTH_CHALLENGE" | jq -r '.preimage // empty')"
if [[ -z "$AUTH_PAYMENT_HASH" || -z "$AUTH_PREIMAGE" ]]; then
  echo "Wallet auth challenge failed:"
  echo "$AUTH_CHALLENGE"
  exit 1
fi

echo "[2/6] Verify wallet auth proof..."
AUTH_VERIFY_RESP="$(curl -sS -X POST "$BASE_URL/api/auth/wallet/verify" \
  -H "Content-Type: application/json" \
  -d "{
    \"walletType\":\"$WALLET_TYPE\",
    \"walletRef\":\"$WALLET_REF\",
    \"clientId\":\"$CLIENT_ID\",
    \"agentId\":\"$AGENT_ID\",
    \"paymentHash\":\"$AUTH_PAYMENT_HASH\",
    \"paymentProof\":\"$AUTH_PREIMAGE\"
  }")"

WALLET_AUTH_TOKEN="$(echo "$AUTH_VERIFY_RESP" | jq -r '.walletAuthToken // empty')"
if [[ -z "$WALLET_AUTH_TOKEN" ]]; then
  echo "Wallet auth verification failed:"
  echo "$AUTH_VERIFY_RESP"
  exit 1
fi

echo "[3/6] Connect client+agent..."
CONNECT_RESP="$(curl -sS -X POST "$BASE_URL/api/connect" \
  -H "Content-Type: application/json" \
  -d "{
    \"clientId\":\"$CLIENT_ID\",
    \"agentId\":\"$AGENT_ID\",
    \"walletType\":\"$WALLET_TYPE\",
    \"walletRef\":\"$WALLET_REF\",
    \"walletAuthToken\":\"$WALLET_AUTH_TOKEN\"
  }")"

CONNECTION_ID="$(echo "$CONNECT_RESP" | jq -r '.connectionId // empty')"
if [[ -z "$CONNECTION_ID" ]]; then
  echo "Connect failed:"
  echo "$CONNECT_RESP"
  exit 1
fi
echo "Connected: $CONNECTION_ID"

echo "[4/6] Request unpaid inference (expect 402)..."
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

echo "[5/6] Simulate pay step (demo mode preimage)..."
echo "Using preimage from challenge payload."

echo "[6/6] Retry with L402 proof..."
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
