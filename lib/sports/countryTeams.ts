import { compactTeamText } from "@/lib/sports/marketTeamExtractor";

export type CountryTeam = {
  name: string;
  flagCode: string;
  aliases: string[];
};

const COUNTRY_TEAMS: CountryTeam[] = [
  { name: "United States", flagCode: "us", aliases: ["usa", "us", "u s", "u s a", "united states", "united states of america", "america"] },
  { name: "France", flagCode: "fr", aliases: ["france", "french"] },
  { name: "Brazil", flagCode: "br", aliases: ["brazil", "brasil"] },
  { name: "Argentina", flagCode: "ar", aliases: ["argentina"] },
  { name: "England", flagCode: "gb-eng", aliases: ["england", "eng"] },
  { name: "Spain", flagCode: "es", aliases: ["spain", "espana", "españa"] },
  { name: "Germany", flagCode: "de", aliases: ["germany", "deutschland"] },
  { name: "Portugal", flagCode: "pt", aliases: ["portugal"] },
  { name: "Netherlands", flagCode: "nl", aliases: ["netherlands", "holland", "dutch"] },
  { name: "Italy", flagCode: "it", aliases: ["italy", "italia"] },
  { name: "Turkey", flagCode: "tr", aliases: ["turkey", "turkiye", "türkiye"] },
  { name: "Ivory Coast", flagCode: "ci", aliases: ["ivory coast", "cote d ivoire", "côte d ivoire", "cote divoire"] },
  { name: "Belgium", flagCode: "be", aliases: ["belgium"] },
  { name: "Croatia", flagCode: "hr", aliases: ["croatia"] },
  { name: "Uruguay", flagCode: "uy", aliases: ["uruguay"] },
  { name: "Mexico", flagCode: "mx", aliases: ["mexico"] },
  { name: "Colombia", flagCode: "co", aliases: ["colombia"] },
  { name: "Japan", flagCode: "jp", aliases: ["japan"] },
  { name: "Morocco", flagCode: "ma", aliases: ["morocco"] },
  { name: "Switzerland", flagCode: "ch", aliases: ["switzerland", "swiss"] },
  { name: "Denmark", flagCode: "dk", aliases: ["denmark"] },
  { name: "Poland", flagCode: "pl", aliases: ["poland"] },
  { name: "Senegal", flagCode: "sn", aliases: ["senegal"] },
  { name: "Canada", flagCode: "ca", aliases: ["canada"] },
  { name: "Australia", flagCode: "au", aliases: ["australia"] },
  { name: "Scotland", flagCode: "gb-sct", aliases: ["scotland", "sco"] },
  { name: "Wales", flagCode: "gb-wls", aliases: ["wales"] },
];

const COUNTRY_BY_ALIAS = new Map<string, CountryTeam>();

for (const country of COUNTRY_TEAMS) {
  COUNTRY_BY_ALIAS.set(compactTeamText(country.name), country);
  for (const alias of country.aliases) {
    COUNTRY_BY_ALIAS.set(compactTeamText(alias), country);
  }
}

export function isNationalTeamMarket(marketTitle = "", category?: string, sport?: string) {
  const value = compactTeamText(`${marketTitle} ${category ?? ""} ${sport ?? ""}`);
  return /\b(fifa world cup|world cup|euro|uefa euro|copa america|afcon|africa cup of nations|nations league|international|national team)\b/.test(value);
}

export function isClubTeamMarket(marketTitle = "", category?: string, sport?: string) {
  const value = compactTeamText(`${marketTitle} ${category ?? ""} ${sport ?? ""}`);
  return /\b(champions league|ucl|premier league|epl|la liga|laliga|serie a|bundesliga|ligue 1|mls|club world cup)\b/.test(value);
}

export function resolveCountryTeam(value: string) {
  return COUNTRY_BY_ALIAS.get(compactTeamText(value)) ?? null;
}

export function countryFlagUrl(country: CountryTeam) {
  return `https://flagcdn.com/${country.flagCode}.svg`;
}
