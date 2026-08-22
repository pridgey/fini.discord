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

   Four migrations: they create `v2_card_definition`, `v2_user_card` and
   `v2_battle`, add the `flavour` / `artist` columns the templates use, and add
   `v2_deck` plus the dealt-hand fields. Copies are already in `pb_migrations/`
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
   /finicard-v2 deck build name:Main             # required before battling
   /finicard-v2 battle opponent:@them            # no card ids anywhere
   /finicard-v2 battle opponent:@them draw:4     # try a different draw size
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
lineup.** Nothing is typed at any point.

```
1. CHALLENGE   Challenger brings a deck. 5 cards are dealt from it, face down.
                 → not even the challenger sees them yet

2. ACCEPT      Defender accepts with a deck of their own and is dealt 5.
                 → one click if they have one deck, a deck picker if several

3. REVEAL      Both hands are shown in full: stats, keywords, card images.

4. LINEUP      Each player privately clicks 3 of their 5, in slot order.
                 → two cards get left behind; which two is the decision

5. RESOLVE     The second lineup in resolves the match.
```

**Nobody sees their own hand until both are dealt.** That is deliberate: if the
challenger saw their five first they could cancel and re-issue until they liked
the draw, and a fishable draw is worse than no draw at all.

Every step is asynchronous — nothing waits on a Discord collector, so a battle
survives a bot restart and the two players never need to be online together.

The lineup picker is three clicks from your own five cards. Progress lives in the
button custom ids (`v2_lineup_pick:<battle>:<picked>:<next>`) rather than the
database, so an abandoned pick leaves no row to clean up and a stale ephemeral
can never desync from stored state. There is a "start over" button for misclicks.

Lineups are validated against the dealt hand, so a player can only play cards
they were actually dealt, and a locked lineup cannot be changed.

## Decks

A battle draws from a deck, not from the whole collection, and **that distinction
is doing real work.** Measured over 4000 matches, a 120-card collection beats a
6-card one:

| draw source | deep collection's win rate |
| --- | --- |
| free pick 3 from the collection | 100% — a shutout, depth decides everything |
| draw 5 from the **collection** | **50%** — dead even, depth worth nothing |
| draw 5 from a **deck you built** | **75%** — a real edge that's still beatable |

Drawing straight off the collection doesn't reduce the value of collecting, it
*deletes* it: five random cards from 300 are statistically the same as five from
six. Drawing from a deck restores it, because a deep collection builds a better
deck. This is also what the doc describes — §5 draws from *"their deck"*, and
says outright *"you need a deep, redundant deck rather than six perfect cards."*

Decks are also how a player organises a collection, so they may overlap freely -
the same copy can sit in several, and only one deck is used per battle.

```
/finicard-v2 deck build name:Main                   # from your best cards
/finicard-v2 deck build name:Hearts type:heart      # filter by type,
/finicard-v2 deck build name:Rares rarity:full_art  # rarity,
/finicard-v2 deck build name:Shonen tag:shonen      # or tag
/finicard-v2 deck list | show | add | remove | delete
```

`build` is the path that matters — it assembles a deck from the collection so a
player never has to type a card id to get playing. `add` / `remove` are for
tuning afterwards. Limits: 5-40 cards, 10 decks per player. Rebuilding a name
replaces that deck in place rather than duplicating it.

A deck stores specific copies, so selling a card leaves a hole; `loadDeck`
reports those, and a deck that can no longer fill a hand is caught before the
battle starts rather than mid-deal.

## What the sweep says about the dials

Seeded, 2000 matches per cell, keywords off, modelling the real structure -
decks built from a collection, five dealt, both hands revealed, three picked.

| mult | depth wins | fa vs blind | fa vs answer | mono-type | level rounds |
| ----- | ---------- | ----------- | ------------ | --------- | ------------ |
| 1.0 | 93.8% | 100.0% | 100.0% | 28.5% | 16.3% |
| 1.25 | 86.5% | 100.0% | 99.7% | 1.4% | 16.1% |
| **1.5** | **75.1%** | **90.5%** | **91.9%** | **0.0%** | **11.3%** |
| 1.75 | 71.0% | 79.3% | 84.2% | 0.0% | 8.6% |
| 2.0 | 67.3% | 74.9% | 74.9% | 0.0% | 6.9% |

**1.5 holds up on three of the four pillars.** Depth is worth a solid 75%,
mono-type decks lose essentially every match with no rule enforcing it, and only
11% of matches fall through to the damage tiebreaker.

**The fourth is a real problem.** An all-full-art deck beats an all-common deck
~90% of the time *whether or not the commons player can read their hand* - so
"rarer is more exciting, not more powerful" does not currently hold. The
arithmetic says why: a common's spike caps at 7, and

```
common 3/5/7 (Heart) vs full-art 12/2/1 (Power)
  common:    7 x 1.5 = 10  - 1 = 9
  full-art:  12          - 3 = 9     -> a draw
```

A *perfectly countering* common can only draw with a full-art, never beat it.
Lowering the full-art ceiling to 10 - which the doc's own tuning table names,
"12: how extreme full-arts get. 10 is tamer" - flips it:

```
common 3/5/7 (Heart) vs full-art 10/3/2 (Power)
  common:    7 x 1.5 = 10  - 2 = 8
  full-art:  10          - 3 = 7     -> the common wins
```

That is one number in `RULES.spikeCeiling`. Left at 12 because it is a game-feel
decision the doc made deliberately, not a bug.

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
| `decks.ts` | Deck CRUD, auto-building with filters, and loading a deck for play. |
| `draw.ts` | Dealing a hand and validating a lineup against it. |
| `lineupPicker.ts` | The three-click lineup picker and its custom-id encoding. |
| `battleFlow.ts` | The shared accept-and-reveal step. |
| `packs.ts` | Pack odds, foil rolls, population limits. |
| `wagers.ts` | Finicoin escrow, the jackpot rake and pot splitting. |
| `expireBattles.ts` | The defender-timeout sweep, run from the minute poll. |
| `ui/` | Discord message building: containers, galleries, accents, and the copy that explains the mechanics. |
| `cardArt/handStrip.ts` | The one-image-per-hand landscape layout. |
| `renderBattle.ts` | The two text renderers components can't improve on: the monospace card face (image-render fallback) and the id-bearing collection list. |
| `cardArt/` | Card image rendering: palettes, per-template geometry, text fitting, generated blocks. |
| `templates/` | The five card templates. `templates/mockups/` holds the original designs. |
| `migrations/` | Tracked copies of the Pocketbase migrations. |

Surface files outside the module: `commands/finicard-v2.command.ts`,
`buttons/individualButtons/v2Battle{Accept,Decline}.button.ts`,
`buttons/individualButtons/v2DeckPick.button.ts`,
`buttons/individualButtons/v2Lineup{Open,Pick}.button.ts`,
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
last, so there was nothing to show yet. Superseded: hands are *dealt* from decks
and revealed in full, and the hidden information is which three each side plays.
See **Match structure**.

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

## Message UX

Everything a player sees is built with Discord's Components V2 - containers with
accent colours, image galleries, separators - in `ui/`. Three rules the surfaces
follow:

**One block per owner, coloured by side.** The reveal used to post ten loose card
images in a flat message, which stacked down the channel and made it impossible
to tell whose five were whose. Each hand now gets its own bordered container with
its own accent colour (`SIDE_ACCENT`) and its own gallery, plus one text line per
card - gallery thumbnails are too small to read a stat line off.

**Say why, but say it small.** This has been through both failure modes. The
first result view showed only `7 × 1.5 − 3 = 7`, so a player could see a card hit
for 7 but not why. Spelling it out fixed that and produced five lines a round -
correct, complete, and far too much to read three times over.

The layout now splits by *need*. The headline of each round carries who won and
by how much; the derivation sits underneath in small text you can skip:

```
`R1` **Fen +2** · 🟢 Oathbound Knight **7** – 5 Storm Caller 🔴
-# 🟢 Heart beats 🔴 Power — ×1.5 to Fen · 7×1.5=10 − 3 Heart vs 9 − 4 Power
```

All three rounds live in one block with one separator - three bordered sections
for three rounds reads as three times the content. The full sentence-by-sentence
working is still available behind a **Full breakdown** button, ephemeral, so
asking for it costs nobody else any screen space.

Two details worth keeping: the round's winner leads the line (an earlier version
marked every round `✅`, which read as "you won this one" regardless of who did),
and negative damage is parenthesised, because `4 – -4` is hard to parse.

**Never make them scroll to decide.** The lineup picker repeats the opposing hand
as a compact line (`🔴 Vegeta 10 · 🔵 Bulma 9 · …`), because the read is the whole
decision and the reveal may be several messages up by then.

### One constraint worth knowing

A message created with `IsComponentsV2` **cannot** carry a plain `content` field,
and cannot be converted back. The lineup picker is edited on every click, so it
is V2 from its first reply and every update path - including each error - goes
through a container. `ui/notice.ts` exists for exactly those one-line paths.

### Hand size

Set per battle: `/finicard-v2 battle draw:4`. Range is `MIN_HAND_SIZE`
(= `RULES.rounds`, below which there is nothing to choose) to `MAX_HAND_SIZE` of
8, and it is **stored on the battle** rather than read from a constant - the two
hands are dealt at different times and validated later still, so all three have
to agree on the number the battle was created with.

`HAND_SIZE` in `draw.ts` is only the default. What the sizes cost:

| hand | depth wins | decisive | pick mattered |
| --- | --- | --- | --- |
| 3 | 77.0% | 98.7% | — (no choice, order only) |
| 4 | 78.6% | 98.9% | 66% |
| **5** | **75.6%** | **98.9%** | **77%** |
| 6 | 73.2% | 99.1% | 77% |

All are balance-viable. "Pick mattered" is how often reading the opponent's hand
changed which three cards got played - at 3 the set is forced and only ordering
remains, which is worth feeling before committing to it.

### Hand images

A hand is **one wide image**, not one image per card (`cardArt/handStrip.ts`).

That is a Discord constraint, not a card design problem: a gallery divides its
width between items, so five portrait cards each get a fifth of the message and
their stats become unreadable - you have to click every card, which defeats the
point of showing them. A *single* gallery item gets the full width, so a hand is
rendered as one image with a landscape strip per card stacked vertically. Each
strip then has the full width for a name, a type spine, an art thumbnail and
three stat boxes with the card's own type emphasised.

Portrait cards are still the real card: `/finicard-v2 card` and pack pulls use
them. The strip exists purely for the read-a-whole-hand-at-a-glance job.

Two things that bit while building it, both worth knowing before editing:

- **SVG ids are document-global.** Nesting an `<svg>` per strip does *not* scope
  them, so a single `id="lead"` gradient painted every card's lead box the first
  card's colour. Ids are suffixed per strip.
- The image is oversampled to `HAND_STRIP_WIDTH` (1140px) because Discord
  downscales it; rendering at display size looks soft.

Cost: 2 files and ~120-200 KB per reveal, against 10 files and ~550 KB before.

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
- **Mulligans.** The doc offers one free redraw and lists extra redraws as a
  Finicoin sink. Left out because a redraw after the reveal leaks information -
  you would be rerolling against a known hand - and a redraw before it reopens
  the draw-fishing hole that dealing both hands together closes. Worth designing
  deliberately rather than bolting on.
- **Deck cost budgets and cooldowns.** Phase 3. `cost` is populated on every
  card, so neither needs a migration.
