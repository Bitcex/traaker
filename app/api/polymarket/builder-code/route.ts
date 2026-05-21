import { NextResponse } from "next/server";
import { requireBuilderCode } from "@/lib/server/polymarketRuntimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { ok: true, builderCode: requireBuilderCode() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Builder code is missing or invalid.";
    return NextResponse.json(
      { ok: false, code: "POLYMARKET_BUILDER_CODE_INVALID", error: message, details: { message } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
