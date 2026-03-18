/**
 * Daily report generator (MongoDB-based).
 * Runs once per day and logs key AI agent metrics.
 */

import { MongoClient } from 'mongodb';
import { config } from '../config';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';
import { sendAlert, sendSlackMessage } from '../utils/alerts';

export class DailyReportService {
  private client: MongoClient | null = null;

  private async getClient(): Promise<MongoClient | null> {
    if (!config.mongodbUri) {
      logger.warn('MONGODB_URI not set — skipping daily report');
      return null;
    }
    if (this.client) return this.client;
    this.client = new MongoClient(config.mongodbUri, { serverSelectionTimeoutMS: 8000 });
    await this.client.connect();
    return this.client;
  }

  async generateDailyReport(): Promise<void> {
    const client = await this.getClient();
    if (!client) return;

    const db = client.db();
    const markets = db.collection('public_markets');

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [createdToday, settledToday, pendingResolution] = await Promise.all([
      markets.countDocuments({ externalSource: 'ai-agent', createdAt: { $gte: start } }),
      markets.countDocuments({ externalSource: 'ai-agent', status: 'settled', settlementTime: { $gte: start } }),
      markets.countDocuments({ externalSource: 'ai-agent', status: 'closed' }),
    ]);

    const costUsd = metrics.estimateCostUsd();
    const report = {
      date: start.toISOString().split('T')[0],
      marketsCreated: createdToday,
      marketsSettled: settledToday,
      pendingResolution,
      estimatedCostUsd: costUsd,
    };

    logger.info('Daily AI agent report', report);

    if (config.slackWebhookUrl) {
      await sendSlackMessage(
        `Daily report (${report.date}): created=${createdToday}, settled=${settledToday}, pending=${pendingResolution}, cost=$${costUsd.toFixed(2)}`,
      );
    }

    const projectedMonthly = costUsd * 30;
    if (config.monthlyBudgetUsd && projectedMonthly > config.monthlyBudgetUsd * 0.8) {
      await sendAlert('budget', `WARNING: AI costs projected at ~$${projectedMonthly.toFixed(2)} this month (80%+ of budget).`);
    }

    // Reset daily counters after report
    metrics.reset();
  }
}
