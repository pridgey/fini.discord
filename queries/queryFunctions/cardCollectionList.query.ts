import { ButtonStyle, ContainerBuilder } from "discord.js";
import { UserCardRecord } from "../../types/PocketbaseTables";
import {
  QueryFunction,
  QueryParams,
  ResultsBuilder,
} from "../../types/QueryTypes";
import { pb } from "../../utilities/pocketbase";

const queryFiniCardCollectionList = async ({
  page,
  perPage,
  filterOption,
}: QueryParams) => {
  const results = await pb
    .collection<UserCardRecord>("user_card")
    .getList(page, perPage, {
      sort: "card.rarity_order, card.id",
      filter: filterOption,
      expand: "card",
    });

  return {
    items: results.items,
    totalItems: results.totalItems,
    totalPages: results.totalPages,
    currentPage: results.page,
    perPage: results.perPage,
  };
};

const buildFiniCardCollectionListResult = async ({
  items,
}: ResultsBuilder<UserCardRecord>) => {
  const resultContainer = new ContainerBuilder();

  for (const item of items) {
    resultContainer.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(
            `## ${item.expand?.card.card_name}\n**Set:** ${item.expand?.card.set} • **Rarity:** \`${item.expand?.card.rarity}\` • **Unique ID:** ${item.id}\n\u200B\n`,
          ),
        )
        .setButtonAccessory((button) =>
          button
            .setCustomId(`view_userCard_detail:${item.id}:${item.user_id}`)
            .setLabel("View Card")
            .setStyle(ButtonStyle.Secondary),
        ),
    );
  }

  return {
    components: [resultContainer],
    useComponentsV2: true,
  };
};

export const cardCollectionListQuery: QueryFunction<UserCardRecord> = {
  query: queryFiniCardCollectionList,
  id: "card_collection_list",
  buildResults: buildFiniCardCollectionListResult,
};
