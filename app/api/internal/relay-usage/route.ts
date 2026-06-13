import { NextRequest, NextResponse } from "next/server";
import { getRelayUsageForDay, getRelayUsageHistory } from "@/lib/server/relayUsage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UNAUTHORIZED_RESPONSE = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const getRequestedDays = (request: NextRequest) => {
  const rawDays = request.nextUrl.searchParams.get("days");
  if (!rawDays) return 1;

  const parsedDays = Number.parseInt(rawDays, 10);
  if (!Number.isFinite(parsedDays) || parsedDays < 1) {
    throw new Error("days must be a positive integer.");
  }

  return parsedDays;
};

export async function GET(request: NextRequest) {
  const expectedAdminKey = process.env.INTERNAL_ADMIN_KEY;
  const providedAdminKey = request.headers.get("x-admin-key");

  if (!expectedAdminKey || !providedAdminKey || providedAdminKey !== expectedAdminKey) {
    return UNAUTHORIZED_RESPONSE;
  }

  let days = 1;
  try {
    days = getRequestedDays(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const today = await getRelayUsageForDay(date);
  const response = {
    ...today,
    timestamp: now.toISOString(),
  };

  if (days === 1) {
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  }

  const history = await getRelayUsageHistory(days, now);
  return NextResponse.json(
    {
      ...response,
      history,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
