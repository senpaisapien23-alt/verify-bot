# Verify Bot

A small Discord bot that posts one message with a **Verify** button. When somebody
clicks it, the bot gives them the verification role. That is the whole idea.

Each click replies privately (only the clicking member sees it), so the bot never
spams the channel.

> This is a **standalone project**. It shares no code and no files with any other
> bot in this workspace.

## What it does

- Posts an embed with a green **Verify** button into a channel you pick.
- Grants the configured role to whoever clicks the button.
- Re-clicking is harmless — it replies "you are already verified".
- Refuses politely if the bot lacks `Manage Roles` or if the role sits above the
  bot's own role, instead of throwing a Discord error at the user.
- Optional audit log channel for every successful verification.
- `/verify unverify user:@someone` to take the role back.

## Commands

| Command | What it does |
| --- | --- |
| `/verify role role:@Member` | Choose the role the button grants. |
| `/verify panel channel:#verification` | Post the verification message. |
| `/verify status` | Show the current settings. |
| `/verify unverify user:@name` | Remove the verify role from a member. |

All of them require the **Manage Roles** permission.

## Setup

1. **Create the app**
   Go to <https://discord.com/developers/applications> -> *New Application*.
   Open **Bot** -> *Reset Token* and copy it.

2. **Get your IDs**
   In the same page copy **Application ID**. In Discord, enable
   *User Settings -> Advanced -> Developer Mode*, then right-click your server ->
   *Copy Server ID* and the channel -> *Copy Channel ID*.

3. **Configure**
   ```bash
   cp .env.example .env
   ```
   Fill in `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`. Setting `GUILD_ID` makes
   slash commands appear instantly; leaving it blank registers them globally
   (which can take up to an hour).

4. **Invite the bot**
   ```bash
   npm run invite
   ```
   Open the printed link. It requests `Manage Roles` plus the usual message
   permissions. No privileged intents or Developer Portal toggles are needed —
   the bot only uses the standard `Guilds` intent.

5. **Fix the role order**
   Drag the bot's role **above** the role it will hand out. Discord refuses
   otherwise, and the bot will tell you so instead of failing silently.

6. **Run**
   ```bash
   npm start
   ```

7. **In your server**
   ```
   /verify role role:@Member
   /verify panel channel:#verification
   ```

## Options

Everything in `.env` is a default. Anything you set with `/verify role` or
`/verify panel` is stored per server in `data/config.json` and overrides the
default, so one instance can serve several servers.

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Bot token. Required. |
| `CLIENT_ID` | Application id, used by `npm run invite`. |
| `GUILD_ID` | Guild for instant command registration. |
| `REGISTER_ON_START` | Set to `false` to skip registering on boot. |
| `VERIFY_ROLE_ID` | Default role handed out. |
| `VERIFY_LOG_CHANNEL_ID` | Optional channel for verification logs. |
| `VERIFY_TITLE` / `VERIFY_DESCRIPTION` | Panel text. |
| `VERIFY_BUTTON_LABEL` / `VERIFY_BUTTON_EMOJI` | Button look. |
| `VERIFY_COLOR` | Embed colour, e.g. `0x57f287`. |
| `AUTO_POST_GUILD_ID` / `AUTO_POST_CHANNEL_ID` | Post the panel on every restart. |

## Tests

```bash
npm test
```

The decision logic (`evaluateVerification`) is a pure function, so all branches
are covered without a network connection.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Verification is not set up yet" | No role configured. Run `/verify role`. |
| "I am not allowed to give that role" | The role is above the bot's highest role. |
| "I cannot assign roles right now" | Bot lacks `Manage Roles`. |
| Button does nothing | `REGISTER_ON_START` is off, or the button is from an older message. |
| Slash command missing | Wait a minute after boot, and confirm the bot was invited with the `applications.commands` scope. |
