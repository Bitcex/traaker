import { afterEach, describe, expect, it, vi } from "vitest";
import { getPolymarketRuntimeConfigDetails } from "@/lib/server/polymarketRuntimeConfig";

describe("polymarket runtime config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("marks a full gasless deposit-wallet deployment as ready", () => {
    vi.stubEnv("POLYMARKET_BUILDER_CODE", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubEnv("RELAYER_API_KEY", "relayer-key");
    vi.stubEnv("RELAYER_API_KEY_ADDRESS", "0x1111111111111111111111111111111111111111");
    vi.stubEnv("POLYMARKET_RPC_URL", "https://polygon-rpc.example");
    vi.stubEnv("POLYMARKET_ADDRESS", "0x2222222222222222222222222222222222222222");
    vi.stubEnv("POLYMARKET_API_KEY", "api-key");
    vi.stubEnv("POLYMARKET_SECRET", "secret");
    vi.stubEnv("POLYMARKET_PASSPHRASE", "passphrase");

    const config = getPolymarketRuntimeConfigDetails();

    expect(config.builderReady).toBe(true);
    expect(config.gaslessReady).toBe(true);
    expect(config.clobReady).toBe(true);
    expect(config.missingSetupReason).toBeNull();
  });

  it("reports an invalid builder code separately from relayer config", () => {
    vi.stubEnv("POLYMARKET_BUILDER_CODE", "builder");
    vi.stubEnv("RELAYER_API_KEY", "relayer-key");
    vi.stubEnv("RELAYER_API_KEY_ADDRESS", "0x1111111111111111111111111111111111111111");
    vi.stubEnv("POLYMARKET_RPC_URL", "https://polygon-rpc.example");
    vi.stubEnv("POLYMARKET_ADDRESS", "0x2222222222222222222222222222222222222222");
    vi.stubEnv("POLYMARKET_API_KEY", "api-key");
    vi.stubEnv("POLYMARKET_SECRET", "secret");
    vi.stubEnv("POLYMARKET_PASSPHRASE", "passphrase");

    const config = getPolymarketRuntimeConfigDetails();

    expect(config.builderReady).toBe(false);
    expect(config.clobReady).toBe(false);
    expect(config.missingSetupReason).toMatch(/builder code/i);
  });

  it("reports missing relayer credentials as gasless setup only", () => {
    vi.stubEnv("POLYMARKET_BUILDER_CODE", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubEnv("POLYMARKET_RPC_URL", "https://polygon-rpc.example");
    vi.stubEnv("POLYMARKET_ADDRESS", "0x2222222222222222222222222222222222222222");
    vi.stubEnv("POLYMARKET_API_KEY", "api-key");
    vi.stubEnv("POLYMARKET_SECRET", "secret");
    vi.stubEnv("POLYMARKET_PASSPHRASE", "passphrase");

    const config = getPolymarketRuntimeConfigDetails();

    expect(config.builderReady).toBe(true);
    expect(config.gaslessReady).toBe(false);
    expect(config.clobReady).toBe(true);
    expect(config.missingSetupReason).toMatch(/gasless trading/i);
  });

  it("reports missing CLOB credentials separately", () => {
    vi.stubEnv("POLYMARKET_BUILDER_CODE", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubEnv("RELAYER_API_KEY", "relayer-key");
    vi.stubEnv("RELAYER_API_KEY_ADDRESS", "0x1111111111111111111111111111111111111111");
    vi.stubEnv("POLYMARKET_RPC_URL", "https://polygon-rpc.example");

    const config = getPolymarketRuntimeConfigDetails();

    expect(config.builderReady).toBe(true);
    expect(config.gaslessReady).toBe(true);
    expect(config.clobReady).toBe(false);
    expect(config.missingSetupReason).toMatch(/clob trading/i);
  });
});
