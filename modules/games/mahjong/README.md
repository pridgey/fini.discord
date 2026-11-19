# Mahjong

`/mahjong open rules:<riichi|hongkong> buyin:<n>` posts a table. Up to four
people join; Fini's bots take the empty seats. Everything is played with
buttons: the public message shows the table, and **My hand** opens a private
view that updates itself and teaches as you play (hints are on by default).

## Files

| File          | What it does                                                           |
| ------------- | ---------------------------------------------------------------------- |
| `tiles.ts`    | Tiles in mpsz notation (`5p`, `0s` red five, `7z` Red Dragon, `1f`).   |
| `hand.ts`     | Readings into sets, waits, shanten, discard search. No ruleset.        |
| `riichi.ts`   | Yaku, fu, han and points.                                              |
| `hongkong.ts` | Faan and payments.                                                     |
| `game.ts`     | The table as pure data: deal, turns, calls, kans, draws, game end.     |
| `bot.ts`      | Bot play.                                                              |
| `driver.ts`   | Plays bots between human decisions; timeouts; payouts.                 |
| `hints.ts`    | Beginner explanations: next discard, waits, furiten, yaku, scoring.    |
| `render.ts`   | Table and hand images (SVG → PNG via sharp).                           |
| `views.ts`    | Discord messages and buttons.                                          |
| `table.ts`    | Discord flow: lobby, buy-ins, moves, clocks, live views, AFK, payouts. |
| `store.ts`    | The `mahjong_table` row and a per-table lock.                          |

## Rules as implemented

**Riichi** follows the common online ruleset (Mahjong Soul / Tenhou ranked):

- **Tiles and starting points:** 136 tiles with three red fives. Everyone starts on 25,000, and 30,000 is the target.
- **Game length:** the East round only. If nobody has 30,000 after East 4, play goes into South as sudden death, ending after South 4 at the latest. The dealer may stop when in first at all-last (agari-yame). The game also ends when anyone goes below zero.
- **Yaku and limits:**
  - Open tanyao is allowed.
  - Kazoe yakuman starts at 13 han. There's no kiriage mangan.
  - Yakuman stack.
  - Double yakuman: 13-sided Thirteen Orphans, Four Concealed Triplets on a pair wait, true Nine Gates, and Big Four Winds.
- **Rules during play:** furiten (permanent, temporary, and after riichi), kuikae, and riichi kans only when the waits don't change. Chankan works on added kans; Thirteen Orphans may also rob a closed kan.
- **Kan dora:** shown at once for a closed kan, and after the next discard for an open one.
- **Multiple winners:** double ron is allowed, and honba and riichi sticks go to the first winner in turn order. Triple ron is an abortive draw.
- **Draws:**
  - Abortive draws: nine terminals, four winds, four riichi, four kans by different players, and triple ron.
  - Exhaustive draw: noten payments of 3,000 in total. Nagashi mangan is paid instead, as a mangan tsumo.
- **Dealer:** keeps the deal on a win or when ready at a draw. Honba go up on a dealer repeat or any draw.

**Hong Kong** is old-style faan scoring:

- **Tiles and starting points:** 144 tiles with flowers. Everyone starts on 1,000.
- **Winning:** 3 faan minimum, and limit hands count as 13. There's no furiten and no riichi. If two players can win on the same tile, only the first in turn order does (head bump).
- **Payment:** the half-spicy table (8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384) with half-shoot payment. The discarder pays double and the other two pay single. On a self-draw, everyone pays double.
- **Faan values:**
  - Flowers: no flowers is 1, each seat flower or season is 1, and a full set of four is 2.
  - Small Three Dragons is 5 and Small Four Winds is 6, both including their pungs.
  - Seven pairs is 4.
  - Eight flowers wins at once.
- **Dealer:** keeps the deal on a win, or when ready at a draw. That house rule keeps games finite.

## Coins

The pot is four buy-ins. People pay theirs into the Reserve, which stakes
each bot seat. Final places take 50 / 30 / 15 / 5 % of the pot, and a bot's
share stays with the Reserve.

## Tests

`tests/games/mahjong/` covers:

- Scoring against the standard tables.
- Every rule above, set up move by move.
- Whole games played by bots and by random legal moves, with tile, point and hand-size invariants checked after every move.
- Discord's message limits on every view a player meets.
- The Discord flow end to end, with Pocketbase and the bank mocked.
