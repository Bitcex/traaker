import { MarketsExplorer } from "@/components/MarketsExplorer";
import { createEmptyMarketPage } from "@/lib/polymarket/markets";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const initialPage = createEmptyMarketPage();

  return (
    <main className="w-screen overflow-hidden bg-[#050505]">
      <MarketsExplorer
        initialPage={initialPage}
        source="polymarket"
      />
    </main>
  );
}
