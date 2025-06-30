require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Counting bot is alive!');
});

app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});

const CHANNEL_ID = '1383145257700425728';
const DATA_PATH = path.join(__dirname, 'data', 'countData.json');

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({ lastNumber: 0, lastUserId: null }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_PATH));
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

const SMALL_NUMBERS = {
  "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
  "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
  "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
  "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19
};

const TENS = {
  "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
  "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90
};

const MULTIPLIERS = {
  "hundred": 100,
  "thousand": 1000,
  "million": 1000000
};

function wordsToNumber(phrase) {
  const tokens = phrase.toLowerCase().replace(/-/g, ' ').split(/\s+/);
  let total = 0;
  let current = 0;

  for (let token of tokens) {
    if (SMALL_NUMBERS[token] !== undefined) {
      current += SMALL_NUMBERS[token];
    } else if (TENS[token] !== undefined) {
      current += TENS[token];
    } else if (token in MULTIPLIERS) {
      if (current === 0) current = 1;
      current *= MULTIPLIERS[token];

      if (MULTIPLIERS[token] >= 1000) {
        total += current;
        current = 0;
      }
    } else if (token.match(/^\d+$/)) {
      return parseInt(token, 10);
    } else {
      return null;
    }
  }

  return total + current;
}

function evaluateMathExpression(expression) {
  const cleaned = expression.replace(/\s+/g, '').replace(/,/g, '').toLowerCase();

  const match = cleaned.match(/^(\d+)([+\-x*/➗])(\d+)$/);
  if (match) {
    const [, left, op, right] = match;
    const a = parseInt(left, 10);
    const b = parseInt(right, 10);
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case 'x': case '*': return a * b;
      case '/': case '➗': return Math.floor(a / b);
    }
  }

  return null;
}

function parseCountMessage(content) {
  content = content.trim().toLowerCase();

  const numeric = content.replace(/,/g, '');
  if (/^\d+$/.test(numeric)) return parseInt(numeric, 10);

  const mathResult = evaluateMathExpression(content);
  if (mathResult !== null) return mathResult;

  const wordsResult = wordsToNumber(content.replace(/,/g, ' '));
  if (wordsResult !== null && wordsResult > 0) return wordsResult;

  return null;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== CHANNEL_ID) return;

  const data = loadData();
  const userId = message.author.id;

  const value = parseCountMessage(message.content);

  if (value === null) return; // Ignore non-parsable

  // ✅ Same user twice in a row (only matters if continuing correctly)
  if (data.lastUserId === userId && value === data.lastNumber + 1) {
    await message.react('❌');
    await message.channel.send(`❌ <@${userId}> messed it up, you can’t say a number 2 times in a row. Count has been reset to 1! ❌`);
    
    // RESET
    saveData({ lastNumber: 0, lastUserId: null });
    return;
  }

  // ✅ Wrong next number
  if (value !== data.lastNumber + 1) {
    await message.react('❌');
    await message.channel.send(`❌ <@${userId}> messed it up, try again! Count has been reset to 1! ❌`);
    
    // RESET
    saveData({ lastNumber: 0, lastUserId: null });
    return;
  }

  // ✅ Success
  data.lastNumber = value;
  data.lastUserId = userId;
  saveData(data);

  await message.react('✅');
  console.log(`✅ Count advanced to ${value} by ${message.author.tag}`);
});
client.login(process.env.DISCORD_TOKEN);
