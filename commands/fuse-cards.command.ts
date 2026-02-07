import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import {
  CardDefinitionRecord,
  UserCardRecord,
} from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";

export const data = new SlashCommandBuilder()
  .setName("fuse-cards")
  .setDescription("Fuse alike cards together to gain something more");

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  await interaction.deferReply();
  const userId = interaction.user.id;
  const guildId = interaction.guildId ?? "unknown guild id";

  try {
    const allUserCards = await pb
      .collection<UserCardRecord>("user_card")
      .getFullList({
        filter: `user_id = "${userId}" && server_id = "${guildId}"`,
      });
    const allCardDefinitions = await pb
      .collection<CardDefinitionRecord>("card_definition")
      .getFullList();
    const userCardDefinitions = allCardDefinitions.filter((acd) =>
      allUserCards.some((auc) => auc.card === acd.id),
    );

    // Search for any fusion cards
    const hasFusionCard = userCardDefinitions.some(
      (ucd) => ucd.card_name === "Fusion",
    );

    if (!hasFusionCard) {
      await interaction.editReply(
        "You have no Fusion cards. You may not fuse without a Fusion card.",
      );
      return;
    }

    // Search for applicable fusion sets
    type FusionSet = {
      cardDefinition: CardDefinitionRecord;
      userCards: UserCardRecord[];
    };
    const fusionSets: FusionSet[] = [];
    const uniqueIds = new Set();

    for (let i = 0; i < userCardDefinitions.length; i++) {
      const currentCard = userCardDefinitions[i];
      const userCards = allUserCards.filter(
        (auc) => auc.card === currentCard.id,
      );

      // 10 uncommon cards -> 1 full art
      const uncommonSet = currentCard.rarity === "u" && userCards.length >= 10;
      // 5 common cards -> 1 uncommon card
      const commonSet = currentCard.rarity === "c" && userCards.length >= 5;
      // 3 item cards -> 1 common card
      const itemSet = currentCard.rarity === "i" && userCards.length >= 3;

      if (uncommonSet || commonSet || itemSet) {
        if (!uniqueIds.has(currentCard.id ?? "")) {
          // Add to fusion set
          fusionSets.push({
            cardDefinition: currentCard,
            userCards: userCards,
          });

          // Add to unique ids
          uniqueIds.add(currentCard.id ?? "");
        }
      }
    }

    const selectOptions: StringSelectMenuOptionBuilder[] = [];

    for (let i = 0; i < fusionSets.length; i++) {
      const fusionSet = fusionSets[i];
      const cardName = fusionSet.cardDefinition.card_name;
      const rarity = fusionSet.cardDefinition.rarity;
      const fusionNumber = rarity === "u" ? 10 : rarity === "c" ? 5 : 3;
      const upscaledRarity = rarity === "u" ? "fa" : rarity === "c" ? "u" : "c";

      selectOptions.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${cardName} (${rarity})`)
          .setDescription(
            `Trade ${fusionNumber} ${cardName} for 1 ${upscaledRarity} card.`,
          )
          .setValue(fusionSet.cardDefinition.id ?? ""),
      );
    }

    const selectMenus: any[] = [];
    for (let i = 0; i < selectOptions.length; i += 25) {
      selectMenus.push(
        new StringSelectMenuBuilder()
          .setCustomId(`menu-${i}`)
          .setPlaceholder("Make a selection!")
          .addOptions(selectOptions.slice(i, i + 25)),
      );
    }

    console.log("DEBUG:", { selectMenuslen: selectMenus.length });

    const rows = selectMenus.map((sm) => {
      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sm);
    });

    // const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    //   ...selectMenus
    // );

    // Showcase sets
    // const messages = splitBigString(
    //   `${fusionSets
    //     .map(
    //       (fs) =>
    //         `${fs.cardDefinition.card_name}-${fs.cardDefinition.rarity}x${fs.userCards.length}`
    //     )
    //     .join("\r\n")}`
    // );
    await interaction.editReply({
      content: "Fusion sets:",
      components: rows,
    });
    // messages.forEach(async (m) => {
    //   await interaction.followUp(m);
    // });
  } catch (err) {
    console.error("Error occurred during /fuse-cards", err);
    await interaction.editReply("An error has occurred");
  } finally {
    logCommand();
  }
};

/**
 * Fuse rules
 * 
 * Trade 3 cards of rarity x -> 1 card of rarity x (where x is not item or full art).
Trade 3 cards of rarity "Item" -> 1 card of rarity "Common"
Trade 5 cards of rarity "Common" -> 1 card of rarity "Uncommon"
Trade 10 cards of rarity "Uncommon" -> 1 card of rarity "Full Art"?
 * 
 */
