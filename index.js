require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const app = express();

// ──────── EXPRESS SERVER ────────
app.get('/', (req, res) => {
  res.status(200).send('✅ Bot is running');
});

app.listen(3000, () => {
  console.log('🌐 Web server is running on port 3000');
});

// ──────── DISCORD BOT CLIENT ────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ──────── RESTART / CRASH DETECTION ────────
const RESTART_FILE = './last-restart.json';
let wasManualRestart = false;

// Called before shutdown or restart
function recordRestart(manual = false) {
  fs.writeFileSync(RESTART_FILE, JSON.stringify({
    timestamp: Date.now(),
    manual: manual
  }));
}

function getLastRestartInfo() {
  if (!fs.existsSync(RESTART_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(RESTART_FILE));
    wasManualRestart = data.manual || false;
    return data;
  } catch (e) {
    return null;
  }
}

// ──────── STARTUP ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const devUser = await client.users.fetch(process.env.DEV_USER_ID);
  if (devUser) {
    const restartInfo = getLastRestartInfo();
    const message = restartInfo?.manual
      ? '🔁 Bot was manually restarted.'
      : '⚠️ Bot restarted due to a crash or deployment.';
    devUser.send(`${message}\n⏱️ Restart time: <t:${Math.floor(Date.now() / 1000)}:F>`);
  }

  recordRestart(false); // Automatically assume crash/redeploy
});

// ──────── COMMAND TO MANUALLY RESTART ────────
client.on('messageCreate', async msg => {
  if (msg.content === '!restart' && msg.author.id === process.env.DEV_USER_ID) {
    await msg.reply('🔄 Restarting now...');
    recordRestart(true);
    process.exit(0);
  }
});

client.login(process.env.TOKEN);
