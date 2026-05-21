import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeGammaMarket } from "@/lib/polymarket/markets";

const validSportsMarket = {
  id: "123",
  conditionId: "0xabc",
  question: "NBA: Knicks beat Celtics?",
  slug: "nba-knicks-celtics",
  active: true,
  closed: false,
  enableOrderBook: true,
  outcomes: JSON.stringify(["Knicks", "Celtics"]),
  outcomePrices: JSON.stringify(["0.52", "0.48"]),
  clobTokenIds: JSON.stringify(["111", "222"]),
  volume24hr: 10000,
  volume1wk: 35000,
  liquidity: 50000,
  bestAsk: 0.53,
  bestBid: 0.51,
  eventStartTime: "2026-06-01T00:00:00Z",
  endDate: "2026-06-01T03:00:00Z",
  tags: JSON.stringify([{ label: "Sports" }]),
};

describe("normalizeGammaMarket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes active sports markets from Gamma shape", () => {
    const market = normalizeGammaMarket(validSportsMarket);

    expect(market).not.toBeNull();
    expect(market?.conditionId).toBe("0xabc");
    expect(market?.tokenIds.yes).toBe("111");
    expect(market?.outcomes.no).toBe("Celtics");
    expect(market?.sport).toBe("Basketball");
    expect(market?.spread).toBeCloseTo(0.02);
  });

  it("keeps real multi-outcome names, prices, and token ids together", () => {
    const market = normalizeGammaMarket({
      ...validSportsMarket,
      id: "ucl-winner",
      conditionId: "0xucl",
      question: "UEFA Champions League Winner",
      slug: "uefa-champions-league-winner",
      outcomes: JSON.stringify(["PSG", "Arsenal"]),
      outcomePrices: JSON.stringify([0.59, 0.43]),
      clobTokenIds: JSON.stringify(["psg-token", "arsenal-token"]),
      bestAsk: undefined,
      bestBid: undefined,
      tags: JSON.stringify([{ label: "Soccer" }, { label: "Champions League" }]),
    });

    expect(market).not.toBeNull();
    expect(market?.outcomes.yes).toBe("PSG");
    expect(market?.outcomes.no).toBe("Arsenal");
    expect(market?.yesPrice).toBe(0.59);
    expect(market?.noPrice).toBe(0.43);
    expect(market?.tokenIds.yes).toBe("psg-token");
    expect(market?.tokenIds.no).toBe("arsenal-token");
    expect(market?.outcomeOptions).toEqual([
      { name: "PSG", price: 0.59, tokenId: "psg-token" },
      { name: "Arsenal", price: 0.43, tokenId: "arsenal-token" },
    ]);
  });

  it("uses tokens outcome names when the outcomes array is missing", () => {
    const market = normalizeGammaMarket({
      ...validSportsMarket,
      question: "UEFA Champions League Winner",
      slug: "uefa-champions-league-winner",
      outcomes: undefined,
      outcomePrices: JSON.stringify([0.59, 0.43]),
      clobTokenIds: undefined,
      tokens: [
        { outcome: "PSG", token_id: "psg-token" },
        { outcome: "Arsenal", token_id: "arsenal-token" },
      ],
      tags: JSON.stringify([{ label: "Soccer" }, { label: "Champions League" }]),
    });

    expect(market).not.toBeNull();
    expect(market?.outcomeOptions?.map((outcome) => `${outcome.name}:${outcome.price}:${outcome.tokenId}`)).toEqual([
      "PSG:0.59:psg-token",
      "Arsenal:0.43:arsenal-token",
    ]);
  });

  it("prefers token outcome names over title-derived fallback outcomes", () => {
    const market = normalizeGammaMarket({
      ...validSportsMarket,
      question: "UEFA Champions League Winner",
      slug: "uefa-champions-league-winner",
      outcomes: JSON.stringify(["UEFA", "UEFA 2"]),
      outcomePrices: JSON.stringify([0.59, 0.43]),
      clobTokenIds: JSON.stringify(["psg-token", "arsenal-token"]),
      tokens: [
        { outcome: "PSG", token_id: "psg-token" },
        { outcome: "Arsenal", token_id: "arsenal-token" },
      ],
      tags: JSON.stringify([{ label: "Soccer" }, { label: "Champions League" }]),
    });

    expect(market?.outcomeOptions?.map((outcome) => outcome.name)).toEqual(["PSG", "Arsenal"]);
    expect(market?.outcomes.yes).toBe("PSG");
    expect(market?.outcomes.no).toBe("Arsenal");
  });

  it("filters inactive or non-sports markets", () => {
    expect(normalizeGammaMarket({ ...validSportsMarket, question: "Will it rain?", slug: "weather-rain", tags: JSON.stringify([]) })).toBeNull();
    expect(normalizeGammaMarket({ ...validSportsMarket, active: false })).toBeNull();
  });

  it("excludes closed markets", () => {
    expect(normalizeGammaMarket({ ...validSportsMarket, closed: true })).toBeNull();
  });

  it("excludes inactive markets", () => {
    expect(normalizeGammaMarket({ ...validSportsMarket, active: false })).toBeNull();
  });

  it("excludes markets missing clobTokenIds", () => {
    expect(normalizeGammaMarket({ ...validSportsMarket, clobTokenIds: JSON.stringify(["111"]) })).toBeNull();
    expect(normalizeGammaMarket({ ...validSportsMarket, clobTokenIds: undefined })).toBeNull();
  });

  it("excludes markets with invalid prices", () => {
    expect(normalizeGammaMarket({ ...validSportsMarket, outcomePrices: JSON.stringify(["bad", "0.48"]) })).toBeNull();
    expect(normalizeGammaMarket({ ...validSportsMarket, outcomePrices: JSON.stringify(["1", "0"]) })).toBeNull();
  });

  it("includes valid active sports markets", () => {
    expect(normalizeGammaMarket(validSportsMarket)).not.toBeNull();
  });

  it("classifies future startTime as upcoming", () => {
    expect(normalizeGammaMarket({ ...validSportsMarket, eventStartTime: "2026-05-19T12:00:00Z" })?.status).toBe("upcoming");
  });

  it("classifies past startTime with no close as live", () => {
    expect(normalizeGammaMarket({ ...validSportsMarket, eventStartTime: "2026-05-18T10:00:00Z", endDate: "2026-05-18T15:00:00Z" })?.status).toBe("live");
  });

  it("classifies ended markets as stale", () => {
    expect(normalizeGammaMarket({ ...validSportsMarket, eventStartTime: "2026-05-18T08:00:00Z", endDate: "2026-05-18T10:00:00Z" })?.status).toBe("stale");
  });

  it("classifies missing startTime as stale or unknown", () => {
    const market = normalizeGammaMarket({ ...validSportsMarket, eventStartTime: undefined, startDate: undefined, events: undefined });
    expect(market?.status).toBe("stale");
  });

  it("uses event-level startDate when market-level date is missing", () => {
    const market = normalizeGammaMarket({
      ...validSportsMarket,
      eventStartTime: undefined,
      startDate: undefined,
      events: [{ startDate: "2026-05-19T12:00:00Z", endDate: "2026-05-19T15:00:00Z", tags: [{ label: "Sports" }] }],
    });

    expect(market?.status).toBe("upcoming");
    expect(market?.startTime).toBe("2026-05-19T12:00:00.000Z");
  });
});
