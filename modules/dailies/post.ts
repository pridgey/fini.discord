import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  type Client,
} from "discord.js";
import sharp from "sharp";
import { warnAndUse } from "../../utilities/fallback";
import { getBotChannelForServer } from "../../utilities/config/configUtils";
import { DAILY_BUTTON, ensureTodaysRound, guessMap } from "./geo/daily";
import {
  getRound,
  guessesFor,
  recordPost,
  type DailyGuessRecord,
  type DailyPost,
  type DailyRoundRecord,
} from "./geo/dailyStore";
import { maxPayFor, placeName } from "./geo/messages";
import { formatDistance } from "./geo/score";
import {
  POST_HOUR,
  POST_TIME,
  currentDay,
  dayKey,
  previousDay,
  sendTo,
} from "./shared";
import { buttonId as weaveButtonId } from "./weave/board";
import { WEAVE_LIVE, ensureTodaysWeave } from "./weave/daily";
import { MAX_FC, NO_PROGRESS, earned, finished } from "./weave/game";
import { renderWeaveBoard } from "./weave/render";
import {
  getWeaveRound,
  progressOf,
  puzzleOf,
  recordWeavePost,
  weavePlaysFor,
  type WeavePlayRecord,
  type WeaveRoundRecord,
} from "./weave/store";
import { keptFiles } from "../../utilities/discord/keptFiles";
import { buttonId as reelButtonId } from "./reel/board";
import { REEL_LIVE, ensureTodaysReel } from "./reel/daily";
import {
  FRAMES,
  FRAME_PAY,
  MAX_FC as REEL_MAX_FC,
  earned as reelEarned,
  filmName,
  solvedOn,
} from "./reel/game";
import {
  getReelRound,
  progressOf as reelProgressOf,
  recordReelPost,
  reelPlaysFor,
  type ReelPlayRecord,
  type ReelRoundRecord,
} from "./reel/store";
import { frameUrl } from "./reel/tmdb";

/**
 * The daily post: one message a day in each server's bot channel, however
 * many daily games there are and however many people play them. Two cards:
 *
 *   - Yesterday: each game's answer and top three, over one wide image of
 *     every game's solved state side by side (the guess map, the solved grid,
 *     the film's last frame)
 *     so the post stays short however many games there are
 *   - Today: each game with a live line, which the bot keeps up to date by
 *     editing the post as people play, and a button that opens it privately
 *
 * Finishing a game is also announced in a small card of its own, linking
 * back to the post (`announceFinish`).
 *
 * The post is rebuilt from what's stored each time, so an update is "build it
 * again and edit". It's recorded on each game's round, marked `combined`, so
 * a game's own older posts are never edited into it.
 */

/** A game's round in one server, with what its players did. */
export type GeoDay = { round: DailyRoundRecord; guesses: DailyGuessRecord[] };
export type WeaveDay = { round: WeaveRoundRecord; plays: WeavePlayRecord[] };
export type ReelDay = { round: ReelRoundRecord; plays: ReelPlayRecord[] };
export type Games = {
  geo: GeoDay | null;
  weave: WeaveDay | null;
  /** Absent before Reel was a daily, and while it's on trial. */
  reel?: ReelDay | null;
};

/** Each game's round for a day, as stored. */
type Rounds = {
  geo: DailyRoundRecord | null;
  weave: WeaveRoundRecord | null;
  reel: ReelRoundRecord | null;
};

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

/** Yesterday's answers and podiums, a paragraph per game posted yesterday. */
export const recapLines = (yesterday: Games): string[] => {
  const games: string[] = [];
  if (yesterday.geo) {
    const { round, guesses } = yesterday.geo;
    games.push(
      [
        `🌍 Where in the world was **${placeName(round.place)}**.`,
        `-# ${podium(guesses.map((guess) => ({ name: guess.username, fc: guess.total })))}`,
      ].join("\n"),
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
    games.push(
      [
        `🧵 Weave's thread was **${puzzle.thread.toUpperCase()}**: ${puzzle.words
          .map((word) => word.word.toUpperCase())
          .join(", ")}.`,
        `-# ${podium(scores)}`,
      ].join("\n"),
    );
  }
  if (yesterday.reel) {
    const { round, plays } = yesterday.reel;
    const scores = plays
      .map((play) => ({
        name: play.username,
        fc: reelEarned(round.movie_id, reelProgressOf(play)),
      }))
      .filter((score) => score.fc > 0)
      .sort((a, b) => b.fc - a.fc);
    games.push(
      [
        `🎬 Reel's film was **${filmName(round)}**.`,
        `-# ${scores.length ? podium(scores) : playedReels(plays).length ? "Nobody got it." : "Nobody played it."}`,
      ].join("\n"),
    );
  }
  return games;
};

/** Reel goes someone actually played: a guess made or a frame skipped. */
const playedReels = (plays: ReelPlayRecord[]) =>
  plays.filter((play) => (play.guesses ?? []).length > 0);

/** "Solved by **Aya** (frame 2), **Fen** (4) · 5 playing" */
const reelLive = (round: ReelRoundRecord, plays: ReelPlayRecord[]): string => {
  const playing = playedReels(plays).length;
  // Fewest frames first: that's the race.
  const solvers = plays
    .map((play) => ({
      name: play.username,
      frame: solvedOn(round.movie_id, reelProgressOf(play)),
    }))
    .filter(
      (solver): solver is { name: string; frame: number } => !!solver.frame,
    )
    .sort((a, b) => a.frame - b.frame)
    .map(
      ({ name, frame }, i) =>
        `**${name}** (${i === 0 ? `frame ${frame}` : frame})`,
    );
  const who = playing ? ` · ${playing} playing` : "";
  return solvers.length
    ? `Solved by ${solvers.join(", ")}${who}`
    : `Nobody's got it yet${who}.`;
};

/** The ladder's rungs, top first, as the live line names them. */
const RUNGS = [
  ["city", "the city"],
  ["province", "the province"],
  ["country", "the country"],
  ["continent", "the continent"],
] as const;

const reached = (guess: DailyGuessRecord, kind: string) =>
  guess.checks?.some(
    (check) => check.kind === kind && check.outcome === "earned",
  ) ?? false;

/**
 * "Played by 4 · 🏙️ **Aya**, **Fen** found the city · closest 2 km", or the
 * highest rung anyone reached. Says nothing of where: the round is still live.
 */
const geoLive = (guesses: DailyGuessRecord[]): string => {
  if (!guesses.length) return "No guesses yet.";
  const closest = `closest ${formatDistance(Math.min(...guesses.map((guess) => guess.km)))}`;
  const played = `Played by ${guesses.length}`;

  const finders = guesses.filter((guess) => reached(guess, "city"));
  if (finders.length) {
    const names = finders.slice(0, 3).map((guess) => `**${guess.username}**`);
    const more = finders.length > 3 ? ` +${finders.length - 3} more` : "";
    return `${played} · 🏙️ ${names.join(", ")}${more} found the city · ${closest}`;
  }
  const best = RUNGS.find(([kind]) =>
    guesses.some((guess) => reached(guess, kind)),
  );
  return best
    ? `${played} · best so far: ${best[1]} · ${closest}`
    : `${played} · nobody's found the continent yet · ${closest}`;
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

/** Today's games, a paragraph each: what it pays, and its live line. */
export const todayLines = (today: Games): string[] => {
  const games: string[] = [];
  if (today.geo) {
    games.push(
      [
        `🌍 **Where in the world** · up to ${maxPayFor(today.geo.round.photos.length)} fc`,
        `-# ${geoLive(today.geo.guesses)}`,
      ].join("\n"),
    );
  }
  if (today.weave) {
    games.push(
      [
        `🧵 **Weave** · up to ${MAX_FC} fc`,
        `-# ${weaveLive(today.weave.round, today.weave.plays)}`,
      ].join("\n"),
    );
  }
  if (today.reel) {
    games.push(
      [
        `🎬 **Reel** · up to ${REEL_MAX_FC} fc`,
        `-# ${reelLive(today.reel.round, today.reel.plays)}`,
      ].join("\n"),
    );
  }
  return games;
};

/** The file yesterday's image is attached as. */
export const RECAP_IMAGE = "dailies-yesterday.png";
const RECAP_ACCENT = 0x6b7280;
const TODAY_ACCENT = 0x5865f2;

/** Games in a card, an empty line between each. */
const paragraphs = (games: string[]) => games.join("\n\n");

/**
 * The whole post: a Yesterday card (when anything was posted yesterday) and a
 * Today card with a button for each game. `withImage` puts yesterday's image
 * in the first card; it must match whether the message carries the file.
 */
export const dailyPost = (
  yesterday: Games,
  today: Games,
  { withImage = false }: { withImage?: boolean } = {},
) => {
  const cards: ContainerBuilder[] = [];
  const recap = recapLines(yesterday);
  if (recap.length) {
    const card = new ContainerBuilder()
      .setAccentColor(RECAP_ACCENT)
      .addTextDisplayComponents((text) =>
        text.setContent(`## 🗓️ Yesterday\n${paragraphs(recap)}`),
      );
    if (withImage) {
      card.addMediaGalleryComponents((gallery) =>
        gallery.addItems((item) =>
          item
            .setURL(`attachment://${RECAP_IMAGE}`)
            .setDescription("Yesterday's games, solved"),
        ),
      );
    }
    cards.push(card);
  }

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
  if (today.reel) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(reelButtonId(today.reel.round.id, "open"))
        .setLabel("Reel")
        .setEmoji("🎬")
        .setStyle(ButtonStyle.Primary),
    );
  }
  const todayCard = new ContainerBuilder()
    .setAccentColor(TODAY_ACCENT)
    .addTextDisplayComponents((text) =>
      text.setContent(
        `## 📅 Today's dailies\n${paragraphs(todayLines(today))}\n\n-# Each game opens privately, just for you. New games at ${POST_TIME}.`,
      ),
    );
  if (buttons.length) {
    todayCard.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(buttons),
    );
  }
  cards.push(todayCard);

  return { components: cards, flags: [MessageFlags.IsComponentsV2] as const };
};

/** Reel's most telling frame, the one a round ends on. */
const lastFrame = async (round: ReelRoundRecord): Promise<Buffer | null> => {
  const path = round.frames[FRAMES - 1] ?? round.frames.at(-1);
  if (!path) return null;
  const response = await fetch(frameUrl(path, "w780"), {
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
};

/** Each image is scaled to this height and laid side by side. */
const RECAP_HEIGHT = 360;
const RECAP_GAP = 24;

/**
 * Yesterday's games in one wide image: the location game's map of everyone's
 * guesses beside Weave's solved grid. One short strip rather than an image a
 * game keeps the post from growing tall. Null if there's nothing to show, or
 * nothing could be drawn.
 */
export const recapImage = async (yesterday: Games): Promise<Buffer | null> => {
  const drawn = await Promise.all([
    yesterday.geo
      ? guessMap(yesterday.geo.round, yesterday.geo.guesses).catch(
          warnAndUse(null, "draw yesterday's guess map"),
        )
      : null,
    yesterday.weave
      ? renderWeaveBoard({
          puzzle: puzzleOf(yesterday.weave.round),
          progress: NO_PROGRESS,
          reveal: true,
        }).catch(warnAndUse(null, "draw yesterday's Weave"))
      : null,
    yesterday.reel
      ? lastFrame(yesterday.reel.round).catch(
          warnAndUse(null, "fetch yesterday's Reel frame"),
        )
      : null,
  ]);
  const images = await Promise.all(
    drawn
      .filter((image): image is Buffer => !!image)
      .map((image) =>
        sharp(image)
          .resize({ height: RECAP_HEIGHT })
          .png()
          .toBuffer({ resolveWithObject: true }),
      ),
  );
  if (!images.length) return null;

  const width =
    images.reduce((sum, image) => sum + image.info.width, 0) +
    RECAP_GAP * (images.length - 1);
  let left = 0;
  const layers = images.map((image) => {
    const layer = { input: image.data, left, top: 0 };
    left += image.info.width + RECAP_GAP;
    return layer;
  });
  return sharp({
    create: {
      width,
      height: RECAP_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
};

/* ------------------------------------------------------------- loading */

/** The games of `day` in a server, with each player's result. */
const gamesOn = async (rounds: Rounds, serverId: string): Promise<Games> => ({
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
  reel: rounds.reel
    ? {
        round: rounds.reel,
        plays: await reelPlaysFor(rounds.reel.id, serverId).catch(() => []),
      }
    : null,
});

/** Yesterday's games in a server: only those that were posted there. */
const yesterdayIn = async (day: string, serverId: string): Promise<Games> => {
  const yesterday = previousDay(day);
  const [geo, weave, reel] = await Promise.all([
    getRound(yesterday).catch(() => null),
    getWeaveRound(yesterday).catch(() => null),
    getReelRound(yesterday).catch(() => null),
  ]);
  return gamesOn(
    {
      geo: geo?.posts?.[serverId] ? geo : null,
      weave: weave?.posts?.[serverId] ? weave : null,
      reel: reel?.posts?.[serverId] ? reel : null,
    },
    serverId,
  );
};

/**
 * Today's post as it should read now, for one server. `image` draws yesterday's
 * image and attaches it (a new post); `hasImage` lays the post out around the
 * image the message already carries (an edit, which keeps its files).
 */
const buildPost = async (
  rounds: Rounds,
  day: string,
  serverId: string,
  mode: { image: true } | { hasImage: boolean },
) => {
  const [yesterday, today] = await Promise.all([
    yesterdayIn(day, serverId),
    gamesOn(rounds, serverId),
  ]);
  if ("hasImage" in mode) {
    return dailyPost(yesterday, today, { withImage: mode.hasImage });
  }
  const image = await recapImage(yesterday);
  return {
    ...dailyPost(yesterday, today, { withImage: !!image }),
    files: image ? [new AttachmentBuilder(image, { name: RECAP_IMAGE })] : [],
  };
};

/* ------------------------------------------------------------- posting */

/**
 * How long past POST_HOUR to wait for the location game's round. Finding
 * photos that can be placed can take a few tries; after this the post goes
 * up without it rather than not at all.
 */
const GEO_GRACE_HOURS = 1;

/** After a film couldn't be chosen, wait this long before trying again: each try asks Haiku about ~20 stills. */
const REEL_RETRY_MS = 15 * 60_000;
let reelRetryAt = 0;

/** Today's Reel, chosen if need be; null if it can't be had just now. */
const todaysReel = async (): Promise<ReelRoundRecord | null> => {
  if (Date.now() < reelRetryAt) return getReelRound(dayKey()).catch(() => null);
  const round = await ensureTodaysReel().catch(
    warnAndUse(null, "choose today's Reel"),
  );
  if (!round) reelRetryAt = Date.now() + REEL_RETRY_MS;
  return round;
};

/**
 * Reel on its own, for a day whose post went up without it: what it is, what
 * it pays, and the button. It joins the daily post the next day.
 */
export const reelOwnPost = (round: ReelRoundRecord) => ({
  components: [
    new ContainerBuilder()
      .setAccentColor(FINISH_ACCENT.reel)
      .addTextDisplayComponents((text) =>
        text.setContent(
          [
            "## 🎬 New daily: Reel",
            "Name the film from its frames. You start with one still, and each wrong guess or skip shows another - five in all.",
            `Name it on the first frame for **${REEL_MAX_FC} fc**, then ${FRAME_PAY.slice(1).join(", ")} fc.`,
            "",
            "-# Opens privately, just for you. From tomorrow it's part of the daily post.",
          ].join("\n"),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(reelButtonId(round.id, "open"))
            .setLabel("Play Reel")
            .setEmoji("🎬")
            .setStyle(ButtonStyle.Primary),
        ),
      ),
  ],
  flags: [MessageFlags.IsComponentsV2] as const,
});

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
  const reel = REEL_LIVE ? await todaysReel() : null;
  if (!geo && !weave) return 0;
  const day = geo?.day ?? weave!.day;

  let posted = 0;
  for (const guild of cl.guilds.cache.values()) {
    if (
      geo?.posts?.[guild.id] ||
      weave?.posts?.[guild.id] ||
      reel?.posts?.[guild.id]
    ) {
      // Today's post went up without Reel - its first day, or a film that
      // couldn't be had at noon - so it's posted on its own.
      if (reel && !reel.posts?.[guild.id]) {
        const channelId = await getBotChannelForServer(guild.id);
        const message =
          channelId && (await sendTo(cl, channelId, reelOwnPost(reel)));
        if (channelId && message) {
          const post: DailyPost = { channelId, messageId: message.id };
          await recordReelPost(reel.id, guild.id, post);
          reel.posts = { ...(reel.posts ?? {}), [guild.id]: post };
          posted++;
        }
      }
      continue;
    }
    const channelId = await getBotChannelForServer(guild.id);
    if (!channelId) continue;

    const message = await sendTo(
      cl,
      channelId,
      await buildPost({ geo, weave, reel }, day, guild.id, { image: true }),
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
    if (reel) {
      await recordReelPost(reel.id, guild.id, post);
      reel.posts = { ...(reel.posts ?? {}), [guild.id]: post };
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
  const [geo, weave, reel] = await Promise.all([
    getRound(day).catch(() => null),
    WEAVE_LIVE ? getWeaveRound(day).catch(() => null) : Promise.resolve(null),
    REEL_LIVE ? getReelRound(day).catch(() => null) : Promise.resolve(null),
  ]);
  const post =
    geo?.posts?.[serverId] ??
    weave?.posts?.[serverId] ??
    reel?.posts?.[serverId];
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
    reel: reel?.posts?.[serverId]?.messageId === post.messageId ? reel : null,
  };
  // Name the files to keep, or the edit drops yesterday's image.
  const kept = keptFiles(message);
  const hasImage = kept.some((file) => file.filename === RECAP_IMAGE);
  await message.edit({
    ...(await buildPost(rounds, day, serverId, { hasImage })),
    attachments: kept,
  });
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

/* ------------------------------------------------------------- finishing */

/** Someone finishing a game, as the announcement tells it. */
export type Finish =
  | { game: "geo"; name: string; total: number; cityRight: boolean }
  | {
      game: "weave";
      name: string;
      guesses: number;
      fc: number;
      thread: boolean;
    }
  | { game: "reel"; name: string; frame: number; fc: number };

/** "🌍 **Aya** played today's Where in the World and won **267 fc**, right down to the city!" */
export const finishText = (finish: Finish): string => {
  if (finish.game === "geo") {
    const result =
      finish.total > 0
        ? `won **${finish.total} fc**${finish.cityRight ? ", right down to the city" : ""}!`
        : "came away empty-handed.";
    return `🌍 **${finish.name}** played today's **Where in the World** and ${result}`;
  }
  if (finish.game === "reel") {
    return `🎬 **${finish.name}** named today's **Reel** on frame ${finish.frame} and won **${finish.fc} fc**!`;
  }
  const guesses = `${finish.guesses} ${finish.guesses === 1 ? "guess" : "guesses"}`;
  return `🧵 **${finish.name}** solved today's **Weave**${finish.thread ? ", thread and all," : ""} in ${guesses} and won **${finish.fc} fc**!`;
};

const FINISH_ACCENT = {
  geo: 0x3b82f6,
  weave: 0x8f6fd8,
  reel: 0xe0a030,
} as const;

/**
 * A small card in the bot channel when someone finishes a game, with a link to
 * today's post so others can join in. Goes where today's post is, or to the bot
 * channel if there's no post yet.
 */
export const announceFinish = async (
  cl: Client,
  serverId: string,
  finish: Finish,
): Promise<void> => {
  const day = currentDay();
  const [geo, weave, reel] = await Promise.all([
    getRound(day).catch(() => null),
    getWeaveRound(day).catch(() => null),
    getReelRound(day).catch(() => null),
  ]);
  // The finished game's own post: today's daily post, or, on a game's first
  // day, the post it had to itself.
  const own = { geo, weave, reel }[finish.game]?.posts?.[serverId];
  const post =
    own ??
    [
      geo?.posts?.[serverId],
      weave?.posts?.[serverId],
      reel?.posts?.[serverId],
    ].find((candidate) => candidate?.combined);
  const channelId = post?.channelId ?? (await getBotChannelForServer(serverId));
  if (!channelId) return;

  const card = new ContainerBuilder()
    .setAccentColor(FINISH_ACCENT[finish.game])
    .addTextDisplayComponents((text) => text.setContent(finishText(finish)));
  if (post) {
    card.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(
            post.combined ? "Play today's dailies" : "Play today's Reel",
          )
          .setURL(
            `https://discord.com/channels/${serverId}/${post.channelId}/${post.messageId}`,
          ),
      ),
    );
  }
  await sendTo(cl, channelId, {
    components: [card],
    flags: [MessageFlags.IsComponentsV2],
    allowedMentions: { parse: [] },
  });
};

/**
 * What the game handlers call after a play: the post's live line catches up,
 * and a finished game is announced. Never throws - the play has already
 * happened, and its player has their result.
 */
export const dailyPlayed = (
  cl: Client,
  serverId: string,
  finish: Finish | null = null,
): void => {
  refreshDailyPost(cl, serverId);
  if (finish) {
    announceFinish(cl, serverId, finish).catch((error) =>
      console.error(
        `Dailies: couldn't announce a finish in ${serverId}`,
        error,
      ),
    );
  }
};
