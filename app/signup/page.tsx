"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface WalletAuthChallenge {
  invoice: string;
  paymentHash: string;
  amountSats: number;
  expiresAt: number;
  preimage?: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [clientId, setClientId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [walletType, setWalletType] = useState("");
  const [walletRef, setWalletRef] = useState("");
  const [challenge, setChallenge] = useState<WalletAuthChallenge | null>(null);
  const [paymentProof, setPaymentProof] = useState("");
  const [walletAuthToken, setWalletAuthToken] = useState<string | null>(null);
  const [walletAuthExpiresAt, setWalletAuthExpiresAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createWalletChallenge() {
    if (!walletType.trim() || !walletRef.trim()) {
      setError("walletType and walletRef are required to create auth challenge");
      return;
    }

    setLoading(true);
    setError(null);
    setWalletAuthToken(null);
    setWalletAuthExpiresAt(null);
    try {
      const res = await fetch("/api/auth/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletType, walletRef }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Challenge failed (${res.status})`);
      }

      const data = (await res.json()) as WalletAuthChallenge;
      setChallenge(data);
      setPaymentProof(data.preimage ?? "");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Failed to create wallet challenge");
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyWalletProof() {
    if (!challenge || !paymentProof.trim() || !clientId.trim() || !agentId.trim()) {
      setError("clientId, agentId, challenge, and payment proof are required");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletType,
          walletRef,
          clientId,
          agentId,
          paymentHash: challenge.paymentHash,
          paymentProof,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Verification failed (${res.status})`);
      }

      const data = (await res.json()) as { walletAuthToken: string; walletAuthExpiresAt: number };
      setWalletAuthToken(data.walletAuthToken);
      setWalletAuthExpiresAt(data.walletAuthExpiresAt);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Wallet verification failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !clientId.trim() || !agentId.trim() || !walletType.trim() || !walletRef.trim()) {
      setError("All fields are required");
      return;
    }
    if (!walletAuthToken) {
      setError("Complete wallet proof verification before signup");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          clientId,
          agentId,
          walletType,
          walletRef,
          walletAuthToken,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Signup failed (${res.status})`);
      }

      const connection = await res.json();
      localStorage.setItem(
        "sats_signup_profile",
        JSON.stringify({ displayName, clientId, agentId, walletType, walletRef })
      );
      localStorage.setItem("sats_connection", JSON.stringify(connection));

      router.push("/");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Signup failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Agent-Wallet Signup</h1>
        <p className="text-sm text-muted-foreground">
          Register your profile, client, agent, and wallet metadata for paid inference.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name"
          disabled={loading}
          aria-label="Display name"
        />
        <Input
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setWalletAuthToken(null);
          }}
          placeholder="Client ID (e.g. acme-client)"
          disabled={loading}
          aria-label="Client ID"
        />
        <Input
          value={agentId}
          onChange={(e) => {
            setAgentId(e.target.value);
            setWalletAuthToken(null);
          }}
          placeholder="Agent ID (e.g. pricing-agent)"
          disabled={loading}
          aria-label="Agent ID"
        />
        <Input
          value={walletType}
          onChange={(e) => {
            setWalletType(e.target.value);
            setChallenge(null);
            setWalletAuthToken(null);
          }}
          placeholder="Wallet type (e.g. alby)"
          disabled={loading}
          aria-label="Wallet type"
        />
        <Input
          value={walletRef}
          onChange={(e) => {
            setWalletRef(e.target.value);
            setChallenge(null);
            setWalletAuthToken(null);
          }}
          placeholder="Wallet reference (non-secret identifier)"
          disabled={loading}
          aria-label="Wallet reference"
        />

        <section className="rounded-md border bg-background p-3 text-sm">
          <p className="font-medium">Wallet authentication</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Prove wallet ownership by paying a one-time Lightning auth challenge.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={createWalletChallenge} disabled={loading}>
              Create auth challenge
            </Button>
            {walletAuthToken && (
              <span className="text-xs text-emerald-700">
                Verified {walletAuthExpiresAt ? `(expires ${new Date(walletAuthExpiresAt).toLocaleTimeString()})` : ""}
              </span>
            )}
          </div>

          {challenge && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Challenge invoice ({challenge.amountSats} sats):
              </p>
              <div className="break-all rounded bg-muted/40 p-2 font-mono text-xs">{challenge.invoice}</div>
              <Input
                value={paymentProof}
                onChange={(e) => setPaymentProof(e.target.value)}
                placeholder={challenge.preimage ? "Demo preimage prefilled" : "Paste payment proof (preimage)"}
                disabled={loading}
                aria-label="Wallet payment proof"
              />
              <Button
                type="button"
                variant="outline"
                onClick={verifyWalletProof}
                disabled={loading || !paymentProof.trim() || !clientId.trim() || !agentId.trim()}
                className="w-full"
              >
                Verify wallet proof
              </Button>
            </div>
          )}
        </section>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading || !walletAuthToken} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete signup (wallet-authenticated)"}
        </Button>
      </form>

      <Link href="/" className="mt-4 text-center text-sm text-muted-foreground underline">
        Back to demo
      </Link>
    </main>
  );
}
