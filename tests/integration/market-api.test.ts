import axios from 'axios';

const MARKET_ENGINE_URL = process.env.MARKET_ENGINE_URL || 'http://127.0.0.1:3003';
const JWT = process.env.AI_AGENT_JWT;

const describeIf = JWT ? describe : describe.skip;

describeIf('Market API integration', () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    if (!JWT) return;
    await Promise.all(
      createdIds.map((id) =>
        axios.delete(`${MARKET_ENGINE_URL}/markets/${id}`, {
          headers: { Authorization: `Bearer ${JWT}` },
        }).catch(() => null),
      ),
    );
  });

  test('creates and settles a market', async () => {
    if (!JWT) return;
    const payload = {
      title: `TEST MARKET — AUTO DELETE — ${Date.now()}`,
      description: 'Automated integration test market.',
      betType: 'consensus',
      buyInAmount: 100,
      closeTime: new Date(Date.now() + 3600000).toISOString(),
      settlementTime: new Date(Date.now() + 7200000).toISOString(),
      outcomes: [{ optionText: 'Yes' }, { optionText: 'No' }],
      externalSource: 'ai-agent',
      externalId: `test-market-${Date.now()}`,
      tags: ['test', 'auto-delete'],
    };

    const createRes = await axios.post(`${MARKET_ENGINE_URL}/markets`, payload, {
      headers: { Authorization: `Bearer ${JWT}` },
    });

    expect(createRes.status).toBe(201);
    const marketId = createRes.data._id;
    const winningOptionId = createRes.data.outcomes[0]._id;
    createdIds.push(marketId);

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
    expect(settleRes.data.winningOutcomeId).toBe(winningOptionId);
  });

  test('rejects market without auth', async () => {
    const payload = {
      title: `TEST MARKET — NO AUTH — ${Date.now()}`,
      description: 'Unauthorized test market.',
      betType: 'consensus',
      buyInAmount: 100,
      closeTime: new Date(Date.now() + 3600000).toISOString(),
      settlementTime: new Date(Date.now() + 7200000).toISOString(),
      outcomes: [{ optionText: 'Yes' }, { optionText: 'No' }],
    };

    await expect(
      axios.post(`${MARKET_ENGINE_URL}/markets`, payload),
    ).rejects.toMatchObject({ response: { status: 401 } });
  });

  test('rejects market with one outcome', async () => {
    if (!JWT) return;
    const payload = {
      title: `TEST MARKET — BAD OUTCOMES — ${Date.now()}`,
      description: 'Invalid market with one outcome.',
      betType: 'consensus',
      buyInAmount: 100,
      closeTime: new Date(Date.now() + 3600000).toISOString(),
      settlementTime: new Date(Date.now() + 7200000).toISOString(),
      outcomes: [{ optionText: 'Only one' }],
      externalSource: 'ai-agent',
      externalId: `test-bad-${Date.now()}`,
    };

    await expect(
      axios.post(`${MARKET_ENGINE_URL}/markets`, payload, {
        headers: { Authorization: `Bearer ${JWT}` },
      }),
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
});
