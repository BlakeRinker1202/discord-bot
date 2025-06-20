require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const app = express();

const RESTART_FILE = './last-restart.json';
let wasManualRestart = false;

// ──────── EXPRESS KEEP-ALIVE ────────
app.get('/', (req, res) => {
  res.status(200).send('✅ Bot is running');
});
app.listen(3000, () => {
  console.log('🌐 Web server is running on port 3000');
});

// ──────── BOT CLIENT ────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ──────── RESTART TRACKING ────────
function recordRestart(manual = false) {
  fs.writeFileSync(RESTART_FILE, JSON.stringify({
    timestamp: Date.now(),
    manual: manual
  }));
}

function getLastRestartInfo() {
  if (!fs.existsSync(RESTART_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(RESTART_FILE));
    wasManualRestart = data.manual || false;
    return data;
  } catch (e) {
    return null;
  }
}

// ──────── STARTUP ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const devIDs = process.env.DEV_USER_IDS.split(',');
  const restartInfo = getLastRestartInfo();

  for (const id of devIDs) {
    try {
      const user = await client.users.fetch(id.trim());
      const msg = restartInfo?.manual
        ? '🔁 Bot was manually restarted.'
        : '⚠️ Bot restarted due to a crash, error, or scheduled restart.';
      await user.send(`${msg}\n⏱️ Restart time: <t:${Math.floor(Date.now() / 1000)}:F>`);
    } catch (e) {
      console.warn(`❌ Could not DM dev ${id}: ${e.message}`);
    }
  }

  recordRestart(false);
});

// ──────── MANUAL RESTART CMD ────────
client.on('messageCreate', async msg => {
  if (
    msg.content === '!restart' &&
    process.env.DEV_USER_IDS.split(',').includes(msg.author.id)
  ) {
    const reply = await msg.reply('Restarting now...');
    recordRestart(true);
    fs.writeFileSync('./last-restart-msg.json', JSON.stringify({ channel: msg.channelId, message: reply.id }));
    process.exit(0);
  }
});

// ──────── EDIT MESSAGE AFTER RESTART ────────
client.on('ready', async () => {
  try {
    const data = JSON.parse(fs.readFileSync('./last-restart-msg.json'));
    const channel = await client.channels.fetch(data.channel);
    const message = await channel.messages.fetch(data.message);
    await message.edit('Successfully restarted.');
    fs.unlinkSync('./last-restart-msg.json');
  } catch (err) {
    // Message not found or nothing to update
  }
});

// ──────── ERROR HANDLERS ────────
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
  recordRestart(false);
  process.exit(1);
});
process.on('unhandledRejection', err => {
  console.error('💥 Unhandled Rejection:', err);
  recordRestart(false);
  process.exit(1);
});

// ──────── AUTO RESTART EVERY 20 MINS ────────
setInterval(() => {
  console.log('⏱️ Scheduled auto-restart...');
  recordRestart(false);
  process.exit(0);
}, 10 * 60 * 1000); // 20 minutes

client.login(process.env.TOKEN);
