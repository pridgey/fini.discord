import { describe, expect, it } from "bun:test";
import {
  extractToolResultText,
  parseToolArguments,
  truncateToolResult,
} from "../../modules/aiChat/llamaTools";

describe("parseToolArguments", () => {
  it("parses a normal argument object", () => {
    expect(parseToolArguments('{"query":"capital of France"}')).toEqual({
      query: "capital of France",
    });
  });

  it("treats missing or blank arguments as none", () => {
    expect(parseToolArguments(undefined)).toEqual({});
    expect(parseToolArguments("")).toEqual({});
    expect(parseToolArguments("   ")).toEqual({});
  });

  it("survives the malformed JSON a small model will eventually emit", () => {
    // The whole reason this is a function: a throw here would kill the reply.
    expect(parseToolArguments('{"query": "unterminated')).toEqual({});
    expect(parseToolArguments("not json at all")).toEqual({});
  });

  it("rejects non-object JSON, which no tool can accept as an argument map", () => {
    expect(parseToolArguments('"just a string"')).toEqual({});
    expect(parseToolArguments("[1,2,3]")).toEqual({});
    expect(parseToolArguments("null")).toEqual({});
  });
});

describe("extractToolResultText", () => {
  it("reads llama.cpp's success shape", () => {
    expect(
      extractToolResultText({ plain_text_response: "Paris is the capital." }),
    ).toBe("Paris is the capital.");
  });

  it("surfaces a failing MCP tool's error so the model doesn't invent an answer", () => {
    const result = extractToolResultText({
      error: "MCP error -32602: Input validation error",
    });

    expect(result).toBe("Tool error: MCP error -32602: Input validation error");
  });

  it("turns llama.cpp's own error shape into something the model can act on", () => {
    const result = extractToolResultText({
      code: 400,
      message: "key 'tool' not found",
    });

    expect(result).toBe("Tool error: key 'tool' not found");
  });

  it("passes through an unrecognised shape rather than dropping it", () => {
    expect(extractToolResultText({ results: [1, 2] })).toBe(
      '{"results":[1,2]}',
    );
  });

  it("passes a bare string through untouched", () => {
    expect(extractToolResultText("raw text")).toBe("raw text");
  });
});

describe("truncateToolResult", () => {
  it("leaves short output alone", () => {
    expect(truncateToolResult("short", 100)).toBe("short");
  });

  it("caps long output and says how much it dropped", () => {
    const result = truncateToolResult("x".repeat(150), 100);

    expect(result.startsWith("x".repeat(100))).toBe(true);
    expect(result).toContain("truncated 50 characters");
  });

  it("doesn't truncate output sitting exactly on the limit", () => {
    expect(truncateToolResult("y".repeat(100), 100)).toBe("y".repeat(100));
  });
});
