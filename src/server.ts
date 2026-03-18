/**
 * Lightweight HTTP control server for admin tooling.
 */

import http from 'http';
import { config } from './config';
import { logger } from './utils/logger';
import { metrics } from './utils/metrics';
import type { DiscoveryOrchestrator } from './orchestrator/discovery.orchestrator';
import { DailyReportService } from './services/daily-report.service';

type Json = Record<string, unknown>;

function jsonResponse(res: http.ServerResponse, status: number, payload: Json) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readBody(req: http.IncomingMessage): Promise<Json | null> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
  });
}

function sanitizeConfig() {
  return {
    discoveryCron: config.discoveryCron,
    resolutionCron: config.resolutionCron,
    discoveryEnabled: config.discoveryEnabled,
    resolutionEnabled: config.resolutionEnabled,
    resolvePolymarket: config.resolvePolymarket,
    minConfidenceToPost: config.minConfidenceToPost,
    minConfidenceToSettle: config.minConfidenceToSettle,
    maxMarketsPerRun: config.maxMarketsPerRun,
    defaultBuyIn: config.defaultBuyIn,
    highValuePoolThreshold: config.highValuePoolThreshold,
    monthlyBudgetUsd: config.monthlyBudgetUsd,
    enableRss: config.enableRss,
    enableNewsApi: config.enableNewsApi,
    enableSportRadar: config.enableSportRadar,
    enableApify: config.enableApify,
    enableOfficialSources: config.enableOfficialSources,
    enableReddit: config.enableReddit,
    enableFacebook: config.enableFacebook,
    hasAnthropicKey: Boolean(config.anthropicApiKey),
    hasNewsApiKey: Boolean(config.newsApiKey),
    hasApifyToken: Boolean(config.apifyToken),
    hasSportRadarKey: Boolean(config.sportRadarApiKey),
    hasFacebookToken: Boolean(config.facebookToken),
    redisConfigured: Boolean(config.redisUrl),
    slackConfigured: Boolean(config.slackWebhookUrl),
  };
}

function applyConfigUpdates(body: Json) {
  if (typeof body.discoveryEnabled === 'boolean') config.discoveryEnabled = body.discoveryEnabled;
  if (typeof body.resolutionEnabled === 'boolean') config.resolutionEnabled = body.resolutionEnabled;
  if (typeof body.resolvePolymarket === 'boolean') config.resolvePolymarket = body.resolvePolymarket;
  if (typeof body.minConfidenceToPost === 'number') config.minConfidenceToPost = body.minConfidenceToPost;
  if (typeof body.minConfidenceToSettle === 'number') config.minConfidenceToSettle = body.minConfidenceToSettle;
  if (typeof body.maxMarketsPerRun === 'number') config.maxMarketsPerRun = body.maxMarketsPerRun;
  if (typeof body.defaultBuyIn === 'number') config.defaultBuyIn = body.defaultBuyIn;
  if (typeof body.highValuePoolThreshold === 'number') config.highValuePoolThreshold = body.highValuePoolThreshold;
  if (typeof body.monthlyBudgetUsd === 'number') config.monthlyBudgetUsd = body.monthlyBudgetUsd;
  if (typeof body.enableRss === 'boolean') config.enableRss = body.enableRss;
  if (typeof body.enableNewsApi === 'boolean') config.enableNewsApi = body.enableNewsApi;
  if (typeof body.enableSportRadar === 'boolean') config.enableSportRadar = body.enableSportRadar;
  if (typeof body.enableApify === 'boolean') config.enableApify = body.enableApify;
  if (typeof body.enableOfficialSources === 'boolean') config.enableOfficialSources = body.enableOfficialSources;
  if (typeof body.enableReddit === 'boolean') config.enableReddit = body.enableReddit;
  if (typeof body.enableFacebook === 'boolean') config.enableFacebook = body.enableFacebook;
}

export function startAdminServer(orchestrator: DiscoveryOrchestrator) {
  if (!config.httpEnabled) {
    logger.info('AI agent HTTP server disabled');
    return;
  }

  const dailyReport = new DailyReportService();

  const server = http.createServer(async (req, res) => {
    const url = req.url || '/';
    const method = req.method || 'GET';

    if (url === '/health' && method === 'GET') {
      return jsonResponse(res, 200, {
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    }

    if (url === '/metrics' && method === 'GET') {
      return jsonResponse(res, 200, {
        metrics: metrics.snapshot(),
        uptimeSeconds: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
      });
    }

    if (url === '/config' && method === 'GET') {
      return jsonResponse(res, 200, sanitizeConfig());
    }

    if (url === '/config' && method === 'PATCH') {
      const body = (await readBody(req)) || {};
      applyConfigUpdates(body);
      return jsonResponse(res, 200, { success: true, config: sanitizeConfig() });
    }

    if (url === '/actions/discovery' && method === 'POST') {
      orchestrator.runDiscovery().catch((err) =>
        logger.error('Manual discovery failed', { error: (err as Error).message }),
      );
      return jsonResponse(res, 202, { ok: true, action: 'discovery' });
    }

    if (url === '/actions/resolution' && method === 'POST') {
      orchestrator.runResolution().catch((err) =>
        logger.error('Manual resolution failed', { error: (err as Error).message }),
      );
      return jsonResponse(res, 202, { ok: true, action: 'resolution' });
    }

    if (url === '/actions/daily-report' && method === 'POST') {
      dailyReport.generateDailyReport().catch((err) =>
        logger.error('Daily report failed', { error: (err as Error).message }),
      );
      return jsonResponse(res, 202, { ok: true, action: 'daily-report' });
    }

    return jsonResponse(res, 404, { error: 'Not found' });
  });

  server.on('error', (err: any) => {
    logger.error('AI agent admin server failed to start', {
      error: err.message,
      code: err.code,
      port: config.httpPort,
      host: config.httpHost,
    });
  });

  server.listen(config.httpPort, config.httpHost, () => {
    logger.info(`AI agent admin server listening on http://${config.httpHost}:${config.httpPort}`);
  });
}
