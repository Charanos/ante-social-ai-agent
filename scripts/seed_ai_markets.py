#!/usr/bin/env python3
"""
Seed initial AI markets by:
1) Pulling a few Kenya headlines (RSS)
2) Asking Anthropic to generate CreateMarketDto JSON
3) Posting markets to the market-engine API

Usage:
  python scripts/seed_ai_markets.py --limit 5
  python scripts/seed_ai_markets.py --events-file sample-events.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, List


SYSTEM_PROMPT = """You are an AI market creation agent for Ante Social, a Kenyan prediction market platform.
Your job is to generate betting markets from news events and return ONLY valid JSON.

OUTPUT SCHEMA (exactly — field names are critical):
{
  "title": string,
  "description": string,
  "scenario": string,
  "betType": string,
  "category": string,
  "tags": string[],
  "buyInAmount": number,
  "buyInCurrency": string,
  "closeTime": string,
  "settlementTime": string,
  "isFeatured": boolean,
  "isTrending": boolean,
  "settlementMethod": "admin_report",
  "oddsType": "pari_mutuel",
  "minimumTier": "novice",
  "outcomes": [{ "optionText": string }],
  "externalSource": "ai-agent",
  "externalId": string,
  "confidence": number,
  "settlementSource": string
}

RULES:
1. betType should almost always be "consensus" for Kenyan events
2. outcomes must be 2-4 mutually exclusive, completely exhaustive options
3. closeTime must be set to BEFORE the event outcome is known
4. settlementTime must be at least 12 hours after closeTime
5. confidence > 80: high quality, auto-post worthy
6. confidence 60-80: okay quality, flag for admin review
7. confidence < 60: too vague, subjective, or unverifiable — still generate it but note the low confidence
8. For sports matches with possible draw: include "Draw" as an outcome
9. If the event text is in Swahili, translate the title/description into clear English while keeping Kenyan names and entities
10. Return ONLY the JSON object — no markdown, no explanation, no code blocks"""


DEFAULT_RSS = [
    "https://nation.africa/kenya/rss.xml",
    "https://www.standardmedia.co.ke/rss/kenya.php",
    "https://www.capitalfm.co.ke/news/feed/",
]


def fetch_rss_events(url: str, limit: int = 5) -> List[Dict[str, str]]:
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = resp.read()
        root = ET.fromstring(data)
        items = root.findall(".//item")
        events = []
        for item in list(items)[:limit]: # type: ignore
            title = (item.findtext("title") or "").strip()
            description = (item.findtext("description") or title).strip()
            if not title:
                continue
            events.append(
                {
                    "title": title,
                    "description": description,
                    "category": "General",
                    "source": url,
                    "detectedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            )
        return events
    except Exception:
        return []


def load_events(events_file: str | None, limit: int) -> List[Dict[str, str]]:
    if events_file:
        with open(events_file, "r", encoding="utf-8") as f:
            events = json.load(f)
        return events[:limit]

    events: List[Dict[str, str]] = []
    for feed in DEFAULT_RSS:
        events.extend(fetch_rss_events(feed, limit=limit))
        if len(events) >= limit:
            break
    if events:
        return list(events)[:limit] # type: ignore

    # Fallback sample events
    fallback_events = [
        {
            "title": "CBK MPC Meeting April 2026",
            "description": "The CBK Monetary Policy Committee meets in April 2026 to set the Central Bank Rate.",
            "category": "Finance",
            "source": "centralbank.go.ke",
            "detectedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        {
            "title": "Harambee Stars vs Ethiopia AFCON Qualifier",
            "description": "Kenya plays Ethiopia in AFCON qualification. Market settles on full-time result.",
            "category": "Football",
            "source": "footballkenya.com",
            "detectedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    ]
    return list(fallback_events)[:limit] # type: ignore


def anthropic_request(payload: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
    auth_token = os.getenv("ANTHROPIC_AUTH_TOKEN", "")
    
    headers = {
        "content-type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/v1/messages",
        data=data,
        headers=headers,
        method="POST",
    )
    
    # FIX 1: Explicit type annotation so Pyre2 knows full_text is always str
    full_text: str = ""
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"DEBUG: Connected to proxy. Handling SSE stream...")
            for line_bytes in resp:
                line = line_bytes.decode("utf-8").strip()
                if not line:
                    continue
                
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        print("DEBUG: SSE Stream [DONE]")
                        break
                    
                    try:
                        chunk = json.loads(data_str)
                        if chunk.get("type") == "content_block_delta":
                            delta = chunk.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text_chunk: str = str(delta.get("text", ""))
                                full_text = str(full_text) + text_chunk
                        elif chunk.get("type") == "content_block_start":
                            cb = chunk.get("content_block", {})
                            if cb.get("type") == "thinking":
                                print("DEBUG: Model is thinking...")
                        elif chunk.get("type") == "message_start":
                            print("DEBUG: Message started")
                        elif chunk.get("type") == "error":
                            print(f"DEBUG PROXY ERROR: {chunk.get('error')}")
                    except json.JSONDecodeError:
                        print(f"DEBUG: Failed to parse SSE data: {data_str[:100]}")
                        continue
        
        if not full_text:
            print("ERROR: No text content accumulated from SSE stream")
            return {}
            
        print(f"\nDEBUG: Total text length: {len(full_text)}")
        return {"content": [{"type": "text", "text": full_text}]}
    except Exception as e:
        print(f"Error connecting to proxy: {e}")
        return {}


def generate_market(event: Dict[str, str], api_key: str, model: str) -> Dict[str, Any]:
    user_prompt = f"""Create a betting market for this Kenyan event:

HEADLINE: {event.get('title')}
DESCRIPTION: {event.get('description')}
CATEGORY: {event.get('category')}
SOURCE: {event.get('source')}
DETECTED AT: {event.get('detectedAt')}
CURRENT TIME (UTC): {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}

Return ONLY the JSON object."""
    payload = {
        "model": model,
        "max_tokens": 1024,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    resp = anthropic_request(payload, api_key)
    if not resp:
        print("ERROR: anthropic_request returned an empty response")
        return {}

    text: str = ""
    for content in resp.get("content", []):
        if content.get("type") == "text":
            text = content.get("text", "")
            break
    
    if not text:
        print("ERROR: No text found in AI response")
        return {}

    print(f"DEBUG: Raw AI Response: {text[:500]}...")

    try:
        # Strip code blocks if AI wrapped it
        clean_text = str(text).strip()
        if clean_text.startswith("```"):
            # Simple markdown stripper
            lines = clean_text.split("\n")
            if len(lines) > 0 and lines[0].startswith("```"):
                lines.pop(0)
            if len(lines) > 0 and lines[-1].startswith("```"):
                lines.pop(-1)
            clean_text = "\n".join(lines).strip()
        
        with open("last_market.json", "w", encoding="utf-8") as f:
            f.write(clean_text)
        
        market = json.loads(clean_text)
        return market
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse market JSON: {e}")
        print(f"Cleaned Text: {clean_text}")
        return {}


def post_market(market: Dict[str, Any], base_url: str, jwt: str) -> Dict[str, Any]:
    # Strip AI-only fields not accepted by API
    market.pop("confidence", None)
    market.pop("settlementSource", None)
    market.pop("reasoning", None)
    market["externalSource"] = market.get("externalSource") or "ai-agent"

    data = json.dumps(market).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/markets",
        data=data,
        headers={
            "content-type": "application/json",
            "Authorization": f"Bearer {jwt}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--events-file", type=str, default="")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    jwt = os.getenv("AI_AGENT_JWT", "")
    base_url = os.getenv("MARKET_ENGINE_URL", "http://127.0.0.1:3003")
    model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022")

    if not api_key:
        raise SystemExit("ANTHROPIC_API_KEY is required")
    if not jwt and not args.dry_run:
        raise SystemExit("AI_AGENT_JWT is required to POST markets")

    events = load_events(args.events_file or None, args.limit)
    if not events:
        raise SystemExit("No events available to seed")

    for event in events:
        market = generate_market(event, api_key, model)
        print(f"Generated market: {market.get('title')}")
        if args.dry_run:
            continue
        created = post_market(market, base_url, jwt)
        print(f"Created market: {created.get('_id')} {created.get('title')}")
        time.sleep(1.5)


if __name__ == "__main__":
    main()