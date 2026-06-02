import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { MarketTradePanel } from "@/components/MarketTradePanel";
import type { MarketBubbleNode } from "@/components/MarketBubbleMap";

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  openAccountModal: vi.fn(),
  openChainModal: vi.fn(),
  openConnectModal: vi.fn(),
  createSignerClient: vi.fn(),
  placeMarketOrder: vi.fn(),
  ensureTradingReady: vi.fn(),
  resolveTradingWalletContext: vi.fn(),
  publicClient: {},
  accountState: { chainId: 137, isConnected: true },
  walletClient: { account: { address: "0x1234567890abcdef1234567890abcdef12345678" } },
  connectAccount: {
    displayName: "0xAbC...C64F",
    address: "0x1234567890abcdef1234567890abcdef12345678",
  },
  connectChain: {
    unsupported: false,
  },
  walletContext: {
    depositWalletAddress: "0xdeadbeef",
    depositWalletInitialized: true,
    proxyWalletAddress: "0xsafe",
    proxyDeployed: true,
    tradingWalletAddress: "0xdeadbeef",
    signatureType: 3,
    walletMode: "deposit-wallet",
  },
  tradingSetup: {
    depositWalletAddress: "0xdeadbeef",
    depositWalletInitialized: true,
    proxyWalletAddress: "0xsafe",
    tradingWalletAddress: "0xdeadbeef",
    signatureType: 3,
    walletMode: "deposit-wallet",
    balance: null,
    accountResponse: {},
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: {
    Custom: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) =>
      children({
        account: mocks.connectAccount,
        chain: mocks.connectChain,
        openAccountModal: mocks.openAccountModal,
        openChainModal: mocks.openChainModal,
        openConnectModal: mocks.openConnectModal,
        mounted: true,
      }),
  },
}));

vi.mock("wagmi", () => ({
  useDisconnect: () => ({ disconnect: mocks.disconnect }),
  useAccount: () => mocks.accountState,
  useWalletClient: () => ({ data: mocks.walletClient }),
  usePublicClient: () => mocks.publicClient,
}));

vi.mock("@/lib/polymarket/tradeSetup", () => ({
  ensureTradingReady: mocks.ensureTradingReady,
  resolveTradingWalletContext: mocks.resolveTradingWalletContext,
}));

vi.mock("@/lib/polymarket/client", () => ({
  createSignerClient: mocks.createSignerClient,
  SignatureTypeV2: { POLY_1271: 3, POLY_GNOSIS_SAFE: 2 },
}));

vi.mock("@/lib/polymarket/orders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/polymarket/orders")>("@/lib/polymarket/orders");
  return {
    ...actual,
    placeMarketOrder: mocks.placeMarketOrder,
  };
});

const market: MarketBubbleNode = {
  id: "uefa-champions-league-winner",
  conditionId: "psg-condition",
  title: "UEFA Champions League Winner",
  sport: "Soccer",
  volume: 100000,
  liquidity: 75000,
  priceChange: 0,
  polymarketUrl: "https://polymarket.com/event/uefa-champions-league-winner",
  primaryColor: "#0ea5e9",
  secondaryColor: "#67e8f9",
  glowColor: "rgba(14,165,233,0.5)",
  favoredOutcome: "PSG",
  favoredPrice: 0.59,
  priceCents: 59,
  outcomes: [
    { name: "PSG", price: 0.59, priceCents: 59, tokenId: "111111", marketId: "psg-market", conditionId: "psg-condition" },
    { name: "Arsenal", price: 0.43, priceCents: 43, tokenId: "222221", marketId: "arsenal-market", conditionId: "arsenal-condition" },
  ],
  trendScore: 10,
  isTrending: true,
  driftPhase: 0,
  val: 90,
  targetX: 0,
  targetY: 0,
  x: 0,
  y: 0,
};

describe("wallet and trade UI", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/polymarket/config")) {
          return new Response(JSON.stringify({ ok: true, realTradingEnabled: true, builderReady: true, gaslessReady: true, clobReady: true, missingSetupReason: null }), { status: 200 });
        }
        if (url.includes("/api/polymarket/account")) {
          return new Response(JSON.stringify({ ok: true, balance: { balance: "100000000", allowances: { exchange: "1", conditional: "1" } } }), { status: 200 });
        }
        if (url.includes("/api/markets/enrich")) {
          return new Response(JSON.stringify({ market: null }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    mocks.disconnect.mockReset();
    mocks.openAccountModal.mockReset();
    mocks.openChainModal.mockReset();
    mocks.openConnectModal.mockReset();
    mocks.createSignerClient.mockReset();
    mocks.placeMarketOrder.mockReset();
    mocks.ensureTradingReady.mockReset();
    mocks.resolveTradingWalletContext.mockReset();
    mocks.resolveTradingWalletContext.mockResolvedValue(mocks.walletContext);
    mocks.ensureTradingReady.mockResolvedValue(mocks.tradingSetup);
    mocks.createSignerClient.mockResolvedValue({ client: "signed" });
    mocks.placeMarketOrder.mockResolvedValue({ orderID: "order-1" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens the mobile wallet menu with portfolio and disconnect actions", () => {
    render(<WalletConnectButton />);

    fireEvent.click(screen.getByRole("button", { name: /0xabc\.\.\.c64f/i }));

    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute("href", "/portfolio");
    expect(screen.getByRole("button", { name: "Wallet address" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps desktop wallet button behavior on the normal account modal", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });

    render(<WalletConnectButton />);
    fireEvent.click(screen.getByRole("button", { name: /0xabc\.\.\.c64f/i }));

    expect(mocks.openAccountModal).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link", { name: "Portfolio" })).not.toBeInTheDocument();
  });

  it("shows a single success message that clears cleanly after trade success", async () => {
    render(<MarketTradePanel market={market} onClose={vi.fn()} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/polymarket/config", { cache: "no-store" }));
    fireEvent.click(screen.getByRole("button", { name: /buy psg/i }));

    await waitFor(() => expect(mocks.placeMarketOrder).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Trade placed successfully")).toBeInTheDocument();
    expect(screen.getByText("Your order was submitted.")).toBeInTheDocument();
    expect(screen.getAllByText("Your order was submitted.")).toHaveLength(1);

    await waitFor(() => expect(screen.queryByText("Your order was submitted.")).not.toBeInTheDocument(), {
      timeout: 2500,
    });
  });
});
