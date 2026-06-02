/* eslint-disable @next/next/no-img-element */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PortfolioClient from "@/components/PortfolioClient";

const mocks = vi.hoisted(() => ({
  ensureTradingReady: vi.fn(),
  resolveTradingWalletContext: vi.fn(),
  createSignerClient: vi.fn(),
  placeMarketOrder: vi.fn(),
  withdrawFromTradingWallet: vi.fn(),
  account: {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    chainId: 137,
    isConnected: true,
  },
  walletClient: {
    account: { address: "0x1234567890abcdef1234567890abcdef12345678" },
  },
  publicClient: {
    readContract: vi.fn(),
  },
  tradingContext: {
    depositWalletAddress: "0xdeadbeef",
    depositWalletInitialized: true,
    proxyWalletAddress: "0xsafe",
    proxyDeployed: true,
    walletMode: "deposit-wallet" as "legacy-proxy" | "deposit-wallet",
    tradingWalletAddress: "0xdeadbeef",
    signatureType: 3 as 2 | 3,
  },
  sellSetup: {
    depositWalletAddress: "0xdeadbeef",
    depositWalletInitialized: true,
    proxyWalletAddress: "0xsafe",
    tradingWalletAddress: "0xdeadbeef",
    signatureType: 3 as 2 | 3,
    walletMode: "deposit-wallet" as "legacy-proxy" | "deposit-wallet",
    balance: null,
    accountResponse: null,
  },
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  useWalletClient: () => ({ data: mocks.walletClient }),
  usePublicClient: () => mocks.publicClient,
}));

vi.mock("@/lib/polymarket/tradeSetup", () => ({
  ensureTradingReady: mocks.ensureTradingReady,
  resolveTradingWalletContext: mocks.resolveTradingWalletContext,
  markDepositWalletRequired: vi.fn(),
}));

vi.mock("@/lib/polymarket/client", () => ({
  createSignerClient: mocks.createSignerClient,
  SignatureTypeV2: { POLY_GNOSIS_SAFE: 2, POLY_1271: 3 },
}));

vi.mock("@/lib/polymarket/orders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/polymarket/orders")>("@/lib/polymarket/orders");
  return {
    ...actual,
    placeMarketOrder: mocks.placeMarketOrder,
  };
});

vi.mock("@/lib/polymarket/withdraw", () => ({
  withdrawFromTradingWallet: mocks.withdrawFromTradingWallet,
}));

type LivePosition = {
  tokenId: string;
  conditionId: string;
  title: string;
  outcome: string;
  shares: number;
  avgPrice: number | null;
  currentValue: number | null;
  curPrice: number | null;
  bestBid: number | null;
  negativeRisk: boolean;
  thumbnailUrl?: string | null;
};

const basePosition: LivePosition = {
  tokenId: "111111",
  conditionId: "condition-1",
  title: "Will Spain reach the 2026 FIFA World Cup final?",
  outcome: "Yes",
  shares: 10,
  avgPrice: 0.33,
  currentValue: 3.3,
  curPrice: 0.33,
  bestBid: 0.33,
  negativeRisk: false,
  thumbnailUrl: null,
};

function createPortfolioState() {
  return {
    transactions: [],
    connectedWallets: [],
    walletSyncStatuses: {},
  };
}

function installFetchMock(options?: { positions?: LivePosition[][] }) {
  const positionsQueue = [...(options?.positions ?? [[basePosition]])];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/portfolio/state")) {
      return new Response(JSON.stringify(createPortfolioState()), { status: 200 });
    }
    if (url.includes("/api/polymarket/positions")) {
      const next = positionsQueue.length > 1 ? positionsQueue.shift() : positionsQueue[0];
      return new Response(JSON.stringify({ ok: true, positions: next ?? [] }), { status: 200 });
    }
    if (url.includes("/api/polymarket/account")) {
      return new Response(JSON.stringify({ ok: true, balance: { balance: "10000000" } }), { status: 200 });
    }
    if (url.includes("/api/polymarket/markets/")) {
      return new Response(
        JSON.stringify({
          id: "condition-1",
          title: basePosition.title,
          image: null,
          sport: "Soccer",
          league: "FIFA",
          outcomes: [{ name: "Yes" }, { name: "No" }],
          outcomeOptions: [],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function waitForPortfolioPosition() {
  await waitFor(() => expect(screen.getByText(basePosition.title)).toBeInTheDocument());
}

async function openSellModal() {
  await waitForPortfolioPosition();
  fireEvent.click(screen.getAllByRole("button", { name: "Sell" })[0]);
  await waitFor(() => expect(screen.getByRole("heading", { name: "Sell shares" })).toBeInTheDocument());
}

function clickModalSellButton() {
  fireEvent.click(screen.getAllByRole("button", { name: /^Sell$/ })[1]);
}

describe("Portfolio sell flow", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
    mocks.resolveTradingWalletContext.mockReset();
    mocks.ensureTradingReady.mockReset();
    mocks.createSignerClient.mockReset();
    mocks.placeMarketOrder.mockReset();
    mocks.withdrawFromTradingWallet.mockReset();
    mocks.publicClient.readContract.mockReset();

    mocks.resolveTradingWalletContext.mockResolvedValue(mocks.tradingContext);
    mocks.ensureTradingReady.mockResolvedValue(mocks.sellSetup);
    mocks.createSignerClient.mockResolvedValue({ client: "signed" });
    mocks.placeMarketOrder.mockResolvedValue({ status: "submitted" });
    mocks.withdrawFromTradingWallet.mockResolvedValue({
      walletMode: "deposit-wallet",
      tradingWalletAddress: "0xdeadbeef",
      destinationAddress: mocks.account.address,
      amountRaw: "1000000",
    });
    mocks.publicClient.readContract
      .mockResolvedValueOnce(BigInt(10_000_000))
      .mockResolvedValue(BigInt(7_000_000));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads positions and keeps the mobile sell modal usable", async () => {
    installFetchMock();
    render(<PortfolioClient />);

    await waitForPortfolioPosition();
    expect(screen.getByText("Open positions with live marks when available.")).toBeInTheDocument();

    await openSellModal();
    expect(screen.getByText("Max")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Sell$/ })).toHaveLength(2);
  });

  it("sells max shares and submits a market sell with FOK", async () => {
    installFetchMock({ positions: [[basePosition], []] });
    render(<PortfolioClient />);

    await openSellModal();
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.click(screen.getByText("Max"));
    expect(input).toHaveValue(10);

    clickModalSellButton();

    await waitFor(() => expect(mocks.placeMarketOrder).toHaveBeenCalledTimes(1));
    expect(mocks.placeMarketOrder).toHaveBeenCalledWith(
      { client: "signed" },
      expect.objectContaining({
        tokenID: "111111",
        amount: 10,
        currentPrice: 0.33,
        side: expect.anything(),
        orderType: expect.anything(),
      }),
    );
    const payload = mocks.placeMarketOrder.mock.calls[0]?.[1];
    expect(payload.side).toBe("SELL");
    expect(payload.orderType).toBe("FOK");
  });

  it("sells partial shares", async () => {
    installFetchMock({ positions: [[basePosition], []] });
    render(<PortfolioClient />);

    await openSellModal();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "4" } });
    clickModalSellButton();

    await waitFor(() => expect(mocks.placeMarketOrder).toHaveBeenCalledTimes(1));
    expect(mocks.placeMarketOrder.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        amount: 4,
        currentPrice: 0.33,
        orderType: "FOK",
      }),
    );
  });

  it("blocks insufficient shares", async () => {
    installFetchMock();
    render(<PortfolioClient />);

    await openSellModal();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "11" } });
    clickModalSellButton();

    expect((await screen.findAllByText("Sell amount cannot exceed available shares.")).length).toBeGreaterThan(0);
    expect(mocks.placeMarketOrder).not.toHaveBeenCalled();
  });

  it("blocks zero or empty shares", async () => {
    installFetchMock();
    render(<PortfolioClient />);

    await openSellModal();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "" } });
    clickModalSellButton();

    expect((await screen.findAllByText("Enter a share amount greater than 0.")).length).toBeGreaterThan(0);
    expect(mocks.placeMarketOrder).not.toHaveBeenCalled();
  });

  it("shows a clear liquidity changed error", async () => {
    installFetchMock();
    mocks.placeMarketOrder.mockRejectedValueOnce(new Error("no orders found to match with FOK order"));
    render(<PortfolioClient />);

    await openSellModal();
    clickModalSellButton();

    expect(
      (
        await screen.findAllByText(
          "No buyers are available for that full size at the latest quote. Try fewer shares or wait for liquidity to improve.",
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("refreshes positions and wallet balance after a successful sell", async () => {
    const fetchMock = installFetchMock({ positions: [[basePosition], []] });
    render(<PortfolioClient />);

    await waitForPortfolioPosition();
    expect(screen.getByText("$10.00")).toBeInTheDocument();

    await openSellModal();
    clickModalSellButton();

    await waitFor(() => expect(screen.getByText("No open positions")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("$7.00")).toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([request]) => String(request).includes("/api/polymarket/positions")).length).toBeGreaterThanOrEqual(2);
    expect(mocks.publicClient.readContract).toHaveBeenCalledTimes(2);
  });

  it("still works for an old proxy wallet user", async () => {
    installFetchMock({ positions: [[basePosition], []] });
    mocks.sellSetup = {
      ...mocks.sellSetup,
      signatureType: 2,
      walletMode: "legacy-proxy",
      tradingWalletAddress: "0xproxywallet",
      proxyWalletAddress: "0xproxywallet",
    };
    mocks.ensureTradingReady.mockResolvedValueOnce(mocks.sellSetup);
    render(<PortfolioClient />);

    await openSellModal();
    clickModalSellButton();

    await waitFor(() => expect(mocks.createSignerClient).toHaveBeenCalled());
    expect(mocks.createSignerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        signatureType: 2,
        funderAddress: "0xproxywallet",
      }),
    );
  });

  it("still works for a deposit-wallet user", async () => {
    installFetchMock({ positions: [[basePosition], []] });
    mocks.ensureTradingReady.mockResolvedValueOnce({
      ...mocks.sellSetup,
      signatureType: 3,
      walletMode: "deposit-wallet",
      tradingWalletAddress: "0xdeadbeef",
    });
    render(<PortfolioClient />);

    await openSellModal();
    clickModalSellButton();

    await waitFor(() => expect(mocks.createSignerClient).toHaveBeenCalled());
    expect(mocks.createSignerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        signatureType: 3,
        funderAddress: "0xdeadbeef",
      }),
    );
  });

  it("keeps withdrawal working", async () => {
    installFetchMock();
    render(<PortfolioClient />);

    await waitForPortfolioPosition();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Withdraw funds" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1.00" } });
    fireEvent.change(screen.getByLabelText("Destination wallet"), { target: { value: mocks.account.address } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm withdraw" }));

    await waitFor(() => expect(mocks.withdrawFromTradingWallet).toHaveBeenCalledTimes(1));
  });
});
