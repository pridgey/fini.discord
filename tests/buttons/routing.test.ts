import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { MessageFlags } from "discord.js";

const createLog = mock(async (_record: unknown) => undefined);
mock.module("../../modules/logger/logger", () => ({ createLog }));
import {
  buttonHandlers,
  handleButtonInteraction,
} from "../../buttons/buttonHandler";
import {
  handleModalInteraction,
  modalHandlers,
} from "../../modals/modalHandler";

const pressed = (
  customId: string,
  state = { deferred: false, replied: false },
) => ({
  customId,
  ...state,
  guildId: "guild1",
  channelId: "channel1",
  user: { id: "user1" },
  fetchReply: mock(async () => ({ content: "Bought 5 shares!" })),
  reply: mock(async (_reply: unknown) => undefined),
  followUp: mock(async (_reply: unknown) => undefined),
});
type Pressed = ReturnType<typeof pressed>;

const failure = (what: string) => ({
  content: `❌ An error occurred while processing this ${what}`,
  flags: [MessageFlags.Ephemeral],
});

beforeEach(() => {
  buttonHandlers.clear();
  modalHandlers.clear();
  createLog.mockClear();
  spyOn(console, "error").mockImplementation(() => {});
  spyOn(console, "warn").mockImplementation(() => {});
});

describe("button routing", () => {
  it("hands the press to its namespace's handler, with the rest of the id as args", async () => {
    const execute = mock(async () => undefined);
    buttonHandlers.set("v2_card_view", { namespace: "v2_card_view", execute });
    const press = pressed("v2_card_view:card1:user1");

    await handleButtonInteraction(press as never);

    expect(execute).toHaveBeenCalledWith(press, ["card1", "user1"]);
  });

  it("leaves buttons owned by a message's own collector alone", async () => {
    const press = pressed("v2pack-next");

    await handleButtonInteraction(press as never);

    expect(press.reply).not.toHaveBeenCalled();
  });

  it("says so for a button nobody handles", async () => {
    const press = pressed("gone:1");

    await handleButtonInteraction(press as never);

    expect(press.reply).toHaveBeenCalledWith({
      content: "❌ Unknown button action",
      flags: [MessageFlags.Ephemeral],
    });
  });

  it("tells the player when a handler fails before answering", async () => {
    buttonHandlers.set("boom", {
      namespace: "boom",
      execute: async () => {
        throw new Error("broken");
      },
    });
    const press = pressed("boom");

    await handleButtonInteraction(press as never);

    expect(press.reply).toHaveBeenCalledWith(failure("button"));
  });

  // It used to stay silent here, leaving the player on "thinking...".
  it("still tells the player when a handler fails after deferring", async () => {
    const press: Pressed = pressed("boom", { deferred: true, replied: false });
    buttonHandlers.set("boom", {
      namespace: "boom",
      execute: async () => {
        throw new Error("broken");
      },
    });

    await handleButtonInteraction(press as never);

    expect(press.reply).not.toHaveBeenCalled();
    expect(press.followUp).toHaveBeenCalledWith(failure("button"));
  });
});

describe("form routing", () => {
  it("hands a submitted form to its namespace's handler", async () => {
    const execute = mock(async () => undefined);
    modalHandlers.set("weave_words", { namespace: "weave_words", execute });
    const form = pressed("weave_words:round1");

    await handleModalInteraction(form as never);

    expect(execute).toHaveBeenCalledWith(form, ["round1"]);
  });

  it("tells the player when a form handler fails after answering", async () => {
    modalHandlers.set("boom", {
      namespace: "boom",
      execute: async () => {
        throw new Error("broken");
      },
    });
    const form = pressed("boom", { deferred: false, replied: true });

    await handleModalInteraction(form as never);

    expect(form.followUp).toHaveBeenCalledWith(failure("modal"));
  });
});

describe("form logging", () => {
  it("logs a submitted form with its fields, channel and reply", async () => {
    modalHandlers.set("anistock_buy_modal", {
      namespace: "anistock_buy_modal",
      execute: async () => undefined,
    });
    const form = {
      ...pressed("anistock_buy_modal:anime1:29.75"),
      fields: {
        fields: new Map([["quantity", { customId: "quantity", value: "5" }]]),
      },
    };

    await handleModalInteraction(form as never);

    expect(createLog).toHaveBeenCalledWith({
      command: "modal:anistock_buy_modal",
      input: "customId: anistock_buy_modal:anime1:29.75,\nquantity: 5",
      output: "Bought 5 shares!",
      server_id: "guild1",
      channel_id: "channel1",
      user_id: "user1",
    });
  });

  it("still logs a form whose handler failed", async () => {
    modalHandlers.set("boom", {
      namespace: "boom",
      execute: async () => {
        throw new Error("broken");
      },
    });

    await handleModalInteraction(pressed("boom") as never);

    expect(createLog).toHaveBeenCalledTimes(1);
  });

  it("does not log a form nobody handles", async () => {
    await handleModalInteraction(pressed("gone:1") as never);

    expect(createLog).not.toHaveBeenCalled();
  });
});
