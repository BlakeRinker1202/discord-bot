require('dotenv').config();
const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ──────── CONFIG ────────
const token = process.env.TOKEN;
const devIds = process.env.DEV_USER_IDS.split(',');
const restartRoleId = process.env.RESTART_ROLE_ID;
const startupFile = process.env.STARTUP_TIMESTAMP_FILE || './uptime.json';
let restartMessageInfo = null;

// ──────── DISCORD CLIENT ────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

// ──────── SAVE STARTUP TIMESTAMP ────────
function updateStartupTime() {
  fs.writeFileSync(startupFile, JSON.stringify({
    timestamp: Date.now()
  }));
}

function getUptimeSeconds() {
  try {
    const data = JSON.parse(fs.readFileSync(startupFile));
    return Math.floor((Date.now() - data.timestamp) / 1000);
  } catch {
    return 0;
  }
}

// ──────── ERROR HANDLER ────────
process.on('unhandledRejection', async (err) => {
  console.error('💥 Unhandled Rejection:', err);
  for (const id of devIds) {
    const user = await client.users.fetch(id).catch(() => null);
    if (user) {
      user.send(`❌ **Unhandled error**:\n\`\`\`${err.stack || err.message || err}\`\`\``).catch(() => null);
    }
  }
});

// ──────── SLASH COMMANDS ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  updateStartupTime();

  const commands = [
    new SlashCommandBuilder()
      .setName('uptime')
      .setDescription('Show how long the bot has been running'),
    new SlashCommandBuilder()
      .setName('restart')
      .setDescription('Manually restart the bot (CPRO+ only)')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('❌ Failed to register commands', err);
  }

  // Scheduled restart every 5 mins
  scheduleRestartLoop();
});

// ──────── INTERACTIONS ────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'uptime') {
    try {
      const uptime = getUptimeSeconds();
      const embed = new EmbedBuilder()
        .setTitle('📊 Bot Uptime')
        .addFields(
          { name: 'Bot Name', value: client.user.username, inline: true },
          { name: 'Created By', value: devIds.map(id => `<@${id}>`).join(', '), inline: true },
          { name: 'Uptime', value: `<t:${Math.floor((Date.now() - uptime * 1000) / 1000)}:R>`, inline: false }
        )
        .setColor('Green')
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        flags: 1 << 6 // equivalent to 'ephemeral: true'
      });
    } catch (err) {
      console.error('Failed to respond to /uptime:', err);
    }
  }

  else if (interaction.commandName === 'restart') {
    const member = interaction.member;
    const isDM = !member;
    const hasPermission = isDM || (
      interaction.guild &&
      interaction.guild.roles.cache.get(restartRoleId) &&
      member.roles.highest.position >= interaction.guild.roles.cache.get(restartRoleId).position
    );

    if (!hasPermission) {
      return interaction.reply({
        content: '🚫 You do not have permission to restart the bot.',
        flags: 1 << 6 // ephemeral
      });
    }

    try {
      const reply = await interaction.reply({
        content: '🔄 Restarting...',
        fetchReply: true
      });

      restartMessageInfo = {
        channelId: interaction.channelId,
        messageId: reply.id
      };

      for (const id of devIds) {
        const user = await client.users.fetch(id).catch(() => null);
        if (user) user.send(`🔁 Manual restart initiated by ${interaction.user.tag}`).catch(() => null);
      }

      process.exit(0);
    } catch (err) {
      console.error('Failed to respond to /restart:', err);
    }
  }
});
// ──────── RESTART CONFIRMATION ────────
client.on('ready', async () => {
  if (restartMessageInfo) {
    const channel = await client.channels.fetch(restartMessageInfo.channelId).catch(() => null);
    const msg = channel && await channel.messages.fetch(restartMessageInfo.messageId).catch(() => null);
    if (msg) msg.edit('✅ Successfully restarted.');
    restartMessageInfo = null;
  }
});

// ──────── SCHEDULED RESTART ────────
function scheduleRestartLoop() {
  setInterval(() => {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    if (minutes % 5 === 0 && seconds < 5) {
      console.log('⏰ Scheduled restart now.');
      devIds.forEach(async id => {
        const user = await client.users.fetch(id).catch(() => null);
        if (user) user.send('♻️ Scheduled restart triggered.').catch(() => null);
      });
      process.exit(0);
    }
  }, 1000);
}

client.login(token);
