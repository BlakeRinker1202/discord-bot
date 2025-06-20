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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

// ──────── RESTART TRACKING ────────
const RESTART_FILE = './last-restart.json';
const MSG_FILE = './restart-msg.json';
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

// Read last restart info
function getLastRestartInfo() {
  if (!fs.existsSync(RESTART_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(RESTART_FILE));
    if (data.type === 'manual') wasManualRestart = true;
    if (data.type === 'scheduled') wasScheduledRestart = true;
    return data;
  } catch {
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
      await user.send(`${restartMessage}\n⏱️ Restart time: ${now}`);
    } catch (e) {
      console.warn(`⚠️ Could not DM ${id}:`, e.message);
    }
  }

  if (restartMsgToEdit) {
    try {
      const [channelId, msgId] = restartMsgToEdit.split('/');
      const channel = await client.channels.fetch(channelId);
      const msg = await channel.messages.fetch(msgId);
      await msg.edit('✅ Successfully Restarted.');
    } catch (e) {
      console.warn('⚠️ Could not edit restart message:', e.message);
    }
  }

  recordRestart(); // Mark this as crash unless overridden

  scheduleNextRestart();
});

// ──────── MANUAL RESTART ────────
client.on('messageCreate', async msg => {
  if (msg.content === '!restart' && process.env.DEV_USER_IDS.split(',').includes(msg.author.id)) {
    await msg.reply('🔄 Restarting now...').then(m => {
      restartMsgToEdit = `${m.channel.id}/${m.id}`;
      recordRestart('manual');
      fs.writeFileSync(MSG_FILE, JSON.stringify(restartMsgToEdit));
      process.exit(0);
    });
  }
});

// ──────── SCHEDULED RESTART WITH COOLDOWN ────────
function scheduleNextRestart() {
  const now = new Date();
  const minutes = now.getMinutes();
  const remainder = 5 - (minutes % 5);
  const next = new Date(now.getTime() + remainder * 60000);

  next.setSeconds(0);
  next.setMilliseconds(0);

  const delay = next.getTime() - now.getTime();
  console.log(`⏳ Next scheduled restart in ${Math.floor(delay / 1000)}s at ${next.toLocaleTimeString()}`);

  setTimeout(() => {
    const info = getLastRestartInfo();
    const lastTimestamp = info?.timestamp || 0;

    const sameInterval = Math.floor(Date.now() / 1000 / 300) === Math.floor(lastTimestamp / 1000 / 300);

    if (!sameInterval) {
      console.log('🔁 Scheduled restart executing...');
      recordRestart('scheduled');
      process.exit(0);
    } else {
      console.log('⏸ Skipping restart - already restarted in this interval.');
      scheduleNextRestart(); // reschedule
    }
  }, delay);
}

// ──────── RESTORE MESSAGE TO EDIT ────────
if (fs.existsSync(MSG_FILE)) {
  try {
    restartMsgToEdit = JSON.parse(fs.readFileSync(MSG_FILE));
    fs.unlinkSync(MSG_FILE);
  } catch {
    restartMsgToEdit = null;
  }
}

client.login(process.env.TOKEN);
