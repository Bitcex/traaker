import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionState = vi.hoisted(() => ({
  session: {
    l2: {
      apiKey: "session-api-key",
      secret: "c2Vzc2lvbi1zZWNyZXQ=",
      passphrase: "session-passphrase",
    },
    walletAddress: "0x1111111111111111111111111111111111111111",
    tradingWalletAddress: "0x2222222222222222222222222222222222222222",
    signatureType: 3,
    createdAt: Date.now(),
    save: vi.fn(async () => undefined),
    destroy: vi.fn(),
  },
}));

vi.mock("@/lib/server/session", () => ({
  getSession: vi.fn(async () => sessionState.session),
  isSessionExpired: vi.fn(() => false),
  clearSession: vi.fn(),
}));

describe("Polymarket session-backed order route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts the signed order with the active session wallet context", async () => {
    vi.stubEnv("ENABLE_REAL_TRADING", "true");
    vi.stubEnv("POLYMARKET_BUILDER_CODE", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | Headers | undefined;
      const headerRecord =
        headers instanceof Headers
          ? Object.fromEntries(headers.entries())
          : (headers ?? {});
      expect(headerRecord.POLY_ADDRESS).toBe("0x1111111111111111111111111111111111111111");
      expect(headerRecord.POLY_API_KEY).toBe("session-api-key");
      expect(headerRecord.POLY_PASSPHRASE).toBe("session-passphrase");
      expect(String(headerRecord.POLY_SIGNATURE ?? "")).toMatch(/^[-_A-Za-z0-9=]+$/);
      return new Response(JSON.stringify({ success: true, orderID: "order-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("@/app/api/polymarket/order/route");
    const response = await POST(
      new NextRequest("http://localhost/api/polymarket/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: {
            salt: "1",
            maker: "0x2222222222222222222222222222222222222222",
            signer: "0x2222222222222222222222222222222222222222",
            taker: "0x0000000000000000000000000000000000000000",
            tokenId: "111111",
            makerAmount: "100",
            takerAmount: "50",
            side: "BUY",
            signatureType: 3,
            timestamp: "1710000000",
            expiration: "0",
            metadata: `0x${"00".repeat(32)}`,
            builder: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            signature: `0x${"12".repeat(65)}`,
          },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, data: { success: true, orderID: "order-1" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
