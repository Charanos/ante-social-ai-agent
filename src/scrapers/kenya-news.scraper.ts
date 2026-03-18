/**
 * News Scraper â€” fetches events from Kenyan RSS feeds and news sites.
 * Returns structured ScrapedEvent objects for the market creator agent.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
// @ts-ignore â€” feedparser-promised has no types
import feedparser from 'feedparser-promised';
import { logger } from '../utils/logger';
import type { ScrapedEvent } from '../types';
import { detectCategory, isLikelyMarketable, isUsableHeadline, normalizeHeadline } from './utils';
import { fetchOfficialKenyaEvents } from './official-sources.scraper';
import { fetchTwitterApifyEvents } from './twitter-apify.scraper';
import { fetchRedditEvents } from './reddit.scraper';
import { fetchFacebookEvents } from './facebook.scraper';

interface RSSItem {
  title: string;
  description?: string;
  summary?: string;
  link?: string;
  pubDate?: Date;
  date?: Date;
  [key: string]: unknown;
}

// â”€â”€â”€ RSS Feed Sources â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RSS_SOURCES: Array<{ name: string; url: string; category: string; homepage?: string }> = [
  {
    name: 'Daily Nation',
    url: 'https://nation.africa/kenya/rss.xml',
    homepage: 'https://nation.africa/kenya',
    category: 'General',
  },
  {
    name: 'Business Daily',
    url: 'https://www.businessdailyafrica.com',
    homepage: 'https://www.businessdailyafrica.com',
    category: 'Finance',
  },
  {
    name: 'The Star Kenya',
    url: 'https://www.the-star.co.ke',
    homepage: 'https://www.the-star.co.ke',
    category: 'General',
  },
  {
    name: 'Capital News',
    url: 'https://www.capitalfm.co.ke/news/feed/',
    homepage: 'https://www.capitalfm.co.ke/news',
    category: 'General',
  },
  {
    name: 'Standard Media',
    url: 'https://www.standardmedia.co.ke/rss/kenya.php',
    homepage: 'https://www.standardmedia.co.ke',
    category: 'General',
  },
];

const WEB_SOURCES: Array<{ name: string; url: string; category: string }> = [
  { name: 'Citizen Digital', url: 'https://www.citizen.digital', category: 'General' },
  { name: 'Tuko News', url: 'https://tuko.co.ke', category: 'General' },
  { name: 'Standard Media', url: 'https://www.standardmedia.co.ke/politics', category: 'Politics' },
  { name: 'Standard Media Sports', url: 'https://www.standardmedia.co.ke/sports', category: 'Sports' },
  { name: 'Business Daily', url: 'https://www.businessdailyafrica.com/bd/markets', category: 'Finance' },
];

async function discoverRssUrls(homepage?: string): Promise<string[]> {
  if (!homepage) return [];
  try {
    const response = await axios.get(homepage, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AnteSocialBot/1.0)' },
      timeout: 8000,
    });
    const $ = cheerio.load(response.data as string);
    const candidates = new Set<string>();

    $('link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][type="application/atom+xml"]').each(
      (_, el) => {
        const href = $(el).attr('href');
        if (href) candidates.add(new URL(href, homepage).toString());
      },
    );

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const normalized = href.toLowerCase();
      if (normalized.includes('rss') || normalized.includes('feed') || normalized.includes('atom')) {
        candidates.add(new URL(href, homepage).toString());
      }
    });

    const fallbackPaths = ['/rss', '/rss.xml', '/feed', '/feed.xml', '/feeds', '/feeds/rss'];
    fallbackPaths.forEach((path) => {
      try {
        candidates.add(new URL(path, homepage).toString());
      } catch {
        // ignore invalid URL
      }
    });

    return Array.from(candidates);
  } catch {
    return [];
  }
}

async function tryParseFeed(url: string): Promise<RSSItem[] | null> {
  try {
    return await feedparser.parse(url);
  } catch {
    return null;
  }
}

async function scrapeWebSource(source: { name: string; url: string; category: string }): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  try {
    const response = await axios.get(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AnteSocialBot/1.0)' },
      timeout: 8000,
    });
    const $ = cheerio.load(response.data as string);

    const seen = new Set<string>();
    $('h1, h2, h3, h4, a, article').each((_, el) => {
      const text = normalizeHeadline($(el).text());
      if (!isUsableHeadline(text)) return;
      if (!isLikelyMarketable(text)) return;

      const key = text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seen.has(key)) return;
      seen.add(key);

      events.push({
        title: text,
        description: text,
        category: detectCategory(text) || source.category,
        source: source.name,
        sourceUrl: source.url,
        detectedAt: new Date().toISOString(),
      });
    });
  } catch {
    return [];
  }

  return events.slice(0, 12);
}

export async function fetchWebNewsEvents(): Promise<ScrapedEvent[]> {
  const results = await Promise.allSettled(WEB_SOURCES.map((source) => scrapeWebSource(source)));
  const all: ScrapedEvent[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') all.push(...result.value);
  }
  return all;
}

// Category + marketability helpers live in ./utils

// â”€â”€â”€ NewsAPI integration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ RSS Feed scraper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function fetchRssEvents(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours

  for (const source of RSS_SOURCES) {
    const items = await tryParseFeed(source.url);
    let resolvedItems = items;

    if (!resolvedItems && source.homepage) {
      const discovered = await discoverRssUrls(source.homepage);
      for (const candidate of discovered) {
        resolvedItems = await tryParseFeed(candidate);
        if (resolvedItems) {
          logger.info(`Discovered RSS feed for ${source.name}`, { url: candidate });
          break;
        }
      }
    }

    if (!resolvedItems) {
      logger.warn(`RSS fetch failed for ${source.name}`, {
        error: 'RSS feed unavailable or not discoverable',
      });
      continue;
    }

    for (const item of resolvedItems.slice(0, 15)) {
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
  }

  return events;
}

// â”€â”€â”€ SportRadar Kenya Football â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function fetchSportRadarEvents(apiKey: string): Promise<ScrapedEvent[]> {
  if (!apiKey) return [];

  try {
    // SportRadar Soccer API â€” Kenya Premier League
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
        title: `${homeTeam} vs ${awayTeam} â€” Match Result`,
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
      logger.warn('SportRadar fetch 403 Forbidden â€” API key may lack access to the soccer/t2 endpoint.');
    } else {
      logger.warn('SportRadar fetch failed', { error: msg });
    }
    return [];
  }
}

// â”€â”€â”€ FKF Fixture Scraper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function fetchFkfFixtures(): Promise<ScrapedEvent[]> {
  try {
    const response = await axios.get('https://footballkenya.com/fixtures/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    const $ = cheerio.load(response.data as string);
    const events: ScrapedEvent[] = [];

    // Generic fixture extraction â€” adjust selectors if FKF site changes
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

// â”€â”€â”€ Main export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function fetchAllKenyaEvents(keys: {
  newsApiKey: string;
  sportRadarApiKey: string;
  apifyToken: string;
  enableRss?: boolean;
  enableNewsApi?: boolean;
  enableSportRadar?: boolean;
  enableApify?: boolean;
  enableOfficialSources?: boolean;
  enableReddit?: boolean;
  enableFacebook?: boolean;
  facebookToken?: string;
}): Promise<ScrapedEvent[]> {
  logger.info('Fetching events from all Kenya sources...');

  const [rss, web, newsApi, sportRadar, fkf, official, twitter, reddit, facebook] = await Promise.allSettled([
    keys.enableRss === false ? Promise.resolve([]) : fetchRssEvents(),
    keys.enableRss === false ? Promise.resolve([]) : fetchWebNewsEvents(),
    keys.enableNewsApi === false ? Promise.resolve([]) : fetchNewsApiEvents(keys.newsApiKey),
    keys.enableSportRadar === false ? Promise.resolve([]) : fetchSportRadarEvents(keys.sportRadarApiKey),
    fetchFkfFixtures(),
    keys.enableOfficialSources === false ? Promise.resolve([]) : fetchOfficialKenyaEvents(),
    keys.enableApify === false ? Promise.resolve([]) : fetchTwitterApifyEvents(keys.apifyToken),
    keys.enableReddit === false ? Promise.resolve([]) : fetchRedditEvents(),
    keys.enableFacebook === false ? Promise.resolve([]) : fetchFacebookEvents(keys.facebookToken || ''),
  ]);

  const all: ScrapedEvent[] = [
    ...(rss.status === 'fulfilled' ? rss.value : []),
    ...(web.status === 'fulfilled' ? web.value : []),
    ...(newsApi.status === 'fulfilled' ? newsApi.value : []),
    ...(sportRadar.status === 'fulfilled' ? sportRadar.value : []),
    ...(fkf.status === 'fulfilled' ? fkf.value : []),
    ...(official.status === 'fulfilled' ? official.value : []),
    ...(twitter.status === 'fulfilled' ? twitter.value : []),
    ...(reddit.status === 'fulfilled' ? reddit.value : []),
    ...(facebook.status === 'fulfilled' ? facebook.value : []),
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

