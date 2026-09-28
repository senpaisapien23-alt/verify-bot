import { EmbedBuilder, MessageFlags } from "discord.js";
import { MAX_PURGE, MAX_SLOWMODE, MAX_TIMEOUT_MS, durationParts, parseDuration } from "./constants.js";
import { addWarning, clearWarnings, getGuildConfig, listCases, listWarnings, recordCase, setGuildConfig } from "./config.js";

const BLURB = 0x5865f2;

/** How each action is presented. The reply, the mod log and the DM all read from here. */
export const Actions = {
  ban: { label: "Ban", color: 0xed4245, emoji: "\u{1F528}" },
  unban: { label: "Unban", color: 0x57f287, emoji: "\u2705" },
  kick: { label: "Kick", color: 0xed4245, emoji: "\u{1F462}" },
  softban: { label: "Softban", color: 0xed4245, emoji: "\u{1F9F9}" },
  timeout: { label: "Timeout", color: 0xed4245, emoji: "\u{1F507}" },
  untimeout: { label: "Timeout removed", color: 0x57f287, emoji: "\u{1F50A}" },
  warn: { label: "Warning", color: 0xfee75c, emoji: "\u26A0\uFE0F" },
  clearwarnings: { label: "Warnings cleared", color: 0x57f287, emoji: "\u{1F9FC}" }
};

/** Why a moderation target was refused. Kept as codes so the tests can assert on them. */
export const Deny = {
  SELF: "self",
  OWNER: "owner",
  ABOVE_BOT: "above_bot",
  ABOVE_MODERATOR: "above_moderator"
};

const denied = (reason, message) => ({ ok: false, reason, message });

/**
 * What the person running each subcommand must hold. Discord's default permissions
 * only decide whether a command is *shown*; they never block it, so this map is the
 * actual access control for /mod.
 */
export const REQUIRED_PERMISSION = {
  ban: "BanMembers",
  unban: "BanMembers",
  softban: "BanMembers",
  clearwarnings: "BanMembers",
  kick: "KickMembers",
  warn: "KickMembers",
  timeout: "ModerateMembers",
  untimeout: "ModerateMembers",
  warnings: "ModerateMembers",
  cases: "ModerateMembers",
  purge: "ManageMessages",
  slowmode: "ManageChannels",
  lock: "ManageChannels",
  unlock: "ManageChannels",
  log: "ManageChannels",
  dmnotices: "ManageChannels",
  status: null
};

const PERMISSION_LABEL = {
  BanMembers: "Ban Members",
  KickMembers: "Kick Members",
  ModerateMembers: "Moderate Members",
  ManageMessages: "Manage Messages",
  ManageChannels: "Manage Channels"
};

/**
 * May this moderator act on this member? Pure function - no Discord objects - so the
 * role hierarchy rules can be unit tested without a gateway connection.
 */
export function evaluateTarget({
  moderatorId,
  targetId,
  targetTag,
  targetPosition,
  moderatorPosition,
  botPosition,
  ownerId,
  verb = "act on"
}) {
  if (targetId === moderatorId) return denied(Deny.SELF, `You cannot ${verb} yourself.`);
  if (targetId === ownerId) return denied(Deny.OWNER, `${targetTag} is the server owner.`);
  if (targetPosition >= botPosition) {
    return denied(Deny.ABOVE_BOT, `I cannot ${verb} ${targetTag} - their role is above mine. Ask an admin to move my role higher.`);
  }
  if (targetPosition >= moderatorPosition) {
    return denied(Deny.ABOVE_MODERATOR, `You cannot ${verb} ${targetTag} - their role is above yours.`);
  }
  return { ok: true };
}

/** Discord error codes that deserve a human sentence instead of a status code. */
export function describeError(error) {
  const friendly = {
    10013: "That is the server owner.",
    10026: "That user is not banned.",
    160002: "That member is already banned.",
    160003: "That member is not in this server.",
    160004: "I cannot ban that member - they are not in this server.",
    160005: "I cannot ban the server owner.",
    160006: "I cannot ban myself.",
    50013: "I do not have permission to do that here.",
    50021: "That is a system role I cannot assign.",
    50028: "I do not have permission to do that here.",
    50035: "The ban list is full."
  };
  return friendly[error?.code] ?? error?.message ?? "unknown error";
}

/** Short, private reply. Every moderation response is ephemeral so the channel stays clean. */
const fail = (message) => ({ content: message, flags: MessageFlags.Ephemeral });

/** A private one-liner with a colour, used for results that are not member actions. */
const reply = (color, description) => ({
  embeds: [new EmbedBuilder().setColor(color).setDescription(description).setTimestamp()],
  flags: MessageFlags.Ephemeral
});

/**
 * Look the member up and run the hierarchy checks. Returns the member, or the sentence
 * to show the moderator when the action is not allowed.
 */
async function resolveTarget(interaction, user, verb) {
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return { error: `${user.tag} is not in this server.` };

  const me = interaction.guild.members.me;
  const check = evaluateTarget({
    moderatorId: interaction.user.id,
    targetId: member.id,
    targetTag: member.user.tag,
    targetPosition: member.roles.highest.position,
    moderatorPosition: interaction.member.roles.highest.position,
    botPosition: me.roles.highest.position,
    ownerId: interaction.guild.ownerId,
    verb
  });
  return check.ok ? { member } : { error: check.message };
}

/** Tell the member what happened. DMs are best effort - members can have them closed. */
async function sendActionDm(client, userId, details) {
  const look = Actions[details.action] ?? { label: details.action, color: BLURB };
  const embed = new EmbedBuilder()
    .setColor(look.color)
    .setTitle(`${look.emoji} ${look.label} · ${details.guildName}`)
    .addFields(
      { name: "Action", value: look.label, inline: true },
      { name: "Server", value: `${details.guildName} (${details.guildId})`, inline: false },
      { name: "Moderator", value: `${details.moderatorTag} (${details.moderatorId})`, inline: true },
      { name: "Reason", value: (details.reason || "No reason provided").slice(0, 1024), inline: false }
    )
    .setTimestamp();
  if (details.durationMs) embed.addFields({ name: "Duration", value: durationParts(details.durationMs), inline: true });
  if (details.extra) embed.addFields({ name: "Details", value: details.extra.slice(0, 1024), inline: false });

  try {
    const user = await client.users.fetch(userId);
    if (!user) return { delivered: false, reason: "user not found" };
    await user.send({ embeds: [embed] });
    return { delivered: true };
  } catch (error) {
    return { delivered: false, reason: error.code === 50007 ? "user has DMs disabled" : describeError(error) };
  }
}

/**
 * Post the action to the mod-log channel. This is the record that survives a redeploy,
 * because Railway wipes the container filesystem on every deploy.
 */
async function postModLog(guild, channelId, fields) {
  if (!channelId) return { logged: false, reason: "no mod-log channel set" };
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return { logged: false, reason: "mod-log channel is gone" };
  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(BLURB)
          .setTitle("Moderation action")
          .addFields(fields)
          .setFooter({ text: `${guild.name} · ${guild.id}` })
          .setTimestamp()
      ]
    });
    return { logged: true };
  } catch (error) {
    console.error(`[mod] could not write to the log channel in ${guild.id}:`, error.message);
    return { logged: false, reason: describeError(error) };
  }
}

/**
 * Shared tail for every member action: store the case, write the mod log, try the DM,
 * then build the private confirmation the moderator sees. The footer always says what
 * happened to the DM and the log, so a moderator is never left guessing.
 */
async function report(interaction, config, entry) {
  const look = Actions[entry.action] ?? { label: entry.action, color: BLURB, emoji: "\u2022" };
  const reason = entry.reason || "No reason provided";
  const duration = entry.durationMs ? `\n**Duration:** ${durationParts(entry.durationMs)}` : "";

  const stored = recordCase(interaction.guildId, {
    action: entry.action,
    targetId: entry.targetId,
    moderatorId: interaction.user.id,
    reason
  });

  const log = await postModLog(interaction.guild, config.modLogChannelId, [
    { name: "Action", value: `${look.emoji} ${look.label}`, inline: true },
    { name: "Member", value: `<@${entry.targetId}> (\`${entry.targetId}\`)`, inline: true },
    { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
    { name: "Reason", value: reason.slice(0, 1024), inline: false },
    ...(entry.durationMs ? [{ name: "Duration", value: durationParts(entry.durationMs), inline: true }] : []),
    ...(entry.extra ? [{ name: "Details", value: entry.extra.slice(0, 1024), inline: false }] : [])
  ]);

  const dm = config.dmNotices
    ? await sendActionDm(interaction.client, entry.targetId, {
        action: entry.action,
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        reason,
        durationMs: entry.durationMs,
        extra: entry.extra
      })
    : { delivered: false, reason: "DM notices are off" };

  const embed = new EmbedBuilder()
    .setColor(look.color)
    .setDescription(`${look.emoji} **${look.label}** · ${entry.targetTag}\n**Reason:** ${reason}${duration}`)
    .setFooter({
      text: `Case #${stored.id} · DM: ${dm.delivered ? "sent" : dm.reason} · Log: ${log.logged ? "sent" : log.reason}`
    })
    .setTimestamp();

  return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

/**
 * Run a /mod subcommand. It defers the reply up front, because a ban plus a DM plus a
 * log post can easily take longer than Discord's three second interaction deadline.
 * The returned payload is applied with editReply.
 */
export async function runModeration(interaction) {
  const sub = interaction.options.getSubcommand();
  const config = getGuildConfig(interaction.guildId);
  const reason = () => interaction.options.getString("reason") || "No reason provided";
  const target = () => interaction.options.getUser("user", true);
  await interaction.deferReply({ ephemeral: true });

  // Real access control. The command's default permissions only affect who sees /mod.
  const need = REQUIRED_PERMISSION[sub];
  if (need && !interaction.memberPermissions?.has(need)) {
    return fail(`You need the **${PERMISSION_LABEL[need] ?? need}** permission to do that.`);
  }

  if (sub === "ban") {
    const user = target();
    const why = reason();
    const days = interaction.options.getInteger("delete_days") ?? 0;
    const { member, error } = await resolveTarget(interaction, user, "ban");
    if (error) return fail(error);
    try {
      await member.ban({ reason: why, deleteMessageSeconds: days * 86_400 });
    } catch (err) {
      return fail(`I could not ban ${user.tag}: ${describeError(err)}`);
    }
    return report(interaction, config, {
      action: "ban",
      targetId: user.id,
      targetTag: user.tag,
      reason: why,
      extra: days ? `Deleted ${days} day(s) of their messages.` : null
    });
  }

  if (sub === "unban") {
    const user = target();
    const why = reason();
    // No hierarchy check: the member has already left the server.
    const ban = await interaction.guild.bans.fetch(user.id).catch(() => null);
    if (!ban) return fail(`${user.tag} is not banned.`);
    try {
      await interaction.guild.bans.remove(user.id, why);
    } catch (err) {
      return fail(`I could not unban ${user.tag}: ${describeError(err)}`);
    }
    return report(interaction, config, { action: "unban", targetId: user.id, targetTag: user.tag, reason: why });
  }

  if (sub === "kick") {
    const user = target();
    const why = reason();
    const { member, error } = await resolveTarget(interaction, user, "kick");
    if (error) return fail(error);
    try {
      await member.kick(why);
    } catch (err) {
      return fail(`I could not kick ${user.tag}: ${describeError(err)}`);
    }
    return report(interaction, config, { action: "kick", targetId: user.id, targetTag: user.tag, reason: why });
  }

  if (sub === "softban") {
    const user = target();
    const why = reason();
    const { member, error } = await resolveTarget(interaction, user, "softban");
    if (error) return fail(error);
    try {
      // Kick and clear the last day of messages, then immediately lift the ban.
      await member.ban({ reason: why, deleteMessageSeconds: 86_400 });
      await interaction.guild.bans.remove(user.id, "Softban complete");
    } catch (err) {
      return fail(`I could not softban ${user.tag}: ${describeError(err)}`);
    }
    return report(interaction, config, {
      action: "softban",
      targetId: user.id,
      targetTag: user.tag,
      reason: why,
      extra: "Removed from the server and their last day of messages was deleted."
    });
  }

  if (sub === "timeout") {
    const user = target();
    const why = reason();
    let ms;
    try {
      ms = parseDuration(interaction.options.getString("duration", true));
    } catch (err) {
      return fail(`${err.message} Examples: 10m, 2h, 1d, 1h30m.`);
    }
    if (ms > MAX_TIMEOUT_MS) return fail("Timeouts can be at most 28 days.");
    if (ms < 1_000) return fail("That duration is too short. Try something like 10m or 1h.");

    const { member, error } = await resolveTarget(interaction, user, "time out");
    if (error) return fail(error);
    try {
      await member.timeout(ms, why);
    } catch (err) {
      return fail(`I could not time out ${user.tag}: ${describeError(err)}`);
    }
    return report(interaction, config, {
      action: "timeout",
      targetId: user.id,
      targetTag: user.tag,
      reason: why,
      durationMs: ms
    });
  }

  if (sub === "untimeout") {
    const user = target();
    const why = reason();
    const { member, error } = await resolveTarget(interaction, user, "clear the timeout of");
    if (error) return fail(error);
    if (!member.isCommunicationDisabled()) return fail(`${user.tag} is not timed out.`);
    try {
      await member.timeout(null, why);
    } catch (err) {
      return fail(`I could not clear the timeout for ${user.tag}: ${describeError(err)}`);
    }
    return report(interaction, config, { action: "untimeout", targetId: user.id, targetTag: user.tag, reason: why });
  }

  if (sub === "warn") {
    const user = target();
    const why = reason();
    const { error } = await resolveTarget(interaction, user, "warn");
    if (error) return fail(error);
    const stored = addWarning(interaction.guildId, {
      userId: user.id,
      moderatorId: interaction.user.id,
      reason: why
    });
    const active = listWarnings(interaction.guildId, user.id).length;
    return report(interaction, config, {
      action: "warn",
      targetId: user.id,
      targetTag: user.tag,
      reason: why,
      extra: `Warning #${stored.id}. ${active} active for this member.`
    });
  }

  if (sub === "clearwarnings") {
    const user = target();
    const removed = clearWarnings(interaction.guildId, user.id);
    if (!removed) return fail(`${user.tag} has no active warnings.`);
    return report(interaction, config, {
      action: "clearwarnings",
      targetId: user.id,
      targetTag: user.tag,
      reason: "Cleared by a moderator",
      extra: `Removed ${removed} warning(s).`
    });
  }

  if (sub === "warnings") {
    const user = target();
    const rows = listWarnings(interaction.guildId, user.id);
    if (!rows.length) return reply(BLURB, `${user.tag} has no active warnings.`);
    const body = rows
      .map((w) => `#${w.id} · <t:${Math.floor(w.createdAt / 1000)}:R> · by <@${w.moderatorId}>\n${w.reason}`)
      .join("\n")
      .slice(0, 4000);
    return reply(0xfee75c, `**${rows.length} active warning(s) for ${user.tag}**\n${body}`);
  }

  if (sub === "cases") {
    const user = interaction.options.getUser("user", false);
    const rows = listCases(interaction.guildId, { userId: user?.id ?? null, limit: 15 });
    if (!rows.length) return reply(BLURB, user ? `No moderation history for ${user.tag}.` : "No moderation history yet.");
    const body = rows
      .map(
        (c) =>
          `#${c.id} · ${Actions[c.action]?.label ?? c.action} · <@${c.targetId}> · by <@${c.moderatorId}> · <t:${Math.floor(c.createdAt / 1000)}:R>\n${c.reason}`
      )
      .join("\n")
      .slice(0, 4000);
    return reply(BLURB, `**Recent moderation actions**\n${body}`);
  }

  if (sub === "purge") {
    const amount = Math.min(interaction.options.getInteger("amount", true), MAX_PURGE);
    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) return fail("I could not delete those messages. I need Manage Messages in this channel.");
    await postModLog(interaction.guild, config.modLogChannelId, [
      { name: "Action", value: "\u{1F5D1} Purge", inline: true },
      { name: "Channel", value: `<#${interaction.channelId}>`, inline: true },
      { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Details", value: `Deleted ${deleted.size} message(s).`, inline: false }
    ]);
    return reply(BLURB, `Deleted **${deleted.size}** message(s) in <#${interaction.channelId}>.`);
  }

  if (sub === "slowmode") {
    const seconds = Math.min(interaction.options.getInteger("seconds", true), MAX_SLOWMODE);
    try {
      await interaction.channel.setRateLimitPerUser(seconds, "Slowmode changed by a moderator");
    } catch (err) {
      return fail(`I could not set slowmode: ${describeError(err)}`);
    }
    return reply(
      BLURB,
      seconds === 0
        ? "Slowmode is off in this channel."
        : `Slowmode in this channel is now **${seconds} second(s)**.`
    );
  }

  if (sub === "lock" || sub === "unlock") {
    const lock = sub === "lock";
    const everyone = interaction.guild.roles.everyone;
    const overwrite = lock
      ? { SendMessages: false, SendMessagesInThreads: false, AddReactions: false }
      : { SendMessages: null, SendMessagesInThreads: null, AddReactions: null };
    try {
      await interaction.channel.permissionOverwrites.edit(
        everyone,
        overwrite,
        `${lock ? "Locked" : "Unlocked"} by a moderator`
      );
    } catch (err) {
      return fail(`I could not ${sub} this channel: ${describeError(err)}`);
    }
    await postModLog(interaction.guild, config.modLogChannelId, [
      { name: "Action", value: lock ? "\u{1F512} Channel locked" : "\u{1F513} Channel unlocked", inline: true },
      { name: "Channel", value: `<#${interaction.channelId}>`, inline: true },
      { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true }
    ]);
    return reply(
      lock ? 0xed4245 : 0x57f287,
      lock
        ? `\u{1F512} <#${interaction.channelId}> is locked. @everyone cannot post there.`
        : `\u{1F513} <#${interaction.channelId}> is unlocked. Permissions are back to normal.`
    );
  }

  if (sub === "log") {
    const channel = interaction.options.getChannel("channel", false);
    if (channel && !channel.isTextBased()) return fail("Pick a text channel for the mod log.");
    setGuildConfig(interaction.guildId, { modLogChannelId: channel?.id ?? null });
    return reply(
      BLURB,
      channel
        ? `Moderation actions will be logged in <#${channel.id}>.`
        : "Mod-log channel cleared. Actions will no longer be posted to a channel."
    );
  }

  if (sub === "dmnotices") {
    const enabled = interaction.options.getBoolean("enabled", true);
    setGuildConfig(interaction.guildId, { dmNotices: enabled });
    return reply(BLURB, `Moderation DMs are now **${enabled ? "on" : "off"}**.`);
  }

  if (sub === "status") {
    const me = interaction.guild.members.me;
    const perms = [
      "BanMembers",
      "KickMembers",
      "ModerateMembers",
      "ManageMessages",
      "ManageChannels",
      "ManageRoles"
    ];
    return reply(
      BLURB,
      [
        "**Moderation settings**",
        `Mod log: ${
          config.modLogChannelId
            ? `<#${config.modLogChannelId}>`
            : "_not set - use `/mod log channel:#mod-logs`_"
        }`,
        `Moderation DMs: **${config.dmNotices ? "on" : "off"}**`,
        `My highest role position: **${me?.roles?.highest?.position ?? "?"}**`,
        "",
        ...perms.map((p) => `**${p}:** ${me?.permissions?.has(p) ? "yes" : "**no**"}`)
      ].join("\n")
    );
  }

  return fail("I do not know that moderation command.");
}
