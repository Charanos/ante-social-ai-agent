/**
 * Slack-based alerting with basic cooldown to avoid spam.
 */

import axios from 'axios';
import { config } from '../config';
import { logger } from './logger';

const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const lastSent = new Map<string, number>();

export async function sendSlackMessage(message: string) {
  if (!config.slackWebhookUrl) return;
  await axios.post(config.slackWebhookUrl, {
    text: `Ante Social AI Agent: ${message}`,
    username: 'AI Market Bot',
  });
}

export async function sendAlert(type: string, message: string) {
  const key = `${type}:${message}`;
  const now = Date.now();
  const last = lastSent.get(key) || 0;
  if (now - last < COOLDOWN_MS) return;

  try {
    await sendSlackMessage(message);
    lastSent.set(key, now);
  } catch (err) {
    logger.warn('Failed to send alert', { type, error: (err as Error).message });
  }
}
