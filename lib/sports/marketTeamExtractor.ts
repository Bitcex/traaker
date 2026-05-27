import { TEAM_ALIASES, TEAM_SUFFIX_PATTERN } from "@/lib/sports/teamAliases";
import { isNationalTeamMarket, resolveCountryTeam } from "@/lib/sports/countryTeams";

export type MarketTeamExtractionInput = {
  marketTitle?: string;
  category?: string;
  sport?: string;
  outcomes?: string[];
};

export type MarketTeamExtraction = {
  canonicalTeams: string[];
  outcomeTeamMap: Record<string, string | null>;
  isTeamOutcome: boolean;
};

const CHAMPIONSHIP_WORDS =
  /\b(to win|winner|wins?|champions?|championship|finals?|playoffs?|league|cup|season|outright|market|moneyline|advance|qualify)\b/gi;

const NBA_ALIASES: Record<string, string> = {
  bos: "Boston Celtics",
  chi: "Chicago Bulls",
  cle: "Cleveland Cavaliers",
  dal: "Dallas Mavericks",
  den: "Denver Nuggets",
  ind: "Indiana Pacers",
  lal: "Los Angeles Lakers",
  mia: "Miami Heat",
  mil: "Milwaukee Bucks",
  min: "Minnesota Timberwolves",
  nyk: "New York Knicks",
  okc: "Oklahoma City Thunder",
  phi: "Philadelphia 76ers",
  phx: "Phoenix Suns",
  "new york knicks": "New York Knicks",
  knicks: "New York Knicks",
  "okc thunder": "Oklahoma City Thunder",
  "oklahoma city thunder": "Oklahoma City Thunder",
  thunder: "Oklahoma City Thunder",
  "san antonio spurs": "San Antonio Spurs",
  spurs: "San Antonio Spurs",
};

const MLB_ALIASES: Record<string, string> = {
  angels: "Los Angeles Angels",
  "los angeles angels": "Los Angeles Angels",
  "los angeles angels fc": "Los Angeles Angels",
  laa: "Los Angeles Angels",
  det: "Detroit Tigers",
  tigers: "Detroit Tigers",
  "detroit tigers": "Detroit Tigers",
  "detroit tigers fc": "Detroit Tigers",
};

const NFL_ALIASES: Record<string, string> = {
  ari: "Arizona Cardinals",
  atl: "Atlanta Falcons",
  bal: "Baltimore Ravens",
  buf: "Buffalo Bills",
  car: "Carolina Panthers",
  cin: "Cincinnati Bengals",
  cle: "Cleveland Browns",
  dal: "Dallas Cowboys",
  den: "Denver Broncos",
  det: "Detroit Lions",
  gb: "Green Bay Packers",
  jax: "Jacksonville Jaguars",
  kc: "Kansas City Chiefs",
  lv: "Las Vegas Raiders",
  mia: "Miami Dolphins",
  min: "Minnesota Vikings",
  ne: "New England Patriots",
  no: "New Orleans Saints",
  nyg: "New York Giants",
  nyj: "New York Jets",
  phi: "Philadelphia Eagles",
  pit: "Pittsburgh Steelers",
  sf: "San Francisco 49ers",
  sea: "Seattle Seahawks",
  tb: "Tampa Bay Buccaneers",
  ten: "Tennessee Titans",
  wsh: "Washington Commanders",
};

const NHL_ALIASES: Record<string, string> = {
  ana: "Anaheim Ducks",
  bos: "Boston Bruins",
  buf: "Buffalo Sabres",
  cal: "Calgary Flames",
  car: "Carolina Hurricanes",
  cbj: "Columbus Blue Jackets",
  chi: "Chicago Blackhawks",
  col: "Colorado Avalanche",
  dal: "Dallas Stars",
  det: "Detroit Red Wings",
  edm: "Edmonton Oilers",
  fla: "Florida Panthers",
  la: "Los Angeles Kings",
  mtl: "Montreal Canadiens",
  njd: "New Jersey Devils",
  nyr: "New York Rangers",
  nyi: "New York Islanders",
  ott: "Ottawa Senators",
  phi: "Philadelphia Flyers",
  pit: "Pittsburgh Penguins",
  sj: "San Jose Sharks",
  sea: "Seattle Kraken",
  stl: "St. Louis Blues",
  tb: "Tampa Bay Lightning",
  tor: "Toronto Maple Leafs",
  van: "Vancouver Canucks",
  vgk: "Vegas Golden Knights",
  wpg: "Winnipeg Jets",
};

const OUTCOME_LINE_SUFFIX_PATTERN = /(?:\s+\d+){1,4}$/;
const OUTCOME_LINE_WORD_PATTERN = /\b(?:o\s*\/\s*u|ou|over|under|btts|both teams to score|spread|handicap|total|totals?|moneyline|line)\b.*$/i;

export function compactTeamText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleCase(value: string) {
  const uppercaseWords = new Set(["afc", "cf", "fc", "mls", "nba", "nfl", "psg", "sc", "ufc"]);
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (uppercaseWords.has(word) ? word.toUpperCase() : `${word[0]?.toUpperCase() ?? ""}${word.slice(1).toLowerCase()}`))
    .join(" ");
}

export function stripTeamSuffix(value: string) {
  return compactTeamText(value).replace(TEAM_SUFFIX_PATTERN, " ").replace(/\s+/g, " ").trim();
}

function stripBettingLineSuffix(value: string) {
  let cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  let next = cleaned
    .replace(OUTCOME_LINE_WORD_PATTERN, "")
    .replace(OUTCOME_LINE_SUFFIX_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();

  while (next && next !== cleaned) {
    cleaned = next;
    next = cleaned
      .replace(OUTCOME_LINE_WORD_PATTERN, "")
      .replace(OUTCOME_LINE_SUFFIX_PATTERN, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return cleaned;
}

export function cleanOutcomeTeamCandidate(value: string) {
  if (isNonTeamOutcome(value)) return "";
  const normalized = compactTeamText(value).replace(CHAMPIONSHIP_WORDS, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const withoutLineSuffix = stripBettingLineSuffix(normalized);
  return stripTeamSuffix(withoutLineSuffix || normalized);
}

function contextualAliases(category?: string, sport?: string) {
  const normalizedCategory = normalizeCategory(category, sport);
  if (normalizedCategory === "NBA") return { ...TEAM_ALIASES, ...NBA_ALIASES };
  if (normalizedCategory === "NFL") return { ...TEAM_ALIASES, ...NFL_ALIASES };
  if (normalizedCategory === "NHL") return { ...TEAM_ALIASES, ...NHL_ALIASES };
  if (normalizedCategory === "MLB" || compactTeamText(`${category ?? ""} ${sport ?? ""}`).includes("baseball")) {
    return { ...TEAM_ALIASES, ...MLB_ALIASES };
  }
  return TEAM_ALIASES;
}

function normalizeCategory(category?: string, sport?: string) {
  const value = compactTeamText(`${category ?? ""} ${sport ?? ""}`);
  if (/\bnba|basketball|wnba\b/.test(value)) return "NBA";
  if (/\bnfl|american football|super bowl\b/.test(value)) return "NFL";
  if (/\bnhl|hockey\b/.test(value)) return "NHL";
  if (/\bmlb|baseball\b/.test(value)) return "MLB";
  if (/\bsoccer|premier league|champions league|ucl|epl|uefa|fifa|mls|laliga|serie a|bundesliga\b/.test(value)) return "Soccer";
  if (/\bufc|mma|fight|fighter|boxing\b/.test(value)) return "UFC";
  if (/\btennis|atp|wta|wimbledon|french open|us open|australian open\b/.test(value)) return "Tennis";
  return category || sport || "Market";
}

export function canonicalTeamName(value: string, category?: string, sport?: string) {
  const aliases = contextualAliases(category, sport);
  const normalized = compactTeamText(value).replace(CHAMPIONSHIP_WORDS, " ").replace(/\s+/g, " ").trim();
  const withoutSuffix = cleanOutcomeTeamCandidate(value);
  if (!withoutSuffix) return null;
  return aliases[normalized] ?? aliases[withoutSuffix] ?? titleCase(withoutSuffix);
}

function teamAliasMatches(candidate: string, canonicalTeam: string, category?: string, sport?: string) {
  const aliases = contextualAliases(category, sport);
  const normalizedCandidate = compactTeamText(candidate).replace(CHAMPIONSHIP_WORDS, " ").replace(/\s+/g, " ").trim();
  const candidateWithoutSuffix = cleanOutcomeTeamCandidate(candidate);
  const normalizedTeam = compactTeamText(canonicalTeam);
  const teamWithoutSuffix = stripTeamSuffix(canonicalTeam);

  if (normalizedCandidate === normalizedTeam || candidateWithoutSuffix === teamWithoutSuffix) return true;
  const aliasedCandidate = aliases[normalizedCandidate] ?? aliases[candidateWithoutSuffix];
  return aliasedCandidate ? compactTeamText(aliasedCandidate) === normalizedTeam : false;
}

export function isNonTeamOutcome(value: string) {
  const raw = value.trim();
  const normalized = compactTeamText(raw);
  if (!normalized) return true;
  if (/^(yes|no|over|under|ou|o u|draw|tie|draw tie|field|other|others?|none|push|market|winner|champion|team|btts|both teams to score)$/.test(normalized)) return true;
  if (/^(?:o\s*\/\s*u|ou|o u|over|under)\s*[-+]?\d+(?:\.\d+)?$/i.test(raw)) return true;
  if (/^[-+]?\d+(?:\.\d+)?$/.test(raw)) return true;
  if (/^[-+]?\d+(?:\.\d+)?\s*(?:points?|pts?|goals?|runs?|yards?)$/i.test(raw)) return true;
  if (/\b(?:total|spread|handicap|player prop|props?|points?|rebounds?|assists?|saves?|shots?|yards?|touchdowns?|tds?|goalscorer)\b/i.test(raw)) return true;
  return false;
}

function cleanMatchupSegment(value: string) {
  return value
    .replace(/\?.*$/, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(CHAMPIONSHIP_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitleTeams(marketTitle: string, category?: string, sport?: string) {
  const normalizedTitle = marketTitle.replace(/\s+/g, " ").trim();
  if (!normalizedTitle) return [];

  const parts = normalizedTitle.split(/\s+(?:vs\.?|v\.?|versus|at|@)\s+/i);
  if (parts.length < 2) return [];

  return parts
    .slice(0, 2)
    .map(cleanMatchupSegment)
    .map((team) => canonicalTeamName(team, category, sport))
    .filter((team): team is string => Boolean(team));
}

function uniqueTeams(teams: string[]) {
  const seen = new Set<string>();
  return teams.filter((team) => {
    const key = compactTeamText(team);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapOutcomeToTitleTeam(outcome: string, titleTeams: string[], category?: string, sport?: string) {
  if (isNonTeamOutcome(outcome)) return null;
  const cleanedOutcome = cleanOutcomeTeamCandidate(outcome) || outcome;
  const country = resolveCountryTeam(cleanedOutcome);
  if (country && isNationalTeamMarket("", category, sport)) return country.name;
  return titleTeams.find((team) => teamAliasMatches(cleanedOutcome, team, category, sport)) ?? null;
}

function hasDuplicateResolvedTeams(mappedTeams: Array<string | null>) {
  const present = mappedTeams.filter((team): team is string => Boolean(team));
  return present.length > 1 && new Set(present.map(compactTeamText)).size < present.length;
}

export function extractMarketTeams(input: MarketTeamExtractionInput): MarketTeamExtraction {
  const outcomes = input.outcomes ?? [];
  const titleTeams = uniqueTeams(extractTitleTeams(input.marketTitle ?? "", input.category, input.sport));
  const outcomeTeamMap: Record<string, string | null> = {};
  let mappedTeams = outcomes.map((outcome) => mapOutcomeToTitleTeam(outcome, titleTeams, input.category, input.sport));

  if (titleTeams.length === 2 && outcomes.length === 2 && hasDuplicateResolvedTeams(mappedTeams) && outcomes.every((outcome) => !isNonTeamOutcome(outcome))) {
    mappedTeams = [titleTeams[0], titleTeams[1]];
  }

  outcomes.forEach((outcome, index) => {
    const cleanedOutcome = cleanOutcomeTeamCandidate(outcome) || outcome;
    if (titleTeams.length > 0) {
      const country = resolveCountryTeam(cleanedOutcome);
      outcomeTeamMap[outcome] = mappedTeams[index] ?? (country && isNationalTeamMarket(input.marketTitle, input.category, input.sport) ? country.name : null);
      return;
    }

    const country = resolveCountryTeam(cleanedOutcome);
    outcomeTeamMap[outcome] = isNonTeamOutcome(outcome)
      ? null
      : country && isNationalTeamMarket(input.marketTitle, input.category, input.sport)
        ? country.name
        : canonicalTeamName(cleanedOutcome, input.category, input.sport);
  });

  return {
    canonicalTeams: titleTeams,
    outcomeTeamMap,
    isTeamOutcome: Object.values(outcomeTeamMap).some(Boolean),
  };
}
