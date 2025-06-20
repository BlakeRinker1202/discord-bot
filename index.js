require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ──────── CONFIG ────────
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DEV_USER_IDS = process.env.DEV_USER_IDS.split(','); // comma-separated list
const RESTART_FILE = './restart-info.json';
const UPTIME_FILE = './uptime.json';

let wasManualRestart = false;
let wasScheduledRestart = false;

// ──────── BOT CLIENT ────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ──────── TIMESTAMP HELPERS ────────
function nowTs() {
  return Math.floor(Date.now() / 1000);
}

// ──────── RESTART TRACKING ────────
function recordRestart(type = 'crash') {
  const data = {
    timestamp: Date.now(),
    type: type
  };
  fs.writeFileSync(RESTART_FILE, JSON.stringify(data));
}

function getRestartInfo() {
  try {
    const data = JSON.parse(fs.readFileSync(RESTART_FILE));
    wasManualRestart = data.type === 'manual';
    wasScheduledRestart = data.type === 'scheduled';
    return data;
  } catch {
    return null;
  }
}

// ──────── UPTIME TRACKING ────────
function recordUptimeStart() {
  const data = {
    onlineSince: Date.now(),
    totalUptime: getTotalUptime() // carry over existing total uptime
  };
  fs.writeFileSync(UPTIME_FILE, JSON.stringify(data));
}

function getUptimeInfo() {
  try {
    return JSON.parse(fs.readFileSync(UPTIME_FILE));
  } catch {
    return { onlineSince: Date.now(), totalUptime: 0 };
  }
}

function getTotalUptime() {
  const info = getUptimeInfo();
  return info.totalUptime || 0;
}

function updateTotalUptime() {
  const info = getUptimeInfo();
  const sessionUptime = Date.now() - info.onlineSince;
  const total = sessionUptime + (info.totalUptime || 0);
  fs.writeFileSync(UPTIME_FILE, JSON.stringify({
    onlineSince: Date.now(),
    totalUptime: total
  }));
  return total;
}

// ──────── COMMAND SETUP ────────
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('uptime')
      .setDescription('Shows bot uptime and creator info.')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('✅ Slash commands registered.');
}

// ──────── RESTART MESSAGE HANDLING ────────
const restartMessages = new Map();

client.on('messageCreate', async message => {
  if (message.content === '!restart' && DEV_USER_IDS.includes(message.author.id)) {
    const reply = await message.reply('🔁 Restarting...');
    restartMessages.set(message.author.id, reply);
    recordRestart('manual');
    updateTotalUptime();
    process.exit(0);
  }
});

// ──────── READY EVENT ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const restartInfo = getRestartInfo();

  for (const devId of DEV_USER_IDS) {
    const devUser = await client.users.fetch(devId);
    if (!devUser) continue;

    let restartText = '🔁 Bot restarted';
    if (restartInfo?.type === 'manual') restartText = '🔁 Bot was manually restarted';
    else if (restartInfo?.type === 'scheduled') restartText = '⏰ Bot restarted on schedule';
    else restartText = '⚠️ Bot crashed and restarted';

    await devUser.send(`${restartText}\n⏱️ Time: <t:${nowTs()}:F>`);
  }

  const msg = restartMessages.get(DEV_USER_IDS[0]);
  if (msg) {
    try {
      await msg.edit('✅ Successfully restarted.');
    } catch {}

    restartMessages.delete(DEV_USER_IDS[0]);
  }

  recordRestart('crash'); // default to crash unless overridden
  recordUptimeStart();
});

// ──────── SLASH COMMANDS ────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'uptime') {
    const info = getUptimeInfo();
    const uptimeMs = Date.now() - info.onlineSince + (info.totalUptime || 0);
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const embed = new EmbedBuilder()
      .setTitle('📈 Bot Uptime')
      .setColor('Green')
      .addFields(
        { name: '🤖 Bot', value: `${client.user.tag}`, inline: true },
        { name: '👨‍💻 Developers', value: DEV_USER_IDS.map(id => `<@${id}>`).join(', '), inline: true },
        { name: '🕒 Uptime', value: `${days}d ${hours}h ${minutes}m ${seconds}s`, inline: true },
        { name: '🟢 Online Since', value: `<t:${Math.floor(info.onlineSince / 1000)}:F>` }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
});

// ──────── SCHEDULED RESTART EVERY 5 MINUTES ────────
function scheduleRestarts() {
  setInterval(() => {
    const now = new Date();
    const mins = now.getMinutes();
    if (mins % 5 === 0 && now.getSeconds() < 10) {
      const last = getRestartInfo();
      if (last && Date.now() - last.timestamp < 60_000) return; // cooldown 1 min
      recordRestart('scheduled');
      updateTotalUptime();
      process.exit(0);
    }
  }, 10_000);
}

process.on('SIGINT', updateTotalUptime);
process.on('SIGTERM', updateTotalUptime);
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  updateTotalUptime();
  process.exit(1);
});

registerCommands();
client.login(TOKEN);
scheduleRestarts();
