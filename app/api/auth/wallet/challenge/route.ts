import { createWalletAuthChallenge } from "@/lib/wallet-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: { walletType?: unknown; walletRef?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const walletType = String(body.walletType ?? "").trim();
  const walletRef = String(body.walletRef ?? "").trim();

  if (!walletType || !walletRef) {
    return Response.json({ error: "walletType and walletRef are required" }, { status: 400 });
  }

  try {
    const challenge = await createWalletAuthChallenge({ walletType, walletRef });
    return Response.json(challenge, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create wallet auth challenge";
    return Response.json({ error: message }, { status: 500 });
  }
}
