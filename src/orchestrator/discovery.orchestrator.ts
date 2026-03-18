/**
 * Discovery Orchestrator — coordinates the full market creation pipeline:
 * 1. Fetch Kenya events from all sources
 * 2. Pre-filter for marketability (batch Claude call)
 * 3. Dedup against already-processed events
 * 4. Generate market JSON for each event
 * 5. Post markets above confidence threshold to the API
 */

import { config } from '../config';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';
import { sendAlert } from '../utils/alerts';
import { MarketCreatorAgent } from '../agents/market-creator.agent';
import { ResolutionVerifierAgent } from '../agents/resolution-verifier.agent';
import { MarketApiService } from '../services/market-api.service';
import { PolymarketResolverService } from '../services/polymarket-resolver.service';
import { DeduplicationService } from '../services/deduplication.service';
import { fetchAllKenyaEvents } from '../scrapers/kenya-news.scraper';
import type { AIGeneratedMarket, MarketResponse } from '../types';

export class DiscoveryOrchestrator {
  private readonly creator: MarketCreatorAgent;
  private readonly resolver: ResolutionVerifierAgent;
  private readonly polymarketResolver: PolymarketResolverService;

  constructor(
    private readonly marketApi: MarketApiService,
    private readonly dedup: DeduplicationService,
  ) {
    this.creator = new MarketCreatorAgent();
    this.resolver = new ResolutionVerifierAgent(marketApi);
    this.polymarketResolver = new PolymarketResolverService(marketApi);
  }

  // ─── Market Discovery & Creation ────────────────────────────────────────────

  async runDiscovery(): Promise<void> {
    logger.info('═══ Market Discovery Run Starting ═══');

    try {
      // 1. Ensure JWT is valid before starting
      await this.marketApi.ensureValidJwt();

      // 2. Fetch events from all sources
      const events = await fetchAllKenyaEvents({
        newsApiKey: config.newsApiKey,
        sportRadarApiKey: config.sportRadarApiKey,
        apifyToken: config.apifyToken,
        facebookToken: config.facebookToken,
        enableRss: config.enableRss,
        enableNewsApi: config.enableNewsApi,
        enableSportRadar: config.enableSportRadar,
        enableApify: config.enableApify,
        enableOfficialSources: config.enableOfficialSources,
        enableReddit: config.enableReddit,
        enableFacebook: config.enableFacebook,
      });

      if (!events.length) {
        logger.info('No events fetched — ending discovery run');
        return;
      }
      metrics.eventsFetched += events.length;

      // 3. Pre-filter for marketability (one batch Claude call)
      const marketableFlags = await this.creator.filterMarketableEvents(events);
      const marketableEvents = events.filter((_, i) => marketableFlags[i]);
      logger.info(`${marketableEvents.length}/${events.length} events are marketable`);
      metrics.eventsMarketable += marketableEvents.length;

      // 4. Deduplicate against already-processed events
      const newEvents = [];
      for (const event of marketableEvents) {
        const key = DeduplicationService.keyFromTitle(event.title);
        if (await this.dedup.isDuplicate(key)) {
          logger.debug(`Skipping duplicate: ${event.title}`);
          continue;
        }
        newEvents.push(event);
      }
      logger.info(`${newEvents.length} new (non-duplicate) events to process`);
      metrics.eventsDeduped += newEvents.length;

      // 5. Process each new event (up to maxMarketsPerRun)
      let created = 0;
      let skipped = 0;
      const limit = Math.min(newEvents.length, config.maxMarketsPerRun);

      for (let i = 0; i < limit; i++) {
        const event = newEvents[i];
        const key = DeduplicationService.keyFromTitle(event.title);

        try {
          // Generate market JSON
          const market = await this.creator.generateMarket(event);
          if (!market) {
            await this.dedup.markProcessed(key); // Don't retry failed events
            skipped++;
            continue;
          }

          // Route based on confidence
          if (market.confidence >= config.minConfidenceToPost) {
            await this.postMarket(market, key);
            created++;
            metrics.marketsCreated += 1;
          } else if (market.confidence >= 60) {
            logger.info(
              `Low confidence (${market.confidence}) — queuing for admin review: ${market.title}`,
            );
            await this.postMarketAsDraft(market, key);
            created++;
            metrics.marketsDrafted += 1;
          } else {
            logger.info(`Very low confidence (${market.confidence}) — skipping: ${market.title}`);
            await this.dedup.markProcessed(key);
            skipped++;
            metrics.marketsSkipped += 1;
          }

          // Rate limit — small delay between Claude calls
          await this.sleep(1000);
        } catch (error) {
          logger.error(`Failed to process event: ${event.title}`, {
            error: (error as Error).message,
          });
        }
      }

      logger.info(`═══ Discovery Complete — Created: ${created}, Skipped: ${skipped} ═══`);
      metrics.logSummary('discovery');
      if (metrics.apiErrors >= 3) {
        await sendAlert('market-api', 'CRITICAL: Market API errors are spiking (>=3).');
      }
    } catch (error) {
      logger.error('Discovery run failed', { error: (error as Error).message });
    }
  }

  private async postMarket(market: AIGeneratedMarket, dedupKey: string): Promise<void> {
    const created = await this.marketApi.createMarket(market);
    await this.dedup.markProcessed(dedupKey);
    logger.info(`✅ Market created: "${created.title}" (id: ${created._id})`);
  }

  private async postMarketAsDraft(market: AIGeneratedMarket, dedupKey: string): Promise<void> {
    // Post as a draft so admins can review before going live
    const draftMarket: AIGeneratedMarket = {
      ...market,
      // We set status 'draft' via scheduledPublishTime (no immediate publish)
      // Note: the market engine sets status='scheduled' when scheduledPublishTime is provided
      scheduledPublishTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // +2 hours
    };
    const created = await this.marketApi.createMarket(draftMarket);
    await this.dedup.markProcessed(dedupKey);
    logger.info(`📋 Draft market queued: "${created.title}" (id: ${created._id}, confidence: ${market.confidence})`);
  }

  // ─── Market Resolution ────────────────────────────────────────────────────

  async runResolution(): Promise<void> {
    logger.info('═══ Resolution Run Starting ═══');

    try {
      await this.marketApi.ensureValidJwt();

      // Find all closed markets for resolution (AI, Native, etc.)
      const result = await this.marketApi.getMarkets({
        status: 'closed',
        limit: 50,
      });

      const closedMarkets: MarketResponse[] = result.data;
      logger.info(`Found ${closedMarkets.length} closed AI markets to resolve`);

      let settled = 0;
      let flagged = 0;

      for (const market of closedMarkets) {
        const wasSettled = await this.resolver.verifyAndSettle(market);
        if (wasSettled) settled++;
        else flagged++;
        metrics.resolutionSettled += wasSettled ? 1 : 0;
        metrics.resolutionFlagged += wasSettled ? 0 : 1;

        // Small delay between resolution checks
        await this.sleep(2000);
      }

      logger.info(`═══ Resolution Complete — Settled: ${settled}, Flagged: ${flagged} ═══`);
      metrics.logSummary('resolution');

      if (config.resolvePolymarket) {
        await this.polymarketResolver.resolveClosedPolymarketMarkets();
      }
    } catch (error) {
      logger.error('Resolution run failed', { error: (error as Error).message });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

