"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [clientId, setClientId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [walletType, setWalletType] = useState("");
  const [walletRef, setWalletRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !clientId.trim() || !agentId.trim() || !walletType.trim() || !walletRef.trim()) {
      setError("All fields are required");
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
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Client ID (e.g. acme-client)"
          disabled={loading}
          aria-label="Client ID"
        />
        <Input
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="Agent ID (e.g. pricing-agent)"
          disabled={loading}
          aria-label="Agent ID"
        />
        <Input
          value={walletType}
          onChange={(e) => setWalletType(e.target.value)}
          placeholder="Wallet type (e.g. alby)"
          disabled={loading}
          aria-label="Wallet type"
        />
        <Input
          value={walletRef}
          onChange={(e) => setWalletRef(e.target.value)}
          placeholder="Wallet reference (non-secret identifier)"
          disabled={loading}
          aria-label="Wallet reference"
        />

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete signup"}
        </Button>
      </form>

      <Link href="/" className="mt-4 text-center text-sm text-muted-foreground underline">
        Back to demo
      </Link>
    </main>
  );
}
