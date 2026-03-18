/**
 * Resolution Verifier Agent — uses Claude Sonnet to determine winning outcomes
 * from multi-source evidence, then triggers market settlement via the API.
 */

import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../config';
import { logger } from '../utils/logger';
import { MarketApiService } from '../services/market-api.service';
import type { MarketResponse, ResolutionVerification } from '../types';

export class ResolutionVerifierAgent {
  private readonly anthropic: Anthropic;

  constructor(private readonly marketApi: MarketApiService) {
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  /**
   * Main entry: find the winner and settle the market.
   * Returns true if settled, false if flagged for manual review.
   */
  async verifyAndSettle(market: MarketResponse): Promise<boolean> {
    if (market.status !== 'closed') {
      logger.debug(`Skipping market ${market._id} — status is ${market.status}`);
      return false;
    }

    logger.info('Starting resolution verification', {
      marketId: market._id,
      title: market.title,
    });

    // 1. Collect evidence from resolution sources
    const evidence = await this.collectEvidence(market);
    if (!evidence.length) {
      logger.warn('No evidence collected — flagging for manual review', { marketId: market._id });
      await this.flagForManualReview(market, 'No resolution data could be collected from sources');
      return false;
    }

    // 2. Ask Claude to determine the winner
    const verification = await this.determineWinner(market, evidence);

    if (!verification.shouldAutoSettle) {
      logger.warn(`Confidence ${verification.confidence}% too low for auto-settle`, {
        marketId: market._id,
        title: market.title,
        reasoning: verification.reasoning,
      });
      await this.flagForManualReview(market, `Low confidence: ${verification.confidence}%. ${verification.reasoning}`);
      return false;
    }

    // 3. Settle the market
    try {
      await this.marketApi.settleMarket(market._id, verification.winningOptionId);
      logger.info('✅ Market settled', {
        marketId: market._id,
        winner: verification.winningOption,
        confidence: verification.confidence,
      });
      return true;
    } catch (error) {
      logger.error('Settlement API call failed', {
        marketId: market._id,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /** Collect resolution evidence by scraping sources relevant to this market */
  private async collectEvidence(market: MarketResponse): Promise<string[]> {
    const evidence: string[] = [];
    const category = (market as any).category || '';
    const title = market.title.toLowerCase();

    // Determine which sources to check based on market content
    const scrapers: Array<() => Promise<string | null>> = [];

    // Always try Daily Nation for any Kenyan event
    if (title.includes('kenya') || category !== 'International') {
      scrapers.push(() => this.scrapeHeadlines('https://nation.africa/kenya', title, 'Daily Nation'));
    }

    // Sports
    if (['Sports', 'Football'].includes(category) || title.includes('fkf') || title.includes('harambee')) {
      scrapers.push(() => this.scrapeHeadlines('https://footballkenya.com/results', title, 'FKF Official'));
    }

    // Finance / Economics
    if (['Finance', 'Economics'].includes(category) || title.includes('cbk') || title.includes('interest rate') || title.includes('ksh') || title.includes('kes')) {
      scrapers.push(() => this.scrapeHeadlines('https://centralbank.go.ke', title, 'CBK'));
    }

    // Politics / Elections
    if (category === 'Politics' || title.includes('iebc') || title.includes('election')) {
      scrapers.push(() => this.scrapeHeadlines('https://www.iebc.or.ke', title, 'IEBC'));
    }

    // Always include a general Citizen Digital check
    scrapers.push(() => this.scrapeHeadlines('https://citizen.digital', title, 'Citizen Digital'));

    // Run all scrapers in parallel (with timeout)
    const results = await Promise.allSettled(
      scrapers.map((fn) => Promise.race([fn(), this.timeout<string | null>(8000, null)])),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        evidence.push(result.value);
      }
    }

    return evidence;
  }

  /** Lightweight scraper — looks for headlines related to the market title */
  private async scrapeHeadlines(url: string, marketTitle: string, sourceName: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AnteSocialBot/1.0)' },
        timeout: 6000,
      });

      const $ = cheerio.load(response.data as string);
      const headlines: string[] = [];

      // Extract text from common headline elements
      $('h1, h2, h3, h4, article, .headline, .article-title, [data-type="article"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 15 && text.length < 300) {
          headlines.push(text);
        }
      });

      // Filter headlines relevant to the market
      const keywords = marketTitle.split(' ').filter((w) => w.length > 4);
      const relevant = headlines.filter((h) =>
        keywords.some((kw) => h.toLowerCase().includes(kw.toLowerCase())),
      );

      if (!relevant.length) return null;

      return `${sourceName}: ${relevant.slice(0, 3).join(' | ')}`;
    } catch {
      return null;
    }
  }

  /** Ask Claude Sonnet to determine the winning outcome from evidence */
  private async determineWinner(
    market: MarketResponse,
    evidence: string[],
  ): Promise<ResolutionVerification> {
    const outcomesText = market.outcomes
      .map((o, i) => `${i + 1}. "${o.optionText}" (id: ${o._id})`)
      .join('\n');

    const prompt = `Determine the winning outcome for this prediction market based on collected evidence.

MARKET: "${market.title}"
DESCRIPTION: "${(market as any).description || 'N/A'}"

POSSIBLE OUTCOMES:
${outcomesText}

EVIDENCE COLLECTED:
${evidence.map((e, i) => `Source ${i + 1}: ${e}`).join('\n')}

Return ONLY this JSON:
{
  "winningOption": "<exact optionText from the list>",
  "winningOptionId": "<exact id from the list above>",
  "confidence": <0-100>,
  "allSourcesAgree": <true/false>,
  "reasoning": "<one sentence explanation>",
  "shouldAutoSettle": <true if confidence >= ${config.minConfidenceToSettle} AND allSourcesAgree>
}`;

    try {
      const stream = this.anthropic.messages.stream({
        model: 'claude-3-5-sonnet-20241022',  // Use Sonnet for resolution accuracy
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      });

      const message = await stream.finalMessage();
      const content = message.content[0];
      if (!content || content.type !== 'text') throw new Error('Unexpected response type');

      const text = content.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(`No JSON block found in response: ${text.substring(0, 100)}...`);
      
      const jsonText = jsonMatch[0].trim();
      const parsed = JSON.parse(jsonText) as Omit<ResolutionVerification, 'sources'>;
      return { ...parsed, sources: evidence };
    } catch (error) {
      logger.error('Resolution verification Claude call failed', { error: (error as Error).message });
      return {
        winningOption: '',
        winningOptionId: '',
        confidence: 0,
        allSourcesAgree: false,
        reasoning: `Claude error: ${(error as Error).message}`,
        shouldAutoSettle: false,
        sources: evidence,
      };
    }
  }

  /** Add an admin report to the market flagging it for manual resolution */
  private async flagForManualReview(market: MarketResponse, reason: string): Promise<void> {
    try {
      await this.marketApi.updateMarket(market._id, {
        adminReport: `⚠️ AI Agent flagged for manual review: ${reason}`,
      });
    } catch {
      // Non-critical — log and move on
    }
  }

  private timeout<T>(ms: number, fallback: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(fallback), ms));
  }
}
