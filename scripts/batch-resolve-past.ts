import { ResolutionVerifierAgent } from '../src/agents/resolution-verifier.agent';
import { MarketApiService } from '../src/services/market-api.service';
import { logger } from '../src/utils/logger';
import * as dotenv from 'dotenv';

dotenv.config();

async function batchResolve() {
  const marketApi = new MarketApiService();
  const agent = new ResolutionVerifierAgent(marketApi);

  try {
    logger.info('Fetching all closed, unsettled markets...');
    const response = await marketApi.getMarkets({ status: 'closed', limit: 200 });
    const markets = response.data.filter(m => !m.winningOutcomeId);

    logger.info(`Found ${markets.length} markets to resolve.`);

    for (const market of markets) {
      logger.info(`Processing market: ${market.title} (${market._id})`);
      try {
        const settled = await agent.verifyAndSettle(market);
        logger.info(`Market ${market._id} result: ${settled ? '✅ Settled' : '⚠️ Flagged'}`);
      } catch (err) {
        logger.error(`Failed to process market ${market._id}`, { error: (err as Error).message });
      }

      // 2-second delay to avoid AI rate limits (especially for Claude)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logger.info('Batch resolution complete.');
  } catch (error) {
    logger.error('Batch resolution failed', { error: (error as Error).message });
  }
}

batchResolve();
