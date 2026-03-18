/**
 * Polymarket resolver — settles Polymarket-synced markets using Gamma API winners.
 */

import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { sendAlert } from '../utils/alerts';
import type { MarketResponse } from '../types';
import { MarketApiService } from './market-api.service';

type PolymarketToken = {
  outcome?: string;
  winner?: boolean;
};

type PolymarketMarket = {
  id: string;
  tokens?: PolymarketToken[];
  active?: boolean;
  closed?: boolean;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

export class PolymarketResolverService {
  constructor(private readonly marketApi: MarketApiService) {}

  async resolveClosedPolymarketMarkets(): Promise<void> {
    if (!config.resolvePolymarket) {
      logger.info('Polymarket resolution disabled — skipping');
      return;
    }

    const result = await this.marketApi.getMarkets({
      status: 'closed',
      externalSource: 'polymarket',
      limit: 50,
    });
    const closedMarkets = result.data || [];
    if (!closedMarkets.length) return;

    logger.info(`Found ${closedMarkets.length} closed Polymarket markets to resolve`);

    for (const market of closedMarkets) {
      if (!market.externalId) continue;

      try {
        const pm = await this.fetchPolymarketMarket(market.externalId);
        const winner = pm.tokens?.find((t) => t.winner);
        if (!winner?.outcome) continue;

        const match = market.outcomes.find(
          (o) => normalize(o.optionText) === normalize(winner.outcome || ''),
        );
        if (!match) {
          logger.warn('No matching outcome for Polymarket winner', {
            marketId: market._id,
            winner: winner.outcome,
          });
          continue;
        }

        await this.marketApi.settleMarket(market._id, match._id);
        logger.info('✅ Polymarket market settled', {
          marketId: market._id,
          winner: winner.outcome,
        });

        await this.sleep(1500);
      } catch (error) {
        logger.error('Failed to resolve Polymarket market', {
          marketId: market._id,
          error: (error as Error).message,
        });
        await sendAlert(
          'polymarket',
          `Polymarket resolution failed for ${market.title} (${market._id}).`,
        );
      }
    }
  }

  private async fetchPolymarketMarket(id: string): Promise<PolymarketMarket> {
    const response = await axios.get<PolymarketMarket>(
      `${config.polymarketGammaUrl}/markets/${id}`,
      { timeout: 12000 },
    );
    return response.data;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
