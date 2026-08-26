import { describe, expect, it } from "bun:test";
import {
  STYLE_REMINDER,
  buildSystemPrompt,
} from "../../modules/aiChat/systemPrompt";

describe("buildSystemPrompt", () => {
  it("states the date the caller passed", () => {
    const prompt = buildSystemPrompt(new Date("2026-08-26T17:16:00Z"));

    expect(prompt).toContain("2026");
    expect(prompt).toContain("August");
    expect(prompt).toContain("26");
  });

  it("names the day of the week, for 'this weekend' style questions", () => {
    expect(buildSystemPrompt(new Date("2026-08-26T17:16:00Z"))).toContain(
      "Wednesday",
    );
  });

  it("keeps the grounding facts alongside the date", () => {
    const prompt = buildSystemPrompt(new Date("2026-08-26T17:16:00Z"));

    expect(prompt).toContain("Fini coin");
    expect(prompt).toContain("March 10");
  });

  it("re-stamps on every call rather than freezing at import", () => {
    // The whole reason this is a function: a module-level constant would pin
    // the date to whenever the bot last restarted.
    const january = buildSystemPrompt(new Date("2026-01-05T12:00:00Z"));
    const august = buildSystemPrompt(new Date("2026-08-26T12:00:00Z"));

    expect(january).not.toBe(august);
    expect(january).toContain("January");
    expect(august).toContain("August");
  });

  it("warns that its own knowledge may be stale", () => {
    expect(buildSystemPrompt(new Date())).toContain("cutoff");
  });
});

describe("style rules", () => {
  it("bans emoji in the system prompt", () => {
    expect(buildSystemPrompt(new Date())).toContain("emoji");
  });

  it("bans parenthetical stage directions in the system prompt", () => {
    const prompt = buildSystemPrompt(new Date());

    expect(prompt).toContain("stage directions");
    expect(prompt).toContain("parentheses");
  });

  it("allows roleplay when the user explicitly asks for it", () => {
    expect(buildSystemPrompt(new Date())).toContain(
      "unless the user explicitly asks you to roleplay",
    );
  });

  it("repeats both rules in the trailing reminder", () => {
    // The reminder is what actually holds the line deep into a conversation,
    // so it has to restate the rules rather than just point at them.
    expect(STYLE_REMINDER).toContain("No emoji");
    expect(STYLE_REMINDER).toContain("stage directions");
  });

  it("tells the reminder to win against the transcript above it", () => {
    expect(STYLE_REMINDER).toContain("overriding anything in the conversation");
  });
});
