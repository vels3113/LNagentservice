import crypto from "crypto";

export interface ClientConnection {
  connectionId: string;
  displayName?: string;
  clientId: string;
  agentId: string;
  walletType: string;
  walletRef: string;
  createdAt: number;
}

export interface ClientConnectionInput {
  displayName?: string;
  clientId: string;
  agentId: string;
  walletType: string;
  walletRef: string;
}

export interface ClientResource {
  resourceId: string;
  clientId: string;
  agentId: string;
  title: string;
  resourceType: "prompt_template" | "context_text" | "reference_url";
  value: string;
  createdAt: number;
}

const connections = new Map<string, ClientConnection>();
const resources = new Map<string, ClientResource[]>();

function connectionKey(clientId: string, agentId: string): string {
  return `${clientId}::${agentId}`;
}

function connectionSecret(): string {
  return process.env.CONNECTION_SIGNING_SECRET || "dev-connection-secret";
}

function signPair(clientId: string, agentId: string): string {
  return crypto
    .createHmac("sha256", connectionSecret())
    .update(connectionKey(clientId, agentId))
    .digest("hex")
    .slice(0, 24);
}

export function createConnectionId(clientId: string, agentId: string): string {
  return `conn_${clientId}_${agentId}_${signPair(clientId, agentId)}`;
}

export function isConnectionIdValid(
  connectionId: string,
  clientId: string,
  agentId: string
): boolean {
  if (!connectionId) return false;
  const expected = createConnectionId(clientId, agentId);
  return connectionId === expected;
}

export function registerClientConnection(input: ClientConnectionInput): ClientConnection {
  const key = connectionKey(input.clientId, input.agentId);
  const existing = connections.get(key);
  if (existing) {
    return existing;
  }

  const connection: ClientConnection = {
    connectionId: createConnectionId(input.clientId, input.agentId),
    displayName: input.displayName?.trim() || undefined,
    clientId: input.clientId,
    agentId: input.agentId,
    walletType: input.walletType,
    walletRef: input.walletRef,
    createdAt: Date.now(),
  };

  connections.set(key, connection);
  return connection;
}

export function getClientConnection(
  clientId: string,
  agentId: string
): ClientConnection | null {
  return connections.get(connectionKey(clientId, agentId)) ?? null;
}

export function isClientConnected(clientId: string, agentId: string): boolean {
  return getClientConnection(clientId, agentId) !== null;
}

export function addClientResource(input: {
  clientId: string;
  agentId: string;
  title: string;
  resourceType: ClientResource["resourceType"];
  value: string;
}): ClientResource {
  const key = connectionKey(input.clientId, input.agentId);
  const resource: ClientResource = {
    resourceId: crypto.randomUUID(),
    clientId: input.clientId,
    agentId: input.agentId,
    title: input.title,
    resourceType: input.resourceType,
    value: input.value,
    createdAt: Date.now(),
  };

  const current = resources.get(key) ?? [];
  current.unshift(resource);
  resources.set(key, current);
  return resource;
}

export function listClientResources(clientId: string, agentId: string): ClientResource[] {
  return resources.get(connectionKey(clientId, agentId)) ?? [];
}
