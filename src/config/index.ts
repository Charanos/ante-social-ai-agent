/**
 * Central config — reads .env once at startup, typed and validated.
 */

import * as dotenv from 'dotenv';

// Load .env from the project root (process.cwd())
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  // MongoDB (direct access for dedup checks)
  mongodbUri: optional('MONGODB_URI', ''),

  // Backend API
  marketEngineUrl: optional('MARKET_ENGINE_URL', 'http://127.0.0.1:3003'),
  authServiceUrl: optional('AUTH_SERVICE_URL', 'http://127.0.0.1:3002'),

  // AI Agent Identity
  aiAgentUserId: optional('AI_AGENT_USER_ID', ''),
  aiAgentJwt: optional('AI_AGENT_JWT', ''),
  aiAgentEmail: 'ante-agent@antesocial.co.ke',
  aiAgentPassword: '4lofrw;AUzBcz.8x',

  // AI Model
  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  anthropicBaseUrl: optional('ANTHROPIC_BASE_URL', ''),
  anthropicAuthToken: optional('ANTHROPIC_AUTH_TOKEN', ''),

  // Data Sources
  newsApiKey: optional('NEWSAPI_KEY', ''),
  sportRadarApiKey: optional('SPORTRADAR_API_KEY', ''),
  apifyToken: optional('APIFY_TOKEN', ''),
  facebookToken: optional('FACEBOOK_ACCESS_TOKEN', ''),

  // Redis (for dedup caching)
  redisUrl: optional('REDIS_URL', ''),

  // Scheduler
  discoveryCron: optional('DISCOVERY_CRON', '0 */6 * * *'),
  resolutionCron: optional('RESOLUTION_CRON', '0 * * * *'),
  discoveryEnabled: optional('DISCOVERY_ENABLED', 'true') === 'true',
  resolutionEnabled: optional('RESOLUTION_ENABLED', 'true') === 'true',
  resolvePolymarket: optional('RESOLVE_POLYMARKET', 'true') === 'true',

  // Agent behavior
  minConfidenceToPost: Number(optional('MIN_CONFIDENCE_TO_POST', '80')),
  minConfidenceToSettle: Number(optional('MIN_CONFIDENCE_TO_SETTLE', '95')),
  maxMarketsPerRun: Number(optional('MAX_MARKETS_PER_RUN', '10')),
  defaultBuyIn: Number(optional('DEFAULT_BUY_IN', '100')),
  highValuePoolThreshold: Number(optional('HIGH_VALUE_POOL_THRESHOLD', '1000000')),

  // Polymarket
  polymarketGammaUrl: optional('POLYMARKET_GAMMA_API_URL', 'https://gamma-api.polymarket.com'),

  // Source toggles
  enableRss: optional('ENABLE_RSS', 'true') === 'true',
  enableNewsApi: optional('ENABLE_NEWSAPI', 'true') === 'true',
  enableSportRadar: optional('ENABLE_SPORTRADAR', 'true') === 'true',
  enableApify: optional('ENABLE_APIFY', 'true') === 'true',
  enableOfficialSources: optional('ENABLE_OFFICIAL_SOURCES', 'true') === 'true',
  enableReddit: optional('ENABLE_REDDIT', 'true') === 'true',
  enableFacebook: optional('ENABLE_FACEBOOK', 'false') === 'true',

  // Monitoring
  logLevel: optional('LOG_LEVEL', 'info'),
  slackWebhookUrl: optional('SLACK_WEBHOOK_URL', ''),
  monthlyBudgetUsd: Number(optional('MONTHLY_BUDGET_USD', '200')),

  // Admin HTTP Server
  httpEnabled: optional('AI_AGENT_HTTP_ENABLED', 'true') === 'true',
  httpHost: optional('AI_AGENT_HTTP_HOST', '0.0.0.0'),
  httpPort: Number(optional('AI_AGENT_HTTP_PORT', '4010')),

  // Environment
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') !== 'production',
};
