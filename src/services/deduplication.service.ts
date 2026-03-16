/**
 * Redis-backed deduplication service.
 * Prevents the same event from generating multiple markets.
 * Falls back to in-memory cache if Redis is unavailable.
 */

import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export class DeduplicationService {
  private redis: RedisClientType | null = null;
  private memCache = new Map<string, number>(); // key → expiry timestamp

  async connect(): Promise<void> {
    if (!config.redisUrl) {
      logger.warn('No REDIS_URL — using in-memory dedup cache');
      return;
    }

    try {
      this.redis = createClient({ url: config.redisUrl }) as RedisClientType;
      this.redis.on('error', (err: Error) => logger.warn('Redis dedup error', { err: err.message }));
      await this.redis.connect();
      logger.info('Dedup cache connected to Redis');
    } catch (err) {
      logger.warn('Failed to connect to Redis, using in-memory fallback', {
        err: (err as Error).message,
      });
      this.redis = null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }

  /** Returns true if the event/slug has already been processed */
  async isDuplicate(key: string): Promise<boolean> {
    const cacheKey = `ai-agent:dedup:${key}`;

    if (this.redis) {
      try {
        const val = await this.redis.get(cacheKey);
        return val !== null;
      } catch {
        // Fall through to mem cache
      }
    }

    const expiry = this.memCache.get(cacheKey);
    return expiry !== undefined && Date.now() < expiry;
  }

  /** Mark a key as processed so it won't be processed again for TTL_SECONDS */
  async markProcessed(key: string): Promise<void> {
    const cacheKey = `ai-agent:dedup:${key}`;

    if (this.redis) {
      try {
        await this.redis.setEx(cacheKey, TTL_SECONDS, '1');
        return;
      } catch {
        // Fall through to mem cache
      }
    }

    this.memCache.set(cacheKey, Date.now() + TTL_SECONDS * 1000);
  }

  /** Generate a stable dedup key from an event title */
  static keyFromTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }
}
