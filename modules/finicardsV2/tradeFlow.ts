import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
  type User,
} from "discord.js";
import { addCoin, getUserBalance } from "../finicoin";
import { renderCardMedia } from "./cardArt";
import { toBattleCard } from "./cardStore";
import { findSellable, handOver, stillOwns } from "./market";
import type { OwnedCard } from "./types";
import { rarityLabel } from "./ui/theme";

/**
 * `/finicard trade`: one player offers another an exchange - any of their cards
 * and Finicoin for any of the other's. Only the other player can accept or
 * decline; the one who offered can cancel. Nothing moves until it's accepted,
 * and at that moment everything is checked again - either player may have
 * sold, traded or spent what was offered while the offer sat.
 *
 * The offer stays open for ten minutes, like a sale (`sellFlow.ts`).
 */

const TRADE_MS = 600_000;
/** Cards each side can put up: two sides of five is ten pictures, Discord's limit. */
export const MAX_CARDS_PER_SIDE = 5;

/** Card ids as typed: split on spaces and commas, lower-cased, each once. */
export const parseCardIds = (typed: string | null | undefined): string[] => [
  ...new Set(
    (typed ?? "")
      .split(/[\s,]+/)
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  ),
];

/** One side of a trade: what one player puts up. */
export type TradeSide = { user: User; cards: OwnedCard[]; fc: number };

const cardLine = (copy: OwnedCard): string => {
  const card = toBattleCard(copy);
  return `• **${card.name}** (${rarityLabel(card)}${card.foil ? ", foil" : ""}) \`${copy.id}\``;
};

/** What a side puts up, as lines, or a dash for nothing. */
export const sideLines = (side: TradeSide): string[] => {
  const lines = [
    ...side.cards.map(cardLine),
    ...(side.fc > 0 ? [`• 🪙 **${side.fc} fc**`] : []),
  ];
  return lines.length > 0 ? lines : ["• _nothing_"];
};

export const offerText = (from: TradeSide, to: TradeSide): string =>
  [
    `🔄 **Trade offer:** ${from.user} ⇄ ${to.user}`,
    "",
    `**${from.user} gives:**`,
    ...sideLines(from),
    "",
    `**${to.user} gives:**`,
    ...sideLines(to),
    "",
    `-# ${to.user} can accept or decline, and ${from.user} can cancel. Nothing changes hands until it's accepted, and traded cards leave any decks they're in. The offer expires in 10 minutes.`,
  ].join("\n");

/** Finds each typed id among `owner`'s cards; the ids it couldn't place come back too. */
const findCards = async (
  owner: User,
  serverId: string,
  ids: string[],
): Promise<{ cards: OwnedCard[]; missing: string[] }> => {
  const cards: OwnedCard[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const copy = await findSellable(owner.id, serverId, id);
    if (!copy) missing.push(id);
    // Two ids that pick out the same copy put it up once.
    else if (!cards.some((card) => card.id === copy.id)) cards.push(copy);
  }
  return { cards, missing };
};

/**
 * Why a trade can't go ahead right now, or null if it can: a card is no
 * longer its owner's, or a side can't cover the Finicoin it put up.
 */
const stillGood = async (sides: TradeSide[], serverId: string): Promise<string | null> => {
  for (const side of sides) {
    for (const copy of side.cards) {
      if (!(await stillOwns(side.user.id, copy.id ?? ""))) {
        return `${side.user} no longer has **${toBattleCard(copy).name}** \`${copy.id}\`, so the trade is off.`;
      }
    }
    if (side.fc > 0) {
      const balance = (await getUserBalance(side.user.id, serverId)) || 0;
      if (balance < side.fc) {
        return `${side.user} doesn't have the ${side.fc} fc they put up (they have ${balance}), so the trade is off.`;
      }
    }
  }
  return null;
};

/**
 * Carries out an accepted trade: checks it can still go ahead, then moves the
 * Finicoin and the cards. Returns why it couldn't, or null once it's done.
 */
export const completeTrade = async (
  from: TradeSide,
  to: TradeSide,
  serverId: string,
  serverName: string,
): Promise<string | null> => {
  const problem = await stillGood([from, to], serverId);
  if (problem) return problem;

  if (from.fc > 0) await addCoin(to.user.id, serverId, from.fc, to.user.username, serverName, from.user.id);
  if (to.fc > 0) await addCoin(from.user.id, serverId, to.fc, from.user.username, serverName, to.user.id);
  for (const copy of from.cards) await handOver(copy, to.user.id, `${to.user.username}-${serverName}`);
  for (const copy of to.cards) await handOver(copy, from.user.id, `${from.user.username}-${serverName}`);
  return null;
};

export const runTrade = async (
  interaction: ChatInputCommandInteraction,
  context: { serverId: string; serverName: string },
): Promise<void> => {
  const { serverId, serverName } = context;
  const proposer = interaction.user;
  const partner = interaction.options.getUser("with", true);

  if (partner.bot || partner.id === proposer.id) {
    await interaction.editReply("Pick another player to trade with.");
    return;
  }

  const giveIds = parseCardIds(interaction.options.getString("give"));
  const wantIds = parseCardIds(interaction.options.getString("want"));
  const giveFc = Math.max(0, interaction.options.getInteger("give_fc") ?? 0);
  const wantFc = Math.max(0, interaction.options.getInteger("want_fc") ?? 0);

  if (giveIds.length === 0 && wantIds.length === 0 && giveFc === 0 && wantFc === 0) {
    await interaction.editReply(
      "Put something in the trade: card ids in `give` or `want`, or Finicoin in `give_fc` or `want_fc`. Card ids are listed in `/finicard collection`.",
    );
    return;
  }
  if (giveIds.length > MAX_CARDS_PER_SIDE || wantIds.length > MAX_CARDS_PER_SIDE) {
    await interaction.editReply(`A trade can hold up to ${MAX_CARDS_PER_SIDE} cards from each player.`);
    return;
  }

  const [give, want] = await Promise.all([
    findCards(proposer, serverId, giveIds),
    findCards(partner, serverId, wantIds),
  ]);
  const problems = [
    ...give.missing.map((id) => `\`${id}\` isn't one of your cards.`),
    ...want.missing.map((id) => `\`${id}\` isn't one of ${partner}'s cards.`),
  ];
  if (problems.length > 0) {
    await interaction.editReply(
      [...problems, "-# Card ids are listed in `/finicard collection`."].join("\n"),
    );
    return;
  }

  const from: TradeSide = { user: proposer, cards: give.cards, fc: giveFc };
  const to: TradeSide = { user: partner, cards: want.cards, fc: wantFc };

  if (giveFc > 0) {
    const balance = (await getUserBalance(proposer.id, serverId)) || 0;
    if (balance < giveFc) {
      await interaction.editReply(`You're putting up ${giveFc} fc and you have ${balance}.`);
      return;
    }
  }

  const media = await Promise.all(
    [...from.cards, ...to.cards].map((copy) => renderCardMedia(toBattleCard(copy)).catch(() => null)),
  );
  const files = media.flatMap((item) =>
    item ? [new AttachmentBuilder(item.buffer, { name: item.name })] : [],
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("v2trade-accept").setLabel(`(${partner.username}) Accept`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("v2trade-decline").setLabel("Decline").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("v2trade-cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
  );

  const message = await interaction.editReply({
    content: offerText(from, to),
    components: [row],
    files,
  });

  let closed = false;
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: TRADE_MS,
  });

  const summary = `${proposer} ⇄ ${partner}`;

  collector.on("end", async () => {
    if (closed) return;
    await interaction
      .editReply({ content: `⌛ The trade ${summary} expired without an answer.`, components: [] })
      .catch(() => undefined);
  });

  collector.on("collect", async (press) => {
    try {
      const close = async (content: string) => {
        closed = true;
        await press.update({ content, components: [] });
        collector.stop();
      };
      const isProposer = press.user.id === proposer.id;
      const isPartner = press.user.id === partner.id;

      if (press.customId === "v2trade-cancel") {
        if (!isProposer) {
          return void (await press.reply({ content: "Only the player who offered this trade can cancel it.", ephemeral: true }));
        }
        return void (await close(`🚫 ${proposer} cancelled the trade with ${partner}.`));
      }

      if (!isPartner) {
        return void (await press.reply({
          content: isProposer ? `It's up to ${partner} to accept or decline.` : "This trade isn't yours to answer.",
          ephemeral: true,
        }));
      }

      if (press.customId === "v2trade-decline") {
        return void (await close(`❌ ${partner} declined ${proposer}'s trade.`));
      }

      // Accept. Claimed before anything moves, so two quick presses can't both trade.
      if (closed) return void (await press.deferUpdate());
      closed = true;

      const problem = await completeTrade(from, to, serverId, serverName);
      if (problem) {
        await press.update({ content: problem, components: [] });
        collector.stop();
        return;
      }

      await press.update({
        content: [
          `✅ **Traded:** ${summary}`,
          "",
          `**${proposer} gave:**`,
          ...sideLines(from),
          "",
          `**${partner} gave:**`,
          ...sideLines(to),
        ].join("\n"),
        components: [],
      });
      collector.stop();
    } catch (error) {
      console.error("Error during a v2 card trade", error);
      await press.reply({ content: "Something went wrong with that trade.", ephemeral: true }).catch(() => undefined);
    }
  });
};
