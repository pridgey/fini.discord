import type { ChatInputCommandInteraction } from "discord.js";
import {
  getCardDefinitions,
  getPopulationCounts,
  grantCard,
  rollCopyKeyword,
  toBattleCard,
} from "../../modules/finicards/cardStore";
import {
  activateItem,
  getItems,
  spendPieces,
  summonedHolders,
} from "../../modules/finicards/itemStore";
import { COLLECTIONS, type CollectionKey } from "../../modules/finicards/items";
import { planUse } from "../../modules/finicards/useItem";
import {
  SUMMON_FILE,
  SUMMON_MS,
  renderSummonGif,
} from "../../modules/finicards/cardArt/summonAnimation";
import { renderCardMedia } from "../../modules/finicards/cardArt/legendaryGif";
import {
  buildSummonMessage,
  buildSummonNotice,
} from "../../modules/finicards/ui/summonMessage";
import { getBotChannelForServer } from "../../utilities/config/configUtils";
import { sendTo } from "../../modules/dailies/shared";
import type { FinicardContext } from "./context";

/** How long the card rests at the end of the animation before the still takes over. */
const REST_MS = 1500;

/** `/finicard use` - switch a boon on, or summon a completed set's card. */
export const useItem = async (
  interaction: ChatInputCommandInteraction,
  { serverId, identifier }: FinicardContext,
): Promise<void> => {
  const typed = interaction.options.getString("item", true);
  const [items, holders] = await Promise.all([
    getItems(interaction.user.id, serverId),
    summonedHolders(serverId),
  ]);
  const plan = planUse(typed, items, holders);

  if (plan.kind === "say") {
    await interaction.editReply({
      content: plan.text,
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (plan.kind === "activate") {
    await activateItem(plan.row.id ?? "");
    await interaction.editReply(plan.text);
    return;
  }
  await summon(interaction, plan.set, plan.rows, serverId, identifier);
};

const summon = async (
  interaction: ChatInputCommandInteraction,
  set: CollectionKey,
  /** One of each of the set's pieces, as the player holds them. */
  pieces: Awaited<ReturnType<typeof getItems>>,
  serverId: string,
  identifier: string,
): Promise<void> => {
  const { summons } = COLLECTIONS[set];
  const definition = (await getCardDefinitions({ includeInactive: true })).find(
    (each) => each.card_name === summons && each.rarity === "summoned",
  );
  if (!definition?.id) {
    await interaction.editReply(
      `**${summons}** isn't ready to be summoned yet. Your pieces are safe.`,
    );
    return;
  }
  // One per server, checked again at the last moment.
  const counts = await getPopulationCounts(serverId);
  if ((counts.get(definition.id) ?? 0) > 0) {
    await interaction.editReply(
      `**${summons}** has already been summoned on this server. Your pieces are safe.`,
    );
    return;
  }

  // The card first, then the pieces: a failure between leaves the player
  // with both, never with neither.
  const record = await grantCard({
    userId: interaction.user.id,
    serverId,
    identifier,
    definitionId: definition.id,
    keyword: rollCopyKeyword(definition.rarity),
    acquiredFrom: "summon",
  });
  await spendPieces(
    pieces,
    pieces.map((row) => row.item),
  );

  const card = toBattleCard({ ...record, definition });
  const gif = await renderSummonGif(set, card);
  const message = await interaction.editReply(
    buildSummonMessage({
      set,
      card,
      userId: interaction.user.id,
      media: gif ? { name: SUMMON_FILE, buffer: gif } : await renderCardMedia(card),
      resting: !gif,
    }),
  );

  // The server hears of it in the bot channel, unless that's where it happened.
  const botChannel = await getBotChannelForServer(serverId).catch(() => null);
  if (botChannel && botChannel !== interaction.channelId) {
    await sendTo(
      interaction.client,
      botChannel,
      buildSummonNotice(set, interaction.user.id, message.url),
    );
  }

  if (!gif) return;
  await new Promise((resolve) => setTimeout(resolve, SUMMON_MS + REST_MS));
  const still = await renderCardMedia(card);
  await interaction
    .editReply({
      ...buildSummonMessage({
        set,
        card,
        userId: interaction.user.id,
        media: still,
        resting: true,
      }),
      attachments: [],
    })
    .catch((error) => console.error("Couldn't settle a summoning:", error));
};
