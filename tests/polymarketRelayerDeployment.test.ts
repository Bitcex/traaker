import { afterEach, describe, expect, it, vi } from "vitest";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import { ensureDepositWalletDeployed } from "@/lib/polymarket/relayer";

function createClient(overrides: Partial<RelayClient> = {}) {
  const walletAddress = "0x1111111111111111111111111111111111111111";
  return {
    signer: {
      getAddress: vi.fn(async () => walletAddress),
    },
    contractConfig: {
      DepositWalletContracts: {
        DepositWalletFactory: "0x2222222222222222222222222222222222222222",
        DepositWalletImplementation: "0x3333333333333333333333333333333333333333",
      },
    },
    deriveDepositWalletAddress: vi.fn(async () => "0x4444444444444444444444444444444444444444"),
    getDeployed: vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true),
    getTransaction: vi.fn(),
    pollUntilState: vi.fn(async () => ({ transactionID: "tx-1", transactionHash: "0xabc", hash: "0xabc", state: "STATE_CONFIRMED" })) as unknown as RelayClient["pollUntilState"],
    ...overrides,
  } as unknown as RelayClient;
}

describe("polymarket relayer deployment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("polls until a deposit wallet deployment is confirmed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ transactionID: "tx-1", state: "STATE_NEW" }), { status: 200 })),
    );

    const client = createClient();
    const walletAddress = await ensureDepositWalletDeployed(client);

    expect(walletAddress).toBe("0x4444444444444444444444444444444444444444");
    expect(client.pollUntilState).toHaveBeenCalled();
    expect(client.getDeployed).toHaveBeenCalledTimes(2);
  });

  it("fails when the relayer transaction never confirms", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ transactionID: "tx-1", state: "STATE_NEW" }), { status: 200 })),
    );

    const client = createClient({
      pollUntilState: vi.fn(async () => ({ transactionID: "tx-1", transactionHash: "0xabc", hash: "0xabc", state: "STATE_FAILED" })) as unknown as RelayClient["pollUntilState"],
      getDeployed: vi.fn().mockResolvedValue(false),
    });

    await expect(ensureDepositWalletDeployed(client)).rejects.toThrow("Deposit wallet deployment failed.");
  });
});
