require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

const app = express();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Simple keepalive
app.get("/", (req, res) => {
  res.status(200).send("✅ Bot is running");
});

app.listen(3000, () => {
  console.log("🌐 Express server online");
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
