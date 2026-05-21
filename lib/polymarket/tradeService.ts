import { createL1Headers } from "@polymarket/clob-client-v2";
import type { WalletClient } from "viem";

type SafeJsonResponse = {
  ok?: boolean;
  error?: string;
  tradingWalletAddress?: string | null;
  signatureType?: number | null;
  hasApiCreds?: boolean;
};

const safeJson = async <T,>(response: Response): Promise<T | null> => {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

export async function ensureTradingSession(
  signer: WalletClient,
  chainId = 137,
  options?: {
    force?: boolean;
    tradingWalletAddress?: string | null;
    signatureType?: number | null;
  },
) {
  const address =
    signer.account?.address ??
    (await signer.getAddresses()).find((item) => Boolean(item)) ??
    null;
  if (!address) {
    throw new Error("Unable to resolve connected wallet address.");
  }
  if (!options?.force) {
    const statusParams = new URLSearchParams({ address });
    const statusRes = await fetch(`/api/polymarket/auth/status?${statusParams.toString()}`, {
      cache: "no-store",
    });
    const statusData = await safeJson<SafeJsonResponse>(statusRes);
    const sessionMatchesTradingContext =
      (!options?.tradingWalletAddress ||
        statusData?.tradingWalletAddress?.toLowerCase() ===
          options.tradingWalletAddress.toLowerCase()) &&
      (!options?.signatureType || statusData?.signatureType === options.signatureType);
    if (statusRes.ok && statusData?.ok && sessionMatchesTradingContext) return true;
    if (statusRes.ok && statusData?.hasApiCreds && statusData.ok && !sessionMatchesTradingContext) {
      console.info("[polymarket]", {
        event: "trading_session_context_refresh",
        component: "trade_service",
        connectedEoa: address,
        tradingWalletAddress: options?.tradingWalletAddress ?? null,
        signatureType: options?.signatureType ?? null,
        hasApiCreds: statusData.hasApiCreds,
      });
    }
  }

  const l1Headers = await createL1Headers(
    signer as Parameters<typeof createL1Headers>[0],
    chainId,
  );
  const initRes = await fetch("/api/polymarket/auth/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...l1Headers,
      forceRefresh: options?.force === true,
      tradingWalletAddress: options?.tradingWalletAddress ?? undefined,
      signatureType: options?.signatureType ?? undefined,
    }),
  });
  const initData = await safeJson<{ ok?: boolean; error?: string }>(initRes);
  if (!initRes.ok || !initData?.ok) {
    throw new Error(initData?.error ?? "Unable to initialize trading session.");
  }
  return true;
}
