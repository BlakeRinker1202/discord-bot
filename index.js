require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

// Create bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Bot ready
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Login to bot
client.login(process.env.TOKEN);

// Setup express server
const app = express();

// Ping route for UptimeRobot / Render health check
app.get("/", (req, res) => {
  res.status(200).send("✅ Bot is running!");
});

// Use dynamic port assigned by Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server is running on port ${PORT}`);
});
