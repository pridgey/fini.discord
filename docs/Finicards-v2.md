# Card Game — Design Document

**Status:** Draft v0.1
**Purpose:** Source of truth for mechanics, data schema, and roadmap. Sections marked 🔶 are unresolved.

---

## 1. Design Pillars

**1. A bigger collection means more right answers, not bigger numbers.**
Power is contextual, never absolute. Every card is strong somewhere and weak somewhere else. The player with 300 cards wins because they always have the answer, not because their top six are stronger.

**2. Decisions happen before the match, not during it.**
Combat auto-resolves. All strategy lives in card selection and ordering. This makes matches fully asynchronous — critical on Discord, where opponents are rarely online simultaneously.

**3. Adding a card is adding a data row.**
No card should require new code. Identity comes from stat distribution × type × tags × keywords, all of which are data.

**4. Rarer is more exciting, not more powerful.**
Rare cards are specialists: devastating in their lane, exploitable outside it. This is enforced by math, not by restraint.

### What this game is _not_

- Not a live/turn-based battler. No waiting on the opponent to act.
- Not a stat-ladder game. There is no "best card."
- Not a bespoke-ability game. No card gets unique code.

---

## 2. Card Schema

```json
{
  "id": "goku_001",
  "name": "Goku",
  "series": "Dragon Ball",
  "rarity": "uncommon",
  "power": 9,
  "wit": 3,
  "heart": 3,
  "type": "power",
  "tags": ["shonen", "martial-artist", "hero"],
  "keyword": "momentum",
  "cost": 3,
  "set_piece": null,
  "art_url": "...",
  "foil": false
}
```

- `type` is derived: the highest stat. Ties broken by author choice (store explicitly to avoid ambiguity).
- `cost` is for future deck-budget and dungeon-restriction use. Populate now even if unused.
- `set_piece` names the collection set a card belongs to (e.g. `"dragon_balls"`), or null.
- `tags` drive event/dungeon restrictions and future synergies. Be generous — they're free to add and expensive to retrofit.

### Stat totals by rarity

**All cards total 15 points.** Rarity governs the maximum spike, not the total.

| Rarity   | Max single stat | Example spreads     | Feel                                     |
| -------- | --------------- | ------------------- | ---------------------------------------- |
| Common   | 7               | 5/5/5, 6/5/4, 7/5/3 | Rounded, reliable, no holes              |
| Uncommon | 9               | 8/4/3, 9/3/3        | Real teeth, one soft spot                |
| Full-art | 12              | 10/3/2, 12/2/1      | Devastating in lane, wide open elsewhere |

The self-balancing property: **your dump stats are your defensive holes** (see §3). A 12/2/1 card is a wall against Power attackers and gets shredded by anything attacking Wit. Chasing it is worth it; owning it doesn't win matches alone.

🔶 **Open:** whether full-art is also a _cosmetic_ tier or purely a power tier. Recommendation below.

### Proposed: Foil as a separate cosmetic axis

Rather than making full-art carry both the power spike and the prestige, add **Foil** — a cosmetic variant that can roll on _any_ card at any rarity. Same stats, different frame, visible on profile. Optional perks that don't touch balance: shorter cooldown, small Finicoin bonus on wins, showcase slot.

This gives an infinitely printable chase item that can never cause power creep, and it decouples "the thing people brag about" from "the thing that wins games." Flagged as a proposal — the alternative is keeping three tiers and letting full-art be both.

---

## 3. Battle System

### Types

**Power > Wit > Heart > Power**

Brute force overwhelms cleverness. Cleverness exploits passion. Passion overcomes strength.

### Match structure

1. Challenger initiates. Bot displays the defender's **type composition** (e.g. 🔴🔵🟢) but **not slot order**.
2. Challenger submits three cards in order.
3. Defender is notified, sees the challenger's composition (not order), submits three cards in order.
4. All three rounds resolve simultaneously. Slot 1 vs slot 1, slot 2 vs slot 2, slot 3 vs slot 3.
5. Most rounds won takes the match.

Defender submitting second is deliberate — a small compensation for not choosing when the fight happens, and an incentive to accept challenges.

🔶 **Open:** timeout behavior if the defender never responds. Options: auto-forfeit, auto-lineup from their best available, or the challenge expires with no result.

### Clash resolution

Both cards attack simultaneously. Each attacks with its **type stat**. Each defends using **the stat matching the incoming attack**.

```
damage = (attacker's type stat × multiplier) − (defender's value in that same stat)

multiplier = 1.5   attacker's type beats defender's type
             1.0   same type
             1.0   attacker's type loses to defender's type
```

There is no penalty multiplier. Being countered means the _opponent_ gets 1.5×, not that you get reduced. One dial instead of two.

Higher damage wins the round. Damage is not floored — negative values are legal and simply lose. Equal damage is a round draw, counting for neither side.

**Match tiebreaker:** rounds won → total damage dealt (floored at 0 per round for this purpose only) → 🔶 draw or defender wins, undecided.

### Why auto-resolve

If players picked a stat each round, the card would be a wrapper around rock-paper-scissors and the collection would barely matter. Baking the stat into the card means _choosing a card is choosing a stat_ — so the collection is the option pool, and depth is directly a strategic advantage.

🔶 **Held in reserve:** dual-type cards, where a card lists a primary and secondary type and the player picks which it attacks with at lineup time. Still pre-match, still async. Clean bolt-on if the base game feels too passive. Much easier to add a choice later than to remove one.

### Worked example

**Fen:** Oathbound Knight (Heart, 4/4/7) → Wandering Trickster (Wit, 3/9/3) → Ironclad Brawler (Power, 6/5/4)
**Rho:** Storm Caller (Power, 9/3/3) → Quiet Scholar (Wit, 5/5/5) → Blazing Heir (Heart, 1/2/12)

| Round | Matchup                         | Fen               | Rho                 | Winner |
| ----- | ------------------------------- | ----------------- | ------------------- | ------ |
| 1     | Knight (H) vs Storm Caller (P)  | 7×1.5 − 3 = **7** | 9 − 4 = **5**       | Fen    |
| 2     | Trickster (W) vs Scholar (W)    | 9 − 5 = **4**     | 5 − 9 = **−4**      | Fen    |
| 3     | Brawler (P) vs Blazing Heir (H) | 6 − 1 = **5**     | 12×1.5 − 4 = **14** | Rho    |

**Fen wins 2–1.**

Three things this demonstrates:

- A **common** beat an **uncommon** in round 1 by being pointed the right way — not by being stronger.
- In a mirror matchup, the specialist always beats the generalist. That is the generalist's tradeoff for flexibility.
- The full-art won its round by the widest margin on the board and still lost the match.

And the counterplay: had Fen placed the Trickster in slot 3, it would attack Blazing Heir's Wit of 2 — `9×1.5 − 2 = 11` against the Heir's `12 − 3 = 9`. Beating the best card in the game requires a _specific answer_, and owning that answer is what makes a deep collection valuable.

**Emergent property:** mono-type lineups lose 3–0 to their counter type. No rule needed — the math punishes it.

### Tuning dials

| Dial                | Default | Effect                                                                                                                  |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Type multiplier** | 1.5     | The single number defining game feel. Toward 2.0 = type dominant. Toward 1.25 = stats dominant. Expect extended tuning. |
| **Stat total**      | 15      | Flat across rarities. Could let rares run 1–2 higher if they feel weak; flat is safer.                                  |
| **Spike ceiling**   | 12      | How extreme full-arts get. 10 is tamer.                                                                                 |
| **Rounds**          | 3       | Right for a Discord message. 5 rewards depth but bloats output.                                                         |

---

## 4. Keywords

Commons are pure stats. Uncommons get one keyword. Full-arts get a keyword plus the spiky profile.

Design constraint: **every keyword should make slot placement matter.** This creates lineup-building depth with no new resolution math.

| Keyword        | Effect                                                                            | Tier     |
| -------------- | --------------------------------------------------------------------------------- | -------- |
| `Vanguard`     | +3 to type stat while in slot 1                                                   | Uncommon |
| `Last Stand`   | +3 to type stat while in slot 3                                                   | Uncommon |
| `Rally`        | If this card wins its round, the next card in the lineup gets +2 to its type stat | Uncommon |
| `Momentum`     | +1 to type stat per round already won this match                                  | Uncommon |
| `Avenge`       | +3 to type stat if the previous round was a loss                                  | Uncommon |
| `Guard`        | Opponents get no type multiplier against this card                                | Uncommon |
| `Bulwark`      | +2 to all three defensive stats                                                   | Uncommon |
| `Pierce`       | Ignore 3 points of the defender's defensive stat                                  | Uncommon |
| `First Strike` | If this card would lose its round by 2 or less, the round is a draw instead       | Uncommon |
| `Underdog`     | +3 to type stat if the opposing card is a higher rarity                           | Uncommon |
| `Adapt`        | This card's type counts as whatever beats the opposing card's type                | Full-art |
| `Overwhelm`    | Damage dealt above 10 counts double toward the match tiebreaker                   | Full-art |

Implementation note: keywords resolve in a fixed order — placement bonuses (`Vanguard`, `Last Stand`) → conditional bonuses (`Momentum`, `Avenge`, `Underdog`) → type/multiplier modifiers (`Adapt`, `Guard`) → damage calculation → post-round effects (`Rally`). Lock this order early; ambiguity here is where balance bugs live.

`Rally` illustrates the design goal well: it only pays off in slots 1 or 2. `Last Stand` is dead outside slot 3. A card's value depends on where you put it, which is a second strategic axis layered on top of type matching.

---

## 5. Dungeons

Same battle engine, no second system. A dungeon room is one or more enemy cards with fixed stats and types.

**Structure:**

1. Player draws 6 cards from their deck.
2. One free redraw (mulligan) before starting. 🔶 Additional redraws for Finicoin?
3. Dungeon is 4–5 rooms. Enemy cards are revealed openly.
4. Player assigns cards from hand to answer each room. **Cards exhaust when used** and are unavailable for the rest of the run.
5. Clearing all rooms grants rewards.

Six cards against four or five rooms gives slack but not much — the resource-allocation puzzle is "do I burn my best card on room 2 or save it for the boss?"

🔶 **Open:**

- Failure cost — lose the run entirely, keep partial rewards, or lose only the entry fee?
- Are rooms fixed (authored) or procedural (drawn from a pool)? Fixed is better content, procedural is better replay value.
- Are skill checks a separate encounter type, or is everything a battle? _Recommendation: everything is a battle. Reusing the three stats is a feature; a fourth axis is scope creep._
- Mid-run resources — relics, buffs, extra draws?

### Rotating conditions

Dungeons and events carry modifiers: _Magic-tagged only_, _Heart damage doubled_, _no cards above cost 4_, _commons only_.

This is the mechanic that makes breadth matter — someone with 300 cards always has a legal lineup, someone with six great cards is locked out half the time. It is also the cheapest content in the game: a new modifier is one line and it re-contextualizes the entire existing card pool.

### Cooldowns

Cards used in a dungeon go on cooldown for N hours. 🔶 Value TBD; start around 4–6.

Cooldowns are what give collection _depth_ a direct daily value, and they resolve the "does drawing 6 from a deck negate deckbuilding?" concern — you need a deep, redundant deck rather than six perfect cards.

---

## 6. Set Collection

Sets (e.g. the seven Dragon Balls) reward completion with a unique card.

**Design rule: set rewards are structurally weird, not statistically strong.** Weird beats strong, and weird can't be power-crept. Examples:

- Ignores type disadvantage entirely
- Counts as every tag for condition-locked events
- Occupies zero deck-cost budget
- Cannot be countered by `Adapt`

🔶 **Open:**

- Are pieces playable on their own, or dead weight until completed? _Recommendation: playable, weak, with a shared tag so they have niche synergy value._
- Does completion consume the pieces?
- Is the reward deterministic or a roll? _Recommendation: deterministic. A roll after that much work is cruel._

---

## 7. Economy

Currency is **Finicoin** — fake, server-internal, no real money at any point.

**Known problem:** Finicoin is heavily inflated (members hold thousands) with only one sink (packs). Battles and dungeons are an opportunity to add sinks without a wipe.

| Sinks              | Sources                            |
| ------------------ | ---------------------------------- |
| Card packs         | Existing server economy            |
| Dungeon entry fees | Dungeon clears                     |
| Extra mulligans    | Battle wins                        |
| Cooldown skips     | Selling unwanted cards (price low) |
| Card power-ups 🔶  | Daily/event participation          |
| Trade tax          | Set completion bonuses             |

Sell-back is a _source_ — price it low enough that it isn't a farm, high enough that duplicates aren't dead weight.

🔶 **Open:** duplicate handling. Options: sell-back only, shard system feeding into targeted crafting, or direct card power-ups. A crafting/shard system is the strongest answer to "I pulled a dupe" disappointment but is meaningful extra scope.

### Trading

Enabled, with guardrails against alt-account farming:

- 🔶 Duplicates only, or unrestricted?
- 🔶 Level or activity gate before trading unlocks
- **Public trade log posted to a channel** — recommended regardless. Handles most abuse socially rather than technically.
- 🔶 Finicoin tax on trades (also an economy sink)

---

## 8. Roadmap

**Phase 1 — Battles (ship first)**
PvP only. Three-card lineups, no keywords, no deck construction — pick 3 from your collection and fight. Composition visible, order hidden. Auto-resolve.

Goal: find out whether the type-plus-stat feel is fun before building anything on top of it. Testable in roughly a week. This is the priority because the collection system is already live and stalled — battles are what unblock it.

**Phase 2 — Keywords**
Add the keyword library. No schema change if `keyword` is populated from day one.

**Phase 3 — Decks & cooldowns**
Deck construction, cost budgets, cooldown timers. Makes collection depth pay off daily.

**Phase 4 — Dungeons**
PvE runs on the existing engine. Rotating conditions. Entry fees and reward tables.

**Phase 5 — Economy & trading**
Sinks, sell-back, trading with guardrails, duplicate handling.

**Phase 6 — Social**
Channel drops (cards appearing in-channel for anyone present to claim), raid bosses (shared HP pool, everyone contributes one card). These are the growth engine — they turn solo collecting into a shared event and are the reason bots like this spread between servers.

**Critical:** the card schema must include `cost`, `tags`, `keyword`, and `set_piece` from Phase 1, even though nothing reads them until Phase 2+. Retrofitting a schema across a live collection is the most avoidable pain in this project.

---

## 9. Open Questions Log

**Battle**

- Defender timeout behavior?
- Match tiebreaker when rounds _and_ damage are equal?
- Does the loser's card suffer anything persistent, or is it purely a match result?
- Rated ladder / ELO, or casual only?

**Cards**

- Full-art as power tier, cosmetic tier, or both? (Foil proposal in §2)
- Do cards level up or gain XP from use?
- Are stats assigned by lore power or purely by rarity budget? (Recommendation: rarity budget only — lore-based stats collide with rarity tiers immediately and produce endless arguments)
- Type-tie resolution when two stats are equal

**Dungeons**

- Failure cost
- Fixed vs procedural rooms
- Mid-run resources
- Retry limits / daily energy

**Economy**

- Duplicate handling
- Trading restrictions
- Cooldown duration
- Pity counter on packs?

**Content**

- Card count at launch
- Art source and style consistency across series
- Characters per series — deep rosters vs wide coverage

---

## 10. Legal Note

No money is involved at any point. This is a non-commercial hobby project.

Non-commercial status is not a legal safe harbor — it is one factor in fair use, and infringement does not require profit. What it does buy is that no rights holder is motivated to act. Realistic worst case is a DMCA takedown of the art host, not litigation.

Cheap insurance:

- Host art somewhere you control, so a takedown is an inconvenience rather than a dead bot
- Never imply official affiliation
- Keep the ability to swap a series out
- **Do not cross the money line.** Donations, Patreon perks, or premium currency flip this into the commercial bucket. If a Ko-fi ever exists, decouple it completely from in-game benefits.

Original or commissioned art is preferable where feasible — it also solves style consistency, which is a real aesthetic problem when a _Sailor Moon_ card sits next to a _Dark Souls_ card.
