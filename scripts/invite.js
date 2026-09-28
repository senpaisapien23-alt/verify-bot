import "dotenv/config";

if (!process.env.CLIENT_ID) {
  console.error("Missing CLIENT_ID. Copy .env.example to .env and add your application id.");
  process.exit(1);
}

const MANAGE_ROLES = 1n << 28n;
const permissions = (MANAGE_ROLES | (1n << 31n)).toString();

const url = `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=${permissions}&scope=bot%20applications.commands`;

console.log("Open this link to invite the bot to your server:\n");
console.log(url);
console.log("\nRequested permissions: Manage Roles + View Channel + Send Messages.");
console.log("Tip: drag the bot's role above the role it will hand out.");
