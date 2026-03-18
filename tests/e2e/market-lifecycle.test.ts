import axios from 'axios';

const MARKET_ENGINE_URL = process.env.MARKET_ENGINE_URL || 'http://127.0.0.1:3003';
const JWT = process.env.AI_AGENT_JWT;
const describeIf = JWT ? describe : describe.skip;

describeIf('AI market lifecycle (E2E)', () => {
  test('creates, closes, and settles a market', async () => {
    if (!JWT) return;

    const payload = {
      title: `E2E TEST MARKET — ${Date.now()}`,
      description: 'End-to-end lifecycle test market.',
      betType: 'consensus',
      buyInAmount: 100,
      buyInCurrency: 'USD',
      closeTime: new Date(Date.now() - 1000).toISOString(), // already closed
      settlementTime: new Date(Date.now() + 3600000).toISOString(),
      outcomes: [{ optionText: 'Yes' }, { optionText: 'No' }],
      externalSource: 'ai-agent',
      externalId: `e2e-${Date.now()}`,
      tags: ['e2e', 'auto-test'],
    };

    const createRes = await axios.post(`${MARKET_ENGINE_URL}/markets`, payload, {
      headers: { Authorization: `Bearer ${JWT}` },
    });
    expect(createRes.status).toBe(201);

    const marketId = createRes.data._id;
    const winningOptionId = createRes.data.outcomes[0]._id;

    await axios.put(`${MARKET_ENGINE_URL}/markets/${marketId}/close`, {}, {
      headers: { Authorization: `Bearer ${JWT}` },
    });

    const settleRes = await axios.post(
      `${MARKET_ENGINE_URL}/markets/${marketId}/settle`,
      { winningOptionId },
      { headers: { Authorization: `Bearer ${JWT}` } },
    );

    expect(settleRes.status).toBe(200);
    expect(settleRes.data.status).toBe('settled');
  });
});
