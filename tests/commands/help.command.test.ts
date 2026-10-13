import { beforeEach, describe, expect, it, mock } from "bun:test";
import { autocomplete, data } from "../../commands/help.command";
import { resetCommandIndex } from "../../modules/help/commandIndex";

const autocompleteWith = (typed: string) => {
  const respond = mock((_choices: unknown) => Promise.resolve());

  return {
    interaction: {
      options: { getFocused: () => typed },
      respond,
    } as never,
    respond,
  };
};

const choices = (respond: ReturnType<typeof mock>) =>
  respond.mock.calls[0][0] as { name: string; value: string }[];

describe("/help command shape", () => {
  it("takes one optional, autocompleting command option", () => {
    const json = data.toJSON();
    const option = json.options?.[0] as {
      name: string;
      required?: boolean;
      autocomplete?: boolean;
    };

    expect(json.name).toBe("help");
    expect(option.name).toBe("command");
    expect(option.required).toBeFalsy();
    // Not addChoices: Discord caps choices at 25 and there are far more
    // commands than that.
    expect(option.autocomplete).toBe(true);
  });
});

describe("/help autocomplete", () => {
  beforeEach(() => {
    resetCommandIndex();
  });

  it("never returns more than Discord's 25 choices", async () => {
    // An empty query matches every command; there are over 40.
    const { interaction, respond } = autocompleteWith("");
    await autocomplete(interaction);

    expect(choices(respond).length).toBe(25);
  });

  it("filters by name", async () => {
    const { interaction, respond } = autocompleteWith("balan");
    await autocomplete(interaction);

    expect(choices(respond).map((c) => c.value)).toEqual(["balance"]);
  });

  it("also matches the description, for when you don't know the name", async () => {
    const { interaction, respond } = autocompleteWith("jackpot");
    await autocomplete(interaction);

    // /jackpot by name, and anything whose description mentions it.
    expect(choices(respond).map((c) => c.value)).toContain("jackpot");
  });

  it("sends the bare command name as the value", async () => {
    const { interaction, respond } = autocompleteWith("finicard");
    await autocomplete(interaction);

    const match = choices(respond).find((c) => c.value === "finicard");

    expect(match).toBeDefined();
    expect(match?.name).toContain("/finicard");
  });

  it("keeps every choice name inside Discord's 100-character limit", async () => {
    const { interaction, respond } = autocompleteWith("");
    await autocomplete(interaction);

    for (const choice of choices(respond)) {
      expect(choice.name.length).toBeLessThanOrEqual(100);
    }
  });

  it("responds with nothing rather than throwing on a miss", async () => {
    const { interaction, respond } = autocompleteWith("zzzz-nothing");
    await autocomplete(interaction);

    expect(choices(respond)).toEqual([]);
  });
});
