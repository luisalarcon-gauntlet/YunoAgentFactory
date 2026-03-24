#!/bin/sh
set -e

CONFIG_DIR="/home/node/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"

mkdir -p "$CONFIG_DIR"

# Use Node.js (available in the OpenClaw image) to merge gateway and Telegram
# config into openclaw.json without overwriting existing settings
node -e "
const fs = require('fs');
const configPath = '$CONFIG_FILE';
const token = process.env.TELEGRAM_BOT_TOKEN || '';

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
if (!config.gateway.controlUi.allowedOrigins) {
  config.gateway.controlUi.allowedOrigins = [
    'http://127.0.0.1:18789',
    'http://localhost:18789'
  ];
}

// Merge Telegram bot token into channels without overwriting other keys
if (!config.channels) config.channels = {};
if (token) {
  if (!config.channels.telegram) config.channels.telegram = {};
  config.channels.telegram.enabled = true;
  config.channels.telegram.botToken = token;
  config.channels.telegram.dmPolicy = config.channels.telegram.dmPolicy || 'pairing';
  console.log('Telegram channel configured in', configPath);
} else {
  console.warn('WARNING: TELEGRAM_BOT_TOKEN not set — Telegram channel will not be configured');
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Gateway dashboard origins:', JSON.stringify(config.gateway.controlUi.allowedOrigins));
"

# Chain to the original entrypoint, which handles its own setup then execs the CMD
exec docker-entrypoint.sh "$@"
