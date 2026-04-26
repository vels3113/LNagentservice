import { registerClientConnection } from "@/lib/clients";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: {
    displayName?: unknown;
    clientId?: unknown;
    agentId?: unknown;
    walletType?: unknown;
    walletRef?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const displayName = String(body.displayName ?? "").trim();
  const clientId = String(body.clientId ?? "").trim();
  const agentId = String(body.agentId ?? "").trim();
  const walletType = String(body.walletType ?? "").trim();
  const walletRef = String(body.walletRef ?? "").trim();

  if (!clientId || !agentId || !walletType || !walletRef) {
    return Response.json(
      { error: "clientId, agentId, walletType, and walletRef are required" },
      { status: 400 }
    );
  }

  const connection = registerClientConnection({
    displayName,
    clientId,
    agentId,
    walletType,
    walletRef,
  });

  return Response.json(
    {
      connectionId: connection.connectionId,
      displayName: connection.displayName ?? null,
      clientId: connection.clientId,
      agentId: connection.agentId,
      walletType: connection.walletType,
      walletRef: connection.walletRef,
      createdAt: connection.createdAt,
    },
    { status: 200 }
  );
}
