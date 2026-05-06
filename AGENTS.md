# AGENTS.md

## Cursor Cloud specific instructions

### Overview

SatsForTokens is a single Next.js 14 app (app router + API routes) implementing L402 Lightning-gated AI inference. There is no database, no Docker, and no external services required in demo mode.

### Running the dev server

```bash
DEMO_MODE=true npm run dev
```

`DEMO_MODE=true` mocks Lightning invoices and returns canned LLM responses, so no `OPENROUTER_API_KEY` or `ALBY_ACCESS_TOKEN` is needed for local development/testing.

### Lint / Build / Test

| Task | Command |
|------|---------|
| Lint | `npm run lint` |
| Build | `npm run build` |
| Dev server | `npm run dev` |

There are no automated test suites in this repo. Validation is done via the API endpoints or the web UI.

### Testing the L402 flow (demo mode)

With the dev server running (`DEMO_MODE=true npm run dev`), exercise the full connect → 402 → pay → response flow:

```bash
# 1. Connect
CONNECTION_ID=$(curl -s -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"clientId":"demo-client","agentId":"demo-agent","walletType":"demo","walletRef":"local-wallet"}' | jq -r '.connectionId')

# 2. Get 402 + invoice (demo preimage included)
RESP=$(curl -s -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Hello\",\"clientId\":\"demo-client\",\"agentId\":\"demo-agent\",\"connectionId\":\"$CONNECTION_ID\"}")
PREIMAGE=$(echo "$RESP" | jq -r '.preimage')

# 3. Authorized request
curl -s -X POST http://localhost:3000/api/infer \
  -H "Content-Type: application/json" \
  -H "Authorization: L402 $PREIMAGE" \
  -d "{\"prompt\":\"Hello\",\"clientId\":\"demo-client\",\"agentId\":\"demo-agent\",\"connectionId\":\"$CONNECTION_ID\"}"
```

### Gotchas

- The `.eslintrc.json` file must exist for `npm run lint` to work non-interactively (otherwise Next.js prompts interactively to choose a config). The file extends `next/core-web-vitals`.
- nvm is installed at `/home/ubuntu/.nvm` (not the default `$HOME/.nvm` for root). Source it with: `export NVM_DIR="/home/ubuntu/.nvm" && source "$NVM_DIR/nvm.sh"`.
- All state (connections, invoices, transactions) is in-memory and resets on server restart.
- The `scripts/closed-loop-demo.sh` script can also be used for quick API testing: `BASE_URL=http://localhost:3000 bash scripts/closed-loop-demo.sh "Your prompt"`.
