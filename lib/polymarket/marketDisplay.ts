import type { TerminalMarket } from "@/lib/polymarket/types";

export const USEFUL_FAVORED_PRICE_MIN = 0.11;
export const USEFUL_FAVORED_PRICE_MAX = 0.94;
export const DEFAULT_MARKET_MIN_VOLUME = 2_000;

const finitePrice = (value: number) => (Number.isFinite(value) ? value : 0);

export type MarketOutcomeVisual = {
  name: string;
  displayName: string;
  logoUrl: string | null;
  fallbackLabel: string;
};

export function getFavoredMarketPrice(market: Pick<TerminalMarket, "yesPrice" | "noPrice">) {
  return Math.max(finitePrice(market.yesPrice), finitePrice(market.noPrice));
}

export function isUsefulFavoredPrice(price: number) {
  return Number.isFinite(price) && price >= USEFUL_FAVORED_PRICE_MIN && price <= USEFUL_FAVORED_PRICE_MAX;
}

export function hasUsefulFavoredPrice(market: Pick<TerminalMarket, "yesPrice" | "noPrice">) {
  return isUsefulFavoredPrice(getFavoredMarketPrice(market));
}

export function marketVolume(market: Pick<TerminalMarket, "volume" | "volume24h">) {
  const volume = Number.isFinite(market.volume) ? market.volume : 0;
  const volume24h = Number.isFinite(market.volume24h) ? market.volume24h : 0;
  return Math.max(volume, volume24h);
}

export function hasMeaningfulLiquidity(market: Pick<TerminalMarket, "liquidity">) {
  return !Number.isFinite(market.liquidity) || market.liquidity > 0;
}

export function isOpenMarket(market: Pick<TerminalMarket, "status" | "tokenIds">) {
  return market.status !== "closed" && Boolean(market.tokenIds?.yes) && Boolean(market.tokenIds?.no);
}

export function isHighValueDiscoveryMarket(market: TerminalMarket, minVolume = DEFAULT_MARKET_MIN_VOLUME) {
  return hasUsefulFavoredPrice(market) && marketVolume(market) >= minVolume && hasMeaningfulLiquidity(market) && isOpenMarket(market);
}

function usefulOddsDistance(market: Pick<TerminalMarket, "yesPrice" | "noPrice">) {
  const price = getFavoredMarketPrice(market);
  if (price >= 0.5 && price <= 0.75) return 0;
  return Math.min(Math.abs(price - 0.5), Math.abs(price - 0.75));
}

export function compareHighValueMarkets(left: TerminalMarket, right: TerminalMarket) {
  const liquidityDelta = right.liquidity - left.liquidity;
  if (Math.abs(liquidityDelta) > 0.0001) return liquidityDelta;

  const volumeDelta = marketVolume(right) - marketVolume(left);
  if (Math.abs(volumeDelta) > 0.0001) return volumeDelta;

  const oddsDelta = usefulOddsDistance(left) - usefulOddsDistance(right);
  if (Math.abs(oddsDelta) > 0.0001) return oddsDelta;

  return left.id.localeCompare(right.id);
}

export function rankHighValueMarkets(markets: TerminalMarket[], minVolume = DEFAULT_MARKET_MIN_VOLUME) {
  return markets.filter((market) => isHighValueDiscoveryMarket(market, minVolume)).sort(compareHighValueMarkets);
}

function cleanLogoUrl(value?: string | null) {
  const url = value?.trim();
  if (!url) return null;
  return /^(https?:\/\/|\/)/i.test(url) ? url : null;
}

function fallbackLabel(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const words = trimmed.replace(/[^a-z0-9\s]/gi, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return trimmed.slice(0, 1).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function outcomeVisualFromOutcome(
  outcome: NonNullable<TerminalMarket["outcomeOptions"]>[number] | undefined,
  fallbackName: string,
): MarketOutcomeVisual {
  const name = outcome?.teamDisplayName?.trim() || outcome?.polymarketParticipantName?.trim() || outcome?.polymarketTeamName?.trim() || outcome?.name?.trim() || fallbackName;
  const logoUrl = cleanLogoUrl(
    outcome?.outcomeLogoUrl ??
      outcome?.polymarketParticipantLogoUrl ??
      outcome?.polymarketTeamLogoUrl ??
      null,
  );

  return {
    name,
    displayName: name,
    logoUrl,
    fallbackLabel: fallbackLabel(name),
  };
}

export function getMarketOutcomeVisuals(market: Pick<TerminalMarket, "outcomeOptions" | "outcomes" | "title">) {
  const outcomeOptions = market.outcomeOptions ?? [];
  const yesOutcome = outcomeOptions[0] ?? { name: market.outcomes.yes };
  const noOutcome = outcomeOptions[1] ?? { name: market.outcomes.no };

  return {
    yes: outcomeVisualFromOutcome(yesOutcome, market.outcomes.yes),
    no: outcomeVisualFromOutcome(noOutcome, market.outcomes.no),
  };
}
