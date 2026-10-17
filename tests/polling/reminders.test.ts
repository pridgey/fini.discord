import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { DiscordAPIError, RESTJSONErrorCodes, type Client } from "discord.js";
import { pb } from "../../utilities/pocketbase";
import { checkReminders } from "../../modules/polling/polling";

const reminder = (id: string, channelId: string) => ({
  id,
  channel_id: channelId,
  user_id: "user",
  reminder_text: `text ${id}`,
  original_message: "",
  server_id: "server",
  time: "",
});

let due: ReturnType<typeof reminder>[] = [];
let deleted: string[] = [];
let sent: string[] = [];
const realCollection = pb.collection.bind(pb);

beforeEach(() => {
  deleted = [];
  sent = [];
  pb.collection = mock(() => ({
    getFullList: async () => due,
    delete: async (id: string) => void deleted.push(id),
  })) as unknown as typeof pb.collection;
});

afterEach(() => {
  pb.collection = realCollection;
});

const postable = { isSendable: () => true, send: async (text: string) => void sent.push(text) };
const notPostable = { isSendable: () => false };

/** A client whose channel lookups answer with `channels[id]`, throwing it if it's an error. */
const clientWith = (channels: Record<string, unknown>) =>
  ({
    channels: {
      fetch: async (id: string) => {
        if (channels[id] instanceof Error) throw channels[id];
        return channels[id];
      },
    },
  }) as unknown as Client;

describe("reminders", () => {
  it("sends each due reminder and deletes it", async () => {
    due = [reminder("a", "one"), reminder("b", "two")];

    await checkReminders(clientWith({ one: postable, two: postable }));

    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("text a");
    expect(deleted).toEqual(["a", "b"]);
  });

  it("carries on past a failure, and keeps a reminder that may still be sent", async () => {
    due = [reminder("a", "flaky"), reminder("b", "fine")];

    await checkReminders(clientWith({ flaky: new Error("network"), fine: postable }));

    expect(sent).toHaveLength(1);
    expect(deleted).toEqual(["b"]);
  });

  it("drops a reminder whose channel is gone, or can't be posted in", async () => {
    due = [reminder("gone", "deleted"), reminder("closed", "voice")];
    const unknownChannel = new DiscordAPIError(
      { code: RESTJSONErrorCodes.UnknownChannel, message: "Unknown Channel" },
      RESTJSONErrorCodes.UnknownChannel,
      404,
      "GET",
      "/channels/deleted",
      {},
    );

    await checkReminders(clientWith({ deleted: unknownChannel, voice: notPostable }));

    expect(deleted).toEqual(["gone", "closed"]);
  });
});
