import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
} from "discord.js";
import { buildRevealMessage } from "../../modules/finicards/ui";
import { findDeckByName, getDecks } from "../../modules/finicards/decks";
import { HAND_SIZE, clampHandSize } from "../../modules/finicards/draw";
import { loadLineupByIds } from "../../modules/finicards/cardStore";
import {
  createChallenge,
  createPracticeBattle,
  getPendingBattlesForUser,
} from "../../modules/finicards/battleStore";
import { RULES } from "../../modules/finicards/rules";
import { canAfford, stakeWager } from "../../modules/finicards/wagers";
import type { FinicardContext } from "./context";
import { deckNames, pickDeck } from "./pickDeck";

/** `/finicard battle`, `practice` and `pending`: starting and answering battles. */

const MAX_PENDING_SHOWN = 5;

const NO_DECKS = `You have no decks. Build one with \`/finicard deck build name:Main\` - a battle deals ${HAND_SIZE} cards from it.`;

/** `/finicard battle` - challenges another player. */
export const startBattle = async (
  interaction: ChatInputCommandInteraction,
  { serverId, serverName }: FinicardContext,
): Promise<void> => {
  const opponent = interaction.options.getUser("opponent", true);
  const wager = interaction.options.getInteger("wager") ?? 0;
  const deckName = interaction.options.getString("deck");
  const handSize = clampHandSize(
    interaction.options.getInteger("draw") ?? HAND_SIZE,
  );

  if (opponent.id === interaction.user.id) {
    await interaction.editReply("You can't challenge yourself.");
    return;
  }
  if (opponent.bot) {
    await interaction.editReply(
      "Bots don't have decks. Challenge a person.",
    );
    return;
  }

  const picked = await pickDeck(interaction, serverId, deckName, NO_DECKS);
  if (!picked) return;
  const { deck } = picked;

  const opponentDecks = await getDecks(opponent.id, serverId);

  if (opponentDecks.length === 0) {
    await interaction.editReply(
      `${opponent.displayName} has no decks yet, so they can't answer a challenge.`,
    );
    return;
  }

  const party = {
    userId: interaction.user.id,
    serverId,
    username: interaction.user.username,
    servername: serverName,
  };

  if (!(await canAfford(party, wager))) {
    await interaction.editReply(
      `You can't cover a ${wager} fc stake right now.`,
    );
    return;
  }

  const created = await createChallenge({
    serverId,
    channelId: interaction.channelId,
    challengerId: interaction.user.id,
    challengerName: interaction.user.displayName,
    defenderId: opponent.id,
    defenderName: opponent.displayName,
    deck,
    wager,
    handSize,
  });

  if (!created.ok) {
    await interaction.editReply(created.reason);
    return;
  }

  await stakeWager(party, wager);

  const acceptButton = new ButtonBuilder()
    .setCustomId(`v2_battle_accept:${created.battle.id}:${opponent.id}`)
    .setLabel("Accept")
    .setStyle(ButtonStyle.Primary);
  const declineButton = new ButtonBuilder()
    .setCustomId(`v2_battle_decline:${created.battle.id}:${opponent.id}`)
    .setLabel("Decline")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    acceptButton,
    declineButton,
  );

  /* The challenger's hand is dealt now but shown to nobody - not even to
     them - until the defender accepts. That is what stops a challenger
     cancelling and re-issuing until they like their draw. */
  await interaction.editReply({
    content: [
      `## ${interaction.user.displayName} challenges ${opponent}`,
      `Bringing **${deck.name}**. ${handSize} cards are already dealt, face down.`,
      wager > 0 ? `**Wager:** ${wager} fc each` : "**Friendly** (no wager)",
      "",
      `${opponent}, accept with a deck of your own. Both hands are revealed the moment you do, and *then* you each pick ${RULES.rounds} of your ${handSize} in secret.`,
    ].join("\n"),
    components: [row],
  });
  return;
};

/** `/finicard practice` - a battle against your own decks, shown only to you. */
export const startPractice = async (
  interaction: ChatInputCommandInteraction,
  { serverId }: FinicardContext,
): Promise<void> => {
  const deckName = interaction.options.getString("deck");
  const againstName = interaction.options.getString("against");
  const handSize = clampHandSize(
    interaction.options.getInteger("draw") ?? HAND_SIZE,
  );

  const picked = await pickDeck(interaction, serverId, deckName, NO_DECKS);
  if (!picked) return;
  const { deck, decks } = picked;

  // Blank plays the deck against itself, dealt as two separate hands.
  const against = againstName
    ? await findDeckByName(interaction.user.id, serverId, againstName)
    : deck;

  if (!against) {
    await interaction.editReply(
      `You have no deck called **${againstName}**. Yours: ${deckNames(decks)}.`,
    );
    return;
  }

  const created = await createPracticeBattle({
    serverId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    deck,
    against,
    handSize,
  });

  if (!created.ok) {
    await interaction.editReply(created.reason);
    return;
  }

  const { battle } = created;
  const [challengerHand, defenderHand] = await Promise.all([
    loadLineupByIds(battle.challenger_hand),
    loadLineupByIds(battle.defender_hand),
  ]);

  await interaction.editReply(
    await buildRevealMessage({
      battleId: battle.id!,
      wager: 0,
      practice: true,
      challenger: {
        side: "challenger",
        name: battle.challenger_name,
        userId: interaction.user.id,
        cards: challengerHand,
      },
      defender: {
        side: "defender",
        name: battle.defender_name,
        userId: interaction.user.id,
        cards: defenderHand,
      },
    }),
  );
  return;
};

/** `/finicard pending` - battles waiting on the player, with a button for each. */
export const showPending = async (
  interaction: ChatInputCommandInteraction,
  { serverId }: FinicardContext,
): Promise<void> => {
  const pending = await getPendingBattlesForUser(
    interaction.user.id,
    serverId,
  );

  if (pending.length === 0) {
    await interaction.editReply("Nothing is waiting on you.");
    return;
  }

  const shown = pending.slice(0, MAX_PENDING_SHOWN);

  const rows = shown.map((battle) => {
    const awaitingCards = battle.state === "awaiting_defender";
    const opponentName =
      battle.challenger_id === interaction.user.id
        ? battle.defender_name
        : battle.challenger_name;

    const action = awaitingCards
      ? new ButtonBuilder()
          .setCustomId(
            `v2_battle_accept:${battle.id}:${interaction.user.id}`,
          )
          .setLabel(`Accept ${opponentName}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
      : new ButtonBuilder()
          .setCustomId(`v2_lineup_open:${battle.id}`)
          .setLabel(`Set lineup vs ${opponentName}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary);

    const buttons = [action];

    // Only an unanswered challenge can still be declined.
    if (awaitingCards) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(
            `v2_battle_decline:${battle.id}:${interaction.user.id}`,
          )
          .setLabel("Decline")
          .setStyle(ButtonStyle.Secondary),
      );
    }

    return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
  });

  const lines = shown.map((battle) => {
    const opponentName =
      battle.challenger_id === interaction.user.id
        ? battle.defender_name
        : battle.challenger_name;
    const need =
      battle.state === "awaiting_defender"
        ? "accept with a deck"
        : "set your lineup";
    return `• **${opponentName}** — ${need}${battle.wager > 0 ? ` · ${battle.wager} fc` : ""}`;
  });

  await interaction.editReply({
    content: `### ${pending.length} battle(s) waiting on you\n${lines.join("\n")}${
      pending.length > shown.length
        ? `\n\n_Showing the ${shown.length} most recent._`
        : ""
    }`,
    components: rows,
  });
  return;
};
