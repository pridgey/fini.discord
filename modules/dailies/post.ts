import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from "discord.js";
import { getBotChannelForServer } from "../../utilities/config/configUtils";
import { DAILY_BUTTON, ensureTodaysRound } from "./geo/daily";
import {
  getRound,
  guessesFor,
  recordPost,
  type DailyGuessRecord,
  type DailyPost,
  type DailyRoundRecord,
} from "./geo/dailyStore";
import { maxPayFor, placeName } from "./geo/messages";
import {
  POST_HOUR,
  POST_TIME,
  currentDay,
  previousDay,
  sendTo,
} from "./shared";
import { buttonId as weaveButtonId } from "./weave/board";
import { WEAVE_LIVE, ensureTodaysWeave } from "./weave/daily";
import { MAX_FC, earned, finished } from "./weave/game";
import {
  getWeaveRound,
  progressOf,
  puzzleOf,
  recordWeavePost,
  weavePlaysFor,
  type WeavePlayRecord,
  type WeaveRoundRecord,
} from "./weave/store";

/**
 * The daily post: one message a day in each server's bot channel, however
 * many daily games there are and however many people play them.
 *
 *   - yesterday's answers, and the top three in each game
 *   - today's games, each with a button that opens a private round
 *   - a live line under each game, which the bot keeps up to date by editing
 *     the post as people play - in place of a message for every player
 *
 * The post is rebuilt from what's stored each time, so an update is "build it
 * again and edit". It's recorded on each game's round, marked `combined`, so
 * a game's own older posts are never edited into it.
 */

/** A game's round in one server, with what its players did. */
export type GeoDay = { round: DailyRoundRecord; guesses: DailyGuessRecord[] };
export type WeaveDay = { round: WeaveRoundRecord; plays: WeavePlayRecord[] };
export type Games = { geo: GeoDay | null; weave: WeaveDay | null };

const MEDALS = ["🥇", "🥈", "🥉"];

/** "🥇 **Aya** 214 fc · 🥈 **Fen** 90 fc", the top three, or a line saying nobody played. */
const podium = (scores: { name: string; fc: number }[]): string =>
  scores.length
    ? scores
        .slice(0, 3)
        .map((score, i) => `${MEDALS[i]} **${score.name}** ${score.fc} fc`)
        .join(" · ")
    : "Nobody played it.";

/** Weave boards someone actually played: a word found or the thread guessed. */
const playedBoards = (plays: WeavePlayRecord[]) =>
  plays.filter((play) => (play.found ?? []).length > 0 || play.thread_guess);

/** Yesterday's answers and podiums, for the games that were posted yesterday. */
export const recapLines = (yesterday: Games): string[] => {
  const lines: string[] = [];
  if (yesterday.geo) {
    const { round, guesses } = yesterday.geo;
    lines.push(
      `🌍 Where in the world was **${placeName(round.place)}**.`,
      `-# ${podium(guesses.map((guess) => ({ name: guess.username, fc: guess.total })))}`,
    );
  }
  if (yesterday.weave) {
    const puzzle = puzzleOf(yesterday.weave.round);
    const scores = playedBoards(yesterday.weave.plays)
      .map((play) => ({
        name: play.username,
        fc: earned(puzzle, progressOf(play)),
      }))
      .sort((a, b) => b.fc - a.fc);
    lines.push(
      `🧵 Weave's thread was **${puzzle.thread.toUpperCase()}**: ${puzzle.words
        .map((word) => word.word.toUpperCase())
        .join(", ")}.`,
      `-# ${podium(scores)}`,
    );
  }
  return lines.length ? ["**Yesterday**", ...lines] : [];
};

/** "Played by 4 · best **Aya** 214 fc" */
const geoLive = (guesses: DailyGuessRecord[]): string => {
  if (!guesses.length) return "No guesses yet.";
  const [best] = guesses;
  return `Played by ${guesses.length} · best **${best.username}** ${best.total} fc`;
};

/** "Solved by **Aya** (7 guesses), **Fen** (12) · 6 playing" */
const weaveLive = (
  round: WeaveRoundRecord,
  plays: WeavePlayRecord[],
): string => {
  const puzzle = puzzleOf(round);
  const playing = playedBoards(plays).length;
  // Fewest guesses first: that's the race.
  const solvers = plays
    .filter((play) => play.finished && finished(puzzle, progressOf(play)))
    .map((play) => ({ name: play.username, guesses: progressOf(play).guesses }))
    .sort((a, b) => a.guesses - b.guesses)
    .map(
      ({ name, guesses }, i) =>
        `**${name}** (${i === 0 ? `${guesses} ${guesses === 1 ? "guess" : "guesses"}` : guesses})`,
    );
  const who = playing ? ` · ${playing} playing` : "";
  return solvers.length
    ? `Solved by ${solvers.join(", ")}${who}`
    : `Nobody's solved it yet${who}.`;
};

/** Today's games, each with what it pays and its live line. */
export const todayLines = (today: Games): string[] => {
  const lines = ["**Today**"];
  if (today.geo) {
    lines.push(
      `🌍 **Where in the world** · up to ${maxPayFor(today.geo.round.photos.length)} fc`,
      `-# ${geoLive(today.geo.guesses)}`,
    );
  }
  if (today.weave) {
    lines.push(
      `🧵 **Weave** · up to ${MAX_FC} fc`,
      `-# ${weaveLive(today.weave.round, today.weave.plays)}`,
    );
  }
  return lines;
};

/** The whole post: text, and a button for each of today's games. */
export const dailyPost = (yesterday: Games, today: Games) => {
  const buttons: ButtonBuilder[] = [];
  if (today.geo) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${DAILY_BUTTON}:play:${today.geo.round.id}`)
        .setLabel("Where in the world")
        .setEmoji("🌍")
        .setStyle(ButtonStyle.Primary),
    );
  }
  if (today.weave) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(weaveButtonId(today.weave.round.id, "open"))
        .setLabel("Weave")
        .setEmoji("🧵")
        .setStyle(ButtonStyle.Primary),
    );
  }
  const recap = recapLines(yesterday);
  return {
    content: [
      "## 📅 Today's dailies",
      ...(recap.length ? [...recap, ""] : []),
      ...todayLines(today),
      "",
      `-# Each game opens privately, just for you. New games at ${POST_TIME}.`,
    ].join("\n"),
    components: buttons.length
      ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)]
      : [],
  };
};

/* ------------------------------------------------------------- loading */

/** The games of `day` in a server, with each player's result. */
const gamesOn = async (
  rounds: { geo: DailyRoundRecord | null; weave: WeaveRoundRecord | null },
  serverId: string,
): Promise<Games> => ({
  geo: rounds.geo
    ? {
        round: rounds.geo,
        guesses: await guessesFor(rounds.geo.id, serverId).catch(() => []),
      }
    : null,
  weave: rounds.weave
    ? {
        round: rounds.weave,
        plays: await weavePlaysFor(rounds.weave.id, serverId).catch(() => []),
      }
    : null,
});

/** Yesterday's games in a server: only those that were posted there. */
const yesterdayIn = async (day: string, serverId: string): Promise<Games> => {
  const yesterday = previousDay(day);
  const [geo, weave] = await Promise.all([
    getRound(yesterday).catch(() => null),
    getWeaveRound(yesterday).catch(() => null),
  ]);
  return gamesOn(
    {
      geo: geo?.posts?.[serverId] ? geo : null,
      weave: weave?.posts?.[serverId] ? weave : null,
    },
    serverId,
  );
};

/** Today's post as it should read now, for one server. */
const buildPost = async (
  rounds: { geo: DailyRoundRecord | null; weave: WeaveRoundRecord | null },
  day: string,
  serverId: string,
) =>
  dailyPost(await yesterdayIn(day, serverId), await gamesOn(rounds, serverId));

/* ------------------------------------------------------------- posting */

/**
 * How long past POST_HOUR to wait for the location game's round. Finding
 * photos that can be placed can take a few tries; after this the post goes
 * up without it rather than not at all.
 */
const GEO_GRACE_HOURS = 1;

/**
 * Posts today's daily in every server with a bot channel that hasn't had it.
 * Safe to run every minute: each server is posted to once, and each game's
 * round is made once.
 */
export const postDailies = async (cl: Client): Promise<number> => {
  const geo = await ensureTodaysRound().catch(() => null);
  if (!geo && new Date().getHours() < POST_HOUR + GEO_GRACE_HOURS) {
    console.error("Dailies: no location round yet; trying again next minute");
    return 0;
  }
  const weave = WEAVE_LIVE ? await ensureTodaysWeave() : null;
  if (!geo && !weave) return 0;
  const day = geo?.day ?? weave!.day;

  let posted = 0;
  for (const guild of cl.guilds.cache.values()) {
    if (geo?.posts?.[guild.id] || weave?.posts?.[guild.id]) continue;
    const channelId = await getBotChannelForServer(guild.id);
    if (!channelId) continue;

    const message = await sendTo(
      cl,
      channelId,
      await buildPost({ geo, weave }, day, guild.id),
    );
    if (!message) continue;

    const post: DailyPost = {
      channelId,
      messageId: message.id,
      combined: true,
    };
    if (geo) {
      await recordPost(geo.id, guild.id, post);
      geo.posts = { ...(geo.posts ?? {}), [guild.id]: post };
    }
    if (weave) {
      await recordWeavePost(weave.id, guild.id, post);
      weave.posts = { ...(weave.posts ?? {}), [guild.id]: post };
    }
    posted++;
  }
  return posted;
};

let running = false;

/** The polling loop's hook: from POST_HOUR on, make sure today's post is out. */
export const runDailies = async (cl: Client) => {
  if (running || new Date().getHours() < POST_HOUR) return;
  running = true;
  try {
    const posted = await postDailies(cl);
    if (posted) console.log(`📅 Daily post sent in ${posted} server(s)`);
  } finally {
    running = false;
  }
};

/* ------------------------------------------------------------- live line */

/** How long to gather plays before editing the post, so a burst is one edit. */
const REFRESH_DELAY_MS = 3_000;
const refreshing = new Map<string, ReturnType<typeof setTimeout>>();

/** Edits today's post in a server to show what's been played since. */
export const updateDailyPost = async (cl: Client, serverId: string) => {
  const day = currentDay();
  const [geo, weave] = await Promise.all([
    getRound(day).catch(() => null),
    WEAVE_LIVE ? getWeaveRound(day).catch(() => null) : Promise.resolve(null),
  ]);
  const post = geo?.posts?.[serverId] ?? weave?.posts?.[serverId];
  // A game's own post from before the combined one isn't ours to rewrite.
  if (!post?.combined) return;

  const channel = await cl.channels.fetch(post.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages
    .fetch(post.messageId)
    .catch(() => null);
  if (!message) return;

  // Only the games this post was made for: a game added later isn't in it.
  const rounds = {
    geo: geo?.posts?.[serverId]?.messageId === post.messageId ? geo : null,
    weave:
      weave?.posts?.[serverId]?.messageId === post.messageId ? weave : null,
  };
  await message.edit(await buildPost(rounds, day, serverId));
};

/**
 * Brings a server's daily post up to date, a moment after a play. Plays in
 * quick succession share one edit. Never throws: a stale live line is no
 * reason to fail the play that changed it.
 */
export const refreshDailyPost = (cl: Client, serverId: string): void => {
  clearTimeout(refreshing.get(serverId));
  refreshing.set(
    serverId,
    setTimeout(() => {
      refreshing.delete(serverId);
      updateDailyPost(cl, serverId).catch((error) =>
        console.error(
          `Dailies: couldn't update the post in ${serverId}`,
          error,
        ),
      );
    }, REFRESH_DELAY_MS),
  );
};
