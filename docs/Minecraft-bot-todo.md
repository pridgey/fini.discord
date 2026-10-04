# Minecraft bot - deferred work

Logged from the session that built Fini's in-game bot. Nothing here is
blocking; the bot, the skin, the chat bridge and the empty-server shutdown all
work today.

## 1. Pack additions are deleted by modpack updates

Fini's in-game presence needs files that live in `/opt/minecraft/AllTheMons`,
and [the documented update
procedure](../utilities/minecraft/README.md#updating-the-modpack) replaces
`mods/` and `kubejs/` wholesale:

| File | Restore with |
| --- | --- |
| `mods/SiliconeDolls-neoforge-1.21.1-1.0.0+build.66.jar` | by hand (Modrinth) |
| `mods/RollingGate-neoforge-1.21.1-1.1.0+build.66.jar` | by hand (Modrinth) |
| `kubejs/server_scripts/fini_skin.js` | `npm run set-bot-skin -- <spec>` |
| `kubejs/server_scripts/fini_chat.js` | `npm run set-bot-chat` |

The scripts are generated and disposable. **The two jars are not** - after an
update the bot silently cannot be spawned at all.

Proposed fix: a `finiAddons` manifest with the repo as the source of truth,
listing the jars by Modrinth version id and the generated scripts, plus:

- `verifyFiniAddons()` - what's missing
- `installFiniAddons()` - download the jars, regenerate the scripts
- hooked into the **Install update** button's checklist, and into **Start
  Server** so a missing piece is reported rather than discovered later

Worth folding in the duplicate-jar check the README describes by hand
(`ls -l mods/*.jar | two dates means you merged`), since that's the failure
mode a bad update actually produces.

## 2. Untested end to end

Both need a person in game and had nobody online when they were built:

- **Lifecycle** - the bot should appear beside the first person to join and
  vanish when the last leaves
- **In-game `hey fini`** - a reply should arrive in chat. `/tmp/fini-bot.log`
  says why if not

## 3. Smaller things

- **Model choice for in-game chat.** Replies route through `converseWithAI`
  keyed on `minecraft:<player>`, a user id that has never set a `/chat-config`
  preference, so it takes the default. Worth confirming that reads sensibly.
- **He's timid in mountains.** 33 blocked turns to 4 drifts in one run: a steep
  slope reads as a drop. `minSafeAhead` in `botWander.ts` tunes it.
- **Swimming is unproven.** Holding jump in water should surface him, but when
  found fully submerged it didn't, and the rescue teleport is what freed him.
  Needs watching as he enters a pond from the shore.
- **Unsigned skin properties are rejected**, so custom skins need a Mojang
  signature - meaning an account you own with the skin uploaded. The `url:`
  spec is kept in case that changes.
- **The bot borrows an account's identity.** `MrSquirr1`'s signed payload means
  the skin follows whatever that account wears, and the bot's own name resolves
  to the real `FINI` account's uuid - which would collide if that person ever
  joined.
