/**
 * Seeds `jackpot_winners` from history, so `/jackpot history` has something to
 * show on the day it ships rather than starting from the next win.
 *
 * The `log` table is the source of truth here, not Discord. Every jackpot
 * payout writes a `log` row reading "Jackpot award: <amount> finicoin" with the
 * winner and a timestamp, and those rows go back to 2024-01-18 - two days after
 * the current jackpot code landed - so the log covers the feature's whole life.
 * Discord itself records a win only as a reaction emoji on the winning message,
 * with no amount anywhere, so it can confirm that a win happened but can never
 * say how big it was.
 *
 * Re-running is safe: a win is keyed by (server, winner, timestamp), and rows
 * that already exist are skipped.
 *
 * Usage:
 *   bun --env-file=.env run scripts/backfill_jackpot_winners.ts [flags]
 *
 *   --dry-run    Report what would be written without writing it.
 *   --discord    After the log backfill, cross-check against Discord by
 *                scanning channel history for the jackpot reaction and
 *                reporting any winning message with no matching row. Slow:
 *                it pages through message history over the REST API.
 *   --since=ISO  How far back --discord scans. Defaults to the oldest log win.
 *   --guild=ID   Restrict both passes to one server.
 */

import type { JackpotWinnerRecord, LogRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import {
  findJackpotWin,
  recordJackpotWin,
} from "../modules/finicoin/jackpotWinners";

/** Matches the output `rollJackpot` writes to the log on every payout. */
const AWARD_PATTERN = /Jackpot award:\s*([\d.]+)\s*finicoin/i;

/** The reaction `rollJackpot` leaves on a winning message. */
const JACKPOT_EMOJI_ID = "1088849190861410314";

const DISCORD_API = "https://discord.com/api/v10";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const checkDiscord = args.includes("--discord");
const guildFilter = args.find((a) => a.startsWith("--guild="))?.split("=")[1];
const sinceArg = args.find((a) => a.startsWith("--since="))?.split("=")[1];

/**
 * Resolves user and guild names through the REST API rather than a gateway
 * client, so the script never opens a second bot session alongside the running
 * bot. Cached because the same handful of winners recur across 49 wins.
 */
const nameCache = new Map<string, string>();

const discordFetch = async (path: string): Promise<any> => {
  const token = process.env.FINI_TOKEN;
  if (!token) throw new Error("FINI_TOKEN is not set");

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      await new Promise((r) => setTimeout(r, (retryAfter + 0.5) * 1000));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Discord ${response.status} for ${path}`);
    }

    return response.json();
  }

  throw new Error(`Discord rate limited repeatedly for ${path}`);
};

const resolveUsername = async (userId: string): Promise<string> => {
  const cached = nameCache.get(`u:${userId}`);
  if (cached) return cached;

  let name = userId;
  try {
    const user = await discordFetch(`/users/${userId}`);
    name = user.global_name || user.username || userId;
  } catch (err) {
    console.warn(`  ! could not resolve username for ${userId}, using the id`);
  }

  nameCache.set(`u:${userId}`, name);
  return name;
};

const resolveGuildName = async (guildId: string): Promise<string> => {
  const cached = nameCache.get(`g:${guildId}`);
  if (cached) return cached;

  let name = guildId;
  try {
    const guild = await discordFetch(`/guilds/${guildId}`);
    name = guild.name || guildId;
  } catch {
    console.warn(`  ! could not resolve guild name for ${guildId}`);
  }

  nameCache.set(`g:${guildId}`, name);
  return name;
};

/** Recovers wins from the `log` table. This is the pass that carries amounts. */
const backfillFromLog = async () => {
  const filter = guildFilter
    ? `command = "jackpot" && server_id = "${guildFilter}"`
    : `command = "jackpot"`;

  const logs = await pb
    .collection<LogRecord>("log")
    .getFullList({ filter, sort: "created" });

  console.log(`Found ${logs.length} jackpot log records.`);

  let created = 0;
  let skipped = 0;
  let unparsed = 0;

  for (const entry of logs) {
    const match = AWARD_PATTERN.exec(entry.output ?? "");
    if (!match) {
      unparsed++;
      console.warn(`  ! unparseable output, skipping: ${entry.output}`);
      continue;
    }

    const amount = parseFloat(match[1]);
    const wonAt = new Date(entry.created!);

    const existing = await findJackpotWin(
      entry.server_id,
      entry.user_id,
      wonAt,
    );
    if (existing) {
      skipped++;
      continue;
    }

    const username = await resolveUsername(entry.user_id);
    const servername = await resolveGuildName(entry.server_id);

    if (dryRun) {
      console.log(
        `  + would record ${username} — ${amount} — ${wonAt.toISOString()}`,
      );
      created++;
      continue;
    }

    const record = await recordJackpotWin({
      userId: entry.user_id,
      serverId: entry.server_id,
      username,
      servername,
      amount,
      wonAt,
      source: "backfill-log",
    });

    if (record) {
      created++;
      console.log(
        `  + ${username} — ${amount.toLocaleString()} — ${wonAt.toISOString()}`,
      );
    }
  }

  console.log(
    `Log backfill done. created=${created} already-present=${skipped} unparseable=${unparsed}`,
  );

  return logs;
};

/**
 * Cross-checks the recovered history against Discord.
 *
 * Only reports; it does not insert. A reaction proves a win happened but says
 * nothing about the payout, and a winner row with a made-up amount would be
 * worse than a missing one.
 */
const crossCheckDiscord = async (since: Date) => {
  const guildIds = guildFilter
    ? [guildFilter]
    : [
        ...new Set(
          (
            await pb
              .collection<JackpotWinnerRecord>("jackpot_winners")
              .getFullList({ fields: "server_id" })
          ).map((w) => w.server_id),
        ),
      ];

  console.log(
    `\nCross-checking Discord for jackpot reactions since ${since.toISOString()}...`,
  );

  const known = await pb
    .collection<JackpotWinnerRecord>("jackpot_winners")
    .getFullList({ sort: "won_at" });

  let scanned = 0;
  const unmatched: {
    guildId: string;
    channelId: string;
    channel: string;
    messageId: string;
    at: string;
  }[] = [];

  for (const guildId of guildIds) {
    let channels: any[] = [];
    try {
      channels = await discordFetch(`/guilds/${guildId}/channels`);
    } catch (err) {
      console.warn(`  ! cannot list channels for guild ${guildId}: ${err}`);
      continue;
    }

    // Text channels only (type 0) and announcement channels (type 5).
    const textChannels = channels.filter((c) => c.type === 0 || c.type === 5);
    console.log(`  guild ${guildId}: scanning ${textChannels.length} channels`);

    for (const channel of textChannels) {
      let before: string | undefined;

      // Page backwards until we pass the cutoff or run out of history.
      for (;;) {
        let batch: any[];
        try {
          batch = await discordFetch(
            `/channels/${channel.id}/messages?limit=100${before ? `&before=${before}` : ""}`,
          );
        } catch (err) {
          // Almost always a missing-permission channel; not worth stopping for.
          break;
        }

        if (!batch.length) break;

        scanned += batch.length;

        for (const message of batch) {
          const at = new Date(message.timestamp);

          // A short channel's whole history arrives in one batch, so the
          // paging cutoff below is not enough on its own to honour `since`.
          if (at < since) continue;

          // `me` is true only when the authenticated user - this bot - left
          // the reaction. The jackpot emoji is an ordinary server emoji that
          // members use in conversation, so without this every human pika
          // thumbs-up reads as an unrecorded jackpot.
          const wonHere = (message.reactions ?? []).some(
            (r: any) => r.emoji?.id === JACKPOT_EMOJI_ID && r.me === true,
          );
          if (!wonHere) continue;

          // The log row is written right after the reaction, so allow a small
          // window rather than demanding an exact timestamp match.
          const matched = known.some(
            (w) =>
              w.user_id === message.author?.id &&
              w.server_id === guildId &&
              Math.abs(new Date(w.won_at).getTime() - at.getTime()) < 60_000,
          );

          if (!matched) {
            unmatched.push({
              guildId,
              channelId: channel.id,
              channel: channel.name,
              messageId: message.id,
              at: at.toISOString(),
            });
          }
        }

        const oldest = new Date(batch[batch.length - 1].timestamp);
        if (oldest < since) break;

        before = batch[batch.length - 1].id;
      }
    }
  }

  console.log(`Scanned ${scanned} messages.`);

  if (!unmatched.length) {
    console.log(
      "Every jackpot reaction found in Discord already has a winner row. The log backfill is complete.",
    );
    return;
  }

  console.log(
    `\n${unmatched.length} jackpot reaction(s) have no matching winner row.\n` +
      "Discord does not record the payout amount, so these are reported rather\n" +
      "than inserted - add them by hand if you can work out the amounts:",
  );
  for (const u of unmatched) {
    console.log(
      `  - ${u.at}  #${u.channel}  https://discord.com/channels/${u.guildId}/${u.channelId}/${u.messageId}`,
    );
  }
};

const run = async () => {
  if (dryRun) console.log("DRY RUN - nothing will be written.\n");

  const logs = await backfillFromLog();

  if (checkDiscord) {
    const since = sinceArg
      ? new Date(sinceArg)
      : logs.length
        ? new Date(logs[0].created!)
        : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    await crossCheckDiscord(since);
  }
};

run();
