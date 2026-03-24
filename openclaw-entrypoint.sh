#!/bin/sh
set -e

CONFIG_DIR="/home/node/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"

mkdir -p "$CONFIG_DIR"

# Use Node.js (available in the OpenClaw image) to merge Telegram config
# into openclaw.json without overwriting other settings
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

if (!config.channels) config.channels = {};

if (token) {
  config.channels.telegram = {
    enabled: true,
    botToken: token,
    dmPolicy: 'pairing'
  };
  console.log('Telegram channel configured in', configPath);
} else {
  console.warn('WARNING: TELEGRAM_BOT_TOKEN not set — Telegram channel will not be configured');
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
"

# Chain to the original entrypoint, which handles its own setup then execs the CMD
exec docker-entrypoint.sh "$@"
