import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import {
  cardImageName,
  renderCardAttachments,
  renderCardImage,
} from "../modules/finicardsV2/cardArt";
import {
  collectionComposition,
  getCardDefinitions,
  getUserCollection,
  importCardDefinitions,
  resolveLineup,
  toBattleCard,
} from "../modules/finicardsV2/cardStore";
import {
  createChallenge,
  getBattleRecordForUser,
  getPendingBattlesForUser,
} from "../modules/finicardsV2/battleStore";
import { convertLegacyPool } from "../modules/finicardsV2/convertLegacyCards";
import { KEYWORDS } from "../modules/finicardsV2/keywords";
import { openPack, PACK_SIZE } from "../modules/finicardsV2/packs";
import {
  compositionString,
  renderCardFace,
  renderCollectionPage,
} from "../modules/finicardsV2/renderBattle";
import {
  RARITY_LABEL,
  RULES,
  TYPE_EMOJI,
} from "../modules/finicardsV2/rules";
import { canAfford, stakeWager } from "../modules/finicardsV2/wagers";
import { addCoin, getUserBalance } from "../modules/finicoin";
import type { CardDefinitionRecord } from "../types/PocketbaseTables";
import { pb } from "../utilities/pocketbase";
import { splitBigString } from "../utilities/splitBigString";

/**
 * The v2 test surface.
 *
 * Deliberately one command with subcommands rather than a spread of top-level
 * commands: v1's `/booster-pack`, `/card-collection`, `/sell-card` and
 * `/fuse-cards` keep working untouched, and everything v2 lives behind
 * `/finicard-v2 ...` so there is no ambiguity about which game you are playing.
 * When v2 takes over, these move up to top-level names and v1's retire.
 */

const PACK_COST = 25;
const COLLECTION_PAGE_SIZE = 15;
const MAX_PENDING_SHOWN = 5;

export const data = new SlashCommandBuilder()
  .setName("finicard-v2")
  .setDescription("Finicards v2 (in testing) - battles, packs and collection")
  .addSubcommand((sub) =>
    sub
      .setName("pack")
      .setDescription(`Open a v2 booster pack (${PACK_COST} fc)`),
  )
  .addSubcommand((sub) =>
    sub
      .setName("collection")
      .setDescription("List your v2 cards and their lineup ids")
      .addUserOption((option) =>
        option
          .setName("who")
          .setDescription("Whose collection to view (blank for your own)")
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("page")
          .setDescription("Page number")
          .setMinValue(1)
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("card")
      .setDescription("Show one of your v2 cards in detail")
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("The card id from /finicard-v2 collection")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("battle")
      .setDescription(
        `Challenge someone - bring ${RULES.rounds} cards (order is chosen later)`,
      )
      .addUserOption((option) =>
        option
          .setName("opponent")
          .setDescription("Who are you challenging?")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("card1")
          .setDescription("A card you're bringing")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("card2")
          .setDescription("A card you're bringing")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("card3")
          .setDescription("A card you're bringing")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("wager")
          .setDescription("Finicoin each side stakes (default 0)")
          .setMinValue(0)
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("pending")
      .setDescription("Battles waiting on your lineup"),
  )
  .addSubcommand((sub) =>
    sub.setName("record").setDescription("Your v2 battle record"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("keywords")
      .setDescription("The v2 keyword library and what each one does"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("import")
      .setDescription("[Admin] Convert the v1 card pool into v2 rows")
      .addBooleanOption((option) =>
        option
          .setName("commit")
          .setDescription("Actually write the rows (default: dry run)")
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName("keywords")
          .setDescription("Also assign keywords (default: false)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("grant")
      .setDescription("[Admin] Hand out free v2 cards for testing")
      .addUserOption((option) =>
        option
          .setName("who")
          .setDescription("Who to grant cards to")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("count")
          .setDescription("How many cards (default 5, max 25)")
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false),
      ),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  const serverId = interaction.guildId ?? "unknown guild id";
  const serverName = interaction.guild?.name ?? "unknown guild name";
  const identifier = `${interaction.user.username}-${serverName}`;

  await interaction.deferReply();

  try {
    switch (interaction.options.getSubcommand()) {
      /* ---------------------------------------------------------- pack ---- */
      case "pack": {
        const balance =
          (await getUserBalance(interaction.user.id, serverId)) || 0;

        if (balance < PACK_COST) {
          await interaction.editReply(
            `A v2 pack costs ${PACK_COST} fc and you have ${balance}.`,
          );
          return;
        }

        const definitions = await getCardDefinitions();
        if (definitions.length === 0) {
          await interaction.editReply(
            "The v2 card pool is empty. An admin needs to run `/finicard-v2 import commit:True` first.",
          );
          return;
        }

        await addCoin(
          "Reserve",
          serverId,
          PACK_COST,
          interaction.user.username,
          serverName,
          interaction.user.id,
        );

        const { pulls, shortfall } = await openPack({
          userId: interaction.user.id,
          serverId,
          identifier,
        });

        if (shortfall > 0) {
          // Refund at the per-card rate, the way /booster-pack does.
          const reimbursement = Math.round(
            (PACK_COST / PACK_SIZE) * shortfall,
          );
          await addCoin(
            interaction.user.id,
            serverId,
            reimbursement,
            interaction.user.username,
            serverName,
            "Reserve",
          );
        }

        const lines = pulls.map((owned) => {
          const definition = owned.definition;
          return `${TYPE_EMOJI[definition.card_type]} **${definition.card_name}**${
            owned.foil ? " ✨" : ""
          } · ${RARITY_LABEL[definition.rarity]} · \`${definition.power}/${definition.wit}/${definition.heart}\` · \`${owned.id}\``;
        });

        const footer =
          shortfall > 0
            ? `\n\n_${shortfall} card(s) couldn't be pulled - the pool is out of room. You've been reimbursed._`
            : "";

        /* Discord takes ten attachments per message and a pack is five, so the
           whole pull can be revealed in one go. */
        const images = await renderCardAttachments(
          pulls.map((owned) => toBattleCard(owned)),
        );

        await interaction.editReply({
          content: `### v2 pack — ${pulls.length} card(s)\n${lines.join("\n")}\n\n_Stats read power/wit/heart. Use the ids with \`/finicard-v2 battle\`._${footer}`,
          files: images.map(
            (image) => new AttachmentBuilder(image.buffer, { name: image.name }),
          ),
        });
        return;
      }

      /* ---------------------------------------------------- collection ---- */
      case "collection": {
        const target = interaction.options.getUser("who") ?? interaction.user;
        const page = interaction.options.getInteger("page") ?? 1;

        const collection = await getUserCollection(target.id, serverId);

        if (collection.length === 0) {
          await interaction.editReply(
            `${target.id === interaction.user.id ? "You have" : `${target.displayName} has`} no v2 cards yet. Try \`/finicard-v2 pack\`.`,
          );
          return;
        }

        const totalPages = Math.max(
          1,
          Math.ceil(collection.length / COLLECTION_PAGE_SIZE),
        );
        const safePage = Math.min(page, totalPages);
        const slice = collection.slice(
          (safePage - 1) * COLLECTION_PAGE_SIZE,
          safePage * COLLECTION_PAGE_SIZE,
        );

        const composition = collectionComposition(collection);

        const body = renderCollectionPage(slice, {
          page: safePage,
          totalPages,
          ownerLabel: `${target.displayName} (${collection.length} cards) ${compositionString(composition)}`,
        });

        for (const [index, chunk] of splitBigString(body).entries()) {
          if (index === 0) await interaction.editReply(chunk);
          else await interaction.followUp(chunk);
        }
        return;
      }

      /* ---------------------------------------------------------- card ---- */
      case "card": {
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

        /* Show the rendered card, and keep the text face as the fallback so a
           render failure still answers the question the user asked. */
        const image = await renderCardImage(cards[0]);

        if (!image) {
          await interaction.editReply(renderCardFace(cards[0]));
          return;
        }

        await interaction.editReply({
          content: renderCardFace(cards[0]),
          files: [
            new AttachmentBuilder(image, { name: cardImageName(cards[0]) }),
          ],
        });
        return;
      }

      /* -------------------------------------------------------- battle ---- */
      case "battle": {
        const opponent = interaction.options.getUser("opponent", true);
        const wager = interaction.options.getInteger("wager") ?? 0;

        if (opponent.id === interaction.user.id) {
          await interaction.editReply("You can't challenge yourself.");
          return;
        }
        if (opponent.bot) {
          await interaction.editReply(
            "Bots don't have collections. Challenge a person.",
          );
          return;
        }

        const rawSelection = [
          interaction.options.getString("card1", true),
          interaction.options.getString("card2", true),
          interaction.options.getString("card3", true),
        ];

        const { cards, errors } = await resolveLineup(
          interaction.user.id,
          serverId,
          rawSelection,
          RULES.rounds,
        );

        if (errors.length > 0 || cards.length !== RULES.rounds) {
          await interaction.editReply(
            `Couldn't bring those cards:\n${errors.map((error) => `• ${error}`).join("\n")}`,
          );
          return;
        }

        const defenderCollection = await getUserCollection(
          opponent.id,
          serverId,
        );
        if (defenderCollection.length < RULES.rounds) {
          await interaction.editReply(
            `${opponent.displayName} only has ${defenderCollection.length} v2 card(s) and needs at least ${RULES.rounds} to answer a challenge.`,
          );
          return;
        }

        const party = {
          userId: interaction.user.id,
          serverId,
          username: interaction.user.username,
          servername: serverName,
        };

        if (!(await canAfford(party, wager))) {
          await interaction.editReply(
            `You can't cover a ${wager} fc stake right now.`,
          );
          return;
        }

        await stakeWager(party, wager);

        const battle = await createChallenge({
          serverId,
          channelId: interaction.channelId,
          challengerId: interaction.user.id,
          challengerName: interaction.user.displayName,
          defenderId: opponent.id,
          defenderName: opponent.displayName,
          challengerSelection: cards.map((card) => card.instanceId),
          wager,
        });

        const acceptButton = new ButtonBuilder()
          .setCustomId(`v2_battle_select:${battle.id}:${opponent.id}`)
          .setLabel("Bring your cards")
          .setStyle(ButtonStyle.Primary);
        const declineButton = new ButtonBuilder()
          .setCustomId(`v2_battle_decline:${battle.id}:${opponent.id}`)
          .setLabel("Decline")
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          acceptButton,
          declineButton,
        );

        /* Both selections are made blind, so nothing about the challenger's
           three cards goes in this message - not even the type composition.
           Everything is revealed at once when the defender commits. */
        await interaction.editReply({
          content: [
            `## ${interaction.user.displayName} challenges ${opponent}`,
            `${interaction.user.displayName} has brought ${RULES.rounds} cards, face down.`,
            wager > 0 ? `**Wager:** ${wager} fc each` : "**Friendly** (no wager)",
            "",
            `${opponent}, bring ${RULES.rounds} cards of your own. Both hands are revealed once you do, and *then* you both secretly choose your slot order.`,
            `Find your card ids with \`/finicard-v2 collection\`.`,
          ].join("\n"),
          components: [row],
        });
        return;
      }

      /* ------------------------------------------------------- pending ---- */
      case "pending": {
        const pending = await getPendingBattlesForUser(
          interaction.user.id,
          serverId,
        );

        if (pending.length === 0) {
          await interaction.editReply("Nothing is waiting on you.");
          return;
        }

        const shown = pending.slice(0, MAX_PENDING_SHOWN);

        const rows = shown.map((battle) => {
          const awaitingCards = battle.state === "awaiting_defender_selection";
          const opponentName =
            battle.challenger_id === interaction.user.id
              ? battle.defender_name
              : battle.challenger_name;

          const action = awaitingCards
            ? new ButtonBuilder()
                .setCustomId(
                  `v2_battle_select:${battle.id}:${interaction.user.id}`,
                )
                .setLabel(`Bring cards vs ${opponentName}`.slice(0, 80))
                .setStyle(ButtonStyle.Primary)
            : new ButtonBuilder()
                .setCustomId(`v2_order_open:${battle.id}`)
                .setLabel(`Choose order vs ${opponentName}`.slice(0, 80))
                .setStyle(ButtonStyle.Primary);

          const buttons = [action];

          // Only an unanswered challenge can still be declined.
          if (awaitingCards) {
            buttons.push(
              new ButtonBuilder()
                .setCustomId(
                  `v2_battle_decline:${battle.id}:${interaction.user.id}`,
                )
                .setLabel("Decline")
                .setStyle(ButtonStyle.Secondary),
            );
          }

          return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
        });

        const lines = shown.map((battle) => {
          const opponentName =
            battle.challenger_id === interaction.user.id
              ? battle.defender_name
              : battle.challenger_name;
          const need =
            battle.state === "awaiting_defender_selection"
              ? "bring cards"
              : "choose your order";
          return `• **${opponentName}** — ${need}${battle.wager > 0 ? ` · ${battle.wager} fc` : ""}`;
        });

        await interaction.editReply({
          content: `### ${pending.length} battle(s) waiting on you\n${lines.join("\n")}${
            pending.length > shown.length
              ? `\n\n_Showing the ${shown.length} most recent._`
              : ""
          }`,
          components: rows,
        });
        return;
      }

      /* -------------------------------------------------------- record ---- */
      case "record": {
        const record = await getBattleRecordForUser(
          interaction.user.id,
          serverId,
        );
        const collection = await getUserCollection(interaction.user.id, serverId);

        await interaction.editReply(
          [
            `### ${interaction.user.displayName} — v2 record`,
            `**${record.wins}W / ${record.losses}L / ${record.draws}D**`,
            `**Collection:** ${collection.length} cards ${compositionString(collectionComposition(collection))}`,
          ].join("\n"),
        );
        return;
      }

      /* ------------------------------------------------------ keywords ---- */
      case "keywords": {
        const byStage = KEYWORDS.reduce<Record<string, string[]>>(
          (accumulator, keyword) => {
            const stage = keyword.stage;
            accumulator[stage] = accumulator[stage] ?? [];
            accumulator[stage].push(
              `• **${keyword.name}** (${RARITY_LABEL[keyword.tier]}) — ${keyword.description}`,
            );
            return accumulator;
          },
          {},
        );

        const body = [
          "### v2 keyword library",
          RULES.keywordsEnabled
            ? "_Keywords are **active** in battles._"
            : "_Keywords are **not yet active** in battles - Phase 1 is pure stats. Cards carry them so Phase 2 needs no schema change._",
          "",
          ...Object.entries(byStage).map(
            ([stage, entries]) =>
              `**Resolves at: ${stage}**\n${entries.join("\n")}`,
          ),
          "",
          "_Resolution order is fixed: placement → conditional → matchup → defense → damage → outcome → post-round → tiebreak._",
        ].join("\n");

        for (const [index, chunk] of splitBigString(body).entries()) {
          if (index === 0) await interaction.editReply(chunk);
          else await interaction.followUp(chunk);
        }
        return;
      }

      /* -------------------------------------------------------- import ---- */
      case "import": {
        if (
          !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
        ) {
          await interaction.editReply(
            "Only an administrator can import the card pool.",
          );
          return;
        }

        const commit = interaction.options.getBoolean("commit") ?? false;
        const assignKeywords =
          interaction.options.getBoolean("keywords") ?? false;

        const legacyCards = await pb
          .collection<CardDefinitionRecord>("card_definition")
          .getFullList();

        const { converted, skipped } = convertLegacyPool(legacyCards, {
          assignKeywords,
        });
        const summary = await importCardDefinitions(converted, {
          dryRun: !commit,
        });

        await interaction.editReply(
          [
            `### v1 → v2 import ${commit ? "(committed)" : "(dry run)"}`,
            `**Read:** ${legacyCards.length} v1 cards`,
            `**Converted:** ${converted.length}`,
            `**Skipped:** ${skipped.length} _(item cards have no v2 equivalent)_`,
            `**Created:** ${summary.created} · **Updated:** ${summary.updated} · **Unchanged:** ${summary.unchanged}`,
            assignKeywords
              ? "**Keywords:** assigned"
              : "**Keywords:** left blank",
            commit ? "" : "\n_Nothing was written. Re-run with `commit:True`._",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        return;
      }

      /* --------------------------------------------------------- grant ---- */
      case "grant": {
        if (
          !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
        ) {
          await interaction.editReply(
            "Only an administrator can grant cards.",
          );
          return;
        }

        const target = interaction.options.getUser("who", true);
        const count = interaction.options.getInteger("count") ?? PACK_SIZE;

        const { pulls, shortfall } = await openPack({
          userId: target.id,
          serverId,
          identifier: `${target.username}-${serverName}`,
          size: count,
        });

        await interaction.editReply(
          `Granted ${pulls.length} v2 card(s) to ${target.displayName}.${
            shortfall > 0 ? ` (${shortfall} couldn't be granted - pool is dry.)` : ""
          }`,
        );
        return;
      }

      default: {
        await interaction.editReply("Unknown subcommand.");
      }
    }
  } catch (error) {
    console.error("Error during /finicard-v2", error);
    const message = "Something went wrong running that v2 command.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message);
    } else {
      await interaction.reply({
        content: message,
        flags: [MessageFlags.Ephemeral],
      });
    }
  } finally {
    logCommand();
  }
};
