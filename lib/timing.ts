export interface InferenceTimings {
  paymentHash: string;
  clientId?: string;
  agentId?: string;
  model?: string;
  invoiceGeneratedAt: number;
  paymentVerifiedAt?: number;
  llmCallStartedAt?: number;
  llmFirstTokenAt?: number;
  llmCompleteAt?: number;
}

export function createTimings(
  paymentHash: string,
  metadata?: { clientId?: string; agentId?: string; model?: string }
): InferenceTimings {
  return {
    paymentHash,
    clientId: metadata?.clientId,
    agentId: metadata?.agentId,
    model: metadata?.model,
    invoiceGeneratedAt: Date.now(),
  };
}

export function logTimings(t: InferenceTimings): void {
  if (!t.paymentVerifiedAt || !t.llmCompleteAt) return;

  const lightning_ms = t.paymentVerifiedAt - t.invoiceGeneratedAt;
  const llm_start = t.llmCallStartedAt ?? t.paymentVerifiedAt;
  const llm_first_token_ms = t.llmFirstTokenAt ? t.llmFirstTokenAt - llm_start : null;
  const llm_full_ms = t.llmCompleteAt - llm_start;
  const claim_holds = lightning_ms < llm_full_ms;
  const claim_strong = llm_first_token_ms !== null && lightning_ms < llm_first_token_ms;

  console.log(
    JSON.stringify({
      payment_hash: t.paymentHash,
      client_id: t.clientId ?? null,
      agent_id: t.agentId ?? null,
      model: t.model ?? null,
      lightning_ms,
      llm_first_token_ms,
      llm_full_ms,
      claim_holds,
      claim_strong,
      replay_blocked: false,
    })
  );
}
