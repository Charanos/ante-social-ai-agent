/**
 * AI Market Creator — calls Claude to generate betting markets from events.
 * Uses Haiku for 90% of calls (cost-efficient), Sonnet for complex events.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { AIGeneratedMarket, ScrapedEvent } from '../types';

const SYSTEM_PROMPT = `You are an AI market creation agent for Ante Social, a Kenyan prediction market platform.
Your job is to generate betting markets from news events and return ONLY valid JSON.

OUTPUT SCHEMA (exactly — field names are critical):
{
  "title": string,           // Prediction question ending with "?"
  "description": string,     // 2-3 sentences explaining the event + settlement criteria
  "scenario": string,        // "If X happens, option A wins..." settlement clause
  "betType": string,         // MUST be exactly one of: consensus | reflex | ladder | prisoner_dilemma | betrayal | divergence
  "category": string,        // Exactly one of: Sports | Football | Politics | Finance | Economics | Crypto | Entertainment | Business | International
  "tags": string[],          // 3-6 lowercase tags. ALWAYS include "kenya"
  "buyInAmount": number,     // Always 100 unless instructed otherwise
  "buyInCurrency": string,   // MUST be exactly "USD" or "KSH" — UPPERCASE only
  "closeTime": string,       // ISO 8601 UTC — set to BEFORE the event resolves
  "settlementTime": string,  // ISO 8601 UTC — set to at least 24h AFTER closeTime
  "isFeatured": boolean,     // true only for major national events
  "isTrending": boolean,     // true if highly viral or time-sensitive
  "settlementMethod": "admin_report",
  "oddsType": "pari_mutuel",
  "minimumTier": "novice",
  "outcomes": [              // Exactly 2-4 items — mutually exclusive and MECE
    { "optionText": string } // SHORT labels — max 60 chars each
  ],
  "externalSource": "ai-agent",
  "externalId": string,      // kebab-case unique ID, e.g. "fkf-cup-final-2026-04-15"
  "confidence": number,      // 0-100: how marketable/verifiable this event is
  "settlementSource": string // URL or source name where result will be verified
}

RULES:
1. betType should almost always be "consensus" for Kenyan events
2. outcomes must be 2-4 mutually exclusive, completely exhaustive options — cover ALL possibilities
3. closeTime must be set to BEFORE the event outcome is known
4. settlementTime must be at least 12 hours after closeTime
5. confidence > 80: high quality, auto-post worthy
6. confidence 60-80: okay quality, flag for admin review
7. confidence < 60: too vague, subjective, or unverifiable — still generate it but note the low confidence
8. For sports matches with possible draw: include "Draw" as an outcome
9. Return ONLY the JSON object — no markdown, no explanation, no code blocks`;

export class MarketCreatorAgent {
  private readonly anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  /**
   * Generate a betting market from a scraped event.
   * Uses Haiku by default — switches to Sonnet for complex political/financial events.
   */
  async generateMarket(event: ScrapedEvent): Promise<AIGeneratedMarket | null> {
    const useComplexModel =
      event.category === 'Politics' || event.category === 'Finance';
    const model = useComplexModel
      ? 'claude-3-5-sonnet-20241022'
      : 'claude-3-5-haiku-20241022';

    const userPrompt = `Create a betting market for this Kenyan event:

HEADLINE: ${event.title}
DESCRIPTION: ${event.description}
CATEGORY: ${event.category}
SOURCE: ${event.source}${event.sourceUrl ? ` (${event.sourceUrl})` : ''}
DETECTED AT: ${event.detectedAt}${event.eventDate ? `\nEVENT DATE: ${event.eventDate}` : ''}
CURRENT TIME (UTC): ${new Date().toISOString()}

Return ONLY the JSON object.`;

    try {
      const message = await this.anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        logger.warn('Unexpected Claude response type', { type: content.type });
        return null;
      }

      // Parse JSON — strip any accidental markdown wrappers
      const jsonText = content.text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const market = JSON.parse(jsonText) as AIGeneratedMarket;

      if (event.imageUrl) {
        market.mediaUrl = event.imageUrl;
        market.mediaType = (event.imageType as 'image' | 'gif' | 'video' | 'none') || 'image';
      }

      logger.info('Market generated', {
        title: market.title,
        betType: market.betType,
        confidence: market.confidence,
        model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      });

      return market;
    } catch (error) {
      logger.error('Market generation failed', {
        event: event.title,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Batch check: given multiple headlines, return which ones are marketable.
   * This saves Claude calls — one call instead of N.
   */
  async filterMarketableEvents(events: ScrapedEvent[]): Promise<boolean[]> {
    if (!events.length) return [];

    const prompt = `You filter Kenyan news headlines for prediction market potential.

For each headline below, reply 1 (marketable) or 0 (skip).
Criteria for 1: Clear verifiable outcome, public interest, not too subjective, Kenya-specific (not already on Polymarket).
Criteria for 0: Too vague, subjective, international (EPL, US, crypto prices), or duplicate of Polymarket.

Headlines:
${events.map((e, i) => `${i + 1}. [${e.category}] ${e.title}`).join('\n')}

Return ONLY a JSON array: [1, 0, 1, ...]`;

    try {
      const message = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = message.content[0];
      if (content.type !== 'text') return events.map(() => true);

      const jsonText = content.text.replace(/```[^`]*```/g, '').trim();
      const jsonMatch = jsonText.match(/\[[\d,\s]+\]/);
      if (!jsonMatch) return events.map(() => true);

      const flags = JSON.parse(jsonMatch[0]) as number[];
      return flags.map((f) => f === 1);
    } catch {
      // On error, process all events (conservative fallback)
      return events.map(() => true);
    }
  }
}
