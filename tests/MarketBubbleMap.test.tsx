import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cleanOutcomeName, formatCents, getFavoredOutcome, MarketBubbleMap, marketToBubbleNode } from "@/components/MarketBubbleMap";
import type { MarketBubbleNode } from "@/components/MarketBubbleMap";
import type { TerminalMarket } from "@/lib/polymarket/types";

type MockForceGraphProps = {
  graphData: { nodes: MarketBubbleNode[] };
  d3AlphaDecay?: number;
  d3VelocityDecay?: number;
  maxZoom?: number;
  minZoom?: number;
  nodeCanvasObject?: (node: MarketBubbleNode, ctx: CanvasRenderingContext2D, globalScale: number) => void;
  nodePointerAreaPaint?: (node: MarketBubbleNode, color: string, ctx: CanvasRenderingContext2D) => void;
  onNodeClick: (node: MarketBubbleNode) => void;
  onNodeHover?: (node: MarketBubbleNode | null, previousNode: MarketBubbleNode | null) => void;
};

type MockForceGraphHandle = {
  d3Force: ReturnType<typeof vi.fn>;
  d3ReheatSimulation: ReturnType<typeof vi.fn>;
};

function createStrictCanvasContext() {
  const gradient = { addColorStop: vi.fn() };
  return {
    canvas: { width: 800, height: 600 },
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    resetTransform: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    createRadialGradient: vi.fn((_: number, __: number, r0: number, ___: number, ____: number, r1: number) => {
      if (!Number.isFinite(r0) || r0 <= 0 || !Number.isFinite(r1) || r1 <= 0) {
        throw new Error(`Invalid gradient radius ${r0}, ${r1}`);
      }
      return gradient;
    }),
    arc: vi.fn((_: number, __: number, radius: number) => {
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new Error(`Invalid arc radius ${radius}`);
      }
    }),
  } as unknown as CanvasRenderingContext2D;
}

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: () =>
      React.forwardRef<MockForceGraphHandle, MockForceGraphProps>(function MockForceGraph(props, ref) {
        React.useImperativeHandle(ref, () => ({
          d3Force: vi.fn(() => ({ strength: vi.fn() })),
          d3ReheatSimulation: vi.fn(),
        }));
        const firstNode = props.graphData.nodes[0];
        if (firstNode?.id === "invalid-node") {
          const invalidNode = {
            ...firstNode,
            driftPhase: Number.NaN,
            priceChange: Number.NaN,
            val: -0.5,
            x: Number.NaN,
            y: Number.NaN,
          };
          props.nodeCanvasObject?.(invalidNode, createStrictCanvasContext(), 0);
          props.nodePointerAreaPaint?.(invalidNode, "#fff", createStrictCanvasContext());
        }
        return (
          <div data-testid="force-graph">
            <span data-testid="graph-config">
              {props.d3VelocityDecay}|{props.d3AlphaDecay}|{props.minZoom}|{props.maxZoom}
            </span>
            <span>{props.graphData.nodes.length} canvas nodes</span>
            {firstNode ? <button onClick={() => props.onNodeClick(firstNode)}>Open first bubble</button> : null}
            {firstNode ? <button onMouseEnter={() => props.onNodeHover?.(firstNode, null)}>Hover first bubble</button> : null}
          </div>
        );
      }),
  };
});

const market: TerminalMarket = {
  id: "market-1",
  conditionId: "condition-1",
  slug: "lakers-celtics",
  title: "Los Angeles Lakers vs Boston Celtics",
  sport: "Basketball",
  league: "NBA",
  status: "live",
  startTime: "2026-06-01T00:00:00Z",
  endTime: "2026-06-01T03:00:00Z",
  yesPrice: 0.62,
  noPrice: 0.38,
  volume24h: 10_000,
  volume: 250_000,
  liquidity: 75_000,
  priceMove24h: 0.03,
  volume1wk: 350_000,
  volumeAcceleration: 1,
  spread: 0.02,
  recentTradesCount: 24,
  opportunityScore: 72,
  outcomes: { yes: "Lakers", no: "Celtics" },
  tokenIds: { yes: "111", no: "222" },
  source: "polymarket",
};

describe("MarketBubbleMap", () => {
  it("converts markets into team-colored bubble nodes", () => {
    const node = marketToBubbleNode(market);
    expect(node.primaryColor).toBe("#552583");
    expect(node.secondaryColor).toBe("#FDB927");
    expect(node.favoredOutcome).toBe("Lakers");
    expect(node.favoredPrice).toBe(0.62);
    expect(node.priceCents).toBe(62);
    expect(node.val).toBeGreaterThanOrEqual(90);
    expect(node.val).toBeLessThanOrEqual(115);
    expect(node.marketUrl).toBe("/markets/market-1");
  });

  it("extracts the favored outcome and formats cents", () => {
    expect(getFavoredOutcome({ ...market, yesPrice: 0.42, noPrice: 0.58 }).name).toBe("Celtics");
    expect(formatCents(0.755)).toBe("76\u00a2");
  });

  it("cleans generic outcome labels into recognizable names", () => {
    expect(cleanOutcomeName("Champion", "Will Oklahoma City Thunder win NBA Finals?")).toBe("Oklahoma City Thunder");
    expect(cleanOutcomeName("Arsenal to win", "Arsenal vs Chelsea")).toBe("Arsenal");
    expect(cleanOutcomeName("Winner", "Real Madrid vs Barcelona")).toBe("Real Madrid");
  });

  it("uses calmer graph physics controls", () => {
    render(<MarketBubbleMap markets={[market]} />);

    expect(screen.getByTestId("graph-config")).toHaveTextContent("0.52|0.04|0.08|2.8");
  });

  it("shows a readable hover tooltip", () => {
    render(<MarketBubbleMap markets={[market]} />);

    fireEvent.mouseMove(screen.getByRole("application"), { clientX: 120, clientY: 90 });
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Hover first bubble" }));

    expect(screen.getByText("Liquidity")).toBeInTheDocument();
    expect(screen.getByText("$75.0k")).toBeInTheDocument();
    expect(screen.getByText("Lakers 62\u00a2")).toBeInTheDocument();
    expect(screen.getByText("+3.0%")).toBeInTheDocument();
  });

  it("opens details when a bubble node is clicked", () => {
    render(<MarketBubbleMap markets={[market]} />);

    fireEvent.click(screen.getByRole("button", { name: "Open first bubble" }));

    expect(screen.getByRole("heading", { name: "Los Angeles Lakers vs Boston Celtics" })).toBeInTheDocument();
    expect(screen.getByText("NBA")).toBeInTheDocument();
    expect(screen.getByText("$250k")).toBeInTheDocument();
    expect(screen.getAllByText("62\u00a2").length).toBeGreaterThan(0);
    expect(screen.getByText("Celtics")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trade market" })).toHaveAttribute("href", "/trade/market-1");
    expect(screen.getByRole("link", { name: "Open details" })).toHaveAttribute("href", "/markets/market-1");
  });

  it("renders invalid tiny node values without negative canvas radii", () => {
    const invalidMarket: TerminalMarket = {
      ...market,
      id: "invalid-node",
      title: "Broken market data",
      yesPrice: Number.NaN,
      noPrice: Number.POSITIVE_INFINITY,
      volume24h: Number.NaN,
      volume: Number.NaN,
      liquidity: Number.NEGATIVE_INFINITY,
      priceMove24h: Number.NaN,
      volumeAcceleration: Number.NaN,
      recentTradesCount: Number.NaN,
      outcomes: { yes: "YES", no: "NO" },
    };
    const node = marketToBubbleNode(invalidMarket);

    expect(node.val).toBeGreaterThanOrEqual(8);
    expect(node.volume).toBe(0);
    expect(node.liquidity).toBe(0);
    expect(node.priceChange).toBe(0);
    expect(() => render(<MarketBubbleMap markets={[invalidMarket]} />)).not.toThrow();
  });
});
