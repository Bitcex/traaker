import { afterEach, describe, expect, it, vi } from "vitest";

describe("/api/polymarket/config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only safe readiness fields and no builder code", async () => {
    vi.stubEnv("POLYMARKET_BUILDER_CODE", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubEnv("RELAYER_API_KEY", "relayer-key");
    vi.stubEnv("RELAYER_API_KEY_ADDRESS", "0x1111111111111111111111111111111111111111");
    vi.stubEnv("POLYMARKET_RPC_URL", "https://polygon-rpc.example");
    vi.stubEnv("POLYMARKET_ADDRESS", "0x2222222222222222222222222222222222222222");
    vi.stubEnv("POLYMARKET_API_KEY", "api-key");
    vi.stubEnv("POLYMARKET_SECRET", "secret");
    vi.stubEnv("POLYMARKET_PASSPHRASE", "passphrase");

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
