import { NextResponse } from "next/server";
import { getCachedMarketCountsSnapshot } from "@/lib/polymarket/markets";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(
      { counts: getCachedMarketCountsSnapshot() },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } },
    );
  } catch (error) {
    logError("api.polymarket.markets.counts", error);
    return NextResponse.json({ error: "Unable to load Polymarket market counts." }, { status: 502 });
  }
}
