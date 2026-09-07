#!/usr/bin/env bash
#
# One-time setup for /tts.
#
# Installs three things, none of which can live in the repo:
#
#   qwentts.cpp   built from source, because it has no packaged release
#   Qwen3-TTS     ~2.3GB of weights, the talker and the codec
#   whisper.cpp   a prebuilt release plus a model, for transcribing uploads
#
# Safe to re-run. The build is redone, and weights already the right size are
# skipped.
#
# Usage: scripts/setup-tts.sh

set -euo pipefail

# qwentts.cpp commit to build.
#
# Pinned rather than tracking master because modules/tts/qwenTts.ts builds one
# specific argument list, and this project is young enough that its flags may
# still move. Bump this and check `qwen-tts --help` together.
QWENTTS_COMMIT="6cb8a29c931b5d4d7f1301d2e8036bc5ce9cd00e"
QWENTTS_REPO="https://github.com/ServeurpersoCom/qwentts.cpp.git"

# qwentts.cpp rather than llama.cpp's `llama-tts`, and not for speed.
#
# Qwen3-TTS Base can be conditioned on a reference clip two ways: collapsed
# into a single 2048-dim speaker embedding, or in-context, with the clip's
# codec frames and a transcript of it in the prompt. `llama-tts` has only
# `--tts-speaker-file` and no way to pass a transcript, so it can only drive
# the first - which carries timbre and not much else, and left every
# distinctive preset voice sounding like a generic person instead of the
# character. This one exposes both. Same checkpoint, same speed.
#
# The CPU build. ggml's Vulkan backend aborted partway through generation on
# the llama.cpp path (a GET_ROWS assert inside the codec graph); this has not
# been retried on Vulkan since, so CPU stays the known-good choice.

# The Base checkpoint, and deliberately not CustomVoice.
#
# Base is the one with the speaker encoder, so it is the cloning model.
# CustomVoice has no `speaker_encoder_config` at all - it is the named-speaker
# model (serena, vivian, ryan, ...), which is a different feature. Swapping to
# it looks like an upgrade and is not.
MODEL_REPO="Serveurperso/Qwen3-TTS-GGUF"
TALKER_FILE="qwen-talker-1.7b-base-Q8_0.gguf"
CODEC_FILE="qwen-tokenizer-12hz-Q8_0.gguf"

TALKER_BYTES=2079448256
CODEC_BYTES=291150624

# whisper.cpp publishes Linux binaries, so this one needs no compiler.
WHISPER_BUILD="b4938"
WHISPER_ASSET="whisper-bin-ubuntu-x64.tar.gz"
WHISPER_MODEL_FILE="ggml-small.en.bin"
WHISPER_MODEL_BYTES=487614201

QWENTTS_DIR="${HOME}/.local/share/qwentts"
WHISPER_DIR="${HOME}/.local/share/whisper.cpp"
MODEL_DIR="${FINI_TTS_MODEL_DIR:-${HOME}/.local/share/fini-tts}"

log() { printf '\n==> %s\n' "$1"; }

# Size of a file in bytes, or 0 when it is not there.
size_of() {
  [ -f "$1" ] && stat -c %s "$1" || echo 0
}

# Downloads one file unless it is already there at the right size.
fetch() {
  local url="$1" dest="$2" expected="$3" what="$4"

  if [ "$(size_of "${dest}")" = "${expected}" ]; then
    echo "    ${what} already installed"
    return
  fi

  echo "    downloading ${what}"
  curl -fSL --progress-bar -o "${dest}.part" "${url}"
  mv "${dest}.part" "${dest}"
}

# A working cmake, one way or another.
#
# Not a given: Ubuntu 22.04 does not ship one by default, and a Homebrew cmake
# on a machine without Homebrew's gcc fails at load time looking for
# libstdc++.so.6. Falling back to the pip wheel in a throwaway venv is ugly but
# it is self-contained and it does not touch the system python.
resolve_cmake() {
  if command -v cmake >/dev/null 2>&1 && cmake --version >/dev/null 2>&1; then
    command -v cmake
    return
  fi

  local venv="${QWENTTS_DIR}/.cmake-venv"
  if [ ! -x "${venv}/bin/cmake" ]; then
    echo "    no working cmake found, fetching the pip wheel" >&2
    python3 -m venv "${venv}" >&2
    "${venv}/bin/pip" install --quiet cmake >&2
  fi
  echo "${venv}/bin/cmake"
}

log "Building qwentts.cpp ${QWENTTS_COMMIT:0:9} into ${QWENTTS_DIR}"

mkdir -p "${QWENTTS_DIR}"
SRC="${QWENTTS_DIR}/src"

if [ -d "${SRC}/.git" ]; then
  git -C "${SRC}" fetch --quiet origin "${QWENTTS_COMMIT}"
else
  rm -rf "${SRC}"
  git clone --quiet --recurse-submodules "${QWENTTS_REPO}" "${SRC}"
fi

git -C "${SRC}" checkout --quiet "${QWENTTS_COMMIT}"
git -C "${SRC}" submodule --quiet update --init --recursive

CMAKE="$(resolve_cmake)"
echo "    cmake: ${CMAKE}"

# Built with an $ORIGIN RUNPATH, which is not the default here.
#
# cmake otherwise bakes the absolute build directory into the binary, and that
# is worse than it looks: `qwen-tts` runs inside bubblewrap with only its own
# directory mounted, so an absolute RUNPATH somewhere else does not resolve at
# all - and outside the sandbox it would mean the binary loading its ggml
# libraries from whatever now lives at that path. $ORIGIN makes it look next
# to itself, which is both what works and what we want it to do.
rm -rf "${SRC}/build"
"${CMAKE}" -S "${SRC}" -B "${SRC}/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON \
  -DCMAKE_INSTALL_RPATH='$ORIGIN' >/dev/null
"${CMAKE}" --build "${SRC}/build" --config Release -j "$(nproc)" >/dev/null

if [ ! -x "${SRC}/build/qwen-tts" ]; then
  echo "error: ${SRC}/build/qwen-tts is missing - did the build layout change?" >&2
  exit 1
fi

log "Installing weights into ${MODEL_DIR} (~2.3GB)"
mkdir -p "${MODEL_DIR}"

# Renamed on the way in. The upstream filenames carry the size, the mode and
# the quantisation, all of which would then be baked into .env and into
# modules/tts/qwenTts.ts - so a different quant becomes an edit in three
# places. Fixed names keep it to one.
fetch "https://huggingface.co/${MODEL_REPO}/resolve/main/${TALKER_FILE}" \
  "${MODEL_DIR}/talker.gguf" "${TALKER_BYTES}" "talker.gguf"
fetch "https://huggingface.co/${MODEL_REPO}/resolve/main/${CODEC_FILE}" \
  "${MODEL_DIR}/codec.gguf" "${CODEC_BYTES}" "codec.gguf"

log "Installing whisper.cpp ${WHISPER_BUILD} into ${WHISPER_DIR}"
mkdir -p "${WHISPER_DIR}/models"

TARBALL="$(mktemp -t whisper-XXXXXX.tar.gz)"
trap 'rm -f "${TARBALL}"' EXIT

curl -fSL --progress-bar -o "${TARBALL}" \
  "https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_BUILD}/${WHISPER_ASSET}"
tar xzf "${TARBALL}" -C "${WHISPER_DIR}"

WHISPER_BIN="$(find "${WHISPER_DIR}" -name whisper-cli -type f -perm -u+x | head -1)"
if [ -z "${WHISPER_BIN}" ]; then
  echo "error: no whisper-cli in the release tarball - did the layout change?" >&2
  exit 1
fi

fetch "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILE}" \
  "${WHISPER_DIR}/models/${WHISPER_MODEL_FILE}" "${WHISPER_MODEL_BYTES}" \
  "${WHISPER_MODEL_FILE}"

log "Done. Add these to .env if they are not there already:"
cat <<EOF

FINI_QWEN_TTS_BIN=${SRC}/build/qwen-tts
FINI_TTS_MODEL_DIR=${MODEL_DIR}
FINI_WHISPER_BIN=${WHISPER_BIN}
FINI_WHISPER_MODEL=${WHISPER_DIR}/models/${WHISPER_MODEL_FILE}

EOF

echo "Preset voice clips and their transcripts ship in modules/tts/clips, so"
echo "there is nothing else to install. Set FINI_TTS_VOICE_DIR only to use a"
echo "different set."
echo
echo "The whisper pair is optional. Without it /tts still works, but an"
echo "uploaded clip falls back to speaker-embedding conditioning - the preset"
echo "voices are unaffected, since their transcripts are in the repo."
