import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { addCoin, getUserBalance } from "../finicoin";
import { renderCardMedia } from "./cardArt";
import { toBattleCard } from "./cardStore";
import {
  buybackPrice,
  findSellable,
  handOver,
  sellToFini,
  stillOwns,
} from "./market";
import { rarityLabel } from "./ui/theme";

/**
 * `/finicard sell`: v1's `/sell-card`, for v2 cards.
 *
 * Three ways to sell, by who the card is offered to:
 *   - nobody named: anyone but the seller may buy it at the asking price;
 *   - a player: only they may accept, at the asking price - a trade;
 *   - Fini itself: Fini buys it at a fixed price for what the card is, and
 *     the copy is destroyed.
 *
 * The listing stays open for ten minutes. The card is checked again at the
 * moment of sale, since it may have gone elsewhere while the listing sat.
 */

const LISTING_MS = 600_000;

export const runSell = async (
  interaction: ChatInputCommandInteraction,
  context: { serverId: string; serverName: string },
): Promise<void> => {
  const { serverId, serverName } = context;
  const seller = interaction.user;
  const typed = interaction.options.getString("card", true);
  const asking = Math.max(0, interaction.options.getInteger("price") ?? 0);
  const buyer = interaction.options.getUser("who");
  const toFini = !!buyer && buyer.id === interaction.client.user.id;

  if (buyer && !toFini && (buyer.bot || buyer.id === seller.id)) {
    await interaction.editReply(
      "Pick another player to sell to, or leave `who` blank to offer it to anyone.",
    );
    return;
  }

  const copy = await findSellable(seller.id, serverId, typed);
  if (!copy) {
    await interaction.editReply(
      `\`${typed}\` isn't one of your cards. Card ids are listed in \`/finicard collection\`.`,
    );
    return;
  }

  const card = toBattleCard(copy);
  const price = toFini ? buybackPrice(card) : asking;
  const title = `**${card.name}** (${rarityLabel(card)}${card.foil ? ", foil" : ""})`;
  const media = await renderCardMedia(card);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("v2sell-cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("v2sell-buy")
      .setLabel(
        toFini
          ? "Confirm"
          : buyer
            ? `(${buyer.username}) I accept`
            : "(Anyone) Purchase",
      )
      .setStyle(toFini ? ButtonStyle.Danger : ButtonStyle.Primary),
  );

  const message = await interaction.editReply({
    content: toFini
      ? `${seller}, sell your ${title} to Fini for ${price} fc? The card is gone for good.`
      : buyer
        ? `${seller} is offering their ${title} to ${buyer} for ${price} fc. ${buyer}, do you accept?`
        : `${seller} is selling their ${title} for ${price} fc. Anyone can buy it.`,
    components: [row],
    files: media
      ? [new AttachmentBuilder(media.buffer, { name: media.name })]
      : [],
  });

  let closed = false;
  const close = async (
    update: (content: string) => Promise<unknown>,
    content: string,
  ) => {
    closed = true;
    await update(content);
    collector.stop();
  };

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: LISTING_MS,
  });

  collector.on("end", async () => {
    if (closed) return;
    await interaction
      .editReply({
        content: `Nobody took ${seller}'s ${title} for ${price} fc.`,
        components: [],
      })
      .catch(() => undefined);
  });

  collector.on("collect", async (press) => {
    try {
      const done = (content: string) =>
        press.update({ content, components: [] });
      const isSeller = press.user.id === seller.id;
      const mayBuy = toFini
        ? isSeller
        : buyer
          ? press.user.id === buyer.id
          : !isSeller;
      const mayCancel =
        isSeller || (!!buyer && !toFini && press.user.id === buyer.id);

      if (press.customId === "v2sell-cancel") {
        if (!mayCancel) return void (await press.deferUpdate());
        return void (await close(
          done,
          `${press.user} cancelled the sale of ${title}.`,
        ));
      }

      if (!mayBuy) {
        return void (await press.reply({
          content: isSeller
            ? "You can't buy your own card."
            : "This offer isn't for you.",
          flags: [MessageFlags.Ephemeral],
        }));
      }

      // It may have been sold, traded or lost since the listing went up.
      if (!(await stillOwns(seller.id, copy.id ?? ""))) {
        return void (await close(
          done,
          `${seller} no longer has that ${title}, so the sale is off.`,
        ));
      }

      if (toFini) {
        await sellToFini(copy);
        await addCoin(
          seller.id,
          serverId,
          price,
          seller.username,
          serverName,
          "Reserve",
        );
        return void (await close(
          done,
          `${seller} sold their ${title} to Fini for ${price} fc.`,
        ));
      }

      const balance = (await getUserBalance(press.user.id, serverId)) || 0;
      if (balance < price) {
        return void (await press.reply({
          content: `That costs ${price} fc and you have ${balance}.`,
          flags: [MessageFlags.Ephemeral],
        }));
      }

      // Claimed before the money moves, so two quick presses cannot both buy.
      if (closed) return void (await press.deferUpdate());
      closed = true;
      if (price > 0) {
        await addCoin(
          seller.id,
          serverId,
          price,
          seller.username,
          serverName,
          press.user.id,
        );
      }
      await handOver(
        copy,
        press.user.id,
        `${press.user.username}-${serverName}`,
      );
      await done(`${press.user} bought ${seller}'s ${title} for ${price} fc.`);
      collector.stop();
    } catch (error) {
      console.error("Error during a v2 card sale", error);
      await press
        .reply({
          content: "Something went wrong with that sale.",
          flags: [MessageFlags.Ephemeral],
        })
        .catch(() => undefined);
    }
  });
};
