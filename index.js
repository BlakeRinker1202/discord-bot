require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const app = express();

const RESTART_FILE = './last-restart.json';

// ──────── EXPRESS ────────
app.get('/', (req, res) => {
  res.status(200).send('✅ Bot is running');
});
app.listen(process.env.PORT || 3000, () => {
  console.log('🌐 Web server is running on port 3000');
});

// ──────── CLIENT ────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ──────── RECORD RESTART ────────
function recordRestart(type = 'crash', messageData = null) {
  fs.writeFileSync(RESTART_FILE, JSON.stringify({
    timestamp: Date.now(),
    type: type, // manual, crash, scheduled
    messageData
  }));
}

function getLastRestartInfo() {
  if (!fs.existsSync(RESTART_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(RESTART_FILE));
  } catch {
    return null;
  }
}

// ──────── BOT READY ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const restartInfo = getLastRestartInfo();
  const devIDs = process.env.DEV_USER_IDS?.split(',') || [];

  const restartReason = {
    manual: '🔁 Bot was manually restarted.',
    crash: '⚠️ Bot restarted due to a crash.',
    scheduled: '⏱️ Bot auto-restarted (scheduled).'
  }[restartInfo?.type || 'crash'];

  for (const id of devIDs) {
    try {
      const user = await client.users.fetch(id.trim());
      await user.send(`${restartReason}\n⏱️ Restart time: <t:${Math.floor(Date.now() / 1000)}:F>`);
    } catch (err) {
      console.error(`❌ Failed to DM dev ${id}:`, err.message);
    }
  }

  if (restartInfo?.type === 'manual' && restartInfo.messageData) {
    try {
      const { channelId, messageId } = restartInfo.messageData;
      const channel = await client.channels.fetch(channelId);
      const msg = await channel.messages.fetch(messageId);
      if (msg) await msg.edit('✅ Successfully restarted.');
    } catch (err) {
      console.warn('⚠️ Could not edit restart message.');
    }
  }

  // Assume crash if not marked later
  recordRestart('crash');

  // 🔁 Scheduled restart every 5 minutes
  setTimeout(() => {
    console.log('🕒 Scheduled auto-restart...');
    recordRestart('scheduled');
    process.exit(0);
  }, 5 * 60 * 1000);
});

// ──────── RESTART COMMAND ────────
client.on('messageCreate', async msg => {
  if (msg.content === '!restart') {
    const devIDs = process.env.DEV_USER_IDS?.split(',') || [];
    if (!devIDs.includes(msg.author.id)) return;

    const reply = await msg.reply('🔄 Restarting now...');
    recordRestart('manual', {
      channelId: reply.channel.id,
      messageId: reply.id
    });

    process.exit(0);
  }
});

// ──────── ERROR HANDLERS ────────
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
  recordRestart('crash');
  process.exit(1);
});
process.on('unhandledRejection', reason => {
  console.error('💥 Unhandled Rejection:', reason);
  recordRestart('crash');
  process.exit(1);
});

client.login(process.env.TOKEN);
