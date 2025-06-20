require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, EmbedBuilder, ActivityType } = require('discord.js');
const express = require('express');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 3000;
const DEV_USER_IDS = process.env.DEV_USER_IDS?.split(',') || [];

let startupTime = Date.now();
let lastRestartTime = 0;
const cooldownMs = 60 * 1000; // 1 minute cooldown to avoid duplicate restarts

// ──────── EXPRESS SERVER ────────
app.get('/', (req, res) => res.status(200).send('✅ Bot is running'));
app.listen(PORT, () => console.log(`🌐 Web server is running on port ${PORT}`));

// ──────── DISCORD BOT CLIENT ────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

// ──────── RESTART TRACKING ────────
const RESTART_FILE = './last-restart.json';
let wasManual = false;
let wasScheduled = false;

function recordRestart({ manual = false, scheduled = false } = {}) {
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
    wasManual = data.manual || false;
    wasScheduled = data.scheduled || false;
    return data;
  } catch {
    return null;
  }
}

// ──────── STARTUP ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('Freshiez Assistant', { type: ActivityType.Watching });

  const restartInfo = getLastRestartInfo();
  const message = restartInfo?.manual
    ? '🔁 Bot was manually restarted.'
    : restartInfo?.scheduled
      ? '⏰ Bot was restarted on a schedule.'
      : '⚠️ Bot restarted due to a crash or deploy.';

  for (const id of DEV_USER_IDS) {
    try {
      const devUser = await client.users.fetch(id);
      await devUser.send(`${message}\n⏱️ Restart time: <t:${Math.floor(Date.now() / 1000)}:F>`);
    } catch (err) {
      console.warn(`❌ Could not DM developer ${id}: ${err.message}`);
    }
  }

  recordRestart(); // assume crash unless manual/scheduled set earlier
  registerSlashCommands();
});

// ──────── MANUAL RESTART ────────
client.on('messageCreate', async (msg) => {
  if (msg.content === '!restart' && DEV_USER_IDS.includes(msg.author.id)) {
    const reply = await msg.reply('🔄 Restarting now...');
    recordRestart({ manual: true });
    fs.writeFileSync('./restart-msg.json', JSON.stringify({ channelId: msg.channel.id, messageId: reply.id }));
    process.exit(0);
  }
});

// ──────── RESTORE MESSAGE AFTER RESTART ────────
async function restoreRestartMessage() {
  try {
    const data = JSON.parse(fs.readFileSync('./restart-msg.json'));
    const channel = await client.channels.fetch(data.channelId);
    const msg = await channel.messages.fetch(data.messageId);
    await msg.edit('✅ Successfully restarted.');
    fs.unlinkSync('./restart-msg.json');
  } catch {
    // Message restore failed
  }
}

// ──────── SCHEDULED RESTARTS ────────
setInterval(() => {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  if (minutes % 5 === 0 && seconds < 5) {
    if (Date.now() - lastRestartTime > cooldownMs) {
      console.log('⏰ Scheduled restart triggered.');
      recordRestart({ scheduled: true });
      lastRestartTime = Date.now();
      process.exit(0);
    }
  }
}, 1000);

// ──────── SLASH COMMAND REGISTRATION ────────
function registerSlashCommands() {
  const commands = [{
    name: 'uptime',
    description: 'See how long the bot has been online.'
  }];

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  rest.put(Routes.applicationCommands(client.user.id), { body: commands }).then(() => {
    console.log('✅ Slash commands registered.');
  }).catch(console.error);
}

// ──────── SLASH COMMAND HANDLER ────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'uptime') {
    const durationMs = Date.now() - startupTime;
    const duration = formatDuration(durationMs);

    const embed = new EmbedBuilder()
      .setTitle('🤖 Uptime Report')
      .setColor('Green')
      .addFields(
        { name: 'Bot', value: `${client.user.tag}`, inline: true },
        { name: 'Creator(s)', value: DEV_USER_IDS.map(id => `<@${id}>`).join(', '), inline: true },
        { name: 'Uptime', value: duration, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
});

// ──────── UTILITY ────────
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

client.login(process.env.TOKEN).then(() => {
  setTimeout(restoreRestartMessage, 5000);
});
