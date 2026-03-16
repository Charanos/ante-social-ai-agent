/**
 * Ante Social Market Engine API client.
 * Wraps all HTTP calls to the market-engine microservice.
 */

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { config } from '../config';
import { logger } from '../utils/logger';
import type {
  AIGeneratedMarket,
  CreateMarketPayload,
  MarketResponse,
  ResolutionVerification,
} from '../types';

export class MarketApiService {
  private readonly http: AxiosInstance;
  private jwtToken: string;

  constructor() {
    this.jwtToken = config.aiAgentJwt;

    this.http = axios.create({
      baseURL: config.marketEngineUrl,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Auto-retry on network errors and 5xx (up to 3 times)
    axiosRetry(this.http, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        (error.response?.status !== undefined && error.response.status >= 500),
    });

    // Auth header interceptor
    this.http.interceptors.request.use((req) => {
      if (this.jwtToken) {
        req.headers['Authorization'] = `Bearer ${this.jwtToken}`;
      }
      return req;
    });

    // Log response errors
    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err.response?.status;
        const data = err.response?.data;
        logger.error('Market API error', { status, data, url: err.config?.url });
        return Promise.reject(err);
      },
    );
  }

  /** Refresh JWT token using auth service login */
  async refreshJwt(): Promise<void> {
    try {
      const authHttp = axios.create({
        baseURL: config.authServiceUrl,
        timeout: 10000,
      });
      const response = await authHttp.post('/auth/login', {
        email: config.aiAgentEmail,
        password: config.aiAgentPassword,
      });
      this.jwtToken = response.data.access_token;
      logger.info('JWT refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh JWT', { error: (error as Error).message });
    }
  }

  /** POST /markets — Create a new market */
  async createMarket(market: AIGeneratedMarket): Promise<MarketResponse> {
    // Strip AI-internal fields not accepted by the API
    const { confidence, settlementSource, reasoning, ...apiPayload } = market;

    const payload: CreateMarketPayload = {
      ...apiPayload,
      externalSource: apiPayload.externalSource || 'ai-agent',
    };

    const response = await this.http.post<MarketResponse>('/markets', payload);
    return response.data;
  }

  /** GET /markets — Fetch markets with optional filters */
  async getMarkets(params: Record<string, unknown> = {}): Promise<{
    data: MarketResponse[];
    meta: { total: number; limit: number; offset: number };
  }> {
    const response = await this.http.get('/markets', { params });
    return response.data;
  }

  /** GET /markets/:id — Fetch a single market by ID or slug */
  async getMarket(id: string): Promise<MarketResponse> {
    const response = await this.http.get<MarketResponse>(`/markets/${id}`);
    return response.data;
  }

  /** PUT /markets/:id/close — Force-close an active market */
  async closeMarket(id: string): Promise<MarketResponse> {
    const response = await this.http.put<MarketResponse>(`/markets/${id}/close`);
    return response.data;
  }

  /** POST /markets/:id/settle — Settle a closed market */
  async settleMarket(id: string, winningOptionId?: string): Promise<MarketResponse> {
    const response = await this.http.post<MarketResponse>(`/markets/${id}/settle`, {
      winningOptionId,
    });
    return response.data;
  }

  /** PATCH /markets/:id — Update a market (add admin report, etc.) */
  async updateMarket(id: string, updates: Partial<CreateMarketPayload> & { adminReport?: string }): Promise<MarketResponse> {
    const response = await this.http.patch<MarketResponse>(`/markets/${id}`, updates);
    return response.data;
  }

  /** Verify the JWT is still valid; refresh if not */
  async ensureValidJwt(): Promise<void> {
    if (!this.jwtToken) {
      logger.warn('No JWT set — attempting login...');
      await this.refreshJwt();
      return;
    }

    // Test the JWT with a lightweight call
    try {
      await this.http.get('/markets?limit=1');
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      if (error?.response?.status === 401) {
        logger.warn('JWT expired — refreshing...');
        await this.refreshJwt();
      }
    }
  }
}
