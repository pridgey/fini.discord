# Minecraft module

Fini runs the **All the Mons** (ATM10 + Cobblemon) server at
`/opt/minecraft/AllTheMons`, Minecraft 1.21.1 on NeoForge.

| | |
| --- | --- |
| Server dir | `MINECRAFT_PATH` in `.env` (`/opt/minecraft/AllTheMons`) |
| Game port | `56552` |
| RCON port | `25575` (password in `.env` as `MINECRAFT_RCON_PASS`) |
| screen session | `minecraft` |

## Operating the server by hand

The bot launches the server detached inside `screen`, so there's a real console
sitting there you can attach to:

```bash
screen -r minecraft          # attach
# Ctrl+A then D              # detach again, LEAVING THE SERVER RUNNING
```

**Don't press Ctrl+C or type `exit` while attached** — that kills the server.
Ctrl+A then D is the only safe way out.

```bash
screen -ls                                  # list sessions; empty = server down
screen -S minecraft -X stuff "stop\n"       # stop it without attaching
```

`screen -ls` exits non-zero when there are no sessions at all, so check its
output rather than its exit code (this is what `isScreenSessionAlive()` does).

Sessions are per-user — the bot runs as `pridgey`, so attach as `pridgey` or
the socket in `/run/screen/S-pridgey` won't be visible to you.

To start it the same way the button does:

```bash
cd /opt/minecraft/AllTheMons && \
  ATM10_RESTART=false screen -dmS minecraft ./startserver.sh
```

`ATM10_RESTART=false` matters: without it `startserver.sh` relaunches the JVM
in a loop after every crash, which means a crashed server looks alive forever.

## Logs

```bash
tail -f /opt/minecraft/AllTheMons/logs/latest.log
grep -iE "error|exception|fatal" /opt/minecraft/AllTheMons/logs/latest.log
zless /opt/minecraft/AllTheMons/logs/2026-10-04-1.log.gz     # rotated runs
```

- `logs/latest.log` — current run, rolled into a dated `.gz` on each boot
- `logs/debug.log` — verbose; use it when `latest.log` stops mid-startup
- `crash-reports/` — full dumps when the JVM dies hard
- A boot that never reaches `java` writes **nothing at all** — if `latest.log`
  is older than your start attempt, the failure happened in the shell script

## RCON

`rcon.config.ts` points at `localhost:25575`. `getServerPlayers()` wraps
`list`; `MinecraftMonitor` uses the same connection to broadcast and to `stop`.
RCON only binds *after* the world finishes loading, so a successful RCON call
doubles as proof the server is fully up.

## Files

| File | Role |
| --- | --- |
| `checkServerStatus.ts` | TCP probe of the game port. Cheap, but the port binds *before* world load — it means "booting or up", not "ready" |
| `getServerPlays.ts` | `list` over RCON |
| `minecraft.config.ts` | Server directory, from `MINECRAFT_PATH` |
| `packUpdate.ts` | Compares the installed pack against the latest CurseForge release |
| `rcon.config.ts` | RCON host/port/password |
| `minecraftMonitoring.ts` | Shuts the server down after 15 min empty. Run as its own process via `services/minecraft-monitor.service.ts` |
| `neoforgeInstaller.ts` | Installs NeoForge when the pack expects a version that isn't present |
| `waitForServerReady.ts` | Polls a boot to a definite ready/failed/timeout verdict |

## Why `neoforgeInstaller.ts` exists

`startserver.sh` only checks `if [ ! -d libraries ]` before deciding to install
NeoForge. After a pack update bumps `NEOFORGE_VERSION`, `libraries/` still
exists from the *old* version, so the install is skipped and the JVM launches
against a `unix_args.txt` that was never generated.

`ensureNeoForgeInstalled()` reads `NEOFORGE_VERSION` out of `startserver.sh`,
checks for that specific version's
`libraries/net/neoforged/neoforge/<version>/unix_args.txt`, and runs the
installer (downloading it from the NeoForged maven first if needed).

Manual equivalent:

```bash
cd /opt/minecraft/AllTheMons
grep '^NEOFORGE_VERSION=' startserver.sh
java -jar neoforge-<version>-installer.jar -installServer
```

## Why `waitForServerReady.ts` exists

A 375-mod pack takes minutes to boot, so "it didn't crash in the first ten
seconds" says nothing. The poller resolves on the first definite signal:

- **ready** — `Done (12.3s)! For help, type "help"` in the log, or RCON answers
- **failed** — a crash marker in the log, or the `screen` session disappearing
  (with `ATM10_RESTART=false`, the JVM exiting always takes the session down)
- **timeout** — 10 minutes with no verdict

Capture a `getLogMarker()` **before** launching and pass it in, otherwise the
previous boot's crash gets read as this one's.

The marker records the **inode** as well as the size. Log4j rolls `latest.log`
into a dated archive and creates a fresh file on boot, so a byte offset alone
would skip past the beginning of the new run. Matching on log *timestamps*
doesn't work either — the lines that actually name a failure are often
unprefixed continuation lines:

```
[04Oct2026 00:55:27.189] [main/ERROR] [CrashAssistantJarInJarHelper/]: Found more than one mod with modid "crash_assistant". Crash Assistant is duplicated. Crashing!
Duplicated mods:
CrashAssistant-neoforge-1.20.6-1.21.4-1.11.12.jar
```

## Updating the modpack

Pack: [All the Mons on CurseForge](https://www.curseforge.com/minecraft/modpacks/all-the-mons)
(project id `1356598`).

`/minecraft-server` checks for updates on its own. The **installed** version
comes from `modpackVersion` in `config/bcc-common.toml`, which Better
Compatibility Checker ships with the pack — so replacing `config/` during an
update keeps it accurate with nothing to maintain by hand. The **latest**
version comes from `https://api.cfwidget.com/minecraft/modpacks/all-the-mons`,
a public CurseForge mirror that needs no API key. Results are cached for 30
minutes (5 after a failure).

When an update exists, the offline reply gains a second button next to **Start
Server**. Everyone sees it so they know an update is waiting; only `ADMIN_ID`
can press it, and pressing it prints the checklist below rather than installing
anything — replacing directories on disk isn't something to do behind a button.

**Replace `mods/` wholesale — never extract the new server pack over the old
one.** Mod jars are versioned in their filenames, so merging leaves both copies
in place and the loader aborts on the first duplicate modid it meets.

```bash
cd /opt/minecraft/AllTheMons
# sanity check for leftovers from a previous version
ls -l --time-style=+%Y-%m-%d mods/*.jar | awk '{print $6}' | sort | uniq -c
```

Two dates in that output means you merged.

The same test applies to every **pack-shipped** directory, because they all
break the same way — a leftover file referencing content the new version
dropped. One stale `kubejs/data/.../pokemon_center.json` from a previous
version was enough to abort startup with an unbound-registry error, long after
`mods/` had been cleaned up.

| Directory | Source | On update |
| --- | --- | --- |
| `mods/` `config/` `kubejs/` `defaultconfigs/` | pack | **Replace wholesale** |
| `datapacks/` `global_packs/` `world/datapacks/` | pack | Replace (empty in this install) |
| `showdown/` | extracted by Cobblemon | Leave — mod-managed, mixed dates are normal |
| `local/` `dynamic-data-pack-cache/` `.mixin.out/` | runtime cache | Leave — regenerates |
| `world/` `server.properties` `ops.json` `whitelist.json` `banned-*.json` `usercache.json` | yours | **Never touch** |

The distinction that matters: pack directories are a *set* that must match the
version, so a merge corrupts them. Generated directories are owned by the mods
that write them, and mixed dates there mean the mod rewrote what it needed —
not that something is stale.

Orphaned configs from mods that were removed entirely are harmless.

## Who can press what

**Start Server is open to everyone** — the server shouldn't sit offline waiting
on one person.

**Install update is admin-only**, via `ADMIN_ID` in `.env`
(`utilities/discord/isAdmin.ts`). The button is still rendered for everyone, so
the whole channel can see an update is waiting; the handler calls
`requireAdmin()` and answers non-admins with an ephemeral refusal. Gating only
the rendering would not be enough — a custom id is clickable by anyone who can
see the message. With `ADMIN_ID` unset, admin-only actions are refused for
everyone.
