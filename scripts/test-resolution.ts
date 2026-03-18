import { ResolutionVerifierAgent } from '../src/agents/resolution-verifier.agent';
import { MarketApiService } from '../src/services/market-api.service';
import { logger } from '../src/utils/logger';
import * as dotenv from 'dotenv';

dotenv.config();

async function testResolution() {
  const marketId = process.argv[2] || '69b9f7f3fb113e7b5c765b0b'; // Default to the Doge market
  
  const marketApi = new MarketApiService();
  const agent = new ResolutionVerifierAgent(marketApi);

  try {
    logger.info(`Fetching market ${marketId}...`);
    const market = await marketApi.getMarket(marketId);
    
    logger.info(`Triggering verification for: ${market.title}`);
    const settled = await agent.verifyAndSettle(market);
    
    logger.info(`Result: ${settled ? 'Settled' : 'Flagged for review'}`);
  } catch (error) {
    logger.error('Test failed', { error: (error as Error).message });
  }
}

testResolution();
