import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchOrderbook } from "@/lib/polymarket/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const searchSchema = z.object({
  tokenId: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const parsed = searchSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "tokenId is required." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const orderbook = await fetchOrderbook(parsed.data.tokenId);
    return NextResponse.json({ ok: true, orderbook }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load order book." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
