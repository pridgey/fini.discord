import { ChatInputCommandInteraction } from "discord.js";
import {
  buildCardMessage,
  compositionString,
} from "../../modules/finicards/ui";
import { buildCardPages } from "../../modules/finicards/cardPages";
import {
  buildCollectionQuery,
  type CollectionSort,
  type CollectionTier,
} from "../../modules/finicards/collectionFilters";
import {
  V2_USER_CARD,
  collectionComposition,
  getUserCollection,
  resolveLineup,
} from "../../modules/finicards/cardStore";
import { pb } from "../../utilities/pocketbase";
import { getBattleRecordForUser } from "../../modules/finicards/battleStore";
import { renderCardFace } from "../../modules/finicards/renderBattle";
import type { CardType } from "../../types/PocketbaseTablesV2";
import type { FinicardContext } from "./context";

/** `/finicard collection`, `card` and `record`: looking at cards. */

/** `/finicard collection` - pages of a player's cards, filtered and sorted. */
export const showCollection = async (
  interaction: ChatInputCommandInteraction,
  { serverId }: FinicardContext,
): Promise<void> => {
  const target = interaction.options.getUser("who") ?? interaction.user;

  const collection = await getUserCollection(target.id, serverId);

  if (collection.length === 0) {
    await interaction.editReply(
      `${target.id === interaction.user.id ? "You have" : `${target.displayName} has`} no cards yet. Try \`/finicard pack\`.`,
    );
    return;
  }

  const owner = pb.filter("user_id = {:user_id} && server_id = {:server_id}", {
    user_id: target.id,
    server_id: serverId,
  });
  const asked = buildCollectionQuery({
    sort: interaction.options.getString("sort") as CollectionSort | null,
    type: interaction.options.getString("type") as CardType | null,
    tier: interaction.options.getString("rarity") as CollectionTier | null,
    set: interaction.options.getInteger("set"),
    foil: interaction.options.getBoolean("foil"),
    keyword: interaction.options.getBoolean("ability"),
    search: interaction.options.getString("search"),
  });
  const filter = asked.filter ? `${owner} && ${asked.filter}` : owner;

  // The whole collection was just read to count it and work out its
  // composition; the pages themselves are served by the shared system.
  let heading = `${target.displayName} — ${collection.length} card${
    collection.length === 1 ? "" : "s"
  } ${compositionString(collectionComposition(collection))}`;

  if (asked.filter) {
    const matching = (
      await pb
        .collection(V2_USER_CARD)
        .getList(1, 1, { filter, fields: "id", requestKey: null })
    ).totalItems;
    if (matching === 0) {
      await interaction.editReply(
        `None of ${target.id === interaction.user.id ? "your" : `${target.displayName}'s`} ${collection.length} cards match: ${asked.summary}.`,
      );
      return;
    }
    heading = `${target.displayName} — ${matching} of ${collection.length} cards · ${asked.summary}`;
  }
  if (asked.order) heading += ` · by ${asked.order}`;

  await interaction.editReply(
    await buildCardPages({
      viewerId: interaction.user.id,
      heading,
      filter,
      sort: asked.sort,
      binder: interaction.options.getString("view") === "binder",
    }),
  );
  return;
};

/** `/finicard card` - one card, rendered. */
export const showCard = async (
  interaction: ChatInputCommandInteraction,
  { serverId }: FinicardContext,
): Promise<void> => {
  const rawId = interaction.options.getString("id", true);
  const { cards, errors } = await resolveLineup(
    interaction.user.id,
    serverId,
    [rawId],
    1,
  );

  if (cards.length === 0) {
    await interaction.editReply(
      errors.join("\n") || `No card of yours matches \`${rawId}\`.`,
    );
    return;
  }

  /* The rendered card carries the name, stats, tags and ability, so the
     text face is only needed when the render fails. */
  const message = await buildCardMessage(cards[0]);

  if (!message) {
    await interaction.editReply(renderCardFace(cards[0]));
    return;
  }

  await interaction.editReply(message);
  return;
};

/** `/finicard record` - wins, losses and the collection's make-up. */
export const showRecord = async (
  interaction: ChatInputCommandInteraction,
  { serverId }: FinicardContext,
): Promise<void> => {
  const record = await getBattleRecordForUser(interaction.user.id, serverId);
  const collection = await getUserCollection(interaction.user.id, serverId);

  await interaction.editReply(
    [
      `### ${interaction.user.displayName} — v2 record`,
      `**${record.wins}W / ${record.losses}L / ${record.draws}D**`,
      `**Collection:** ${collection.length} cards ${compositionString(collectionComposition(collection))}`,
    ].join("\n"),
  );
  return;
};
