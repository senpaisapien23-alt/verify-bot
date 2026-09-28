import "dotenv/config";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { commandData } from "./commands.js";
import { getGuildConfig, setGuildConfig } from "./config.js";
import { runModeration } from "./moderation.js";
import { buildPanel, handleVerifyClick } from "./verify.js";

if (!process.env.DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN. Copy .env.example to .env and add your bot token.");
  process.exit(1);
}

// Only the non-privileged Guilds intent is used. Button interactions carry the
// member's roles in the payload and role changes go over the REST API, so the
// privileged GuildMembers intent is not needed here. Fewer privileged intents
// means the bot works without any Developer Portal toggles.
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

async function postPanel(guild, channel, config) {
  const target = channel ?? (config.panelChannelId ? guild.channels.cache.get(config.panelChannelId) : null);
  if (!target?.isTextBased()) return { ok: false, reason: "no_channel" };
  try {
    const message = await target.send(buildPanel(config));
    return { ok: true, message };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

async function runVerifyCommand(interaction) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: "This command only works inside a server.", flags: MessageFlags.Ephemeral });
  }

  const sub = interaction.options.getSubcommand();
  const config = getGuildConfig(interaction.guildId);

  if (sub === "panel") {
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const posted = await postPanel(interaction.guild, channel, config);
    if (!posted.ok) {
      return interaction.reply({
        content: posted.reason === "no_channel"
          ? "Tell me where to post it: use `/verify panel channel:#your-channel`."
          : `I could not post there: ${posted.reason}`,
        flags: MessageFlags.Ephemeral
      });
    }
    if (channel.id !== config.panelChannelId) setGuildConfig(interaction.guildId, { panelChannelId: channel.id });
    return interaction.reply({ content: `Verification panel posted in <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
  }

  if (sub === "role") {
    const role = interaction.options.getRole("role", true);
    const me = interaction.guild.members.me;
    if (me && me.roles.highest.position <= role.position) {
      return interaction.reply({
        content: `I cannot hand out **${role.name}** because it sits at or above my highest role. Move my role above it first.`,
        flags: MessageFlags.Ephemeral
      });
    }
    setGuildConfig(interaction.guildId, { roleId: role.id });
    return interaction.reply({
      content: `Verify button will now grant **${role.name}**. Re-post the panel with \`/verify panel\` to apply it to a new message.`,
      flags: MessageFlags.Ephemeral
    });
  }
  if (sub === "status") {
    const role = config.roleId ? await interaction.guild.roles.fetch(config.roleId).catch(() => null) : null;
    const me = interaction.guild.members.me;
    const lines = [
      `**Verify role:** ${role ? role.name : "_not set_ (use `/verify role`)_"}`,
      `**Panel channel:** ${config.panelChannelId ? `<#${config.panelChannelId}>` : "_not set_"}`,
      `**Log channel:** ${config.logChannelId ? `<#${config.logChannelId}>` : "_disabled_"}`,
      `**Button label:** ${config.buttonLabel} ${config.buttonEmoji}`,
      `**I can manage roles:** ${me?.permissions?.has("ManageRoles") ? "yes" : "**no**"}`
    ];
    return interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
  }

  if (sub === "unverify") {
    if (!config.roleId) {
      return interaction.reply({ content: "No verify role is configured.", flags: MessageFlags.Ephemeral });
    }
    const user = interaction.options.getUser("user", true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member?.roles.cache.has(config.roleId)) {
      return interaction.reply({ content: `<@${user.id}> does not have the verify role.`, flags: MessageFlags.Ephemeral });
    }
    try {
      await member.roles.remove(config.roleId, "Unverified by an admin");
    } catch (error) {
      console.error("[verify] unverify failed:", error);
      return interaction.reply({ content: "I could not remove that role.", flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: `<@${user.id}> is no longer verified.`, flags: MessageFlags.Ephemeral });
  }
}

client.once(Events.ClientReady, async (ready) => {
  console.log(`Bot ready as ${ready.user.tag} (verification + moderation)`);
  ready.user.setActivity("/verify and /mod", { type: 3 });

  if (process.env.REGISTER_ON_START !== "false") {
    const target = process.env.GUILD_ID || null;
    await client.application.commands
      .set(commandData(), target)
      .then(() => console.log(`Registered /verify and /mod ${target ? `in guild ${target}` : "globally"}.`))
      .catch((error) => console.error("Slash registration failed:", error));
  }

  const panelGuildId = process.env.AUTO_POST_GUILD_ID;
  const panelChannelId = process.env.AUTO_POST_CHANNEL_ID;
  if (panelGuildId && panelChannelId) {
    const guild = ready.client.guilds.cache.get(panelGuildId);
    if (guild) {
      const posted = await postPanel(guild, guild.channels.cache.get(panelChannelId), getGuildConfig(guild.id));
      console.log(posted.ok ? "Posted the verification panel on startup." : `Panel not posted: ${posted.reason}`);
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "verify") {
      await runVerifyCommand(interaction);
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === "mod") {
      if (!interaction.inGuild()) {
        return interaction.reply({ content: "That only works inside a server.", flags: MessageFlags.Ephemeral });
      }
      // runModeration defers the reply itself, so the answer lands with editReply.
      await interaction.editReply(await runModeration(interaction));
      return;
    }
    if (interaction.isButton() && interaction.customId === "verify:grant") {
      await handleVerifyClick(interaction, getGuildConfig(interaction.guildId));
    }
  } catch (error) {
    console.error("[interaction] handler failed:", error);
    if (!interaction.isRepliable()) return;
    // Answering an interaction twice is what fills the log with 40060 errors, so pick
    // whichever call is still legal: editReply after a defer, reply otherwise.
    const pending = interaction.replied || interaction.deferred;
    await (pending
      ? interaction.editReply({ content: "Something went wrong while I was working on that. Please try again." })
      : interaction.reply({ content: "Something went wrong. Please try again.", flags: MessageFlags.Ephemeral })
    ).catch(() => {});
  }
});

const shutdown = () => {
  console.log("Shutting down.");
  client.destroy();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

client.login(process.env.DISCORD_TOKEN);
