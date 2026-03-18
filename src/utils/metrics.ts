/**
 * Lightweight in-memory metrics + cost estimation.
 * Resets when the process restarts.
 */

import { logger } from './logger';

type ClaudeUsage = { input_tokens?: number; output_tokens?: number };

const MODEL_COSTS_USD_PER_M_TOKEN: Record<string, { input: number; output: number }> = {
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
};

export class Metrics {
  eventsFetched = 0;
  eventsMarketable = 0;
  eventsDeduped = 0;
  marketsCreated = 0;
  marketsDrafted = 0;
  marketsSkipped = 0;
  resolutionSettled = 0;
  resolutionFlagged = 0;
  claudeErrors = 0;
  apiErrors = 0;
  jwtRefreshes = 0;

  private usageByModel = new Map<string, { input: number; output: number }>();

  recordClaudeUsage(model: string, usage: ClaudeUsage) {
    const current = this.usageByModel.get(model) || { input: 0, output: 0 };
    current.input += usage.input_tokens || 0;
    current.output += usage.output_tokens || 0;
    this.usageByModel.set(model, current);
  }

  recordClaudeError() {
    this.claudeErrors += 1;
  }

  recordApiError() {
    this.apiErrors += 1;
  }

  recordJwtRefresh() {
    this.jwtRefreshes += 1;
  }

  estimateCostUsd(): number {
    let total = 0;
    for (const [model, usage] of this.usageByModel.entries()) {
      const cost = MODEL_COSTS_USD_PER_M_TOKEN[model];
      if (!cost) continue;
      total += (usage.input / 1_000_000) * cost.input;
      total += (usage.output / 1_000_000) * cost.output;
    }
    return Math.round(total * 1000) / 1000;
  }

  snapshot() {
    return {
      eventsFetched: this.eventsFetched,
      eventsMarketable: this.eventsMarketable,
      eventsDeduped: this.eventsDeduped,
      marketsCreated: this.marketsCreated,
      marketsDrafted: this.marketsDrafted,
      marketsSkipped: this.marketsSkipped,
      resolutionSettled: this.resolutionSettled,
      resolutionFlagged: this.resolutionFlagged,
      claudeErrors: this.claudeErrors,
      apiErrors: this.apiErrors,
      jwtRefreshes: this.jwtRefreshes,
      estimatedCostUsd: this.estimateCostUsd(),
    };
  }

  logSummary(label: string) {
    logger.info(`AI metrics summary: ${label}`, this.snapshot());
  }

  reset() {
    this.eventsFetched = 0;
    this.eventsMarketable = 0;
    this.eventsDeduped = 0;
    this.marketsCreated = 0;
    this.marketsDrafted = 0;
    this.marketsSkipped = 0;
    this.resolutionSettled = 0;
    this.resolutionFlagged = 0;
    this.claudeErrors = 0;
    this.apiErrors = 0;
    this.jwtRefreshes = 0;
    this.usageByModel.clear();
  }
}

export const metrics = new Metrics();

