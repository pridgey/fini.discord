# Dailies

Games with one round a day for everyone, which go up at noon Mountain time
(`POST_HOUR` in `shared.ts`). A round stays open until the next one goes up.

## The daily post (`post.ts`)

One message a day in each server's bot channel (`/config bot_channel`),
however many games there are and however many people play. Servers without a
bot channel are skipped. It's two cards:

- **Yesterday:** each game's answer and its top three, with an empty line
  between games, over **one image** of every game's solved state side by
  side - the map of everyone's guesses beside the solved Weave grid, scaled to
  one short strip (`recapImage`) so the post doesn't grow tall as games are
  added.
- **Today:** each game, what it pays, and a live line - "Played by 4 · best
  **Aya** 214 fc", "Solved by **Aya** (7 guesses), **Fen** (12) · 6 playing" -
  which the bot keeps current by editing the post a few seconds after someone
  plays (plays close together share one edit). A button for each game opens it
  privately.

The post is rebuilt from what's stored each time; an edit sends only the cards,
so the image it was posted with stays. It's recorded on every game's round as
the server's post, marked `combined`; the live line only ever edits a post
marked that way, never a game's own post from before. A new daily adds a
recap paragraph, a picture in the strip, a today paragraph and a button.

**Finishing a game** - locking in a location guess, or finding Weave's last
word - is also announced in a small card in the same channel, with a button
linking back to the day's post (`announceFinish`). The game handlers report
plays through `dailyPlayed`, which updates the live line and announces.

`/daily <game>` opens a game for anyone who'd rather type. `/geo-test
post-daily` (bot admin) sends the day's post early, and `/geo-test
repost-daily` sends it again in the current layout, removing the old one.

Rounds and plays live in Pocketbase; their migrations are in `pb_migrations/`.

## Where in the world (`geo/`)

Street photos from Mapillary (Panoramax without `MAPILLARY_TOKEN`); players
type a place or coordinates, check it on a map, and lock in one guess. Paid on
a ladder of checks - hemispheres, continent, country, province, town - and
closeness, up to 220 fc, more for rounds with fewer photos. `judge.ts` has the
rules; `geo/daily.ts` the posting and paying.

## Weave (`weave/`)

A word puzzle in the spirit of LinkedIn's Wend, with a twist of its own: the thread.

Live since 2026-10-16. `WEAVE_LIVE` in `weave/daily.ts` puts it back on
trial: left out of the daily post, only the bot admin can play it (`/daily weave` makes the
day's puzzle on demand), and boards pay nothing.

- **The grid.** 5x5 letters hold five hidden words of 4 to 6 letters that use
  every letter exactly once, each running up, down, left or right
  (`puzzle.ts`: one path through all 25 squares, cut into five pieces, a word
  fitted to each).
- **The thread.** The words' first letters spell a sixth, five-letter word -
  in some order: the generator hands the thread's letters to the words at
  random, so the grid gives no hint of the order, and the thread is an anagram.
  The board shows which of its letters are showing, alphabetically, never where
  they go. A letter shows when its word is found or hinted. A player gets one
  guess, paying 50 fc with no letters showing, then 25, 20, 15 and 10 with one
  to four - so hinting toward the thread costs as much as finding words does.
  With all five showing it can't be guessed.
- **Playing.** `/daily weave` (or the post's "My board" button) shows a
  player's board, privately: the grid as an image (`render.ts`) with found
  words coloured along their paths and a hinted first letter ringed, the words
  as blanks with their lengths (shortest first, not in grid order), and the
  thread's letters so far. Buttons open a box to guess words - one or several
  at once - or the thread, and take a hint. A word counts if it's one of the
  five, wherever it's spelled. Boards save as they go.
- **Pay.** 5 fc a word (3 if its hint was taken), paid as each is found, and
  up to 50 for the thread: up to 75 fc. The board says what's still possible,
  which hints and showing letters bring down. Solving every word puts the
  player in the daily post's live line, with how many words they guessed,
  right or wrong.
- **Words.** `words.ts` is everyday English: the 10,000 most common US words
  without swears, kept if the system dictionary has them and doesn't list them
  capitalised (dropping most names), less a short blocklist.
