import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const incrementRelayUsageForToday = vi.fn();

const builderHeaders = {
  POLY_BUILDER_API_KEY: "builder-key",
  POLY_BUILDER_SIGNATURE: "builder-signature",
  POLY_BUILDER_TIMESTAMP: "1710000000",
  POLY_BUILDER_PASSPHRASE: "builder-passphrase",
};

vi.mock("@/lib/server/relayUsage", () => ({
  incrementRelayUsageForToday,
}));

vi.mock("@polymarket/builder-signing-sdk", () => ({
  BuilderSigner: vi.fn().mockImplementation(() => ({
    createBuilderHeaderPayload: vi.fn(() => builderHeaders),
  })),
}));

describe("relay usage tracking", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("increments daily usage after a successful relayer submit", async () => {
    vi.stubEnv("POLYMARKET_BUILDER_API_KEY", "builder-key");
    vi.stubEnv("POLYMARKET_BUILDER_SECRET", "builder-secret");
    vi.stubEnv("POLYMARKET_BUILDER_PASSPHRASE", "builder-passphrase");

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ transactionID: "tx-1", state: "STATE_NEW" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/polymarket/submit/route");
    const response = await POST(
      new NextRequest("http://localhost/api/polymarket/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "WALLET-CREATE",
          from: "0x1111111111111111111111111111111111111111",
          to: "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(incrementRelayUsageForToday).toHaveBeenCalledTimes(1);
  });

  it("does not increment usage when the relayer rejects the request", async () => {
    vi.stubEnv("POLYMARKET_BUILDER_API_KEY", "builder-key");
    vi.stubEnv("POLYMARKET_BUILDER_SECRET", "builder-secret");
    vi.stubEnv("POLYMARKET_BUILDER_PASSPHRASE", "builder-passphrase");

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "bad request" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/polymarket/submit/route");
    const response = await POST(
      new NextRequest("http://localhost/api/polymarket/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "WALLET-CREATE",
          from: "0x1111111111111111111111111111111111111111",
          to: "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(incrementRelayUsageForToday).not.toHaveBeenCalled();
  });
});
