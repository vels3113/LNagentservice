#!/bin/bash
# Proves the claim: "Lightning settles before the LLM finishes responding"
# Usage: INFER_URL=https://your-app.vercel.app bash scripts/benchmark.sh [N]
#
# Requires: jq, alby CLI (https://github.com/getAlby/alby-cli)
# Install alby CLI: npm install -g @getalby/cli
#
# The server must emit timing JSON logs. Each run cross-checks:
#   lightning_ms  < llm_full_ms   → claim holds
#   lightning_ms  < 2000          → under-2-second bound holds

set -euo pipefail

URL="${INFER_URL:-http://localhost:3000}"
N="${1:-25}"
PROMPT='{"prompt":"Say hi in one word"}'

echo "Benchmarking $N runs against $URL"
echo ""
echo "run,lightning_ms,llm_wall_ms,lightning_under_2s,lightning_faster_than_llm"

PASS=0
FAIL=0

for i in $(seq 1 "$N"); do
  # Step 1: hit endpoint without payment → get invoice
  resp=$(curl -sf -X POST "$URL/api/infer" \
    -H 'Content-Type: application/json' \
    -d "$PROMPT" || true)

  invoice=$(echo "$resp" | jq -r '.invoice // empty')
  if [ -z "$invoice" ]; then
    echo "$i,ERROR,ERROR,false,false  # no invoice returned"
    FAIL=$((FAIL + 1))
    continue
  fi

  # Step 2: pay the invoice, record wall-clock Lightning time
  t_pay_start=$(date +%s%3N)
  preimage=$(alby pay "$invoice" --json 2>/dev/null | jq -r '.payment_preimage // empty')
  t_pay_end=$(date +%s%3N)
  lightning_ms=$((t_pay_end - t_pay_start))

  if [ -z "$preimage" ]; then
    echo "$i,ERROR,ERROR,false,false  # payment failed"
    FAIL=$((FAIL + 1))
    continue
  fi

  # Step 3: submit preimage, record full LLM wall time
  t_llm_start=$(date +%s%3N)
  curl -sf -X POST "$URL/api/infer" \
    -H 'Content-Type: application/json' \
    -H "Authorization: L402 $preimage" \
    -d "$PROMPT" > /dev/null
  t_llm_end=$(date +%s%3N)
  llm_wall_ms=$((t_llm_end - t_llm_start))

  under_2s="false"
  [ "$lightning_ms" -lt 2000 ] && under_2s="true"

  faster="false"
  [ "$lightning_ms" -lt "$llm_wall_ms" ] && faster="true"

  echo "$i,$lightning_ms,$llm_wall_ms,$under_2s,$faster"

  [ "$faster" = "true" ] && [ "$under_2s" = "true" ] && PASS=$((PASS + 1)) || FAIL=$((FAIL + 1))

  sleep 1
done

echo ""
echo "Results: $PASS/$N claim_holds (lightning < 2s AND lightning < llm)"
echo ""
if [ "$PASS" -ge $((N * 4 / 5)) ]; then
  echo "CLAIM VERIFIED: $PASS/$N runs passed (>= 80% threshold)"
else
  echo "CLAIM NOT MET: only $PASS/$N runs passed (need >= $((N * 4 / 5)))"
fi
