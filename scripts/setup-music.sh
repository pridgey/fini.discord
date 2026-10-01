#!/usr/bin/env bash
#
# One-time setup for /music-ai.
#
# Installs one thing: the ONNX export of MusicGen Small, about 630MB, into
# ~/.local/share/fini-musicgen. There is nothing to build - the runtime is
# onnxruntime-node, which comes in with `@huggingface/transformers` as a
# regular npm dependency.
#
# Safe to re-run. Files already present at the right size are skipped, so an
# interrupted download is resumed by running it again.
#
# Usage: scripts/setup-music.sh

set -euo pipefail

# The ONNX export, pinned to a revision.
#
# Pinned rather than tracking main for the same reason the qwentts.cpp commit
# is: modules/music-ai/musicGen.ts names three specific graph files and
# scripts/musicgen.ts asks for three specific dtypes, and a re-export that
# renames or re-quantises any of them would break both. Bump this and check
# the file list below together.
MODEL_REPO="Xenova/musicgen-small"
MODEL_REV="6a8096dabfff72909ef5eae41461408e29ae20fd"

# Which quantisation of each graph.
#
# q8 for the text encoder and the decoder, which is where the weight goes -
# fp32 versions of those two are about 1.6GB between them and this box does
# not have it to spare. fp32 for the codec decoder, because quantising the
# thing that turns codes into samples is what audible artefacts sound like,
# and it is the smallest of the three anyway.
#
# Renamed on the way in? No - unlike the TTS weights these keep their upstream
# names, because the names encode the quantisation and that is a thing worth
# being able to see in the directory listing when something sounds wrong.
TEXT_ENCODER="text_encoder_quantized.onnx"
DECODER="decoder_model_merged_quantized.onnx"
CODEC="encodec_decode.onnx"

TEXT_ENCODER_BYTES=110443015
DECODER_BYTES=428422300
CODEC_BYTES=118056304

MODEL_DIR="${FINI_MUSICGEN_MODEL_DIR:-${HOME}/.local/share/fini-musicgen}"

BASE="https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REV}"

log() { printf '\n==> %s\n' "$1"; }

# Size of a file in bytes, or 0 when it is not there.
size_of() {
  [ -f "$1" ] && stat -c %s "$1" || echo 0
}

# Downloads one file unless it is already there at the right size.
fetch() {
  local path="$1" expected="$2"
  local dest="${MODEL_DIR}/${path}"

  if [ "$(size_of "${dest}")" = "${expected}" ]; then
    echo "    ${path} already installed"
    return
  fi

  echo "    downloading ${path}"
  curl -fSL --progress-bar -o "${dest}.part" "${BASE}/${path}"
  mv "${dest}.part" "${dest}"
}

# The small files are re-fetched every run rather than size-checked. They are
# a couple of megabytes together, and a stale tokenizer against fresh weights
# is a worse failure than a redundant download - it does not error, it just
# generates something unrelated to the prompt.
fetch_always() {
  local path="$1"

  echo "    downloading ${path}"
  curl -fSL --silent --show-error -o "${MODEL_DIR}/${path}.part" "${BASE}/${path}"
  mv "${MODEL_DIR}/${path}.part" "${MODEL_DIR}/${path}"
}

log "Installing MusicGen Small into ${MODEL_DIR} (~630MB)"
mkdir -p "${MODEL_DIR}/onnx"

fetch_always "config.json"
fetch_always "generation_config.json"
fetch_always "tokenizer.json"
fetch_always "tokenizer_config.json"

fetch "onnx/${TEXT_ENCODER}" "${TEXT_ENCODER_BYTES}"
fetch "onnx/${DECODER}" "${DECODER_BYTES}"
fetch "onnx/${CODEC}" "${CODEC_BYTES}"

log "Done."

if [ "${MODEL_DIR}" != "${HOME}/.local/share/fini-musicgen" ]; then
  cat <<EOF

Add this to .env:

FINI_MUSICGEN_MODEL_DIR=${MODEL_DIR}

EOF
else
  echo
  echo "That is the default location, so there is nothing to add to .env."
  echo "Set FINI_MUSICGEN_MODEL_DIR only to install somewhere else."
fi

cat <<'EOF'

The runtime is already installed - onnxruntime-node arrives with
@huggingface/transformers, so `bun install` is the whole of it.

Generation runs on the CPU. Not for want of a GPU path: onnxruntime-node
bundles WebGPU, it works on this Maxwell card through Vulkan, and on the same
fp32 weights it is 1.8x faster than the CPU. It loses anyway, because WebGPU
has no int8 kernels - the quantised graphs we install fall back per-node and
end up 12x slower there than on the CPU. See modules/music-ai/README.md.

A generation peaks around 3GB resident, which is most of what is free on a
16GB host also running Pocketbase and the chat model. That is why /music-ai
takes one of the two media slots and caps length at 15 seconds: 15s of audio
takes about 68s of wall clock here, and 30s falls off a cliff into swap and
never finishes. Raise MAX_MUSIC_SECONDS in modules/music-ai/musicGen.ts if you
run this somewhere with more headroom.
EOF
