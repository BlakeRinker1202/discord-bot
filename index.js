require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

const DEV_USER_IDS = process.env.DEV_USER_IDS.split(','); // comma-separated in .env
const UPTIME_FILE = path.join(__dirname, 'uptime.json');
let launchTime = Date.now();
let isRestart = false;

// Read last startup time
function loadUptimeData() {
  if (!fs.existsSync(UPTIME_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(UPTIME_FILE));
  } catch {
    return null;
  }
}

// Save new startup time
function saveUptimeData(timestamp) {
  fs.writeFileSync(UPTIME_FILE, JSON.stringify({ timestamp }));
}

// Calculate uptime in human-readable format
function getReadableUptime(start) {
  const diff = Date.now() - start;
  const seconds = Math.floor(diff / 1000) % 60;
  const minutes = Math.floor(diff / (1000 * 60)) % 60;
  const hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// On bot ready
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const previous = loadUptimeData();
  if (previous?.timestamp) {
    isRestart = true;
    launchTime = previous.timestamp;
  } else {
    saveUptimeData(launchTime);
  }

  for (const id of DEV_USER_IDS) {
    try {
      const dev = await client.users.fetch(id);
      if (dev) {
        const note = isRestart ? '🔁 Bot restarted' : '🟢 Bot started';
        dev.send(`${note} at <t:${Math.floor(Date.now() / 1000)}:F>`);
      }
    } catch (e) {
      console.error(`Failed to DM dev (${id}):`, e);
    }
  }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'uptime') {
    const embed = new EmbedBuilder()
      .setTitle('📊 Uptime Info')
      .addFields(
        { name: 'Bot Name', value: client.user.tag, inline: true },
        { name: 'Creators', value: DEV_USER_IDS.map(id => `<@${id}>`).join(', '), inline: true },
        { name: 'Uptime', value: getReadableUptime(launchTime), inline: false }
      )
      .setColor('Green')
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// Register slash command
async function registerSlash() {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: [
        {
          name: 'uptime',
          description: 'View how long the bot has been online',
        }
      ]
    });
    console.log('✅ Slash command registered.');
  } catch (err) {
    console.error('❌ Slash registration failed:', err);
  }
}

registerSlash();
client.login(process.env.TOKEN);
