import { NextResponse } from "next/server";
import { extractMarketTeams } from "@/lib/sports/marketTeamExtractor";
import { resolveSportsLogoWithDebug } from "@/lib/sports/logoResolver";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";

function parseTeams(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((team) => team.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const category = searchParams.get("category")?.trim() || "Soccer";
    const sport = searchParams.get("sport")?.trim() || category;
    const marketTitle = searchParams.get("market")?.trim() || searchParams.get("marketTitle")?.trim() || "";
    const teams = parseTeams(searchParams.get("teams"));

    const extraction = extractMarketTeams({
      marketTitle,
      category,
      sport,
      outcomes: teams,
    });

    const resolved = await Promise.all(
      teams.map(async (outcomeName) => {
        const canonicalTeam = extraction.outcomeTeamMap[outcomeName];
        if (!canonicalTeam) {
          return {
            outcomeName,
            canonicalTeam: null,
            result: {
              logoUrl: null,
              teamName: outcomeName,
              teamDisplayName: outcomeName,
              source: "fallback",
              logoSource: "fallback",
              confidence: "fallback",
            },
            debug: {
              sportsMonksQueries: [],
              sportsMonksMatches: [],
              theSportsDbQueries: [],
              theSportsDbMatches: [],
              finalResults: [],
            },
          };
        }

        const { result, debug } = await resolveSportsLogoWithDebug({
          category,
          sport,
          marketTitle,
          outcomeName: canonicalTeam,
        });
        return { outcomeName, canonicalTeam, result, debug };
      }),
    );

    return NextResponse.json(
      {
        category,
        sport,
        marketTitle,
        extractedTeams: extraction.canonicalTeams,
        mappedOutcomes: extraction.outcomeTeamMap,
        sportsMonksQueries: resolved.flatMap((item) => item.debug.sportsMonksQueries),
        sportsMonksMatches: resolved.flatMap((item) => item.debug.sportsMonksMatches),
        theSportsDbQueries: resolved.flatMap((item) => item.debug.theSportsDbQueries),
        theSportsDbMatches: resolved.flatMap((item) => item.debug.theSportsDbMatches),
        finalResults: resolved.map((item) => ({
          outcomeName: item.outcomeName,
          canonicalTeam: item.canonicalTeam,
          ...item.result,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logError("api.sports.logos.debug", error);
    return NextResponse.json({ error: "Unable to debug sports logos." }, { status: 502 });
  }
}
