import { afterEach, describe, expect, it, vi } from "vitest";
import { getBridgeApiBuilderHeaders } from "@/lib/server/bridgeHeaders";

const loggerMocks = vi.hoisted(() => ({
  logWarn: vi.fn(),
}));

vi.mock("@/lib/server/logger", () => ({
  logWarn: loggerMocks.logWarn,
}));

describe("bridge builder headers", () => {
  afterEach(() => {
    loggerMocks.logWarn.mockReset();
  });

  it("adds the builder code only for Bridge deposit and withdraw endpoints", () => {
    const builderCode = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    expect(getBridgeApiBuilderHeaders("/deposit", builderCode)).toEqual({
      "X-Builder-Code": builderCode,
    });
    expect(getBridgeApiBuilderHeaders("/withdraw", builderCode)).toEqual({
      "X-Builder-Code": builderCode,
    });
    expect(getBridgeApiBuilderHeaders("/orders", builderCode)).toEqual({});
  });

  it("skips invalid builder codes and logs a warning", () => {
    expect(getBridgeApiBuilderHeaders("/deposit", "builder")).toEqual({});
    expect(loggerMocks.logWarn).toHaveBeenCalledWith(
      "server.bridge",
      "bridge_builder_code_invalid",
      expect.objectContaining({
        route: "/deposit",
        builderCodePresent: true,
      }),
    );
  });

  it("does nothing when the builder code is missing", () => {
    expect(getBridgeApiBuilderHeaders("/withdraw", "")).toEqual({});
    expect(loggerMocks.logWarn).not.toHaveBeenCalled();
  });
});
