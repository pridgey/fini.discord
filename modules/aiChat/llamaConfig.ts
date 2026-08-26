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
