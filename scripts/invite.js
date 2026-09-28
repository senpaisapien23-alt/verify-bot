import "dotenv/config";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";

if (!process.env.CLIENT_ID) {
  console.error("Missing CLIENT_ID. Copy .env.example to .env and add your application id.");
  process.exit(1);
}

// Verification needs Manage Roles; moderation needs the rest. Everything is spelled
// out by name so a wrong bit can never slip in quietly.
const asked = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.UseApplicationCommands
];

const url = `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=${asked.reduce(
  (all, flag) => all | flag,
  0n
)}&scope=bot%20applications.commands`;

console.log("Open this link to invite the bot to your server:\n");
console.log(url);
console.log("\nRequested permissions:");
for (const name of new PermissionsBitField(asked).toArray()) console.log(`  - ${name}`);
console.log("\nTip: drag the bot's role above the role it will hand out.");
console.log("Tip: give the bot Manage Roles, Manage Messages, Manage Channels, Kick,");
console.log("     Ban and Moderate Members, or the matching /mod commands will refuse.");
