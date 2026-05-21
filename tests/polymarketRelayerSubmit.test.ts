import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("/api/polymarket/submit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a gasless-only error when relayer credentials are missing", async () => {
    vi.stubEnv("RELAYER_API_KEY", "");
    vi.stubEnv("RELAYER_API_KEY_ADDRESS", "");
    vi.stubEnv("POLYMARKET_RPC_URL", "https://polygon-rpc.example");

    const { POST } = await import("@/app/api/polymarket/submit/route");
    const response = await POST(
      new NextRequest("http://localhost/api/polymarket/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "GASLESS_TRADING_NOT_CONFIGURED",
      error: expect.stringContaining("Gasless trading is not configured on server."),
    });
  });
});
