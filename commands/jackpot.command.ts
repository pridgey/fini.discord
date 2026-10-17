import { SlashCommandBuilder } from "@discordjs/builders";
import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { QueryHandler } from "../queries/QueryHandler";
import type { BankRecord } from "../types/PocketbaseTables";
import {
  createPaginationContext,
  createPaginationRow,
} from "../utilities/pagination/pagination";
import { pb } from "../utilities/pocketbase";

/**
 * How many past winners fit on one page. Past this, the reply grows long
 * enough to be worth paging rather than dumping into a single message.
 */
const WINNERS_PER_PAGE = 20;

export const data = new SlashCommandBuilder()
  .setName("jackpot")
  .setDescription("What is the current finicoin jackpot at?")
  .addBooleanOption((option) =>
    option
      .setName("history")
      .setDescription("Show past jackpot winners and how much they won")
      .setRequired(false),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    const showHistory = Boolean(
      interaction.options.get("history")?.value || false,
    );

    if (showHistory) {
      await showJackpotHistory(interaction);
      return;
    }

    const bankRecord = await pb.collection<BankRecord>("bank").getFirstListItem(
      pb.filter('user_id = "Jackpot" && server_id = {:server_id}', {
        server_id: interaction.guildId,
      }),
    );

    if (
      !!bankRecord &&
      bankRecord.balance !== undefined &&
      bankRecord.balance !== null
    ) {
      try {
        await interaction.reply(
          `The jackpot is currently at ${bankRecord.balance.toLocaleString()} Finicoin.`,
        );
      } catch (replyErr) {
        console.error("Error sending reply:", replyErr);
      }
    } else {
      try {
        await interaction.reply("The Jackpot is at 0 Finicoin.");
      } catch (replyErr) {
        console.error("Error sending reply:", replyErr);
      }
    }
  } catch (err) {
    const error: Error = err as Error;
    console.error("Error running /jackpot command", { error });

    // The history path defers, so an error after that point leaves the user on
    // a spinner forever unless the deferral is answered.
    if (interaction.deferred && !interaction.replied) {
      try {
        await interaction.editReply({
          content: "Something went wrong pulling the jackpot history.",
        });
      } catch (replyErr) {
        console.error("Error sending failure reply:", replyErr);
      }
    }
  } finally {
    logCommand();
  }
};

/**
 * Replies with the server's past jackpot winners, newest first, paging once
 * the history outgrows a single page.
 */
const showJackpotHistory = async (interaction: ChatInputCommandInteraction) => {
  await interaction.deferReply();

  const queryFilter = pb.filter("server_id = {:server_id}", {
    server_id: interaction.guildId,
  });

  const historyQuery = QueryHandler("jackpot_history");
  const queryResults = await historyQuery.query({
    page: 1,
    perPage: WINNERS_PER_PAGE,
    filterOption: queryFilter,
  });

  if (queryResults.items.length === 0) {
    await interaction.editReply({
      content: "Nobody has won the jackpot here yet.",
    });
    return;
  }

  const { components } = await historyQuery.buildResults({
    items: queryResults.items,
    userId: interaction.user.id,
  });

  if (!components || components.length === 0) {
    await interaction.editReply({
      content: "Error building jackpot history components.",
    });
    return;
  }

  // A history that fits on one page gets no buttons - a disabled "Page 1/1"
  // row is just noise, and skipping it also skips writing a pagination
  // context that would never be read.
  if (queryResults.totalPages <= 1) {
    await interaction.editReply({
      components,
      flags: [MessageFlags.IsComponentsV2],
    });
    return;
  }

  const contextId = await createPaginationContext({
    userId: interaction.user.id,
    queryId: historyQuery.id,
    filter: queryFilter,
    perPage: WINNERS_PER_PAGE,
  });

  const pageRow = createPaginationRow({
    userId: interaction.user.id,
    currentPage: queryResults.currentPage,
    totalPages: queryResults.totalPages,
    contextId,
  });

  await interaction.editReply({
    components: [...components, pageRow],
    flags: [MessageFlags.IsComponentsV2],
  });
};
