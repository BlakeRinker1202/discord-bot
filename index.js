require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const app = express();

// ──────── EXPRESS SERVER ────────
app.get('/', (req, res) => {
  res.status(200).send('✅ Bot is running');
});
app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 Web server is running on port ${process.env.PORT || 3000}`);
});

// ──────── DISCORD CLIENT ────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ──────── RESTART TRACKING ────────
const RESTART_FILE = './last-restart.json';
let wasManualRestart = false;
let wasScheduledRestart = false;
let restartMessageData = null;

function recordRestart(type = 'crash', messageData = null) {
  const data = {
    timestamp: Date.now(),
    type,
    messageData
  };
  fs.writeFileSync(RESTART_FILE, JSON.stringify(data));
}

function getLastRestartInfo() {
  if (!fs.existsSync(RESTART_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(RESTART_FILE));
    wasManualRestart = data.type === 'manual';
    wasScheduledRestart = data.type === 'scheduled';
    restartMessageData = data.messageData;
    return data;
  } catch {
    return null;
  }
}

// ──────── BOT READY ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const restartInfo = getLastRestartInfo();
  const devIDs = process.env.DEV_USER_ID.split(',');
  const restartType = restartInfo?.type || 'unknown';
  const readableType = {
    manual: '🔁 Manual restart',
    scheduled: '⏰ Scheduled restart',
    crash: '⚠️ Crash/redeploy',
  }[restartType] || '🔄 Restart';

  for (const id of devIDs) {
    try {
      const devUser = await client.users.fetch(id.trim());
      await devUser.send(`${readableType} occurred.\n⏱️ <t:${Math.floor(Date.now() / 1000)}:F>`);
    } catch (err) {
      console.error(`❌ Failed to DM dev ${id}:`, err.message);
    }
  }

  // Edit restart message
  if (restartInfo?.type === 'manual' && restartInfo.messageData) {
    try {
      const channel = await client.channels.fetch(restartInfo.messageData.channelId);
      const message = await channel.messages.fetch(restartInfo.messageData.messageId);
      await message.edit('✅ Successfully restarted.');
    } catch (err) {
      console.error(`❌ Failed to edit restart message:`, err.message);
    }
  }

  // Schedule the next clock-based restart
  scheduleExactRestart();

  recordRestart('crash');
});

// ──────── MANUAL RESTART COMMAND ────────
client.on('messageCreate', async msg => {
  if (msg.content === '!restart' && process.env.DEV_USER_ID.split(',').includes(msg.author.id)) {
    const sent = await msg.reply('🔄 Restarting now...');
    recordRestart('manual', {
      channelId: msg.channel.id,
      messageId: sent.id
    });
    process.exit(0);
  }
});

// ──────── EXACT TIME RESTART SCHEDULER ────────
function scheduleExactRestart() {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);

  const msUntilNextRestart = next.getTime() - now.getTime();
  console.log(`⏰ Scheduled restart in ${Math.floor(msUntilNextRestart / 1000)} seconds`);

  setTimeout(() => {
    console.log('🔁 Performing exact 5-minute restart');
    recordRestart('scheduled');
    process.exit(0);
  }, msUntilNextRestart);
}

// ──────── ERROR HANDLERS ────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
});

client.login(process.env.TOKEN);
