import { afterEach, describe, expect, it, vi } from "vitest";

describe("/api/polymarket/config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only safe readiness fields and no builder code", async () => {
    vi.stubEnv("POLYMARKET_BUILDER_CODE", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubEnv("POLYMARKET_BUILDER_API_KEY", "builder-key");
    vi.stubEnv("POLYMARKET_BUILDER_SECRET", "builder-secret");
    vi.stubEnv("POLYMARKET_BUILDER_PASSPHRASE", "builder-passphrase");
    vi.stubEnv("POLYMARKET_SESSION_SECRET", "a".repeat(32));
    vi.stubEnv("POLYMARKET_RPC_URL", "https://polygon-rpc.example");

    const { GET } = await import("@/app/api/polymarket/config/route");
    const response = await GET();
    const body = await response.json();

    expect(body).toMatchObject({
      ok: true,
      realTradingEnabled: false,
      builderReady: true,
      gaslessReady: true,
      clobReady: true,
      missingSetupReason: null,
    });
    expect(body.builderCode).toBeUndefined();
  });
});
