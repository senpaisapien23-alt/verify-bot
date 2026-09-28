import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// config.js reads STORE_PATH once at import time, so point it at a scratch file first.
const scratch = mkdtempSync(join(tmpdir(), "verify-bot-"));
process.env.STORE_PATH = join(scratch, "config.json");

const { Deny, describeError, evaluateTarget, runModeration } = await import("../src/moderation.js");
const { durationParts, parseDuration, MAX_TIMEOUT_MS } = await import("../src/constants.js");
const { addWarning, clearWarnings, listCases, listWarnings, recordCase, getGuildConfig, setGuildConfig } = await import(
  "../src/config.js"
);
const { commandData } = await import("../src/commands.js");

const GUILD = "g1";
const base = {
  moderatorId: "mod",
  targetId: "target",
  targetTag: "target#0001",
  targetPosition: 3,
  moderatorPosition: 5,
  botPosition: 8,
  ownerId: "owner"
};

after(() => rmSync(scratch, { recursive: true, force: true }));

test("allows an action against a lower ranked member", () => {
  assert.equal(evaluateTarget(base).ok, true);
});

test("refuses the moderator themselves", () => {
  const outcome = evaluateTarget({ ...base, targetId: base.moderatorId });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, Deny.SELF);
});

test("refuses the server owner", () => {
  const outcome = evaluateTarget({ ...base, targetId: base.ownerId, targetPosition: 1 });
  assert.equal(outcome.reason, Deny.OWNER);
});

test("refuses a target above the bot's own role", () => {
  const outcome = evaluateTarget({ ...base, targetPosition: 9 });
  assert.equal(outcome.reason, Deny.ABOVE_BOT);
  assert.match(outcome.message, /above mine/);
});

test("refuses a target at or above the moderator's role", () => {
  assert.equal(evaluateTarget({ ...base, targetPosition: 6 }).reason, Deny.ABOVE_MODERATOR);
  assert.equal(evaluateTarget({ ...base, targetPosition: 5 }).reason, Deny.ABOVE_MODERATOR);
});

test("checks the bot's role before the moderator's role", () => {
  const outcome = evaluateTarget({ ...base, targetPosition: 12, moderatorPosition: 1 });
  assert.equal(outcome.reason, Deny.ABOVE_BOT);
});

test("uses the verb in the refusal message", () => {
  assert.match(evaluateTarget({ ...base, targetId: base.moderatorId, verb: "ban" }).message, /cannot ban yourself/);
});

test("turns known Discord error codes into sentences", () => {
  assert.equal(describeError({ code: 10013, message: "raw" }), "That is the server owner.");
  assert.equal(describeError({ code: 50013, message: "raw" }), "I do not have permission to do that here.");
});

test("falls back to the raw message for unknown errors", () => {
  assert.equal(describeError({ code: 999999, message: "boom" }), "boom");
  assert.equal(describeError(undefined), "unknown error");
});

test("parses human durations into milliseconds", () => {
  assert.equal(parseDuration("10m"), 600_000);
  assert.equal(parseDuration("2h"), 7_200_000);
  assert.equal(parseDuration("1h30m"), 5_400_000);
  assert.equal(parseDuration("1d"), 86_400_000);
  assert.equal(parseDuration("1w"), 604_800_000);
  assert.equal(parseDuration("30"), 1_800_000);
  assert.equal(parseDuration("30", "h"), 108_000_000);
  assert.equal(parseDuration(" 45S "), 45_000, "surrounding spaces and capitals are fine");
});

test("rejects durations it cannot fully understand", () => {
  assert.throws(() => parseDuration("10 minutes"), /duration/i);
  assert.throws(() => parseDuration("abc"), /duration/i);
  assert.throws(() => parseDuration(""), /duration/i);
  assert.throws(() => parseDuration("10x"), /duration/i);
});

test("renders milliseconds back as a readable duration", () => {
  assert.equal(durationParts(5_400_000), "1h 30m");
  assert.equal(durationParts(86_400_000), "1d");
  assert.equal(durationParts(0), "0s");
  assert.equal(durationParts(MAX_TIMEOUT_MS), "4w");
});

test("stores, lists and clears warnings per member", () => {
  const first = addWarning(GUILD, { userId: "u1", moderatorId: "mod", reason: "spam" });
  addWarning(GUILD, { userId: "u1", moderatorId: "mod", reason: "flood" });
  addWarning(GUILD, { userId: "u2", moderatorId: "mod", reason: "other member" });

  assert.equal(first.id, 1);
  assert.equal(listWarnings(GUILD, "u1").length, 2);
  assert.equal(listWarnings(GUILD, "u2").length, 1);
  assert.equal(listWarnings(GUILD, "nobody").length, 0);

  assert.equal(clearWarnings(GUILD, "u1"), 2);
  assert.equal(listWarnings(GUILD, "u1").length, 0);
  assert.equal(clearWarnings(GUILD, "u1"), 0);
  assert.equal(listWarnings(GUILD, "u2").length, 1);
});

test("records cases newest first and can filter by member", () => {
  recordCase(GUILD, { action: "ban", targetId: "u1", moderatorId: "mod", reason: "hacking" });
  recordCase(GUILD, { action: "warn", targetId: "u2", moderatorId: "mod", reason: "chatting" });

  const all = listCases(GUILD);
  assert.equal(all.length, 2);
  assert.equal(all[0].action, "warn", "newest case comes first");

  const forUser = listCases(GUILD, { userId: "u1" });
  assert.equal(forUser.length, 1);
  assert.equal(forUser[0].action, "ban");
  assert.ok(forUser[0].createdAt > 0);
});

test("keeps moderation settings alongside the verify settings", () => {
  setGuildConfig(GUILD, { roleId: "r1" });
  setGuildConfig(GUILD, { modLogChannelId: "c1" });

  const config = getGuildConfig(GUILD);
  assert.equal(config.roleId, "r1", "the verify role survives a moderation change");
  assert.equal(config.modLogChannelId, "c1");
  assert.equal(config.dmNotices, true, "DM notices are on unless turned off");

  setGuildConfig(GUILD, { dmNotices: false });
  assert.equal(getGuildConfig(GUILD).dmNotices, false);
  assert.equal(getGuildConfig(GUILD).roleId, "r1", "disabling DMs does not disturb verify");
});

test("registers /verify and /mod with unique subcommands", () => {
  const data = commandData();
  assert.deepEqual(
    data.map((c) => c.name),
    ["verify", "mod"]
  );

  const subs = data.find((c) => c.name === "mod").options.map((o) => o.name);
  assert.equal(new Set(subs).size, subs.length, "no duplicate /mod subcommands");
  assert.deepEqual(subs, [
    "ban",
    "unban",
    "kick",
    "softban",
    "timeout",
    "untimeout",
    "warn",
    "warnings",
    "clearwarnings",
    "cases",
    "purge",
    "slowmode",
    "lock",
    "unlock",
    "log",
    "dmnotices",
    "status"
  ]);
});

test("every /mod subcommand that acts on a person requires one", () => {
  const mod = commandData().find((c) => c.name === "mod");
  const withoutTarget = new Set(["cases", "log", "dmnotices", "status", "purge", "slowmode", "lock", "unlock"]);

  for (const sub of mod.options) {
    if (withoutTarget.has(sub.name)) continue;
    const user = (sub.options ?? []).find((o) => o.name === "user");
    assert.ok(user, `${sub.name} should offer a user option`);
    assert.equal(user.required, true, `${sub.name} should require a user`);
  }
});

test("/mod timeout requires a duration and /mod purge bounds the amount", () => {
  const mod = commandData().find((c) => c.name === "mod");
  const find = (name) => mod.options.find((o) => o.name === name).options;

  assert.equal(find("timeout").find((o) => o.name === "duration").required, true);
  assert.equal(find("purge").find((o) => o.name === "amount").max_value, 100);
});

/**
 * The command handler is only reachable through a real gateway, so these stand in a
 * fake interaction to prove the wiring: defer first, refuse without the permission,
 * and refuse a target the moderator outranks.
 */
const fakeMember = (id, position) => ({ id, user: { tag: `${id}#0001` }, roles: { highest: { position } } });

const fakeInteraction = ({ sub, options = {}, permissions = [], members = {} } = {}) => ({
  guildId: GUILD,
  channelId: "chan",
  client: {},
  user: { id: "mod", tag: "mod#0001" },
  member: { roles: { highest: { position: 5 } } },
  memberPermissions: { has: (permission) => permissions.includes(permission) },
  options: {
    getSubcommand: () => sub,
    getUser: (name, required) => options[name] ?? (required ? null : null),
    getString: (name) => options[name] ?? null,
    getInteger: (name) => options[name] ?? null,
    getBoolean: (name) => options[name] ?? null,
    getChannel: (name) => options[name] ?? null
  },
  guild: {
    id: GUILD,
    name: "Peak MC",
    ownerId: "owner",
    channels: { cache: new Map() },
    members: {
      me: { roles: { highest: { position: 9 } }, permissions: { has: () => true } },
      fetch: async (id) => members[id] ?? null
    }
  },
  deferReply: async () => {}
});

test("/mod status answers without needing any permission", async () => {
  const result = await runModeration(fakeInteraction({ sub: "status" }));
  assert.equal(result.embeds.length, 1);
  assert.match(result.embeds[0].data.description, /Moderation settings/);
});

test("/mod refuses an action the moderator does not have permission for", async () => {
  const result = await runModeration(
    fakeInteraction({ sub: "purge", options: { amount: 5 }, permissions: [] })
  );
  assert.match(result.content, /Manage Messages/);
});

test("/mod refuses a ban against the moderator themselves", async () => {
  const self = fakeMember("mod", 5);
  const result = await runModeration(
    fakeInteraction({
      sub: "ban",
      options: { user: { id: "mod", tag: "mod#0001" } },
      permissions: ["BanMembers"],
      members: { mod: self }
    })
  );
  assert.match(result.content, /cannot ban yourself/i);
});

test("/mod refuses a target who outranks the bot", async () => {
  const admin = fakeMember("u1", 12);
  const result = await runModeration(
    fakeInteraction({
      sub: "kick",
      options: { user: { id: "u1", tag: "u1#0001" }, reason: "spam" },
      permissions: ["KickMembers"],
      members: { u1: admin }
    })
  );
  assert.match(result.content, /above mine/i);
});

test("/mod explains when the target is not in the server", async () => {
  const result = await runModeration(
    fakeInteraction({
      sub: "kick",
      options: { user: { id: "ghost", tag: "ghost#0001" } },
      permissions: ["KickMembers"],
      members: {}
    })
  );
  assert.match(result.content, /not in this server/i);
});

