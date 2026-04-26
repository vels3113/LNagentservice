"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, SendHorizonal, Zap, CheckCircle, Clock, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PaymentState = "idle" | "awaiting_payment" | "paid" | "streaming" | "complete";

interface InvoiceData {
  invoice: string;
  paymentHash: string;
  preimage?: string;
  amountSats: number;
}

interface TimingMetrics {
  paymentMs: number;
  totalLatencyMs: number;
  firstTokenMs?: number;
  streamingStarted?: number;
}

interface ConnectionData {
  connectionId: string;
  displayName?: string | null;
  clientId: string;
  agentId: string;
  walletType: string;
  walletRef: string;
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [connection, setConnection] = useState<ConnectionData | null>(null);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [paymentProof, setPaymentProof] = useState("");
  const [timingMetrics, setTimingMetrics] = useState<TimingMetrics | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const rawConnection = localStorage.getItem("sats_connection");
    if (rawConnection) {
      try {
        const existingConnection = JSON.parse(rawConnection) as ConnectionData;
        if (existingConnection.connectionId) {
          setConnection(existingConnection);
        }
      } catch {
        // ignore invalid local storage payload
      }
    }
  }, []);

  function clearConnection() {
    localStorage.removeItem("sats_connection");
    setConnection(null);
    setPaymentState("idle");
    setInvoiceData(null);
    setPaymentProof("");
    setTimingMetrics(null);
    setResponse("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading || !connection) return;

    setLoading(true);
    setError(null);
    setResponse("");
    setPaymentState("idle");
    setInvoiceData(null);
    setTimingMetrics(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Step 1: Request inference, get 402 + invoice
      const res = await fetch("/api/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          clientId: connection.clientId,
          agentId: connection.agentId,
          connectionId: connection.connectionId,
        }),
        signal: controller.signal,
      });

      if (res.status === 402) {
        // Payment required
        const data = (await res.json()) as InvoiceData;
        setInvoiceData(data);
        setPaymentProof(data.preimage ?? "");
        setPaymentState("awaiting_payment");
        setLoading(false);
        return;
      }

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      // Direct success (shouldn't happen without payment, but handle it)
      setPaymentState("streaming");
      await streamResponse(res);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message || "Something went wrong");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  async function handlePay() {
    if (!invoiceData || !connection) return;
    if (!paymentProof.trim()) {
      setError("Payment proof is required. In demo mode this is auto-filled.");
      return;
    }

    setLoading(true);
    setError(null);
    const payStart = Date.now();

    try {
      const paymentLatencyMs = Date.now() - payStart;
      setPaymentState("paid");

      // Step 2: Re-request with L402 header
      const res = await fetch("/api/infer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `L402 ${paymentProof.trim()}`,
        },
        body: JSON.stringify({
          prompt,
          clientId: connection.clientId,
          agentId: connection.agentId,
          connectionId: connection.connectionId,
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      // Extract timing metadata from response headers
      const totalLatencyMs = parseInt(res.headers.get("X-Latency-Ms") || "0");
      setTimingMetrics({
        paymentMs: paymentLatencyMs,
        totalLatencyMs,
        streamingStarted: Date.now(),
      });

      setPaymentState("streaming");
      await streamResponse(res);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  }

  async function streamResponse(res: Response) {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let firstToken = true;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        setPaymentState("complete");
        break;
      }
      
      const text = decoder.decode(value, { stream: true });
      if (firstToken && text.trim() && timingMetrics) {
        // Mark first token received
        setTimingMetrics(prev => prev ? {
          ...prev,
          firstTokenMs: Date.now() - (prev.streamingStarted || Date.now())
        } : null);
        firstToken = false;
      }
      
      setResponse((prev) => prev + text);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8">
      <header className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Zap className="h-6 w-6 text-yellow-500" />
          SatsForTokens
        </h1>
        <p className="text-sm text-muted-foreground">
          L402-gated paid inference for client-owned agents and wallets.
        </p>

        <section className="mt-4 rounded-lg border bg-muted/20 p-4">
          <h2 className="mb-2 text-sm font-semibold">Customer journey</h2>
          <ol className="space-y-1 text-xs text-muted-foreground">
            <li className={connection ? "text-emerald-700" : ""}>
              1. Sign up and connect your agent-wallet identity
            </li>
            <li className={connection ? "" : "opacity-70"}>2. Submit an inference request</li>
            <li className={connection ? "" : "opacity-70"}>
              3. Pay invoice and receive response + transaction trace
            </li>
          </ol>
          {!connection && (
            <Link href="/signup" className="mt-3 inline-block text-xs underline">
              Start with agent-wallet signup
            </Link>
          )}
        </section>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <Link href="/signup" className="underline">
            Signup
          </Link>
          <Link href="/resources" className="underline">
            Resources
          </Link>
          <Link href="/transactions" className="underline">
            Transactions
          </Link>
        </div>
      </header>

      {connection ? (
        <section className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
          <h2 className="mb-2 text-sm font-semibold text-emerald-800">1) Agent-wallet connected</h2>
          <div className="grid grid-cols-1 gap-1 text-xs text-emerald-700 md:grid-cols-2">
            <p>
              Client: <span className="font-mono">{connection.clientId}</span>
            </p>
            <p>
              Agent: <span className="font-mono">{connection.agentId}</span>
            </p>
            <p>
              Wallet type: <span className="font-mono">{connection.walletType}</span>
            </p>
            <p>
              Wallet ref: <span className="font-mono">{connection.walletRef}</span>
            </p>
            <p className="md:col-span-2">
              Connection: <span className="font-mono">{connection.connectionId}</span>
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={clearConnection} disabled={loading}>
              Disconnect
            </Button>
            <Link href="/signup" className="inline-flex items-center text-xs underline">
              Edit signup data
            </Link>
          </div>
        </section>
      ) : (
        <section className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm">
          <h2 className="mb-1 font-semibold">1) Connect first</h2>
          <p className="text-muted-foreground">
            Complete signup once to connect your client, agent, and wallet before requesting inference.
          </p>
        </section>
      )}

      {connection ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">2) Submit paid inference request</h2>
          <div className="flex gap-2">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter inference prompt..."
              disabled={loading || paymentState === "awaiting_payment"}
              aria-label="Prompt"
            />
            <Button type="submit" disabled={loading || !prompt.trim() || paymentState === "awaiting_payment"}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizonal className="h-4 w-4" />
              )}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <section className="rounded-lg border bg-muted/10 p-4 text-sm text-muted-foreground">
          Inference request panel unlocks after signup and connection.
        </section>
      )}

      {/* Payment Required State */}
      {paymentState === "awaiting_payment" && invoiceData && (
        <section className="mt-6 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <Zap className="h-4 w-4 text-yellow-500" />
            3) Payment required: {invoiceData.amountSats} sats
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Pay the Lightning invoice to unlock the response, then submit payment proof.
          </p>
          <div className="mb-3 break-all rounded bg-muted/50 p-2 font-mono text-xs">
            {invoiceData.invoice}
          </div>
          <Input
            value={paymentProof}
            onChange={(e) => setPaymentProof(e.target.value)}
            placeholder={
              invoiceData.preimage
                ? "Demo proof prefilled (preimage)"
                : "Paste wallet payment proof (preimage)"
            }
            className="mb-3"
            disabled={loading}
            aria-label="Payment proof"
          />
          <Button onClick={handlePay} disabled={loading || !paymentProof.trim()} className="w-full">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            Submit payment proof ({invoiceData.amountSats} sats)
          </Button>
        </section>
      )}

      {/* Payment and Timing Status */}
      {paymentState === "paid" && timingMetrics && (
        <div className="mt-4 rounded-lg border border-green-500/50 bg-green-500/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700">
            <CheckCircle className="h-4 w-4" />
            Payment confirmed
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-green-600">
            <Clock className="h-3 w-3" />
            Settled in {timingMetrics.paymentMs}ms
          </div>
        </div>
      )}

      {paymentState === "streaming" && timingMetrics && (
        <div className="mt-4 rounded-lg border border-blue-500/50 bg-blue-500/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
            <Activity className="h-4 w-4 animate-pulse" />
            Streaming Response
          </div>
          <div className="mt-1 space-y-1 text-xs text-blue-600">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              Payment: {timingMetrics.paymentMs}ms
            </div>
            {timingMetrics.firstTokenMs && (
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3" />
                First token: {timingMetrics.firstTokenMs}ms
              </div>
            )}
          </div>
        </div>
      )}

      {paymentState === "complete" && timingMetrics && (
        <div className="mt-4 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle className="h-4 w-4" />
            Complete
          </div>
          <div className="mt-1 space-y-1 text-xs text-emerald-600">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              Payment: {timingMetrics.paymentMs}ms
            </div>
            {timingMetrics.firstTokenMs && (
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3" />
                First token: {timingMetrics.firstTokenMs}ms
              </div>
            )}
            <div className="flex items-center gap-2">
              <Activity className="h-3 w-3" />
              Total: {timingMetrics.totalLatencyMs}ms
            </div>
          </div>
        </div>
      )}

      {/* Response */}
      <section className="mt-4 flex-1">
        {(response || (loading && paymentState === "streaming")) && (
          <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">
            {response}
            {loading && !response && (
              <span className="text-muted-foreground">Generating response...</span>
            )}
          </div>
        )}
      </section>

      {!connection && (
        <p className="mt-2 text-xs text-muted-foreground">
          Connect first to unlock paid inference flow.
        </p>
      )}

      {/* Footer */}
      <footer className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">
        100 sats per inference. Lightning Network. No API keys.
      </footer>
    </main>
  );
}
