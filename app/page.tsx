import { MarketsExplorer } from "@/components/MarketsExplorer";
import { DEFAULT_MARKET_MIN_VOLUME, createEmptyMarketPage, getLiveSportsMarketsApiPayload } from "@/lib/polymarket/markets";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let initialPage = createEmptyMarketPage();
  let source: "polymarket" | "mock" = "polymarket";

  try {
    const payload = await getLiveSportsMarketsApiPayload({
      limit: 250,
      offset: 0,
      minVolume: DEFAULT_MARKET_MIN_VOLUME,
      sort: "liquidity",
      status: "all",
    });
    initialPage = {
      markets: payload.markets,
      limit: payload.limit,
      offset: payload.offset,
      total: payload.total,
      returned: payload.returned,
      hasMore: payload.hasMore,
    };
    source = payload.source;
  } catch {
    initialPage = createEmptyMarketPage();
    source = "mock";
  }

  return (
    <main className="w-full overflow-hidden bg-[#05070d]">
      <MarketsExplorer
        initialPage={initialPage}
        source={source}
      />
    </main>
  );
}
