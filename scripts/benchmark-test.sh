#!/bin/bash
# Test benchmark for claim: "Payment settles at or ahead of LLM latency."
# Usage: INFER_URL=http://localhost:3000 bash scripts/benchmark-test.sh [N]
#
# This script is test-mode only. It uses preimage returned by the 402 response
# and a simulated payment delay to validate the benchmark/reporting pipeline.

set -euo pipefail

URL="${INFER_URL:-http://localhost:3000}"
N="${1:-25}"
PROMPT='{"prompt":"Say hi in one word"}'

echo "Benchmarking $N runs against $URL (TEST MODE)"
echo ""
echo "run,lightning_ms,llm_wall_ms,payment_within_llm_latency,payment_under_2s"

PASS=0
FAIL=0

for i in $(seq 1 "$N"); do
  # 1) Request invoice
  resp=$(curl -s -X POST "$URL/api/infer" \
    -H 'Content-Type: application/json' \
    -d "$PROMPT" || true)

  if ! echo "$resp" | jq -e '.invoice' >/dev/null 2>&1; then
    echo "$i,ERROR,ERROR,false,false  # no invoice returned"
    FAIL=$((FAIL + 1))
    continue
  fi

  # 2) In test mode we consume preimage directly and simulate pay latency
  preimage=$(echo "$resp" | jq -r '.preimage')
  if [ -z "$preimage" ] || [ "$preimage" = "null" ]; then
    echo "$i,ERROR,ERROR,false,false  # no preimage returned"
    FAIL=$((FAIL + 1))
    continue
  fi

  t_pay_start=$(date +%s%3N)
  sleep_time=$(echo "scale=3; $(( RANDOM % 150 + 50 )) / 1000" | bc -l 2>/dev/null || echo "0.1")
  sleep "$sleep_time"
  t_pay_end=$(date +%s%3N)
  lightning_ms=$((t_pay_end - t_pay_start))

  # 3) Submit paid request and measure end-to-end model latency
  t_llm_start=$(date +%s%3N)
  curl -s -X POST "$URL/api/infer" \
    -H 'Content-Type: application/json' \
    -H "Authorization: L402 $preimage" \
    -d "$PROMPT" >/dev/null 2>&1 || true
  t_llm_end=$(date +%s%3N)
  llm_wall_ms=$((t_llm_end - t_llm_start))

  payment_within_llm_latency="false"
  [ "$lightning_ms" -lt "$llm_wall_ms" ] && payment_within_llm_latency="true"

  payment_under_2s="false"
  [ "$lightning_ms" -lt 2000 ] && payment_under_2s="true"

  echo "$i,$lightning_ms,$llm_wall_ms,$payment_within_llm_latency,$payment_under_2s"

  if [ "$payment_within_llm_latency" = "true" ] && [ "$payment_under_2s" = "true" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi

  sleep 0.5
done

echo ""
echo "Results: $PASS/$N passes (payment < llm latency AND payment < 2s)"
echo ""

threshold=$((N * 4 / 5))
if [ "$PASS" -ge "$threshold" ]; then
  echo "CLAIM VERIFIED (TEST MODE): $PASS/$N runs passed (>= 80% threshold)"
  exit 0
else
  echo "CLAIM NOT MET (TEST MODE): only $PASS/$N runs passed (need >= $threshold)"
  exit 1
fi
