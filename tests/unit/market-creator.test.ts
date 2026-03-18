import { MarketCreatorAgent } from '../../src/agents/market-creator.agent';
import type { ScrapedEvent } from '../../src/types';

const fakeMarket = {
  title: 'Will Gor Mahia win the FKF Cup Final?',
  description: 'Market settles based on FKF official result.',
  scenario: 'If Gor Mahia wins, Yes wins.',
  betType: 'consensus',
  category: 'Football',
  tags: ['kenya', 'fkf'],
  buyInAmount: 100,
  buyInCurrency: 'USD',
  closeTime: new Date(Date.now() + 3600000).toISOString(),
  settlementTime: new Date(Date.now() + 7200000).toISOString(),
  isFeatured: false,
  isTrending: false,
  settlementMethod: 'admin_report',
  oddsType: 'pari_mutuel',
  minimumTier: 'novice',
  outcomes: [{ optionText: 'Yes' }, { optionText: 'No' }],
  externalSource: 'ai-agent',
  externalId: 'fkf-final-2026',
  confidence: 88,
  settlementSource: 'footballkenya.com/results',
};

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: class {
      messages = {
        create: jest.fn().mockImplementation(({ messages }) => {
          const content = messages?.[0]?.content || '';
          if (String(content).includes('Headlines:')) {
            return Promise.resolve({
              content: [{ type: 'text', text: '[1, 0]' }],
              usage: { input_tokens: 10, output_tokens: 5 },
            });
          }
          if (String(content).toLowerCase().includes('vague')) {
            return Promise.resolve({
              content: [{ type: 'text', text: JSON.stringify({ ...fakeMarket, confidence: 40 }) }],
              usage: { input_tokens: 40, output_tokens: 20 },
            });
          }
          return Promise.resolve({
            content: [{ type: 'text', text: JSON.stringify(fakeMarket) }],
            usage: { input_tokens: 50, output_tokens: 40 },
          });
        }),
      };
    },
  };
});

describe('MarketCreatorAgent', () => {
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = 'test';
  });

  test('generates valid market JSON from event', async () => {
    const creator = new MarketCreatorAgent();
    const event: ScrapedEvent = {
      title: 'FKF Cup Final: Gor Mahia vs AFC Leopards',
      description: 'FKF Cup Final at Kasarani Stadium',
      category: 'Football',
      source: 'FKF',
      detectedAt: new Date().toISOString(),
    };

    const market = await creator.generateMarket(event);
    expect(market).toBeTruthy();
    expect(market?.title).toBeTruthy();
    expect(market?.betType).toMatch(/^(consensus|reflex|ladder|prisoner_dilemma|betrayal|divergence)$/);
    expect(market?.outcomes.length).toBeGreaterThanOrEqual(2);
    expect(market?.outcomes.length).toBeLessThanOrEqual(4);
    expect(market?.buyInCurrency).toMatch(/^(USD|KSH)$/);
    expect(market?.externalSource).toBe('ai-agent');
    expect(market?.confidence).toBeGreaterThanOrEqual(0);
    expect(market?.confidence).toBeLessThanOrEqual(100);
  });

  test('filters marketable headlines in batch', async () => {
    const creator = new MarketCreatorAgent();
    const flags = await creator.filterMarketableEvents([
      { title: 'IEBC announces election date', description: '', category: 'Politics', source: 'IEBC', detectedAt: new Date().toISOString() },
      { title: 'Random opinion piece', description: '', category: 'General', source: 'Blog', detectedAt: new Date().toISOString() },
    ]);

    expect(flags).toEqual([true, false]);
  });

  test('returns low confidence for vague events', async () => {
    const creator = new MarketCreatorAgent();
    const market = await creator.generateMarket({
      title: 'Vague thing might happen',
      description: 'This is a vague event with no clear outcome',
      category: 'General',
      source: 'Blog',
      detectedAt: new Date().toISOString(),
    });

    expect(market?.confidence).toBeLessThan(60);
  });
});
