import { NextResponse } from "next/server";
import { getPolymarketRuntimeConfigSummary } from "@/lib/server/polymarketRuntimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const summary = getPolymarketRuntimeConfigSummary();
  return NextResponse.json(
    {
      ok: true,
      ...summary,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
