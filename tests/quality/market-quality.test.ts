import { MarketCreatorAgent } from '../../src/agents/market-creator.agent';

const runAI = process.env.RUN_AI_TESTS === 'true' && !!process.env.ANTHROPIC_API_KEY;
const describeIf = runAI ? describe : describe.skip;

describeIf('Market quality batch', () => {
  jest.setTimeout(60000);

  test('generates reasonable markets for Kenyan events', async () => {
    const creator = new MarketCreatorAgent();
    const events = [
      { title: 'CBK MPC Meeting April 2026', category: 'Finance' },
      { title: 'Harambee Stars vs Ethiopia AFCON Qualifier', category: 'Football' },
      { title: 'NSE Safaricom Q2 2026 Earnings', category: 'Business' },
      { title: 'Kenya CPI May 2026 release', category: 'Economics' },
      { title: 'FKF Premier League Week 30 Results', category: 'Football' },
    ];

    for (const event of events) {
      const market = await creator.generateMarket({
        title: event.title,
        description: event.title,
        category: event.category,
        source: 'test',
        detectedAt: new Date().toISOString(),
      });

      expect(market).toBeTruthy();
      expect(market?.outcomes.length).toBeGreaterThanOrEqual(2);
      expect(market?.confidence).toBeGreaterThanOrEqual(0);
    }
  });
});

