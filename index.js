require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const RESTART_FILE = './last-restart.json';
let wasManualRestart = false;
const devs = process.env.DEV_USER_IDS.split(',');

function recordRestart(manual = false, reason = '') {
  fs.writeFileSync(RESTART_FILE, JSON.stringify({
    timestamp: Date.now(),
    manual,
    reason
  }));
}

function getLastRestartInfo() {
  if (!fs.existsSync(RESTART_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(RESTART_FILE));
    wasManualRestart = data.manual || false;
    return data;
  } catch {
    return null;
  }
}

// Uptime tracking
let lastOnlineTimestamp = Date.now();
const onlineSinceFile = './online-since.txt';
if (fs.existsSync(onlineSinceFile)) {
  const stored = parseInt(fs.readFileSync(onlineSinceFile, 'utf-8'));
  if (!isNaN(stored)) lastOnlineTimestamp = stored;
}
fs.writeFileSync(onlineSinceFile, Date.now().toString());

// ──────── Ready ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const restartInfo = getLastRestartInfo();
  const restartMsg = restartInfo?.manual ? '🔁 Manual restart.' : '⚠️ Auto or crash restart.';
  const restartTime = `<t:${Math.floor(Date.now() / 1000)}:F>`;

  for (const devId of devs) {
    try {
      const user = await client.users.fetch(devId.trim());
      await user.send(`${restartMsg}\n⏱️ Restarted at: ${restartTime}`);
    } catch (e) {
      console.warn(`❌ Couldn't DM ${devId}`);
    }
  }

  recordRestart(false);
});

// ──────── Slash Commands ────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'uptime') {
    const uptimeMs = Date.now() - lastOnlineTimestamp;
    const hours = Math.floor(uptimeMs / 3600000);
    const minutes = Math.floor((uptimeMs % 3600000) / 60000);
    const seconds = Math.floor((uptimeMs % 60000) / 1000);

    const embed = new EmbedBuilder()
      .setTitle('📈 Bot Uptime')
      .setColor('Green')
      .addFields(
        { name: 'Bot Name', value: client.user.tag, inline: true },
        { name: 'Developers', value: devs.map(id => `<@${id.trim()}>`).join(', '), inline: true },
        { name: 'Online Since', value: `<t:${Math.floor(lastOnlineTimestamp / 1000)}:F>`, inline: false },
        { name: 'Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: false }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.commandName === 'restart') {
    const member = interaction.guild?.members.cache.get(interaction.user.id);

    if (interaction.guild && member) {
      const targetRole = interaction.guild.roles.cache.find(role => role.name.toLowerCase() === 'chief public relations officer');
      if (!targetRole || member.roles.highest.position < targetRole.position) {
        return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('♻️ Restarting...')
      .setDescription('The bot is now restarting. Please wait a few seconds.')
      .setColor('Yellow');

    await interaction.reply({ embeds: [embed] });
    recordRestart(true, 'Manual');

    for (const devId of devs) {
      try {
        const user = await client.users.fetch(devId.trim());
        await user.send(`🔁 Manual restart was triggered by <@${interaction.user.id}>.`);
      } catch {}
    }

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
});

// ──────── Register Slash Commands ────────
const commands = [
  new SlashCommandBuilder().setName('uptime').setDescription('Shows the bot uptime and stats'),
  new SlashCommandBuilder().setName('restart').setDescription('Restarts the bot (authorized roles only)')
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
  try {
    console.log('🔁 Registering slash commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (e) {
    console.error(e);
  }
})();

client.login(process.env.TOKEN);
