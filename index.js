require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

const app = express();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Web server for uptime checks
app.get("/", (req, res) => {
  res.status(200).send("✅ Bot is online!");
});

app.listen(3000, () => {
  console.log("🌐 Web server is running on port 3000");
});

// Notify dev when bot restarts
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const reason = process.env.RESTART_REASON || "unknown";
  const devUserId = process.env.DEV_USER_ID;

  if (devUserId) {
    try {
      const devUser = await client.users.fetch(devUserId);
      await devUser.send(`🌀 **Bot restarted**\n**Reason:** \`${reason}\``);
    } catch (err) {
      console.error("❌ Failed to DM developer:", err);
    }
  } else {
    console.warn("⚠️ DEV_USER_ID not set in .env or Render env variables");
  }
});

client.login(process.env.TOKEN);
