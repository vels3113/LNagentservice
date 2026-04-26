"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ResourceType = "prompt_template" | "context_text" | "reference_url";

interface ResourceItem {
  resourceId: string;
  title: string;
  resourceType: ResourceType;
  value: string;
  createdAt: number;
}

export default function ResourcesPage() {
  const [clientId, setClientId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [title, setTitle] = useState("");
  const [resourceType, setResourceType] = useState<ResourceType>("prompt_template");
  const [value, setValue] = useState("");
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedConnection = localStorage.getItem("sats_connection");
    if (storedConnection) {
      try {
        const parsed = JSON.parse(storedConnection) as {
          clientId?: string;
          agentId?: string;
          connectionId?: string;
        };
        if (parsed.clientId) setClientId(parsed.clientId);
        if (parsed.agentId) setAgentId(parsed.agentId);
        if (parsed.connectionId) setConnectionId(parsed.connectionId);
      } catch {
        // ignore malformed local storage
      }
    }
  }, []);

  async function fetchResources() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ clientId, agentId, connectionId });
      const res = await fetch(`/api/resources?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Fetch failed (${res.status})`);
      }
      const data = await res.json();
      setResources(data.resources ?? []);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitResource(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !value.trim()) {
      setError("title and value are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          agentId,
          connectionId,
          title,
          resourceType,
          value,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Submit failed (${res.status})`);
      }
      setTitle("");
      setValue("");
      await fetchResources();
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Resources Workspace</h1>
        <p className="text-sm text-muted-foreground">
          Submit metadata resources and link them to your connected client/agent pair.
        </p>
        <Link href="/" className="mt-2 inline-block text-xs text-muted-foreground underline">
          Back to demo
        </Link>
      </header>

      <section className="mb-4 rounded-lg border bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground">
          Pair:{" "}
          <span className="font-mono">
            {clientId || "not connected"} / {agentId || "not connected"}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Connection: <span className="font-mono">{connectionId || "none"}</span>
        </p>
        {!connectionId && (
          <p className="mt-2 text-xs text-amber-700">
            Complete signup first to associate resources with a valid connected agent.
          </p>
        )}
      </section>

      <form onSubmit={submitResource} className="space-y-2 rounded-lg border bg-muted/20 p-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Resource title"
          disabled={loading || !connectionId}
        />
        <select
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value as ResourceType)}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          disabled={loading || !connectionId}
        >
          <option value="prompt_template">prompt_template</option>
          <option value="context_text">context_text</option>
          <option value="reference_url">reference_url</option>
        </select>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Template / text snippet / URL"
          disabled={loading || !connectionId}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={loading || !connectionId}>
            Submit resource
          </Button>
          <Button type="button" variant="outline" onClick={fetchResources} disabled={loading}>
            Refresh
          </Button>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>

      <section className="mt-4 space-y-2">
        {resources.map((resource) => (
          <article key={resource.resourceId} className="rounded-md border p-3">
            <p className="text-sm font-medium">{resource.title}</p>
            <p className="text-xs text-muted-foreground">{resource.resourceType}</p>
            <p className="mt-1 break-all text-xs">{resource.value}</p>
          </article>
        ))}
        {!resources.length && (
          <p className="text-sm text-muted-foreground">
            No resources yet. Submit one and refresh.
          </p>
        )}
      </section>
    </main>
  );
}
