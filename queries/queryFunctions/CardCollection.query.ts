import { AttachmentBuilder } from "discord.js";
import { createCardImage } from "../../modules/finicards/generateCardImage";
import { UserCardRecord } from "../../types/PocketbaseTables";
import {
  QueryFunction,
  QueryParams,
  ResultsBuilder,
} from "../../types/QueryTypes";
import { pb } from "../../utilities/pocketbase";

const queryFiniCardCollection = async ({
  page,
  perPage,
  filterOption,
}: QueryParams) => {
  const results = await pb
    .collection<UserCardRecord>("user_card")
    .getList(page, perPage, {
      sort: "card.rarity_order",
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

const buildFiniCardCollectionResult = async ({
  items,
}: ResultsBuilder<UserCardRecord>) => {
  const cardItem = items.at(0);

  if (!cardItem) {
    throw new Error("No card found in fini card collection query results");
  }

  const cardBuffer = await createCardImage(cardItem.expand!.card);

  if (!cardBuffer) {
    throw new Error(
      "No image found for card in fini card collection query results",
    );
  }

  const imageName = `${cardItem.user_id}-${cardItem.expand?.card.card_name}.png`;

  const attachmentBuilder = new AttachmentBuilder(cardBuffer, {
    name: imageName,
  });

  return {
    files: [attachmentBuilder],
  };
};

export const cardCollectionQuery: QueryFunction<UserCardRecord> = {
  query: queryFiniCardCollection,
  id: "card_collection",
  buildResults: buildFiniCardCollectionResult,
};
