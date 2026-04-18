import { Attachment, AttachmentBuilder } from "discord.js";
import { createCardImage } from "../../modules/finicards/generateCardImage";
import { UserCardRecord } from "../../types/PocketbaseTables";
import {
  QueryFunction,
  QueryParams,
  ResultsBuilder,
} from "../../types/QueryTypes";
import { pb } from "../../utilities/pocketbase";

const queryBoosterPack = async ({
  page,
  perPage,
  filterOption,
  additionalData,
}: QueryParams) => {
  const results = await pb
    .collection<UserCardRecord>("user_card")
    .getList(page, perPage, {
      sort: "-created",
      filter: filterOption,
      expand: "card",
    });

  const { totalCards } = additionalData || {};

  return {
    items: results.items,
    totalItems: totalCards as number,
    totalPages: totalCards as number,
    currentPage: results.page,
    perPage: results.perPage,
  };
};

const buildBoosterPackResult = async ({
  items,
}: ResultsBuilder<UserCardRecord>) => {
  console.log("Building booster pack results with items:", items);
  const cardItem = items.at(0);

  if (!cardItem) {
    throw new Error("No card found in booster pack query results");
  }

  const cardBuffer = await createCardImage(cardItem.expand!.card);

  if (!cardBuffer) {
    throw new Error("No image found for card in booster pack query results");
  }

  const imageName = `${cardItem.user_id}-${cardItem.expand?.card.card_name}.png`;

  const attachmentBuilder = new AttachmentBuilder(cardBuffer, {
    name: imageName,
  });

  return {
    files: [attachmentBuilder],
  };
};

export const boosterPackQuery: QueryFunction<UserCardRecord> = {
  query: queryBoosterPack,
  id: "booster_pack",
  buildResults: buildBoosterPackResult,
};
