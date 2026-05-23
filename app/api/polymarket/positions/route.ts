import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { POLYMARKET_CLOB_URL } from "@/lib/polymarket/client";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLYMARKET_DATA_API_URL = "https://data-api.polymarket.com";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

type RawPosition = {
  asset?: string;
  conditionId?: string;
  size?: number;
  avgPrice?: number;
  currentValue?: number;
  curPrice?: number;
  title?: string;
  outcome?: string;
  negativeRisk?: boolean;
};

function asNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function getSellQuote(tokenId: string): Promise<number | null> {
  const params = new URLSearchParams({ token_id: tokenId, side: "SELL" });
  const response = await fetch(`${POLYMARKET_CLOB_URL}/price?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { price?: unknown } | null;
  return asNumber(data?.price);
}

export async function GET(request: NextRequest) {
  const parsedUser = addressSchema.safeParse(request.nextUrl.searchParams.get("user"));
  if (!parsedUser.success) {
    return NextResponse.json({ ok: false, error: "A valid user address is required." }, { status: 400 });
  }

  const params = new URLSearchParams({
    user: parsedUser.data,
    sizeThreshold: "0",
    limit: "500",
    sortBy: "TOKENS",
    sortDirection: "DESC",
  });

  try {
    const response = await fetch(`${POLYMARKET_DATA_API_URL}/positions?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = (await response.json().catch(() => null)) as RawPosition[] | { error?: string } | null;
    if (!response.ok || !Array.isArray(data)) {
      const message = data && !Array.isArray(data) && typeof data.error === "string" ? data.error : "Unable to load Polymarket positions.";
      return NextResponse.json({ ok: false, error: message }, { status: response.ok ? 502 : response.status });
    }

    const openPositions = data
      .map((position) => {
        const shares = asNumber(position.size) ?? 0;
        return {
          tokenId: String(position.asset ?? ""),
          conditionId: String(position.conditionId ?? ""),
          title: String(position.title ?? "Polymarket position"),
          outcome: String(position.outcome ?? "Outcome"),
          shares,
          avgPrice: asNumber(position.avgPrice),
          currentValue: asNumber(position.currentValue),
          curPrice: asNumber(position.curPrice),
          negativeRisk: Boolean(position.negativeRisk),
        };
      })
      .filter((position) => position.shares > 0);

    const positions = await Promise.all(
      openPositions.map(async (position) => ({
        ...position,
        bestBid: position.tokenId ? await getSellQuote(position.tokenId).catch(() => null) : null,
      })),
    );

    return NextResponse.json({ ok: true, positions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("api.polymarket.positions", error);
    return NextResponse.json({ ok: false, error: "Unable to load available trades." }, { status: 502 });
  }
}
