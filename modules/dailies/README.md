# Dailies

Games with one round a day for everyone, posted at noon Mountain time
(`POST_HOUR` in `shared.ts`) in each server's bot channel (`/config
bot_channel`). Servers without a bot channel are skipped. A round stays open
until the next one goes up. Each new round is posted after the last one's
answers and leaderboard. `/daily <game>` brings the current round back for
anyone who missed the post, and `/geo-test post-daily` (bot admin) posts the
day's rounds early.

Rounds and plays live in Pocketbase; the migrations are tracked in each game's
`migrations/` folder, since `/pb_migrations` is gitignored.

## Where in the world (`geo/`)

Street photos from Mapillary (Panoramax without `MAPILLARY_TOKEN`); players
type a place or coordinates, check it on a map, and lock in one guess. Paid on
a ladder of checks - hemispheres, continent, country, province, town - and
closeness, up to 220 fc, more for rounds with fewer photos. `judge.ts` has the
rules; `geo/daily.ts` the posting and paying.

## Weave (`weave/`)

A word puzzle in the spirit of LinkedIn's Wend, with a twist of its own: the thread.

**On trial** while `WEAVE_LIVE` in `weave/daily.ts` is off: it isn't posted,
only the bot admin can play it (`/daily weave` makes the day's puzzle on
demand), and boards pay nothing and announce nothing. Turn it on to go live.

- **The grid.** 5x5 letters hold five hidden words of 4 to 6 letters that use
  every letter exactly once, each running up, down, left or right
  (`puzzle.ts`: one path through all 25 squares, cut into five pieces, a word
  fitted to each).
- **The thread.** The words' first letters spell a sixth, five-letter word -
  in some order: the generator hands the thread's letters to the words at
  random, so the grid gives no hint of the order, and the thread is an anagram.
  The board shows which of its letters have been found, alphabetically, never
  where they go. A player gets one guess, worth 15 fc - but only while a word
  is still hidden, since with every word found all five letters are showing.
- **Playing.** `/daily weave` (or the post's "My board" button) shows a
  player's board, privately: the grid as an image (`render.ts`) with found
  words coloured along their paths and a hinted first letter ringed, the words
  as blanks with their lengths (shortest first, not in grid order), and the
  thread's letters so far. Buttons open a box to guess words - one or several
  at once - or the thread, and take a hint. A word counts if it's one of the
  five, wherever it's spelled. Boards save as they go.
- **Pay.** 5 fc a word (3 if its hint was taken), paid as each is found, and
  15 for the thread: up to 40 fc. Finishing every word is announced in the
  channel.
- **Words.** `words.ts` is everyday English: the 10,000 most common US words
  without swears, kept if the system dictionary has them and doesn't list them
  capitalised (dropping most names), less a short blocklist.
