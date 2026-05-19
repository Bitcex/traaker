"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MarketRows } from "@/components/MarketRows";
import type { MarketPage, MarketQuerySort, MarketQueryStatus, SportsMarketDiscovery } from "@/lib/polymarket/markets";
import type { TerminalMarket } from "@/lib/polymarket/types";

const sports = ["All", "NBA", "NFL", "Soccer", "UFC", "Tennis"] as const;
const statuses = ["all", "live", "upcoming"] as const;
const staleStatus = "stale" as const;
const minVolumeOptions = [
  { label: "$2K+", value: 2000 },
  { label: "$5K+", value: 5000 },
  { label: "$10K+", value: 10000 },
  { label: "$50K+", value: 50000 },
] as const;
const sortOptions: { label: string; value: MarketQuerySort }[] = [
  { label: "Opportunity", value: "opportunity" },
  { label: "Volume", value: "volume" },
  { label: "Liquidity", value: "liquidity" },
  { label: "Movement", value: "movement" },
  { label: "Spread", value: "spread" },
];
const PAGE_LIMIT = 100;

type MarketsResponse = MarketPage & {
  counts: SportsMarketDiscovery["counts"];
  countsLoading?: boolean;
  source: SportsMarketDiscovery["source"];
};

async function readMarketsResponse(response: Response): Promise<MarketsResponse> {
  const payload = (await response.json().catch(() => null)) as (Partial<MarketsResponse> & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Unable to load Polymarket sports markets.");
  }
  if (!payload || !Array.isArray(payload.markets)) {
    throw new Error("Polymarket returned an unexpected sports market response.");
  }
  return payload as MarketsResponse;
}

function buildMarketsUrl(params: {
  offset: number;
  search: string;
  sort: MarketQuerySort;
  sport: string;
  status: MarketQueryStatus;
  minVolume: number;
}) {
  const searchParams = new URLSearchParams({
    limit: String(PAGE_LIMIT),
    offset: String(params.offset),
    minVolume: String(params.minVolume),
    sort: params.sort,
    status: params.status,
  });
  if (params.sport !== "All") searchParams.set("sport", params.sport);
  if (params.search.trim()) searchParams.set("search", params.search.trim());
  return `/api/polymarket/markets?${searchParams.toString()}`;
}

export function MarketsExplorer({
  includeDebugFilters = false,
  initialPage,
  source,
}: {
  includeDebugFilters?: boolean;
  initialPage: MarketPage;
  source: SportsMarketDiscovery["source"];
}) {
  const firstRender = useRef(true);
  const requestIdRef = useRef(0);
  const [sport, setSport] = useState<(typeof sports)[number]>("All");
  const [status, setStatus] = useState<MarketQueryStatus>("all");
  const [sort, setSort] = useState<MarketQuerySort>("volume");
  const [minVolume, setMinVolume] = useState(2000);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [markets, setMarkets] = useState<TerminalMarket[]>(initialPage.markets);
  const [page, setPage] = useState(initialPage);
  const [latestSource, setLatestSource] = useState(source);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (firstRender.current) firstRender.current = false;

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    fetch(buildMarketsUrl({ offset: 0, search: debouncedQuery, sort, sport, status, minVolume }), { signal: controller.signal })
      .then(readMarketsResponse)
      .then((nextPage) => {
        if (requestId !== requestIdRef.current) return;
        setMarkets(nextPage.markets);
        setPage(nextPage);
        setLatestSource(nextPage.source);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.error(error);
          if (requestId === requestIdRef.current) setError(error instanceof Error ? error.message : "Unable to load Polymarket sports markets.");
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setIsLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, minVolume, sort, sport, status]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    setError(null);
    try {
      const response = await fetch(buildMarketsUrl({ offset: markets.length, search: debouncedQuery, sort, sport, status, minVolume }));
      const nextPage = await readMarketsResponse(response);
      setMarkets((current) => [...current, ...nextPage.markets]);
      setPage(nextPage);
      setLatestSource(nextPage.source);
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "Unable to load more Polymarket sports markets.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const statusOptions: MarketQueryStatus[] = includeDebugFilters ? [...statuses, staleStatus] : [...statuses];
  const isInitialLoading = isLoading && markets.length === 0;
  const isRefreshing = isLoading && markets.length > 0;
  const selectedMinVolumeLabel = minVolumeOptions.find((option) => option.value === minVolume)?.label ?? "$2K+";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input className="h-9 w-[min(100vw-1.5rem,360px)] pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Search teams, leagues, outcomes" value={query} />
        </label>
        <div className="flex flex-wrap gap-2">
          {sports.map((item) => (
            <Button key={item} onClick={() => setSport(item)} size="sm" type="button" variant={sport === item ? "default" : "secondary"}>
              {item}
            </Button>
          ))}
        </div>
        {statusOptions.map((item) => (
          <Button key={item} onClick={() => setStatus(item)} size="sm" type="button" variant={status === item ? "outline" : "ghost"}>
            {item === "all" ? "Live + upcoming" : item === "stale" ? "Stale/unknown" : item}
          </Button>
        ))}
        {sortOptions.map((item) => (
          <Button key={item.value} onClick={() => setSort(item.value)} size="sm" type="button" variant={sort === item.value ? "outline" : "ghost"}>
            {item.label}
          </Button>
        ))}
        <select
          className="h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          aria-label="Minimum volume"
          onChange={(event) => setMinVolume(Number(event.target.value))}
          value={minVolume}
        >
          {minVolumeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <p>
          Showing {markets.length} sports markets with {selectedMinVolumeLabel} volume.
        </p>
        <div className="flex items-center gap-2">
          {isRefreshing ? <span className="text-xs text-cyan-200">Refreshing</span> : null}
          {latestSource === "mock" ? <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-200">Mock fallback</span> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-4 text-sm text-rose-100">{error}</div>
      ) : null}

      {isInitialLoading ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-8 text-center text-sm text-slate-400">Loading markets...</div>
      ) : (
        <MarketRows markets={markets} />
      )}

      {page.hasMore && !isLoading ? (
        <div className="flex justify-center">
          <Button disabled={isLoadingMore} onClick={loadMore} type="button" variant="secondary">
            {isLoadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
