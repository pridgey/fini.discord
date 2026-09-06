import { describe, expect, it } from "bun:test";
import { forRetrieval, isSkip } from "../../modules/aiChat/converseWithLlama";

describe("isSkip", () => {
  // The retrieval pass is asked for one exact word, and a 2B model will not
  // always give one. Reading these as anything other than "no search needed"
  // would force a pointless web search on every piece of small talk.
  it.each(["SKIP", "skip", " SKIP ", "SKIP.", "skip - no search needed", ""])(
    "reads %p as a refusal to search",
    (content) => {
      expect(isSkip(content)).toBe(true);
    },
  );

  // The other half: prose that is neither a tool call nor a skip means the
  // model ignored the protocol and started answering, which is what triggers
  // the forced retry.
  it.each([
    "chatplats.com is a platform focused on anonymous feedback collection.",
    "I'll check the waters for the latest intel on that site for ye.",
    "I do not have specific, up-to-date information about that website.",
  ])("reads %p as ignoring the protocol", (content) => {
    expect(isSkip(content)).toBe(false);
  });
});

describe("forRetrieval", () => {
  const long = (n: number) => "x".repeat(n);

  it("keeps the newest turn whole, because that is the question", () => {
    const result = forRetrieval([
      { role: "user", content: long(500) },
      { role: "user", content: long(500) },
    ]);

    expect(result.at(-1)?.content).toHaveLength(500);
  });

  it("trims older turns to a topic-sized excerpt", () => {
    const result = forRetrieval([
      { role: "assistant", content: long(500) },
      { role: "user", content: "tell me more" },
    ]);

    expect((result[0].content as string).length).toBeLessThan(500);
    expect(result[0].content).toEndWith("...");
  });

  it("leaves short turns untouched", () => {
    const result = forRetrieval([
      { role: "assistant", content: "Aye, that be a research tool." },
      { role: "user", content: "tell me more" },
    ]);

    expect(result[0].content).toBe("Aye, that be a research tool.");
  });

  it("only keeps the most recent turns", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      role: "user" as const,
      content: `turn ${i}`,
    }));

    const result = forRetrieval(many);

    expect(result.length).toBeLessThan(many.length);
    expect(result.at(-1)?.content).toBe("turn 29");
  });

  // Running the multimodal projector a second time per message is a real cost,
  // and the retrieval decision does not need to see the picture.
  it("drops inline images but keeps the text beside them", () => {
    const result = forRetrieval([
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
        ],
      },
    ]);

    expect(result[0].content).toBe("what is this?");
  });

  it("preserves the role of every turn it keeps", () => {
    const result = forRetrieval([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "what is example.com?" },
    ]);

    expect(result.map((turn) => turn.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
  });
});
