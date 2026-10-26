# Finicards v2

Implementation of `docs/Finicards-v2.md` — the battle-first card game. **Phase 1
(PvP battles) and Phase 2 (keywords) are complete and playable, and the first
cut of Phase 4 (solo dungeons) is in.** Keywords are on
(`RULES.keywordsEnabled`) and belong to a copy: each is rolled when the copy is
pulled.

Around the battles sit the collecting game: booster packs opened one card at a
time, two tiers above full-art (**Secret Art** and **Legendary**), a collection
with a list and a binder view, selling, and set numbers on every card.

**Launched 2026-10-12.** The game was built and tested as `/finicard-v2`
beside the first one, and is now `/finicard`. v1's `/booster-pack`,
`/card-collection`, `/sell-card` and `/fuse-cards` are retired
(`commands/archived`); v1 collections were carried across by a one-off script
(see **Launch**), and item cards were paid for in free packs. There is no v2
fusion.

---

## Getting it running

1. **Apply the schema.** The migrations are in `pb_migrations/`
   (`1787292000_created_finicards_v2.js` onward) and apply the next time
   Pocketbase starts - unapplied migrations run on boot.

   They create `v2_card_definition`, `v2_user_card`, `v2_battle`,
   `v2_deck`, `v2_dungeon_run` and `v2_free_pack`, and add what came later: a
   card's own artwork and crop, per-copy keywords, Secret Arts and copy
   numbers, Legendaries, set numbers, and a finished dungeon run's summary.

2. **Register the command.** `bun run register-commands` — `/finicard` is
   picked up automatically by the existing glob.

3. **The card pool** is kept in the card manager (see **The card manager**).
   It began as a conversion of the first game's cards - see **The converted
   pool** - and has been edited by hand since, which is why the command that
   did the conversion is gone: run again, it would write v1's version of every
   card over the corrected one. A keyword is not part of a card; it belongs to
   a copy and is rolled when the copy is pulled - see **Keywords and rarity**.

4. **Get cards and fight:**

   ```
   /finicard pack                             # 25 fc, five cards from every set
   /finicard pack set:Set 3                   # 40 fc, five cards from one set
   /finicard grant who:@someone count:10      # admin, free, for testing
   /finicard collection                       # a list, with a View button per card
   /finicard collection view:Binder           # six cards to a page, as a picture
   /finicard sell card:<id>                   # to anyone, a player, or Fini
   /finicard deck build name:Main             # required before battling
   /finicard battle opponent:@them            # no card ids anywhere
   /finicard battle opponent:@them draw:4     # try a different draw size
   /finicard pending                          # whatever is waiting on you
   /finicard practice                         # both sides yourself, see below
   /finicard dungeon                          # 15 fc, solo, endless - see Dungeons
   ```

---

## The converted pool

The pool was first filled by mapping the live v1 pool into v2 rows
(`convertLegacyPool`). Two corrections in
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
                 → each hand lists what its keywords do, under the image

4. LINEUP      Each player privately clicks 3 of their 5, in slot order.
                 → two cards get left behind; which two is the decision

5. RESOLVE     The second lineup in resolves the match.
                 → the result lists what every keyword did, or that it sat idle
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

## Practice battles

`/finicard practice` runs a whole battle with one player on both sides, so a
scenario can be tried without a second account:

```
/finicard practice                            # your only deck against itself
/finicard practice deck:Main against:Hearts   # one of your decks vs another
/finicard practice deck:Main draw:8           # see more of the deck per hand
```

Both hands are dealt and revealed at once, you pick the first side's lineup and
the picker turns straight over to the second, and the result comes back with the
same board and breakdown as a real match. All of it is ephemeral - only the
player sees it - and nothing touches Finicoin, the jackpot or anyone's record.

It is not a separate code path. A practice battle is an ordinary `v2_battle` row
whose challenger and defender are the same user, which a real challenge can
never be, so it needs no schema change and exercises the real dealing, picker,
engine and rendering (`practice.ts`). The sides are named after their decks
(`Main A` / `Main B` for a mirror). A deck facing itself is dealt as two
separate hands with no copy on both sides, when it has enough cards for that.

To stage an exact matchup, build a small deck per side with `deck build` and
`deck add` / `remove`, and raise `draw` so the cards you want are in the hand.

## Dungeons

`/finicard dungeon` is a solo run on the battle engine - the doc's §5, with
no second combat system. It has no last room: you see one room at a time, pick
one of two doors out of it, and go on until you fall or walk out.

```
1. ENTER     15 fc to the Reserve. 6 cards are dealt from the deck you bring
             and you are standing in room 1.
               → nothing is visible until the fee is paid, so there is no draw
                 to fish for

2. ROOM      Deal with the room you are in:
               fight   play a card. Win for geld; lose and the run ends.
               event   play a card. Its stat + d6 against a target.
               shop    spend geld on buffs for this run.

3. DOORS     Two doors, each with a hint - "Wit room", "Elite Power room",
             "Shop", "Event" - and nothing more. Pick one. Back to 2.

4. END       A lost fight, or the Walk out button, which is always there.
```

**Cooldowns.** A card played into a fight or an event rests for the next 2
rooms (`DUNGEON.cooldownRooms`) and is back in the third. Every kind of room
counts, so a shop or an event is also a breather. The hand image - two cards
across, so it sits short under the room - shows resting cards dimmed with the rooms they have left. Smelling Salts (shop), Quick Hands
(shop) and two of the events bring cards back sooner.

**Geld.** Fights pay geld: `(4 + depth)`, x1.75 for an elite, x3 for a boss.
Geld is the only currency inside the dungeon and only spends in shops. When the
run ends it converts at `DUNGEON.coinPerGeld` (0.25 - four geld to the coin), paid
out of the Reserve. **Walking out keeps all of it; falling keeps half**
(`fallenKeep`) - that is the whole push-your-luck of an endless dungeon.
`coinPerGeld` is the dial a difficulty setting would move.

**Fights.** Enemies are pool cards with extra stat points bolted on, and they
are deliberately not bound by the 15-point budget or the spike ceilings:

- `floor((depth - 1) * 0.4)` points, +2 for an elite, +3 for a boss
- an affix decides where they go: **Hulking** (all in its type stat), **Warded**
  (both off stats), **Ancient** (spread evenly), **Cunning** (half the points,
  and a random keyword instead)
- elites and bosses always carry a keyword, rolled if their card has none
- deeper rooms draw from better rarities; every 5th room is a boss behind both
  doors
- an enemy drawn from the full-art tier is a Secret Art only 4% of the time
  (`DUNGEON.secretArtEnemyChance`); they are a third of that tier, and left to
  chance a third of bosses were Secret Arts
- about one door choice in 12 (`DUNGEON.previewEvery`) puts a card from the
  next unreleased set behind the fight door as a "Sudden" enemy, and the door
  is marked 👀 sneak peek. It was one in 75, and players reaching rooms 40 and
  65 had never been offered one
- **the first 5 rooms are a warm-up** (`DUNGEON.warmup`): enemies are commons
  fighting 2 points under their card ("Drowsy"), no elites, and the room-5 boss
  is built on an uncommon rather than a full-art

A draw is a stalemate: the enemy stands, the card rests, play another. A run
starts with one **ward charm**, which breaks instead of the run on the first
lost fight (no geld for that room); shops and one event hand out more.

**Boss drops.** Beating a boss banks a card. The first three bosses drop an
uncommon; after that the chance of a full-art instead climbs fast - 10%, 25%,
50%, 80%, then certain from the eighth boss on (`DUNGEON.bossFullArtOdds`).
Banked cards are drawn and granted when the run ends, on a walk out or a fall
alike, and shown on the final message. A ward that carries you past a boss
drops nothing.

**Events.** Fifteen encounters, each asking for one stat. The card's stat (with
buffs) + d6 has to reach `9 + depth / 4`, and every button shows that card's
chance. Passing pays the event's boon - geld, a temporary buff, a ward, every
card recovered, or the resting cards swapped for fresh ones. Failing never ends
the run: the next choice is one door instead of two - or, for the four events
that carry a `failEffect`, something else instead: a card falls asleep (the
Lullaby Bard puts the strongest ready one out for 3 rooms, the Comfy Bed a
random one for 2), or cards are swapped for others from the deck (the
Pickpocket Imp takes 2 at random, the Shuffling Corridor the whole hand), or
the next doors are hidden (the Fog Machine, whose boon is the opposite: three
door choices that show their enemy). The Cursed Idol pays big geld but puts a
card to sleep pass or fail, and the Echo Chamber restarts the three-fight count
so the next fight is slot 1 - a second go for `Vanguard` and `Gambit`. A
reward or a cost can be several effects at once (`{ kind: "many" }`). An event
can also be walked past, which counts as failing it.

**Shops.** Three wares off a shelf of ten, priced in geld: +1 to a stat for the
run, War Paint (+2 type stat, 3 rooms), Hex Doll (enemies -1, 3 rooms),
Smelling Salts, Quick Hands, Lucky Coin, Deep Pockets, Ward Charm. Most shops
(`DUNGEON.specialChance`, 60%) also sell a fourth, special ware: Fresh Shuffle
(every resting card swapped, 10), Mulligan (the whole hand redealt, 14),
Treasure Map (the next 3 door choices show their enemy, 8), Loaded Dice (the
next failed event is rolled again, 10) or Strong Coffee (wake any resting card,
any time, 8). They sit beside the regular shelf rather than on it, because on it
they crowded out the stat wares and cost runs about a fifth of their depth in
the simulator.

Prices are listed for the first room and rise 10% of that per room
(`DUNGEON.shopInflation`, `shopPrice`): twice the list price by room 11, seven
times by room 61. Fight pay grows with depth, and at fixed prices a deep run
bought out every shelf. Fight pay still grows faster - 20% a room - so a deep
shop is affordable but now costs a real share of the payout; prices that kept
pace with fight pay put the 8-pack careful run below its entry fee.

Shops in the warm-up (rooms 1-5) sell at list price. Before the first boss a
shop is paid for out of two or three small fights - 11 geld by room 3, 18 by
room 4 - and with prices rising from room 1 that bought one ware at most, which
players noticed. After the boss the curve picks up where it would have been
(half again by room 6), and the boss's purse covers the step. Starting the
curve after the warm-up instead cut every later price too and lifted payouts by
half (8-pack careful 23 fc to 37 fc), so only the warm-up is exempt.

**Charges.** Loaded dice and coffees are held like wards and shown beside them.
A loaded die is spent automatically on the first event roll that fails. A coffee
is spent by the player: while they hold one, every resting card in hand gets a
☕ Wake button, in any room and at the doors.

**What a door shows** (`doorSight`). Fog (a one-room buff) hides the kind of
room behind both doors - in the text, the buttons and the picture. A map (a
buff counted in door choices) shows the enemy behind each fight door by name,
stats and ability. A map sees through fog. The hand strip and
the card buttons show stats with buffs already applied.

**Redraws.** The engine has no deck, so a redraw only marks cards on
`DungeonState.redraw`; the store (`act` in `dungeonStore.ts`) deals their
replacements from the run's deck, from the cards not already in hand, each into
its old card's place so the buttons keep their order. New cards come in ready.
A deck with too few spare cards swaps what it can. The simulator deals redraws
the same way, through the same `redealHand`.

**Doors.** One door is always a fight, and after a shop or an event both are -
a run cannot be walked on side rooms. Two fight doors are different types when
the pool allows. The rooms behind the doors are generated when the doors appear
and stored on the run, so a hint is always true and re-opening the message
cannot reroll it.

**Shop guarantee.** The second door rolls a shop about one time in four, which
on its own leaves some runs without one. So after `DUNGEON.shopPity` (4) door
choices in a row with no shop on offer, the next choice that is allowed a shop
has one.

**The summary.** A finished run's message carries one image
(`cardArt/dungeonSummary.ts`): rooms, fights and bosses won, events passed, geld
made, the payout, the card that won the most fights, and the path - a node per
room, coloured like its door, with a small dot for each door not taken. A run
longer than 48 rooms shows its last 48.

**A fight is one clash, and every three fights are one match.** The player is
the challenger, the dungeon the defender, and each fight goes through the same
`resolveRound` a battle uses. A run has no length for `Last Stand` to find the
end of and no ceiling for `Momentum`, so keywords see it as a string of
three-fight legs: slot 1, 2, 3, then slot 1 again with fresh keyword state. The
fight room says which slot it is. Keywords that read "your lineup" (`Trinity`,
`Thrifty`, `Kinship`) see the cards played so far this leg plus the one being
played - for the enemy, that is the enemies fought so far this leg, including
itself again after a stalemate.

None of that is visible from a keyword's description, so in a fight room the
enemy's ability says what it does in this fight in place of its description
(`ui/enemyAbility.ts`): whether it is live this fight and why, in dungeon terms.
Showing both read as a wall of text, and the fight-specific line is the one a
player acts on. Where the bonus depends only on the
enemy's side it runs the keyword's own hook against the leg, so the number shown
is the one it will fight with; where it depends on the card you choose, it says
what to look for. Tiebreak keywords are called out as doing nothing, since a
fight is one round. Bonuses earlier fights handed on (`Martyr`, `Rally`,
`Parting Shot`, `Spoiler`) get a line of their own.

Your hand gets the same treatment (`ui/handAbility.ts`): in a fight room each
ready card's ability says what it will do in this fight. The number comes from
`previewRound` - the real fight, run with the ability and without it, on a copy
of the run - so a Chorus played first plainly shows "No bonus this fight" rather
than looking broken. Abilities the battle wording already describes exactly
(`Bulwark`, `Pierce`, `Guard`, ...) keep their description instead, as does a
resting card's ability, and a test keeps every keyword either explained or on
that list. When one ability does different things on different cards, its name
gets a line and each card a `↳` line under it.

**Progress lives in the row, not the button ids** - the opposite of the lineup
picker, deliberately. `v2_dungeon_run.progress` holds the whole `DungeonState`:
room, doors, geld, cooldowns, buffs, keyword state. It carries a `step` that
goes up on every accepted click, every button carries the step it was drawn
for, and a click for any other step is refused. One run per player per server:
`/finicard dungeon` during a run re-posts it instead of charging again.

The payout is recorded on the run as it is paid, and a run that already carries
one is never paid again.

**The tutorial** (`/finicard dungeon-tutorial`, `dungeonTutorial.ts`) is five
rooms on rails with a coach, private and free: a fight for the type wheel, an
event (the Goose Tribunal) for stat checks and resting, a shop, a fight nobody
can win for wards (seven raccoons in a trenchcoat, 99/99/99), and a boss for
abilities - Captain Crouton's Last Stand lands in slot 3 - then the way out. It
is a real run through the real engine and message, with a borrowed hand drawn
in SVG (`tutorialArt.ts`), scripted rooms behind the doors and a die that always
lands on 4. Nothing is stored: the moves so far ride in the button ids, every
click replays them from the start, and the coach switches off every button but
the move being taught. The tests walk every path it allows.

### How far it goes

`bun run scripts/finicards/simulate.ts --dungeon --keywords`, 2000 runs a
row. *careful* works out every clash and walks out when nothing in hand can win;
*gut* plays the best-looking card and never walks out.

| deck | player | avg room | median | p90 | avg fc | runs in profit | cards | full-arts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 packs, all 10 cards | careful | 12.8 | 10 | 20 | 15.8 | 31% | 1.76 | 0.07 |
| | gut | 10.3 | 10 | 15 | 2.9 | 1% | 0.82 | 0.00 |
| 8 packs, best 20 | careful | 15.4 | 15 | 25 | 23.1 | 41% | 2.24 | 0.12 |
| | gut | 11.9 | 10 | 18 | 3.8 | 2% | 1.09 | 0.01 |
| 24 packs, best 20 | careful | 19.8 | 17 | 35 | 39.7 | 58% | 3.13 | 0.34 |
| | gut | 14.4 | 13 | 23 | 5.9 | 6% | 1.51 | 0.04 |
| full-arts only | careful | 27.4 | 25 | 46 | 86.1 | 76% | 4.66 | 0.96 |
| | gut | 18.7 | 15 | 32 | 10.8 | 15% | 2.24 | 0.15 |

The same run also reports the first shop each run walks into: the room, the
geld in hand, and how much of the shelf that buys, cheapest first. The bots skip
a shop while they hold under 8 geld, so it reads early shops kinder than a
player who walks in with 5 does.

Since shop prices began rising with depth the bots - which buy whatever they
can afford, cheapest first - carry far less geld out: the 8-pack careful row
was 61.7 fc and 60% in profit at fixed prices. A player who shops with the
payout in mind does better than they do.

Against a 15 fc fee the dungeon is a Finicoin source for anyone who walks out
in time and a sink for anyone who plays until they fall - the payout comes out
of the Reserve either way. Bosses are the walls - medians sit on
multiples of five. The bots shop and pick doors crudely - they never buy coffee
or maps, which they could not use, and see through fog - so read these as
shapes, not promises. Every number is in `DUNGEON` in `dungeon.ts`.

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
/finicard deck build name:Main                   # from your best cards
/finicard deck build name:Hearts type:heart      # filter by type,
/finicard deck build name:Rares rarity:full_art  # rarity,
/finicard deck build name:Shonen tag:shonen      # or tag
/finicard deck list | show | add | remove | delete
```

`build` is the path that matters — it assembles a deck from the collection so a
player never has to type a card id to get playing. `add` / `remove` are for
tuning afterwards. Limits: exactly 20 cards, 10 decks per player. Rebuilding a name
replaces that deck in place rather than duplicating it.

**Every deck is exactly 20.** A battle deals five cards and a dungeon run
six, so a deck barely bigger than a hand deals its owner the same best cards
every time. And one size instead of a range, because hands are dealt at
random: every card past the minimum only waters down the best ones, so a
range was a rule nobody would have used. `add` and `remove` may leave a deck
short while it is being changed; it cannot be played until it is back to 20.
`DECK_SIZE` in `decks.ts` is the dial.

A deck stores specific copies, so selling a card leaves a hole; `loadDeck`
reports those. The minimum is therefore checked again whenever a hand is about
to be dealt - starting or accepting a battle, a practice battle, a dungeon run
(`unplayableReason`) - so a deck cannot be built at 20 and sold down to 7.

`deck show` uses the same pages as the collection, list or binder, narrowed to
the deck's copies (`cardPages.ts`), and each deck in `deck list` has a View
button onto them.

## Packs

```
/finicard pack                # 25 fc: five cards, drawn from every set
/finicard pack set:Set 3      # 40 fc: five cards, all from that set
```

Rarity odds per card are 70 / 25 / 5 (common / uncommon / full-art) in a pack
drawn from every set, and 75 / 22 / 3 in a set pack (`SET_PACK_ODDS`): a set
pack narrows the draw to one set, which made it the way to farm that set's
full-arts, so it is leaner on rares. Any card has a 3% chance of being foil. On top of those, each pack makes two rolls
of its own, each of which replaces one card:

| | chance per pack | notes |
| --- | --- | --- |
| Secret Art | 1% | |
| Legendary tier 1 / 2 / 3 / 4 | 1% / 0.5% / 0.29% / 0.17% | one roll, rarest checked first |

**Opening a pack** (`packFlow.ts`) is v1's ritual: the sealed pack and an "Open
pack" button, a two-second animation of the pack turning over and unzipping
down its seam, then the cards one at a time, rarest last, ending on all five
together. A Legendary or a Secret Art gets its reveal when its turn comes. The
cards belong to the player before the sealed pack is shown, so walking away
loses nothing; the message settles on the whole pack after ten minutes.

The card images are attached to the sealed pack's message as soon as they are
drawn. A components-v2 message only shows the attachments its layout points
at, so they ride along unseen and "Next card" sends a few bytes of layout with
nothing to upload. If Discord ever refuses such an edit, the screen is sent
whole instead and the log says so.

The pack art and its animation are files in `assets/`, drawn by
`scripts/finicards/pack-art.ts`. Run that script after changing the design;
the game only reads the files.

**Population.** A card can have a per-server cap (`population`, 0 for none),
and a capped-out rarity falls down the ladder (full-art → uncommon → common).
Since 2026-10-16 no card has one - every card's population was set to 0 and the
card manager makes new cards with none - so that any player can complete a
set. Full-arts used to be held to 1 copy per server and Secret Arts to 3, which
left most full-arts claimed by whoever pulled them first. The scarce tier is
now the Legendary.

**Free packs** (`freePacks.ts`, `v2_free_pack`). A player owed one opens it
before paying for a pack. It rolls no special by chance; it holds what was
placed in it, or nothing. See **Launch**.

## Secret Arts and Legendaries

Both sit above full-art, and neither is a fourth rarity: `CardRarity` stays
three values, because the stat budget is per rarity and these carry no extra
stats.

- **Secret Art** is a card definition: a full-art with `secret_art` set, its
  own unusual artwork, and a population of 3. It prints `SA`, is found only by
  its own roll (never in the full-art slot or as dungeon loot), and is left out
  of its set's count.
- **Legendary** is a *copy*: any full-art that is not a Secret Art can come out
  of a pack Legendary, with `v2_user_card.legendary` naming the animated effect
  it carries. Each card has one Legendary per animation on a server - one
  Breathe Goku, one Storm Goku, and so on, fourteen in all - counted apart from
  its ordinary copies and printed "1 OF 1". A pack's Legendary roll picks a tier
  and an animation, then a card without that animation yet; if every card has
  it, the tier's other animations are tried. (Each card was once held to one
  Legendary per server, whatever the animation.) It prints `L1`-`L4` and is shown as a
  looping GIF (`cardArt/legendaryGif.ts`); the effects and their tiers are in
  `legendary.ts`.

A copy of a card held to fewer than five per server says which one it is under
the rarity code: "2 OF 3", "1 OF 1" (`v2_user_card.serial`).

Legendary GIFs take a few seconds to draw and are cached in the system temp
directory, keyed on everything printed on the card. A card that should have
art and came out without it is shown but not cached.

## Collection, binder and selling

`/finicard collection` pages through a player's cards ten at a time, each
with a View button; `view:Binder` shows six to a page as one picture
(`cardArt/binderPage.ts`). A binder page is a still, so the pocket of a
Legendary is lit gold and tagged "VIEW TO PLAY", and a foil's is edged and
tagged in its prism.

Selling (`market.ts`):

- **To Fini.** From any of your own cards opened with View, "Sell to Fini" and
  a confirm. Fini pays 2 / 5 / 10 for a common / uncommon / full-art, 25 for a
  Secret Art and 50 for a Legendary; a foil pays half again, rounded up.
- **To a player.** `/finicard sell card:<id> price:<fc>` offers it to
  anyone, or to one player with `who:`. To swap cards rather than sell them,
  see **Trading** below.

A sold card is taken out of every deck it was in. A card in a battle or dungeon
run that is already under way can still be sold; that is a known gap.

**Trading** (`tradeFlow.ts`). `/finicard trade with:@player give:<ids>
want:<ids> give_fc:<fc> want_fc:<fc>` offers an exchange: up to five cards a
side, plus Finicoin either way, any of it optional but not all of it. The offer
is public, with every card pictured. Only the other player can accept or
decline, and only the one who offered can cancel; it expires after ten minutes.
Nothing moves until it is accepted, and then everything is checked again -
both players must still own their cards and cover their coin - before the coin
and the cards change hands. Traded cards leave any decks they were in.

## Set numbers

Every card prints its place in its release set in the footer:
`FINICARD V1 · S3 12/217 · <copy id>`. Sets are numbered by name, then rarity,
so a character's cards sit together. Secret Arts are not counted - they are
secret - and number past the total, which is how one reads `218/217`. An
inactive card keeps its number: the gap it leaves is the hint that it exists.

`setNumbers.ts` does the numbering; the card manager renumbers after every
save, and `scripts/finicards/number-sets.ts` does it by hand.

## The card manager

```bash
bun --env-file=.env run scripts/finicards/art-check.ts --serve   # http://127.0.0.1:8765/cards/
```

A local page for the card pool: make and edit cards, set stats inside the
budget, mark Secret Arts, and choose artwork. Art can be searched from Danbooru
(which bans AI art; results before August 2022 are shown first) and from Magic
card art via Scryfall, and each candidate image keeps its own artist credit.
Every write is appended to `edits.jsonl` with what the card was before.

The bot keeps it up too, so it can be reached from the home network without
an ssh tunnel: set `FINI_CARD_MANAGER_PORT` (8765) and it is at
`http://<the machine>:8765/cards/` whenever Fini is running
(`cardManagerServer.ts`). It answers only to private addresses - the house's
network and the tailnet - and has no login of its own unless
`FINI_CARD_MANAGER_PASSWORD` is set. The art review pages are not part of it;
those still come from the command above.

## Launch

The launch migration (`scripts/finicards_v2_migrate_collections.ts`, deleted
afterwards and kept in git history) carried v1 collections into v2:

1. Wipes the v2 data made while testing: copies, decks, dungeon runs, battles.
2. Takes v1's colour off the converted cards' tags.
3. Turns every v1 battler a player owns into a v2 copy of the same card, with
   a keyword rolled for that copy. v1 legendaries come across as foil
   full-arts.
4. v1 item cards do not come across. Their owners get free packs instead, one
   per 40 items, rounded up. Each server's batch of free packs holds exactly
   one Secret Art and one Legendary, in different packs, and never in the bot
   admin's.

This was run on 2026-10-12: 2,782 copies for 15 players and 69 free packs
across two servers. It was deleted once it had run, since its first step
wipes every v2 copy; read it in git history if it is ever needed.

The `/finicard import` command that first filled the pool has been removed:
the pool is kept in the card manager, and writing the v1 conversion over it
would undo every card edited since.

## Dungeon history

Every run is kept after it ends. When one is settled its numbers are written to
its own columns - depth reached, fights and bosses won, geld earned, finicoin
paid, cards won, and when it ended - so the record does not depend on the
shape of the game's working state (`dungeonStats.ts`).

```bash
bun --env-file=.env run scripts/finicards/dungeon-stats.ts              # every year
bun --env-file=.env run scripts/finicards/dungeon-stats.ts --year 2026
bun --env-file=.env run scripts/finicards/dungeon-stats.ts --server <id> --json
```

Per year: runs and how they ended, players, the deepest run, average depth,
finicoin in and out, cards won, a table of players and the cards that won the
most fights.

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
decision the doc made deliberately, not a bug - and because keywords turned out
to be the better lever. See **Keywords and rarity**.

## Keywords and rarity

Rarity already buys a bigger spike, so it does not also buy the best keywords -
the odds run the other way. Every keyword has a **grade**, and each rarity rolls
against its own odds (`KEYWORD_ODDS` in `keywords.ts`):

| | none | minor | standard | strong | mythic |
| --- | --- | --- | --- | --- | --- |
| common | 4.5% | 10% | 50% | 35% | 0.5% |
| uncommon | 29.5% | 30% | 30% | 10% | 0.5% |
| full-art | 62.5% | 25% | 10% | 2% | 0.5% |

| grade | keywords | mirror win rate, vs a field with no keywords / with rolled ones |
| --- | --- | --- |
| minor | Momentum, First Strike, Rally, Overwhelm, Mimic, Synergy, Second Wind, Spoiler, Versatile, Edge, Grit, Relentless, Mercy | 50-56% / 43-50% |
| standard | Vanguard, Last Stand, Avenge, Underdog, Anchor, Gambit, Closer, Rival, Giant Slayer, Purist, Brace, Silence, Kinship, Trinity, Chorus, Lone Wolf, Thrifty, Grudge, Echo, Martyr, Parting Shot, Glass Cannon | 57-66% / 50-59% |
| strong | Guard, Bulwark, Pierce, Intimidate, Feint, Fortress | 68-75% / 60-67% |
| mythic | Adapt | 85% / 76% |

Measured with `bun run scripts/finicards/simulate.ts --grade`: the keyword on
all three of one side's cards, the other side either bare or carrying keywords
rolled at the real odds. The second column matters for the keywords that only
mean anything against other keywords (`Silence`, `Mimic`, `Spoiler`, `Purist`);
a lineup with no keywords at all scores about 43% there.

Four are graded above what that measures, because the simulated player neither
builds a deck around a keyword nor chooses a slot for it: `Kinship`, `Trinity`
and `Thrifty` pay for how a lineup is assembled, and `Gambit` is +5 in the one
slot a player would actually put it in.

Grades come from those measured numbers, not from how an effect reads. On the
live 263-card pool this leaves 39 of the 65 full-arts with no keyword at all.

At 0.5% a pool that size expects one Adapt card or so, and the seeded roll
happens to hand the live pool **none**. Adapt stays in the library and any new
card can roll it; to put one in play now, set `keyword` to `adapt` on a
`v2_card_definition` row by hand - but note a re-import re-rolls that row.

Why it is built this way: with the original rule - commons none, uncommons one,
full-arts anything - switching keywords on took a full-art deck's win rate
against commons from 91% to 98% and an uncommon deck's from 79% to 92%. Keywords
were pure upside for the cards already winning. With the odds above
(`--keywords`, 3000 matches per cell, multiplier 1.5):

| | keywords off | keywords on |
| --- | --- | --- |
| depth wins | 75.1% | 73.2% |
| fa vs blind | 90.5% | 79.4% |
| fa vs answer | 91.9% | 83.6% |
| mono-type | 0.0% | 0.1% |
| level rounds | 11.3% | 10.1% |

So keywords now *narrow* the rarity gap rather than widen it, and full-arts keep
the inherent stat edge they are meant to have. `Underdog` does a lot of that
work: it is dead on a full-art and worth +3 on a common exactly when it faces
something rarer.

The simulated player does not slot cards by keyword (it will not put a Vanguard
in slot 1), so placement keywords are somewhat stronger in real play than the
sweep shows.

**Keywords are rolled per copy, not per card.** A copy rolls its keyword at its
rarity's odds when it is made - pulled from a pack, dropped by a boss
(`rollCopyKeyword` in `cardStore.ts`) - and keeps it for good, on
`v2_user_card.keyword`. Two copies of the same card can carry different
keywords, which is the point: the pairings of card and keyword are what make a
collection varied. A dungeon enemy rolls one the same way when its room is
built. `v2_card_definition.keyword` is left over from the first design, where
the keyword was fixed per card; nothing reads it, and the import blanks it.

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
| `practice.ts` | What makes a battle a practice battle, and how its two hands are dealt. |
| `dungeon.ts` | Pure dungeon rules: the dials, rooms and doors, fights, events, shops, buffs, cooldowns, payouts. |
| `dungeonTutorial.ts` | The dungeon tutorial's script, cast and coach; replays a list of moves through the engine. |
| `tutorialArt.ts` | The tutorial cast's artwork, hand-drawn SVG as `data:` URLs. |
| `dungeonStore.ts` | The run lifecycle: one `act` per click, and its guards against stale or replayed ones. |
| `cardArt/dungeonScene.ts` | The picture of the current room - fight, shop, event - or the doors out of it. |
| `dungeonFlow.ts` | The entry fee, settling a finished run, and the one builder for a run's message. |
| `dungeonStats.ts` | A finished run's summary, and the roll-up of runs by year. |
| `decks.ts` | Deck CRUD, auto-building with filters, the minimum size, and loading a deck for play. |
| `cardPages.ts` | A set of cards as pages, list or binder. The collection and `deck show` are both this. |
| `draw.ts` | Dealing a hand and validating a lineup against it. |
| `lineupPicker.ts` | The three-click lineup picker and its custom-id encoding. |
| `battleFlow.ts` | The shared accept-and-reveal step. |
| `packs.ts` | Pack odds, prices, set packs, foil rolls, population limits, and the Secret Art and Legendary rolls. |
| `packFlow.ts` | Opening a pack: the sealed pack, the animation, one card at a time. |
| `freePacks.ts` | Packs a player is owed, and placing each server's guaranteed specials among them. |
| `legendary.ts` | The Legendary effects, their tiers and odds. |
| `market.ts` | What Fini pays for a card, and handing a sold card over. |
| `sellFlow.ts` | `/finicard sell`. |
| `setNumbers.ts` | A card's place in its release set. |
| `assets/` | The pack art and its opening animation, the type emoji and their ids. |
| `cardArt/legendaryGif.ts` | Legendaries as animated GIFs, and the pull reveal. |
| `cardArt/binderPage.ts` | A page of the binder. |
| `cardArt/packOpening.ts` | Reads the pack art and animation from `assets/`. |
| `wagers.ts` | Finicoin escrow, the jackpot rake and pot splitting. |
| `expireBattles.ts` | The defender-timeout sweep, run from the minute poll. |
| `ui/` | Discord message building: containers, galleries, accents, and the copy that explains the mechanics. |
| `cardArt/handStrip.ts` | The one-image-per-hand landscape layout. |
| `renderBattle.ts` | The two text renderers components can't improve on: the monospace card face (image-render fallback) and the id-bearing collection list. |
| `cardArt/` | Card image rendering: palettes, per-template geometry, text fitting, generated blocks. |
| `templates/` | The five card templates. `templates/mockups/` holds the original designs. |

Surface files outside the module: `commands/finicard.command.ts` and its
subcommands in `commands/finicard/`, `buttons/individualButtons/finicard*.button.ts`,
`queries/queryFunctions/finicard{Collection,Binder}.query.ts`,
`types/PocketbaseTablesV2.ts`, the tools in `scripts/finicards/`, and
`tests/finicards/`. The card manager the bot serves is inside the module, in
`cardManager/`; its working files live in `scripts/test_images/` (see `workDir.ts`).

Buttons answered by a collector on their own message - the pack's, and
`/finicard sell`'s - are listed in `buttons/buttonHandler.ts` so the router
leaves them alone; without that it answers "unknown button" first and uses up
the press.

---

## Adding a keyword

A keyword is a data row plus one hook. The engine is never edited, no migration
runs, and cards reference it by slug — so a card already carrying the slug picks
the keyword up the moment it registers.

```ts
registerKeyword({
  name: "Kindred",
  slug: "kindred",
  grade: "standard",      // decides how often each rarity rolls it
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

`registerKeyword` rejects a duplicate slug, an unknown stage or grade, or a
definition with no hook — all three of which would otherwise fail *silently*, the keyword
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

`tests/finicards/keywordExtensibility.test.ts` registers four keywords from
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
Both examples reproduce exactly; `tests/finicards/battleEngine.test.ts` pins
them.

**Round draws** — count for neither side and break an `Avenge` chain (a draw is
not a loss).

**Dungeon failure cost** → a lost fight ends the run and halves its geld; the
fee is never refunded. A drawn fight is a stalemate, not a loss. A failed event
costs a door, not the run.

**Fixed vs procedural rooms** → procedural and endless. Enemies are pool cards
with depth-scaled points on top, outside the stat budget on purpose.

**Skill checks** → events: a card's stat plus a d6 against a target. Fights are
still plain battles.

**Dungeon card rewards** → boss drops, banked and granted at the end of the
run: uncommons first, full-arts only deep in. A pack returns about 0.15
full-arts per 15 fc; a typical deck played well gets about 0.05 from a run.

**Wagers** — not in the doc, added because battles were listed as an economy
source with no mechanism. Both sides escrow into the Reserve, and **10% of every
decided pot is raked into the server Jackpot** (`RAKE` in `wagers.ts`), so a
wagered battle is a net *sink* for the players while the coin stays in
circulation — it comes back through `rollJackpot`. Nothing is minted:
`jackpotCut + payout === pot`, which `tests/finicards/wagers.test.ts` pins.
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
by how much; the derivation sits underneath as a small table, one row per
attack, with the matchup and the bonuses named in small text below it:

````
`R1` **Aya +1** · 🧠 Hinata Hyuga **1** – 0 Sudden Nico Robin 🧠
```
                   Attack  Defence  Dmg
Hinata Hyuga       7       6          1
Sudden Nico Robin  6+3=9   7+2=9      0
```
-# 🧠 Wit mirror — no bonus, the higher stat wins · Hinata Hyuga: Bulwark +2 def · Sudden Nico Robin: Giant Slayer +3
````

It replaced one compressed line (`7 − 6 Wit +Bulwark +2 def vs 9 − 9 Wit +Giant
Slayer +3`) that put each bonus on its own card's attack: a `Bulwark` read as
part of Hinata's swing when it raised the defence Robin hit, and Giant Slayer's
+3 read as still to be added to a 9 that already held it. In the table every
bonus sits in the cell it changed. It is a code block because Discord renders
no markdown tables; the engine keeps each defence's parts on `SideCombat.defense`
for it, and a round stored before that shows the defence as a plain total.

All three rounds live in one block with one separator - three bordered sections
for three rounds reads as three times the content. The full sentence-by-sentence
working is still available behind a **Full breakdown** button, ephemeral, so
asking for it costs nobody else any screen space.

Two details worth keeping: the round's winner leads the line (an earlier version
marked every round `✅`, which read as "you won this one" regardless of who did),
and negative damage is parenthesised, because `4 – -4` is hard to parse.

**Never make them scroll to decide.** The lineup picker repeats the opposing hand
as a compact line (`🟠 Vegeta 10 · 🔵 Bulma 9 · …`), because the read is the whole
decision and the reveal may be several messages up by then.

**Keywords are named on the card and explained once.** Most keywords pay off in
one slot and are dead in another, so the picker names each card's keyword on its
button, in its slot and on the opposing chips, with one legend line per keyword
in play. The battle board then shows what happened: a bonus that landed is lit
above the card's name (`VANGUARD +3`), a keyword that sat idle is dimmed.

### One constraint worth knowing

A message created with `IsComponentsV2` **cannot** carry a plain `content` field,
and cannot be converted back. The lineup picker is edited on every click, so it
is V2 from its first reply and every update path - including each error - goes
through a container. `ui/notice.ts` exists for exactly those one-line paths.

### Hand size

Set per battle: `/finicard battle draw:4`. Range is `MIN_HAND_SIZE`
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

Portrait cards are still the real card: `/finicard card` and pack pulls use
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
| common | `card-common`, prints `C` | `card-common-foil` (gold border), prints `FC` |
| uncommon | `card-uncommon`, prints `U` | `card-uncommon-foil` (holo border), prints `FU` |
| full_art | `card-special` (prism), prints `FA` | `card-special` |

A Secret Art prints `SA` and a Legendary `L1`-`L4` in the same corner, both on
the full-art frame.

That gives the cosmetic axis something visible to do while never touching a stat,
which is what the doc wants foil to be. Full-arts already have the top frame, so
foil changes nothing for them. Remap in `layoutFor` if you'd rather.

**Common and uncommon are the redrawn dark frames.** Their originals are
`templates/mockups/card-common-v2.svg` and `card-uncommon-v2.svg`. They are drawn
in 606x849 units where the other three are still 320x448, so each layout carries
its own `width`. Two things they do that the first set does not: art taller than
its window is kept from the top (`artAnchor`), and a long name is set smaller
before it is cut (`name.minSize`). The uncommon's frosted panel is the scene
drawn once and reused blurred, so the artwork is only embedded once.

The two foils are those same frames with a foil border and a sheen
(`card-common-foil`, `card-uncommon-foil`), built from them rather than drawn
separately, so a card's art crops identically whether or not the copy is foil.
`card-rare.svg` and `card-double-rare.svg` are the first set's foil frames and
are no longer used. The full-art frame is unchanged.

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

**The footer** reads `FINICARD V1 · S3 12/217 · <copy id>`: where the card
comes from, its set and set number, and the copy's id. Commons and uncommons
credit the artist at its right-hand end.

**Type emoji.** Power, Wit and Heart are three custom emoji belonging to the
bot's own Discord application - circles in the card colours, carrying the
battle board's glyphs. Their ids are in `assets/emoji.json`, written by
`scripts/finicards/emoji.ts --upload`; without that file the standard
circles stand in. A custom emoji is some thirty characters of text, so a tally
of more than eight cards is counted (`🟠 12 · 🔵 9`) rather than drawn out.

**Card emoji.** `CARD_EMOJI`, the site's favicon as an emoji in the same file,
marks packs, collections and shown cards; 🎴 stands in without it. Uploading
replaces an emoji with a new id, so pass only the ones that changed:
`emoji.ts --upload card`.

**Where images appear:** `/finicard card` (with the text face as fallback),
`/finicard pack` (one card at a time, then all five), the collection's
binder, the battle **reveal** (both hands) and the match **result**
(`cardArt/battleBoard.ts`, with the text result as its fallback).

---

## Deliberately not built

- **Keyword-aware deck building.** `deck build` still ranks by stats alone and
  does not know a keyword is worth anything.
- **Cooldowns and set completion.** Phases 3–6. The schema carries `cost`,
  `tags`, `keyword` and `set_piece` from day one, so none of them needs a
  migration across a live collection.
- **Fusion.** v1's `/fuse-cards` has no v2 counterpart.
- **Collection filtering and sorting.** The collection is newest first and
  that is all. Planned as the first follow-up after launch; `cardPages.ts` is
  where it goes, and decks get it for free.
- **An animated binder page.** A page holding a Legendary is a still with a
  marked pocket.
- **Item-gated cards.** Exodia, Shenron and Super Sonic are meant to be earned
  through unique item cards. They are inactive until that exists.
- **Holding a card that is in play.** A card in an open battle or dungeon run
  can be sold out from under it.
- **Dungeon extras.** Rotating conditions (*commons only*, *no cards above cost
  3*), card cooldowns after a run, a mulligan and a daily run limit are all in
  the doc and all left out of the first cut. Conditions are a filter on the deck
  before the deal; cooldowns need a column on `v2_user_card`.
- **Recovering a run that ended but was never paid.** If the process dies
  between a run's last room and its payout, the run is finished with no reward
  recorded and nothing retries it. `settleRun` is safe to call on it by hand.
- **Mulligans.** The doc offers one free redraw and lists extra redraws as a
  Finicoin sink. Left out because a redraw after the reveal leaks information -
  you would be rerolling against a known hand - and a redraw before it reopens
  the draw-fishing hole that dealing both hands together closes. Worth designing
  deliberately rather than bolting on.
- **Deck cost budgets.** Phase 3. `cost` is populated on every card, so it needs
  no migration.

## On the web

Players can browse their collection and build decks on a site, signed in with
Discord. Fini's database is never exposed for it: `webSync/` copies
collections out to a public Pocketbase and takes deck requests back, over
connections Fini opens. It is off unless `FINI_WEB_POCKETBASE_URL` is set.
The site, its schema and the setup steps are in [`web/`](../../web/README.md).
