import crypto from "crypto";
import {
  createInvoice,
  markUsed,
  type Invoice,
  type PaymentVerificationReason,
  type PaymentVerificationResult,
  verifyPreimage,
} from "@/lib/l402";

const walletAuthChallenges = new Map<
  string,
  {
    walletType: string;
    walletRef: string;
    expiresAt: number;
    consumed: boolean;
  }
>();

type VerifyReason =
  | "challenge_not_found"
  | "challenge_expired"
  | "challenge_consumed"
  | "wallet_mismatch"
  | "proof_invalid"
  | "proof_hash_mismatch";

export interface WalletAuthChallenge {
  invoice: string;
  paymentHash: string;
  expiresAt: number;
  amountSats: number;
  preimage?: string;
}

export interface WalletAuthTokenClaims {
  walletType: string;
  walletRef: string;
  clientId: string;
  agentId: string;
  iat: number;
  exp: number;
  v: 1;
}

export interface WalletAuthVerifyResult {
  ok: boolean;
  walletAuthToken?: string;
  expiresAt?: number;
  errorCode?: VerifyReason | PaymentVerificationReason;
}

function walletAuthSecret(): string {
  return (
    process.env.WALLET_AUTH_SIGNING_SECRET ||
    process.env.CONNECTION_SIGNING_SECRET ||
    "dev-wallet-auth-secret"
  );
}

function getWalletAuthAmountSats(): number {
  const raw = Number(process.env.WALLET_AUTH_SATS || 1);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payloadB64: string): string {
  return crypto.createHmac("sha256", walletAuthSecret()).update(payloadB64).digest("base64url");
}

function equalsNormalized(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function createWalletAuthChallenge(
  input: { walletType: string; walletRef: string },
  deps?: { createInvoiceFn?: (amountSats: number, memo: string) => Promise<Invoice> }
): Promise<WalletAuthChallenge> {
  const amountSats = getWalletAuthAmountSats();
  const createInvoiceFn = deps?.createInvoiceFn ?? createInvoice;
  const invoice = await createInvoiceFn(
    amountSats,
    `Wallet auth proof: ${input.walletType}/${input.walletRef}`.slice(0, 120)
  );

  walletAuthChallenges.set(invoice.paymentHash, {
    walletType: input.walletType.trim(),
    walletRef: input.walletRef.trim(),
    expiresAt: invoice.expiresAt,
    consumed: false,
  });

  const result: WalletAuthChallenge = {
    invoice: invoice.bolt11,
    paymentHash: invoice.paymentHash,
    expiresAt: invoice.expiresAt,
    amountSats,
  };
  if (process.env.DEMO_MODE === "true") {
    result.preimage = invoice.preimage;
  }
  return result;
}

export async function verifyWalletAuthProof(
  input: {
    walletType: string;
    walletRef: string;
    clientId: string;
    agentId: string;
    paymentHash: string;
    paymentProof: string;
  },
  deps?: {
    verifyPreimageFn?: (preimage: string) => Promise<PaymentVerificationResult>;
    markUsedFn?: (paymentHash: string) => void;
    nowFn?: () => number;
  }
): Promise<WalletAuthVerifyResult> {
  const challenge = walletAuthChallenges.get(input.paymentHash);
  if (!challenge) {
    return { ok: false, errorCode: "challenge_not_found" };
  }

  if (challenge.consumed) {
    return { ok: false, errorCode: "challenge_consumed" };
  }

  const now = (deps?.nowFn ?? Date.now)();
  if (challenge.expiresAt <= now) {
    return { ok: false, errorCode: "challenge_expired" };
  }

  if (
    !equalsNormalized(challenge.walletType, input.walletType) ||
    !equalsNormalized(challenge.walletRef, input.walletRef)
  ) {
    return { ok: false, errorCode: "wallet_mismatch" };
  }

  const verifyPreimageFn = deps?.verifyPreimageFn ?? verifyPreimage;
  const verification = await verifyPreimageFn(input.paymentProof.trim());
  if (!verification.valid) {
    return { ok: false, errorCode: verification.reason ?? "proof_invalid" };
  }
  if (verification.paymentHash !== input.paymentHash) {
    return { ok: false, errorCode: "proof_hash_mismatch" };
  }

  challenge.consumed = true;
  (deps?.markUsedFn ?? markUsed)(input.paymentHash);

  const token = issueWalletAuthToken({
    walletType: input.walletType,
    walletRef: input.walletRef,
    clientId: input.clientId,
    agentId: input.agentId,
    ttlMs: 10 * 60 * 1000,
  });

  const claims = decodeWalletAuthToken(token);
  if (!claims) {
    return { ok: false, errorCode: "proof_invalid" };
  }

  return {
    ok: true,
    walletAuthToken: token,
    expiresAt: claims.exp,
  };
}

export function issueWalletAuthToken(input: {
  walletType: string;
  walletRef: string;
  clientId: string;
  agentId: string;
  ttlMs: number;
}): string {
  const now = Date.now();
  const claims: WalletAuthTokenClaims = {
    walletType: input.walletType.trim(),
    walletRef: input.walletRef.trim(),
    clientId: input.clientId.trim(),
    agentId: input.agentId.trim(),
    iat: now,
    exp: now + input.ttlMs,
    v: 1,
  };
  const payloadB64 = b64url(JSON.stringify(claims));
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

function decodeWalletAuthToken(token: string): WalletAuthTokenClaims | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expectedSig = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedSigBuf.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as WalletAuthTokenClaims;
    if (parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifyWalletAuthToken(
  token: string,
  expected: { walletType: string; walletRef: string; clientId: string; agentId: string },
  now = Date.now()
): { valid: boolean; reason?: "invalid_signature_or_format" | "token_expired" | "identity_mismatch" } {
  const claims = decodeWalletAuthToken(token);
  if (!claims) {
    return { valid: false, reason: "invalid_signature_or_format" };
  }
  if (claims.exp <= now) {
    return { valid: false, reason: "token_expired" };
  }

  if (
    !equalsNormalized(claims.walletType, expected.walletType) ||
    !equalsNormalized(claims.walletRef, expected.walletRef) ||
    !equalsNormalized(claims.clientId, expected.clientId) ||
    !equalsNormalized(claims.agentId, expected.agentId)
  ) {
    return { valid: false, reason: "identity_mismatch" };
  }

  return { valid: true };
}

export function resetWalletAuthStateForTests(): void {
  walletAuthChallenges.clear();
}
