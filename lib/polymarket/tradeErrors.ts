const FALLBACK_TRADE_ERROR = "Trade could not be completed. Please try again.";

export function normalizeTradeError(error: unknown): string {
  const rawMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : null;

  if (!rawMessage) {
    return FALLBACK_TRADE_ERROR;
  }

  const message = rawMessage.trim().toLowerCase();

  if (/not enough balance|balance is not enough|insufficient balance/.test(message)) {
    return "Not enough balance.";
  }

  if (/allowance|approve to exchange|maxuint256|approval required/.test(message)) {
    return "Token approval required. Please try again.";
  }

  if (/insufficient liquidity|not enough liquidity|no orders found to match|no buyers available|fok order|fak order|partially filled or killed|fully filled/.test(message)) {
    return "Not enough liquidity at this price.";
  }

  if (/market closed|not tradable|no longer tradable|closed for trading/.test(message)) {
    return "This market is no longer tradable.";
  }

  return FALLBACK_TRADE_ERROR;
}
