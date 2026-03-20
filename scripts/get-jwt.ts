/**
 * Helper script: logs in as the ante-agent user and prints the JWT.
 * Run once to populate AI_AGENT_JWT in your .env file.
 *
 * Usage:
 *   npm run seed:jwt
 * Or:
 *   npx ts-node scripts/get-jwt.ts
 */

import axios from 'axios';
import { config } from '../src/config';

const AUTH_URL = config.authServiceUrl;
const EMAIL = config.aiAgentEmail;
const PASSWORD = config.aiAgentPassword;

async function getJwt() {
  console.log(`\n🔑 Getting JWT for: ${EMAIL}`);
  console.log(`   Auth service: ${AUTH_URL}\n`);

  try {
    const response = await axios.post(`${AUTH_URL}/auth/login`, {
      email: EMAIL,
      password: PASSWORD,
    });

    const { access_token, refresh_token } = response.data;

    console.log('✅ Login successful!\n');
    console.log('──────────────────────────────────────────────────');
    console.log('Add this to ante-social-ai-agent/.env:');
    console.log('──────────────────────────────────────────────────');
    console.log(`AI_AGENT_JWT=${access_token}`);
    console.log('');
    console.log('(Optional) Refresh token for long-lived sessions:');
    console.log(`AI_AGENT_REFRESH_TOKEN=${refresh_token}`);
    console.log('──────────────────────────────────────────────────\n');
  } catch (error) {
    const err = error as any;
    console.error('❌ Login failed:', err.response?.data || err.message);
    console.error('');
    console.error('Make sure:');
    console.error('  1. The backend auth-service is running (port 3002)');
    console.error('  2. The ante-agent user was seeded (run seed-ai-agent.ts)');
    console.error('  3. AUTH_SERVICE_URL is correct in .env');
    process.exit(1);
  }
}

getJwt().catch(console.error);
