const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const RPC_ERROR_MESSAGE = "POLYMARKET_RPC_URL is missing or invalid. Set a Polygon mainnet RPC URL.";
const SESSION_ERROR_MESSAGE = "POLYMARKET_SESSION_SECRET is missing or invalid. Session-backed trading is not configured on server.";

export type PolymarketRuntimeConfigSummary = {
  builderReady: boolean;
  gaslessReady: boolean;
  clobReady: boolean;
  missingSetupReason: string | null;
  realTradingEnabled: boolean;
};

export type PolymarketRuntimeConfigDetails = PolymarketRuntimeConfigSummary & {
  rpcReady: boolean;
  builderCode: string | null;
  hasClobCreds: boolean;
  hasRelayerCreds: boolean;
  hasSessionSecret: boolean;
};

type ConfigIssue = {
  key: "builder" | "builder_relayer" | "clob" | "rpc";
  message: string;
};

const env = (name: string) => process.env[name]?.trim() ?? "";

const isValidHttpUrl = (value: string | null) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
};

export function getPolymarketRuntimeConfigDetails(): PolymarketRuntimeConfigDetails {
  const builderCode = env("POLYMARKET_BUILDER_CODE") || null;
  const builderApiKey = env("POLYMARKET_BUILDER_API_KEY") || null;
  const builderSecret = env("POLYMARKET_BUILDER_SECRET") || null;
  const builderPassphrase = env("POLYMARKET_BUILDER_PASSPHRASE") || null;
  const rpcUrl = env("POLYMARKET_RPC_URL") || null;
  const sessionSecret = env("POLYMARKET_SESSION_SECRET") || null;

  const builderReady = Boolean(builderCode && BYTES32_RE.test(builderCode));
  const hasRelayerCreds = Boolean(builderApiKey && builderSecret && builderPassphrase);
  const hasSessionSecret = Boolean(sessionSecret && sessionSecret.length >= 32);
  const hasClobCreds = hasSessionSecret;
  const rpcReady = isValidHttpUrl(rpcUrl);

  const issues: ConfigIssue[] = [];
  if (!builderCode) {
    issues.push({ key: "builder", message: "Builder code is missing. Attach a bytes32 builder code to every order." });
  } else if (!BYTES32_RE.test(builderCode)) {
    issues.push({ key: "builder", message: "Builder code is invalid. Expected a bytes32 hex string." });
  }

  if (!hasRelayerCreds) {
    issues.push({
      key: "builder_relayer",
      message: "Builder relayer credentials are missing. Gasless trading is not configured on server.",
    });
  }

  if (!hasClobCreds) {
    issues.push({
      key: "clob",
      message: SESSION_ERROR_MESSAGE,
    });
  }

  if (!rpcReady) {
    issues.push({
      key: "rpc",
      message: RPC_ERROR_MESSAGE,
    });
  }

  return {
    builderReady,
    gaslessReady: hasRelayerCreds && rpcReady,
    clobReady: hasClobCreds,
    missingSetupReason: issues[0]?.message ?? null,
    realTradingEnabled: process.env.ENABLE_REAL_TRADING === "true",
    rpcReady,
    builderCode,
    hasSessionSecret,
    hasClobCreds,
    hasRelayerCreds,
  };
}

export function getPolymarketRuntimeConfigSummary(): PolymarketRuntimeConfigSummary {
  const details = getPolymarketRuntimeConfigDetails();
  return {
    builderReady: details.builderReady,
    gaslessReady: details.gaslessReady,
    clobReady: details.clobReady,
    missingSetupReason: details.missingSetupReason,
    realTradingEnabled: details.realTradingEnabled,
  };
}

export function requireBuilderCode() {
  const builderCode = env("POLYMARKET_BUILDER_CODE");
  if (!builderCode) {
    throw new Error("Builder code is missing on the server.");
  }
  if (!BYTES32_RE.test(builderCode)) {
    throw new Error("Builder code is invalid. Expected a bytes32 hex string.");
  }
  return builderCode;
}

export function requireRelayerAuth() {
  return requireBuilderRelayerAuth();
}

export function requireBuilderRelayerAuth() {
  const builderApiKey = env("POLYMARKET_BUILDER_API_KEY");
  const builderSecret = env("POLYMARKET_BUILDER_SECRET");
  const builderPassphrase = env("POLYMARKET_BUILDER_PASSPHRASE");
  if (!builderApiKey || !builderSecret || !builderPassphrase) {
    throw new Error("Builder relayer credentials are missing. Gasless trading is not configured on server.");
  }
  return { builderApiKey, builderSecret, builderPassphrase };
}

export function requireSessionSecret() {
  const sessionSecret = env("POLYMARKET_SESSION_SECRET");
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error(SESSION_ERROR_MESSAGE);
  }
  return sessionSecret;
}
