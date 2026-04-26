export type TransactionStatus = "pending" | "paid" | "completed" | "expired" | "failed";

export interface TransactionRecord {
  paymentHash: string;
  clientId: string;
  agentId: string;
  model: string;
  amountSats: number;
  status: TransactionStatus;
  invoiceCreatedAt?: number;
  paymentVerifiedAt?: number;
  inferenceCompletedAt?: number;
  latencyMs?: number;
  replayBlocked?: boolean;
  errorReason?: string;
}

const txByHash = new Map<string, TransactionRecord>();

function ensureRecord(paymentHash: string): TransactionRecord {
  const existing = txByHash.get(paymentHash);
  if (existing) return existing;
  const created: TransactionRecord = {
    paymentHash,
    clientId: "unknown",
    agentId: "unknown",
    model: "unknown",
    amountSats: 0,
    status: "failed",
  };
  txByHash.set(paymentHash, created);
  return created;
}

export function upsertTransaction(input: Partial<TransactionRecord> & { paymentHash: string }): TransactionRecord {
  const current = ensureRecord(input.paymentHash);
  const next: TransactionRecord = {
    ...current,
    ...input,
    paymentHash: current.paymentHash,
  };
  txByHash.set(input.paymentHash, next);
  return next;
}

export function listTransactions(params?: {
  status?: TransactionStatus;
  clientId?: string;
  agentId?: string;
  limit?: number;
}): TransactionRecord[] {
  let items = Array.from(txByHash.values());

  if (params?.status) {
    items = items.filter((tx) => tx.status === params.status);
  }
  if (params?.clientId) {
    items = items.filter((tx) => tx.clientId === params.clientId);
  }
  if (params?.agentId) {
    items = items.filter((tx) => tx.agentId === params.agentId);
  }

  items.sort((a, b) => {
    const aTs = a.inferenceCompletedAt || a.paymentVerifiedAt || a.invoiceCreatedAt || 0;
    const bTs = b.inferenceCompletedAt || b.paymentVerifiedAt || b.invoiceCreatedAt || 0;
    return bTs - aTs;
  });

  if (params?.limit && params.limit > 0) {
    return items.slice(0, params.limit);
  }
  return items;
}
