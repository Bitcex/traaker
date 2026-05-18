import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMarketSnapshotCache, seedMarketSnapshotCache, type SportsMarketDiscovery } from "@/lib/polymarket/markets";
import type { TerminalMarket } from "@/lib/polymarket/types";

function market(index: number, overrides: Partial<TerminalMarket> = {}): TerminalMarket {
  return {
    id: `market-${index}`,
    conditionId: `condition-${index}`,
    slug: `nba-market-${index}`,
    title: `NBA market ${index}`,
    sport: "Basketball",
    league: "NBA",
    status: index % 2 === 0 ? "live" : "upcoming",
    startTime: "2026-06-01T00:00:00Z",
    endTime: "2026-06-01T03:00:00Z",
    yesPrice: 0.52,
    noPrice: 0.48,
    volume24h: index * 100,
    volume: index * 1000,
    liquidity: index * 50,
    priceMove24h: index / 100,
    volume1wk: index * 1000,
    volumeAcceleration: 1,
    spread: 0.02,
    recentTradesCount: 10,
    opportunityScore: index,
    outcomes: { yes: "YES", no: "NO" },
    tokenIds: { yes: `yes-${index}`, no: `no-${index}` },
    source: "polymarket",
    ...overrides,
  };
}

const markets = Array.from({ length: 3 }, (_, index) => market(index + 1));
const discovery: SportsMarketDiscovery = {
  markets,
  debugMarkets: markets,
  counts: {
    eventPagesFetched: 1,
    eventsFetched: 1,
    rawMarkets: 3,
    sportsMarkets: 3,
    openSportsMarkets: 3,
    tradableMarkets: 3,
    tradableSportsMarkets: 3,
    liveSportsMarkets: 1,
    upcomingSportsMarkets: 2,
    staleOrUnknownSportsMarkets: 0,
    displayedMarkets: 3,
    excludedClosed: 0,
    excludedInactive: 0,
    excludedMissingClobTokenIds: 0,
    excludedNoOrderbook: 0,
    excludedInvalidPrices: 0,
  },
  source: "polymarket",
};

function makeGammaEventPage(page: number) {
  if (page > 0) return [];
  return [
    {
      id: "event-1",
      slug: "nba-event-1",
      title: "NBA event 1",
      category: "Sports",
      closed: false,
      startDate: "2026-06-01T00:00:00Z",
      endDate: "2026-06-01T03:00:00Z",
      markets: [
        {
          id: "market-1",
          conditionId: "condition-1",
          question: "NBA market 1",
          slug: "nba-market-1",
          active: true,
          acceptingOrders: true,
          enableOrderBook: true,
          clobTokenIds: ["yes-1", "no-1"],
          outcomes: ["YES", "NO"],
          outcomePrices: [0.55, 0.45],
          bestAsk: 0.55,
          volume24h: 100,
          liquidity: 200,
          tags: [{ label: "NBA" }],
          category: "Sports",
        },
      ],
    },
  ];
}

async function callMarketsApi(query = "") {
  const { GET } = await import("@/app/api/polymarket/markets/route");
  const response = await GET(new Request(`http://localhost/api/polymarket/markets${query}`));
  return response.json();
}

describe("/api/polymarket/markets", () => {
  beforeEach(() => {
    resetMarketSnapshotCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetMarketSnapshotCache();
  });

  it("respects limit and offset from cached snapshot", async () => {
    seedMarketSnapshotCache(discovery);

    const payload = await callMarketsApi("?limit=1&offset=1");

    expect(payload.limit).toBe(1);
    expect(payload.offset).toBe(1);
    expect(payload.returned).toBe(1);
    expect(payload.total).toBe(3);
    expect(payload.markets[0].id).toBe("market-2");
  });

  it("uses the snapshot cache on the second request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/events?") && url.includes("offset=0")) {
        return new Response(JSON.stringify(makeGammaEventPage(0)), { status: 200 });
      }
      return new Response(JSON.stringify(makeGammaEventPage(1)), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await callMarketsApi("?limit=1");
    const fetchesAfterFirst = fetchMock.mock.calls.length;

    await callMarketsApi("?limit=1");
    expect(fetchMock.mock.calls.length).toBe(fetchesAfterFirst);
  });

  it("does not refetch Gamma for filter changes when the snapshot exists", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/events?") && url.includes("offset=0")) {
        return new Response(JSON.stringify(makeGammaEventPage(0)), { status: 200 });
      }
      return new Response(JSON.stringify(makeGammaEventPage(1)), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await callMarketsApi("?limit=1");
    const fetchesAfterFirst = fetchMock.mock.calls.length;

    await callMarketsApi("?limit=1&sport=NBA&status=live&sort=volume");
    expect(fetchMock.mock.calls.length).toBe(fetchesAfterFirst);
  });

  it("returns stale cache immediately and refreshes in the background", async () => {
    seedMarketSnapshotCache(discovery, Date.now() - 10_000);

    let resolveFetch: (value?: void | PromiseLike<void>) => void = () => undefined;
    const fetchPromise = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => fetchPromise.then(() => new Response(JSON.stringify(makeGammaEventPage(1)), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    const startedAt = Date.now();
    const payload = await callMarketsApi("?limit=1");
    const durationMs = Date.now() - startedAt;

    expect(durationMs).toBeLessThan(250);
    expect(payload.returned).toBe(1);
    expect(fetchMock).toHaveBeenCalled();

    resolveFetch();
    await fetchPromise;
  });
});
