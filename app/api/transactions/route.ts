import { listTransactions, type TransactionStatus } from "@/lib/transactions";

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_STATUSES: TransactionStatus[] = ["pending", "paid", "completed", "expired", "failed"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const statusParam = (url.searchParams.get("status") || "").trim();
  const clientId = (url.searchParams.get("clientId") || "").trim();
  const agentId = (url.searchParams.get("agentId") || "").trim();
  const limitParam = Number(url.searchParams.get("limit") || "50");
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

  if (statusParam && !VALID_STATUSES.includes(statusParam as TransactionStatus)) {
    return Response.json(
      { error: "status must be one of pending, paid, completed, expired, failed" },
      { status: 400 }
    );
  }

  const transactions = listTransactions({
    status: statusParam ? (statusParam as TransactionStatus) : undefined,
    clientId: clientId || undefined,
    agentId: agentId || undefined,
    limit,
  });

  return Response.json({ transactions }, { status: 200 });
}
