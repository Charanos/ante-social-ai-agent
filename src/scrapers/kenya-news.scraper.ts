/**
 * News Scraper — fetches events from Kenyan RSS feeds and news sites.
 * Returns structured ScrapedEvent objects for the market creator agent.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
// @ts-ignore — feedparser-promised has no types
import feedparser from 'feedparser-promised';
import { logger } from '../utils/logger';
import type { ScrapedEvent } from '../types';

interface RSSItem {
  title: string;
  description?: string;
  summary?: string;
  link?: string;
  pubDate?: Date;
  date?: Date;
  [key: string]: unknown;
}

// ─── RSS Feed Sources ────────────────────────────────────────────────────────

const RSS_SOURCES: Array<{ name: string; url: string; category: string }> = [
  { name: 'Daily Nation', url: 'https://nation.africa/service/rss/kenya', category: 'General' },
  { name: 'Business Daily', url: 'https://www.businessdailyafrica.com/service/rss/722556/634/q8y7m5/index.xml', category: 'Finance' },
  { name: 'The Star Kenya', url: 'https://www.the-star.co.ke/rss', category: 'General' },
  { name: 'Capital News', url: 'https://www.capitalfm.co.ke/news/feed/', category: 'General' },
  { name: 'Standard Media', url: 'https://www.standardmedia.co.ke/rss/kenya.php', category: 'General' },
];

// ─── Keyword-based category detection ───────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Football: ['fkf', 'gor mahia', 'afc leopards', 'harambee stars', 'premier league kenya', 'mechi', 'fkf cup'],
  Sports: ['match', 'tournament', 'championship', 'final', 'qualifier', 'kenya sevens', 'safari rally', 'marathon', 'rugby', 'boxing'],
  Politics: ['election', 'parliament', 'senate', 'cabinet', 'uchaguzi', 'bunge', 'referendum', 'ruto', 'raila', 'iebc', 'governor', 'vote'],
  Finance: ['ksh', 'kes', 'shilling', 'exchange rate', 'cbk', 'interest rate', 'forex', 'nse', 'stocks'],
  Economics: ['inflation', 'gdp', 'unemployment', 'fuel prices', 'food prices', 'electricity tariff', 'budget', 'revenue', 'knbs'],
  Crypto: ['bitcoin', 'ethereum', 'crypto', 'btc', 'eth', 'blockchain', 'usdt', 'binance'],
  Business: ['earnings', 'dividend', 'ipo', 'safaricom', 'equity bank', 'kcb', 'merger', 'acquisition'],
  Entertainment: ['award', 'music', 'grammy', 'skiza', 'afrimma', 'nje ya pombe'],
};

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return 'General';
}

// ─── Marketability filter keywords ──────────────────────────────────────────

const MARKETABLE_KEYWORDS = [
  'will', 'who will', 'who wins', 'who won', 'final', 'vs', 'versus', 'against',
  'election', 'vote', 'match', 'announce', 'rate', 'result', 'qualify',
  'championship', 'playoff', 'debate', 'decision', 'budget',
];

function isLikelyMarketable(title: string): boolean {
  const lower = title.toLowerCase();
  return MARKETABLE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── NewsAPI integration ─────────────────────────────────────────────────────

export async function fetchNewsApiEvents(apiKey: string): Promise<ScrapedEvent[]> {
  if (!apiKey) return [];

  const events: ScrapedEvent[] = [];
  const queries = ['Kenya sports', 'Kenya election', 'CBK Kenya', 'FKF football Kenya'];

  for (const q of queries) {
    try {
      const response = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q,
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: 10,
          from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24h
        },
        headers: { 'X-Api-Key': apiKey },
        timeout: 8000,
      });

      const articles = (response.data as { articles: Array<{ title: string; description?: string; url?: string; publishedAt: string }> }).articles || [];
      for (const article of articles) {
        if (!article.title || article.title === '[Removed]') continue;
        events.push({
          title: article.title,
          description: article.description || article.title,
          category: detectCategory(article.title + ' ' + (article.description ?? '')),
          source: 'NewsAPI',
          sourceUrl: article.url,
          detectedAt: new Date().toISOString(),
          eventDate: article.publishedAt,
          imageUrl: (article as any).urlToImage,
          imageType: (article as any).urlToImage ? 'image' : undefined,
        });
      }
    } catch (error) {
      logger.warn('NewsAPI fetch failed', { query: q, error: (error as Error).message });
    }
  }

  return events;
}

// ─── RSS Feed scraper ────────────────────────────────────────────────────────

export async function fetchRssEvents(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours

  for (const source of RSS_SOURCES) {
    try {
      const items: RSSItem[] = await feedparser.parse(source.url);
      for (const item of items.slice(0, 15)) {
        const pubDate = item.pubDate || item.date;
        if (pubDate && new Date(pubDate).getTime() < cutoff) continue;

        const title = item.title?.trim() || '';
        const description = (item.description || item.summary || '').replace(/<[^>]+>/g, '').trim();

        if (!title || title.length < 10) continue;
        if (!isLikelyMarketable(title + ' ' + description)) continue;

        events.push({
          title,
          description: description || title,
          category: detectCategory(title + ' ' + description),
          source: source.name,
          detectedAt: new Date().toISOString(),
          eventDate: pubDate ? new Date(pubDate).toISOString() : undefined,
        });
      }
    } catch (error) {
      logger.warn(`RSS fetch failed for ${source.name}`, { error: (error as Error).message });
    }
  }

  return events;
}

// ─── SportRadar Kenya Football ───────────────────────────────────────────────

export async function fetchSportRadarEvents(apiKey: string): Promise<ScrapedEvent[]> {
  if (!apiKey) return [];

  try {
    // SportRadar Soccer API — Kenya Premier League
    const response = await axios.get(
      'https://api.sportradar.com/soccer/t2/en/schedules/live/results.json',
      {
        params: { api_key: apiKey },
        timeout: 10000,
      },
    );

    const results = (response.data as any).results || [];
    const events: ScrapedEvent[] = [];

    for (const game of results.slice(0, 10)) {
      const homeTeam = game.sport_event?.competitors?.[0]?.name || 'Home';
      const awayTeam = game.sport_event?.competitors?.[1]?.name || 'Away';
      const startTime = game.sport_event?.start_time;

      events.push({
        title: `${homeTeam} vs ${awayTeam} — Match Result`,
        description: `FKF/Africa football match between ${homeTeam} and ${awayTeam}. Market resolves on the official full-time score.`,
        category: 'Football',
        source: 'SportRadar',
        detectedAt: new Date().toISOString(),
        eventDate: startTime,
        tags: ['sports', 'football', 'kenya'],
      });
    }

    return events;
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes('403')) {
      logger.warn('SportRadar fetch 403 Forbidden — API key may lack access to the soccer/t2 endpoint.');
    } else {
      logger.warn('SportRadar fetch failed', { error: msg });
    }
    return [];
  }
}

// ─── FKF Fixture Scraper ─────────────────────────────────────────────────────

export async function fetchFkfFixtures(): Promise<ScrapedEvent[]> {
  try {
    const response = await axios.get('https://footballkenya.com/fixtures/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    const $ = cheerio.load(response.data as string);
    const events: ScrapedEvent[] = [];

    // Generic fixture extraction — adjust selectors if FKF site changes
    $('article, .fixture, .match, .game').each((_, el) => {
      const text = $(el).text().trim();
      if (text.includes(' vs ') || text.includes(' v ')) {
        const teams = text.match(/([A-Za-z\s]+)\s+vs?\s+([A-Za-z\s]+)/i);
        if (teams) {
          events.push({
            title: `FKF Match: ${teams[1].trim()} vs ${teams[2].trim()}`,
            description: `FKF Premier League or Cup match. Market resolves on the official full-time result published by FKF.`,
            category: 'Football',
            source: 'FKF Official',
            sourceUrl: 'https://footballkenya.com',
            detectedAt: new Date().toISOString(),
            tags: ['kenya', 'fkf', 'football'],
          });
        }
      }
    });

    return events.slice(0, 5);
  } catch {
    return [];
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function fetchAllKenyaEvents(keys: {
  newsApiKey: string;
  sportRadarApiKey: string;
}): Promise<ScrapedEvent[]> {
  logger.info('Fetching events from all Kenya sources...');

  const [rss, newsApi, sportRadar, fkf] = await Promise.allSettled([
    fetchRssEvents(),
    fetchNewsApiEvents(keys.newsApiKey),
    fetchSportRadarEvents(keys.sportRadarApiKey),
    fetchFkfFixtures(),
  ]);

  const all: ScrapedEvent[] = [
    ...(rss.status === 'fulfilled' ? rss.value : []),
    ...(newsApi.status === 'fulfilled' ? newsApi.value : []),
    ...(sportRadar.status === 'fulfilled' ? sportRadar.value : []),
    ...(fkf.status === 'fulfilled' ? fkf.value : []),
  ];

  // Deduplicate by similar title
  const seen = new Set<string>();
  const deduped = all.filter((e) => {
    const key = e.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.info(`Fetched ${deduped.length} unique events (${all.length} raw)`);
  return deduped;
}
