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
import { getItems, handOverItem, spendItem, stillHoldsItem } from "./itemStore";
import { itemBuybackPrice, itemTitle, pickRows } from "./itemMarket";
import { itemByKey } from "./items";

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
 *
 * A dungeon item sells the same three ways (`item` instead of `card`). Sold
 * to Fini, a collection piece goes back into the dungeon for someone else to
 * find - there's one of each per server.
 */

/** What's being sold: a card or an item, and how it changes hands. */
type Goods = {
  title: string;
  /** "card" or "item", for the wording. */
  noun: string;
  finiPrice: number;
  files: AttachmentBuilder[];
  stillOwned: () => Promise<boolean>;
  handOver: (toUserId: string, toUsername: string) => Promise<void>;
  sellToFini: () => Promise<void>;
  /** What happens to it when Fini buys it. */
  toFiniNote: string;
  /** Something the seller may not mean to part with: a favourite, a boon that's on. */
  warning?: string;
};

/** The seller's card or item, as goods, or why it can't be sold. */
const findGoods = async (
  interaction: ChatInputCommandInteraction,
  sellerId: string,
  serverId: string,
  serverName: string,
): Promise<Goods | string> => {
  const typedCard = interaction.options.getString("card");
  const typedItem = interaction.options.getString("item");
  if (!typedCard === !typedItem) {
    return "Name one thing to sell: a card's id in `card`, or a dungeon item in `item`.";
  }

  if (typedItem) {
    const { rows } = pickRows(await getItems(sellerId, serverId), [typedItem]);
    const row = rows[0];
    const item = row ? itemByKey(row.item) : undefined;
    if (!row || !item) {
      return `You don't have **${typedItem.trim()}**. Your items are in \`/finicard items\`.`;
    }
    return {
      title: itemTitle(item),
      noun: "item",
      finiPrice: itemBuybackPrice(item),
      files: [],
      stillOwned: () => stillHoldsItem(sellerId, row.id ?? ""),
      handOver: async (toUserId) => void (await handOverItem(row, toUserId)),
      sellToFini: async () => void (await spendItem(row.id ?? "")),
      toFiniNote:
        item.kind === "piece"
          ? "It goes back into the dungeon for someone else to find."
          : "It's gone for good.",
      ...(row.active
        ? { warning: "It's switched on for your next pack or run. Selling it switches it off." }
        : {}),
    };
  }

  const copy = await findSellable(sellerId, serverId, typedCard!);
  if (!copy) {
    return `\`${typedCard}\` isn't one of your cards. Card ids are listed in \`/finicard collection\`.`;
  }
  const card = toBattleCard(copy);
  const media = await renderCardMedia(card);
  return {
    title: `**${card.name}** (${rarityLabel(card)}${card.foil ? ", foil" : ""})`,
    noun: "card",
    finiPrice: buybackPrice(card),
    files: media
      ? [new AttachmentBuilder(media.buffer, { name: media.name })]
      : [],
    stillOwned: () => stillOwns(sellerId, copy.id ?? ""),
    handOver: (toUserId, toUsername) =>
      handOver(copy, toUserId, `${toUsername}-${serverName}`),
    sellToFini: () => sellToFini(copy),
    toFiniNote: "The card is gone for good.",
    ...(copy.favorite ? { warning: "It's one of your favourites." } : {}),
  };
};

const LISTING_MS = 600_000;

export const runSell = async (
  interaction: ChatInputCommandInteraction,
  context: { serverId: string; serverName: string },
): Promise<void> => {
  const { serverId, serverName } = context;
  const seller = interaction.user;
  const asking = Math.max(0, interaction.options.getInteger("price") ?? 0);
  const buyer = interaction.options.getUser("who");
  const toFini = !!buyer && buyer.id === interaction.client.user.id;

  if (buyer && !toFini && (buyer.bot || buyer.id === seller.id)) {
    await interaction.editReply(
      "Pick another player to sell to, or leave `who` blank to offer it to anyone.",
    );
    return;
  }

  const goods = await findGoods(interaction, seller.id, serverId, serverName);
  if (typeof goods === "string") {
    await interaction.editReply(goods);
    return;
  }

  const price = toFini ? goods.finiPrice : asking;
  const { title } = goods;

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

  const offer = toFini
    ? `${seller}, sell your ${title} to Fini for ${price} fc? ${goods.toFiniNote}`
    : buyer
      ? `${seller} is offering their ${title} to ${buyer} for ${price} fc. ${buyer}, do you accept?`
      : `${seller} is selling their ${title} for ${price} fc. Anyone can buy it.`;
  const message = await interaction.editReply({
    content: goods.warning ? `${offer}\n⚠️ ${goods.warning}` : offer,
    components: [row],
    files: goods.files,
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
            ? `You can't buy your own ${goods.noun}.`
            : "This offer isn't for you.",
          flags: [MessageFlags.Ephemeral],
        }));
      }

      // It may have been sold, traded or lost since the listing went up.
      if (!(await goods.stillOwned())) {
        return void (await close(
          done,
          `${seller} no longer has that ${title}, so the sale is off.`,
        ));
      }

      if (toFini) {
        await goods.sellToFini();
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
      await goods.handOver(press.user.id, press.user.username);
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
