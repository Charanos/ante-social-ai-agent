/**
 * Reddit scraper for Kenya-related subreddits.
 * Uses public JSON endpoints (no auth required).
 */

import axios from 'axios';
import type { ScrapedEvent } from '../types';
import { detectCategory, isLikelyMarketable } from './utils';

const SUBREDDITS = ['Kenya', 'Nairobi', 'KenyanPolitics', 'KenyaFootball', 'africanews'];

export async function fetchRedditEvents(): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];

  for (const sub of SUBREDDITS) {
    try {
      const response = await axios.get(`https://www.reddit.com/r/${sub}/new.json`, {
        params: { limit: 15 },
        headers: { 'User-Agent': 'AnteSocialBot/1.0' },
        timeout: 8000,
      });

      const posts = response.data?.data?.children || [];
      for (const post of posts) {
        const data = post?.data;
        if (!data?.title) continue;
        const title = String(data.title).trim();
        const description = String(data.selftext || data.title).trim();
        if (!isLikelyMarketable(title + ' ' + description)) continue;

        events.push({
          title,
          description,
          category: detectCategory(title + ' ' + description),
          source: 'Reddit',
          sourceUrl: data.permalink ? `https://www.reddit.com${data.permalink}` : undefined,
          detectedAt: new Date().toISOString(),
          eventDate: data.created_utc ? new Date(data.created_utc * 1000).toISOString() : undefined,
          tags: ['kenya', 'reddit', sub.toLowerCase()],
        });
      }
    } catch {
      // ignore individual subreddit failures
    }
  }

  return events.slice(0, 20);
}
