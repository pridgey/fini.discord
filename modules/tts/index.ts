/**
 * Speech synthesis for `/tts`, on top of llama.cpp's `llama-tts`.
 *
 * Layering, innermost first:
 *   voices       - the preset reference clips, and which are installed
 *   speakerClip  - normalising a clip into what the model conditions on
 *   llamaTts     - locating the model, and the generation itself
 *
 * The subprocess plumbing (`runProcess`, the bubblewrap sandbox, workspaces,
 * admission control) is shared with `/convert` and `/ytdlp` and lives in
 * `modules/media` - a TTS job is another thing competing for the same cores,
 * so it queues behind the same two slots rather than having its own.
 */

export * from "./llamaTts";
export * from "./speakerClip";
export * from "./voices";
