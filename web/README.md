# Finicards on the web

A site where players browse their Finicards collection and build decks,
signed in with Discord. Packs, selling, trades and battles stay in Discord:
nothing here can spend Finicoin or move a card.

## How it fits together

Fini's database is on a home machine and is never reachable from the
internet. The site works from a copy.

```
 browser ──────► web mailbox ◄────── Fini
 (Vercel)        (public Pocketbase)  (home machine)
                 copies of cards and decks,
                 and a queue of requests
```

- **The mailbox** is a public Pocketbase (Pockethost). It holds copies of
  collections and decks, and a queue of requests. It is not the source of
  truth for anything.
- **Fini** signs in to the mailbox as a superuser. Every 15 seconds it sends
  whatever changed in its own database, and it listens for requests. Both are
  connections Fini opens outward.
- **The site** reads the mailbox. To change a deck it leaves a request; Fini
  checks the request against its own database as if a stranger had typed it,
  does it or refuses it, and writes the answer back. Against a local mailbox a
  save comes back in well under a second; a hosted one adds its own latency.

A player is matched to their cards by Discord id. Pocketbase records that id
itself at sign-in (`_externalAuths`), and both the mailbox's access rules and
Fini read it from there, so nothing a browser sends decides who it is.

What a compromised or misbehaving site could do: ask for deck changes, which
Fini refuses unless they are the signed-in player's own cards and decks. What
it could expose: the copies in the mailbox, which are card collections.

## Where things are

| Path | What |
|---|---|
| `web/src/` | The site: Vite, React, TypeScript |
| `web/src/lib/cards.ts` | Filtering, sorting and deck checks. Pure, tested in `tests/web/` |
| `web/pocketbase/pb_migrations/` | The mailbox's schema and access rules |
| `modules/finicardsV2/webSync/` | Fini's half: sending copies, answering requests |
| `scripts/finicards_v2_web_schema.ts` | Applies the mailbox's schema over its API |
| `scripts/finicards_v2_web_sync.ts` | Runs the sync without the bot |
| `scripts/finicards_v2_web_dev_login.ts` | Sign-in link for a local mailbox |

The site imports nothing from outside `web/`. Deck limits, keyword text and
Legendary effects are sent by Fini (`web_meta`), so the two cannot disagree.

Cards are the same pictures Discord shows: Fini renders each copy's face and
sends it up (about 45 KB a copy, so roughly 140 MB for the 3,000 copies at
launch). Faces are rendered 150 a pass so the bot stays responsive, which
makes the first send take several minutes; until a copy's face arrives the
site draws a stand-in from its artwork and stats. A Legendary is sent with
its animation too (a GIF of 2 to 3 MB), which plays when the card is opened.

The deck builder draws its cards from their artwork and stats on purpose: at
the size a deck is built at, the real card's text cannot be read, and a drawn
card can put the stats and the keyword - and, with "Keyword text" on, what
the keyword does - where they can.

## Going live

1. **Mailbox.** Create a Pockethost instance and, in its dashboard, a
   superuser for Fini to sign in as. Put the three settings from step 3 in
   `.env`, then apply the schema:
   ```
   bun --env-file=.env run scripts/finicards_v2_web_schema.ts
   ```
   It runs the files in `web/pocketbase/pb_migrations/` over the API, and
   only the ones not yet applied, so it is also how a later schema change
   reaches the mailbox. (A self-hosted Pocketbase can take the files as
   ordinary migrations instead. Use one way or the other, not both.)
2. **Discord sign-in.** In the Discord developer portal, on Fini's
   application, add the OAuth2 redirect
   `https://<instance>.pockethost.io/api/oauth2-redirect`. In the mailbox
   dashboard, open the `users` collection's options, and under OAuth2 add
   Discord with the application's client id and client secret.
3. **Fini.** Add to `.env` and restart the bot:
   ```
   FINI_WEB_POCKETBASE_URL=https://<instance>.pockethost.io
   FINI_WEB_POCKETBASE_EMAIL=<the superuser>
   FINI_WEB_POCKETBASE_PASSWORD=<its password>
   ```
   The first passes send every owned card, its artwork and its rendered face
   (about 3,300 rows and 3,300 images at launch), over several minutes. Without these settings the sync stays off and
   the bot runs as before.
4. **Site.** Import the repository into Vercel with the root directory set to
   `web`, and set `VITE_POCKETBASE_URL` to the mailbox's address. Bot-only
   commits do not rebuild it (`vercel.json`).

## Running it locally

A local mailbox stands in for Pockethost, and a made-up sign-in for Discord.

```sh
# 1. a local mailbox, on its own port
./pocketbase migrate up --dir web/pocketbase/pb_data --migrationsDir web/pocketbase/pb_migrations
./pocketbase superuser upsert dev@fini.local a-long-password --dir web/pocketbase/pb_data
./pocketbase serve --http 127.0.0.1:8092 --dir web/pocketbase/pb_data \
  --migrationsDir web/pocketbase/pb_migrations

# 2. Fini's half, pointed at it (reads Fini's real database; a deck saved
#    on the local site is saved for real)
export FINI_WEB_POCKETBASE_URL=http://127.0.0.1:8092
export FINI_WEB_POCKETBASE_EMAIL=dev@fini.local
export FINI_WEB_POCKETBASE_PASSWORD=a-long-password
bun --env-file=.env run scripts/finicards_v2_web_sync.ts --watch

# 3. the site
cd web && bun install && VITE_POCKETBASE_URL=http://127.0.0.1:8092 bun run dev

# 4. a link that signs in as you (ADMIN_ID), or as any Discord id given
bun --env-file=.env run scripts/finicards_v2_web_dev_login.ts
```

The `?token=` sign-in exists only in `bun run dev`; a production build has no
such door, and the script refuses any mailbox that is not on this machine.

## Not built

- Other players' collections, trading, selling, or opening packs.
- Limits on how fast the mailbox may be called. Fini ignores a flood of
  requests from one player, but Pocketbase's own rate limits are off; if they
  are switched on, check they leave room for Fini's first full send.
