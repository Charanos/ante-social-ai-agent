/**
 * Facebook Graph API scraper for Kenya media pages.
 * Requires FACEBOOK_ACCESS_TOKEN.
 */

import axios from 'axios';
import type { ScrapedEvent } from '../types';
import { detectCategory, isLikelyMarketable } from './utils';

const FACEBOOK_PAGES = [
  'CitizenTVKenya',
  'NTVKenya',
  'KTNHome',
  'TheStarKenya',
  'DailyNation',
  'StandardKenya',
  'TukoNews',
  'GoalKenya',
  'MozzartBetKenya',
  'BetikaKenya',
  'SportPesaNews',
  'HarambeeStarsFans',
  'Kenyans.co.ke',
];

export async function fetchFacebookEvents(token: string): Promise<ScrapedEvent[]> {
  if (!token) return [];
  const events: ScrapedEvent[] = [];

  for (const page of FACEBOOK_PAGES) {
    try {
      const response = await axios.get(`https://graph.facebook.com/v20.0/${page}/posts`, {
        params: {
          access_token: token,
          fields: 'message,created_time,permalink_url',
          limit: 10,
        },
        timeout: 8000,
      });

      const posts = response.data?.data || [];
      for (const post of posts) {
        const message = String(post.message || '').trim();
        if (!message) continue;
        const title = message.split('\n')[0].slice(0, 140);
        if (!isLikelyMarketable(message)) continue;

        events.push({
          title,
          description: message,
          category: detectCategory(message),
          source: 'Facebook',
          sourceUrl: post.permalink_url,
          detectedAt: new Date().toISOString(),
          eventDate: post.created_time || undefined,
          tags: ['kenya', 'facebook', page.toLowerCase()],
        });
      }
    } catch {
      // ignore individual page failures
    }
  }

  return events.slice(0, 20);
}
