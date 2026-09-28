import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const STORE_PATH = process.env.STORE_PATH || "./data/config.json";

const emptyStore = () => ({ guilds: {} });

const readStore = () => {
  if (!existsSync(STORE_PATH)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8"));
    return { guilds: parsed?.guilds && typeof parsed.guilds === "object" ? parsed.guilds : {} };
  } catch (error) {
    console.error(`[config] ${STORE_PATH} is not valid JSON, starting fresh:`, error.message);
    return emptyStore();
  }
};

const writeStore = (store) => {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
};

export const parseColor = (value, fallback = 0x57f287) => {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = String(value ?? "").trim();
  if (/^0x[0-9a-f]{6}$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^[0-9a-f]{6}$/i.test(text)) return Number.parseInt(text, 16);
  if (/^#[0-9a-f]{6}$/i.test(text)) return Number.parseInt(text.slice(1), 16);
  return fallback;
};

/** Effective settings for a guild: env defaults, overridden by stored per-guild values. */
export function getGuildConfig(guildId) {
  const stored = readStore().guilds[guildId] ?? {};
  return {
    guildId,
    roleId: stored.roleId ?? process.env.VERIFY_ROLE_ID ?? null,
    panelChannelId: stored.panelChannelId ?? process.env.VERIFY_PANEL_CHANNEL_ID ?? null,
    logChannelId: stored.logChannelId ?? process.env.VERIFY_LOG_CHANNEL_ID ?? null,
    modLogChannelId: stored.modLogChannelId ?? process.env.MOD_LOG_CHANNEL_ID ?? null,
    dmNotices: stored.dmNotices ?? process.env.MOD_DM_NOTICES !== "false",
    title: stored.title ?? process.env.VERIFY_TITLE ?? "Verify yourself",
    description:
      stored.description ??
      process.env.VERIFY_DESCRIPTION ??
      "Click the **Verify** button below to get the **Member** role and unlock the server.",
    buttonLabel: stored.buttonLabel ?? process.env.VERIFY_BUTTON_LABEL ?? "Verify",
    buttonEmoji: stored.buttonEmoji ?? process.env.VERIFY_BUTTON_EMOJI ?? "✅",
    color: parseColor(stored.color ?? process.env.VERIFY_COLOR)
  };
}

/** Merge a patch into a guild's stored settings and return the fresh effective config. */
export function setGuildConfig(guildId, patch) {
  const store = readStore();
  store.guilds[guildId] = { ...store.guilds[guildId], ...patch };
  writeStore(store);
  return getGuildConfig(guildId);
}

// Moderation records share this file with the verify settings. They are capped so the
// JSON cannot grow without bound; the mod-log channel is the long term record.

const MAX_WARNINGS = 100;
const MAX_CASES = 200;

/** Read a guild's raw record buckets, creating them on first use. */
const bucket = (store, guildId, key) => {
  const guild = (store.guilds[guildId] ??= {});
  if (!Array.isArray(guild[key])) guild[key] = [];
  return guild[key];
};

/** Case and warning numbers are a single counter per guild so they read like ticket numbers. */
const nextId = (store, guildId) => {
  const guild = (store.guilds[guildId] ??= {});
  const id = (Number.isInteger(guild.nextId) ? guild.nextId : 0) + 1;
  guild.nextId = id;
  return id;
};

const list = (store, guildId, key) => {
  const rows = bucket(store, guildId, key);
  return Array.isArray(rows) ? rows : [];
};

/** Record a warning against a member and keep the most recent ones. */
export function addWarning(guildId, { userId, moderatorId, reason }) {
  const store = readStore();
  const warning = { id: nextId(store, guildId), userId, moderatorId, reason, createdAt: Date.now() };
  bucket(store, guildId, "warnings").push(warning);
  store.guilds[guildId].warnings = store.guilds[guildId].warnings.slice(-MAX_WARNINGS);
  writeStore(store);
  return warning;
}

/** A member's active warnings, oldest first. */
export function listWarnings(guildId, userId) {
  return list(readStore(), guildId, "warnings").filter((w) => w.userId === userId);
}

/** Drop every warning for a member and report how many went. */
export function clearWarnings(guildId, userId) {
  const store = readStore();
  const warnings = bucket(store, guildId, "warnings");
  const before = warnings.length;
  store.guilds[guildId].warnings = warnings.filter((w) => w.userId !== userId);
  const removed = before - store.guilds[guildId].warnings.length;
  if (removed) writeStore(store);
  return removed;
}

/** Store one moderation action. */
export function recordCase(guildId, { action, targetId, moderatorId, reason }) {
  const store = readStore();
  const entry = { id: nextId(store, guildId), action, targetId, moderatorId, reason, createdAt: Date.now() };
  bucket(store, guildId, "cases").push(entry);
  store.guilds[guildId].cases = store.guilds[guildId].cases.slice(-MAX_CASES);
  writeStore(store);
  return entry;
}

/** Recent cases, newest first. Pass userId to filter down to one member. */
export function listCases(guildId, { userId = null, limit = 25 } = {}) {
  const rows = list(readStore(), guildId, "cases").filter((c) => !userId || c.targetId === userId);
  return rows.slice(-limit).reverse();
}

