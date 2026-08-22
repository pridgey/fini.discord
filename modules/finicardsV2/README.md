# Finicards v2

Implementation of `docs/Finicards-v2.md` — the battle-first card game. **Phase 1
(PvP battles) is complete and playable.** Phase 2's keyword library is built and
tested but switched off, so it can be turned on with one flag when you want it.

v2 runs *alongside* v1. Nothing in `modules/finicards`, `commands/booster-pack`,
`commands/card-collection`, `commands/sell-card` or `commands/fuse-cards` was
touched, and no v1 collection is read or written by this module. The switchover,
when you want it, is retiring the v1 commands — not migrating data.

---

## Getting it running

1. **Apply the schema.** `/pb_migrations` is gitignored, so the migration is
   tracked here and copied into place:

   ```bash
   cp modules/finicardsV2/migrations/*.js pb_migrations/
   # then restart Pocketbase - unapplied migrations run on boot
   ```

   Three migrations: they create `v2_card_definition`, `v2_user_card` and
   `v2_battle`, then add the Stadium selection fields and the `flavour` /
   `artist` columns the templates use. Copies are already in `pb_migrations/`
   and apply the next time Pocketbase restarts.

2. **Register the command.** `bun run register-commands` — `/finicard-v2` is
   picked up automatically by the existing glob.

3. **Fill the card pool** from the existing v1 cards:

   ```
   /finicard-v2 import                 # dry run, reports what it would do
   /finicard-v2 import commit:True     # writes the rows
   ```

   Idempotent, keyed on `legacy_card`, so re-running after a mapping tweak
   updates in place instead of duplicating the pool.

4. **Get cards and fight:**

   ```
   /finicard-v2 pack                             # 25 fc, five cards
   /finicard-v2 grant who:@someone count:10      # admin, free, for testing
   /finicard-v2 collection                       # card ids live here
   /finicard-v2 battle opponent:@them card1:<id> card2:<id> card3:<id>
   /finicard-v2 pending                          # whatever is waiting on you
   ```

---

## The converted pool

`/finicard-v2 import` maps the live v1 pool into v2 rows. Two corrections in
`convertLegacyCards.ts` exist because measuring the real 263-card pool showed the
naive mapping produced an unplayable pool:

| | naive | corrected |
| --- | --- | --- |
| type split | 62% power / 15% wit / 22% heart | **40 / 27 / 33** |
| avg top stat, common | 5.9 (ceiling 7) | 6.0 |
| avg top stat, uncommon | 5.9 (ceiling 9) | **7.6** |
| avg top stat, full-art | 6.0 (ceiling 12) | **9.5** |
| full-arts reaching 10+ | **0 of 65** | **34 of 65** |

- **`SPIKE_GAMMA`** sharpens the dominant stat as rarity climbs. Without it every
  rarity averaged a top stat of about 6 and *not one full-art reached 11* - rarity
  was purely cosmetic and the doc's "devastating in lane, wide open elsewhere"
  never happened. Commons stay at gamma 1.0, which is what keeps them rounded.
- **`channelMeans`** judges a card against its peers instead of in absolute
  terms. Power is fed by two v1 stats, Wit by two, Heart by Luck alone, which
  skewed the pool to 62% Power - so most matchups were Power vs Power and the
  type wheel barely turned.

Both are one constant / one function if you want to retune them.

## Match structure

Modelled on Pokémon Stadium: **both players know the cards, neither knows the
order.**

```
1. CHALLENGE   Challenger brings 3 cards, face down.
                 → nothing about them is public, not even type composition

2. ANSWER      Defender brings 3 cards, also blind.
                 → neither player saw the other's picks, so no one had an edge

3. REVEAL      Both hands are shown in full: stats, keywords, everything.
                 → order is still undecided by either side

4. ORDER       Both players secretly pick their slot order.
                 → one public button, a private picker each

5. RESOLVE     The second order in triggers the match.
```

Every step is asynchronous — nothing waits on a Discord collector, so a battle
survives a bot restart, and the two players never need to be online together.

**Ordering is the whole game, and it is load-bearing.** In the end-to-end test,
one player's six possible orderings against a *fixed* opposing order produced
scorelines of `3-0`, `1-1`, `1-2`, `0-2` and `0-3` — the same six cards, swinging
from a shutout win to a shutout loss on the ordering alone.

Two consequences worth knowing:

- **Orders are validated as a permutation of the revealed hand**, so nobody can
  swap in a card they never showed, and an order cannot be changed once locked.
- **The doc's defender advantage is gone.** §3 gave the defender second-mover
  information as "compensation for not choosing when the fight happens." This
  structure is symmetric instead, so if that compensation still matters it needs
  to come from somewhere else.

The order picker is buttons rather than typing: three cards is six orderings,
which fits comfortably. It supports up to 4 cards (24 orderings); at 5 it would
be 120, so `orderingsFitInButtons` refuses out loud rather than truncating.

### Tuning

```bash
bun run scripts/finicards_v2_simulate.ts                    # sweep the multiplier
bun run scripts/finicards_v2_simulate.ts --matches 5000 --keywords
bun test tests/finicardsV2/                                 # 141 tests
```

---

## What the sweep says about the dials

Seeded, 2000 matches per cell, keywords off. `fa vs answer` is three full-arts
against commons that answer the visible composition.

| mult  | depth wins | fa vs blind | fa vs answer | mono-type | level rounds |
| ----- | ---------- | ----------- | ------------ | --------- | ------------ |
| 1.0   | 59.3%      | 100.0%      | 99.8%        | 34.6%     | 19.1%        |
| 1.25  | 90.0%      | 99.7%       | 92.8%        | 8.2%      | 14.3%        |
| **1.5** | **98.9%** | **91.7%**  | **25.1%**    | **0.8%**  | **11.3%**    |
| 1.75  | 99.8%      | 84.4%       | 3.4%         | 0.1%      | 8.6%         |
| 2.0   | 100.0%     | 75.1%       | 0.0%         | 0.0%      | 6.7%         |

The doc's default of **1.5 is the right call**, and the two full-art columns are
why: a full-art beats a common that isn't pointed at it 92% of the time, and
loses to a common that *is* 75% of the time. That gap — 92% down to 25% — is
exactly "beating the best card in the game requires a specific answer." At 1.25
the answer barely matters; at 1.75 owning the answer is the whole game.

Mono-type lineups lose ~99% at 1.5 with no rule enforcing it, and a deep
collection beats a six-card collection 98.9% of the time. Both design pillars
hold up.

---

## Files

| File | What it is |
| --- | --- |
| `rules.ts` | Every tuning dial, the type wheel, rarity ceilings and costs. Nothing is inlined at a call site. |
| `statBudget.ts` | `normalizeSpread` / `validateSpread` / `deriveType`. All stat writing funnels through here, so an illegal spread cannot reach the engine. |
| `keywords.ts` | The keyword library and the locked resolution order. |
| `battleEngine.ts` | Pure match resolution. No I/O, no clock, no randomness. |
| `convertLegacyCards.ts` | Pure v1 → v2 mapping. |
| `cardStore.ts` | Pocketbase boundary for cards, collections, lineups and the pool import. |
| `battleStore.ts` | The two-phase challenge lifecycle and its state machine. |
| `orderings.ts` | Slot-order permutations and their button labels. |
| `packs.ts` | Pack odds, foil rolls, population limits. |
| `wagers.ts` | Finicoin escrow, the jackpot rake and pot splitting. |
| `expireBattles.ts` | The defender-timeout sweep, run from the minute poll. |
| `renderBattle.ts` | Discord text presentation. |
| `cardArt/` | Card image rendering: palettes, per-template geometry, text fitting, generated blocks. |
| `templates/` | The five card templates. `templates/mockups/` holds the original designs. |
| `migrations/` | Tracked copies of the Pocketbase migrations. |

Surface files outside the module: `commands/finicard-v2.command.ts`,
`buttons/individualButtons/v2Battle{Select,Decline}.button.ts`,
`buttons/individualButtons/v2Order{Open,Pick}.button.ts`,
`modals/individualModals/v2BattleSelection.modal.ts`,
`types/PocketbaseTablesV2.ts`, `scripts/finicards_v2_simulate.ts`,
`tests/finicardsV2/`.

---

## Adding a keyword

A keyword is a data row plus one hook. The engine is never edited, no migration
runs, and cards reference it by slug — so a card already carrying the slug picks
the keyword up the moment it registers.

```ts
registerKeyword({
  name: "Kindred",
  slug: "kindred",
  tier: "uncommon",
  description: "+3 if another card in your lineup shares a tag",
  stage: "conditional",   // one of the eight locked stages
  order: 1,               // tie-break within the stage
  apply: (ctx) => {
    const mine = new Set(ctx.self.card.tags);
    const shared = ctx.selfLineup.some(
      (other) =>
        other.instanceId !== ctx.self.card.instanceId &&
        other.tags.some((tag) => mine.has(tag)),
    );
    if (!shared) return;
    ctx.self.attackStat += 3;
    ctx.self.bonuses.push("Kindred +3");
  },
});
```

`registerKeyword` rejects a duplicate slug, an unknown stage, or a definition
with no hook — all three of which would otherwise fail *silently*, the keyword
simply never firing, which is a miserable thing to debug mid-balance-pass.

### What a hook can read and write

| `ctx` | |
| --- | --- |
| `self.card` / `opponent.card` | Full `BattleCard`: type, all three stats, tags, series, rarity, cost, foil |
| `self.attackStat` | The type stat. Bonus keywords add to this |
| `self.multiplier` / `opponent.multiplier` | Type multiplier. `Adapt` raises its own, `Guard` lowers the opponent's |
| `self.defenseBonus` | Added to this card's stats when attacked (`Bulwark`) |
| `self.pierce` | Subtracted from the defender's stat when this card attacks (`Pierce`) |
| `slot`, `lineupLength` | Placement effects (`Vanguard`, `Last Stand`) |
| `state` | `roundsWon`, `roundsLost`, `lastRoundWasLoss`, `pendingRally` |
| `selfLineup`, `opponentLineup` | Both full lineups in slot order |
| `history` | Rounds already resolved this match |
| `notes` | Player-visible round log |

Plus `adjustOutcome` for outcome overrides (`First Strike`) and
`adjustTiebreakDamage` for tiebreaker maths (`Overwhelm`).

`tests/finicardsV2/keywordExtensibility.test.ts` registers four keywords from
outside the module — one reading tags and its own lineup, one reading the
opponent's stats, one reading earlier rounds, one at a stage no shipped keyword
uses — as proof that none of them needs an engine change.

### Known limits

Three keyword families would need more than a data row:

- **Two keywords on one card.** `keyword` is a single string. Supporting more
  means a json column and returning an array from `stageKeywords`; the stage
  runner already sorts, so it's small but not free.
- **Debuffing the opponent's *next* card.** `pendingRally` is the only
  cross-round channel and it only feeds your own side. A "the next enemy card
  has -2 defence" keyword needs an equivalent field on `SideState`. Left
  unbuilt deliberately — the right shape depends on the first real keyword that
  wants it.
- **Reordering a lineup mid-match.** Lineups are fixed once resolution starts.

Anything needing state across *matches* (cooldowns, XP) is Phase 3, not a
keyword.

---

## Decisions the doc left open

Where the doc marks something 🔶, here is what the code does and why. All of
these are one-line changes if you disagree — that's why they're listed.

**Defender timeout** → a battle stuck in *either* waiting state — nobody
answered, or nobody locked in an order — expires with no result after
`V2_BATTLE_TIMEOUT_HOURS` (24h), the least punitive of the three options.
Stakes go back to whoever had money in escrow: the challenger always, and the
defender too if they had got as far as committing cards. Wired into `runPollTasks`, so it
sweeps every minute. Change the constant in `expireBattles.ts` to retune.

Each battle is marked expired *before* it is refunded, deliberately: if the
process dies between the two steps the battle is already out of the pending pool,
so the next sweep cannot pay the refund twice. A dropped refund can be fixed by
hand; minted Finicoin cannot.

**Match tiebreaker when rounds *and* damage tie** → a draw, dial-controlled by
`RULES.drawResolution` (set it to `"defender"` for the alternative).

**Full-art: power tier or cosmetic tier** → the Foil proposal, implemented.
Full-art is the power tier; `foil` is a separate cosmetic axis that rolls on any
card at any rarity (3% per pull) and never touches a stat. v1 legendaries convert
to full-art *with* foil, so prestige survives without a fourth power tier.

**Type-tie resolution** → `card_type` is stored explicitly on the row, and
`deriveType` breaks ties in a fixed power → wit → heart order, so a 5/5/5 common
is never ambiguous.

**Stats by lore or by rarity budget** → budget only. `normalizeSpread` will not
emit an illegal spread, so lore arguments can't produce one.

### Interpretations where the doc is genuinely ambiguous

**`Adapt`** — "counts as whatever beats the opposing card's type" could mean the
card *swings with* the countering stat, which would make Adapt a downgrade for
the spiky full-arts that get it (a 12/2/1 card would attack with its 2). So it's
implemented as: the card keeps swinging its own type stat, and is always granted
the type advantage. `Guard` is ordered after `Adapt`, so a Guard card shuts it
back to neutral.

**Composition reveal order** — §3 step 1 says the bot shows the *defender's*
composition before the challenger picks, but step 3 has the defender picking
last, so there was nothing to show yet. Superseded by the Stadium structure
above: both hands are committed blind, then revealed in full, then ordered in
secret. See **Match structure**.

**Damage rounding** — the doc's worked examples floor the multiplied attack
(`7 × 1.5 − 3 = 7`, `9 × 1.5 − 2 = 11`), so `attackValue = floor(stat × mult)`.
Both examples reproduce exactly; `tests/finicardsV2/battleEngine.test.ts` pins
them.

**Round draws** — count for neither side and break an `Avenge` chain (a draw is
not a loss).

**Wagers** — not in the doc, added because battles were listed as an economy
source with no mechanism. Both sides escrow into the Reserve, and **10% of every
decided pot is raked into the server Jackpot** (`RAKE` in `wagers.ts`), so a
wagered battle is a net *sink* for the players while the coin stays in
circulation — it comes back through `rollJackpot`. Nothing is minted:
`jackpotCut + payout === pot`, which `tests/finicardsV2/wagers.test.ts` pins.
Draws return both stakes unraked by default (`RAKE.rakeDraws`). Default wager 0.

---

## Card art

Cards render as PNGs from the five templates in `templates/`. Your mockups are
preserved untouched in `templates/mockups/` as the design reference.

**Six mockups became five templates.** `card-special-wit` and
`card-special-heart` were the same layout in two colourways, so the type colours
were tokenised (`{t_main}`, `{t_bright}`, …) and the two files collapsed into one
`card-special.svg` that themes to any type. That is also what made a **Power**
palette possible - no Power mockup existed, so it is invented: a warm amber that
sits clearly apart from the indigo and the rose. It lives in `cardArt/palettes.ts`
and is the only place to change it.

**Rarity mapping.** v2 has three rarities and a cosmetic `foil` flag, and you
supplied five escalating frames, so foil promotes a card to the fancier frame of
its tier:

| | plain | foil |
| --- | --- | --- |
| common | `card-common` (silver) | `card-rare` (gold) |
| uncommon | `card-uncommon` (light) | `card-double-rare` (holo) |
| full_art | `card-special` (prism) | `card-special` |

That gives the cosmetic axis something visible to do while never touching a stat,
which is what the doc wants foil to be. Full-arts already have the top frame, so
foil changes nothing for them. Remap in `layoutFor` if you'd rather.

**The stat bar is generated, not templated.** In the mockups the wide filled box
sits wherever the lead stat happens to be, so a Power card and a Heart card have
different geometry. `cardArt/blocks.ts` builds the bar from one width ratio, so it
always spans exactly the width the template allots, with the emphasis on the
card's type. Same for the tag chips (sized to their own text) and the ability
text (wrapped).

**Labels.** The mockups say `STR`; the schema and the doc both call the stat
Power, so the card says `POWER` / `PWR`. Change it in `STAT_LABELS`.

**Art comes from v1 for free.** Converted cards have an empty `art_url` but carry
`legacy_card`, so the renderer pulls the v1 artwork straight from Pocketbase. The
whole converted pool has art without anyone uploading anything.

**Fonts.** Archivo and JetBrains Mono are not installed on this machine, so text
renders in a fallback (DejaVu Sans) - close, but wider. The width estimator in
`cardArt/svgText.ts` carries a deliberate 12% safety factor to stop text
overflowing under the fallback. Installing the real fonts makes it match your
design exactly and only costs slightly early line breaks:

```bash
sudo apt install fonts-jetbrains-mono   # then drop Archivo into ~/.local/share/fonts
fc-cache -f
```

Render cost is 34 ms for a common and 99 ms for a full-art, so a five-card pack
reveal is well under a second.

**Where images appear:** `/finicard-v2 card` (with the text face as fallback),
`/finicard-v2 pack` (all five pulls in one message), and the battle **reveal**
(both hands, six cards). Match results stay text - the round-by-round maths is
the point there.

---

## Deliberately not built

- **Keywords in live battles.** Written, tested and documented, but
  `RULES.keywordsEnabled` is `false`. Phase 1 is meant to answer "is
  type-plus-stat fun" without keywords confusing the answer. Flip the flag (or
  pass `rules: { keywordsEnabled: true }`) to play with them.
- **Decks, cooldowns, dungeons, set completion, trading.** Phases 3–6. The
  schema carries `cost`, `tags`, `keyword` and `set_piece` from day one, so none
  of them needs a migration across a live collection.
- **Select-menu lineup picking.** `index.ts` routes buttons and modals but not
  select menus, and a v2 test feature has no business changing the shared
  interaction router. Lineups are typed as card ids — which `/sell-card` already
  trains players to do — and `resolveLineup` accepts any unambiguous id prefix.
