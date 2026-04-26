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
  const [displayName, setDisplayName] = useState("Demo User");
  const [clientId, setClientId] = useState("demo-client");
  const [agentId, setAgentId] = useState("demo-agent");
  const [walletType, setWalletType] = useState("demo");
  const [walletRef, setWalletRef] = useState("local-wallet");
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
    const rawProfile = localStorage.getItem("sats_signup_profile");
    if (rawProfile) {
      try {
        const profile = JSON.parse(rawProfile) as {
          displayName?: string;
          clientId?: string;
          agentId?: string;
          walletType?: string;
          walletRef?: string;
        };
        if (profile.displayName) setDisplayName(profile.displayName);
        if (profile.clientId) setClientId(profile.clientId);
        if (profile.agentId) setAgentId(profile.agentId);
        if (profile.walletType) setWalletType(profile.walletType);
        if (profile.walletRef) setWalletRef(profile.walletRef);
      } catch {
        // ignore invalid local storage payload
      }
    }

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

  async function handleConnect() {
    if (!displayName.trim() || !clientId.trim() || !agentId.trim() || !walletType.trim() || !walletRef.trim()) {
      setError("displayName, clientId, agentId, walletType, and walletRef are required");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, clientId, agentId, walletType, walletRef }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Connect failed (${res.status})`);
      }

      const data = await res.json();
      setConnection(data);
      localStorage.setItem(
        "sats_signup_profile",
        JSON.stringify({ displayName, clientId, agentId, walletType, walletRef })
      );
      localStorage.setItem("sats_connection", JSON.stringify(data));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Failed to connect");
      }
    } finally {
      setLoading(false);
    }
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
          clientId,
          agentId,
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
          clientId,
          agentId,
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
          L402-gated AI inference. Pay Lightning sats, get tokens. No keys. No accounts.
        </p>
        <Link href="/signup" className="mt-2 inline-block text-xs text-muted-foreground underline">
          New here? Complete agent-wallet signup
        </Link>
        <Link href="/resources" className="ml-4 mt-2 inline-block text-xs text-muted-foreground underline">
          Open resource workspace
        </Link>
        <Link href="/transactions" className="ml-4 mt-2 inline-block text-xs text-muted-foreground underline">
          Open transaction monitor
        </Link>
      </header>

      <section className="mb-4 rounded-lg border bg-muted/20 p-4">
        <h2 className="mb-3 text-sm font-semibold">1) Connect Client + Agent + Wallet</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="displayName"
            disabled={loading}
            aria-label="Display name"
          />
          <Input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="clientId"
            disabled={loading}
            aria-label="Client ID"
          />
          <Input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="agentId"
            disabled={loading}
            aria-label="Agent ID"
          />
          <Input
            value={walletType}
            onChange={(e) => setWalletType(e.target.value)}
            placeholder="walletType"
            disabled={loading}
            aria-label="Wallet type"
          />
          <Input
            value={walletRef}
            onChange={(e) => setWalletRef(e.target.value)}
            placeholder="walletRef"
            disabled={loading}
            aria-label="Wallet reference"
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" onClick={handleConnect} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
          </Button>
          {connection && (
            <p className="text-xs text-emerald-700">
              Connected{connection.displayName ? ` (${connection.displayName})` : ""}: {connection.connectionId}
            </p>
          )}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask something..."
            disabled={loading || paymentState === "awaiting_payment" || !connection}
            aria-label="Prompt"
          />
          <Button
            type="submit"
            disabled={loading || !prompt.trim() || paymentState === "awaiting_payment" || !connection}
          >
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

      {/* Payment Required State */}
      {paymentState === "awaiting_payment" && invoiceData && (
        <section className="mt-6 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <Zap className="h-4 w-4 text-yellow-500" />
            Payment Required: {invoiceData.amountSats} sats
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Pay the Lightning invoice to get your AI response, then submit the payment proof.
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
            Payment Confirmed
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
