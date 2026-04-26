# Lightning vs LLM Benchmark Summary

## Claim
Payment settles at or ahead of model-response latency (payment is not the bottleneck).

## Current Evidence
- Benchmark mode: **TEST MODE** (simulated pay delay + local preimage path)
- Trial count: **25**
- Result snapshot: **25/25 passes**
- Rule used:
  - `payment_ms < llm_wall_ms`
  - `payment_ms < 2000`

## Interpretation
- In the current benchmark pipeline, payment consistently lands inside the LLM latency envelope.
- This supports the demo narrative: payment overhead is effectively hidden under model response time.

## Important Note
This summary is based on `scripts/benchmark-test.sh` (test mode), not on real Lightning wallet settlement.  
For production-grade proof, run `scripts/benchmark.sh` with Alby CLI and real invoice payments.

## Related Files
- `scripts/benchmark.sh` (real-payment benchmark path)
- `scripts/benchmark-test.sh` (test-mode benchmark path)
- `benchmark_results_20260426_124142.txt` (sample run output)
