/**
 * Official Kenya sources scraper (IEBC, CBK, NSE, KNBS, etc.).
 * Pulls recent headlines/announcements for high-trust market discovery.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ScrapedEvent } from '../types';
import { detectCategory, isOfficialMarketable, isUsableHeadline, normalizeHeadline } from './utils';

interface SourceConfig {
  name: string;
  category: string;
  tags: string[];
  urls: string[];
}

const OFFICIAL_SOURCES: SourceConfig[] = [
  {
    name: 'IEBC',
    category: 'Politics',
    tags: ['kenya', 'iebc', 'election'],
    urls: [
      'https://www.iebc.or.ke',
      'https://www.iebc.or.ke/press',
      'https://www.iebc.or.ke/news',
    ],
  },
  {
    name: 'Kenya Gazette',
    category: 'Politics',
    tags: ['kenya', 'gazette', 'appointments'],
    urls: [
      'http://kenyagazette.co.ke',
      'http://kenyagazette.co.ke/notices',
    ],
  },
  {
    name: 'CBK',
    category: 'Finance',
    tags: ['kenya', 'cbk', 'finance', 'rates'],
    urls: [
      'https://www.centralbank.go.ke',
      'https://www.centralbank.go.ke/press/',
      'https://www.centralbank.go.ke/monetary-policy/',
      'https://www.centralbank.go.ke/rates/',
    ],
  },
  {
    name: 'KRA',
    category: 'Economics',
    tags: ['kenya', 'kra', 'revenue'],
    urls: [
      'https://www.kra.go.ke',
      'https://www.kra.go.ke/news',
    ],
  },
  {
    name: 'NSE',
    category: 'Finance',
    tags: ['kenya', 'nse', 'stocks', 'finance'],
    urls: [
      'https://www.nse.co.ke',
      'https://www.nse.co.ke/media-center/',
      'https://www.nse.co.ke/market-statistics/',
    ],
  },
  {
    name: 'CMA',
    category: 'Finance',
    tags: ['kenya', 'cma', 'markets'],
    urls: [
      'https://www.cma.or.ke',
      'https://www.cma.or.ke/index.php/publications',
      'https://www.cma.or.ke/index.php/news',
    ],
  },
  {
    name: 'KNBS',
    category: 'Economics',
    tags: ['kenya', 'knbs', 'economics', 'statistics'],
    urls: [
      'https://www.knbs.or.ke',
      'https://www.knbs.or.ke/publications/',
      'https://www.knbs.or.ke/press-releases/',
    ],
  },
  {
    name: 'EPRA',
    category: 'Economics',
    tags: ['kenya', 'epra', 'energy'],
    urls: [
      'https://www.epra.go.ke',
      'https://www.epra.go.ke/petroleum',
    ],
  },
  {
    name: 'Athletics Kenya',
    category: 'Sports',
    tags: ['kenya', 'athletics', 'sports'],
    urls: [
      'https://www.athleticskenya.or.ke',
    ],
  },
  {
    name: 'KRU',
    category: 'Sports',
    tags: ['kenya', 'rugby', 'sports'],
    urls: [
      'https://www.kru.co.ke',
    ],
  },
];

function absoluteUrl(base: string, href?: string | null): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

async function scrapeUrl(url: string, source: SourceConfig): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AnteSocialBot/1.0)' },
      timeout: 9000,
    });

    const $ = cheerio.load(response.data as string);

    // Pull text from anchors + headings
    const candidates: Array<{ text: string; href?: string }> = [];

    $('a').each((_, el) => {
      const text = normalizeHeadline($(el).text());
      if (!isUsableHeadline(text)) return;
      const href = $(el).attr('href');
      candidates.push({ text, href });
    });

    $('h1, h2, h3').each((_, el) => {
      const text = normalizeHeadline($(el).text());
      if (!isUsableHeadline(text)) return;
      candidates.push({ text });
    });

    for (const candidate of candidates) {
      const text = candidate.text;
      if (!isOfficialMarketable(text)) continue;
      const key = text.toLowerCase().slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);

      const detectedCategory = detectCategory(text);
      const category = detectedCategory === 'General' ? source.category : detectedCategory;
      const sourceUrl = absoluteUrl(url, candidate.href) || url;

      events.push({
        title: text,
        description: `${text}. Source: ${source.name}`,
        category,
        source: source.name,
        sourceUrl,
        detectedAt: new Date().toISOString(),
        tags: source.tags,
      });
    }
  } catch {
    return [];
  }

  return events.slice(0, 12);
}

export async function fetchOfficialKenyaEvents(): Promise<ScrapedEvent[]> {
  const results = await Promise.allSettled(
    OFFICIAL_SOURCES.flatMap((source) =>
      source.urls.map((url) => scrapeUrl(url, source)),
    ),
  );

  const all: ScrapedEvent[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    }
  }

  // Dedup by title
  const seen = new Set<string>();
  return all.filter((event) => {
    const key = event.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
