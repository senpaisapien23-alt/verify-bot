# Verify Bot

One Discord bot for the Minecraft server: it handles **verification** with a button
panel, and it handles **moderation** with a single `/mod` command.

The verification flow posts one message with a **Verify** button. When somebody clicks
it, the bot gives them the verification role. Each click replies privately (only the
clicking member sees it), so the bot never spams the channel.

> This is the only bot you need to run. It is self-contained and shares no code or
> files with any other project in this workspace.

## What it does

### Verification

- Posts an embed with a green **Verify** button into a channel you pick.
- Grants the configured role to whoever clicks the button.
- Re-clicking is harmless — it replies "you are already verified".
- Refuses politely if the bot lacks `Manage Roles` or if the role sits above the
  bot's own role, instead of throwing a Discord error at the user.
- Optional audit log channel for every successful verification.
- `/verify unverify user:@someone` to take the role back.

### Moderation

- **Member actions** — ban, unban, kick, softban, timeout, untimeout, warn.
- **Warnings** — store, list and clear them per member, with a running count.
- **Case history** — every action is numbered, so `/mod cases user:@name` shows what
  happened to somebody and who did it.
- **Channel tools** — purge recent messages, set slowmode, lock and unlock a channel.
- **Two audit trails** — a private DM to the member, and a persistent embed in a
  mod-log channel that survives redeploys.
- **Role hierarchy is enforced** — the bot refuses to act on the server owner, on
  itself, or on anyone whose role is above the bot or above the moderator running
  the command, and it says exactly why in plain English.


## Commands

### `/verify`

| Command | What it does |
| --- | --- |
| `/verify role role:@Member` | Choose the role the button grants. |
| `/verify panel channel:#verification` | Post the verification message. |
| `/verify status` | Show the current settings. |
| `/verify unverify user:@name` | Remove the verify role from a member. |

All of them require the **Manage Roles** permission.

### `/mod`

Every moderation action lives under one command, so staff only have to learn one name.
Each subcommand asks for the permission it needs and refuses politely when the person
running it does not have it.

| Command | Needs | What it does |
| --- | --- | --- |
| `/mod ban user:@name reason delete_days:1` | Ban Members | Ban someone and optionally delete their recent messages. |
| `/mod unban user:@name reason` | Ban Members | Lift a ban. |
| `/mod kick user:@name reason` | Kick Members | Remove someone from the server. |
| `/mod softban user:@name reason` | Ban Members | Kick them and delete their last day of messages. |
| `/mod timeout user:@name duration:2h reason` | Moderate Members | Mute someone for `10m`, `2h`, `1d`, `1h30m`, up to 28 days. |
| `/mod untimeout user:@name` | Moderate Members | Let a muted member talk again. |
| `/mod warn user:@name reason` | Kick Members | Record a warning and DM it to them. |
| `/mod warnings user:@name` | Moderate Members | List their active warnings. |
| `/mod clearwarnings user:@name` | Ban Members | Wipe their warnings. |
| `/mod cases user:@name` | Moderate Members | Recent actions, newest first. Leave `user` out for everyone. |
| `/mod purge amount:50` | Manage Messages | Bulk delete in this channel, up to 100. |
| `/mod slowmode seconds:30` | Manage Channels | Rate limit this channel, `0` turns it off. |
| `/mod lock` / `/mod unlock` | Manage Channels | Stop or allow `@everyone` posting here. |
| `/mod log channel:#mod-logs` | Manage Channels | Where actions are recorded. Leave `channel` out to turn it off. |
| `/mod dmnotices enabled:false` | Manage Channels | Turn the member DMs on or off. |
| `/mod status` | none | Settings, plus which permissions the bot is missing. |

Every reply is **private to the moderator** — the channel stays clean and the DM
status is reported in the footer of each confirmation.


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
   Open the printed link. It requests everything verification and moderation need:
   `Manage Roles`, `Manage Messages`, `Manage Channels`, `Kick Members`,
   `Ban Members` and `Moderate Members`, plus the usual message permissions. No
   privileged intents or Developer Portal toggles are needed — the bot only uses the
   standard `Guilds` intent, and slash commands arrive with the member's roles
   attached. Moderation is slash-command only for exactly that reason: it avoids the
   Message Content intent.

   If the bot is already in your server, granting these at the channel or role level
   is enough — check with `/mod status`, which lists exactly what is missing.

5. **Fix the role order**
   Drag the bot's role **above** the role it will hand out, and above anybody you
   expect to moderate. Discord refuses otherwise, and the bot will tell you so
   instead of failing silently.

6. **Run**
   ```bash
   npm start
   ```

7. **In your server**
   ```
   /verify role role:@Member
   /verify panel channel:#verification
   /mod log channel:#mod-logs
   ```

## Options

Everything in `.env` is a default. Anything you set with `/verify role`,
`/verify panel`, `/mod log` or `/mod dmnotices` is stored per server in
`data/config.json` and overrides the default, so one instance can serve several
servers.

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
| `MOD_LOG_CHANNEL_ID` | Default channel for moderation records. |
| `MOD_DM_NOTICES` | Set to `false` to stop DMing members. |
| `STORE_PATH` | Where settings, warnings and cases are written. |


## Deploying to Railway

The bot needs no code changes to run on Railway. Import the repo, and Railway's
Nixpacks builder will detect Node and run `npm start` (see `railway.json`).

Set these as Railway variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Without it the process exits immediately. |
| `GUILD_ID` | recommended | Registers the commands instantly instead of globally. |
| `REGISTER_ON_START` | no | `false` skips re-registering on every boot. |
| `VERIFY_ROLE_ID` | see below | Role the button grants. |
| `VERIFY_PANEL_CHANNEL_ID` | see below | Where the panel is posted. |
| `MOD_LOG_CHANNEL_ID` | recommended | Where moderation actions are recorded. |

### Read this before you rely on `/verify role` or `/mod warnings`

Per-guild settings, warnings and case history are saved with `writeFileSync` to
`STORE_PATH` (see `src/config.js`). **Railway's filesystem is ephemeral — that file is
wiped on every redeploy and every restart.** After a restart the bot forgets which role
it was handing out, and the button replies *"Verification is not set up right now."*
Warnings and `/mod cases` come back empty too.

You have two ways to deal with it:

1. **Set the env variables.** `VERIFY_ROLE_ID`, `VERIFY_PANEL_CHANNEL_ID` and
   `MOD_LOG_CHANNEL_ID` are the fallbacks in `getGuildConfig`, so the bot works from a
   cold start with no file at all. This is the simple path and it is fine for one
   server. This is what most people want.

2. **Mount a Railway Volume** and point `STORE_PATH` at it, e.g. a volume at
   `/data` with `STORE_PATH=/data/config.json`. The file then survives
   restarts and `/verify role` and `/mod warnings` keep working across deploys.

   From the Railway dashboard: open the service -> **Volumes** -> **New volume**,
   mount it at `/data`, then add `STORE_PATH=/data/config.json` as a variable. From
   the CLI it is `railway volume add --service verify-bot --mount-path /data` followed
   by `railway volume attach`.

Either way, **the mod-log channel is the record that always survives**, because it
lives in Discord rather than in the container. Setting `/mod log channel:#mod-logs` is
worth doing even without a volume.

Note that the role ID lives in the file *and* the env var, and the file wins
(`stored.roleId ?? process.env.VERIFY_ROLE_ID`). With option 1 the file is
always empty after a restart, so the env var is what applies.

## Tests

```bash
npm test
```

The decision logic is kept pure so it is covered without a network connection:
`evaluateVerification` decides the verify button, `evaluateTarget` enforces the role
hierarchy, `parseDuration` turns `1h30m` into milliseconds, and `runModeration` is
exercised through a fake interaction to prove the permission and hierarchy guards fire.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Verification is not set up yet" | No role configured. Run `/verify role`. |
| "I am not allowed to give that role" | The role is above the bot's highest role. |
| "I cannot assign roles right now" | Bot lacks `Manage Roles`. |
| "I cannot act on X - their role is above mine" | Drag the bot's role above theirs. |
| "You need the Ban Members permission to do that" | The moderator lacks it, not the bot. |
| "DM: user has DMs disabled" | Expected. The action still happened and was logged. |
| "Log: no mod-log channel set" | Run `/mod log channel:#mod-logs`. |
| Warnings vanished after a deploy | Expected without a volume. See the Railway notes above. |
| Button does nothing | `REGISTER_ON_START` is off, or the button is from an older message. |
| Slash command missing | Wait a minute after boot, and confirm the bot was invited with the `applications.commands` scope. |
