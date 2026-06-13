import { prisma } from "@/src/lib/db";

const DEFAULT_DAILY_RELAY_LIMIT = 10000;

export type RelayUsageSnapshot = {
  date: string;
  used: number;
  remaining: number;
  limit: number;
  percentUsed: number;
  status: "healthy" | "warning" | "critical";
};

const formatUtcDate = (date: Date) => date.toISOString().slice(0, 10);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const getRelayDailyLimit = () => DEFAULT_DAILY_RELAY_LIMIT;

export const getRelayUsageStatus = (percentUsed: number): RelayUsageSnapshot["status"] => {
  if (percentUsed >= 95) return "critical";
  if (percentUsed >= 80) return "warning";
  return "healthy";
};

export const toRelayUsageSnapshot = (date: string, used: number, limit = getRelayDailyLimit()): RelayUsageSnapshot => {
  const boundedUsed = Math.max(0, used);
  const remaining = Math.max(0, limit - boundedUsed);
  const percentUsed = Number(((clamp(boundedUsed / limit, 0, Number.POSITIVE_INFINITY)) * 100).toFixed(2));

  return {
    date,
    used: boundedUsed,
    remaining,
    limit,
    percentUsed,
    status: getRelayUsageStatus(percentUsed),
  };
};

export const incrementRelayUsageForToday = async (now = new Date()) => {
  const date = formatUtcDate(now);
  await prisma.relayUsageDaily.upsert({
    where: { date },
    update: {
      used: {
        increment: 1,
      },
    },
    create: {
      date,
      used: 1,
    },
  });
};

export const getRelayUsageForDay = async (date: string) => {
  const usage = await prisma.relayUsageDaily.findUnique({ where: { date } });
  return toRelayUsageSnapshot(date, usage?.used ?? 0);
};

export const getRelayUsageHistory = async (days: number, now = new Date()) => {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const dates = Array.from({ length: safeDays }, (_, index) => {
    const current = new Date(now);
    current.setUTCDate(current.getUTCDate() - index);
    return formatUtcDate(current);
  }).reverse();

  const usageRows = await prisma.relayUsageDaily.findMany({
    where: {
      date: {
        in: dates,
      },
    },
  });

  const usageByDate = new Map(usageRows.map((row) => [row.date, row.used]));
  return dates.map((date) => toRelayUsageSnapshot(date, usageByDate.get(date) ?? 0));
};
