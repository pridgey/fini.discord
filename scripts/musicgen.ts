#!/usr/bin/env bun
/**
 * The generator half of `/music-ai`, run as its own process.
 *
 * MusicGen Small through transformers.js and onnxruntime-node, reading the
 * prompt from stdin and writing a 32kHz mono wav.
 *
 * This is a separate process rather than a function the bot calls, for the
 * same reason `/tts` shells out: the three ONNX sessions are about 630MB on
 * disk and more than that resident, and this box has around 2.7GB free with
 * Pocketbase, the chat model and ffmpeg already on it. A process that exits
 * gives the memory back. It also means `runProcess` can enforce a timeout and
 * a sandbox on it, which is not something an in-process `await` can offer.
 *
 * Nothing here reaches the network. The weights are installed by
 * `scripts/setup-music.sh` and loaded from disk, and `allowRemoteModels` is
 * off so a missing file is an error rather than a silent 630MB download in the
 * middle of a Discord interaction.
 *
 * Usage: bun scripts/musicgen.ts --model-dir DIR --out FILE --seconds N
 *        with the prompt on stdin.
 */

import { writeFile } from "fs/promises";
import { basename, dirname } from "path";
import {
  AutoTokenizer,
  MusicgenForConditionalGeneration,
  env,
  random,
} from "@huggingface/transformers";

/**
 * Codec frames per second of audio.
 *
 * MusicGen's EnCodec runs at 50Hz, so `max_new_tokens` is just seconds x 50.
 * The model adds `num_codebooks - 1` steps of its own for the delay pattern,
 * which is why a request for 2.5 seconds comes back very slightly long rather
 * than short - the right direction to round.
 */
const FRAMES_PER_SECOND = 50;

/** Sample rate the codec decodes to. Not configurable; it is a model property. */
const SAMPLE_RATE = 32000;

type Args = {
  modelDir: string;
  out: string;
  seconds: number;
  guidance: number;
  seed?: number;
};

/**
 * Reads the argument list.
 *
 * Hand-rolled rather than a flag library because this is an internal entry
 * point with four options and one caller, and a dependency loaded before the
 * model is a dependency in the bot's critical path.
 * @param argv Arguments after the script name
 * @returns The parsed options
 */
const parseArgs = (argv: string[]): Args => {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };

  const modelDir = value("--model-dir");
  const out = value("--out");
  const seconds = Number(value("--seconds"));

  if (!modelDir || !out || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      "usage: musicgen.ts --model-dir DIR --out FILE --seconds N [--guidance N] [--seed N]",
    );
  }

  const guidance = Number(value("--guidance") ?? 3);
  const rawSeed = value("--seed");

  return {
    modelDir,
    out,
    seconds,
    guidance: Number.isFinite(guidance) ? guidance : 3,
    seed: rawSeed === undefined ? undefined : Number(rawSeed),
  };
};

/**
 * Everything on stdin, as text.
 *
 * The prompt arrives this way so it is never an argv element: it is arbitrary
 * user text, and an argument beginning with a dash would otherwise be read as
 * a flag. Same reasoning as `qwen-tts` in `modules/tts`.
 * @returns The prompt
 */
const readStdin = async (): Promise<string> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8").trim();
};

/**
 * Wraps samples in a RIFF header.
 *
 * 16-bit PCM rather than float: it halves the intermediate file, every decoder
 * reads it, and the output is re-encoded to mp3 immediately afterwards anyway,
 * so the precision would not survive to be heard.
 * @param samples Mono samples in [-1, 1]
 * @param sampleRate Rate to declare in the header
 * @returns A complete wav file
 */
const toWav = (samples: Float32Array, sampleRate: number): Buffer => {
  const header = Buffer.alloc(44);
  const bytes = samples.length * 2;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + bytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM header length
  header.writeUInt16LE(1, 20); // format: PCM
  header.writeUInt16LE(1, 22); // channels: mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(bytes, 40);

  const body = Buffer.alloc(bytes);
  for (let i = 0; i < samples.length; i++) {
    // Clamped before scaling: the codec occasionally overshoots [-1, 1], and
    // letting that wrap turns a loud passage into a burst of noise.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    body.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  return Buffer.concat([header, body]);
};

const args = parseArgs(process.argv.slice(2));
const prompt = await readStdin();

if (!prompt) throw new Error("no prompt on stdin");

// transformers.js resolves a model id against `localModelPath`, so the
// installed directory is split into the parent it searches and the name it
// looks for. Remote loading is off: with it on, a missing file downloads
// silently, which inside a no-network sandbox is a confusing timeout and
// outside one is a 630MB surprise mid-interaction.
env.localModelPath = dirname(args.modelDir);
env.allowLocalModels = true;
env.allowRemoteModels = false;

const modelId = basename(args.modelDir);

// Seeding is global state, not a `generate` option - the sampler reaches for
// the library's module-level MT19937 rather than taking one. Passing `seed`
// into `generate` below instead would typecheck, run, and do nothing at all.
if (args.seed !== undefined) random.seed(args.seed);

const tokenizer = await AutoTokenizer.from_pretrained(modelId);
const model = await MusicgenForConditionalGeneration.from_pretrained(modelId, {
  // The two big graphs are quantised and the codec decoder is not. That split
  // is deliberate: q8 on the decoder is where the 1.6GB of fp32 weights go
  // away, while quantising the codec is what audible artefacts sound like.
  dtype: {
    text_encoder: "q8",
    decoder_model_merged: "q8",
    encodec_decode: "fp32",
  },
});

const inputs = tokenizer(prompt, { padding: true });

const generated = (await model.generate({
  ...inputs,
  max_new_tokens: Math.round(args.seconds * FRAMES_PER_SECOND),
  do_sample: true,
  guidance_scale: args.guidance,
})) as unknown as { data: Float32Array };

await writeFile(args.out, toWav(generated.data, SAMPLE_RATE));

// The only thing on stdout, so the caller can parse it without having to
// filter onnxruntime's own chatter out first.
console.log(
  JSON.stringify({
    path: args.out,
    sampleRate: SAMPLE_RATE,
    durationSeconds: generated.data.length / SAMPLE_RATE,
  }),
);
