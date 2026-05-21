import { afterEach, describe, expect, it } from "vitest";
import { marketStore } from "@/app/store/marketStore";
import type { TerminalMarket } from "@/lib/polymarket/types";

const market: TerminalMarket = {
  id: "market-1",
  conditionId: "condition-1",
  slug: "lakers-celtics",
  title: "Los Angeles Lakers vs Boston Celtics",
  sport: "Basketball",
  league: "NBA",
  status: "live",
  startTime: "2026-06-01T00:00:00Z",
  endTime: "2026-06-01T03:00:00Z",
  yesPrice: 0.62,
  noPrice: 0.38,
  volume24h: 10_000,
  volume: 250_000,
  liquidity: 75_000,
  priceMove24h: 0.03,
  volume1wk: 350_000,
  volumeAcceleration: 1,
  spread: 0.02,
  recentTradesCount: 24,
  opportunityScore: 72,
  outcomes: { yes: "Lakers", no: "Celtics" },
  tokenIds: { yes: "111", no: "222" },
  source: "polymarket",
};

describe("marketStore", () => {
  afterEach(() => marketStore.reset());

  it("stores snapshots, outcome prices, and selected market state", () => {
    marketStore.setMarketSnapshots([market], { replace: true });
    marketStore.setSelectedMarketId("market-1");

    const state = marketStore.getState();
    expect(state.selectedMarketId).toBe("market-1");
    expect(state.marketsById["market-1"].title).toBe(market.title);
    expect(state.marketValuesById["market-1"].outcomePrices.Lakers).toBe(0.62);
    expect(state.marketIdsByAssetId["111"]).toEqual({ marketId: "market-1", outcomeKey: "yes", outcomeIndex: 0, outcomeName: "Lakers" });
  });

  it("indexes full outcome token ids and updates the matching outcome price", () => {
    marketStore.setMarketSnapshots(
      [
        {
          ...market,
          id: "ucl-winner",
          conditionId: "ucl-condition",
          outcomes: { yes: "PSG", no: "Arsenal" },
          tokenIds: { yes: "psg-token", no: "arsenal-token" },
          outcomeOptions: [
            { name: "PSG", price: 0.59, tokenId: "psg-token" },
            { name: "Arsenal", price: 0.43, tokenId: "arsenal-token" },
          ],
        },
      ],
      { replace: true },
    );

    marketStore.applyClobMessage({
      event_type: "last_trade_price",
      asset_id: "arsenal-token",
      price: "0.44",
      timestamp: "1766789469958",
    });

    const state = marketStore.getState();
    expect(state.marketIdsByAssetId["arsenal-token"]).toEqual({ marketId: "ucl-winner", outcomeKey: "no", outcomeIndex: 1, outcomeName: "Arsenal" });
    expect(state.marketsById["ucl-winner"].outcomeOptions?.[1]).toMatchObject({ name: "Arsenal", price: 0.44, tokenId: "arsenal-token" });
    expect(state.marketValuesById["ucl-winner"].outcomePrices.Arsenal).toBe(0.44);
  });

  it("applies CLOB updates without replacing market identity fields", () => {
    marketStore.setMarketSnapshots([market], { replace: true });
    marketStore.applyClobMessage({
      event_type: "best_bid_ask",
      asset_id: "111",
      best_bid: "0.7",
      best_ask: "0.74",
      timestamp: "1766789469958",
    });

    const state = marketStore.getState();
    expect(state.marketsById["market-1"].id).toBe("market-1");
    expect(state.marketsById["market-1"].conditionId).toBe("condition-1");
    expect(state.marketsById["market-1"].yesPrice).toBe(0.74);
    expect(state.marketValuesById["market-1"].bestBid).toBe(0.7);
    expect(state.marketValuesById["market-1"].lastUpdateTimestamp).toBeGreaterThan(0);
  });

  it("tracks connection state transitions", () => {
    marketStore.setConnectionState("Live");
    expect(marketStore.getState().connectionState).toBe("Live");
    marketStore.setConnectionState("Reconnecting");
    expect(marketStore.getState().connectionState).toBe("Reconnecting");
    marketStore.setConnectionState("Polling");
    expect(marketStore.getState().connectionState).toBe("Polling");
    marketStore.setConnectionState("Offline");
    expect(marketStore.getState().connectionState).toBe("Offline");
  });
});
