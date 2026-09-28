import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";

export const VERIFY_CUSTOM_ID = "verify:grant";

export const Result = {
  GRANTED: "granted",
  ALREADY_VERIFIED: "already_verified",
  ROLE_MISSING: "role_missing",
  BOT_NO_PERMISSION: "bot_no_permission",
  ROLE_TOO_HIGH: "role_too_high",
  NOT_IN_GUILD: "not_in_guild"
};

/**
 * Decide what should happen when the Verify button is clicked.
 * Pure function - no Discord objects, so it is easy to unit test.
 */
export function evaluateVerification({ roleId, hasRole, canManageRoles, botRolePosition, rolePosition }) {
  if (!roleId) {
    return {
      code: Result.ROLE_MISSING,
      message: "Verification is not set up right now. Please tell a server admin."
    };
  }
  if (hasRole) return { code: Result.ALREADY_VERIFIED, message: "You are already verified. Enjoy!" };
  if (!canManageRoles) return { code: Result.BOT_NO_PERMISSION, message: "I cannot assign roles right now. Please tell a server admin." };
  if (rolePosition !== null && botRolePosition !== null && botRolePosition <= rolePosition) {
    return {
      code: Result.ROLE_TOO_HIGH,
      message: "I am not allowed to give that role. Please tell a server admin to move my role above it."
    };
  }
  return { code: Result.GRANTED, message: "You are verified! You now have the **Member** role." };
}

/** Build the message payload that carries the Verify button. */
export function buildPanel(config) {
  const button = new ButtonBuilder()
    .setCustomId(VERIFY_CUSTOM_ID)
    .setLabel(config.buttonLabel)
    .setStyle(ButtonStyle.Success)
    .setEmoji(config.buttonEmoji);

  return {
    content: "🔒 **Verification required** — click the button below to get access.",
    embeds: [
      new EmbedBuilder()
        .setTitle(config.title)
        .setDescription(config.description.slice(0, 4096))
        .setColor(config.color)
        .setTimestamp()
    ],
    components: [new ActionRowBuilder().addComponents(button)]
  };
}

/**
 * Collect the raw facts Discord knows about and ask evaluateVerification what to do.
 * Applies the role when the evaluation says it is safe to do so.
 */
export async function handleVerifyClick(interaction, config) {
  if (!interaction.inGuild?.()) {
    await interaction.reply({ content: "Verification only works inside a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const { guild } = interaction;
  const role = config.roleId ? await guild.roles.fetch(config.roleId).catch(() => null) : null;
  const me = guild.members.me;

  const outcome = evaluateVerification({
    roleId: role ? role.id : null,
    hasRole: role ? interaction.member.roles.cache.has(role.id) : false,
    canManageRoles: Boolean(me?.permissions?.has("ManageRoles")),
    botRolePosition: me?.roles?.highest?.position ?? null,
    rolePosition: role?.position ?? null
  });

  if (outcome.code === Result.GRANTED) {
    try {
      await interaction.member.roles.add(role, "Clicked the Verify button");
    } catch (error) {
      console.error(`[verify] failed to grant role in ${guild.id}:`, error);
      await interaction.reply({
        content: "Something went wrong while giving you the role. Please try again in a moment.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await interaction.reply({ content: outcome.message, flags: MessageFlags.Ephemeral });
    if (config.logChannelId) {
      const log = guild.channels.cache.get(config.logChannelId);
      if (log?.isTextBased()) {
        await log
          .send({ content: `✅ ${interaction.user.tag} verified and received **${role.name}**.` })
          .catch((error) => console.error("[verify] log failed:", error));
      }
    }
    return;
  }

  await interaction.reply({ content: outcome.message, flags: MessageFlags.Ephemeral });
}
