"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, Loader2, RefreshCw, X } from "lucide-react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { erc20Abi, type Address } from "viem";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createSignerClient, SignatureTypeV2 } from "@/lib/polymarket/client";
import { OrderType, placeMarketOrder, Side, isDepositWalletRequiredError } from "@/lib/polymarket/orders";
import { resolveMarketOutcomeLogoUrl } from "@/lib/polymarket/marketDisplay";
import { formatWalletAddress } from "@/src/lib/display";
import { derivePortfolioPositions, type PortfolioPosition } from "@/src/lib/positions";
import {
  ensureTradingReady,
  markDepositWalletRequired,
  resolveTradingWalletContext,
  type TradeProgress,
  type TradingWalletContext,
} from "@/lib/polymarket/tradeSetup";
import { withdrawFromTradingWallet } from "@/lib/polymarket/withdraw";
import type { NormalizedOrderbook } from "@/lib/polymarket/types";
import { resolveTransactionTimestamp, type Transaction, type WalletSyncStatus } from "@/src/lib/storage";
import { getPolymarketExchangeConfig } from "@/lib/polymarket/relayer";

type PortfolioStateResponse = {
  transactions: Transaction[];
  connectedWallets: string[];
  walletSyncStatuses: Record<string, WalletSyncStatus>;
};

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

type PositionsResponse = {
  ok?: boolean;
  positions?: LivePosition[];
  error?: string;
};

type MarketArtworkOption = {
  name: string;
  teamDisplayName?: string | null;
  polymarketParticipantName?: string | null;
  polymarketTeamName?: string | null;
  outcomeLogoUrl?: string | null;
  polymarketParticipantLogoUrl?: string | null;
  polymarketTeamLogoUrl?: string | null;
  participantType?: string | null;
  entityType?: string | null;
};

type MarketArtworkRecord = {
  id?: string;
  title?: string;
  image?: string | null;
  sport?: string | null;
  league?: string | null;
  outcomes?: { yes?: string; no?: string } | Array<{ name?: string }>;
  outcomeOptions?: MarketArtworkOption[];
};

type EnrichedOpenPosition = PortfolioPosition & {
  thumbnailUrl?: string | null;
  liveQuote?: number | null;
  currentValue?: number | null;
  unrealizedPnl?: number | null;
  tokenId?: string | null;
  negativeRisk?: boolean;
  bestBid?: number | null;
  curPrice?: number | null;
};

type SellState = {
  position: EnrichedOpenPosition;
  amount: string;
};

type OrderbookResponse = {
  ok?: boolean;
  orderbook?: NormalizedOrderbook;
  error?: string;
};

type PortfolioSellQuote = {
  bestBid: number | null;
  estimatedReceive: number | null;
  protectionPrice: number | null;
  sellableShares: number;
  hasSufficientLiquidity: boolean;
};

const PORTFOLIO_DEBUG = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PORTFOLIO_DEBUG === "1";

const toLivePortfolioPosition = (position: LivePosition, updatedAt: string): EnrichedOpenPosition =>
  ({
    id: position.tokenId,
    source: "wallet",
    sourceType: "wallet",
    sourceId: position.tokenId,
    walletAddress: undefined,
    connectedWalletAddress: undefined,
    proxyWallet: undefined,
    marketId: position.conditionId || position.tokenId,
    marketTitle: position.title,
    category: undefined,
    side: "BUY",
    outcome: position.outcome as "YES" | "NO",
    shares: position.shares,
    price: position.avgPrice ?? position.curPrice ?? 0,
    fee: undefined,
    timestamp: updatedAt,
    createdAt: updatedAt,
    updatedAt,
    notes: undefined,
    externalTradeId: position.tokenId,
    rawSource: position,
    positionKey: `${position.conditionId || position.tokenId}|${position.tokenId}|${position.outcome}`,
    tradeCount: 1,
    latestFillId: position.tokenId,
    latestActivityTimestamp: updatedAt,
    status: "open",
    liveQuote: position.bestBid ?? position.curPrice ?? null,
    currentValue: position.currentValue ?? null,
    unrealizedPnl: null,
    tokenId: position.tokenId,
    negativeRisk: position.negativeRisk,
    bestBid: position.bestBid ?? null,
    curPrice: position.curPrice ?? null,
    thumbnailUrl: position.thumbnailUrl ?? null,
  }) as EnrichedOpenPosition;

const toUsd = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? Number.NaN)) return "--";
  return `$${(value as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const toPrice = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? Number.NaN)) return "--";
  return `${Math.round((value as number) * 100)}c`;
};

const toShares = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? Number.NaN)) return "--";
  return (value as number).toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const formatCurrency = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? Number.NaN)) return "--";
  return `$${(value as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatCents = (value: number | null | undefined) => {
  if (!Number.isFinite(value ?? Number.NaN)) return "--";
  return `${Math.round((value as number) * 100)}c`;
};

function formatPortfolioSellError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to submit sell order.";
  if (/no orders found to match|fak order|fok order|partially filled or killed|no buyers available|fully filled/i.test(message)) {
    return "Only part of this position can be sold right now. Try a smaller amount or wait for more liquidity.";
  }
  if (/unable to refresh the quote|no sell quote is available/i.test(message)) {
    return "The sell quote changed before submission. Refresh the portfolio and try again.";
  }
  return message;
}

const SELL_EPSILON = 0.000001;

async function fetchPortfolioSellOrderbook(tokenId: string) {
  const response = await fetch(`/api/polymarket/orderbook?tokenId=${encodeURIComponent(tokenId)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as OrderbookResponse | null;
  if (!response.ok || !data?.ok || !data.orderbook) {
    throw new Error(data?.error ?? "Unable to load sell liquidity.");
  }
  return data.orderbook;
}

function buildPortfolioSellQuote(orderbook: NormalizedOrderbook | null, amount: number): PortfolioSellQuote {
  const sortedBids = [...(orderbook?.bids ?? [])].sort((left, right) => right.price - left.price);
  const bestBid = sortedBids[0]?.price ?? null;
  if (!orderbook || !Number.isFinite(amount) || amount <= 0) {
    return {
      bestBid,
      estimatedReceive: null,
      protectionPrice: bestBid,
      sellableShares: 0,
      hasSufficientLiquidity: false,
    };
  }

  let remaining = amount;
  let estimatedReceive = 0;
  let sellableShares = 0;
  let protectionPrice: number | null = null;

  for (const level of sortedBids) {
    if (remaining <= SELL_EPSILON) break;
    if (!Number.isFinite(level.price) || !Number.isFinite(level.size) || level.size <= 0 || level.price <= 0) continue;
    const fillSize = Math.min(level.size, remaining);
    estimatedReceive += fillSize * level.price;
    sellableShares += fillSize;
    remaining -= fillSize;
    protectionPrice = level.price;
  }

  const hasSufficientLiquidity = remaining <= SELL_EPSILON;
  return {
    bestBid,
    estimatedReceive: sellableShares > SELL_EPSILON ? estimatedReceive : null,
    protectionPrice,
    sellableShares,
    hasSufficientLiquidity,
  };
}

const portfolioDebugLog = (...args: unknown[]) => {
  if (!PORTFOLIO_DEBUG) return;
  console.info("[portfolio]", ...args);
};

const positionArtworkKey = (marketId: string | null | undefined, outcome: string | null | undefined) =>
  `${(marketId ?? "").trim().toLowerCase()}|${(outcome ?? "").trim().toLowerCase()}`;

const normalizePositionOutcome = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

function resolvePositionArtworkFromMarket(position: { marketId: string | null; marketTitle: string; outcome: string; thumbnailUrl?: string | null }, market: MarketArtworkRecord | null) {
  const selectedOutcome = market?.outcomeOptions?.find((outcome) => {
    const optionName = normalizePositionOutcome(outcome.name);
    const optionTeamName = normalizePositionOutcome(outcome.teamDisplayName ?? outcome.polymarketParticipantName ?? outcome.polymarketTeamName);
    const positionOutcome = normalizePositionOutcome(position.outcome);
    return optionName === positionOutcome || optionTeamName === positionOutcome;
  });

  const selectedArtwork = market
    ? resolveMarketOutcomeLogoUrl(
        selectedOutcome as never,
        position.outcome,
        {
          title: market.title ?? position.marketTitle,
          image: market.image ?? undefined,
          sport: market.sport ?? undefined,
          league: market.league ?? undefined,
        },
        selectedOutcome?.polymarketParticipantLogoUrl ?? selectedOutcome?.polymarketTeamLogoUrl ?? null,
        null,
      )
    : null;

  portfolioDebugLog("position artwork resolution", {
    marketId: position.marketId,
    title: position.marketTitle,
    outcome: position.outcome,
    marketFound: Boolean(market),
    feedArtworkFields: {
      thumbnailUrl: position.thumbnailUrl ?? null,
      image: (market as { image?: string | null } | null)?.image ?? null,
      logoUrl: null,
      outcomeImage: selectedOutcome?.outcomeLogoUrl ?? null,
      participantLogoUrl: selectedOutcome?.polymarketParticipantLogoUrl ?? null,
      teamLogoUrl: selectedOutcome?.polymarketTeamLogoUrl ?? null,
    },
    selectedArtwork,
    initialsFallbackReason: selectedArtwork ? null : market ? "market artwork path returned no image" : "market object missing",
  });

  return selectedArtwork ?? null;
}

function formatDateTime(value: string | undefined) {
  if (!value) return "--";
  const normalized = resolveTransactionTimestamp({ source: "manual", timestamp: value, rawSource: undefined });
  if (!normalized) return "--";
  return new Date(normalized).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatUtcTime(value: number | null) {
  if (value === null) return "Awaiting refresh";
  return `Updated ${new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })} UTC`;
}

function fallbackPositionInitials(title: string) {
  const words = title
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function PositionAvatar({ title, src, loading }: { title: string; src?: string | null; loading?: boolean }) {
  const [failed, setFailed] = useState(false);
  const fallback = fallbackPositionInitials(title);
  const resolvedSrc = src?.trim() || "";
  const displaySrc = !failed && resolvedSrc ? resolvedSrc : "";

  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/8 bg-slate-900/70 shadow-inner shadow-black/30">
      {loading ? (
        <div className="absolute inset-0 animate-pulse bg-white/5" />
      ) : displaySrc ? (
        <Image
          alt=""
          className="h-full w-full object-cover"
          height={48}
          unoptimized
          onError={() => setFailed(true)}
          src={displaySrc}
          width={48}
        />
      ) : null}
      {!loading && !displaySrc ? (
        <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-slate-100">{fallback}</div>
      ) : null}
    </div>
  );
}

function WalletField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(7,12,24,0.78),rgba(5,10,20,0.92))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 min-w-0 truncate text-sm font-semibold text-slate-100" title={value}>
        {value}
      </p>
    </div>
  );
}

function PositionCard({
  position,
  loadingArtwork = false,
  onSell,
}: {
  position: EnrichedOpenPosition;
  loadingArtwork?: boolean;
  onSell: (position: EnrichedOpenPosition) => void;
}) {
  const quote = position.liveQuote ?? null;
  const currentValue = position.currentValue ?? null;
  const pnl = position.unrealizedPnl ?? null;
  const positivePnl = Number.isFinite(pnl ?? Number.NaN) ? (pnl as number) >= 0 : null;
  const canSell = Boolean(position.tokenId && Number.isFinite(quote ?? Number.NaN) && position.shares > 0);

  return (
    <div className="rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,16,30,0.78),rgba(5,10,20,0.92))] p-5 shadow-[0_20px_50px_rgba(2,6,23,0.24),inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <PositionAvatar title={position.marketTitle} loading={loadingArtwork} src={position.thumbnailUrl} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-slate-50">{position.marketTitle}</p>
              <p className="mt-1 min-w-0 truncate text-sm text-slate-400">{position.outcome}</p>
            </div>
          </div>
          <Badge tone="cyan" className="shrink-0 uppercase tracking-[0.18em]">
            Open
          </Badge>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[20px] border border-white/6 bg-white/[0.03] p-3.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Shares</p>
            <p className="mt-2 text-base font-semibold text-slate-50">{toShares(position.shares)}</p>
          </div>
          <div className="rounded-[20px] border border-white/6 bg-white/[0.03] p-3.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Entry</p>
            <p className="mt-2 text-base font-semibold text-slate-50">{toPrice(position.price)}</p>
          </div>
          <div className="rounded-[20px] border border-white/6 bg-white/[0.03] p-3.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Quote</p>
            <p className="mt-2 text-base font-semibold text-slate-50">{toPrice(quote)}</p>
          </div>
          <div className="rounded-[20px] border border-white/6 bg-white/[0.03] p-3.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Value</p>
            <p className="mt-2 text-base font-semibold text-slate-50">{toUsd(currentValue)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>Updated {formatDateTime(position.latestActivityTimestamp)}</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2">
              {positivePnl === null ? (
                <span className="text-slate-500">PnL unavailable</span>
              ) : (
                <>
                  {positivePnl ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-300" /> : <ArrowDownRight className="h-3.5 w-3.5 text-rose-300" />}
                  <span className={positivePnl ? "text-emerald-200" : "text-rose-200"}>{toUsd(pnl)}</span>
                </>
              )}
            </span>
            <Button
              className="h-8 rounded-full px-3 text-xs"
              disabled={!canSell}
              onClick={() => onSell(position)}
              size="sm"
              type="button"
              variant="outline"
            >
              Sell
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(7,12,24,0.54),rgba(5,10,20,0.76))] px-6 py-10 text-center shadow-[0_16px_40px_rgba(2,6,23,0.16),inset_0_1px_0_rgba(255,255,255,0.03)]">
      <p className="text-[1.65rem] font-semibold tracking-tight text-slate-50">{title}</p>
      {description ? <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p> : null}
    </div>
  );
}

type WithdrawModalProps = {
  open: boolean;
  availableBalance: number | null;
  destinationAddress: string;
  amount: string;
  error: string;
  success: string;
  withdrawing: boolean;
  canSubmit: boolean;
  onClose: () => void;
  onAmountChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSubmit: () => void;
};

function WithdrawModal({
  open,
  availableBalance,
  destinationAddress,
  amount,
  error,
  success,
  withdrawing,
  canSubmit,
  onClose,
  onAmountChange,
  onDestinationChange,
  onSubmit,
}: WithdrawModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md">
      <div className="flex min-h-full items-end justify-center p-3 sm:items-center sm:p-5">
        <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(4,9,19,0.99))] shadow-[0_32px_120px_rgba(2,6,23,0.72),inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Wallet withdrawal</p>
              <h2 className="mt-1 text-[1.85rem] font-semibold tracking-tight text-slate-50">Withdraw funds</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">Move available USDC from your trading wallet to another wallet address.</p>
            </div>
            <Button aria-label="Close withdraw dialog" onClick={onClose} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Available balance</p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-50">
                    {availableBalance === null ? "--" : `$${availableBalance.toFixed(2)}`}
                  </p>
                </div>
                <Badge tone={availableBalance && availableBalance > 0 ? "green" : "slate"} className="uppercase tracking-[0.18em]">
                  {availableBalance && availableBalance > 0 ? "Ready" : "No balance"}
                </Badge>
              </div>
            </div>

            {success ? (
              <div className="flex gap-3 rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-emerald-100">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{success}</p>
                  <p className="mt-1 text-sm text-emerald-100/75">You can close this dialog and refresh the portfolio if needed.</p>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="flex gap-3 rounded-3xl border border-rose-400/20 bg-rose-500/10 p-4 text-rose-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            ) : null}

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-[0.2em] text-slate-500" htmlFor="withdraw-amount">
                  Amount
                </label>
                <Input
                  className="text-base font-medium"
                  id="withdraw-amount"
                  inputMode="decimal"
                  onChange={(event) => onAmountChange(event.target.value)}
                  placeholder="0.00"
                  value={amount}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-[0.2em] text-slate-500" htmlFor="withdraw-destination">
                  Destination wallet
                </label>
                <Input
                  className="text-sm font-medium"
                  id="withdraw-destination"
                  onChange={(event) => onDestinationChange(event.target.value)}
                  placeholder="0x..."
                  value={destinationAddress}
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">Funds are sent directly to the address you enter.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/8 px-6 py-5 sm:flex-row sm:justify-end">
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={success ? false : !canSubmit || withdrawing} onClick={success ? onClose : onSubmit} type="button">
              {withdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {success ? "Done" : "Confirm withdraw"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

type SellModalProps = {
  open: boolean;
  position: EnrichedOpenPosition | null;
  loadingArtwork?: boolean;
  amount: string;
  estimatedProceeds: number | null;
  selectedBid: number | null;
  quoteLoading: boolean;
  tradeProgress: TradeProgress;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onAmountChange: (value: string) => void;
  onSetMax: () => void;
  onSubmit: () => void;
};

function SellModal({
  open,
  position,
  loadingArtwork = false,
  amount,
  estimatedProceeds,
  selectedBid,
  quoteLoading,
  tradeProgress,
  submitting,
  error,
  onClose,
  onAmountChange,
  onSetMax,
  onSubmit,
}: SellModalProps) {
  if (!open || !position) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md">
      <div className="flex min-h-full items-end justify-center p-3 sm:items-center sm:p-5">
        <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99))] shadow-[0_30px_120px_rgba(2,6,23,0.72)]">
          <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <PositionAvatar title={position.marketTitle} loading={loadingArtwork} src={position.thumbnailUrl} />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Position trade</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-50">Sell shares</h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{position.marketTitle}</p>
              </div>
            </div>
            <Button aria-label="Close sell dialog" onClick={onClose} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
              <div className="flex justify-between gap-3 text-sm text-slate-300">
                <span>Outcome</span>
                <span className="font-semibold text-slate-100">{position.outcome}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3 text-sm text-slate-300">
                <span>Best bid</span>
                <span className="font-semibold text-slate-100">{quoteLoading ? "Loading..." : formatCents(selectedBid)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3 text-sm text-slate-300">
                <span>Estimated receive</span>
                <span className="font-semibold text-slate-100">{quoteLoading ? "Loading..." : formatCurrency(estimatedProceeds)}</span>
              </div>
            </div>

            {error ? (
              <div className="flex gap-3 rounded-3xl border border-rose-400/20 bg-rose-500/10 p-4 text-rose-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            ) : null}

            {tradeProgress !== "idle" ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-100">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>
                  {tradeProgress === "checking-wallet"
                    ? "Checking wallet"
                    : tradeProgress === "initializing-trading-wallet"
                      ? "Initializing wallet"
                      : tradeProgress === "checking-balance"
                        ? "Checking balance"
                        : tradeProgress === "approving-trading"
                          ? "Approving"
                          : tradeProgress === "refreshing-quote"
                            ? "Updating quote"
                            : "Submitting order"}
                </span>
              </div>
            ) : null}

            <label className="block text-sm">
              <span className="flex items-center justify-between gap-3 text-slate-300">
                <span>Shares to sell</span>
                <button
                  className="rounded-full border border-cyan-400/25 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200 transition hover:border-cyan-300/45 hover:bg-cyan-400/10"
                  disabled={submitting}
                  onClick={onSetMax}
                  type="button"
                >
                  Max
                </button>
              </span>
              <Input
                className="mt-2 border-slate-800 bg-black text-base font-semibold text-slate-50"
                disabled={submitting}
                max={position.shares}
                min="0"
                onChange={(event) => onAmountChange(event.target.value)}
                step="0.0001"
                type="number"
                value={amount}
              />
              <span className="mt-1 block text-xs text-slate-500">Max {toShares(position.shares)} shares</span>
            </label>
          </div>

          <div className="flex gap-3 border-t border-white/8 px-5 py-4 sm:px-6">
            <Button className="flex-1" onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button className="flex-1" disabled={submitting} onClick={onSubmit} type="button">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sell
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioClient() {
  const { address, chainId, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: 137 });
  const publicClient = usePublicClient({ chainId: 137 });

  const [portfolioState, setPortfolioState] = useState<PortfolioStateResponse | null>(null);
  const [tradingContext, setTradingContext] = useState<TradingWalletContext | null>(null);
  const [livePositions, setLivePositions] = useState<LivePosition[]>([]);
  const [positionArtworkByKey, setPositionArtworkByKey] = useState<Record<string, string | null>>({});
  const [positionArtworkLoadingByKey, setPositionArtworkLoadingByKey] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [walletBalanceRaw, setWalletBalanceRaw] = useState<bigint | null>(null);
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(true);
  const [walletBalanceError, setWalletBalanceError] = useState("");
  const [sellState, setSellState] = useState<SellState | null>(null);
  const [sellError, setSellError] = useState("");
  const [sellOrderbook, setSellOrderbook] = useState<NormalizedOrderbook | null>(null);
  const [sellQuoteLoading, setSellQuoteLoading] = useState(false);
  const [selling, setSelling] = useState(false);
  const [tradeProgress, setTradeProgress] = useState<TradeProgress>("idle");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawDestination, setWithdrawDestination] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawSuccess, setWithdrawSuccess] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const loadPortfolio = useCallback(
    async (mode: "initial" | "refresh" = "refresh") => {
      setError("");
      setNotice("");
      setWalletBalanceError("");
      if (mode === "initial") setLoading(true);
      setRefreshing(true);

      try {
        const portfolioRequest = fetch("/api/portfolio/state", { cache: "no-store" })
          .then(async (response) => (response.ok ? ((await response.json()) as PortfolioStateResponse) : null))
          .catch(() => null);

        const walletContextPromise =
          isConnected && chainId === 137 && walletClient && publicClient && address
            ? resolveTradingWalletContext({
                walletClient,
                address,
                publicClient,
              }).catch(() => null)
            : Promise.resolve(null);

        const [portfolioData, resolvedTradingContext] = await Promise.all([portfolioRequest, walletContextPromise]);
        setPortfolioState(portfolioData);
        setTradingContext(resolvedTradingContext);
        setWalletBalanceLoading(Boolean(resolvedTradingContext));
        portfolioDebugLog("wallet context", {
          connectedWallet: address ?? null,
          resolvedTradingWallet: resolvedTradingContext?.tradingWalletAddress ?? null,
          resolvedDepositWallet: resolvedTradingContext?.depositWalletAddress ?? null,
          walletMode: resolvedTradingContext?.walletMode ?? null,
          proxyWallet: resolvedTradingContext?.proxyWalletAddress ?? null,
        });

        const positionsRequest =
          resolvedTradingContext?.tradingWalletAddress
            ? fetch(`/api/polymarket/positions?user=${encodeURIComponent(resolvedTradingContext.tradingWalletAddress)}`, {
                cache: "no-store",
              })
                .then(async (response) => {
                  const data = (await response.json().catch(() => null)) as PositionsResponse | null;
                  if (!response.ok || !data?.ok) {
                    return [];
                  }
                  return data.positions ?? [];
                })
                .catch(() => [])
            : Promise.resolve([]);

        const positionsData = await positionsRequest;
        setLivePositions(positionsData);
        portfolioDebugLog(
          "positions feed artwork fields",
          positionsData.map((position) => {
            const record = position as Record<string, unknown>;
            const artworkFields = {
              thumbnailUrl: typeof record.thumbnailUrl === "string" ? record.thumbnailUrl : null,
              image: typeof record.image === "string" ? record.image : null,
              imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : null,
              logoUrl: typeof record.logoUrl === "string" ? record.logoUrl : null,
              outcomeLogoUrl: typeof record.outcomeLogoUrl === "string" ? record.outcomeLogoUrl : null,
              marketImage: typeof record.marketImage === "string" ? record.marketImage : null,
              icon: typeof record.icon === "string" ? record.icon : null,
            };
            return {
              marketId: position.conditionId || position.tokenId,
              title: position.title,
              outcome: position.outcome,
              artworkFields,
              missingArtwork: !Object.values(artworkFields).some(Boolean),
            };
          }),
        );
        portfolioDebugLog("positions response", {
          positionsQueryAddress: resolvedTradingContext?.tradingWalletAddress ?? null,
          positionsCount: positionsData.length,
        });
        setLastUpdatedAt(Date.now());

        if (resolvedTradingContext && publicClient) {
          const collateral = getPolymarketExchangeConfig(false).collateral as Address;
          const balanceTimeoutMs = 10000;
          const balanceSourceAddress = resolvedTradingContext.tradingWalletAddress as Address;
          portfolioDebugLog("balance lookup", {
            balanceSourceAddress,
            method: "erc20.balanceOf",
            collateral,
          });
          const balanceTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Wallet balance request timed out.")), balanceTimeoutMs),
          );
          try {
            const balance = await Promise.race([
              publicClient.readContract({
                address: collateral,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [balanceSourceAddress],
              }) as Promise<bigint>,
              balanceTimeout,
            ]);
            setWalletBalanceRaw(typeof balance === "bigint" ? balance : null);
            setWalletBalanceError("");
            portfolioDebugLog("balance result", {
              balanceSourceAddress,
              balance: typeof balance === "bigint" ? balance.toString() : null,
            });
          } catch (balanceError) {
            try {
              const accountTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Wallet balance fallback timed out.")), balanceTimeoutMs),
              );
              const accountResponse = (await Promise.race([
                fetch("/api/polymarket/account", { cache: "no-store" }),
                accountTimeout,
              ])) as Response;
              const accountData = (await accountResponse.json().catch(() => null)) as {
                ok?: boolean;
                balance?: { balance?: string } | null;
                error?: string;
              } | null;
              if (accountResponse.ok && accountData?.ok && accountData.balance?.balance) {
                setWalletBalanceRaw(BigInt(accountData.balance.balance));
                setWalletBalanceError("");
                portfolioDebugLog("balance fallback result", {
                  balanceSourceAddress,
                  balance: accountData.balance.balance,
                  source: "/api/polymarket/account",
                });
              } else {
                setWalletBalanceRaw(null);
                setWalletBalanceError(
                  balanceError instanceof Error ? balanceError.message : accountData?.error ?? "Wallet balance unavailable.",
                );
                portfolioDebugLog("balance unavailable", {
                  balanceSourceAddress,
                  reason:
                    balanceError instanceof Error ? balanceError.message : accountData?.error ?? "Wallet balance unavailable.",
                });
              }
            } catch (accountError) {
              setWalletBalanceRaw(null);
              setWalletBalanceError(
                balanceError instanceof Error
                  ? balanceError.message
                  : accountError instanceof Error
                    ? accountError.message
                    : "Wallet balance unavailable.",
              );
              portfolioDebugLog("balance unavailable", {
                balanceSourceAddress,
                reason:
                  balanceError instanceof Error
                    ? balanceError.message
                    : accountError instanceof Error
                      ? accountError.message
                      : "Wallet balance unavailable.",
              });
            } finally {
              setWalletBalanceLoading(false);
            }
          } finally {
            setWalletBalanceLoading(false);
          }
        } else {
          setWalletBalanceRaw(null);
          setWalletBalanceError(isConnected ? "Trading wallet unavailable." : "");
          setWalletBalanceLoading(false);
          portfolioDebugLog("balance unavailable", {
            balanceSourceAddress: null,
            reason: isConnected ? "Trading wallet unavailable." : "Wallet not connected.",
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load portfolio data.");
        setWalletBalanceError(err instanceof Error ? err.message : "Unable to load wallet balance.");
        setWalletBalanceRaw(null);
        setWalletBalanceLoading(false);
        portfolioDebugLog("portfolio load failed", {
          reason: err instanceof Error ? err.message : "Unable to load portfolio data.",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [address, chainId, isConnected, publicClient, walletClient],
  );

  useEffect(() => {
    void loadPortfolio("initial");
  }, [loadPortfolio]);

  const transactions = useMemo(() => portfolioState?.transactions ?? [], [portfolioState]);
  const derivedPositions = useMemo(() => derivePortfolioPositions(transactions).openPositions, [transactions]);

  const livePositionMap = useMemo(() => {
    const map = new Map<string, LivePosition>();
    for (const position of livePositions) {
      map.set(`${position.title.trim().toLowerCase()}|${position.outcome.trim().toLowerCase()}`, position);
      map.set(position.title.trim().toLowerCase(), position);
    }
    return map;
  }, [livePositions]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const positionsForArtwork = [
      ...livePositions.map((position) => ({
        marketId: position.conditionId || position.tokenId,
        marketTitle: position.title,
        outcome: position.outcome,
        tokenId: position.tokenId,
        feedArtwork: position.thumbnailUrl ?? null,
      })),
      ...derivedPositions.map((position) => ({
        marketId: position.marketId,
        marketTitle: position.marketTitle,
        outcome: position.outcome,
        tokenId: position.latestFillId ?? null,
        feedArtwork: null,
      })),
    ].filter((position) => Boolean(position.marketId));
    const uniqueKeys = new Map<string, { marketId: string; marketTitle: string; outcome: string }>();

    for (const position of positionsForArtwork) {
      const marketId = position.marketId ?? null;
      if (!marketId) continue;
      const key = positionArtworkKey(marketId, position.outcome);
      if (uniqueKeys.has(key)) continue;
      uniqueKeys.set(key, {
        marketId,
        marketTitle: position.marketTitle,
        outcome: position.outcome,
      });
    }

    if (uniqueKeys.size === 0) {
      setPositionArtworkByKey({});
      setPositionArtworkLoadingByKey({});
      return () => {
        active = false;
        controller.abort();
      };
    }

    setPositionArtworkLoadingByKey(
      Object.fromEntries(
        [...uniqueKeys.entries()].map(([key, value]) => {
          const sourcePosition = positionsForArtwork.find(
            (position) => position.marketId === value.marketId && position.outcome === value.outcome,
          );
          return [key, !sourcePosition?.feedArtwork];
        }),
      ),
    );

    setPositionArtworkByKey(
      Object.fromEntries(
        positionsForArtwork
          .filter((position) => Boolean(position.feedArtwork) && Boolean(position.marketId))
          .map((position) => [positionArtworkKey(position.marketId, position.outcome), position.feedArtwork]),
      ),
    );

    void Promise.all(
      [...uniqueKeys.entries()].map(async ([key, value]) => {
        const sourcePosition = positionsForArtwork.find(
          (position) => position.marketId === value.marketId && position.outcome === value.outcome,
        );
        if (sourcePosition?.feedArtwork) {
          portfolioDebugLog("position market lookup", {
            marketId: value.marketId,
            tokenId: sourcePosition.tokenId,
            marketFound: true,
            chosenImageUrl: sourcePosition.feedArtwork,
            initialsFallbackUsed: false,
            fallbackReason: "feed artwork available",
          });
          return [key, sourcePosition.feedArtwork] as const;
        }
        try {
          const response = await fetch(`/api/polymarket/markets/${encodeURIComponent(value.marketId)}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const payload = (await response.json().catch(() => null)) as { market?: MarketArtworkRecord; error?: string } | null;
          const market = response.ok ? (payload?.market ?? null) : null;
          const artwork = resolvePositionArtworkFromMarket(
            { marketId: value.marketId, marketTitle: value.marketTitle, outcome: value.outcome, thumbnailUrl: null },
            market,
          );
          portfolioDebugLog("position market lookup", {
            marketId: value.marketId,
            tokenId: sourcePosition?.tokenId ?? null,
            marketFound: Boolean(market),
            chosenImageUrl: artwork,
            initialsFallbackUsed: !artwork,
            fallbackReason: artwork ? null : market ? "market artwork path returned no image" : "market object missing",
          });
          return [key, artwork] as const;
        } catch {
          portfolioDebugLog("position market lookup", {
            marketId: value.marketId,
            tokenId: sourcePosition?.tokenId ?? null,
            marketFound: false,
            chosenImageUrl: null,
            initialsFallbackUsed: true,
            fallbackReason: "market lookup failed",
          });
          return [key, null] as const;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setPositionArtworkByKey(Object.fromEntries(entries));
      setPositionArtworkLoadingByKey(Object.fromEntries([...uniqueKeys.keys()].map((key) => [key, false])));
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [derivedPositions, livePositions]);

  const liveOpenPositions = useMemo<EnrichedOpenPosition[]>(() => {
    const updatedAt = lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : new Date().toISOString();
    return livePositions
      .map((position) => {
        const value = toLivePortfolioPosition(position, updatedAt);
        const shares = value.shares;
        const quote = value.liveQuote ?? null;
        const currentValue =
          value.currentValue ?? (Number.isFinite(quote ?? Number.NaN) ? shares * (quote as number) : null);
        const unrealizedPnl =
          Number.isFinite(currentValue ?? Number.NaN) ? (currentValue as number) - shares * value.price : null;
        const artworkKey = positionArtworkKey(value.marketId, value.outcome);
        return {
          ...value,
          thumbnailUrl: value.thumbnailUrl ?? positionArtworkByKey[artworkKey] ?? null,
          currentValue,
          unrealizedPnl,
        };
      })
      .sort((left, right) => {
        const leftTime = new Date(resolveTransactionTimestamp(left) ?? left.timestamp).getTime();
        const rightTime = new Date(resolveTransactionTimestamp(right) ?? right.timestamp).getTime();
        return rightTime - leftTime;
      });
  }, [lastUpdatedAt, livePositions, positionArtworkByKey]);

  const openPositions = useMemo<EnrichedOpenPosition[]>(() => {
    const derivedOpenPositions = derivedPositions
      .map((position) => {
        const live =
          livePositionMap.get(`${position.marketTitle.trim().toLowerCase()}|${position.outcome.trim().toLowerCase()}`) ??
          livePositionMap.get(position.marketTitle.trim().toLowerCase()) ??
          null;
        const quote = live?.bestBid ?? live?.curPrice ?? null;
        const currentValue = live?.currentValue ?? (Number.isFinite(quote ?? Number.NaN) ? position.shares * (quote as number) : null);
        const unrealizedPnl = Number.isFinite(currentValue ?? Number.NaN) ? (currentValue as number) - position.shares * position.price : null;
        const artworkKey = positionArtworkKey(position.marketId, position.outcome);
        return {
          ...position,
          thumbnailUrl: positionArtworkByKey[artworkKey] ?? null,
          liveQuote: quote,
          currentValue,
          unrealizedPnl,
          tokenId: live?.tokenId ?? null,
          negativeRisk: live?.negativeRisk ?? false,
          bestBid: live?.bestBid ?? null,
          curPrice: live?.curPrice ?? null,
        };
      })
      .sort((left, right) => {
        const leftTime = new Date(resolveTransactionTimestamp(left) ?? left.timestamp).getTime();
        const rightTime = new Date(resolveTransactionTimestamp(right) ?? right.timestamp).getTime();
        return rightTime - leftTime;
      });
    return liveOpenPositions.length > 0 ? liveOpenPositions : derivedOpenPositions;
  }, [derivedPositions, liveOpenPositions, livePositionMap, positionArtworkByKey]);

  const walletBalance = walletBalanceRaw === null ? null : Number(walletBalanceRaw) / 1_000_000;
  const walletBalanceDisplay = !isConnected
    ? "Connect wallet"
    : walletBalanceLoading
      ? "Balance loading"
      : walletBalanceRaw === null
        ? walletBalanceError || "Unavailable"
        : toUsd(walletBalance);
  const addressSummary = useMemo(() => {
    const connected = address ? formatWalletAddress(address) : "Not connected";
    const trading = tradingContext?.tradingWalletAddress ? formatWalletAddress(tradingContext.tradingWalletAddress) : "Unavailable";
    const deposit = tradingContext?.depositWalletAddress ? formatWalletAddress(tradingContext.depositWalletAddress) : "Unavailable";
    return { connected, trading, deposit };
  }, [address, tradingContext]);

  useEffect(() => {
    if (!sellState?.position.tokenId) {
      setSellOrderbook(null);
      setSellQuoteLoading(false);
      return;
    }

    let active = true;
    setSellQuoteLoading(true);

    void fetchPortfolioSellOrderbook(sellState.position.tokenId)
      .then((orderbook) => {
        if (!active) return;
        setSellOrderbook(orderbook);
      })
      .catch(() => {
        if (!active) return;
        setSellOrderbook(null);
      })
      .finally(() => {
        if (!active) return;
        setSellQuoteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sellState?.position.tokenId]);

  const selectedSellAmount = Number(sellState?.amount ?? 0);
  const sellQuote = useMemo(
    () => buildPortfolioSellQuote(sellOrderbook, selectedSellAmount),
    [sellOrderbook, selectedSellAmount],
  );
  const selectedSellBid = sellQuote.bestBid ?? null;
  const estimatedSellProceeds = sellQuote.estimatedReceive;

  const closeSellModal = useCallback(() => {
    setSellState(null);
    setSellError("");
    setSellOrderbook(null);
    setSellQuoteLoading(false);
    setTradeProgress("idle");
    setSelling(false);
  }, []);

  const submitSell = useCallback(async () => {
    if (!sellState || selling) return;
    const amount = Number(sellState.amount);
    const position = sellState.position;
    const tokenId = position.tokenId ?? "";
    const negativeRisk = Boolean(position.negativeRisk);

    setError("");
    setSellError("");
    setNotice("");

    if (!isConnected || !walletClient || !address) {
      setSellError("Connect a wallet before selling.");
      return;
    }
    if (chainId !== 137) {
      setSellError("Switch to Polygon mainnet before selling.");
      return;
    }
    if (!publicClient) {
      setSellError("Polygon client is unavailable.");
      return;
    }
    if (!tokenId) {
      setSellError("This position is missing a CLOB token id.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setSellError("Enter a share amount greater than 0.");
      return;
    }
    if (amount > position.shares) {
      setSellError("Sell amount cannot exceed available shares.");
      return;
    }

    setSelling(true);
    setSellQuoteLoading(true);
    setTradeProgress("checking-wallet");
    try {
      const orderbook = await fetchPortfolioSellOrderbook(tokenId);
      setSellOrderbook(orderbook);
      const latestQuote = buildPortfolioSellQuote(orderbook, amount);
      if (!Number.isFinite(latestQuote.bestBid ?? Number.NaN) || (latestQuote.bestBid as number) <= 0) {
        throw new Error("No sell quote is available for this position.");
      }
      if (!latestQuote.hasSufficientLiquidity || !Number.isFinite(latestQuote.protectionPrice ?? Number.NaN)) {
        throw new Error("Only part of this position can be sold right now. Try a smaller amount or wait for more liquidity.");
      }

      const executeSell = async () => {
        const setup = await ensureTradingReady({
          walletClient,
          address: address as Address,
          publicClient,
          side: "Sell",
          tokenId,
          amount,
          price: latestQuote.bestBid as number,
          negRisk: negativeRisk,
          onProgress: setTradeProgress,
        });
        const funderAddress = setup.tradingWalletAddress;
        if (!funderAddress) {
          throw new Error("Trading wallet unavailable.");
        }
        const client = await createSignerClient({
          signer: walletClient,
          signatureType: setup.signatureType === 2 ? SignatureTypeV2.POLY_GNOSIS_SAFE : SignatureTypeV2.POLY_1271,
          funderAddress,
        });
        setTradeProgress("submitting-order");
        return placeMarketOrder(client, {
          tokenID: tokenId,
          amount,
          currentPrice: latestQuote.protectionPrice as number,
          maxSlippageBps: 0,
          side: Side.SELL,
          orderType: OrderType.FOK,
          negRisk: negativeRisk,
        });
      };

      const response = await executeSell().catch(async (err) => {
        if (!isDepositWalletRequiredError(err) || !address) throw err;
        markDepositWalletRequired(address as Address);
        return executeSell();
      });

      setNotice(`Sell order ${(response as { status?: string }).status ?? "submitted"}.`);
      closeSellModal();
      await loadPortfolio("refresh");
    } catch (err) {
      setSellError(formatPortfolioSellError(err));
    } finally {
      setSellQuoteLoading(false);
      setSelling(false);
      setTradeProgress("idle");
    }
  }, [address, chainId, closeSellModal, isConnected, loadPortfolio, publicClient, sellState, selling, walletClient]);

  useEffect(() => {
    if (!withdrawOpen) {
      return;
    }
    setWithdrawDestination(address ?? "");
  }, [address, withdrawOpen]);

  const closeWithdrawModal = useCallback(() => {
    setWithdrawOpen(false);
    setWithdrawAmount("");
    setWithdrawDestination("");
    setWithdrawError("");
    setWithdrawSuccess("");
    setWithdrawing(false);
  }, []);

  const openWithdrawModal = useCallback(() => {
    setWithdrawError("");
    setWithdrawSuccess("");
    setWithdrawAmount("");
    setWithdrawDestination(address ?? "");
    setWithdrawOpen(true);
  }, [address]);

  const handleWithdraw = useCallback(async () => {
    if (!isConnected || chainId !== 137 || !walletClient || !publicClient || !address) {
      setWithdrawError("Connect a Polygon wallet before withdrawing.");
      return;
    }
    if (!tradingContext?.tradingWalletAddress) {
      setWithdrawError("Trading wallet unavailable.");
      return;
    }
    if (walletBalanceRaw === null) {
      setWithdrawError("Wallet balance is not loaded yet.");
      return;
    }
    if (walletBalanceRaw <= BigInt(0)) {
      setWithdrawError("No withdrawable balance available.");
      return;
    }

    setWithdrawError("");
    setWithdrawSuccess("");
    setWithdrawing(true);

    try {
      const result = await withdrawFromTradingWallet({
        walletClient,
        publicClient,
        address,
        destinationAddress: withdrawDestination.trim(),
        amount: withdrawAmount.trim(),
        availableBalanceRaw: walletBalanceRaw?.toString() ?? null,
      });
      portfolioDebugLog("withdrawal mode selected", {
        walletMode: result.walletMode,
        tradingWalletAddress: result.tradingWalletAddress,
        destinationAddress: result.destinationAddress,
        amountRaw: result.amountRaw,
      });
      setWithdrawSuccess(`Withdrawal submitted to ${formatWalletAddress(result.destinationAddress)}.`);
      await loadPortfolio("refresh");
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : "Unable to withdraw funds.");
    } finally {
      setWithdrawing(false);
    }
  }, [
    address,
    chainId,
    isConnected,
    loadPortfolio,
    publicClient,
    tradingContext?.tradingWalletAddress,
    walletClient,
    withdrawAmount,
    withdrawDestination,
    walletBalanceRaw,
  ]);

  const canSubmitWithdraw = useMemo(() => {
    if (withdrawing) return false;
    if (!withdrawAmount.trim() || !withdrawDestination.trim()) return false;
    if (!isConnected || chainId !== 137 || !walletClient || !publicClient || !address) return false;
    if (!tradingContext?.tradingWalletAddress) return false;
    return true;
  }, [
    address,
    chainId,
    isConnected,
    publicClient,
    tradingContext?.tradingWalletAddress,
    walletClient,
    withdrawAmount,
    withdrawDestination,
    withdrawing,
  ]);

  const canOpenWithdraw = Boolean(
    isConnected &&
      chainId === 137 &&
      walletClient &&
      publicClient &&
      address &&
      tradingContext?.tradingWalletAddress &&
      !walletBalanceLoading &&
      walletBalanceRaw !== null &&
      walletBalanceRaw > BigInt(0),
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_32%),linear-gradient(180deg,#05070d_0%,#03040a_100%)] text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Traak</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50">Portfolio</h1>
          </div>
          <Button disabled={refreshing} onClick={() => void loadPortfolio("refresh")} size="sm" type="button" variant="secondary">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="mb-4 flex gap-3 rounded-2xl border border-rose-400/25 bg-rose-950/35 p-4 text-sm text-rose-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {notice ? (
          <div className="mb-4 overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-50 shadow-[0_18px_60px_rgba(16,185,129,0.14)]">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="font-medium text-emerald-50">{notice}</p>
                <p className="mt-1 text-xs text-emerald-100/75">You can continue trading while the portfolio refreshes in the background.</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)]">
          <Card className="border-white/8">
            <CardHeader className="border-b border-white/6 px-5 py-5 sm:px-6">
              <CardTitle className="text-base font-semibold text-slate-50">Positions</CardTitle>
              <CardDescription className="mt-1 text-sm text-slate-400">Open positions with live marks when available.</CardDescription>
            </CardHeader>
            <CardContent className="p-5 sm:p-6">
              {loading && transactions.length === 0 ? (
                <div className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-slate-950/50 px-4 py-3.5 text-sm text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                    Loading positions
                  </span>
                </div>
              ) : openPositions.length > 0 ? (
                <div className="space-y-3">
                  {openPositions.map((position) => (
                    <PositionCard
                      key={position.positionKey}
                      loadingArtwork={
                        !position.thumbnailUrl &&
                        (positionArtworkLoadingByKey[positionArtworkKey(position.marketId, position.outcome)] ?? false)
                      }
                      onSell={(selected) => {
                        setSellError("");
                        setSellOrderbook(null);
                        setSellState({ position: selected, amount: String(selected.shares) });
                      }}
                      position={position}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="No open positions" />
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-white/8">
              <CardHeader className="border-b border-white/6 px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold text-slate-50">Wallet</CardTitle>
                    <CardDescription className="mt-1 text-sm text-slate-400">Balances and wallet addresses used for trading.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={isConnected ? "green" : "slate"} className="uppercase tracking-[0.18em]">
                      {isConnected ? "Connected" : "Disconnected"}
                    </Badge>
                    <Button disabled={!canOpenWithdraw} onClick={openWithdrawModal} size="sm" type="button" variant="outline">
                      Withdraw
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <WalletField label="Connected wallet" value={addressSummary.connected} />
                  <WalletField label="Trading wallet" value={addressSummary.trading} />
                  <WalletField label="Deposit wallet" value={addressSummary.deposit} />
                </div>

                <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Wallet balance</p>
                      {walletBalanceLoading ? (
                        <div className="mt-2 h-9 w-28 rounded-2xl border border-white/8 bg-white/[0.05]">
                          <div className="h-full w-full animate-pulse rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        </div>
                      ) : (
                        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">{walletBalanceDisplay}</p>
                      )}
                    </div>
                    {walletBalanceLoading ? (
                      <Badge tone="slate" className="inline-flex items-center gap-2 uppercase tracking-[0.18em]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Syncing
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Clock3 className="h-4 w-4" />
                        <span>{formatUtcTime(lastUpdatedAt)}</span>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {walletBalanceLoading
                      ? "Fetching the live trading wallet balance."
                      : walletBalanceRaw === null
                        ? walletBalanceError || "Connect and refresh to load the live wallet balance."
                        : null}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        <WithdrawModal
          amount={withdrawAmount}
          availableBalance={walletBalance}
          canSubmit={canSubmitWithdraw}
          destinationAddress={withdrawDestination}
          error={withdrawError}
          onAmountChange={setWithdrawAmount}
          onClose={closeWithdrawModal}
          onDestinationChange={setWithdrawDestination}
          onSubmit={handleWithdraw}
          open={withdrawOpen}
          success={withdrawSuccess}
          withdrawing={withdrawing}
        />
        <SellModal
          amount={sellState?.amount ?? ""}
          error={sellError}
          estimatedProceeds={estimatedSellProceeds}
          onAmountChange={(value) => {
            setSellError("");
            setSellState((current) => (current ? { ...current, amount: value } : current));
          }}
          onClose={closeSellModal}
          onSetMax={() => {
            setSellError("");
            setSellState((current) => (current ? { ...current, amount: String(current.position.shares) } : current));
          }}
          onSubmit={() => void submitSell()}
          loadingArtwork={
            sellState
              ? !sellState.position.thumbnailUrl &&
                (positionArtworkLoadingByKey[positionArtworkKey(sellState.position.marketId, sellState.position.outcome)] ?? false)
              : false
          }
          open={Boolean(sellState)}
          position={sellState?.position ?? null}
          quoteLoading={sellQuoteLoading}
          selectedBid={selectedSellBid}
          submitting={selling}
          tradeProgress={tradeProgress}
        />
      </div>
    </main>
  );
}
