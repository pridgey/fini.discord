import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { typedOptionGetters } from "../mocks/typedOptionGetters";

const ok = (image: string | Buffer) => ({ image, success: true });

const mockGptImage = mock(async () => ok(Buffer.from("png bytes")));
const mockFlux = mock(async () => ok("https://example.org/flux.jpg"));
const mockNanoBanana = mock(
  async (_params: { prompt: string; imageInput?: string }) =>
    ok("https://example.org/banana.jpg"),
);
mock.module("../../modules/image/generateGptImage", () => ({
  GPT_IMAGE_COST: 10,
  generateGptImage: mockGptImage,
}));
mock.module("../../modules/image/generateFluxImage", () => ({
  FLUX_COST: 0,
  generateFluxImage: mockFlux,
}));
mock.module("../../modules/image/generateRefactorImage", () => ({
  REFACTOR_COST: 5,
  generateRefactorImage: mock(async () => ok("https://example.org/r.jpg")),
}));
mock.module("../../modules/image/generateNanoBananaImage", () => ({
  NANO_BANANA_COST: 5,
  generateNanoBananaImage: mockNanoBanana,
}));

const mockGetUserBalance = mock(async () => 100 as number | null);
const mockAddCoin = mock(async () => undefined);
mock.module("../../modules/finicoin", () => ({
  // Every export a command imports: Bun applies the latest mock of a module
  // to every file, and /help imports them all.
  getUserBalance: mockGetUserBalance,
  addCoin: mockAddCoin,
  runGame: async () => ({}),
}));

const { execute } = await import("../../commands/image.command");

type Options = {
  model: string;
  prompt: string;
  image?: { url: string; contentType: string };
};

const interactionWith = (options: Options) => {
  const interaction = {
    options: {
      ...typedOptionGetters,
      get: (name: string) =>
        name === "image"
          ? options.image && { attachment: options.image }
          : { value: options[name as keyof Options] },
    },
    user: { id: "user1" },
    guildId: "guild1",
    guild: { name: "Guild" },
    reply: mock(async () => undefined),
    deferReply: mock(async () => undefined),
    editReply: mock(async (_reply: unknown) => undefined),
  };
  return interaction;
};

const run = (interaction: ReturnType<typeof interactionWith>) =>
  execute(interaction as unknown as ChatInputCommandInteraction, () => {});

/** The files of the image reply, as discord.js attachments. */
const filesSent = (interaction: ReturnType<typeof interactionWith>) =>
  (
    interaction.editReply.mock.calls[0][0] as {
      files: { attachment: unknown }[];
    }
  ).files;

beforeEach(() => {
  for (const fn of [
    mockGptImage,
    mockFlux,
    mockNanoBanana,
    mockGetUserBalance,
    mockAddCoin,
  ]) {
    fn.mockClear();
  }
  mockGetUserBalance.mockImplementation(async () => 100);
});

describe("/image", () => {
  it("refuses an empty prompt without generating or charging", async () => {
    const interaction = interactionWith({ model: "gpt-image", prompt: "" });

    await run(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      "You need to give me something to work with.",
    );
    expect(mockGptImage).not.toHaveBeenCalled();
    expect(mockAddCoin).not.toHaveBeenCalled();
  });

  it("refuses a paid model when the player can't afford it", async () => {
    mockGetUserBalance.mockImplementation(async () => 3);
    const interaction = interactionWith({
      model: "gpt-image",
      prompt: "a cat",
    });

    await run(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      "You don't have enough fini coin to run this command.",
    );
    expect(mockGptImage).not.toHaveBeenCalled();
  });

  it("posts GPT Image's bytes as the attachment and charges its price", async () => {
    const interaction = interactionWith({
      model: "gpt-image",
      prompt: "a cat",
    });

    await run(interaction);

    const [file] = filesSent(interaction);
    expect(file.attachment).toEqual(Buffer.from("png bytes"));
    expect(mockAddCoin).toHaveBeenCalledWith(
      "Reserve",
      "guild1",
      10,
      "Reserve",
      "Guild",
      "user1",
    );
  });

  it("doesn't charge for a free model", async () => {
    const interaction = interactionWith({ model: "flux", prompt: "a cat" });

    await run(interaction);

    expect(filesSent(interaction)[0].attachment).toBe(
      "https://example.org/flux.jpg",
    );
    expect(mockGetUserBalance).not.toHaveBeenCalled();
    expect(mockAddCoin).not.toHaveBeenCalled();
  });

  it("doesn't charge when generation fails, and says why", async () => {
    mockGptImage.mockImplementationOnce(
      async () =>
        ({
          image: "",
          success: false,
          error: "content policy",
        }) as never,
    );
    const interaction = interactionWith({
      model: "gpt-image",
      prompt: "a cat",
    });

    await run(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      "I couldn't do it.\nPrompt: a cat\nError: content policy",
    );
    expect(mockAddCoin).not.toHaveBeenCalled();
  });

  it("hands an attached image to Nano-Banana and shows it beside the result", async () => {
    const image = {
      url: "https://cdn.example/in.png",
      contentType: "image/png",
    };
    const interaction = interactionWith({
      model: "nano-banana",
      prompt: "make it blue",
      image,
    });

    await run(interaction);

    expect(mockNanoBanana).toHaveBeenCalledWith({
      prompt: "make it blue",
      imageInput: image.url,
    });
    expect(filesSent(interaction).map((file) => file.attachment)).toEqual([
      image.url,
      "https://example.org/banana.jpg",
    ]);
  });
});
