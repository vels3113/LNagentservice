import {
  addClientResource,
  isClientConnected,
  isConnectionIdValid,
  listClientResources,
} from "@/lib/clients";

export const runtime = "nodejs";
export const maxDuration = 30;

function canAccess(clientId: string, agentId: string, connectionId: string): boolean {
  return isClientConnected(clientId, agentId) || isConnectionIdValid(connectionId, clientId, agentId);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = (url.searchParams.get("clientId") || "").trim();
  const agentId = (url.searchParams.get("agentId") || "").trim();
  const connectionId = (url.searchParams.get("connectionId") || "").trim();

  if (!clientId || !agentId) {
    return Response.json({ error: "clientId and agentId are required" }, { status: 400 });
  }

  if (!canAccess(clientId, agentId, connectionId)) {
    return Response.json({ error: "Client/agent pair is not connected" }, { status: 403 });
  }

  return Response.json({ resources: listClientResources(clientId, agentId) }, { status: 200 });
}

export async function POST(req: Request) {
  let body: {
    clientId?: unknown;
    agentId?: unknown;
    connectionId?: unknown;
    title?: unknown;
    resourceType?: unknown;
    value?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientId = String(body.clientId ?? "").trim();
  const agentId = String(body.agentId ?? "").trim();
  const connectionId = String(body.connectionId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const resourceType = String(body.resourceType ?? "").trim();
  const value = String(body.value ?? "").trim();

  if (!clientId || !agentId || !title || !resourceType || !value) {
    return Response.json(
      { error: "clientId, agentId, title, resourceType, and value are required" },
      { status: 400 }
    );
  }

  if (!["prompt_template", "context_text", "reference_url"].includes(resourceType)) {
    return Response.json(
      { error: "resourceType must be one of prompt_template, context_text, reference_url" },
      { status: 400 }
    );
  }

  if (!canAccess(clientId, agentId, connectionId)) {
    return Response.json({ error: "Client/agent pair is not connected" }, { status: 403 });
  }

  const resource = addClientResource({
    clientId,
    agentId,
    title,
    resourceType: resourceType as "prompt_template" | "context_text" | "reference_url",
    value,
  });

  return Response.json({ resource }, { status: 200 });
}
