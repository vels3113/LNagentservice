import crypto from "crypto";

// In-memory invoice store (hackathon simplicity)
const invoices = new Map<string, { bolt11: string; expiresAt: number; used: boolean }>();

export interface Invoice {
  bolt11: string;
  paymentHash: string;
  preimage: string;
  expiresAt: number;
}

interface AlbyInvoiceResponse {
  payment_request: string;
  payment_hash: string;
  expires_at: string;
}

function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

function createDemoInvoice(amountSats: number): Invoice {
  const preimage = crypto.randomBytes(32).toString("hex");
  const paymentHash = crypto
    .createHash("sha256")
    .update(Buffer.from(preimage, "hex"))
    .digest("hex");
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1h
  const bolt11 = `lnbcrt${amountSats}u1demo${paymentHash.slice(0, 16)}`;

  invoices.set(paymentHash, { bolt11, expiresAt, used: false });

  return { bolt11, paymentHash, preimage, expiresAt };
}

export async function createInvoice(amountSats: number, memo: string): Promise<Invoice> {
  if (isDemoModeEnabled()) {
    const invoice = createDemoInvoice(amountSats);
    console.log(`[L402] Created demo invoice: ${amountSats} sats, hash=${invoice.paymentHash.slice(0, 8)}...`);
    return invoice;
  }

  const apiKey = process.env.ALBY_ACCESS_TOKEN;
  if (!apiKey) {
    throw new Error("ALBY_ACCESS_TOKEN environment variable is required (or set DEMO_MODE=true for local demo)");
  }

  try {
    // Create real Lightning invoice via Alby API
    const response = await fetch("https://api.getalby.com/invoices", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountSats,
        description: memo,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Alby API error: ${response.status} ${errorData}`);
    }

    const albyInvoice: AlbyInvoiceResponse = await response.json();
    const bolt11 = albyInvoice.payment_request;
    const paymentHash = albyInvoice.payment_hash;
    const expiresAt = new Date(albyInvoice.expires_at).getTime();

    // Store in our local cache for verification
    invoices.set(paymentHash, { bolt11, expiresAt, used: false });

    // For hackathon compatibility, generate a stub preimage
    // Real L402: preimage would be revealed when payment is settled
    const preimage = crypto.randomBytes(32).toString("hex");

    console.log(`[L402] Created real invoice: ${amountSats} sats, hash=${paymentHash.slice(0, 8)}...`);

    return { bolt11, paymentHash, preimage, expiresAt };
  } catch (error) {
    console.error("[L402] Failed to create Alby invoice:", error);
    throw error;
  }
}

export async function verifyPreimage(preimage: string): Promise<{ valid: boolean; paymentHash: string }> {
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

  if (isDemoModeEnabled()) {
    return { valid: true, paymentHash: computedHash };
  }

  // For real invoices, verify payment is settled with Alby
  const apiKey = process.env.ALBY_ACCESS_TOKEN;
  if (!apiKey) {
    return { valid: false, paymentHash: computedHash };
  }

  try {
    const response = await fetch(`https://api.getalby.com/invoices/${computedHash}`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return { valid: false, paymentHash: computedHash };
    }

    const invoiceData = await response.json();
    const settled = Boolean(invoiceData?.settled);
    const settledPreimage = typeof invoiceData?.preimage === "string" ? invoiceData.preimage : "";

    return { valid: settled && settledPreimage === preimage, paymentHash: computedHash };
  } catch (error) {
    console.error("[L402] Failed to verify with Alby:", error);
    return { valid: false, paymentHash: computedHash };
  }
}

export function markUsed(paymentHash: string): void {
  const invoice = invoices.get(paymentHash);
  if (invoice) {
    invoice.used = true;
  }
}

// For testing: get the preimage for a payment hash (hackathon compatibility)
export async function getPreimageForHash(paymentHash: string): Promise<string | null> {
  const apiKey = process.env.ALBY_ACCESS_TOKEN;
  if (!apiKey) {
    return null;
  }

  try {
    // Try to get preimage from settled Alby invoice
    const response = await fetch(`https://api.getalby.com/invoices/${paymentHash}`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      const invoiceData = await response.json();
      if (invoiceData.settled && invoiceData.preimage) {
        return invoiceData.preimage;
      }
    }
  } catch (error) {
    console.error("[L402] Failed to get preimage from Alby:", error);
  }

  return null;
}
