require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const app = express();

// ──────── EXPRESS SERVER ────────
app.get('/', (req, res) => {
  res.status(200).send('✅ Bot is running');
});

app.listen(process.env.PORT || 3000, () => {
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

// ──────── RESTART TRACKING ────────
const RESTART_FILE = './last-restart.json';
let wasManualRestart = false;
let wasScheduledRestart = false;
let restartMsgToEdit = null;

// Write restart reason
function recordRestart(type = 'crash') {
  fs.writeFileSync(RESTART_FILE, JSON.stringify({
    timestamp: Date.now(),
    type
  }));
}

// Read restart info
function getLastRestartInfo() {
  if (!fs.existsSync(RESTART_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(RESTART_FILE));
    if (data.type === 'manual') wasManualRestart = true;
    if (data.type === 'scheduled') wasScheduledRestart = true;
    return data;
  } catch (e) {
    return null;
  }
}

// ──────── ON READY ────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const restartInfo = getLastRestartInfo();
  const now = `<t:${Math.floor(Date.now() / 1000)}:F>`;

  let restartMessage = '⚠️ Bot restarted due to a crash or deployment.';
  if (wasManualRestart) restartMessage = '🔁 Bot was manually restarted.';
  if (wasScheduledRestart) restartMessage = '⏰ Bot restarted on schedule.';

  for (const id of process.env.DEV_USER_IDS.split(',')) {
    try {
      const user = await client.users.fetch(id.trim());
      if (user) {
        await user.send(`${restartMessage}\n⏱️ Restart time: ${now}`);
      }
    } catch (e) {
      console.warn(`Could not DM user ${id}:`, e.message);
    }
  }

  if (restartMsgToEdit) {
    try {
      const [channelId, msgId] = restartMsgToEdit.split('/');
      const channel = await client.channels.fetch(channelId);
      const msg = await channel.messages.fetch(msgId);
      await msg.edit('✅ Successfully Restarted.');
    } catch (e) {
      console.warn('Failed to edit restart message:', e.message);
    }
  }

  recordRestart(); // Mark this as crash unless otherwise set
});

// ──────── MANUAL RESTART ────────
client.on('messageCreate', async msg => {
  if (msg.content === '!restart' && process.env.DEV_USER_IDS.split(',').includes(msg.author.id)) {
    await msg.reply('🔄 Restarting now...').then(m => {
      restartMsgToEdit = `${m.channel.id}/${m.id}`;
      recordRestart('manual');
      fs.writeFileSync('./restart-msg.json', JSON.stringify(restartMsgToEdit));
      process.exit(0);
    });
  }
});

// ──────── SCHEDULED RESTART EVERY 5 MINS ────────
function scheduleRestartLoop() {
  const now = new Date();
  const next = new Date();
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);

  const delay = next.getTime() - now.getTime();
  console.log(`⏳ Next scheduled restart in ${Math.floor(delay / 1000)}s at ${next.toLocaleTimeString()}`);

  setTimeout(() => {
    recordRestart('scheduled');
    process.exit(0);
  }, delay);
}

// Restore restart edit info
if (fs.existsSync('./restart-msg.json')) {
  try {
    restartMsgToEdit = JSON.parse(fs.readFileSync('./restart-msg.json'));
    fs.unlinkSync('./restart-msg.json');
  } catch (e) {
    restartMsgToEdit = null;
  }
}

scheduleRestartLoop();

client.login(process.env.TOKEN);
