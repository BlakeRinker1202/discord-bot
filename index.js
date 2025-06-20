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

// ──────── RESTART / CRASH / SCHEDULE DETECTION ────────
const RESTART_FILE = './last-restart.json';
let restartContext = { type: 'crash', timestamp: Date.now(), manualMessageId: null };

function recordRestart(type = 'crash', messageId = null) {
  restartContext = {
    type,
    timestamp: Date.now(),
    manualMessageId: messageId
  };
  fs.writeFileSync(RESTART_FILE, JSON.stringify(restartContext));
}

function getLastRestartInfo() {
  if (!fs.existsSync(RESTART_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(RESTART_FILE));
  } catch {
    return null;
  }
}

// ──────── STARTUP ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const devIDs = process.env.DEV_USER_IDS?.split(',') || [];
  const restartInfo = getLastRestartInfo();
  const nowUnix = Math.floor(Date.now() / 1000);
  const type = restartInfo?.type || 'crash';
  const message = {
    crash: '⚠️ Bot restarted due to a crash or deployment.',
    manual: '🔁 Bot was manually restarted.',
    scheduled: '🕒 Bot restarted on schedule.'
  }[type] || '⚠️ Bot restarted.';

  for (const id of devIDs) {
    try {
      const user = await client.users.fetch(id);
      await user.send(`${message}\n⏱️ Restart time: <t:${nowUnix}:F>`);
    } catch (e) {
      console.error(`❌ Could not DM dev ${id}`);
    }
  }

  if (restartInfo?.type === 'manual' && restartInfo.manualMessageId) {
    try {
      const guilds = await client.guilds.fetch();
      for (const [, guild] of guilds) {
        const channels = await guild.channels.fetch();
        for (const [, channel] of channels) {
          if (channel.isTextBased?.()) {
            try {
              const msg = await channel.messages.fetch(restartInfo.manualMessageId);
              await msg.edit('Successfully Restarted.');
              break;
            } catch {}
          }
        }
      }
    } catch {}
  }

  recordRestart(); // Record as crash by default after handling
});

// ──────── MANUAL RESTART ────────
client.on('messageCreate', async msg => {
  const devIDs = process.env.DEV_USER_IDS?.split(',') || [];
  if (msg.content === '!restart' && devIDs.includes(msg.author.id)) {
    const sent = await msg.reply('Restarting now...');
    recordRestart('manual', sent.id);
    process.exit(0);
  }
});

// ──────── SCHEDULED RESTART EVERY 5 MINUTES ────────
function scheduleRestart() {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const delay = ((5 - (minutes % 5)) * 60 - seconds) * 1000;

  setTimeout(() => {
    const lastRestart = getLastRestartInfo();
    if (
      !lastRestart ||
      lastRestart.type !== 'manual' ||
      Date.now() - lastRestart.timestamp > 2 * 60 * 1000 // ignore recent manual restarts
    ) {
      recordRestart('scheduled');
      process.exit(0);
    } else {
      console.log('⏳ Skipping scheduled restart (recent manual restart)');
      scheduleRestart(); // reschedule next one
    }
  }, delay);
}

scheduleRestart();

// ──────── ERROR HANDLERS ────────
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
  recordRestart('crash');
  process.exit(1);
});

process.on('unhandledRejection', err => {
  console.error('💥 Unhandled Rejection:', err);
  recordRestart('crash');
  process.exit(1);
});

client.login(process.env.TOKEN);
