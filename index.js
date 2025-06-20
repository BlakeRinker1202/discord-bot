require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fetch = require('node-fetch');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DEV_USER_IDS = process.env.DEV_USER_IDS.split(',').map(id => id.trim());
const UPTIME_FILE = './uptime.json';
const RESTART_FILE = './restart.json';
const RESTART_INTERVAL_MINUTES = 5;
let manualRestart = false;

// ======== PORT =========
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.status(200).send('✅ Bot is running');
});

app.listen(3000, () => {
  console.log('🌐 Web server is running on port 3000');
});

// ======== REST API FOR COMMANDS =========
const commands = [
  new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Manually restarts the bot (CPRO+ only)'),
  new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Shows how long the bot has been online'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Shows bot status and memory usage'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('🔁 Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error(err);
  }
})();

// ======== UPTIME TRACKING =========
let startupTime = Date.now();
function loadUptime() {
  if (fs.existsSync(UPTIME_FILE)) {
    const data = JSON.parse(fs.readFileSync(UPTIME_FILE));
    return data.startup || Date.now();
  }
  return Date.now();
}
function saveUptime() {
  fs.writeFileSync(UPTIME_FILE, JSON.stringify({ startup: startupTime }));
}
startupTime = loadUptime();

// ======== SCHEDULED RESTART =========
function isExact5MinuteMark(date) {
  return date.getMinutes() % 5 === 0 && date.getSeconds() === 0;
}
setInterval(() => {
  const now = new Date();
  if (isExact5MinuteMark(now)) {
    fs.writeFileSync(RESTART_FILE, JSON.stringify({ time: Date.now(), type: 'scheduled' }));
    process.exit(0);
  }
}, 1000);

// ======== ON BOT READY =========
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const restartInfo = fs.existsSync(RESTART_FILE) ? JSON.parse(fs.readFileSync(RESTART_FILE)) : null;
  const reason = restartInfo?.type || 'unknown';

  for (const id of DEV_USER_IDS) {
    try {
      const dev = await client.users.fetch(id);
      await dev.send(`✅ Bot is now online.\n🔁 Restart reason: **${reason}**\n🕒 <t:${Math.floor(Date.now() / 1000)}:F>`);
    } catch (err) {
      console.warn(`Failed to DM ${id}`);
    }
  }

  saveUptime();
});

// ======== HANDLE COMMANDS =========
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const member = interaction.guild?.members?.cache.get(interaction.user.id);
    const command = interaction.commandName;

    // /restart
    if (command === 'restart') {
      if (!member) return interaction.reply({ content: '❌ You must be in a server to use this.', ephemeral: true });
      const requiredRole = interaction.guild.roles.cache.find(r => r.id === process.env.REQUIRED_ROLE_ID);
      if (!requiredRole) return interaction.reply({ content: '❌ Role not found.', ephemeral: true });
      if (member.roles.highest.position < requiredRole.position) {
        return interaction.reply({ content: '❌ You do not have permission to restart the bot.', ephemeral: true });
      }

      await interaction.reply({ content: '🔁 Restarting bot...', ephemeral: true });
      for (const id of DEV_USER_IDS) {
        const dev = await client.users.fetch(id);
        await dev.send(`⚙️ Bot is restarting (manually triggered by ${interaction.user.tag}).`);
      }
      fs.writeFileSync(RESTART_FILE, JSON.stringify({ time: Date.now(), type: 'manual' }));
      process.exit(0);
    }

    // /uptime
    else if (command === 'uptime') {
      const now = Date.now();
      const uptimeMs = now - startupTime;
      const uptime = formatDuration(uptimeMs);
      const embed = new EmbedBuilder()
        .setTitle('📊 Bot Uptime')
        .addFields(
          { name: 'Bot Name', value: client.user.tag, inline: true },
          { name: 'Developers', value: DEV_USER_IDS.map(id => `<@${id}>`).join(', '), inline: true },
          { name: 'Uptime', value: uptime, inline: false },
        )
        .setColor(0x57F287)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /status
    else if (command === 'status') {
      const used = process.memoryUsage();
      const embed = new EmbedBuilder()
        .setTitle('📡 Bot Status')
        .addFields(
          { name: 'Bot Name', value: client.user.tag, inline: true },
          { name: 'RAM Used', value: `${(used.rss / 1024 / 1024).toFixed(2)} MB`, inline: true },
          { name: 'Uptime Since', value: `<t:${Math.floor(startupTime / 1000)}:F>`, inline: true },
        )
        .setColor(0x5865F2)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

  } catch (err) {
    console.error('Command error:', err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
    }
    reportIncident(`Slash command crash: ${err.message}`);
  }
});

// ======== ERROR HANDLERS & BETTERUPTIME =========
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  reportIncident('Uncaught Exception: ' + err.message);
  fs.writeFileSync(RESTART_FILE, JSON.stringify({ time: Date.now(), type: 'crash' }));
  process.exit(1);
});

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
  reportIncident('Unhandled Rejection: ' + err.message);
  fs.writeFileSync(RESTART_FILE, JSON.stringify({ time: Date.now(), type: 'crash' }));
  process.exit(1);
});

async function reportIncident(message) {
  if (!process.env.BETTERUPTIME_API_TOKEN || !process.env.BETTERUPTIME_SERVICE_ID) return;
  try {
    await fetch('https://betteruptime.com/api/v2/incidents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.BETTERUPTIME_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        incident: {
          title: message,
          service_id: process.env.BETTERUPTIME_SERVICE_ID
        }
      })
    });
  } catch (e) {
    console.error('Failed to report to BetterUptime:', e);
  }
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  return `${hrs}h ${mins}m ${secs}s`;
}

client.login(TOKEN);
