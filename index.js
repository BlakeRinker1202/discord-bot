require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const os = require('os');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

// ────── CONFIG ──────
const RESTART_FILE = './last-restart.json';
const SCHEDULE_INTERVAL = 5 * 60 * 1000; // Every 5 minutes
let lastManualRestart = false;
const devs = process.env.DEV_USER_IDS.split(',');

// ────── RESTART TRACKING ──────
function recordRestart(type = 'unknown') {
  fs.writeFileSync(RESTART_FILE, JSON.stringify({
    timestamp: Date.now(),
    type
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
function getNextScheduledRestart() {
  const now = new Date();
  now.setSeconds(0, 0);
  const minutes = now.getMinutes();
  const next = new Date(now);
  next.setMinutes(minutes - (minutes % 5) + 5);
  return `<t:${Math.floor(next.getTime() / 1000)}:T>`;
}

// ────── COMMAND SETUP ──────
const commands = [
  new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Show bot uptime and developer info'),
  new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart the bot (developers only)'),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show detailed bot status'),
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// ────── REGISTER COMMANDS ──────
(async () => {
  try {
    console.log('🔁 Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
})();

// ────── STARTUP ──────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const restartData = getLastRestartInfo();
  const message = {
    crash: '⚠️ Bot restarted due to a crash or deploy.',
    manual: '🔁 Bot was manually restarted.',
    scheduled: '🕒 Scheduled restart occurred.',
    unknown: 'ℹ️ Bot restarted (reason unknown).'
  }[restartData?.type || 'unknown'];

  for (const devId of devs) {
    try {
      const dev = await client.users.fetch(devId);
      dev.send(`${message}\n⏱️ Restart time: <t:${Math.floor(Date.now() / 1000)}:F>`);
    } catch (e) {
      console.error(`❌ Failed to DM dev (${devId})`);
    }
  }

  recordRestart('crash');
});

// ────── INTERACTION HANDLER ──────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'uptime') {
    const restart = getLastRestartInfo();
    const uptimeMs = Date.now() - (restart?.timestamp || Date.now());
    const uptime = Math.floor(uptimeMs / 1000);
    const embed = new EmbedBuilder()
      .setTitle('📊 Bot Uptime')
      .addFields(
        { name: 'Bot', value: client.user.tag, inline: true },
        { name: 'Creators', value: devs.map(id => `<@${id}>`).join(', '), inline: true },
        { name: 'Uptime', value: `<t:${Math.floor((restart?.timestamp || Date.now()) / 1000)}:R>`, inline: false }
      )
      .setColor(0x00AE86)
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'restart') {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member || !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You don’t have permission to use this.', ephemeral: true });
    }

    await interaction.reply({ content: '🔄 Restarting bot...', ephemeral: true });
    for (const devId of devs) {
      try {
        const dev = await client.users.fetch(devId);
        dev.send(`♻️ Bot restart manually triggered by <@${interaction.user.id}>`);
      } catch { }
    }

    recordRestart('manual');
    process.exit(0);
  }

  if (commandName === 'status') {
    const used = process.memoryUsage();
    const mem = `${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`;
    const restart = getLastRestartInfo();
    const embed = new EmbedBuilder()
      .setTitle('📈 Bot Status')
      .addFields(
        { name: 'Bot', value: client.user.tag, inline: true },
        { name: 'Restart Type', value: restart?.type || 'unknown', inline: true },
        { name: 'Uptime', value: `<t:${Math.floor((restart?.timestamp || Date.now()) / 1000)}:R>`, inline: true },
        { name: 'Memory Usage', value: mem, inline: true },
        { name: 'Next Scheduled Restart', value: getNextScheduledRestart(), inline: true },
        { name: 'Developers', value: devs.map(id => `<@${id}>`).join(', ') }
      )
      .setColor(0x3498db)
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// ────── SCHEDULED RESTART ──────
setInterval(() => {
  const now = new Date();
  if (now.getMinutes() % 5 === 0 && now.getSeconds() === 0) {
    for (const devId of devs) {
      client.users.fetch(devId).then(user => {
        user.send(`🔁 Scheduled restart at <t:${Math.floor(Date.now() / 1000)}:T>`);
      }).catch(() => {});
    }
    recordRestart('scheduled');
    process.exit(0);
  }
}, 1000);

client.login(process.env.TOKEN);
