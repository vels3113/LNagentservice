import crypto from "crypto";

// In-memory invoice store (hackathon simplicity)
const invoices = new Map<string, { bolt11: string; expiresAt: number; used: boolean }>();
const preimageToHash = new Map<string, string>();

export interface Invoice {
  bolt11: string;
  paymentHash: string;
  preimage: string;
  expiresAt: number;
}

export async function createInvoice(amountSats: number, memo: string): Promise<Invoice> {
  // STUB: Generate a fake invoice for vertical slice
  // TODO: Replace with real Alby API call in Task C

  const preimage = crypto.randomBytes(32).toString("hex");
  const paymentHash = crypto.createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min

  // Generate a stub bolt11 (not a real invoice, but demonstrates the flow)
  const bolt11 = `lnbc${amountSats}n1stub_${paymentHash.slice(0, 32)}`;

  invoices.set(paymentHash, { bolt11, expiresAt, used: false });
  preimageToHash.set(preimage, paymentHash);

  console.log(`[L402] Created invoice: ${amountSats} sats, hash=${paymentHash.slice(0, 8)}...`);

  return { bolt11, paymentHash, preimage, expiresAt };
}

export function verifyPreimage(preimage: string): { valid: boolean; paymentHash: string } {
  // Real L402: sha256(preimage) === paymentHash
  const computedHash = crypto.createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");

  const invoice = invoices.get(computedHash);
  if (!invoice) {
    return { valid: false, paymentHash: "" };
  }

  if (invoice.used) {
    return { valid: false, paymentHash: computedHash };
  }

  if (invoice.expiresAt < Date.now()) {
    return { valid: false, paymentHash: computedHash };
  }

  return { valid: true, paymentHash: computedHash };
}

export function markUsed(paymentHash: string): void {
  const invoice = invoices.get(paymentHash);
  if (invoice) {
    invoice.used = true;
  }
}

// For testing: get the preimage for a payment hash (only works for stub invoices)
export function getPreimageForHash(paymentHash: string): string | null {
  for (const [preimage, hash] of preimageToHash.entries()) {
    if (hash === paymentHash) return preimage;
  }
  return null;
}
