import { describe, expect, it } from "vitest";
import { normalizeTradeError } from "@/lib/polymarket/tradeErrors";

describe("normalizeTradeError", () => {
  it("maps raw balance and allowance failures to clean copy", () => {
    expect(normalizeTradeError(new Error("not enough balance / allowance: the balance is not enough -> balance: 0, order amount: 5373130"))).toBe("Not enough balance.");
    expect(normalizeTradeError(new Error("approve to exchange 0xE111180000d2663C0091e4f400237545B87B996B must be MaxUint256"))).toBe("Token approval required. Please try again.");
  });

  it("maps liquidity and market status errors", () => {
    expect(normalizeTradeError(new Error("insufficient liquidity for requested size"))).toBe("Not enough liquidity at this price.");
    expect(normalizeTradeError(new Error("market closed"))).toBe("This market is no longer tradable.");
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(normalizeTradeError(new Error("unexpected upstream failure"))).toBe("Trade could not be completed. Please try again.");
    expect(normalizeTradeError(null)).toBe("Trade could not be completed. Please try again.");
  });
});
