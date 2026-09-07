#!/usr/bin/env bash
#
# One-time setup for /tts.
#
# Installs llama.cpp's `llama-tts` and the Qwen3-TTS weights it needs. Both are
# too large and too machine-specific to live in the repo, so the command reads
# them from paths given in .env and this script is what puts them there.
#
# Safe to re-run: the binary is re-extracted and the weights are skipped if they
# are already the right size.
#
# Usage: scripts/setup-tts.sh [build-number]

set -euo pipefail

# llama.cpp release to install.
#
# Deliberately pinned rather than tracking latest: `llama-tts`'s flags have
# already changed once - the OuteTTS-era `-mv <vocoder>` is now the mtmd-style
# `-mm <mmproj>` - and modules/tts/llamaTts.ts builds one specific argument
# list. Bump this and check the flags together.
BUILD="${1:-b10831}"

# The CPU build, and not by accident.
#
# ggml's Vulkan backend aborts partway through Qwen3-TTS generation:
#
#   ggml-vulkan.cpp: GGML_ASSERT(dst->op != GGML_OP_GET_ROWS ||
#     (a_offset == 0 && b_offset == 0 && d_offset == 0)) failed
#
# It fails inside the audio codec's graph, and `-dev none` does not avoid it -
# mtmd's clip context schedules the codec on the Vulkan device regardless of
# the device list, so simply having the backend present is enough to crash.
# The CPU build runs at roughly 0.3x realtime on twelve cores, which is fine
# for the sentence-length prompts this command takes. Retry Vulkan on a much
# later build if generation speed ever becomes the problem.
FLAVOUR="bin-ubuntu-x64"

MODEL_REPO="ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF"
MODEL_FILE="Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf"
MMPROJ_FILE="mmproj-Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf"

MODEL_BYTES=1847874400
MMPROJ_BYTES=446422912

LLAMA_DIR="${HOME}/.local/share/llama.cpp"
MODEL_DIR="${FINI_TTS_MODEL_DIR:-${HOME}/.local/share/fini-tts}"
HF_CACHE="${HF_HOME:-${HOME}/.cache/huggingface}/hub/models--${MODEL_REPO//\//--}/snapshots"

BIN_DIR="${LLAMA_DIR}/llama-${BUILD}"

log() { printf '\n==> %s\n' "$1"; }

# Size of a file in bytes, or 0 when it is not there.
size_of() {
  [ -f "$1" ] && stat -c %s "$1" || echo 0
}

log "Installing llama-tts ${BUILD} (${FLAVOUR}) into ${BIN_DIR}"

mkdir -p "${LLAMA_DIR}"
TARBALL="$(mktemp -t llama-tts-XXXXXX.tar.gz)"
trap 'rm -f "${TARBALL}"' EXIT

curl -fSL --progress-bar \
  -o "${TARBALL}" \
  "https://github.com/ggml-org/llama.cpp/releases/download/${BUILD}/llama-${BUILD}-${FLAVOUR}.tar.gz"

rm -rf "${BIN_DIR}"
tar xzf "${TARBALL}" -C "${LLAMA_DIR}"

if [ ! -x "${BIN_DIR}/llama-tts" ]; then
  echo "error: ${BIN_DIR}/llama-tts is missing - did the release layout change?" >&2
  exit 1
fi

log "Installing weights into ${MODEL_DIR} (~2.3GB)"
mkdir -p "${MODEL_DIR}"

# Fetches one weight file.
#
# The Hugging Face cache is checked first and hardlinked from when it has the
# file, because `llama-tts -hf` may well have already downloaded it while
# someone was testing by hand - and a hardlink costs nothing where a second
# copy costs 1.8GB. Falls back to downloading straight from the repo, which is
# also what keeps the destination filenames stable: the cache stores snapshots
# under a commit hash that changes whenever the repo is re-pulled.
fetch_weight() {
  local remote="$1" local_name="$2" expected="$3"
  local dest="${MODEL_DIR}/${local_name}"

  if [ "$(size_of "${dest}")" = "${expected}" ]; then
    echo "    ${local_name} already installed"
    return
  fi

  local cached
  cached="$(find "${HF_CACHE}" -name "${remote}" 2>/dev/null | head -1)"

  if [ -n "${cached}" ] && [ "$(size_of "${cached}")" = "${expected}" ]; then
    echo "    ${local_name} from the Hugging Face cache"
    rm -f "${dest}"
    # -L because the cache entry is a symlink into blobs/; the link target is
    # what we want a second reference to.
    ln -L "${cached}" "${dest}" 2>/dev/null || cp -L "${cached}" "${dest}"
    return
  fi

  echo "    downloading ${local_name}"
  curl -fSL --progress-bar \
    -o "${dest}.part" \
    "https://huggingface.co/${MODEL_REPO}/resolve/main/${remote}"
  mv "${dest}.part" "${dest}"
}

fetch_weight "${MODEL_FILE}" "model.gguf" "${MODEL_BYTES}"
fetch_weight "${MMPROJ_FILE}" "mmproj.gguf" "${MMPROJ_BYTES}"

log "Done. Add these to .env if they are not there already:"
cat <<EOF

FINI_LLAMA_TTS_BIN=${BIN_DIR}/llama-tts
FINI_TTS_MODEL_DIR=${MODEL_DIR}

EOF

echo "Preset voice clips ship in modules/tts/clips, so there is nothing else to"
echo "install. Set FINI_TTS_VOICE_DIR only to use a different set."
