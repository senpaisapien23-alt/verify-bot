import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateVerification, Result, buildPanel, VERIFY_CUSTOM_ID } from "../src/verify.js";
import { parseColor } from "../src/config.js";

const base = { roleId: "123", hasRole: false, canManageRoles: true, botRolePosition: 10, rolePosition: 5 };

test("grants the role when everything is in order", () => {
  const outcome = evaluateVerification(base);
  assert.equal(outcome.code, Result.GRANTED);
  assert.match(outcome.message, /verified/i);
});

test("tells a user they are already verified instead of re-adding", () => {
  const outcome = evaluateVerification({ ...base, hasRole: true });
  assert.equal(outcome.code, Result.ALREADY_VERIFIED);
});

test("flags a missing role configuration", () => {
  const outcome = evaluateVerification({ ...base, roleId: null });
  assert.equal(outcome.code, Result.ROLE_MISSING);
});

test("flags missing Manage Roles permission", () => {
  const outcome = evaluateVerification({ ...base, canManageRoles: false });
  assert.equal(outcome.code, Result.BOT_NO_PERMISSION);
});

test("refuses when the role sits above the bot's highest role", () => {
  const outcome = evaluateVerification({ ...base, botRolePosition: 3, rolePosition: 7 });
  assert.equal(outcome.code, Result.ROLE_TOO_HIGH);
});

test("allows a role at the same position boundary only when strictly above", () => {
  assert.equal(evaluateVerification({ ...base, botRolePosition: 5, rolePosition: 5 }).code, Result.ROLE_TOO_HIGH);
  assert.equal(evaluateVerification({ ...base, botRolePosition: 6, rolePosition: 5 }).code, Result.GRANTED);
});

test("checks the already-verified case before permission problems", () => {
  const outcome = evaluateVerification({ ...base, hasRole: true, canManageRoles: false });
  assert.equal(outcome.code, Result.ALREADY_VERIFIED);
});

test("builds a panel with one button row and the verify custom id", () => {
  const panel = buildPanel({
    title: "Verify",
    description: "Press the button.",
    color: 0x57f287,
    buttonLabel: "Verify",
    buttonEmoji: "✅"
  });
  assert.equal(panel.components.length, 1);
  const button = panel.components[0].toJSON().components[0];
  assert.equal(button.custom_id, VERIFY_CUSTOM_ID);
  assert.equal(button.label, "Verify");
  assert.equal(panel.embeds[0].data.title, "Verify");
});

test("truncates very long descriptions to Discord's embed limit", () => {
  const panel = buildPanel({ title: "T", description: "x".repeat(5000), color: 0, buttonLabel: "V", buttonEmoji: "✅" });
  assert.equal(panel.embeds[0].data.description.length, 4096);
});

test("parses hex colors in several formats", () => {
  assert.equal(parseColor("0x57f287"), 0x57f287);
  assert.equal(parseColor("57F287"), 0x57f287);
  assert.equal(parseColor("#57f287"), 0x57f287);
  assert.equal(parseColor("nonsense"), 0x57f287);
  assert.equal(parseColor(undefined, 0x123456), 0x123456);
});
