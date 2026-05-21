import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type MockSession = {
  l2?: {
    apiKey: string;
    secret: string;
    passphrase: string;
  };
  walletAddress?: string;
  tradingWalletAddress?: string;
  signatureType?: number;
  createdAt?: number;
  save: () => Promise<void>;
  destroy: () => void;
};

const sessionState = vi.hoisted(() => ({
  session: {
    l2: {
      apiKey: "api-key",
      secret: "secret",
      passphrase: "passphrase",
    },
    walletAddress: "0x1111111111111111111111111111111111111111",
    tradingWalletAddress: "0x2222222222222222222222222222222222222222",
    signatureType: 3,
    createdAt: Date.now(),
    save: vi.fn(async () => undefined),
    destroy: vi.fn(),
  } as MockSession,
}));

vi.mock("@/lib/server/session", () => ({
  getSession: vi.fn(async () => sessionState.session),
  isSessionExpired: vi.fn(() => false),
  clearSession: vi.fn((session) => session.destroy?.()),
}));

describe("Polymarket session auth routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns the active session status without exposing credentials", async () => {
    const { GET } = await import("@/app/api/polymarket/auth/status/route");
    const response = await GET(
      new NextRequest("http://localhost/api/polymarket/auth/status?address=0x1111111111111111111111111111111111111111"),
    );
    const body = await response.json();

    expect(body).toMatchObject({
      ok: true,
      initialized: true,
      walletAddress: "0x1111111111111111111111111111111111111111",
      tradingWalletAddress: "0x2222222222222222222222222222222222222222",
      signatureType: 3,
      hasApiCreds: true,
    });
    expect(body.l2).toBeUndefined();
    expect(body.apiKey).toBeUndefined();
  });

  it("initializes a session-backed L2 credential set for the connected wallet", async () => {
    const deriveResponse = { apiKey: "session-api", secret: "session-secret", passphrase: "session-pass" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/derive-api-key")) {
        return new Response(JSON.stringify(deriveResponse), { status: 200 });
      }
      if (url.includes("/auth/api-key")) {
        return new Response(JSON.stringify(deriveResponse), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    sessionState.session.l2 = undefined;
    sessionState.session.walletAddress = undefined;
    sessionState.session.tradingWalletAddress = undefined;
    sessionState.session.signatureType = undefined;
    sessionState.session.createdAt = undefined;

    const { POST } = await import("@/app/api/polymarket/auth/init/route");
    const response = await POST(
      new NextRequest("http://localhost/api/polymarket/auth/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          POLY_ADDRESS: "0x1111111111111111111111111111111111111111",
          POLY_SIGNATURE: `0x${"ab".repeat(65)}`,
          POLY_TIMESTAMP: "1710000000",
          POLY_NONCE: "1",
          tradingWalletAddress: "0x2222222222222222222222222222222222222222",
          signatureType: 3,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(sessionState.session.l2).toEqual(deriveResponse);
    expect(sessionState.session.walletAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(sessionState.session.tradingWalletAddress).toBe("0x2222222222222222222222222222222222222222");
    expect(sessionState.session.signatureType).toBe(3);
    expect(sessionState.session.save).toHaveBeenCalled();
  });
});
