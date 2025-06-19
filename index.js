require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

// Web server to keep Render happy
const app = express();
app.get("/", (req, res) => res.send("✅ Bot is online!"));
app.listen(3000, () => console.log("🌐 Web server is running"));

// Discord bot setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", (msg) => {
  if (msg.content === "!ping") {
    msg.reply("🏓 Pong!");
  }
});

client.login(process.env.TOKEN).catch(err => console.error("❌ Bot login failed:", err));
