require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

// ENV
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DEV_IDS = process.env.DEV_USER_IDS?.split(',') || [];
const RESTART_ROLE_ID = process.env.RESTART_ROLE_ID;

const RESTART_FILE = './last-restart.json';
let restartMessageInfo = null;

// ──────── TIMESTAMP TRACKING ────────
function recordRestart(type = 'crash') {
  const data = {
    timestamp: Date.now(),
    type,
    restartMessageInfo
  };
  fs.writeFileSync(RESTART_FILE, JSON.stringify(data));
}

function getLastRestart() {
  try {
    return JSON.parse(fs.readFileSync(RESTART_FILE));
  } catch {
    return null;
  }
}

function getUptimeSeconds() {
  const last = getLastRestart();
  return last ? Math.floor((Date.now() - last.timestamp) / 1000) : 0;
}

// ──────── SCHEDULED RESTART (EVERY 5 MINUTES) ────────
function scheduleRestart() {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);
  if (next <= now) next.setMinutes(next.getMinutes() + 5);

  const delay = next - now;
  setTimeout(() => {
    for (const id of DEV_IDS) {
      client.users.fetch(id).then(user =>
        user.send('⏰ Scheduled restart triggered.').catch(() => {})
      );
    }
    recordRestart('scheduled');
    process.exit(0);
  }, delay);
}

// ──────── SLASH COMMAND SETUP ────────
const commands = [
  {
    name: 'uptime',
    description: 'Check bot uptime.'
  },
  {
    name: 'restart',
    description: 'Manually restart the bot (CPRO+ only).'
  }
];

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
  }
}

// ──────── INTERACTION HANDLER ────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'uptime') {
    const uptime = getUptimeSeconds();
    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Uptime')
      .addFields(
        { name: 'Bot Name', value: client.user.username, inline: true },
        { name: 'Created By', value: DEV_IDS.map(id => `<@${id}>`).join(', '), inline: true },
        { name: 'Uptime', value: `<t:${Math.floor((Date.now() - uptime * 1000) / 1000)}:R>`, inline: false }
      )
      .setColor('Green')
      .setTimestamp();

    try {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error('❌ Failed to send /uptime:', err);
    }
  }

  if (interaction.commandName === 'restart') {
    const member = interaction.member;
    const guild = interaction.guild;
    const role = guild?.roles.cache.get(RESTART_ROLE_ID);

    const allowed =
      !guild || !role || member.roles.highest.position >= role.position;

    if (!allowed) {
      return interaction.reply({ content: '🚫 You lack permission.', ephemeral: true });
    }

    const reply = await interaction.reply({ content: '🔄 Restarting...', fetchReply: true }).catch(() => null);
    restartMessageInfo = reply
      ? { channelId: reply.channelId, messageId: reply.id }
      : null;

    for (const id of DEV_IDS) {
      const user = await client.users.fetch(id).catch(() => null);
      if (user) user.send(`🔁 Manual restart triggered by ${interaction.user.tag}`).catch(() => {});
    }

    recordRestart('manual');
    process.exit(0);
  }
});

// ──────── STARTUP ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  registerSlashCommands();

  const last = getLastRestart();
  for (const id of DEV_IDS) {
    const user = await client.users.fetch(id).catch(() => null);
    if (user) {
      const msg = last?.type === 'manual'
        ? '🔁 Bot manually restarted.'
        : last?.type === 'scheduled'
          ? '⏰ Scheduled restart occurred.'
          : '⚠️ Bot restarted due to crash or deployment.';

      await user.send(`${msg}\n⏱️ Restart time: <t:${Math.floor(Date.now() / 1000)}:F>`).catch(() => {});
    }
  }

  if (last?.restartMessageInfo) {
    const { channelId, messageId } = last.restartMessageInfo;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
      channel.messages.fetch(messageId)
        .then(msg => msg.edit('✅ Bot restarted successfully.'))
        .catch(() => {});
    }
  }

  recordRestart('crash'); // In case it wasn’t detected
  scheduleRestart(); // Always schedule restart again
});

// ──────── CRASH HANDLERS ────────
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
  recordRestart('crash');
  process.exit(1);
});

process.on('unhandledRejection', err => {
  console.error('❌ Unhandled Rejection:', err);
  recordRestart('crash');
  process.exit(1);
});

client.login(TOKEN);
