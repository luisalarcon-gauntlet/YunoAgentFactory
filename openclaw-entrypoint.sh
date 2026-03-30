#!/bin/sh
set -e

CONFIG_DIR="/home/node/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"

mkdir -p "$CONFIG_DIR"

# Use Node.js (available in the OpenClaw image) to merge gateway config
# into openclaw.json without overwriting existing settings
node -e "
const fs = require('fs');
const configPath = '$CONFIG_FILE';

let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  // File doesn't exist or is invalid JSON — start fresh
}

// Ensure gateway settings for dashboard access
if (!config.gateway) config.gateway = {};
config.gateway.bind = config.gateway.bind || 'lan';
if (!config.gateway.controlUi) config.gateway.controlUi = {};
config.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback = true;
config.gateway.controlUi.dangerouslyDisableDeviceAuth = true;
config.gateway.controlUi.allowInsecureAuth = true;
if (!config.gateway.controlUi.allowedOrigins) {
  config.gateway.controlUi.allowedOrigins = [
    'http://127.0.0.1:18789',
    'http://localhost:18789'
  ];
}

// Set the auth token from OPENCLAW_GATEWAY_TOKEN env var so the gateway
// and backend always agree on the same token.
const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || '';
if (gatewayToken) {
  if (!config.gateway.auth) config.gateway.auth = {};
  config.gateway.auth.mode = 'token';
  config.gateway.auth.token = gatewayToken;
}

// Telegram is handled directly by the backend service (telegram_bot.py)
// via the Bot API — not through OpenClaw's channel system.
// Always disable OpenClaw's Telegram channel to avoid polling conflicts (409).
if (!config.channels) config.channels = {};
if (!config.channels.telegram) config.channels.telegram = {};
config.channels.telegram.enabled = false;
console.log('Telegram channel disabled in OpenClaw (handled by backend)');

// Configure Gemini as the web search provider (replaces DuckDuckGo)
const geminiKey = process.env.GEMINI_API_KEY || '';
if (geminiKey) {
  if (!config.tools) config.tools = {};
  if (!config.tools.web) config.tools.web = {};
  if (!config.tools.web.search) config.tools.web.search = {};
  config.tools.web.search.provider = 'gemini';
  if (!config.tools.web.search.gemini) config.tools.web.search.gemini = {};
  config.tools.web.search.gemini.apiKey = geminiKey;
  console.log('Web search provider set to Gemini');
} else {
  console.log('GEMINI_API_KEY not set — web search provider unchanged');
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Gateway dashboard origins:', JSON.stringify(config.gateway.controlUi.allowedOrigins));
"

# Chain to the original entrypoint, which handles its own setup then execs the CMD
exec docker-entrypoint.sh "$@"
