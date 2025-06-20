require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const app = express();

const RESTART_FILE = './last-restart.json';
let restartMessageId = null;

// ──────── EXPRESS SERVER ────────
app.get('/', (req, res) => {
  res.status(200).send('✅ Bot is running');
});
app.listen(process.env.PORT || 3000, () => {
  console.log('🌐 Web server is running on port 3000');
});

// ──────── DISCORD BOT CLIENT ────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ──────── RECORD RESTART INFO ────────
function recordRestart(manual = false, messageData = null) {
  fs.writeFileSync(RESTART_FILE, JSON.stringify({
    timestamp: Date.now(),
    manual: manual,
    messageData: messageData
  }));
}

function getLastRestartInfo() {
  if (!fs.existsSync(RESTART_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(RESTART_FILE));
    return data;
  } catch {
    return null;
  }
}

// ──────── BOT READY ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const restartInfo = getLastRestartInfo();
  const devIDs = process.env.DEV_USER_IDS?.split(',') || [];

  for (const id of devIDs) {
    try {
      const user = await client.users.fetch(id.trim());
      const message = restartInfo?.manual
        ? '🔁 Bot was manually restarted.'
        : '⚠️ Bot restarted due to a crash or deployment.';
      await user.send(`${message}\n⏱️ Restart time: <t:${Math.floor(Date.now() / 1000)}:F>`);
    } catch (err) {
      console.error(`❌ Failed to DM dev ${id}:`, err.message);
    }
  }

  // Edit the old restart message if available
  if (restartInfo?.messageData) {
    try {
      const { channelId, messageId } = restartInfo.messageData;
      const channel = await client.channels.fetch(channelId);
      const msg = await channel.messages.fetch(messageId);
      if (msg) await msg.edit('✅ Successfully restarted.');
    } catch (err) {
      console.error('⚠️ Failed to edit restart message:', err.message);
    }
  }

  // Assume crash/restart unless marked otherwise
  recordRestart(false);

  // 🔁 Schedule automatic restarts every 5 minutes (300,000ms)
  setInterval(() => {
    console.log('🕒 Auto-restarting...');
    recordRestart(true); // Not manual, but we want to mark it before shutdown
    process.exit(0);
  }, 10 * 60 * 1000);
});

// ──────── RESTART COMMAND ────────
client.on('messageCreate', async msg => {
  if (msg.content === '!restart') {
    const devIDs = process.env.DEV_USER_IDS?.split(',') || [];
    if (!devIDs.includes(msg.author.id)) return;

    const reply = await msg.reply('🔄 Restarting now...');
    recordRestart(true, {
      channelId: reply.channel.id,
      messageId: reply.id
    });

    process.exit(0);
  }
});

// ──────── ERROR HANDLING ────────
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
  recordRestart(false);
  process.exit(1);
});
process.on('unhandledRejection', reason => {
  console.error('💥 Unhandled Rejection:', reason);
  recordRestart(false);
  process.exit(1);
});

client.login(process.env.TOKEN);
