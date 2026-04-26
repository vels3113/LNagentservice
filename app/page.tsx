"use client";

import { useState, useRef } from "react";
import { Loader2, SendHorizonal, Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PaymentState = "idle" | "awaiting_payment" | "paid" | "streaming";

interface InvoiceData {
  invoice: string;
  paymentHash: string;
  preimage: string;
  amountSats: number;
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [settlementMs, setSettlementMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResponse("");
    setPaymentState("idle");
    setInvoiceData(null);
    setSettlementMs(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Step 1: Request inference, get 402 + invoice
      const res = await fetch("/api/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (res.status === 402) {
        // Payment required
        const data = await res.json();
        setInvoiceData(data);
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
    if (!invoiceData) return;

    setLoading(true);
    setError(null);
    const payStart = Date.now();

    try {
      // For stub: use the preimage we got from the 402 response
      // In real L402: wallet pays invoice and returns preimage
      const preimage = invoiceData.preimage;

      setPaymentState("paid");
      setSettlementMs(Date.now() - payStart);

      // Step 2: Re-request with L402 header
      const res = await fetch("/api/infer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `L402 ${preimage}`,
        },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

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
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      setResponse((prev) => prev + decoder.decode(value, { stream: true }));
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
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask something..."
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

      {/* Payment Required State */}
      {paymentState === "awaiting_payment" && invoiceData && (
        <section className="mt-6 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <Zap className="h-4 w-4 text-yellow-500" />
            Payment Required: {invoiceData.amountSats} sats
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Pay the Lightning invoice to get your AI response.
          </p>
          <div className="mb-3 break-all rounded bg-muted/50 p-2 font-mono text-xs">
            {invoiceData.invoice}
          </div>
          <Button onClick={handlePay} disabled={loading} className="w-full">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            Pay {invoiceData.amountSats} sats
          </Button>
        </section>
      )}

      {/* Payment Confirmed State */}
      {(paymentState === "paid" || paymentState === "streaming") && settlementMs !== null && (
        <div className="mt-4 flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          Paid in {settlementMs}ms
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

      {/* Footer */}
      <footer className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">
        100 sats per inference. Lightning Network. No API keys.
      </footer>
    </main>
  );
}
