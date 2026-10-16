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

## The empty-server monitor

`services/minecraft-monitor.service.ts` runs as its own **systemd unit**,
separate from `fini.service` — nothing in `index.ts` or `npm start` launches it.

```bash
systemctl status minecraft-monitor.service
journalctl -u minecraft-monitor.service -f      # what it currently sees
sudo systemctl restart minecraft-monitor.service # after changing its code
```

A healthy journal prints `Current player count: N` every 30 seconds. The unit
sets `WorkingDirectory` to `services/` and supplies `MINECRAFT_RCON_PASS` via
`EnvironmentFile=`, so bun never needs to find `.env` itself. **Restarting the
unit is required for code changes to take effect** — it is a long-lived process
holding the state machine in memory.

To run it by hand instead, go through the project root so `.env` is found:

```bash
bun --env-file=.env run services/minecraft-monitor.service.ts
```

Launching it as `bun minecraft-monitor.service.ts` from inside `services/`
leaves `MINECRAFT_RCON_PASS` empty, every `list` fails authentication, and an
auth failure is indistinguishable from a server that is down — so it would poll
forever and shut nothing down. The service now refuses to start without the
password rather than idling. Don't run a manual copy alongside the unit:
`Restart=always` means systemd already keeps one alive, and two monitors both
race to stop the server.

### Fini's bots must not keep the server alive

A SiliconeDolls fake player is a real `ServerPlayer`, so `list` counts it like
a person:

```
There are 2 of a max of 20 players online: [334] Pridgey, [0] FINI
```

Counting that would mean the server never looks empty and never shuts down -
the same symptom as the state bug below, from a different cause. So the monitor
counts *humans*, via `countHumanPlayers()` in `parsePlayerList.ts`, and names
listed in `MINECRAFT_BOT_NAMES` (`.env`, default `Fini`) are excluded. The
journal says `Current player count: N (bots excluded)`.

Verified end to end on 04Oct2026: with only the bot online, the countdown armed
at 14:10:42 and the server stopped at 14:26:07, saving every dimension.

Two consequences worth knowing:

- The parser errs towards keeping the server up. If the name list can't be read
  but a count was reported, the reported total is used - a missed shutdown
  wastes power, a wrong one drops people out of the world mid-session.
- **The bot gets stopped along with the server.** It can't hold the server open,
  so it dies whenever the last human leaves, and nothing spawns it back. Any bot
  worth keeping needs a lifecycle tied to human presence rather than its own.

Note that `rg allowListingFakePlayers false` does *not* help here - it leaves
`list` unchanged (it appears to govern the client tab list), which is why the
filtering is done on our side.

### The eleven-hour night of 04Oct2026

The server was found still running the next morning after sitting empty since
01:56. The monitor was up and polling correctly the whole time — the journal
holds 1316 consecutive `Current player count: 0` lines — but it never armed a
shutdown, because a player joining cancelled the countdown without moving
`currentState` off `EMPTY_COUNTDOWN`:

1. 01:52 server boots empty, countdown armed
2. 01:55 one player joins — countdown cancelled, **state left on `EMPTY_COUNTDOWN`**
3. 01:56 that player leaves — the server emptying again looks like a countdown
   that is already running, so nothing is scheduled
4. ...and nothing ever schedules one again

The only code that reset the state was inside the single-player countdown
block, which had been commented out in 83d7204. The fix makes every reading
above zero return to `MONITORING`; the regression test in
`tests/minecraft/minecraftMonitoring.test.ts` replays those four steps.

Worth knowing when debugging this class of bug: the state is in memory, so
`systemctl restart` clears a wedged countdown, and until the fix above the
service also exited after each shutdown it performed (`stopMonitoring()` drained
the event loop) and relied on `Restart=always` to come back.

## Fini's in-game bot

`services/fini-bot.service.ts` owns the bot's whole presence: when it exists,
where it walks, and answering when someone talks to it. Run it from the project
root, like the monitor:

```bash
bun --env-file=.env run services/fini-bot.service.ts
```

It is a **separate process from the monitor** and deliberately never keeps the
server alive - see [Fini's bots must not keep the server
alive](#finis-bots-must-not-keep-the-server-alive). An empty server still shuts
down on schedule, which kills the bot; this process then waits for the server
to come back and spawns it again.

| | |
| --- | --- |
| Appears | when the first person joins, next to them |
| Goes away | when the last person leaves |
| Walks | aimlessly, on its own feet - no teleporting except to escape terrain |
| Answers | chat beginning with `hey fini` (`MINECRAFT_CHAT_TRIGGER`) |

### Running it

Two long-lived processes back the Minecraft features, and neither is started by
the bot itself:

| Unit | Does |
| --- | --- |
| `minecraft-monitor.service` | Shuts the server down after 15 min empty |
| `fini-bot.service` | Fini's in-game presence |

Both have recorded unit files in [`services/systemd/`](../../services/systemd).
Install the bot one with:

```bash
sudo cp services/systemd/fini-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fini-bot.service
```

**Keep the recorded copies in step with what's installed.** The monitor unit
existed only on the host for months, so a rebuilt machine would have silently
lost the empty-server shutdown.

The **Start Server** button now starts both if they aren't running and reports
their state in its reply, rather than claiming monitoring is active and hoping.
It prefers `systemctl`, falls back to a detached process when systemd declines
(no privileges, or no unit installed), and says so - a detached copy won't
survive a reboot.

It never starts a second copy. That matters: two monitors both race to stop the
server. Worth knowing if you ever extend the check - `pgrep -f` matches whole
command lines, so it also matches *the caller* whenever the pattern appears in
its own arguments. That reported a just-killed service as running, which is why
`matchesServiceProcess` requires the process to actually *be* `bun` rather than
a shell mentioning the script.

### Wandering

`botWander.ts` holds the decision logic, deliberately free of RCON and of any
clock so the escalation is unit tested. It is **nearly blind**: aimless
wandering has no destination, so there is nothing to path *to*, and reacting to
being stuck gets climbing and swimming for free. The only sensing is a ground
lookahead, because a fall is the one thing reacting cannot fix.

Three failures found by watching it rather than reading it, all now covered by
tests:

- **Oscillation read as progress.** Comparing consecutive samples only, a bot
  trapped in a crevice bounced between two points 1.4 blocks apart, clearing
  the progress threshold every sample while going nowhere. Progress is now net
  displacement across a window.
- **Blocked turns steered back into the wall.** A uniformly random heading
  points at the obstacle about half the time. Blocked turns are now at least
  90° off the heading that just failed.
- **Giving up stopped it forever.** Stopping a stuck bot means only gravity can
  ever move it again. It now resets course, and only teleports after repeated
  resets fail.

Measured on this server: roughly 50 blocks of net travel per two minutes, with
`move forward` sustained at about four blocks a second. It is timid in
mountains - a steep slope reads as a drop - which `minSafeAhead` tunes.

### In-game `hey fini`

Chat never reaches the server log on this pack: NoChatReports is installed with
`convertToGameMessage`, so player chat becomes system messages and no
`<name> message` line is written. Grepping every archived log back to April
finds not one.

KubeJS *can* see chat, so the bridge is a generated script that echoes matching
messages to the console, which this side reads back out of `latest.log`:

```bash
npm run set-bot-chat
```

**The first install needs a full server restart** - `PlayerEvents.chat` only
binds at startup, and a script-only reload leaves a new handler silently
inactive.

Replies go through `converseWithAI`, the same entry point as Discord's
`hey fini`, keyed on `minecraft:<player>` so in-game conversation keeps its own
history rather than being mixed into that player's Discord thread. Replies are
broadcast to everyone, and split to fit Minecraft's chat line limit.

## The bot's skin

A fake player's skin comes from the `textures` property on its GameProfile,
which SiliconeDolls fills in from the real Mojang account matching the bot's
**name**. So a bot called `Fini` wears whatever the real `FINI` account wears -
name and skin are coupled, and that account is not ours.

Replacing the property server-side breaks the coupling. Verified in game: a bot
named `FINI` wearing Notch's skin, then Dinnerbone's.

```bash
npm run set-bot-skin -- account:Dinnerbone              # copy an account's skin (signed)
npm run set-bot-skin -- 'url:https://host/fini.png#slim' # any PNG (unsigned)
```

That generates `kubejs/server_scripts/fini_skin.js` in the modpack and reloads
it. **The generated file is disposable** - a pack update deletes `kubejs/`, and
re-running the command puts it back. `modules/minecraft/botSkin.ts` is the
source of truth.

### Three things that will waste your time

**A client that has already seen the bot keeps the skin it first resolved.**
Removing and re-adding the tab-list entry is not enough to make it re-resolve.
So a skin change is only visible to clients that connect afterwards - reconnect
to see it. This caused a long detour: an injection that looked like it had
worked had actually just landed *before* the only client reconnected, and the
two following changes appeared to do nothing.

**`ServerEvents.tick` only binds on a full server start.** `/kubejs reload
server-scripts` reloads the script and re-runs an already-bound handler in
about a second, but installing this script for the first time needs a restart,
or it silently never fires.

**Don't use `/reload`.** It blocks the server thread for 90+ seconds on this
pack, and three in quick succession tripped the watchdog
(`max-tick-time=180000`) and killed the server. `/kubejs reload
server-scripts` is the right tool and takes about a second.

### Signed vs unsigned

Only Mojang can sign a profile's textures, so any skin of our own is unsigned.
`account:` specs borrow a real account's signed property and always work.
Whether an **unsigned** property renders decides if a skin you draw yourself is
possible at all - if the client rejects it, the bot falls back to the default
skin. Judge it by reconnecting after setting one.

Useful to know either way: the URL inside a payload does not have to be
Mojang's, but `textures.minecraft.net/texture/<hash>` already addresses every
skin ever uploaded to a Mojang account.

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
| `minecraftMonitoring.ts` | Shuts the server down after 15 min empty. Run as its own process via `services/minecraft-monitor.service.ts` — see [The empty-server monitor](#the-empty-server-monitor) |
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
