import { logWarn } from "@/lib/server/logger";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export function getBridgeApiBuilderHeaders(pathname: string, builderCode = process.env.POLYMARKET_BUILDER_CODE): Record<string, string> {
  if (!/(^|\/)(deposit|withdraw)$/.test(pathname)) {
    return {};
  }

  const normalized = builderCode?.trim() ?? "";
  if (!normalized) {
    return {};
  }

  if (!BYTES32_RE.test(normalized)) {
    logWarn("server.bridge", "bridge_builder_code_invalid", {
      route: pathname,
      builderCodePresent: true,
    });
    return {};
  }

  return { "X-Builder-Code": normalized };
}
