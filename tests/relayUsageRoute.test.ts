import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getRelayUsageForDay = vi.fn();
const getRelayUsageHistory = vi.fn();

vi.mock("@/lib/server/relayUsage", () => ({
  getRelayUsageForDay,
  getRelayUsageHistory,
}));

describe("/api/internal/relay-usage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("rejects requests without the correct admin key", async () => {
    vi.stubEnv("INTERNAL_ADMIN_KEY", "secret");

    const { GET } = await import("@/app/api/internal/relay-usage/route");
    const response = await GET(new NextRequest("http://localhost/api/internal/relay-usage"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns today's usage snapshot", async () => {
    vi.stubEnv("INTERNAL_ADMIN_KEY", "secret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T22:45:00Z"));
    getRelayUsageForDay.mockResolvedValue({
      date: "2026-06-13",
      used: 523,
      remaining: 9477,
      limit: 10000,
      percentUsed: 5.23,
      status: "healthy",
    });

    const { GET } = await import("@/app/api/internal/relay-usage/route");
    const response = await GET(
      new NextRequest("http://localhost/api/internal/relay-usage", {
        headers: { "x-admin-key": "secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      date: "2026-06-13",
      used: 523,
      remaining: 9477,
      limit: 10000,
      percentUsed: 5.23,
      status: "healthy",
      timestamp: "2026-06-13T22:45:00.000Z",
    });
    expect(getRelayUsageForDay).toHaveBeenCalledWith("2026-06-13");
  });

  it("returns usage history when days is provided", async () => {
    vi.stubEnv("INTERNAL_ADMIN_KEY", "secret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T22:45:00Z"));
    getRelayUsageForDay.mockResolvedValue({
      date: "2026-06-13",
      used: 523,
      remaining: 9477,
      limit: 10000,
      percentUsed: 5.23,
      status: "healthy",
    });
    getRelayUsageHistory.mockResolvedValue([
      {
        date: "2026-06-12",
        used: 200,
        remaining: 9800,
        limit: 10000,
        percentUsed: 2,
        status: "healthy",
      },
      {
        date: "2026-06-13",
        used: 523,
        remaining: 9477,
        limit: 10000,
        percentUsed: 5.23,
        status: "healthy",
      },
    ]);

    const { GET } = await import("@/app/api/internal/relay-usage/route");
    const response = await GET(
      new NextRequest("http://localhost/api/internal/relay-usage?days=2", {
        headers: { "x-admin-key": "secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      date: "2026-06-13",
      history: [
        {
          date: "2026-06-12",
          used: 200,
        },
        {
          date: "2026-06-13",
          used: 523,
        },
      ],
    });
    expect(getRelayUsageHistory).toHaveBeenCalledWith(2, expect.any(Date));
    expect((getRelayUsageHistory.mock.calls[0] as [number, Date])[1].toISOString()).toBe("2026-06-13T22:45:00.000Z");
  });

  it("validates the days query parameter", async () => {
    vi.stubEnv("INTERNAL_ADMIN_KEY", "secret");

    const { GET } = await import("@/app/api/internal/relay-usage/route");
    const response = await GET(
      new NextRequest("http://localhost/api/internal/relay-usage?days=0", {
        headers: { "x-admin-key": "secret" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "days must be a positive integer." });
  });
});
