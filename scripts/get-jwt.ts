/**
 * Helper script: logs in as the ante-agent user and prints the JWT.
 * Run once to populate AI_AGENT_JWT in your .env file.
 *
 * Usage:
 *   npm run seed:jwt
 * Or:
 *   npx ts-node scripts/get-jwt.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:3002';
const EMAIL = 'ante-agent@antesocial.co.ke';
const PASSWORD = '4lofrw;AUzBcz.8x';

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
