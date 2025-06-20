require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ──────── UPTIME TRACKING ────────
const UPTIME_FILE = './uptime.json';
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

// ──────── RESTART TRACKING ────────
const RESTART_FILE = './last-restart.json';
const DEV_USER_IDS = process.env.DEV_USER_IDS.split(',').map(id => id.trim());
let restartMsgMap = new Map();

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
    const data = JSON.parse(fs.readFileSync(RESTART_FILE));
    return data;
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
    } catch {}
  }

  startTimestamp = getStoredUptime();
  saveUptime();
  recordRestart(false, false);
});

// ──────── MESSAGE HANDLER ────────
client.on('messageCreate', async message => {
  if (message.content === '!restart' && DEV_USER_IDS.includes(message.author.id)) {
    const reply = await message.reply('🔄 Restarting...');
    restartMsgMap.set(message.author.id, reply);
    recordRestart(true, false);
    process.exit(0);
  }

  if (message.content === '/uptime') {
    const uptimeMs = Date.now() - getStoredUptime();
    const uptimeSec = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;

    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Uptime')
      .setColor('Green')
      .addFields(
        { name: 'Bot Name', value: client.user.tag, inline: true },
        { name: 'Developers', value: DEV_USER_IDS.map(id => `<@${id}>`).join(', '), inline: true },
        { name: 'Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: false }
      )
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
});

// ──────── SCHEDULED RESTART EVERY 5 MINUTES ────────
setInterval(() => {
  const now = new Date();
  if (now.getSeconds() === 0 && now.getMinutes() % 5 === 0) {
    recordRestart(false, true);
    process.exit(0);
  }
}, 60 * 1000); // check every minute

// ──────── ERROR HANDLERS ────────
process.on('unhandledRejection', err => {
  console.error('❌ Unhandled Promise Rejection:', err);
});
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
});

// ──────── LOGIN ────────
client.login(process.env.TOKEN);
