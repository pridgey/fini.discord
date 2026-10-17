import { describe, expect, it } from "bun:test";
import {
  NO_FURTHER_RETRIEVAL,
  RETRIEVAL_SKIP,
  STYLE_REMINDER,
  buildRetrievalPrompt,
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

describe("buildRetrievalPrompt", () => {
  it("states the date the caller passed", () => {
    const prompt = buildRetrievalPrompt(new Date("2026-08-26T17:16:00Z"));

    expect(prompt).toContain("2026");
    expect(prompt).toContain("August");
  });

  it("names the skip sentinel it expects back", () => {
    expect(buildRetrievalPrompt(new Date())).toContain(RETRIEVAL_SKIP);
  });

  it("tells the model its output is never shown to the user", () => {
    expect(buildRetrievalPrompt(new Date())).toContain("nothing you write is");
  });

  // The entire point of the split: a persona changed whether the bot searched
  // and how it framed the question, so this pass must stay neutral.
  it("carries no persona or style instruction", () => {
    const prompt = buildRetrievalPrompt(new Date()).toLowerCase();

    expect(prompt).not.toContain("persona");
    expect(prompt).not.toContain("in character");
    expect(prompt).not.toContain("emoji");
  });
});

describe("answering-pass reminders", () => {
  // STYLE_REMINDER suppressed tool calls when it shared a request with tools:
  // "respond in plain text, overriding anything above" reads as covering the
  // tool-call channel. It is only safe now because the answering pass sends no
  // tools, so it must not start advertising them again either.
  it("keeps tool instructions out of the style reminder", () => {
    const reminder = STYLE_REMINDER.toLowerCase();

    expect(reminder).not.toContain("tool");
    expect(reminder).not.toContain("search");
  });

  it("forbids promising a search it can no longer make", () => {
    expect(NO_FURTHER_RETRIEVAL).toContain("cannot search again");
    expect(NO_FURTHER_RETRIEVAL.toLowerCase()).toContain("say so plainly");
  });
});

describe("buildSystemPrompt capabilities", () => {
  it("says nothing about commands when none are passed", () => {
    // The llama path leaves this off - it gets the same text through a tool.
    const prompt = buildSystemPrompt(new Date());

    expect(prompt).not.toContain("authoritative");
  });

  it("includes the command list when one is passed", () => {
    const prompt = buildSystemPrompt(
      new Date(),
      "Finicoin:\n  /balance - How much Finicoin do I have?",
    );

    expect(prompt).toContain("/balance");
  });

  it("frames the list as closed, so the model won't invent a command", () => {
    const prompt = buildSystemPrompt(new Date(), "/balance - check balance");

    expect(prompt.toLowerCase()).toContain("complete and authoritative");
    expect(prompt.toLowerCase()).toContain("inventing");
  });

  it("treats a blank capability string as absent", () => {
    expect(buildSystemPrompt(new Date(), "   ")).not.toContain("authoritative");
  });

  it("keeps the date and grounding ahead of the command list", () => {
    const prompt = buildSystemPrompt(new Date(), "/balance - check balance");

    expect(prompt.indexOf("current date")).toBeLessThan(
      prompt.indexOf("/balance"),
    );
    expect(prompt).toContain("Fini coin is a fictional currency");
  });
});

describe("buildRetrievalPrompt capability routing", () => {
  it("tells the retrieval step to reach for the capabilities tool", () => {
    // Without this the local model answers "what can you do?" from its own
    // idea of a Discord bot and invents commands.
    const prompt = buildRetrievalPrompt(new Date());

    expect(prompt).toContain("fini_capabilities");
    expect(prompt).toContain("slash command");
  });
});
