/**
 * Main entry point for the Ante Social AI Agent.
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load .env from the project root
dotenv.config();

import { config } from './config';
import { logger } from './utils/logger';
import { MarketApiService } from './services/market-api.service';
import { DeduplicationService } from './services/deduplication.service';
import { DiscoveryOrchestrator } from './orchestrator/discovery.orchestrator';
import { AgentScheduler } from './scheduler/scheduler';
import { startAdminServer } from './server';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

async function main() {
  logger.info('');
  logger.info('╔═══════════════════════════════════════════╗');
  logger.info('║   🤖  ANTE SOCIAL AI AGENT  🤖            ║');
  logger.info('║   Generating Kenyan Prediction Markets    ║');
  logger.info('╚═══════════════════════════════════════════╝');
  logger.info('');

  // ─── Validate required config ─────────────────────────────────────────────
  if (!config.anthropicApiKey) {
    logger.error('ANTHROPIC_API_KEY is not set — cannot start');
    process.exit(1);
  }
  if (!config.newsApiKey) {
    logger.warn('NEWSAPI_KEY not set — NewsAPI source will be skipped');
  }
  if (!config.apifyToken) {
    logger.warn('APIFY_TOKEN not set — Twitter monitoring will be skipped');
  }

  // ─── Initialize services ──────────────────────────────────────────────────
  const marketApi = new MarketApiService();
  const dedup = new DeduplicationService();
  await dedup.connect();

  // ─── Ensure JWT is valid ──────────────────────────────────────────────────
  if (!config.aiAgentJwt) {
    logger.warn('AI_AGENT_JWT not set — attempting auto-login...');
    await marketApi.refreshJwt();
  } else {
    await marketApi.ensureValidJwt();
  }

  const orchestrator = new DiscoveryOrchestrator(marketApi, dedup);
  const scheduler = new AgentScheduler(orchestrator);
  startAdminServer(orchestrator);

  // ─── Start scheduler ──────────────────────────────────────────────────────
  scheduler.start();

  // ─── Run immediately at startup (don't wait for first cron tick) ─────────
  logger.info('Running initial discovery cycle at startup...');
  await orchestrator.runDiscovery();

  logger.info('');
  logger.info('🚀 Agent is running. Listening for Kenya events...');
  logger.info(`   Discovery schedule: ${config.discoveryCron}`);
  logger.info(`   Resolution schedule: ${config.resolutionCron}`);
  logger.info('');

  // ─── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`\n⏹  Received ${signal} — shutting down gracefully...`);
    scheduler.stop();
    await dedup.disconnect();
    logger.info('✅ Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ─── CLI flags — useful for one-off runs ─────────────────────────────────
  const args = process.argv.slice(2);
  if (args.includes('--discover-once')) {
    logger.info('--discover-once flag: running single discovery then exiting');
    await orchestrator.runDiscovery();
    await dedup.disconnect();
    process.exit(0);
  }
  if (args.includes('--resolve-once')) {
    logger.info('--resolve-once flag: running single resolution then exiting');
    await orchestrator.runResolution();
    await dedup.disconnect();
    process.exit(0);
  }
}

main().catch((err) => {
  logger.error('Fatal error in main', { error: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
