import { MarketsExplorer } from "@/components/MarketsExplorer";
import { createEmptyMarketPage } from "@/lib/polymarket/markets";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <main className="w-full overflow-hidden bg-[#05070d]">
      <MarketsExplorer
        initialPage={createEmptyMarketPage()}
        source="polymarket"
      />
    </main>
  );
}
