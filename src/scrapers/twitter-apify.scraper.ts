/**
 * Twitter/X scraper using Apify actor.
 * Requires APIFY_TOKEN. Returns ScrapedEvent objects from key Kenyan accounts.
 */

import axios from 'axios';
import type { ScrapedEvent } from '../types';
import { detectCategory, isOfficialMarketable, normalizeHeadline } from './utils';

const POLITICS_HANDLES = [
  'WilliamsRuto',
  'RailaOdinga',
  'StateHouseKenya',
  'KenyaGovernment',
  'CSMusalia',
  'EASoipanTuya',
  '_AlfredMutua',
  'alicewahome_',
  'IEBC_Kenya',
  'RegistrarPPDT',
  'KimaniIchungwah',
  'OpiOle',
  'Senate_KE',
  'SakajaJohnson',
  'FMutua',
  'GovernorKibwana',
  'DailyNation',
  'StandardKenya',
  'KTNNewsKE',
  'CitizenTVKenya',
  'NTVKenya',
  'K24Tv',
];

const SPORTS_HANDLES = [
  'Harambee_Stars',
  'FKFOfficial',
  'GorMahiaFC',
  'AFCLeopards',
  'TuskerFCOfficial',
  'KCBFootballClub',
  'Athletics_Kenya',
  'EliudKipchoge',
  'FaithKipyegon',
  'FerdinandOmanyala',
  'SuperSportTV',
  'GoalKenya',
  'SonkoRescueTeam',
  'StarSportsKE',
  'SportPesa',
  'MozzartBetKenya',
  'BetikaKenya',
];

const BUSINESS_HANDLES = [
  'CentralBankKenya',
  'KenyaRevenue',
  'nse_plc',
  'CMA_Kenya',
  'SafaricomPLC',
  'EquityBank',
  'KCBGroup',
  'EastAfricanBL',
  'KenyaAirways',
  'BusinessDaily',
  'TheStarBusiness',
  'Kenyans',
];

const DEFAULT_HANDLES = Array.from(
  new Set([...POLITICS_HANDLES, ...SPORTS_HANDLES, ...BUSINESS_HANDLES]),
);

const DEFAULT_KEYWORDS = [
  'election',
  'debate',
  'MPC',
  'interest rate',
  'CBK',
  'FKF',
  'Harambee Stars',
  'NSE',
  'inflation',
  'budget',
  'uchaguzi',
  'mechi',
  'bunge',
  'tangaza',
  'gazette',
];

async function runApifyActor(actorId: string, input: Record<string, unknown>, token: string): Promise<any[]> {
  const base = `https://api.apify.com/v2/acts/${actorId}`;
  const runSyncUrl = `${base}/run-sync-get-dataset-items?token=${token}&timeout=60`;

  try {
    const res = await axios.post(runSyncUrl, input, { timeout: 65000 });
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray((res.data as any)?.data)) return (res.data as any).data;
  } catch {
    // fall through to async run
  }

  const runRes = await axios.post(
    `${base}/runs?token=${token}&waitForFinish=60`,
    input,
    { timeout: 65000 },
  );
  const datasetId = (runRes.data as any)?.data?.defaultDatasetId;
  if (!datasetId) return [];

  const itemsRes = await axios.get(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`,
    { timeout: 60000 },
  );
  return Array.isArray(itemsRes.data) ? itemsRes.data : [];
}

function mapTweetItem(item: any): ScrapedEvent | null {
  const text = (item.full_text || item.text || item.content || item.body || '').toString().trim();
  if (!text) return null;

  const title = normalizeHeadline(text.split('\n')[0]).slice(0, 140);
  if (!title) return null;

  const createdAt = item.created_at || item.createdAt || item.timestamp || item.date;
  const url =
    item.url ||
    item.tweetUrl ||
    item.permalink ||
    (item.id ? `https://twitter.com/i/web/status/${item.id}` : undefined);

  return {
    title,
    description: text,
    category: detectCategory(text),
    source: 'Twitter',
    sourceUrl: url,
    detectedAt: new Date().toISOString(),
    eventDate: createdAt ? new Date(createdAt).toISOString() : undefined,
    tags: ['kenya', 'twitter', 'social'],
  };
}

function mapTrendItem(item: any): ScrapedEvent | null {
  const name = (item?.name || item?.trend || item?.query || item?.topic || '').toString().trim();
  if (!name) return null;

  return {
    title: `Trending in Kenya: ${name}`,
    description: `Trending topic detected in Kenya: ${name}`,
    category: detectCategory(name),
    source: 'Twitter Trends',
    sourceUrl: item?.url || item?.link,
    detectedAt: new Date().toISOString(),
    tags: ['kenya', 'twitter', 'trends'],
  };
}

async function fetchTwitterTrends(apifyToken: string): Promise<ScrapedEvent[]> {
  if (!apifyToken) return [];
  const input = {
    woeid: 23424001, // Kenya
    maxItems: 50,
  };

  const items = await runApifyActor('apify/twitter-trends-scraper', input, apifyToken);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const event = mapTrendItem(item);
    if (!event) continue;
    if (!isOfficialMarketable(event.title)) continue;
    const key = event.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(event);
  }

  return events.slice(0, 10);
}

export async function fetchTwitterApifyEvents(apifyToken: string): Promise<ScrapedEvent[]> {
  if (!apifyToken) return [];

  const input = {
    handles: DEFAULT_HANDLES,
    searchTerms: DEFAULT_KEYWORDS,
    tweetsDesired: 40,
    addUserInfo: false,
    proxyConfig: { useApifyProxy: true },
  };

  const [items, trends] = await Promise.all([
    runApifyActor('apify/twitter-scraper', input, apifyToken),
    fetchTwitterTrends(apifyToken),
  ]);
  const events: ScrapedEvent[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const event = mapTweetItem(item);
    if (!event) continue;
    if (!isOfficialMarketable(event.title + ' ' + event.description)) continue;
    const key = event.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(event);
  }

  for (const trend of trends) {
    const key = trend.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(trend);
  }

  return events.slice(0, 25);
}
