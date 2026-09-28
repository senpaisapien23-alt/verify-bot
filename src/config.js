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
