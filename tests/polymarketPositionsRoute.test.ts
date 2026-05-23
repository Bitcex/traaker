import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

async function callPositionsApi(query: string) {
  const { GET } = await import("@/app/api/polymarket/positions/route");
  return GET(new NextRequest(`http://localhost/api/polymarket/positions${query}`));
}

describe("/api/polymarket/positions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires a valid user address", async () => {
    const response = await callPositionsApi("?user=bad-address");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ ok: false });
  });

  it("returns open Data API positions with CLOB sell quotes", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.includes("data-api.polymarket.com/positions")) {
          return new Response(
            JSON.stringify([
              {
                asset: "123456",
                conditionId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                size: 12.5,
                avgPrice: 0.4,
                currentValue: 5,
                curPrice: 0.41,
                title: "Will Team A win?",
                outcome: "YES",
                negativeRisk: false,
              },
              {
                asset: "789",
                conditionId: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                size: 0,
                title: "Closed out",
                outcome: "NO",
              },
            ]),
            { status: 200 },
          );
        }
        if (url.includes("clob.polymarket.com/price")) {
          return new Response(JSON.stringify({ price: 0.39 }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
      }),
    );

    const response = await callPositionsApi("?user=0x1234567890abcdef1234567890abcdef12345678");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.positions).toEqual([
      expect.objectContaining({
        tokenId: "123456",
        title: "Will Team A win?",
        outcome: "YES",
        shares: 12.5,
        bestBid: 0.39,
      }),
    ]);
    const positionsUrl = new URL(requestedUrls[0]);
    expect(positionsUrl.searchParams.get("user")).toBe("0x1234567890abcdef1234567890abcdef12345678");
    expect(positionsUrl.searchParams.get("sizeThreshold")).toBe("0");
    const priceUrl = new URL(requestedUrls[1]);
    expect(priceUrl.searchParams.get("token_id")).toBe("123456");
    expect(priceUrl.searchParams.get("side")).toBe("SELL");
  });
});
