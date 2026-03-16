/**
 * Shared TypeScript types for the AI agent.
 * These map exactly to the Ante Social backend's CreateMarketDto.
 */

// ─── Market Types (from libs/common/src/constants/index.ts) ─────────────────

export type MarketBetType =
  | 'consensus'
  | 'reflex'
  | 'ladder'
  | 'prisoner_dilemma'
  | 'betrayal'
  | 'divergence';

export type MarketStatus =
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'active'
  | 'closed'
  | 'settling'
  | 'settled'
  | 'cancelled';

export type BuyCurrency = 'USD' | 'KSH';

// ─── CreateMarketDto shape (as accepted by POST /markets) ───────────────────

export interface MarketOutcome {
  optionText: string;
  fixedOdds?: number;
  mediaUrl?: string;
  mediaType?: 'image' | 'gif' | 'video' | 'none';
}

export interface CreateMarketPayload {
  title: string;
  description: string;
  scenario?: string;
  category?: string;
  tags?: string[];
  isFeatured?: boolean;
  isTrending?: boolean;
  betType: MarketBetType;         // stored as betType in DB
  marketType?: MarketBetType;     // alias — API accepts both
  buyInAmount: number;
  buyInCurrency?: BuyCurrency;
  closeTime: string;              // ISO 8601 UTC
  settlementTime: string;         // ISO 8601 UTC, >= closeTime
  startTime?: string;
  scheduledPublishTime?: string;
  marketDuration?: 'daily' | 'weekly';
  minimumTier?: 'novice' | 'analyst' | 'strategist' | 'high_roller';
  settlementMethod?: 'admin_report' | 'external_api';
  oddsType?: 'fixed' | 'pari_mutuel';
  outcomes: MarketOutcome[];      // min 2 outcomes required
  mediaUrl?: string;
  mediaType?: 'image' | 'gif' | 'video' | 'none';
  externalId?: string;
  externalSource?: string;
}

// ─── AI-generated market (extends CreateMarketPayload with AI-tracking fields)

export interface AIGeneratedMarket extends CreateMarketPayload {
  confidence: number;             // 0-100: marketability score (NOT sent to API)
  settlementSource: string;       // source URL/name for resolution (NOT sent to API)
  reasoning?: string;             // AI's reasoning (NOT sent to API)
}

// ─── API response shape ─────────────────────────────────────────────────────

export interface MarketOutcomeResponse {
  _id: string;
  optionText: string;
  participantCount: number;
  totalAmount: number;
  isWinningOutcome: boolean;
  payoutPerWinner: number;
  mediaType: string;
}

export interface MarketResponse {
  _id: string;
  title: string;
  slug: string;
  betType: MarketBetType;
  status: MarketStatus;
  outcomes: MarketOutcomeResponse[];
  totalPool: number;
  participantCount: number;
  externalId?: string;
  externalSource?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closeTime: string;
  settlementTime: string;
  winningOutcomeId?: string;
}

// ─── Scraped event shape ────────────────────────────────────────────────────

export interface ScrapedEvent {
  title: string;
  description: string;
  category: string;
  source: string;
  sourceUrl?: string;
  detectedAt: string;   // ISO 8601
  eventDate?: string;   // ISO 8601 — when the event actually happens/ends
  tags?: string[];
  imageUrl?: string;
  imageType?: string;
}

// ─── Resolution verification ─────────────────────────────────────────────────

export interface ResolutionVerification {
  winningOption: string;
  winningOptionId: string;
  confidence: number;
  allSourcesAgree: boolean;
  reasoning: string;
  shouldAutoSettle: boolean;
  sources: string[];
}
