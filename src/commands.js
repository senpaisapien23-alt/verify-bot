import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

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

export const commandData = () => [verifyCommand.toJSON()];
