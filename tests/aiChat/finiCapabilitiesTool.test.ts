import { afterEach, describe, expect, it } from "bun:test";
import {
  FINI_CAPABILITIES_TOOL,
  FINI_CAPABILITIES_TOOL_NAME,
  executeToolCall,
  getAvailableTools,
} from "../../modules/aiChat/llamaTools";

/**
 * The locally-served tool: Fini's own command list, answered in-process rather
 * than proxied out to an MCP server. These tests pin the two properties that
 * make that work - it is always offered, and it never reaches the network.
 *
 * `getAvailableTools` caches for a minute, so each test that cares about the
 * listing stubs fetch and then waits out nothing - instead the cache is dodged
 * by only asserting on the first call in this file. Ordering matters here.
 */

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("the fini_capabilities tool definition", () => {
  it("is an OpenAI-shaped function with an optional topic", () => {
    expect(FINI_CAPABILITIES_TOOL.type).toBe("function");
    expect(FINI_CAPABILITIES_TOOL.function.name).toBe(
      FINI_CAPABILITIES_TOOL_NAME,
    );

    const parameters = FINI_CAPABILITIES_TOOL.function.parameters as {
      properties: Record<string, unknown>;
      required: string[];
    };

    expect(Object.keys(parameters.properties)).toEqual(["topic"]);
    // A 2B model will call this with no arguments most of the time; requiring
    // one would make every such call fail validation.
    expect(parameters.required).toEqual([]);
  });

  it("describes itself in terms of the bot, so the model knows when to reach for it", () => {
    const description = FINI_CAPABILITIES_TOOL.function.description ?? "";

    expect(description.toLowerCase()).toContain("command");
  });
});

describe("executeToolCall for fini_capabilities", () => {
  it("answers in-process without touching the network", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("executeToolCall must not POST a locally-served tool");
    }) as typeof fetch;

    const result = await executeToolCall({
      function: { name: FINI_CAPABILITIES_TOOL_NAME, arguments: "{}" },
    });

    expect(called).toBe(false);
    expect(result).toContain("/balance");
  });

  it("passes a topic through to narrow the digest", async () => {
    const result = await executeToolCall({
      function: {
        name: FINI_CAPABILITIES_TOOL_NAME,
        arguments: '{"topic":"card"}',
      },
    });

    expect(result).toContain("/finicard");
    expect(result).not.toContain("/weather");
  });

  it("ignores malformed arguments rather than failing the call", async () => {
    // The usual small-model output: a truncated or non-object argument blob.
    const result = await executeToolCall({
      function: {
        name: FINI_CAPABILITIES_TOOL_NAME,
        arguments: '{"topic": "unterminated',
      },
    });

    expect(result).toContain("/balance");
  });

  it("ignores a non-string topic", async () => {
    const result = await executeToolCall({
      function: {
        name: FINI_CAPABILITIES_TOOL_NAME,
        arguments: '{"topic": 42}',
      },
    });

    expect(result).toContain("/balance");
  });
});

describe("getAvailableTools", () => {
  it("still offers the local tool when llama.cpp has none", async () => {
    // 403 feature_disabled is what llama.cpp returns with no MCP servers
    // configured. Previously that meant an empty list and no retrieval pass.
    globalThis.fetch = (async () =>
      new Response("feature_disabled", { status: 403 })) as typeof fetch;

    const tools = await getAvailableTools();

    expect(tools.map((t) => t.function.name)).toContain(
      FINI_CAPABILITIES_TOOL_NAME,
    );
  });
});
