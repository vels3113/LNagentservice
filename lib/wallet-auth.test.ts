import { describe, expect, it } from "vitest";
import {
  createWalletAuthChallenge,
  issueWalletAuthToken,
  resetWalletAuthStateForTests,
  verifyWalletAuthProof,
  verifyWalletAuthToken,
} from "./wallet-auth";

describe("wallet auth", () => {
  it("creates challenge and verifies wallet proof", async () => {
    resetWalletAuthStateForTests();

    const challenge = await createWalletAuthChallenge(
      { walletType: "demo", walletRef: "wallet-a" },
      {
        createInvoiceFn: async () => ({
          bolt11: "lnbcrt1testinvoice",
          paymentHash: "pay_hash_1",
          preimage: "proof-123",
          expiresAt: Date.now() + 10_000,
        }),
      }
    );

    expect(challenge.paymentHash).toBe("pay_hash_1");

    const verifyResult = await verifyWalletAuthProof(
      {
        walletType: "demo",
        walletRef: "wallet-a",
        clientId: "client-a",
        agentId: "agent-a",
        paymentHash: "pay_hash_1",
        paymentProof: "proof-123",
      },
      {
        verifyPreimageFn: async () => ({
          valid: true,
          paymentHash: "pay_hash_1",
        }),
        markUsedFn: () => {},
      }
    );

    expect(verifyResult.ok).toBe(true);
    expect(verifyResult.walletAuthToken).toBeTruthy();
  });

  it("rejects verification when wallet metadata does not match challenge", async () => {
    resetWalletAuthStateForTests();

    await createWalletAuthChallenge(
      { walletType: "demo", walletRef: "wallet-a" },
      {
        createInvoiceFn: async () => ({
          bolt11: "lnbcrt1testinvoice",
          paymentHash: "pay_hash_2",
          preimage: "proof-456",
          expiresAt: Date.now() + 10_000,
        }),
      }
    );

    const verifyResult = await verifyWalletAuthProof(
      {
        walletType: "demo",
        walletRef: "wallet-b",
        clientId: "client-a",
        agentId: "agent-a",
        paymentHash: "pay_hash_2",
        paymentProof: "proof-456",
      },
      {
        verifyPreimageFn: async () => ({
          valid: true,
          paymentHash: "pay_hash_2",
        }),
        markUsedFn: () => {},
      }
    );

    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.errorCode).toBe("wallet_mismatch");
  });

  it("issues token bound to identity and wallet metadata", () => {
    const token = issueWalletAuthToken({
      walletType: "demo",
      walletRef: "wallet-a",
      clientId: "client-a",
      agentId: "agent-a",
      ttlMs: 60_000,
    });

    const valid = verifyWalletAuthToken(token, {
      walletType: "demo",
      walletRef: "wallet-a",
      clientId: "client-a",
      agentId: "agent-a",
    });
    const invalid = verifyWalletAuthToken(token, {
      walletType: "demo",
      walletRef: "wallet-a",
      clientId: "client-a",
      agentId: "agent-b",
    });

    expect(valid.valid).toBe(true);
    expect(invalid.valid).toBe(false);
    expect(invalid.reason).toBe("identity_mismatch");
  });
});
