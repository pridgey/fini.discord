# fileShare

Hands a file out as a link when Discord won't take it as an attachment. Used by
`/ytdlp` and `/convert`; nothing else depends on it.

```
fileShare    the token store, publishing, expiry
shareServer  the loopback HTTP server Tailscale Funnel proxies to
```

## Setup

Two env vars, both in `.env`:

```
FINI_SHARE_BASE_URL=https://friday.polydactyl-duckbill.ts.net/f
FINI_SHARE_PORT=8787
```

**Unset `FINI_SHARE_BASE_URL` and the whole feature is off** — the commands go
back to saying the file was too large. That's deliberate: publishing puts a file
on the public internet, and it should never happen because someone forgot to
configure something.

On the host:

```bash
tailscale funnel --bg --set-path /f 8787
```

`--set-path` keeps the funnel scoped to one path so a second service can't get
published by accident. Whether Funnel forwards the `/f` prefix or strips it
doesn't matter — `tokenFromPath` reads the token from the end of the path.

## How it behaves

A link lives **24 hours** by default (`DEFAULT_TTL_MS`), and the sweep runs from
the existing 60-second poll loop. Expiry is also checked on read, so a link dies
on time rather than up to a minute late.

**Not one-time links**, which is where this idea started. One-time is the right
shape for handing a file to a person and the wrong shape for posting into a
channel — the first click, quite possibly Discord's own crawler generating a
preview, would burn it for everyone else.

**Links don't survive a restart.** The token map is in memory. The alternative
was a Pocketbase collection and a migration for records that live a day, in a
temp directory a reboot clears anyway. `resetShareDir` runs at startup and
clears both the directory and the map so the two can't disagree.

**The link always carries the full-quality file.** Squeezing exists to satisfy
Discord's uploader; a link has no such limit, so `convertToFit` keeps its first
encode around specifically to be linked. Each squeeze attempt writes to its own
path so the good one isn't overwritten.

## Security notes

Funnel is the whole public internet with no auth in front of it, so:

- The server binds **127.0.0.1 only**. Funnel reaches it through `tailscaled`
  or nothing does.
- Tokens are **128 bits** of randomness. They are the only thing protecting a
  file — the hostname is public via Certificate Transparency.
- **Nothing user-supplied becomes a path.** Files on disk are named after their
  token; the real filename only ever appears in `Content-Disposition`.
- Unknown and expired tokens both 404, with no way to tell them apart.
- Only `GET` and `HEAD`; everything else is a 405.
- **Rate limited** to 240 requests/minute globally, answered with a 429 and a
  `Retry-After`. Global rather than per-IP because everything arrives from
  `tailscaled` on loopback, so per-IP would be limiting one client.
- **64 connections** max with a 10s headers timeout — that pair is what closes
  slowloris. `requestTimeout` is deliberately left alone: it has a history of
  being read as covering the response, and truncating a 200MB download to win
  marginal hardening is a bad trade.
- Filenames are **scrubbed on publish**, not on the way out. The name lands in
  a `Content-Disposition` header, so a newline would be header injection —
  Node turns that into a 500 rather than refusing. The module does not rely on
  callers having sanitised it.
- The share directory has a **5 GB ceiling** (`FINI_SHARE_MAX_BYTES`), evicting
  soonest-to-expire first. Without it the only bound on disk is the TTL, and a
  full `/tmp` takes down more than the bot.

## Why the server isn't three lines

Range requests. Safari won't start an HTML5 video *at all* unless a range
request comes back as a 206, and seeking needs it in every browser. `parseRange`
also handles the suffix form (`bytes=-500` is the **last** 500 bytes, not the
first) — getting that backwards serves the wrong part of the file under a status
code that looks fine.
