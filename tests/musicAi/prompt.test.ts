import { describe, expect, it } from "bun:test";
import {
  MUSIC_STYLES,
  MUSIC_TEMPOS,
  buildMusicPrompt,
  styleChoices,
  styleLabel,
  tempoChoices,
  tempoLabel,
} from "../../modules/musicAi/prompt";

describe("choice lists", () => {
  it("stays inside Discord's 25 choice limit", () => {
    expect(MUSIC_STYLES.length).toBeLessThanOrEqual(25);
    expect(MUSIC_TEMPOS.length).toBeLessThanOrEqual(25);
  });

  it("offers choices without leaking the prompt labels", () => {
    // Discord rejects unknown keys on a choice, and the label is ours.
    for (const choice of [...styleChoices(), ...tempoChoices()]) {
      expect(Object.keys(choice).sort()).toEqual(["name", "value"]);
    }
  });

  it("has no duplicate values", () => {
    const values = MUSIC_STYLES.map((style) => style.value);

    expect(new Set(values).size).toBe(values.length);
  });
});

describe("label lookup", () => {
  it("expands a value into what the model was trained on", () => {
    expect(styleLabel("hip-hop")).toBe("hip hop");
    expect(styleLabel("lofi")).toBe("lo-fi hip hop");
  });

  it("gives tempo a number as well as a word", () => {
    expect(tempoLabel("fast")).toContain("BPM");
  });

  it("returns nothing for a value it does not know", () => {
    expect(styleLabel("dubstep")).toBeUndefined();
    expect(tempoLabel("presto")).toBeUndefined();
    expect(styleLabel(undefined)).toBeUndefined();
  });
});

describe("buildMusicPrompt", () => {
  it("uses the description alone when nothing else is picked", () => {
    expect(buildMusicPrompt({ description: "rain on a window" })).toBe(
      "rain on a window",
    );
  });

  it("leads with the user's own words", () => {
    const prompt = buildMusicPrompt({
      description: "rain on a window",
      style: "ambient",
    });

    expect(prompt).toStartWith("rain on a window");
  });

  it("composes style and tempo together", () => {
    // The old command refused both at once, which was a copy-paste of /tts's
    // voice-or-clip rule onto two options that are not exclusive at all.
    const prompt = buildMusicPrompt({
      description: "a chase scene",
      style: "orchestral",
      tempo: "fast",
    });

    expect(prompt).toContain("orchestral");
    expect(prompt).toContain("140 BPM");
  });

  it("ignores a choice it does not recognise", () => {
    // A stale client can still send a value that has since been removed.
    // Pasting it in would steer the generation with something nobody chose.
    const prompt = buildMusicPrompt({
      description: "a chase scene",
      style: "vaporwave",
    });

    expect(prompt).toBe("a chase scene");
  });

  it("flattens a multi-line description into one caption", () => {
    const prompt = buildMusicPrompt({
      description: "guitar\n\n  and   drums ",
      style: "rock",
    });

    expect(prompt).toBe("guitar and drums, rock");
  });
});
