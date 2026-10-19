import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Client } from "discord.js";
import PocketBase from "pocketbase";
import { generatePuzzle } from "../../modules/dailies/weave/puzzle";

/**
 * Posting and the live line, against a fake Pocketbase and a fake Discord:
 * two servers with a bot channel, and today's rounds already made (so no
 * photos are fetched).
 */

type Post = { channelId: string; messageId: string; combined?: boolean };
type Round = { id: string; day: string; posts: Record<string, Post> };

let geo: Round & Record<string, unknown>;
let weave: Round & Record<string, unknown>;
let reel: Round & Record<string, unknown>;
/** Each collection's round. Reel's is left out until a test adds it. */
let rounds: Record<string, Round>;

/*
 * Other suites replace the Pocketbase module too, and Bun applies the latest
 * replacement to every file that imports it - so this suite registers its own
 * rather than patching an object the stores may not be using.
 */
const fakePb = {
  filter: PocketBase.prototype.filter,
  collection: (_name: string): unknown => ({}),
};
mock.module("../../utilities/pocketbase", () => ({ pb: fakePb }));
const { announceFinish, postDailies, updateDailyPost } =
  await import("../../modules/dailies/post");

beforeEach(() => {
  const day = "2026-10-18";
  geo = {
    id: "georound1234567",
    day,
    place: { city: "Lyon", country: "France" },
    photos: ["a.jpg"],
    posts: {},
  };
  weave = { ...generatePuzzle(), id: "weaveround12345", day, posts: {} };
  reel = {
    id: "reelround123456",
    day,
    movie_id: 157336,
    title: "Interstellar",
    year: "2014",
    frames: ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg", "/5.jpg"],
    posts: {},
  };
  rounds = {
    daily_geo_round: geo,
    daily_weave_round: weave,
  };
  fakePb.collection = (name: string) => {
    const round = rounds[name];
    if (round) {
      return {
        // The same round for any day: it stands in for yesterday's too.
        getFirstListItem: async () => round,
        getOne: async () => round,
        update: async (_id: string, data: Partial<Round>) =>
          Object.assign(round, data),
      };
    }
    if (name === "config") {
      return { getFirstListItem: async () => ({ bot_channel: "bots" }) };
    }
    // Anything else - Reel, while it's on trial - has no rounds.
    return {
      getFullList: async () => [],
      getFirstListItem: async () => {
        throw new Error("not found");
      },
    };
  };
});

/** Everything a payload says, as text: its content, or its cards. */
const textOf = (payload: { content?: string; components?: unknown[] }) =>
  payload.content ??
  JSON.stringify(
    (payload.components ?? []).map(
      (part) => (part as { toJSON?: () => unknown }).toJSON?.() ?? part,
    ),
  );

/** A client in two servers, whose channel records what's sent and edited. */
const fakeClient = () => {
  const sent: string[] = [];
  const edited: { id: string; content: string }[] = [];
  let next = 0;
  const channel = {
    isTextBased: () => true,
    send: async (payload: { content?: string; components?: unknown[] }) => {
      sent.push(textOf(payload));
      return { id: `msg${++next}` };
    },
    messages: {
      fetch: async (id: string) => ({
        components: [],
        attachments: new Map(),
        edit: async (payload: { components?: unknown[] }) =>
          void edited.push({ id, content: textOf(payload) }),
      }),
    },
  };
  const client = {
    guilds: {
      cache: new Map([
        ["serverA", { id: "serverA" }],
        ["serverB", { id: "serverB" }],
      ]),
    },
    channels: { fetch: async () => channel },
  } as unknown as Client;
  return { client, sent, edited };
};

describe("posting the daily", () => {
  it("posts once in each server, recorded on both games as the combined post", async () => {
    const { client, sent } = fakeClient();

    expect(await postDailies(client)).toBe(2);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("Today's dailies");
    for (const round of [geo, weave]) {
      expect(round.posts.serverA).toEqual({
        channelId: "bots",
        messageId: "msg1",
        combined: true,
      });
      expect(round.posts.serverB).toEqual({
        channelId: "bots",
        messageId: "msg2",
        combined: true,
      });
    }

    // The next minute's poll finds it out already.
    expect(await postDailies(client)).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it("edits the combined post when someone plays", async () => {
    const { client, edited } = fakeClient();
    await postDailies(client);

    await updateDailyPost(client, "serverA");

    expect(edited).toEqual([
      { id: "msg1", content: expect.stringContaining("Today's dailies") },
    ]);
  });

  it("never edits a game's own post from before the combined one", async () => {
    const { client, edited } = fakeClient();
    geo.posts = { serverA: { channelId: "bots", messageId: "oldGeoPhotos" } };
    weave.posts = { serverA: { channelId: "bots", messageId: "oldWeaveGrid" } };

    await updateDailyPost(client, "serverA");

    expect(edited).toEqual([]);
  });

  it("announces a finished game with a link back to the post", async () => {
    const { client, sent } = fakeClient();
    await postDailies(client);

    await announceFinish(client, "serverA", {
      game: "geo",
      name: "graham1",
      total: 267,
      cityRight: true,
    });

    const announcement = sent.at(-1)!;
    expect(announcement).toContain(
      "graham1** played today's **Where in the World",
    );
    expect(announcement).toContain(
      "https://discord.com/channels/serverA/bots/msg1",
    );
  });

  it("puts Reel in the post, on the days it's there at noon", async () => {
    rounds.daily_reel_round = reel;
    const { client, sent } = fakeClient();

    expect(await postDailies(client)).toBe(2);
    expect(sent[0]).toContain("🎬 **Reel**");
    expect(reel.posts.serverA).toEqual({
      channelId: "bots",
      messageId: "msg1",
      combined: true,
    });
  });

  it("posts Reel on its own where today's post went up without it", async () => {
    const { client, sent } = fakeClient();
    await postDailies(client);
    rounds.daily_reel_round = reel;

    expect(await postDailies(client)).toBe(2);
    expect(sent).toHaveLength(4);
    expect(sent[2]).toContain("New daily: Reel");
    expect(sent[2]).not.toContain("Today's dailies");
    // Its own post, which the live line never edits.
    expect(reel.posts.serverA).toEqual({
      channelId: "bots",
      messageId: "msg3",
    });
    expect(geo.posts.serverA?.messageId).toBe("msg1");

    expect(await postDailies(client)).toBe(0);
  });

  it("links a Reel finish to Reel's own post on its first day", async () => {
    const { client, sent } = fakeClient();
    await postDailies(client);
    rounds.daily_reel_round = reel;
    await postDailies(client);

    await announceFinish(client, "serverA", {
      game: "reel",
      name: "Aya",
      frame: 2,
      fc: 25,
    });

    const announcement = sent.at(-1)!;
    expect(announcement).toContain("named today's **Reel** on frame 2");
    expect(announcement).toContain(
      "https://discord.com/channels/serverA/bots/msg3",
    );
    expect(announcement).toContain("Play today's Reel");
  });
});
