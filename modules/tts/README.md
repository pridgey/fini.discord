# tts

Speech synthesis for `/tts`, on top of llama.cpp's `llama-tts` running
Qwen3-TTS. Neither the binary nor the weights are in the repo or on `PATH` —
`scripts/setup-tts.sh` installs both, and `.env` points at them.

```
voices       the preset reference clips, and which are installed
speakerClip  normalising a clip into what the model conditions on
llamaTts     locating the model, and the generation itself
```

The subprocess plumbing — `runProcess`, the bubblewrap sandbox, workspaces,
admission control — is shared with `/convert` and `/ytdlp` and lives in
`modules/media`. A TTS job is another thing competing for the same cores, so it
queues behind the same two slots rather than having a pool of its own.

## Setup

```sh
scripts/setup-tts.sh
```

That installs the pinned llama.cpp release under `~/.local/share/llama.cpp` and
the ~2.3GB of weights under `~/.local/share/fini-tts`, then prints the two
`.env` lines. It is safe to re-run; weights already the right size are skipped,
and one already in the Hugging Face cache is hardlinked rather than downloaded
again.

| Variable | Meaning |
| --- | --- |
| `FINI_LLAMA_TTS_BIN` | The `llama-tts` executable. Must stay next to its `libggml-*.so` siblings. |
| `FINI_TTS_MODEL_DIR` | Directory holding `model.gguf` and `mmproj.gguf`. |
| `FINI_TTS_VOICE_DIR` | Preset reference clips. Optional — defaults to `clips/` in this module. Set it only to use a different set. |

With the binary or the weights missing, `/tts` says so up front rather than
deferring and then failing. With no clips at all it still works, offering only
the model's own default voice — and the `voice` option disappears entirely
rather than being registered with an empty choice list, which Discord rejects
outright.

## Voices are audio, not models

Qwen3-TTS clones whatever voice it is shown, so a "voice" here is a few seconds
of reference audio and nothing else. There is no per-voice model to train or
ship, which is why the clips can live in the repo — eight of them come to about
2.4MB — and why anyone can add a voice for a single message by attaching a clip
to the command.

`CURATED_VOICES` in `voices.ts` is a hand-written list rather than a directory
listing, for two reasons: Discord caps a string option at 25 choices, and the
order is a decision rather than whatever `readdir` returns. The list leads with
the two voices that just read text straight, so someone who wants the audio
rather than the joke does not have to scroll past the memes.

Adding a voice is dropping `<name>.mp3` into `clips/` and adding `{ name }` to
`CURATED_VOICES`. The optional `label` is only for names that title-case
badly — `GLaDOS`, `E-girl`. A curated voice with no clip on disk is left out of
the picker rather than offered and then failing at generation time.

Two directory layouts are accepted. Flat — `narrator.mp3` — is what `clips/`
uses. Nested — `narrator/whatever.wav` — is how the old Coqui-era sample library
was arranged, and is still read so `FINI_TTS_VOICE_DIR` can point at one of
those without reorganising it first.

### Picking a clip

Only the first 10 seconds are used, so the speech should start immediately —
a clip opening with four seconds of silence wastes 40% of the reference. Beyond
that: one speaker, no music, no reverb, and **delivery matching how the voice
should behave**, because the reference sets prosody as well as timbre. A clip
read at a shout makes the voice shout everything, including a tax reminder.
That is why the two utility voices are read flat and only the character voices
are performed.

## Two models, not one

`llama-tts` takes the Qwen3-TTS backbone as `-m` and the audio codec as `-mm`.
The codec arrives as an mtmd *projector* because Qwen3-TTS is a multimodal model
whose output modality is audio. This is a change from the OuteTTS era, where the
vocoder was a separate `-mv` argument — worth knowing before bumping the pinned
build, because `buildTtsArgs` builds one specific argument list.

Paths are passed explicitly rather than with `-hf`, together with `--offline`.
The command then needs nothing from the network, and the sandbox is not handed
the whole Hugging Face cache — which would include the chat model's weights.

## CPU, deliberately

The build installed is `bin-ubuntu-x64`, not the Vulkan one, even on a host with
a usable GPU. ggml's Vulkan backend aborts partway through Qwen3-TTS generation:

```
ggml-vulkan.cpp: GGML_ASSERT(dst->op != GGML_OP_GET_ROWS ||
  (a_offset == 0 && b_offset == 0 && d_offset == 0)) failed
```

It fails inside the audio codec's graph, and `-dev none` does not avoid it —
mtmd's clip context schedules the codec on the Vulkan device regardless of the
device list, so merely having the backend present is enough. Measured on twelve
CPU cores, generation runs at roughly 0.3–0.5x realtime: about 12 seconds for a
short sentence, 40 for a long paragraph, most of which is the codec rather than
the language model. That is what the 600-character prompt cap is sized against.

Generation runs per invocation rather than as a resident server alongside the
`llama serve` chat model. The ~4s of load time is real, but it buys back two
gigabytes of resident memory between invocations on a 16GB box that is also
running Pocketbase, the chat model, and ffmpeg.

## Security

A user-uploaded clip is hostile input, and `llama-tts` decodes audio through
miniaudio — not a hardened decoder — in the same process as the model weights.
Two things narrow that.

**Every clip is re-encoded first** (`speakerClip.ts`). The upload is downloaded
into the job workspace, then normalised by ffmpeg into mono 24kHz PCM. The file
`llama-tts` opens is therefore always one ffmpeg just wrote, and that decode of
attacker bytes happens inside ffmpeg's own sandbox where a crash costs nothing.
Preset clips are copied into the workspace by the bot for the same reason —
ffmpeg can only read what is bound into it, and copying one clip is cheaper than
mounting `clips/` into every job.

**Generation itself is confined.** `llama-tts` runs under the same bubblewrap
wrapper as ffmpeg, with no network and only the workspace writable. It needs two
extra mounts that ffmpeg does not — its own install directory, because the
release tarball resolves `libggml-*.so` relative to the binary, and the model
directory — so `SandboxOptions` grew a `readOnlyPaths` field. Read-only, so a
compromised decoder cannot rewrite the weights the next invocation loads, and
`$HOME` stays absent inside the container either way.

The prompt is arbitrary user text and reaches the process as a single argument
through `runProcess`, so there is no shell to inject into. `--no-escape` keeps
`llama-tts` from reinterpreting it, and it is passed last so it cannot be read
as some other flag's value.
