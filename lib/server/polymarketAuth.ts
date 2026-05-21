import "server-only";

import { createHmac } from "node:crypto";
import { requireClobAuth, requireBuilderCode } from "./polymarketRuntimeConfig";

export const getServerBuilderCode = () => {
  return requireBuilderCode();
};

export const getPolymarketServerCreds = () => {
  return requireClobAuth();
};

const decodeBase64Url = (secret: string) => {
  const normalized = secret.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
};

export function buildL2Headers(args: { method: string; requestPath: string; body?: string }) {
  const creds = getPolymarketServerCreds();
  const timestamp = Math.floor(Date.now() / 1000);
  const body = args.body ?? "";
  const message = `${timestamp}${args.method}${args.requestPath}${body}`;
  const signature = createHmac("sha256", decodeBase64Url(creds.secret))
    .update(message)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return {
    POLY_ADDRESS: creds.address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: `${timestamp}`,
    POLY_API_KEY: creds.key,
    POLY_PASSPHRASE: creds.passphrase,
  };
}

export const redactCredential = (value: string | undefined) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : null;
