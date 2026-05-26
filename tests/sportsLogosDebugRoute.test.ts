import { afterEach, describe, expect, it, vi } from "vitest";
import { resetSportsLogoCache } from "@/lib/sports/logoResolver";

describe("/api/sports/logos/debug", () => {
  afterEach(() => {
    resetSportsLogoCache();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns sanitized provider attempts without API secrets", async () => {
    vi.stubEnv("SPORTSMONKS_API_KEY", "sportsmonks-secret");
    vi.stubEnv("THESPORTSDB_API_KEY", "sportsdb-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("api.sportmonks.com")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
        return new Response(
          JSON.stringify({
            teams: [{ strTeam: "Arsenal", strTeamBadge: "https://r2.thesportsdb.com/images/media/team/badge/arsenal.png" }],
          }),
          { status: 200 },
        );
      }),
    );

    const { GET } = await import("@/app/api/sports/logos/debug/route");
    const response = await GET(
      new Request(
        "http://localhost/api/sports/logos/debug?category=Soccer&market=Paris%20Saint-Germain%20FC%20vs.%20Arsenal%20FC&teams=ARS",
      ),
    );
    const body = await response.json();

    expect(body.extractedTeams).toEqual(["Paris Saint-Germain", "Arsenal"]);
    expect(body.mappedOutcomes).toEqual({ ARS: "Arsenal" });
    expect(body.sportsMonksQueries[0].teamName).toBe("Arsenal");
    expect(body.theSportsDbQueries[0].teamName).toBe("Arsenal");
    expect(body.finalResults[0]).toMatchObject({
      outcomeName: "ARS",
      canonicalTeam: "Arsenal",
      logoUrl: "https://r2.thesportsdb.com/images/media/team/badge/arsenal.png",
      source: "thesportsdb",
    });
    expect(JSON.stringify(body)).not.toContain("sportsmonks-secret");
    expect(JSON.stringify(body)).not.toContain("sportsdb-secret");
  });
});
