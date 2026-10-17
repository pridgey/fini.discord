import {
  AttachmentBuilder,
  ComponentType,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  MessageFlags,
} from "discord.js";
import {
  LEGENDARY_REVEAL_MS,
  PACK_OPENING_MS,
  renderCardMedia,
  type CardMedia,
} from "./cardArt";
import type { BattleCard } from "./types";
import {
  PACK_BUTTON,
  buildPackCardMessage,
  buildPackCoverMessage,
  buildPackMessage,
  buildPackOpeningMessage,
  type PackMessageInput,
} from "./ui/cardMessage";
import { warnAndUse } from "../../utilities/fallback";
import { keptFiles, type KeptFile } from "../../utilities/discord/keptFiles";

/**
 * Opening a pack, the way v1 did it: the sealed pack and a button, then the
 * cards one at a time.
 *
 *   sealed pack -> "Open pack" -> the pack tears open -> card 1 -> ... -> the
 *   whole pack, laid out together -> "Buy another pack" -> a new sealed pack
 *
 * One at a time is what gives a Legendary or a Secret Art its moment: its
 * reveal plays when its turn comes, alone on the message, instead of in a row
 * of five.
 *
 * The cards are already the player's by the time the sealed pack is shown.
 * Nothing here can lose them: walk away, and the message settles on the whole
 * pack when the buttons time out.
 */

/** How long a pack waits to be opened and paged through. */
const PACK_MS = 10 * 60 * 1000;

/** Slack after an animation's length, for Discord to fetch and start it. */
const LOAD_MS = 1200;
/** How long a Legendary's reveal rests on its last frame before it loops. */
const REVEAL_REST_MS = 2500;

/** Rarest last, so the pack builds to its best card. */
const SHOW_ORDER = (card: BattleCard): number =>
  card.legendary
    ? 4
    : card.secretArt
      ? 3
      : { common: 0, uncommon: 1, full_art: 2 }[card.rarity];

/** The order a pack's cards are turned over in. */
export const packShowOrder = (cards: BattleCard[]): BattleCard[] =>
  cards
    .map((card, index) => ({ card, index }))
    .sort(
      (a, b) => SHOW_ORDER(a.card) - SHOW_ORDER(b.card) || a.index - b.index,
    )
    .map(({ card }) => card);

type Built = {
  components: unknown[];
  files: AttachmentBuilder[];
  flags: unknown;
};

/** Anything that can put a new screen on the pack's message. */
type Surface = {
  /** Answers a press with the new screen in one go. Absent once acknowledged. */
  update?: (payload: object) => Promise<unknown>;
  acknowledge?: () => Promise<unknown>;
  editReply: (payload: object) => Promise<Message>;
};

/** The way on to another pack of the same kind, offered under the whole pack. */
export type PackAgain = {
  label: string;
  /**
   * Buys the next pack and presents it on `press`, whose reply is already
   * deferred - so the new pack is a message of its own, and this one stays as
   * the record of what it held.
   */
  buy: (press: ButtonInteraction) => Promise<void>;
};

export const presentPack = async (
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  input: Omit<PackMessageInput, "reveal" | "again">,
  again?: PackAgain,
): Promise<void> => {
  const cards = packShowOrder(input.cards);
  const pack = { ...input, cards };

  // Nothing came out: there is no pack to open, only the news.
  if (cards.length === 0) {
    await interaction.editReply(await buildPackMessage(pack));
    return;
  }

  // Drawn while the sealed pack is on screen, so a press is not kept waiting.
  const stills = cards.map((card) => renderCardMedia(card));
  // The pulls worth an entrance: a Legendary, and a Secret Art.
  const reveals = cards.map((card) =>
    card.legendary || card.secretArt
      ? renderCardMedia(card, { reveal: true })
      : null,
  );
  // A failed drawing is logged here, once; where these are awaited later it
  // falls back to the card's text face without saying so again.
  for (const pending of [...stills, ...reveals])
    pending?.catch(warnAndUse(undefined, "draw a pack card"));

  const cover = await buildPackCoverMessage({
    size: cards.length,
    cost: input.cost,
    note: input.note,
    opener: input.opener,
  });
  const message = await interaction.editReply(cover);

  /**
   * The files the message already carries, by name. A message only shows the
   * attachments its components point at, so the rest can ride along unseen -
   * and a screen whose files are all here is sent as a few bytes of layout,
   * with nothing to upload. That is what makes "Next card" quick.
   */
  let held = new Map<string, KeptFile>();
  const hold = (sent: Message) => {
    held = new Map(keptFiles(sent).map((file) => [file.filename, file]));
  };
  hold(message);

  const put = async (surface: Surface, built: Built): Promise<void> => {
    const layout = { components: built.components, flags: built.flags };
    const missing = built.files.filter((file) => !held.has(file.name ?? ""));

    try {
      if (missing.length === 0) {
        if (surface.update) return void (await surface.update(layout));
        return void (await surface.editReply(layout));
      }
      await surface.acknowledge?.();
      hold(
        await surface.editReply({
          ...layout,
          files: missing,
          attachments: [...held.values()],
        }),
      );
    } catch (error) {
      // The message was not carrying what we thought. Send the screen whole.
      console.error(
        "Pack screen sent in full after a failed quick edit",
        error,
      );
      await surface.acknowledge?.().catch(() => undefined);
      hold(await surface.editReply({ ...built, attachments: [] }));
    }
  };

  /**
   * The opening and every still, added to the sealed pack's message without
   * changing what it shows. Until this lands the buttons wait on it, so its
   * edit can never arrive after - and undo - a later screen.
   */
  const preload = (async () => {
    const opening = await buildPackOpeningMessage();
    // A Legendary's GIFs are large and slow to draw; they are not waited on
    // here, and go up when its turn comes.
    const drawn = (
      await Promise.all(
        stills.map((still, index) =>
          cards[index].legendary ? null : still.catch(() => null),
        ),
      )
    ).filter((media): media is CardMedia => !!media);
    hold(
      await interaction.editReply({
        components: cover.components,
        flags: cover.flags,
        files: [
          ...opening.files,
          ...drawn.map(
            (media) =>
              new AttachmentBuilder(media.buffer, { name: media.name }),
          ),
        ],
        attachments: [...held.values()],
      }),
    );
  })().catch((error) =>
    console.error("Couldn't preload a v2 pack's images", error),
  );

  /** Which screen is up. A timed swap only lands if this has not moved on. */
  let screen = 0;
  let shown = -1;
  let busy = false;
  let finished = false;
  /** The whole pack, or its last card, is up with an "another pack" button on it. */
  let offering = false;

  const showAll = async (surface: Surface) => {
    finished = true;
    screen += 1;
    await put(
      surface,
      await buildPackMessage({ ...pack, again: again?.label }),
    );
    // The collector is kept, when there is another pack to offer, to hear it asked for.
    if (again) offering = true;
    else collector.stop();
  };

  const showCard = async (index: number, surface: Surface): Promise<void> => {
    const card = cards[index];
    const still = await stills[index].catch(() => null);
    const reveal = (await reveals[index]?.catch(() => null)) ?? null;
    const first: CardMedia | null = reveal ?? still;

    // A card that cannot be drawn is not worth stopping the pack for.
    if (!first) {
      if (index >= cards.length - 1) return showAll(surface);
      return showCard(index + 1, surface);
    }

    shown = index;
    const here = (screen += 1);
    const last = index >= cards.length - 1;
    const view = (media: CardMedia) =>
      buildPackCardMessage({
        card,
        media,
        index,
        total: cards.length,
        opener: input.opener,
        // The last card offers the next pack too, without a trip to the summary.
        again: last ? again?.label : undefined,
      });
    await put(surface, view(first));
    if (last && again) offering = true;

    // The reveal plays once; the card is then swapped for how it stays - a
    // Legendary's loop, a Secret Art's still.
    if (reveal && still) {
      await Bun.sleep(LEGENDARY_REVEAL_MS + REVEAL_REST_MS);
      if (screen === here) {
        await put({ editReply: surface.editReply }, view(still)).catch(
          () => undefined,
        );
      }
    }
  };

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PACK_MS,
  });

  collector.on("end", async () => {
    // Out of time, or the next pack was asked for: either way the button goes.
    if (finished && !offering) return;
    offering = false;
    await preload;
    await put(
      { editReply: (payload) => interaction.editReply(payload) },
      await buildPackMessage(pack),
    ).catch(() => undefined);
  });

  collector.on("collect", async (press) => {
    if (press.user.id !== interaction.user.id) {
      await press
        .reply({
          content: "This pack isn't yours to open.",
          flags: [MessageFlags.Ephemeral],
        })
        .catch(() => undefined);
      return;
    }
    if (press.customId === PACK_BUTTON.again) {
      // One press, one pack: the button is spent before anything is awaited.
      if (!again || !offering || busy)
        return void (await press.deferUpdate().catch(() => undefined));
      busy = true;
      try {
        await press.deferReply();
        collector.stop();
        await again.buy(press);
      } catch (error) {
        console.error("Error while buying another v2 pack", error);
        await press
          .editReply("Something went wrong opening another pack.")
          .catch(() => undefined);
      }
      return;
    }
    // One step at a time: a second press while the first is still being
    // answered is acknowledged and dropped.
    if (busy || finished)
      return void (await press.deferUpdate().catch(() => undefined));
    busy = true;

    // A press has three seconds to be answered. It is answered with the new
    // screen itself when that is quick, and acknowledged first when not.
    let acknowledged = false;
    const acknowledge = async () => {
      if (acknowledged) return;
      acknowledged = true;
      await press.deferUpdate();
    };
    const surface = (): Surface => ({
      ...(acknowledged
        ? {}
        : {
            update: async (payload: object) => {
              await press.update(payload);
              acknowledged = true;
            },
          }),
      acknowledge,
      editReply: (payload) => press.editReply(payload),
    });

    try {
      // Rarely still in flight by the time anyone presses; see `preload`.
      const landed = await Promise.race([
        preload.then(() => true),
        Bun.sleep(1500).then(() => false),
      ]);
      if (!landed) {
        await acknowledge();
        await preload;
      }

      if (press.customId === PACK_BUTTON.all) {
        await showAll(surface());
      } else if (press.customId === PACK_BUTTON.open && shown < 0) {
        const opening = await buildPackOpeningMessage().catch(
          warnAndUse(null, "build the pack opening"),
        );
        if (opening) {
          screen += 1;
          await put(surface(), opening);
          await Bun.sleep(PACK_OPENING_MS + LOAD_MS);
        }
        busy = false;
        await showCard(0, surface());
      } else if (
        press.customId === PACK_BUTTON.next &&
        shown < cards.length - 1
      ) {
        busy = false;
        await showCard(shown + 1, surface());
      } else {
        await acknowledge();
      }
    } catch (error) {
      console.error("Error while opening a v2 pack", error);
    } finally {
      busy = false;
    }
  });
};
