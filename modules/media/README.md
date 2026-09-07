# media

Shared plumbing for `/ytdlp` and `/convert`. Both shell out to `yt-dlp` and
`ffmpeg`, which have to be on the bot's `PATH` — there is no bundled copy and
no npm wrapper.

```
runProcess                              spawn with a timeout, no shell
mediaFormats / chromaKey / uploadLimit  data and pure parsing
probeMedia                              ffprobe, so filters use real numbers
convertMedia                            ffmpeg, including squeezing to fit
downloadMedia                           yt-dlp
workspace / mediaJobs                   temp files, admission control, clock
```

## Adding a format

Add an entry to `MEDIA_FORMATS` in `mediaFormats.ts` and both commands pick it
up. The fields that matter beyond the extension:

- `supportsAlpha` — whether `/convert`'s chroma key is offered for it. Keying
  into a format without an alpha channel produces black pixels, not clear ones,
  so the command refuses the combination rather than shipping a silhouette.
- `nativeContainer` / `ytdlpSort` — whether yt-dlp can merge straight into the
  container, which lets `/ytdlp` skip the ffmpeg pass entirely. The sort steers
  codec choice so that merge stays a remux.
- `bitrateArgs` — the same encode aimed at a bitrate instead of a quality
  level, which is how a file over the guild's upload limit gets squeezed under
  it. Lossless formats correctly have none; lossless *video* is instead shrunk
  by resolution, using a size-versus-width exponent measured from qtrle rather
  than assumed from the pixel count (see `LOSSLESS_SIZE_EXPONENT`). Lossless
  audio has no lever at all and the failure says so.

## Security

Two things here take hostile input, and both are constrained accordingly.

**URLs are resolved before they are fetched** (`urlSafety.ts`). `/ytdlp` fetches
whatever it is handed, which made it a working SSRF until this existed —
`http://127.0.0.1:8090` reached Pocketbase, `http://192.168.x.x` reached the
LAN, and error-text differences made it a port scanner. Every address a
hostname resolves to must be on the public internet; loopback, RFC1918,
link-local, CGNAT (which is where Tailscale lives, so the bot cannot fetch its
own share links) and the documentation ranges are all refused, as are
IPv4-mapped and NAT64 forms of them. It fails closed on anything it cannot
parse. It does **not** close DNS rebinding — yt-dlp re-resolves the name itself
— which is what the sandbox is for.

**ffmpeg and yt-dlp run under bubblewrap** (`sandbox.ts`). `/usr` and `/etc`
read-only, a private `/tmp`, and exactly one writable directory: the job's own
workspace. `$HOME` does not exist inside it, so `.env`, `pb_data` and `~/.ssh`
are unreachable even from a fully compromised decoder. ffmpeg additionally gets
**no network at all**, which closes a second SSRF — a crafted upload can name
remote resources through an HLS playlist. `-protocol_whitelist file,crypto,data`
is the backstop for when bubblewrap is missing; set `FINI_DISABLE_SANDBOX=1` to
turn confinement off, and the tools run unwrapped with a warning.

## Operational notes

**Upload limits.** Unboosted guilds take 10MB, tier 2 takes 50MB, tier 3 takes
100MB. This is the constraint that shapes both commands: `/ytdlp` defaults to
720p because that usually fits, and anything over the limit is re-encoded
smaller and the reply says so. `uploadLimit.ts` deliberately guesses low when
the tier is unknown — an over-limit upload only fails after the whole file has
been sent.

When a file cannot be squeezed under the limit, both commands fall back to
`modules/fileShare` and post a link instead. The link carries the *full-quality*
encode, not the squeezed one — which is why `convertToFit` gives each squeeze
attempt its own output path rather than overwriting. If sharing is not
configured the commands report the size and stop, exactly as before.

**Trimming.** Both commands take `start` and `end` (`90`, `1:20`, `1:02:03`).
`/ytdlp` passes them to yt-dlp as `--download-sections`, which fetches only
that span; `/convert` turns them into an ffmpeg input seek. Two consequences
worth knowing:

- The duration cap is measured against the *requested span*, not the source, so
  forty seconds out of a two hour stream is an ordinary request rather than a
  rejection.
- A section download is ffmpeg seeking the remote file over HTTP range
  requests. A host that does not serve ranges cannot be seeked, and it fails
  silently — a valid container with nothing in it and a zero exit code. `/ytdlp`
  catches this by comparing what came back against what was asked for.

Cuts snap to the nearest keyframe, so an edge can land a second or so out.
`--force-keyframes-at-cuts` is exact but re-encodes the whole span during the
download, which races the interaction token on this box.

**Sites that need a login.** yt-dlp's own config file is *not* disabled, so
`cookiesfrombrowser` or `cookiefile` in `~/.config/yt-dlp/config` on the bot's
host is the place to put credentials for age-gated or subscriber-only sources.

**Load.** Two jobs run at once (`MAX_CONCURRENT_MEDIA_JOBS`); a third is turned
away rather than queued, because a queued job would still be waiting when its
interaction token expires. ffmpeg and the bot share a box with pocketbase and
llama.cpp under one `concurrently --kill-others-on-fail`, so a job that eats
every core takes the whole stack down with it.

**Time.** A job gets twelve minutes total (`JOB_BUDGET_MS`), against Discord's
fifteen minute interaction token, with the difference left for the upload.
Stages draw from that one budget rather than each having a fixed timeout, so
tuning one stage cannot quietly push the total past the token's life.

**Registering.** New commands need `bun run register-commands` before Discord
will show them.
