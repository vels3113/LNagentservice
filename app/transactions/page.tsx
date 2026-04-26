"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TxStatus = "pending" | "paid" | "completed" | "expired" | "failed";

interface TxRecord {
  paymentHash: string;
  clientId: string;
  agentId: string;
  model: string;
  amountSats: number;
  status: TxStatus;
  invoiceCreatedAt?: number;
  paymentVerifiedAt?: number;
  inferenceCompletedAt?: number;
  latencyMs?: number;
  replayBlocked?: boolean;
  errorReason?: string;
}

export default function TransactionsPage() {
  const [clientId, setClientId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [status, setStatus] = useState<"" | TxStatus>("");
  const [rows, setRows] = useState<TxRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRows() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (clientId.trim()) params.set("clientId", clientId.trim());
      if (agentId.trim()) params.set("agentId", agentId.trim());
      params.set("limit", "100");

      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed (${res.status})`);
      }
      const data = await res.json();
      setRows(data.transactions ?? []);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Transaction Monitor</h1>
        <p className="text-sm text-muted-foreground">
          Observe invoice to payment verification to inference completion lifecycle.
        </p>
        <Link href="/" className="mt-2 inline-block text-xs text-muted-foreground underline">
          Back to demo
        </Link>
      </header>

      <section className="mb-4 grid grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-3 md:grid-cols-5">
        <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="clientId" />
        <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="agentId" />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | TxStatus)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">all statuses</option>
          <option value="pending">pending</option>
          <option value="paid">paid</option>
          <option value="completed">completed</option>
          <option value="expired">expired</option>
          <option value="failed">failed</option>
        </select>
        <Button type="button" onClick={fetchRows} disabled={loading}>
          Refresh
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setClientId("");
            setAgentId("");
            setStatus("");
          }}
          disabled={loading}
        >
          Clear filters
        </Button>
      </section>

      {error && (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <section className="overflow-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/30 text-xs">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Hash</th>
              <th className="px-3 py-2">Client/Agent</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Latency</th>
              <th className="px-3 py-2">Replay blocked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tx) => (
              <tr key={tx.paymentHash} className="border-t">
                <td className="px-3 py-2">{tx.status}</td>
                <td className="px-3 py-2 font-mono text-xs">{tx.paymentHash.slice(0, 12)}...</td>
                <td className="px-3 py-2 text-xs">
                  {tx.clientId} / {tx.agentId}
                </td>
                <td className="px-3 py-2">{tx.amountSats}</td>
                <td className="px-3 py-2 text-xs">{tx.model}</td>
                <td className="px-3 py-2">{tx.latencyMs ?? "-"}</td>
                <td className="px-3 py-2">{tx.replayBlocked ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-3 text-sm text-muted-foreground">No transactions found for current filters.</p>
        )}
      </section>
    </main>
  );
}
