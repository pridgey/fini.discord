/**
 * Connection details for the llama.cpp server started alongside the bot.
 *
 * Split out from converseWithLlama so llamaTools can reach them without the
 * two modules importing each other.
 */

/** Where the llama.cpp server is listening. */
export const LLAMA_API_URL =
  process.env.LLAMA_API_URL || "http://127.0.0.1:8081";

/**
 * The `-hf` repo the server was launched with. llama.cpp echoes this back from
 * /v1/models and, in router mode, uses it to pick which model answers.
 */
export const LLAMA_MODEL =
  process.env.LLAMA_MODEL || "ggml-org/gemma-4-E2B-it-GGUF:Q8_0";

/**
 * One OpenAI-compatible llama.cpp server that can answer a chat.
 *
 * There are two: a small model on the CPU for everyday chat, and a bigger one
 * on the GPU for questions that need real knowledge. See routeModel.ts for how
 * a message is sent to one or the other.
 */
export type LlamaBackend = {
  /** Short name for the logs. */
  name: "light" | "heavy";
  url: string;
  model: string;
  /** Sent as a bearer token when the server was started with --api-key. */
  apiKey?: string;
  /**
   * Whether the model's chat template keeps a system turn placed after the
   * conversation. Gemma's does, and Fini relies on that: the last instruction
   * before generation is the one a small model follows. Qwen's turns it into a
   * user message reading "[System note] ...", which the model then answers as
   * if the user had said it - so for Qwen those turns are folded into the
   * opening system message instead.
   */
  trailingSystemTurns: boolean;
};

/** Gemma on the CPU: started alongside the bot, answers everyday chat. */
export const LIGHT_BACKEND: LlamaBackend = {
  name: "light",
  url: LLAMA_API_URL,
  model: LLAMA_MODEL,
  trailingSystemTurns: true,
};

/**
 * The bigger model on the GPU, for questions that need precise knowledge.
 *
 * Not started by the bot - it's a separate, shared server (also used for
 * coding), so Fini has to cope with it being busy or down. The defaults
 * match the Qwen3.5-9B server on this machine.
 */
export const HEAVY_BACKEND: LlamaBackend = {
  name: "heavy",
  url: process.env.LLAMA_HEAVY_API_URL || "http://127.0.0.1:8000",
  model: process.env.LLAMA_HEAVY_MODEL || "local-coder",
  apiKey: process.env.LLAMA_HEAVY_API_KEY || undefined,
  trailingSystemTurns: false,
};

/**
 * The decision model (Kev-0.8B) that picks a backend for each message. It
 * answers through llama.cpp's /v1/systemone endpoint rather than chat.
 */
export const ROUTER_API_URL =
  process.env.ROUTER_API_URL || "http://127.0.0.1:8092";
