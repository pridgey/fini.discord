# tts

Speech synthesis for `/tts`, on top of qwentts.cpp's `qwen-tts` running
Qwen3-TTS. Neither the binary nor the weights are in the repo or on `PATH` —
`scripts/setup-tts.sh` installs both, and `.env` points at them.

```
voices       the preset reference clips and their transcripts
speakerClip  normalising a clip into what the model conditions on
transcribe   reading the words back out of an uploaded clip
qwenTts      locating the model, and the generation itself
```

The subprocess plumbing — `runProcess`, the bubblewrap sandbox, workspaces,
admission control — is shared with `/convert` and `/ytdlp` and lives in
`modules/media`. A TTS job is another thing competing for the same cores, so it
queues behind the same two slots rather than having a pool of its own.

## Setup

```sh
scripts/setup-tts.sh
```

That builds qwentts.cpp at a pinned commit under `~/.local/share/qwentts`,
fetches the ~2.3GB of weights into `~/.local/share/fini-tts`, installs
whisper.cpp and a model under `~/.local/share/whisper.cpp`, then prints the
`.env` lines. It is safe to re-run; weights already the right size are skipped.

| Variable | Meaning |
| --- | --- |
| `FINI_QWEN_TTS_BIN` | The `qwen-tts` executable. Must stay next to its `libggml-*.so` siblings. |
| `FINI_TTS_MODEL_DIR` | Directory holding `talker.gguf` and `codec.gguf`. |
| `FINI_WHISPER_BIN` | `whisper-cli`, for transcribing uploaded clips. Optional. |
| `FINI_WHISPER_MODEL` | The ggml whisper model. Optional, but needed with the above. |
| `FINI_TTS_VOICE_DIR` | Preset reference clips. Optional — defaults to `clips/` in this module. |

With the binary or the weights missing, `/tts` says so up front rather than
deferring and then failing. With no clips at all it still works, offering only
the model's own default voice — and the `voice` option disappears entirely
rather than being registered with an empty choice list, which Discord rejects
outright.

The build needs cmake, which is less of a given than it sounds: Ubuntu 22.04
does not ship one, and a Homebrew cmake on a box without Homebrew's gcc dies at
load time looking for `libstdc++.so.6`. The setup script falls back to the pip
wheel in a throwaway venv when it cannot find a working one.

## Two ways to clone a voice, and only one of them is good

This is the thing to understand about this module. Qwen3-TTS Base accepts a
reference clip two ways:

**As an x-vector.** The clip is collapsed into a single 2048-dim speaker
embedding. That is `--ref-wav` on its own.

**In context.** The clip's codec frames go into the prompt next to *a
transcript of what it says*, so the model reads a worked example before it
starts. That is `--ref-wav` together with `--ref-text`.

An x-vector carries about as much as "adult man, measured". It is enough that a
generic voice comes back sounding right, and nowhere near enough for GLaDOS or
Goku, whose character is structure over time rather than a point in timbre
space. Given eight preset voices on the x-vector path, the two plainest ones
sounded correct and the six distinctive ones came back as generic people. In
context, they sound like themselves.

That is the whole reason this runs `qwen-tts` rather than llama.cpp's
`llama-tts`, which is what it used to use. `llama-tts` has one flag,
`--tts-speaker-file`, and no way to pass a transcript — so it can only ever
drive the weaker half. Same checkpoint, same speed, half the model.

Both paths are still here, because a transcript is not always available. A
missing one drops the generation back to x-vector-only rather than failing,
which is a worse voice and not a broken command.

## Voices are audio and a transcript

A "voice" here is `clips/<name>.mp3` plus `clips/<name>.txt`, and a line in
`CURATED_VOICES`. There is no per-voice model to train or ship, which is why
the clips can live in the repo and why anyone can add a voice for a single
message by attaching a clip.

The transcript has to match the audio, because the model is reading it as the
words that produced those codec frames. It ships in the repo alongside the clip
so it can be checked by a human once rather than guessed at on every
invocation — the ones here were generated with whisper and then corrected by
hand, which was necessary: it heard "three-stop match" for the Smash announcer
and ran two of the e-girl clip's sentences together.

`CURATED_VOICES` in `voices.ts` is a hand-written list rather than a directory
listing, for two reasons: Discord caps a string option at 25 choices, and the
order is a decision rather than whatever `readdir` returns. The list leads with
the two voices that just read text straight, so someone who wants the audio
rather than the joke does not have to scroll past the memes.

A curated voice with no clip on disk is left out of the picker rather than
offered and then failing at generation time. A voice with a clip but no
transcript is still offered — it just uses the worse path. An *empty*
transcript counts as absent, because `qwen-tts` rejects an empty `--ref-text`
outright and a placeholder someone meant to fill in later would otherwise take
the voice down.

Two directory layouts are accepted. Flat — `narrator.mp3`, `narrator.txt` — is
what `clips/` uses. Nested — `narrator/whatever.wav`, `narrator/whatever.txt` —
is how the old Coqui-era sample library was arranged, and is still read so
`FINI_TTS_VOICE_DIR` can point at one of those without reorganising it.

### Picking a clip

Up to 30 seconds are used. That is a change from the x-vector era, when 10 was
plenty: timbre is established in the first few seconds, so the rest was
prompt-eval time spent on nothing. In-context conditioning reads the whole clip
as an example, so more of it is more example — upstream's own cloning sample
ships a 17 second reference.

Beyond length: one speaker, no music, no reverb, and speech starting promptly.
A clip opening with four seconds of silence is four seconds of the reference
teaching the model to say nothing.

Two claims that used to be in this file and did not survive being checked. The
first is that the reference sets prosody as well as timbre — on the x-vector
path it mostly does not, which is the whole point above, and it is worth
re-testing what the in-context path does with a performed clip before relying
on it either way. The second is that clip loudness needs to be uniform: the
shipped set spans about 13dB and works. Normalising the reference is a
plausible improvement and an untested one.

## Sampling: don't

`buildTtsArgs` sets no sampling parameters, and that is deliberate. `qwen-tts`
already defaults to the checkpoint's own `generation_config.json` — temperature
0.9, top-k 50, top-p 1.0, and the same again for the code predictor. Passing
them would only be an opportunity to drift.

This is worth knowing before adding a flag, because the previous runtime got it
wrong by accident. `llama-tts` samples audio codes through llama.cpp's generic
*text* sampler chain, so it inherited temperature 0.8, top-k 40, top-p 0.95 and
a min-p of 0.05 that the reference config does not use at all. Every one of
those was wrong. It was also inaudible next to the conditioning problem, which
is worth remembering about the size of this lever.

`--rep-pen` turned out to be a no-op on this model — 1.05 and 1.0 produce
byte-identical output — so it is not worth a flag either way.

## Base, not CustomVoice

There is a `Qwen3-TTS-12Hz-1.7B-CustomVoice` checkpoint and switching to it
looks like an obvious upgrade. It is not. Base is the one with a
`speaker_encoder_config`; CustomVoice has none, because it is the
*named-speaker* model — serena, vivian, ryan and friends — which is a different
feature that happens to share a name with cloning. Base is the cloning model.

The talker and the codec load together as two GGUFs. Upstream calls the second
one the tokenizer; it both encodes the reference clip into the frames the
in-context path puts in the prompt and decodes generated frames into samples,
and that decode is the single most expensive stage of a generation.

## CPU, deliberately

The CPU build, even on a host with a usable GPU. ggml's Vulkan backend aborted
partway through Qwen3-TTS generation on the llama.cpp path:

```
ggml-vulkan.cpp: GGML_ASSERT(dst->op != GGML_OP_GET_ROWS ||
  (a_offset == 0 && b_offset == 0 && d_offset == 0)) failed
```

It failed inside the audio codec's graph. That was a different runtime and has
not been retried since, so CPU is the known-good choice rather than a measured
one. On twelve cores a generation runs at about 0.37x realtime — 22 seconds of
wall clock for 7.4 seconds of audio, of which roughly 7.5s is the codec decode
and 1.8s is prefill. That is what the 600-character prompt cap is sized
against.

Generation runs per invocation rather than as a resident server alongside the
`llama serve` chat model. The load time is real, but it buys back two gigabytes
of resident memory between invocations on a 16GB box that is also running
Pocketbase, the chat model, and ffmpeg. Upstream does ship a `tts-server` with
a cloned-voice registry if that trade ever stops being worth it.

## Security

A user-uploaded clip is hostile input, and it now passes through *two* audio
decoders that sit in the same process as a set of model weights — `qwen-tts`
and whisper. Three things narrow that.

**Every clip is re-encoded first** (`speakerClip.ts`). The upload is downloaded
into the job workspace, then normalised by ffmpeg into mono 24kHz PCM. The file
the models open is therefore always one ffmpeg just wrote, and that decode of
attacker bytes happens inside ffmpeg's own sandbox where a crash costs nothing.
Whisper gets a second ffmpeg-written copy at 16kHz rather than the original.
Preset clips are copied into the workspace for the same reason — ffmpeg can
only read what is bound into it.

**Everything is confined.** `qwen-tts` and whisper run under the same
bubblewrap wrapper as ffmpeg, with no network and only the workspace writable.
Each needs two extra read-only mounts that ffmpeg does not — its own install
directory, because the build resolves `libggml-*.so` relative to the binary,
and its model directory. Read-only, so a compromised decoder cannot rewrite the
weights the next invocation loads, and `$HOME` stays absent inside the
container either way.

The transcript is staged into the workspace too, for the same reason as the
clip: `clips/` is not mounted, so `--ref-text` has to point at something inside
the sandbox.

**The prompt never becomes an argument.** It reaches `qwen-tts` on stdin, so
there is no shell to inject into and nothing that can be mistaken for a flag's
value. This is why `runProcess` grew an optional `stdin` — the default stays
closed, because ffmpeg blocks forever on its own overwrite prompt if it finds a
readable stdin.

One build detail that matters here: cmake bakes an absolute RUNPATH pointing at
the build directory unless told otherwise, which both breaks inside the sandbox
(that path is not mounted) and means the binary would load its ggml libraries
from whatever happens to live at that path outside it. The setup script builds
with `$ORIGIN` instead, so it looks next to itself.
