import { afterEach, describe, expect, it, vi } from "vitest";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { ensureDepositWalletApprovals, ensureDepositWalletDeployed } from "@/lib/polymarket/relayer";

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

  it("uses MaxUint256 for deposit wallet exchange approvals", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        depositWalletParams?: { calls?: Array<{ target: string; data: string; value: string }> };
      };
      expect(body.depositWalletParams?.calls).toHaveLength(1);
      expect(body.depositWalletParams?.calls?.[0]).toMatchObject({
        target: "0x5555555555555555555555555555555555555555",
        value: "0",
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: ["0xE111180000d2663C0091e4f400237545B87B996B", maxUint256],
        }),
      });
      return new Response(JSON.stringify({ transactionID: "tx-1", state: "STATE_NEW" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createClient({
      getDeployed: vi.fn(async () => true),
      getNonce: vi.fn(async () => ({ nonce: "0" })),
    });
    const walletClient = {
      signTypedData: vi.fn(async () => `0x${"1".repeat(130)}`),
    };
    const publicClient = {
      readContract: vi.fn(async () => BigInt(0)),
    };

    await ensureDepositWalletApprovals({
      client,
      walletClient: walletClient as never,
      publicClient: publicClient as never,
      ownerAddress: "0x1111111111111111111111111111111111111111",
      token: "0x5555555555555555555555555555555555555555",
      spender: "0xE111180000d2663C0091e4f400237545B87B996B",
      amount: BigInt(12345),
    });

    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "allowance",
        args: [
          "0x4444444444444444444444444444444444444444",
          "0xE111180000d2663C0091e4f400237545B87B996B",
        ],
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
