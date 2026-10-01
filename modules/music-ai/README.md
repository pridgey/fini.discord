# music-ai

Music generation for `/music-ai`, on top of MusicGen Small exported to ONNX and
run through transformers.js. The weights are not in the repo —
`scripts/setup-music.sh` fetches them into `~/.local/share/fini-musicgen`.

```
prompt    turning the slash command's options into one caption
musicGen  locating the model, and the generation itself
```

The generation runs as a subprocess, `scripts/musicgen.ts`. The subprocess
plumbing — `runProcess`, the bubblewrap sandbox, workspaces, admission
control — is shared with `/convert`, `/ytdlp` and `/tts` and lives in
`modules/media`. A music job is another thing competing for the same cores, so
it queues behind the same two slots rather than having a pool of its own.

## Setup

```sh
scripts/setup-music.sh
```

That downloads about 630MB into `~/.local/share/fini-musicgen`. There is
nothing to build: the runtime is onnxruntime-node, which arrives with
`@huggingface/transformers` as a regular npm dependency, so `bun install` has
already done its half. Safe to re-run — graphs already the right size are
skipped, so an interrupted download is resumed by running it again.

| Variable | Meaning |
| --- | --- |
| `FINI_MUSICGEN_MODEL_DIR` | Directory holding `config.json`, the tokenizer and `onnx/`. Optional — defaults to `~/.local/share/fini-musicgen`. |
| `FINI_MUSICGEN_SCRIPT` | The generation script. Optional — defaults to `scripts/musicgen.ts` next to this repo. |
| `FINI_BUN_BIN` | The Bun that runs it. Optional — defaults to the one running the bot. |

With the weights missing, `/music-ai` says so up front rather than deferring
and then failing. The check lists every file the generator opens rather than
testing that the directory exists, because the failure that actually happens
is a partial install: an interrupted download leaves the directory and the
small json files in place and one of the three graphs missing.

## CPU, and the GPU is not the answer here

The GPU *does* work — this was measured, not assumed, and the first version of
this file was wrong about it.

onnxruntime-node 1.30 on Linux reports `[cpu (bundled), webgpu (bundled), cuda
(not bundled), tensorrt (not bundled)]`.

CUDA is not merely uninstalled here, it is unavailable. `npm install
--onnxruntime-node-install=cuda12` would fetch
`Microsoft.ML.OnnxRuntime.Gpu.Linux`, and that prebuilt provider is compiled
for `sm_70, 75, 80, 86, 89, 90, 90a, 100a, 100f, 120, 120a` — Volta and newer.
There is no Maxwell kernel in it, and this card is `sm_52`. It also links
`libcudart.so.13`, and CUDA 13 dropped Maxwell outright. Either fact alone is
fatal; putting CUDA on this GPU would mean building ONNX Runtime from source
against CUDA 12 with `sm_52` added back.

But **WebGPU is bundled**, and on Linux it runs through Vulkan — which this
card plainly supports, since the chat model is a `llama-vulkan` build sitting
on it right now.

Every row below is a real run on this box, generating ~3 seconds of audio:

| weights | device | load | compute per second of audio |
| --- | --- | --- | --- |
| int8 | **CPU** | 12s | **1.8s** ← shipped |
| int8 | WebGPU | 5s | 21.6s |
| fp32 | CPU | 50s | 7.4s |
| fp32 | WebGPU | 59s | 4.2s |
| fp16 | either | — | fails to load |

Read the bottom two rows first: **on identical fp32 weights the GPU beats the
CPU by 1.8x.** The card is not too old and Vulkan is not the problem. There is
a working GPU path and it does real work.

It still loses, because quantisation beats it. The WebGPU execution provider
has no kernels for most int8 operators, so the int8 graphs fall back
node-by-node to the CPU and pay a device copy at every boundary — that is the
21.6s row, and the GPU sits at about 15% utilisation through it, waiting. The
int8-on-CPU path is 2.3x faster than the best GPU configuration available.

Going fp32 to use the GPU properly would also cost 2.25GB of VRAM against the
~3.6GB left after the chat model's 8.2GB, and trade a 12 second model load for
a 59 second one — most of which is Dawn compiling shaders, on every
invocation, because this runs as a short-lived subprocess.

fp16 would have halved the VRAM and is a dead end twice over: the published
`decoder_model_merged_fp16.onnx` is an invalid graph that fails to load on CPU
as well as WebGPU, and Maxwell reports `shaderFloat16 = false` anyway, so fp16
would be storage-only and buy no speed.

So: CPU, int8. `nvidia-smi` is not consulted anywhere, because there is
nothing a positive answer would change. If this ever moves to a host whose GPU
is free and has int8 WebGPU kernels, the thing to change is `device` and
`dtype` in `scripts/musicgen.ts` — the rest of the module does not care.

## Length is a memory limit

Measured on this box with the chat model up, each row a separate cold run:

| audio | wall clock | peak RSS | host state |
| --- | --- | --- | --- |
| 5s | 34s | 1.4GB | ~3.1GB free |
| 10s | 34s | 3.1GB | ~2.7GB free |
| 10s | 58s | 2.0GB | ~3.1GB free, warmer cache |
| 15s | 68s | 2.1GB | ~3.1GB free |
| 30s | abandoned after 6 minutes | — | swapping hard |

Two things in that table are worth reading twice, and neither is the obvious
one.

**The same 10 second request took 34 seconds once and 58 seconds the other
time.** Wall clock here is mostly a function of what else the host is doing.
The model load is flat and large — it is the majority of a short clip — and
whether the weights are in page cache moves the total more than five extra
seconds of audio does. That is why `estimateGenerationSeconds` is a coarse
straight line fitted to the *slower* runs rather than anything cleverer:
there is no honest precision available, and finishing early is the way to be
wrong that nobody minds.

**Peak RSS moves opposite to the workload.** The 10s run with *less* free
memory reported the *higher* peak. That is the kernel evicting the mmapped
weights once it is under pressure — resident size stops measuring the working
set and starts measuring what survived. Wall clock is the only column to
trust.

Thirty seconds does not run out of memory — it runs into swap, which is worse.
It holds one of the two media slots for minutes and drags the rest of the bot
down with it. `MAX_MUSIC_SECONDS` is 15 because that is the longest length
that finished every time it was tried, and it is a property of this host
rather than of the model: MusicGen Small is trained to 30, and a box with more
free memory can raise it.

## A subprocess, not an import

transformers.js is an npm package and the obvious thing is to `await` it from
the command. This does not.

The three ONNX sessions are 630MB on disk and peak around 3GB resident.
Importing them into the bot holds that for the process's lifetime, on a host
with roughly 2.7GB free that is also running Pocketbase, a chat model and
ffmpeg. A process that exits gives it back. The cost is a cold model load on
every invocation — a flat ~12 seconds, which is most of the wall clock of a
short clip — and that is the same trade `modules/tts` makes, for the same
reason, with the same regret.

It also means the generation gets `runProcess`'s timeout and the bubblewrap
wrapper, neither of which an in-process `await` can offer. A wedged
`await` holds a media slot until the job budget runs out; a wedged subprocess
gets killed.

## Style and tempo are prompt engineering

MusicGen has no style parameter and no tempo parameter. It has a text encoder.
Everything the user picks has to arrive as part of the caption or not at all,
which is what `prompt.ts` does — `{description, style, tempo}` in, one
comma-joined line out.

Comma-joined rather than written as prose, because that is the shape of the
training captions: "90s rock song with loud guitars and heavy drums", not a
sentence about what the music should evoke. Tempo carries a BPM as well as a
word for the same reason — "fast" alone is a weaker instruction than "fast
tempo, around 140 BPM".

The user's own words lead, and the two picks are appended only when they are
values we recognise. A stale client can still send a choice that has since
been removed from the list, and pasting an unknown string into the caption
would quietly steer the generation with something nobody chose.

They compose freely. An earlier version of this command refused style and
tempo together, which was `/tts`'s preset-voice-or-uploaded-clip rule
copy-pasted onto two options that are not exclusive at all — "jazz, slow" is a
perfectly reasonable thing to ask for.

## Security

Much less exposed than `/tts`, and worth saying why rather than leaving it
implied.

The only untrusted input is the prompt, which is text. There is no
user-supplied audio here, so none of the decoder-on-hostile-bytes reasoning
that drives `modules/tts` applies — nothing in this path parses a file a
stranger uploaded.

What is still true is that a model runtime is a large C++ dependency being fed
attacker-influenced input, so it runs confined anyway: bubblewrap, no network,
only the job workspace writable. Three read-only mounts are needed that ffmpeg
does not need — Bun's own directory, the model directory, and the repo,
because the script imports `@huggingface/transformers` and onnxruntime's
native library out of `node_modules`. `$HOME` does not exist inside the
container, so `.env`, `pb_data` and the Tailscale state directory are not
reachable by any of them.

Denying the network does double duty. transformers.js will happily download a
missing file from Hugging Face mid-call, which inside the sandbox would be a
confusing timeout and outside one would be a 630MB surprise in the middle of
an interaction. `scripts/musicgen.ts` also sets `allowRemoteModels = false`,
so that is belt and braces.

The prompt reaches the script on stdin, never as an argument. There is no
shell in the path either way, but an argument starting with a dash would be
read as a flag — and `--model-dir` is in that argument list.
