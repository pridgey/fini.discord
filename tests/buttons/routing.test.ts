import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { MessageFlags } from "discord.js";
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
