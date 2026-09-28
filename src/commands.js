import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";

export const verifyCommand = new SlashCommandBuilder()
  .setName("verify")
  .setDescription("Manage the verification panel and role.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub
      .setName("panel")
      .setDescription("Post the message with the Verify button.")
      .addChannelOption((option) =>
        option.setName("channel").setDescription("Where to post the panel.").addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("role")
      .setDescription("Choose the role the Verify button grants.")
      .addRoleOption((option) => option.setName("role").setDescription("The role to hand out.").setRequired(true))
  )
  .addSubcommand((sub) => sub.setName("status").setDescription("Show the current verification settings."))
  .addSubcommand((sub) =>
    sub
      .setName("unverify")
      .setDescription("Take the verify role away from a member.")
      .addUserOption((option) => option.setName("user").setDescription("Who to unverify.").setRequired(true))
  );

/**
 * /mod keeps every moderation tool under one name so staff only learn one command.
 * Discord only supports default permissions on the whole command, never on a single
 * subcommand, so the group is gated on the union below for visibility and the real
 * per-action check lives in moderation.js (see REQUIRED_PERMISSION).
 */
export const MOD_VISIBILITY =
  PermissionFlagsBits.BanMembers |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.ModerateMembers |
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.ManageChannels;

const sub = (name, description) =>
  new SlashCommandSubcommandBuilder().setName(name).setDescription(description);

const user = (builder, required = true) =>
  builder.addUserOption((option) =>
    option.setName("user").setDescription("Who the action is for.").setRequired(required)
  );

const reason = (builder, required = false) =>
  builder.addStringOption((option) =>
    option.setName("reason")
      .setDescription(required ? "Why you are doing this." : "Reason for this action (optional).")
      .setMaxLength(512)
      .setRequired(required)
  );

const ban = user(reason(sub("ban", "Ban a member from the server."), true), true);
ban.addIntegerOption((option) =>
  option
    .setName("delete_days")
    .setDescription("Days of their messages to delete (0-7).")
    .setMinValue(0)
    .setMaxValue(7)
);

const timeout = user(reason(sub("timeout", "Mute a member for a while."), true), true);
timeout.addStringOption((option) =>
  option
    .setName("duration")
    .setDescription("How long, such as 10m, 2h, 1d or 1h30m.")
    .setMaxLength(32)
    .setRequired(true)
);

const purge = sub("purge", "Delete recent messages in this channel.");
purge.addIntegerOption((option) =>
  option
    .setName("amount")
    .setDescription("How many messages, up to 100.")
    .setMinValue(1)
    .setMaxValue(100)
    .setRequired(true)
);

const slowmode = sub("slowmode", "Set how often members can post here.");
slowmode.addIntegerOption((option) =>
  option
    .setName("seconds")
    .setDescription("Seconds between messages, 0 to turn it off.")
    .setMinValue(0)
    .setMaxValue(21600)
    .setRequired(true)
);

const modLog = sub("log", "Choose the channel that records every action.");
modLog.addChannelOption((option) =>
  option
    .setName("channel")
    .setDescription("Leave empty to stop logging to a channel.")
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
);

const dmNotices = sub("dmnotices", "Turn moderator DMs to warned members on or off.");
dmNotices.addBooleanOption((option) =>
  option.setName("enabled").setDescription("Send a DM after every action?").setRequired(true)
);

export const modCommand = new SlashCommandBuilder()
  .setName("mod")
  .setDescription("Moderate members, warnings and channels.")
  .setDefaultMemberPermissions(MOD_VISIBILITY)
  .addSubcommand((s) => ban)
  .addSubcommand((s) => user(reason(sub("unban", "Lift a ban."), true), true))
  .addSubcommand((s) => user(reason(sub("kick", "Remove a member from the server."), true), true))
  .addSubcommand((s) => user(reason(sub("softban", "Kick a member and delete their recent messages."), true), true))
  .addSubcommand((s) => timeout)
  .addSubcommand((s) => user(reason(sub("untimeout", "Let a timed out member talk again."), true), true))
  .addSubcommand((s) => user(reason(sub("warn", "Warn a member and tell them why."), true), true))
  .addSubcommand((s) => user(sub("warnings", "Show a member's active warnings."), true))
  .addSubcommand((s) => user(sub("clearwarnings", "Clear a member's warnings."), true))
  .addSubcommand((s) => user(sub("cases", "Show recent moderation actions."), false))
  .addSubcommand((s) => purge)
  .addSubcommand((s) => slowmode)
  .addSubcommand((s) => sub("lock", "Stop @everyone posting in this channel."))
  .addSubcommand((s) => sub("unlock", "Let @everyone post in this channel again."))
  .addSubcommand((s) => modLog)
  .addSubcommand((s) => dmNotices)
  .addSubcommand((s) => sub("status", "Show moderation settings and my permissions."));

export const commandData = () => [verifyCommand.toJSON(), modCommand.toJSON()];
