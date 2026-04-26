import OpenAI from "openai";
import { createInvoice, verifyPreimage, markUsed } from "@/lib/l402";
import { isClientConnected, isConnectionIdValid } from "@/lib/clients";
import { createTimings, logTimings, type InferenceTimings } from "@/lib/timing";
import { upsertTransaction } from "@/lib/transactions";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
const DEFAULT_PRICE_SATS = 100;

const MODEL_PRICE_SATS: Record<string, number> = {
  "meta-llama/llama-3.1-8b-instruct:free": 100,
  "google/gemma-4-26b-a4b-it:free": 120,
  "anthropic/claude-3-haiku-20240307": 300,
};

function getPriceSatsForModel(model: string): number {
  return MODEL_PRICE_SATS[model] ?? DEFAULT_PRICE_SATS;
}

export async function POST(req: Request) {
  const startTime = Date.now();
  let timings: InferenceTimings | null = null;
  const demoMode = process.env.DEMO_MODE === "true";

  // Parse body
  let prompt: string;
  let clientId: string;
  let agentId: string;
  let connectionId: string;
  let requestedModel: string;
  try {
    const body = await req.json();
    prompt = String(body?.prompt ?? "").trim();
    clientId = String(body?.clientId ?? "").trim();
    agentId = String(body?.agentId ?? "").trim();
    connectionId = String(body?.connectionId ?? "").trim();
    requestedModel = String(body?.model ?? "").trim();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!prompt) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  if (!clientId || !agentId) {
    return Response.json(
      { error: "clientId and agentId are required. Connect first via /api/connect." },
      { status: 400 }
    );
  }

  // Accept either in-memory registration or a valid signed connection id.
  const isConnected = isClientConnected(clientId, agentId);
  const hasValidConnectionId = isConnectionIdValid(connectionId, clientId, agentId);
  const isLocalDemoPair = demoMode && clientId === "demo-client" && agentId === "demo-agent";
  if (!isConnected && !hasValidConnectionId && !isLocalDemoPair) {
    return Response.json(
      {
        error:
          "Client/agent pair is not connected. Call /api/connect first and include connectionId in /api/infer.",
      },
      { status: 403 }
    );
  }

  const model = requestedModel || process.env.MODEL_NAME || DEFAULT_MODEL;
  const priceSats = getPriceSatsForModel(model);

  // Check for L402 Authorization header
  const authHeader = req.headers.get("Authorization");
  const l402Match = authHeader?.match(/^L402\s+(\S+)$/i);

  if (!l402Match) {
    // No payment — return 402 with invoice
    const invoice = await createInvoice(priceSats, `SatsForTokens: ${prompt.slice(0, 50)}`);
    
    // Initialize timing tracking
    timings = createTimings(invoice.paymentHash, { clientId, agentId, model });
    upsertTransaction({
      paymentHash: invoice.paymentHash,
      clientId,
      agentId,
      model,
      amountSats: priceSats,
      status: "pending",
      invoiceCreatedAt: timings.invoiceGeneratedAt,
    });
    
    const challengePayload: Record<string, unknown> = {
      error: "Payment required",
      invoice: invoice.bolt11,
      paymentHash: invoice.paymentHash,
      amountSats: priceSats,
      model,
      expiresAt: invoice.expiresAt,
    };
    if (demoMode) {
      challengePayload.preimage = invoice.preimage;
    }

    return Response.json(
      challengePayload,
      {
        status: 402,
        headers: { "WWW-Authenticate": `L402 invoice="${invoice.bolt11}"` },
      }
    );
  }

  // Verify preimage
  const preimage = l402Match[1];
  const verification = await verifyPreimage(preimage);

  if (!verification.valid) {
    const replayBlocked = verification.reason === "already_used";
    console.log(
      JSON.stringify({
        client_id: clientId,
        agent_id: agentId,
        payment_hash: verification.paymentHash || null,
        replay_blocked: replayBlocked,
        verification_reason: verification.reason ?? "invalid",
      })
    );
    if (verification.paymentHash) {
      upsertTransaction({
        paymentHash: verification.paymentHash,
        clientId,
        agentId,
        model,
        amountSats: priceSats,
        status: verification.reason === "expired" ? "expired" : "failed",
        replayBlocked,
        errorReason: verification.reason,
      });
    }
    return Response.json({ error: "Invalid or expired payment" }, { status: 401 });
  }

  // Initialize timings for paid request
  timings = createTimings(verification.paymentHash, { clientId, agentId, model });
  timings.paymentVerifiedAt = Date.now();
  upsertTransaction({
    paymentHash: verification.paymentHash,
    clientId,
    agentId,
    model,
    amountSats: priceSats,
    status: "paid",
    paymentVerifiedAt: timings.paymentVerifiedAt,
  });

  // Mark as used (prevent replay)
  markUsed(verification.paymentHash);

  // Call LLM
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !demoMode) {
    return Response.json({ error: "Server misconfigured: missing OPENROUTER_API_KEY" }, { status: 500 });
  }

  // Start LLM request timing
  if (timings) {
    timings.llmCallStartedAt = Date.now();
  }

  if (demoMode) {
    const demoResponse =
      "L402 lets APIs return 402 with a Lightning invoice, then grant access after payment proof is provided.";
    const tokens = demoResponse.split(" ");
    const encoder = new TextEncoder();
    let firstTokenReceived = false;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (const token of tokens) {
            await new Promise((resolve) => setTimeout(resolve, 40));
            if (!firstTokenReceived && timings) {
              timings.llmFirstTokenAt = Date.now();
              firstTokenReceived = true;
            }
            controller.enqueue(encoder.encode(`${token} `));
          }
        } finally {
          if (timings) {
            timings.llmCompleteAt = Date.now();
            logTimings(timings);
            upsertTransaction({
              paymentHash: verification.paymentHash,
              clientId,
              agentId,
              model,
              amountSats: priceSats,
              status: "completed",
              inferenceCompletedAt: timings.llmCompleteAt,
              latencyMs: Date.now() - startTime,
              replayBlocked: false,
            });
          }
          controller.close();
        }
      },
    });

    const latencyMs = Date.now() - startTime;
    const paymentLatencyMs = timings?.paymentVerifiedAt
      ? timings.paymentVerifiedAt - timings.invoiceGeneratedAt
      : 0;

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Payment-Hash": verification.paymentHash,
        "X-Amount-Sats": String(priceSats),
        "X-Latency-Ms": String(latencyMs),
        "X-Payment-Latency-Ms": String(paymentLatencyMs),
        "X-Invoice-Generated-At": String(timings?.invoiceGeneratedAt || startTime),
        "X-Payment-Verified-At": String(timings?.paymentVerifiedAt || 0),
        "X-Demo-Mode": "true",
      },
    });
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });

  let upstream;
  try {
    upstream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: "system", content: "You are a helpful assistant. Be concise." },
        { role: "user", content: prompt },
      ],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "LLM request failed";
    upsertTransaction({
      paymentHash: verification.paymentHash,
      clientId,
      agentId,
      model,
      amountSats: priceSats,
      status: "failed",
      errorReason: message,
    });
    return Response.json({ error: message }, { status: 502 });
  }

  // Stream response
  const encoder = new TextEncoder();
  let firstTokenReceived = false;
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of upstream) {
          const token = chunk.choices?.[0]?.delta?.content;
          if (token) {
            // Mark first token timing
            if (!firstTokenReceived && timings) {
              timings.llmFirstTokenAt = Date.now();
              firstTokenReceived = true;
            }
            controller.enqueue(encoder.encode(token));
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "unknown";
        controller.enqueue(encoder.encode(`\n[error: ${message}]`));
      } finally {
        // Mark completion timing and log
        if (timings) {
          timings.llmCompleteAt = Date.now();
          logTimings(timings);
          upsertTransaction({
            paymentHash: verification.paymentHash,
            clientId,
            agentId,
            model,
            amountSats: priceSats,
            status: "completed",
            inferenceCompletedAt: timings.llmCompleteAt,
            latencyMs: Date.now() - startTime,
            replayBlocked: false,
          });
        }
        controller.close();
      }
    },
  });

  const latencyMs = Date.now() - startTime;
  const paymentLatencyMs = timings?.paymentVerifiedAt 
    ? timings.paymentVerifiedAt - timings.invoiceGeneratedAt 
    : 0;
  
  console.log(`[L402] Paid request: model=${model}, latency=${latencyMs}ms, hash=${verification.paymentHash.slice(0, 8)}...`);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Payment-Hash": verification.paymentHash,
      "X-Amount-Sats": String(priceSats),
      "X-Latency-Ms": String(latencyMs),
      "X-Payment-Latency-Ms": String(paymentLatencyMs),
      "X-Invoice-Generated-At": String(timings?.invoiceGeneratedAt || startTime),
      "X-Payment-Verified-At": String(timings?.paymentVerifiedAt || 0),
    },
  });
}
