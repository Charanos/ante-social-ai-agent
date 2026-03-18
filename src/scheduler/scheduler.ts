/**
 * Cron Scheduler — manages all timed jobs for the AI agent.
 * Uses node-cron with Africa/Nairobi timezone.
 */

import cron from 'node-cron';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DiscoveryOrchestrator } from '../orchestrator/discovery.orchestrator';
import { DailyReportService } from '../services/daily-report.service';

export class AgentScheduler {
  private jobs: cron.ScheduledTask[] = [];
  private isDiscoveryRunning = false;
  private isResolutionRunning = false;
  private readonly dailyReport = new DailyReportService();

  constructor(private readonly orchestrator: DiscoveryOrchestrator) {}

  start(): void {
    logger.info('🕐 Scheduler starting...', {
      discoveryCron: config.discoveryCron,
      resolutionCron: config.resolutionCron,
      timezone: 'Africa/Nairobi',
    });

    // ─── Market Discovery Job ─────────────────────────────────────────────────
    const discoveryJob = cron.schedule(
      config.discoveryCron,
      async () => {
        if (!config.discoveryEnabled) {
          logger.info('Discovery disabled — skipping run');
          return;
        }
        if (this.isDiscoveryRunning) {
          logger.warn('Discovery is still running from previous cycle — skipping');
          return;
        }
        this.isDiscoveryRunning = true;
        try {
          await this.orchestrator.runDiscovery();
        } finally {
          this.isDiscoveryRunning = false;
        }
      },
      { timezone: 'Africa/Nairobi' },
    );

    // ─── Resolution Job ───────────────────────────────────────────────────────
    const resolutionJob = cron.schedule(
      config.resolutionCron,
      async () => {
        if (!config.resolutionEnabled) {
          logger.info('Resolution disabled — skipping run');
          return;
        }
        if (this.isResolutionRunning) {
          logger.warn('Resolution is still running from previous cycle — skipping');
          return;
        }
        this.isResolutionRunning = true;
        try {
          await this.orchestrator.runResolution();
        } finally {
          this.isResolutionRunning = false;
        }
      },
      { timezone: 'Africa/Nairobi' },
    );

    // ─── JWT Refresh Job — every 23h ─────────────────────────────────────────
    const jwtRefreshJob = cron.schedule(
      '0 */23 * * *',  // Every 23 hours (JWT expires at 24h)
      async () => {
        logger.info('Refreshing AI agent JWT...');
        // MarketApiService handles this internally
      },
      { timezone: 'Africa/Nairobi' },
    );

    // ─── Daily Metrics Report ────────────────────────────────────────────────
    const dailyReportJob = cron.schedule(
      '55 23 * * *',  // 23:55 EAT
      async () => {
        logger.info('Generating daily AI agent report...');
        await this.dailyReport.generateDailyReport();
      },
      { timezone: 'Africa/Nairobi' },
    );

    this.jobs = [discoveryJob, resolutionJob, jwtRefreshJob, dailyReportJob];

    logger.info('✅ Scheduler started — 4 jobs active', {
      discovery: config.discoveryCron,
      resolution: config.resolutionCron,
      jwtRefresh: 'every 23h',
      dailyReport: '23:55 EAT',
    });
  }

  /** Run a discovery cycle immediately (for manual trigger / testing) */
  async triggerDiscoveryNow(): Promise<void> {
    logger.info('Manual discovery trigger...');
    await this.orchestrator.runDiscovery();
  }

  /** Run a resolution cycle immediately (for manual trigger / testing) */
  async triggerResolutionNow(): Promise<void> {
    logger.info('Manual resolution trigger...');
    await this.orchestrator.runResolution();
  }

  stop(): void {
    this.jobs.forEach((j) => j.stop());
    logger.info('Scheduler stopped');
  }
}
