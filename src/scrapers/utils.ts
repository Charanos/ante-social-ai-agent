/**
 * Shared scraping utilities for Kenya sources.
 */

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Football: ['fkf', 'gor mahia', 'afc leopards', 'harambee stars', 'premier league kenya', 'mechi', 'fkf cup'],
  Sports: ['match', 'tournament', 'championship', 'final', 'qualifier', 'kenya sevens', 'safari rally', 'marathon', 'rugby', 'boxing', 'athletics', 'kru'],
  Politics: ['election', 'parliament', 'senate', 'cabinet', 'uchaguzi', 'bunge', 'referendum', 'ruto', 'raila', 'iebc', 'governor', 'vote', 'gazette', 'appointment'],
  Finance: ['ksh', 'kes', 'shilling', 'exchange rate', 'cbk', 'interest rate', 'forex', 'nse', 'stocks', 'bond', 'mpc', 'cma', 'epra'],
  Economics: ['inflation', 'gdp', 'unemployment', 'fuel prices', 'food prices', 'electricity tariff', 'budget', 'revenue', 'knbs', 'cpi', 'tax'],
  Crypto: ['bitcoin', 'ethereum', 'crypto', 'btc', 'eth', 'blockchain', 'usdt', 'binance'],
  Business: ['earnings', 'dividend', 'ipo', 'safaricom', 'equity bank', 'kcb', 'merger', 'acquisition', 'listing', 'kra'],
  Entertainment: ['award', 'music', 'grammy', 'skiza', 'afrimma', 'award', 'concert', 'festival'],
};

const MARKETABLE_KEYWORDS = [
  'will', 'who will', 'who wins', 'who won', 'final', 'vs', 'versus', 'against',
  'election', 'vote', 'match', 'announce', 'rate', 'result', 'qualify',
  'championship', 'playoff', 'debate', 'decision', 'budget', 'meeting',
  'approve', 'confirm', 'release', 'publish',
  'uchaguzi', 'mechi', 'bunge', 'tangaza', 'tangazo', 'kiwango', 'bei', 'soko',
];

const OFFICIAL_KEYWORDS = [
  'announcement', 'announces', 'press', 'statement', 'results', 'result',
  'election', 'gazette', 'appointment', 'committee', 'meeting',
  'interest rate', 'cbr', 'exchange rate', 'inflation', 'cpi', 'gdp',
  'listing', 'dividend', 'ipo', 'policy', 'budget', 'survey', 'report',
];

const STOP_TITLES = new Set([
  'home', 'about', 'contact', 'privacy policy', 'terms', 'login', 'register',
  'news', 'press releases', 'publications',
]);

export function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return 'General';
}

export function isLikelyMarketable(text: string): boolean {
  const lower = text.toLowerCase();
  return MARKETABLE_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isOfficialMarketable(text: string): boolean {
  const lower = text.toLowerCase();
  return OFFICIAL_KEYWORDS.some((kw) => lower.includes(kw)) || isLikelyMarketable(text);
}

export function normalizeHeadline(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[\r\n\t]+/g, ' ').trim();
}

export function isUsableHeadline(text: string): boolean {
  const normalized = normalizeHeadline(text);
  if (normalized.length < 12 || normalized.length > 200) return false;
  if (STOP_TITLES.has(normalized.toLowerCase())) return false;
  return true;
}
