import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalSubmitInteraction,
} from "discord.js";
import {
  getBattle,
  submitDefenderSelection,
} from "../../modules/finicardsV2/battleStore";
import { loadLineupByIds, resolveLineup } from "../../modules/finicardsV2/cardStore";
import { renderCardAttachments } from "../../modules/finicardsV2/cardArt";
import { renderSelection } from "../../modules/finicardsV2/renderBattle";
import { RULES } from "../../modules/finicardsV2/rules";
import { canAfford, stakeWager } from "../../modules/finicardsV2/wagers";
import { splitBigString } from "../../utilities/splitBigString";

export const namespace = "v2_battle_selection";

/**
 * The defender's three cards land here, and this is the reveal.
 *
 * Both selections were made blind, so this is the first moment either player
 * sees what they are up against - full stats, keywords and all. The only thing
 * still hidden from here on is the ordering, which both players commit secretly.
 */
export async function execute(
  interaction: ModalSubmitInteraction,
  args: string[],
) {
  const [battleId] = args;

  await interaction.deferReply();

  const battle = await getBattle(battleId);

  if (!battle) {
    await interaction.editReply("❌ That battle no longer exists.");
    return;
  }
  if (battle.defender_id !== interaction.user.id) {
    await interaction.editReply("❌ This challenge isn't yours to answer.");
    return;
  }
  if (battle.state !== "awaiting_defender_selection") {
    await interaction.editReply(
      `❌ That battle is already ${battle.state.replace(/_/g, " ")}.`,
    );
    return;
  }

  const serverName = interaction.guild?.name ?? "unknown guild name";

  const rawSelection = Array.from({ length: RULES.rounds }, (_, index) =>
    interaction.fields.getTextInputValue(`card${index + 1}`),
  );

  const { cards, errors } = await resolveLineup(
    interaction.user.id,
    battle.server_id,
    rawSelection,
    RULES.rounds,
  );

  if (errors.length > 0 || cards.length !== RULES.rounds) {
    await interaction.editReply(
      `Couldn't bring those cards, so the challenge is still open:\n${errors
        .map((error) => `• ${error}`)
        .join("\n")}`,
    );
    return;
  }

  /* The challenger staked when they issued the challenge; the defender stakes
     here, at the moment they commit, so no match is decided on coin that turns
     out not to exist. */
  const defenderParty = {
    userId: battle.defender_id,
    serverId: battle.server_id,
    username: battle.defender_name,
    servername: serverName,
  };

  if (battle.wager > 0 && !(await canAfford(defenderParty, battle.wager))) {
    await interaction.editReply(
      `You can't cover the ${battle.wager} fc stake, so the challenge is still open.`,
    );
    return;
  }

  const outcome = await submitDefenderSelection(
    battleId,
    cards.map((card) => card.instanceId),
  );

  if (!outcome.ok) {
    await interaction.editReply(`❌ ${outcome.reason}`);
    return;
  }

  if (battle.wager > 0) {
    await stakeWager(defenderParty, battle.wager);
  }

  const challengerCards = await loadLineupByIds(
    battle.challenger_selection ?? [],
  );

  const orderButton = new ButtonBuilder()
    .setCustomId(`v2_order_open:${battleId}`)
    .setLabel("Choose your order")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(orderButton);

  const body = [
    `## Cards are on the table`,
    `<@${battle.challenger_id}> vs <@${battle.defender_id}>${
      battle.wager > 0 ? ` · ${battle.wager} fc each` : ""
    }`,
    "",
    renderSelection(challengerCards, battle.challenger_name),
    "",
    renderSelection(cards, battle.defender_name),
    "",
    "Both of you now pick your slot order in secret. The match resolves the moment the second order is in.",
  ].join("\n");

  const chunks = splitBigString(body);

  for (const [index, chunk] of chunks.entries()) {
    const isLast = index === chunks.length - 1;
    if (index === 0) {
      await interaction.editReply({
        content: chunk,
        ...(isLast && { components: [row] }),
      });
    } else {
      await interaction.followUp({
        content: chunk,
        ...(isLast && { components: [row] }),
      });
    }
  }

  /* The reveal is the one moment where seeing the actual cards matters, so both
     hands are posted as images. Six renders is well inside Discord's ten-file
     limit, and a failed render just means that card shows as text only. */
  const images = await renderCardAttachments([...challengerCards, ...cards]);

  if (images.length > 0) {
    await interaction.followUp({
      content: `Both hands — ${battle.challenger_name} first, then ${battle.defender_name}.`,
      files: images.map(
        (image) => new AttachmentBuilder(image.buffer, { name: image.name }),
      ),
    });
  }
}
