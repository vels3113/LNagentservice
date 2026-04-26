import { verifyWalletAuthProof } from "@/lib/wallet-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

function statusForError(errorCode?: string): number {
  switch (errorCode) {
    case "challenge_expired":
    case "expired":
      return 410;
    case "challenge_consumed":
    case "already_used":
      return 409;
    case "wallet_mismatch":
      return 403;
    case "challenge_not_found":
    case "unknown_invoice":
      return 404;
    default:
      return 401;
  }
}

export async function POST(req: Request) {
  let body: {
    walletType?: unknown;
    walletRef?: unknown;
    clientId?: unknown;
    agentId?: unknown;
    paymentHash?: unknown;
    paymentProof?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const walletType = String(body.walletType ?? "").trim();
  const walletRef = String(body.walletRef ?? "").trim();
  const clientId = String(body.clientId ?? "").trim();
  const agentId = String(body.agentId ?? "").trim();
  const paymentHash = String(body.paymentHash ?? "").trim();
  const paymentProof = String(body.paymentProof ?? "").trim();

  if (!walletType || !walletRef || !clientId || !agentId || !paymentHash || !paymentProof) {
    return Response.json(
      { error: "walletType, walletRef, clientId, agentId, paymentHash, and paymentProof are required" },
      { status: 400 }
    );
  }

  const result = await verifyWalletAuthProof({
    walletType,
    walletRef,
    clientId,
    agentId,
    paymentHash,
    paymentProof,
  });

  if (!result.ok) {
    return Response.json(
      { error: "Wallet authentication failed", code: result.errorCode ?? "unknown" },
      { status: statusForError(result.errorCode) }
    );
  }

  return Response.json(
    {
      walletAuthToken: result.walletAuthToken,
      walletAuthExpiresAt: result.expiresAt,
    },
    { status: 200 }
  );
}
