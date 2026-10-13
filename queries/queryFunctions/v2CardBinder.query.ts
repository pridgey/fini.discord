import { AttachmentBuilder, ButtonStyle, ContainerBuilder } from "discord.js";
import { renderBinderPage } from "../../modules/finicardsV2/cardArt/binderPage";
import { toBattleCard } from "../../modules/finicardsV2/cardStore";
import { NEUTRAL_ACCENT, cardLine } from "../../modules/finicardsV2/ui/theme";
import type { V2UserCardRecord } from "../../types/PocketbaseTablesV2";
import { QueryFunction, ResultsBuilder } from "../../types/QueryTypes";
import { v2CardCollectionQuery } from "./v2CardCollection.query";

/**
 * The finicards v2 collection as a binder: a page of cards as one picture.
 *
 * The same cards in the same order as the list (`v2_card_collection`), six to
 * a page, drawn in their pockets. Under the picture each card still has its
 * line and its View button, numbered to match its pocket, so anything that can
 * be done from the list - opening a card, selling it to Fini - can be done
 * from here.
 */
const buildV2CardBinderResult = async ({
  items,
  userId,
  queryString,
  contextId,
}: ResultsBuilder<V2UserCardRecord>) => {
  const owned = items.filter((item) => !!item.expand?.card);
  const cards = owned.map((item) => toBattleCard({ ...item, definition: item.expand!.card }));

  const container = new ContainerBuilder().setAccentColor(NEUTRAL_ACCENT);
  container.addTextDisplayComponents((text) =>
    text.setContent(`## 📖 ${queryString || "Collection"}`),
  );

  const files: AttachmentBuilder[] = [];
  if (cards.length > 0) {
    // Named for its cards, so a page turn is a new image and not a cached one.
    const name = `binder-${owned.map((item) => (item.id ?? "").slice(0, 3)).join("")}.jpg`;
    files.push(new AttachmentBuilder(await renderBinderPage(cards), { name }));
    container.addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) =>
        item.setURL(`attachment://${name}`).setDescription("A page of the card binder"),
      ),
    );
  }

  for (const [index, card] of cards.entries()) {
    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) =>
          text.setContent(`**${index + 1}.** ${cardLine(card)} · \`${card.instanceId}\``),
        )
        .setButtonAccessory((button) =>
          button
            .setCustomId(`v2_card_view:${contextId}:${card.instanceId}:${userId}`)
            .setLabel("View")
            .setStyle(ButtonStyle.Secondary),
        ),
    );
  }

  container.addTextDisplayComponents((text) =>
    text.setContent("-# Pockets read left to right, top row first. Stats read power/wit/heart."),
  );

  return {
    components: [container],
    files,
    useComponentsV2: true,
  };
};

export const v2CardBinderQuery: QueryFunction<V2UserCardRecord> = {
  query: v2CardCollectionQuery.query,
  id: "v2_card_binder",
  buildResults: buildV2CardBinderResult,
};
