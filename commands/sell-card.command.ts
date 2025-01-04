import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
} from "discord.js";
import { pb } from "../utilities/pocketbase";
import {
  CardDefinitionRecord,
  UserCardRecord,
} from "../types/PocketbaseTables";
import { createCardImage } from "../modules/finicards/generateCardImage";
import { addCoin, getUserBalance } from "../modules/finicoin";

export const data = new SlashCommandBuilder()
  .setName("sell-card")
  .setDescription("Sell a Finicard")
  .addStringOption((opt) =>
    opt
      .setName("card")
      .setDescription("The ID of your Finicard")
      .setRequired(true)
  )
  .addNumberOption((opt) =>
    opt
      .setName("price")
      .setDescription("The Price (Finicoin) to sell the card for")
      .setRequired(true)
      .setMinValue(0)
  )
  .addUserOption((opt) =>
    opt
      .setName("who")
      .setDescription("Who to sell the card to (leave blank to sell to anyone)")
      .setRequired(false)
  );

export const execute = async (
  interaction: CommandInteraction,
  logCommand: () => void
) => {
  await interaction.deferReply();

  try {
    const sellingCardId: string =
      interaction.options.get("card")?.value?.toString() ?? "";
    const sellingPrice: number = Number(
      interaction.options.get("price")?.value || 0
    );
    const targetUser = interaction.options.getUser("who");
    const targetUserDefined = !!targetUser;

    if (!sellingCardId) {
      await interaction.editReply(
        "You need to provide a valid card ID to sell. You can find it using the `/card-collection` command with the `list` option set to True."
      );
      return;
    }

    // Check if the card exists
    const userCardResponse = await pb
      .collection<UserCardRecord>("user_card")
      .getFullList({
        filter: `id = "${sellingCardId}" && server_id = "${interaction.guildId}" && user_id = "${interaction.user.id}"`,
      });
    const userCardRecord = userCardResponse?.at(0);

    if (!userCardRecord) {
      await interaction.editReply(
        `The Card ID (${sellingCardId}) did not validate as a card that you own. You can find your cards using the \`/card-collection\` command with the \`list\` option set to True.`
      );
      return;
    }

    // Get Card definition record
    const cardDefinitionResponse = await pb
      .collection<CardDefinitionRecord>("card_definition")
      .getFullList({
        filter: `id = "${userCardRecord.card}"`,
      });
    const cardDefinition = cardDefinitionResponse.at(0);

    if (!cardDefinition) {
      await interaction.editReply(
        `An issue occurred trying to list your card (${sellingCardId}) for sale. Please try again later.`
      );
      return;
    }

    // Create button interactions
    const cancelButton = new ButtonBuilder()
      .setCustomId("cancel-trade")
      .setLabel("Cancel Trade")
      .setStyle(ButtonStyle.Secondary);
    const acceptButton = new ButtonBuilder()
      .setCustomId("purchase")
      .setLabel(
        targetUserDefined
          ? `(${targetUser.username}) I Accept`
          : "(Anyone) Purchase"
      )
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      cancelButton,
      acceptButton
    );

    // Get card image
    const cardImage = await createCardImage(cardDefinition);
    if (!cardImage) {
      await interaction.editReply(
        `An issue occurred trying to list your card (${sellingCardId}) for sale. Please try again later.`
      );
      return;
    }
    const cardImageAttachment = new AttachmentBuilder(cardImage);

    // Initial response
    const interactionResponse = await interaction.editReply({
      content: `${interaction.user} is looking to sell their ${
        cardDefinition.card_name
      }.${
        targetUserDefined
          ? ` ${targetUser} Do you accept?`
          : " Anyone can purchase."
      }\r\nAsking cost is ${sellingPrice} Finicoin`,
      components: [row],
      files: [cardImageAttachment],
    });

    // Filter to lock down button interactions if a target user was specified
    const collectorFilter = (i) => {
      if (targetUserDefined) {
        // Only target user, and interaction creator, can interact
        return [
          targetUser?.id ?? "unknown user id",
          interaction.user.id,
        ].includes(i.user.id);
      } else {
        // Otherwise anyone can interact
        return true;
      }
    };

    // Collector to listen for interactions
    const collector = interactionResponse.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: collectorFilter,
      time: 600_000, // 10 min
    });

    // Event that fires when the collector times out
    collector.on("end", async (i) => {
      await interaction.editReply({
        content: `No one has bought ${interaction.user}'s ${cardDefinition.card_name} for ${sellingPrice} Finicoin`,
        components: [],
      });
    });

    // Event that fires when a user interacts with the buttons
    collector.on("collect", async (i) => {
      if (targetUserDefined) {
        // Target User Defined -> Either user can cancel, only target can accept
        if (
          i.customId === "cancel-trade" &&
          [targetUser.id, interaction.user.id].includes(i.user.id)
        ) {
          await i.update({
            content: `${i.user} has cancelled this sale.`,
            components: [],
          });
        } else if (i.customId === "purchase" && i.user.id === targetUser.id) {
          // Transfer coin
          const targetUserBalance = await getUserBalance(
            targetUser.id,
            interaction.guildId ?? "unknown guild id"
          );

          if (targetUserBalance < sellingPrice) {
            // Target user does have the money
            await i.update({
              content: `${targetUser} does not have enough Finicoin to buy ${cardDefinition.card_name} for ${sellingPrice} Finicoin. (Balance: ${targetUserBalance})`,
              components: [],
            });
          } else {
            // Money seems good, send it to the interaction creator
            await addCoin(
              interaction.user.id,
              interaction.guildId ?? "unknown guild id",
              sellingPrice,
              interaction.user.username,
              interaction.guild?.name ?? "unknown guild name",
              targetUser.id
            );

            // Transfer card over
            await pb
              .collection<UserCardRecord>("user_card")
              .update(userCardRecord.id ?? "unknown card id", {
                user_id: targetUser.id,
                identifier: `${targetUser.username}-${
                  interaction.guild?.name ?? "unknown guild name"
                }`,
              });

            await i.update({
              content: `${targetUser} has purchased ${cardDefinition.card_name}.`,
              components: [],
            });
          }
        } else {
          await i.update({});
        }
      } else {
        // Target User Undefined -> Interaction creator can cancel, anyone can accept
        if (
          i.customId === "cancel-trade" &&
          i.user.id === interaction.user.id
        ) {
          await i.update({
            content: `${i.user} has cancelled this sale.`,
            components: [],
          });
        } else if (
          i.customId === "purchase" &&
          i.user.id !== interaction.user.id
        ) {
          // Transfer coin
          const purchaserBalance = await getUserBalance(
            i.user.id,
            interaction.guildId ?? "unknown guild id"
          );

          if (purchaserBalance < sellingPrice) {
            // Target user does have the money
            await i.channel?.send(
              `${i.user} does not have enough Finicoin to buy ${cardDefinition.card_name} for ${sellingPrice} Finicoin. (Balance: ${purchaserBalance})`
            );
            await i.update({});
          } else {
            // Money seems good, send it to the interaction creator
            await addCoin(
              interaction.user.id,
              interaction.guildId ?? "unknown guild id",
              sellingPrice,
              interaction.user.username,
              interaction.guild?.name ?? "unknown guild name",
              i.user.id
            );

            // Transfer card over
            await pb
              .collection<UserCardRecord>("user_card")
              .update(userCardRecord.id ?? "unknown card id", {
                user_id: i.user.id,
                identifier: `${i.user.username}-${
                  interaction.guild?.name ?? "unknown guild name"
                }`,
              });

            await i.update({
              content: `${i.user} has purchased ${cardDefinition.card_name}.`,
              components: [],
            });
          }
        } else {
          await i.update({});
        }
      }
    });
  } catch (err) {
    console.error("Error occurred during test", err);
    interaction.editReply("Something fucked up");
  }
};
