import { MarketsExplorer } from "@/components/MarketsExplorer";
import { createEmptyMarketPage } from "@/lib/polymarket/markets";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const initialPage = createEmptyMarketPage();

  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-6">
      <MarketsExplorer
        includeDebugFilters={process.env.NODE_ENV !== "production"}
        initialPage={initialPage}
        source="polymarket"
      />
    </main>
  );
}
