/**
 * Music generation for `/music-ai`, on top of MusicGen Small exported to ONNX
 * and run through transformers.js. The weights are not in the repo —
 * `scripts/setup-music.sh` fetches them into `~/.local/share/fini-musicgen`.
 *
 * ```
 * prompt    turning the slash command's options into one caption
 * musicGen  locating the model, and the generation itself
 * ```
 *
 * The generation runs as a subprocess (`scripts/musicgen.ts`) rather than in
 * the bot, so its ~3GB peak does not stay resident. The subprocess plumbing —
 * `runProcess`, the bubblewrap sandbox, workspaces, admission control — is
 * shared with `/convert`, `/ytdlp` and `/tts` and lives in `modules/media`.
 */

export * from "./musicGen";
export * from "./prompt";
