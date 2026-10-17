import { describe, expect, it } from "bun:test";
import {
  ContainerBuilder,
  MessagePayload,
  type MessageEditOptions,
} from "discord.js";
import { keptFiles } from "../../utilities/discord/keptFiles";

const CDN =
  "https://cdn.discordapp.com/attachments/829091125234237440/1561124804415725659/dailies-yesterday.png?ex=6ad53645&is=6ad3e4c5&hm=abc";

/** A card showing a file, as Discord sends it back: by its CDN link. */
const cardShowing = (url: string) =>
  new ContainerBuilder().addMediaGalleryComponents((gallery) =>
    gallery.addItems((item) => item.setURL(url)),
  );

describe("keeping a message's files through an edit", () => {
  it("finds the files a message's cards show, though `attachments` is empty", () => {
    const message = { components: [cardShowing(CDN)], attachments: new Map() };

    expect(keptFiles(message)).toEqual([
      { id: "1561124804415725659", filename: "dailies-yesterday.png" },
    ]);
  });

  it("also keeps files no card shows, once each", () => {
    const message = {
      components: [cardShowing(CDN)],
      attachments: new Map([
        ["1", { id: "1", name: "opening.gif" }],
        [
          "1561124804415725659",
          { id: "1561124804415725659", name: "dailies-yesterday.png" },
        ],
      ]),
    };

    expect(
      keptFiles(message)
        .map((file) => file.filename)
        .sort(),
    ).toEqual(["dailies-yesterday.png", "opening.gif"]);
  });

  it("ignores links that aren't the message's own files", () => {
    const message = {
      components: [cardShowing("https://example.org/cat.png")],
    };
    expect(keptFiles(message)).toEqual([]);
  });

  it("sends each kept file by id and file name, which Discord matches attachment:// against", () => {
    const options: MessageEditOptions = {
      attachments: keptFiles({ components: [cardShowing(CDN)] }),
    };
    const body = new MessagePayload(
      { client: { options: {} } } as never,
      options,
    ).resolveBody().body as { attachments: unknown[] };

    expect(body.attachments).toEqual([
      { id: "1561124804415725659", filename: "dailies-yesterday.png" },
    ]);
  });
});
