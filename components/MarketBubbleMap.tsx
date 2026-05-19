"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type RefAttributes } from "react";
import { forceCollide } from "d3-force";
import { Button } from "@/components/ui/button";
import { findTeamStyle, marketBubbleRadius, momentumGlowColor } from "@/lib/sports/teamStyles";
import type { TerminalMarket } from "@/lib/polymarket/types";
import type { ForceGraphMethods, ForceGraphProps, NodeObject } from "react-force-graph-2d";

type ForceGraphComponent = (
  props: ForceGraphProps<MarketBubbleNode, object> & RefAttributes<ForceGraphMethods<MarketBubbleNode, object>>,
) => ReactElement;

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as unknown as ForceGraphComponent;

export type MarketBubbleNode = {
  id: string;
  name: string;
  title: string;
  sport: string;
  teamKey?: string;
  volume: number;
  liquidity: number;
  priceChange: number;
  yesPrice?: number;
  noPrice?: number;
  marketUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  val: number;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);

const pct = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

const shortName = (title: string) => {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 34) return cleaned;
  return `${cleaned.slice(0, 31).trim()}...`;
};

export function marketToBubbleNode(market: TerminalMarket): MarketBubbleNode {
  const volume = Number.isFinite(market.volume) ? market.volume : market.volume24h;
  const style = findTeamStyle(market.title, `${market.sport} ${market.league}`);
  const val = marketBubbleRadius(volume);

  return {
    id: market.id,
    name: shortName(market.title),
    title: market.title,
    sport: market.league || market.sport,
    volume,
    liquidity: market.liquidity,
    priceChange: market.priceMove24h,
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    marketUrl: `/markets/${market.id}`,
    primaryColor: style.primary,
    secondaryColor: style.secondary,
    glowColor: momentumGlowColor(market.priceMove24h, volume),
    val,
  };
}

function drawBubble(node: NodeObject<MarketBubbleNode>, ctx: CanvasRenderingContext2D, globalScale: number) {
  const radius = node.val;
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const pulse = 1 + Math.sin(Date.now() / 420 + radius) * 0.045;
  const glowRadius = radius * (node.volume >= 1_000_000 ? 2.05 * pulse : 1.65);
  const labelVisible = radius / globalScale > 12;
  const detailVisible = radius / globalScale > 20;

  const glow = ctx.createRadialGradient(x, y, radius * 0.2, x, y, glowRadius);
  glow.addColorStop(0, node.glowColor);
  glow.addColorStop(1, "rgba(15, 23, 42, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  const fill = ctx.createRadialGradient(x - radius * 0.28, y - radius * 0.36, radius * 0.12, x, y, radius);
  fill.addColorStop(0, "rgba(255, 255, 255, 0.6)");
  fill.addColorStop(0.22, `${node.primaryColor}ee`);
  fill.addColorStop(1, `${node.primaryColor}99`);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = Math.max(2, radius * 0.07);
  ctx.strokeStyle = node.secondaryColor;
  ctx.beginPath();
  ctx.arc(x, y, radius - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(x - radius * 0.23, y - radius * 0.35, radius * 0.34, radius * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fill();

  const initials = node.name
    .split(/[\s.:/-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = node.primaryColor.toLowerCase() === "#ffffff" ? "#0f172a" : "#ffffff";
  ctx.font = `700 ${Math.max(10, radius * 0.36)}px sans-serif`;
  ctx.fillText(initials || "TM", x, y - radius * 0.16, radius * 1.15);

  if (!labelVisible) return;

  ctx.font = `700 ${Math.max(8, 11 / globalScale)}px sans-serif`;
  ctx.fillStyle = "#f8fafc";
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = 5 / globalScale;
  ctx.fillText(node.name, x, y + radius * 0.25, radius * 1.55);

  if (detailVisible) {
    ctx.font = `600 ${Math.max(7, 9 / globalScale)}px sans-serif`;
    ctx.fillStyle = "#dbeafe";
    const price = node.yesPrice != null ? `${Math.round(node.yesPrice * 100)}c` : "";
    ctx.fillText(`${price} ${pct(node.priceChange)} ${money(node.volume)}`, x, y + radius * 0.52, radius * 1.55);
  }
  ctx.shadowBlur = 0;
}

export function MarketBubbleMap({
  markets,
  isLoading = false,
  isRefreshing = false,
  onLoadMore,
  hasMore = false,
}: {
  markets: TerminalMarket[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<MarketBubbleNode, object> | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<MarketBubbleNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 680 });

  const nodes = useMemo(() => markets.map(marketToBubbleNode), [markets]);
  const graphData = useMemo(() => ({ nodes, links: [] }), [nodes]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const updateDimensions = () => {
      const rect = node.getBoundingClientRect();
      setDimensions({
        width: Math.max(320, Math.floor(rect.width || window.innerWidth || 1200)),
        height: Math.max(420, Math.floor(rect.height || 680)),
      });
    };
    updateDimensions();
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || typeof graph.d3Force !== "function" || nodes.length === 0) return;
    graph.d3Force("collide", forceCollide<NodeObject<MarketBubbleNode>>((node) => node.val + 6).strength(0.85));
    graph.d3Force("charge")?.strength?.(-25);
    graph.d3Force("center");
    graph.d3ReheatSimulation();
  }, [nodes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedMarket(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNodeClick = useCallback((node: NodeObject<MarketBubbleNode>) => {
    setSelectedMarket(node);
  }, []);

  return (
    <div
      aria-label={`${nodes.length} sports market bubble map`}
      className="relative h-[calc(100vh-9.25rem)] min-h-[460px] overflow-hidden rounded-lg border border-slate-800 bg-slate-950 sm:h-[calc(100vh-8rem)]"
      role="application"
    >
      <div ref={containerRef} className="h-full w-full">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="#020617"
          cooldownTicks={80}
          d3VelocityDecay={0.22}
          enableNodeDrag
          enablePointerInteraction
          linkVisibility={false}
          nodeCanvasObject={drawBubble}
          nodeId="id"
          nodeLabel={(node) => `${node.title} | ${money(node.volume)}`}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, node.val + 4, 0, Math.PI * 2);
            ctx.fill();
          }}
          nodeRelSize={1}
          nodeVal="val"
          onNodeClick={handleNodeClick}
          onNodeHover={(node) => {
            const canvas = containerRef.current?.querySelector("canvas");
            if (canvas) canvas.style.cursor = node ? "pointer" : "default";
          }}
          showPointerCursor
        />
      </div>

      {isLoading ? (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/60 text-sm text-slate-300">Loading sports bubbles...</div>
      ) : null}

      {isRefreshing ? (
        <div className="absolute left-3 top-3 rounded-full border border-cyan-400/30 bg-slate-950/80 px-3 py-1 text-xs text-cyan-100">
          Refreshing
        </div>
      ) : null}

      {hasMore && onLoadMore ? (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <Button onClick={onLoadMore} size="sm" type="button" variant="secondary">
            Load more bubbles
          </Button>
        </div>
      ) : null}

      {nodes.length === 0 && !isLoading ? (
        <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">No sports markets matched this view.</div>
      ) : null}

      {selectedMarket ? (
        <aside className="absolute inset-x-0 bottom-0 max-h-[72%] overflow-y-auto border-t border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur md:inset-x-auto md:bottom-0 md:right-0 md:top-0 md:h-full md:w-96 md:max-h-none md:border-l md:border-t-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{selectedMarket.sport}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-50">{selectedMarket.title}</h2>
            </div>
            <Button aria-label="Close market details" onClick={() => setSelectedMarket(null)} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Volume</p>
              <p className="mt-1 font-semibold text-slate-100">{money(selectedMarket.volume)}</p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Liquidity</p>
              <p className="mt-1 font-semibold text-slate-100">{money(selectedMarket.liquidity)}</p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">YES</p>
              <p className="mt-1 font-semibold text-slate-100">{selectedMarket.yesPrice != null ? `${(selectedMarket.yesPrice * 100).toFixed(1)}c` : "N/A"}</p>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">NO</p>
              <p className="mt-1 font-semibold text-slate-100">{selectedMarket.noPrice != null ? `${(selectedMarket.noPrice * 100).toFixed(1)}c` : "N/A"}</p>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-400">Momentum glow: {pct(selectedMarket.priceChange)}</p>

          {selectedMarket.marketUrl ? (
            <Link
              className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              href={selectedMarket.marketUrl}
            >
              Open market
            </Link>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
