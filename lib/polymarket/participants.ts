import { cleanOutcomeTeamCandidate, compactTeamText, stripTeamSuffix } from "@/lib/sports/marketTeamExtractor";

export type PolymarketParticipantType = "team" | "player" | "driver" | "fighter" | "constructor" | "country" | "generic";

export type PolymarketParticipantRecord = {
  id?: string | number;
  name?: string;
  displayName?: string;
  fullName?: string;
  shortName?: string;
  abbreviation?: string;
  alias?: string;
  aliases?: string[] | string | null;
  slug?: string;
  type?: string;
  participantType?: string;
  kind?: string;
  role?: string;
  logo?: string | null;
  image?: string | null;
  icon?: string | null;
  badge?: string | null;
  team?: unknown;
  participant?: unknown;
  player?: unknown;
  driver?: unknown;
  fighter?: unknown;
  constructor?: unknown;
  country?: unknown;
  competitors?: unknown;
  participants?: unknown;
};

export type PolymarketParticipantMatch = {
  record: PolymarketParticipantRecord;
  participantType: PolymarketParticipantType;
  matchedBy: "id" | "name" | "display_name" | "short_name" | "alias" | "abbreviation" | "slug" | "normalized_alias";
  query: string;
  normalizedQuery: string;
  logoUrl: string | null;
};

export type PolymarketParticipantLookupContext = {
  sport?: string;
  category?: string;
  league?: string;
  marketTitle?: string;
  outcomeName?: string;
};

export type PolymarketParticipantLookupDebug = {
  cacheHit: boolean;
  lookupMs: number;
  matchedParticipant: PolymarketParticipantMatch | null;
  rawLogoUrl: string | null;
  sanitizedLogoUrl: string | null;
  fallbackReason: string | null;
};

type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
};

type ParticipantCacheStore = Map<string, CacheEntry<PolymarketParticipantMatch | null>>;

declare global {
  var __TRAAK_POLYMARKET_PARTICIPANT_CACHE__: ParticipantCacheStore | undefined;
}

const PARTICIPANT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const POLYMARKET_UPLOAD_HOST = "https://polymarket-upload.s3.us-east-2.amazonaws.com/";

function getParticipantCache() {
  if (!globalThis.__TRAAK_POLYMARKET_PARTICIPANT_CACHE__) {
    globalThis.__TRAAK_POLYMARKET_PARTICIPANT_CACHE__ = new Map();
  }
  return globalThis.__TRAAK_POLYMARKET_PARTICIPANT_CACHE__;
}

function normalizeLogoUrl(value?: string | null) {
  const logo = value?.trim();
  if (!logo) return null;
  if (!logo.includes(POLYMARKET_UPLOAD_HOST)) return /^(https?:\/\/|\/)/i.test(logo) ? logo : null;
  const lastHostIndex = logo.lastIndexOf(POLYMARKET_UPLOAD_HOST);
  if (lastHostIndex <= 0) return logo;
  return `${POLYMARKET_UPLOAD_HOST}${logo.slice(lastHostIndex + POLYMARKET_UPLOAD_HOST.length)}`;
}

function textVariants(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => textVariants(item));
  if (typeof value !== "string") return [];
  return value
    .split(/[,|/;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function compact(value: unknown) {
  return compactTeamText(String(value ?? ""));
}

function stripOutcomeLineText(value: string) {
  const cleaned = cleanOutcomeTeamCandidate(value) || value;
  return compactTeamText(stripTeamSuffix(cleaned));
}

function participantDisplayName(record: PolymarketParticipantRecord) {
  return record.displayName?.trim() || record.fullName?.trim() || record.name?.trim() || "";
}

function participantTypeFromRecord(record: PolymarketParticipantRecord, context?: PolymarketParticipantLookupContext): PolymarketParticipantType {
  const direct = compact(record.participantType ?? record.type ?? record.kind ?? record.role);
  if (/\bcountry|national\b/.test(direct)) return "country";
  if (/\bdriver\b/.test(direct)) return "driver";
  if (/\bfighter|ufc\b/.test(direct)) return "fighter";
  if (/\bconstructor\b/.test(direct)) return "constructor";
  if (/\bplayer|athlete\b/.test(direct)) return "player";
  if (/\bteam\b/.test(direct)) return "team";

  const title = compact(`${context?.marketTitle ?? ""} ${context?.sport ?? ""} ${context?.league ?? ""}`);
  if (/\bworld cup|euro|afcon|copa america|national team\b/.test(title)) return "country";
  if (/\bformula 1|f1\b/.test(title)) return /\bconstructors?\b/.test(title) ? "constructor" : "driver";
  if (/\btennis\b/.test(title)) return "player";
  if (/\bufc|mma|boxing\b/.test(title)) return "fighter";
  if (/\bplayer prop|mvp|points|rebounds|assists|goals|shots|saves|touchdowns|tds|strikeouts|yards|aces\b/.test(title)) return "player";
  return "team";
}

function participantLogoFromRecord(record: PolymarketParticipantRecord) {
  return normalizeLogoUrl(record.logo ?? record.image ?? record.icon ?? record.badge ?? null);
}

function matchParticipantRecord(record: PolymarketParticipantRecord, outcomeName: string, context?: PolymarketParticipantLookupContext) {
  const query = stripOutcomeLineText(outcomeName);
  const normalizedQuery = compactTeamText(query);
  const normalizedWithoutSuffix = compactTeamText(stripTeamSuffix(query));
  const display = participantDisplayName(record);
  const name = compact(record.name ?? "");
  const displayName = compact(display);
  const shortName = compact(record.shortName ?? "");
  const abbreviation = compact(record.abbreviation ?? "");
  const alias = compact(record.alias ?? "");
  const slug = compact(record.slug ?? "");
  const aliases = textVariants(record.aliases).map(compact);
  const values = [name, displayName, shortName, abbreviation, alias, slug, ...aliases].filter(Boolean);
  const participantType = participantTypeFromRecord(record, context);
  const logoUrl = participantLogoFromRecord(record);

  if (!normalizedQuery) return null;
  const queryCandidates = [normalizedQuery, normalizedWithoutSuffix];
  const matchedBy = values.find((value) => queryCandidates.includes(value));
  if (!matchedBy) return null;

  const matchedByKey =
    matchedBy === name
      ? "name"
      : matchedBy === displayName
        ? "display_name"
        : matchedBy === shortName
          ? "short_name"
          : matchedBy === abbreviation
            ? "abbreviation"
            : matchedBy === alias
              ? "alias"
              : matchedBy === slug
                ? "slug"
                : "normalized_alias";

  return {
    record,
    participantType,
    matchedBy: matchedByKey,
    query: outcomeName,
    normalizedQuery,
    logoUrl,
  } as PolymarketParticipantMatch;
}

function participantMatchRank(match: PolymarketParticipantMatch) {
  const withLogo = match.logoUrl ? 0 : 1;
  const by = match.matchedBy === "id" ? 0 : match.matchedBy === "display_name" || match.matchedBy === "name" ? 1 : match.matchedBy === "abbreviation" || match.matchedBy === "short_name" ? 2 : 3;
  return withLogo * 10 + by;
}

function collectParticipantRecords(value: unknown): PolymarketParticipantRecord[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const current: PolymarketParticipantRecord = {
    id: record.id as string | number | undefined,
    name: typeof record.name === "string" ? record.name : undefined,
    displayName: typeof record.displayName === "string" ? record.displayName : undefined,
    fullName: typeof record.fullName === "string" ? record.fullName : undefined,
    shortName: typeof record.shortName === "string" ? record.shortName : undefined,
    abbreviation: typeof record.abbreviation === "string" ? record.abbreviation : undefined,
    alias: typeof record.alias === "string" ? record.alias : undefined,
    aliases: record.aliases as string[] | string | null | undefined,
    slug: typeof record.slug === "string" ? record.slug : undefined,
    type: typeof record.type === "string" ? record.type : undefined,
    participantType: typeof record.participantType === "string" ? record.participantType : undefined,
    kind: typeof record.kind === "string" ? record.kind : undefined,
    role: typeof record.role === "string" ? record.role : undefined,
    logo: typeof record.logo === "string" ? record.logo : undefined,
    image: typeof record.image === "string" ? record.image : undefined,
    icon: typeof record.icon === "string" ? record.icon : undefined,
    badge: typeof record.badge === "string" ? record.badge : undefined,
  };

  const nestedKeys = ["team", "participant", "player", "driver", "fighter", "constructor", "country"] as const;
  const nested = nestedKeys.flatMap((key) => collectParticipantRecords(record[key]));
  const arrays = ["participants", "competitors", "teams", "players", "drivers", "fighters", "constructors", "countries", "entries"] as const;
  const nestedArrays = arrays.flatMap((key) => {
    const value = record[key];
    return Array.isArray(value) ? value.flatMap((item) => collectParticipantRecords(item)) : [];
  });

  return [current, ...nested, ...nestedArrays].filter((item) => item.name || item.displayName || item.fullName || item.shortName || item.abbreviation || item.alias || item.slug || item.logo || item.image || item.icon);
}

function participantCacheKey(context: PolymarketParticipantLookupContext | undefined, outcomeName: string) {
  const sport = compact(context?.sport);
  const league = compact(context?.league ?? context?.category);
  const type = participantTypeFromRecord({}, context);
  return [sport, league, type, compactTeamText(outcomeName)].join("|");
}

export function resolvePolymarketParticipantOutcome(
  raw: Record<string, unknown>,
  index: number,
  token: Record<string, unknown>,
  outcomeName: string,
  context?: PolymarketParticipantLookupContext,
): {
  participantType: PolymarketParticipantType;
  participantName?: string;
  participantDisplayName?: string;
  participantAbbreviation?: string;
  participantSlug?: string;
  participantId?: string | number;
  polymarketParticipantLogoUrl?: string;
  participantCacheHit: boolean;
  participantLookupMs: number;
  participantMatchedName?: string;
  participantMatchedBy?: PolymarketParticipantMatch["matchedBy"];
  participantLookupReason?: string;
} {
  const startedAt = Date.now();
  const cache = getParticipantCache();
  const cacheKey = participantCacheKey(context, outcomeName);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.value !== undefined) {
    const value = cached.value;
    if (!value) {
      const fallbackType = participantTypeFromRecord({}, context);
      return {
        participantType: fallbackType,
        participantCacheHit: true,
        participantLookupMs: Date.now() - startedAt,
        participantLookupReason: "cache_miss",
      };
    }
    return {
      participantType: value.participantType,
      participantName: value.record.name,
      participantDisplayName: participantDisplayName(value.record),
      participantAbbreviation: value.record.abbreviation,
      participantSlug: value.record.slug,
      participantId: value.record.id,
      polymarketParticipantLogoUrl: value.logoUrl ?? undefined,
      participantCacheHit: true,
      participantLookupMs: Date.now() - startedAt,
      participantMatchedName: participantDisplayName(value.record) || value.record.name,
      participantMatchedBy: value.matchedBy,
      participantLookupReason: value.logoUrl ? "matched_cached_record" : "cached_record_without_logo",
    };
  }

  const rawRecord = raw as Record<string, unknown>;
  const rawListItem = (key: string) => {
    const value = rawRecord[key];
    return Array.isArray(value) ? value[index] : undefined;
  };
  const outcomeCandidates = [
    token,
    rawListItem("outcomeOptions"),
    rawListItem("outcomes"),
    rawListItem("participants"),
    rawListItem("teams"),
    rawListItem("players"),
    rawListItem("drivers"),
    rawListItem("fighters"),
    rawListItem("constructors"),
  ].flatMap((item) => collectParticipantRecords(item));
  const rawCandidates = [
    ...outcomeCandidates,
    ...collectParticipantRecords(token),
    ...collectParticipantRecords(raw),
  ];

  const seen = new Set<string>();
  const uniqueCandidates = rawCandidates.filter((candidate) => {
    const key = [compact(candidate.name), compact(candidate.displayName), compact(candidate.fullName), compact(candidate.shortName), compact(candidate.abbreviation), compact(candidate.alias), compact(candidate.slug), compact(candidate.logo), compact(candidate.image), compact(candidate.icon)].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let bestMatch: PolymarketParticipantMatch | null = null;
  for (const candidate of uniqueCandidates) {
    const match = matchParticipantRecord(candidate, outcomeName, context);
    if (!match) continue;
    if (match.logoUrl) {
      cache.set(cacheKey, { expiresAt: Date.now() + PARTICIPANT_CACHE_TTL_MS, value: match });
      return {
        participantType: match.participantType,
        participantName: match.record.name,
        participantDisplayName: participantDisplayName(match.record),
        participantAbbreviation: match.record.abbreviation,
        participantSlug: match.record.slug,
        participantId: match.record.id,
        polymarketParticipantLogoUrl: match.logoUrl ?? undefined,
        participantCacheHit: false,
        participantLookupMs: Date.now() - startedAt,
        participantMatchedName: participantDisplayName(match.record) || match.record.name,
        participantMatchedBy: match.matchedBy,
        participantLookupReason: "matched_raw_participant_record",
      };
    }
    if (!bestMatch || participantMatchRank(match) < participantMatchRank(bestMatch)) {
      bestMatch = match;
    }
  }

  if (bestMatch) {
    cache.set(cacheKey, { expiresAt: Date.now() + PARTICIPANT_CACHE_TTL_MS, value: bestMatch });
    return {
      participantType: bestMatch.participantType,
      participantName: bestMatch.record.name,
      participantDisplayName: participantDisplayName(bestMatch.record),
      participantAbbreviation: bestMatch.record.abbreviation,
      participantSlug: bestMatch.record.slug,
      participantId: bestMatch.record.id,
      polymarketParticipantLogoUrl: bestMatch.logoUrl ?? undefined,
      participantCacheHit: false,
      participantLookupMs: Date.now() - startedAt,
      participantMatchedName: participantDisplayName(bestMatch.record) || bestMatch.record.name,
      participantMatchedBy: bestMatch.matchedBy,
      participantLookupReason: bestMatch.logoUrl ? "matched_raw_participant_record" : "matched_raw_participant_record_without_logo",
    };
  }

  const fallbackType = participantTypeFromRecord({}, context);
  cache.set(cacheKey, { expiresAt: Date.now() + PARTICIPANT_CACHE_TTL_MS, value: null });
  return {
    participantType: fallbackType,
    participantCacheHit: false,
    participantLookupMs: Date.now() - startedAt,
    participantLookupReason: "no_participant_match",
  };
}

export function normalizePolymarketParticipantLogoUrl(value?: string | null) {
  return normalizeLogoUrl(value);
}
