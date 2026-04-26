import OpenAI from "openai";
import { createInvoice, verifyPreimage, markUsed } from "@/lib/l402";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
const PRICE_SATS = 100;

export async function POST(req: Request) {
  const startTime = Date.now();

  // Parse body
  let prompt: string;
  try {
    const body = await req.json();
    prompt = String(body?.prompt ?? "").trim();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!prompt) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Check for L402 Authorization header
  const authHeader = req.headers.get("Authorization");
  const l402Match = authHeader?.match(/^L402\s+(\S+)$/i);

  if (!l402Match) {
    // No payment — return 402 with invoice
    const invoice = await createInvoice(PRICE_SATS, `SatsForTokens: ${prompt.slice(0, 50)}`);
    return Response.json(
      {
        error: "Payment required",
        invoice: invoice.bolt11,
        paymentHash: invoice.paymentHash,
        preimage: invoice.preimage, // Include for stub testing
        amountSats: PRICE_SATS,
        expiresAt: invoice.expiresAt,
      },
      {
        status: 402,
        headers: { "WWW-Authenticate": `L402 invoice="${invoice.bolt11}"` },
      }
    );
  }

  // Verify preimage
  const preimage = l402Match[1];
  const verification = verifyPreimage(preimage);

  if (!verification.valid) {
    return Response.json({ error: "Invalid or expired payment" }, { status: 401 });
  }

  // Mark as used (prevent replay)
  markUsed(verification.paymentHash);

  // Call LLM
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Server misconfigured: missing OPENROUTER_API_KEY" }, { status: 500 });
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });

  const model = process.env.MODEL_NAME || DEFAULT_MODEL;

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
    return Response.json({ error: message }, { status: 502 });
  }

  // Stream response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of upstream) {
          const token = chunk.choices?.[0]?.delta?.content;
          if (token) controller.enqueue(encoder.encode(token));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "unknown";
        controller.enqueue(encoder.encode(`\n[error: ${message}]`));
      } finally {
        controller.close();
      }
    },
  });

  const latencyMs = Date.now() - startTime;
  console.log(`[L402] Paid request: model=${model}, latency=${latencyMs}ms, hash=${verification.paymentHash.slice(0, 8)}...`);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Payment-Hash": verification.paymentHash,
      "X-Amount-Sats": String(PRICE_SATS),
      "X-Latency-Ms": String(latencyMs),
    },
  });
}
