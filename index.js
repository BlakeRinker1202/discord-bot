require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');

const app = express();
app.get('/', (req, res) => res.send('✅ Bot is running'));
app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 Web server is running`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ──────── CONFIG ────────
const RESTART_FILE = './last-restart.json';
const UPTIME_FILE = './uptime.json';
const DEV_USER_IDS = process.env.DEV_USER_IDS.split(',').map(id => id.trim());

// ──────── UPTIME TRACKING ────────
let startTimestamp = Date.now();
function getStoredUptime() {
  if (fs.existsSync(UPTIME_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(UPTIME_FILE));
      return data.timestamp || Date.now();
    } catch {
      return Date.now();
    }
  }
  return Date.now();
}
function saveUptime() {
  fs.writeFileSync(UPTIME_FILE, JSON.stringify({ timestamp: startTimestamp }));
}

// ──────── RESTART LOGIC ────────
function recordRestart(manual = false, scheduled = false) {
  fs.writeFileSync(RESTART_FILE, JSON.stringify({
    timestamp: Date.now(),
    manual,
    scheduled
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

// ──────── READY ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const info = getLastRestartInfo();
  const restartType = info?.manual
    ? '🔁 Bot was manually restarted.'
    : info?.scheduled
    ? '🕒 Scheduled restart completed.'
    : '⚠️ Bot restarted due to a crash or deployment.';

  for (const id of DEV_USER_IDS) {
    try {
      const user = await client.users.fetch(id);
      user.send(`${restartType}\n⏱️ Restart time: <t:${Math.floor(Date.now() / 1000)}:F>`);
    } catch (e) {
      console.error(`❌ Failed to DM dev ${id}:`, e.message);
    }
  }

  startTimestamp = getStoredUptime();
  saveUptime();
  recordRestart(false, false);
});

// ──────── MESSAGE COMMANDS ────────
client.on('messageCreate', async message => {
  if (message.content === '!restart' && DEV_USER_IDS.includes(message.author.id)) {
    const reply = await message.reply('🔄 Restarting...');
    recordRestart(true, false);
    setTimeout(() => {
      reply.edit('✅ Successfully restarted!');
      process.exit(0);
    }, 1500);
  }

  if (message.content === '/uptime') {
    const uptimeMs = Date.now() - getStoredUptime();
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Uptime')
      .setColor('Green')
      .addFields(
        { name: 'Bot Name', value: client.user.tag, inline: true },
        { name: 'Creators', value: DEV_USER_IDS.map(id => `<@${id}>`).join(', '), inline: true },
        { name: 'Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: false }
      )
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
});

// ──────── SCHEDULED RESTART (5 MIN INTERVAL) ────────
let lastScheduled = 0;
setInterval(() => {
  const now = new Date();
  const mins = now.getMinutes();
  const secs = now.getSeconds();

  // Only restart at :00 of 5-minute intervals, with cooldown to prevent spamming
  if (mins % 5 === 0 && secs === 0 && Date.now() - lastScheduled > 60000) {
    lastScheduled = Date.now();
    recordRestart(false, true);
    process.exit(0);
  }
}, 1000);

// ──────── ERROR HANDLERS ────────
process.on('unhandledRejection', err => {
  console.error('❌ Unhandled Rejection:', err);
});
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
});

// ──────── LOGIN ────────
client.login(process.env.TOKEN);
