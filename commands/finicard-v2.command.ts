import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import {
  buildCardMessage,
  buildPackMessage,
  compositionString,
} from "../modules/finicardsV2/ui";
import {
  MAX_DECK_SIZE,
  MIN_DECK_SIZE,
  autoBuildDeck,
  deleteDeck,
  findDeckByName,
  getDecks,
  loadDeck,
  updateDeckCards,
} from "../modules/finicardsV2/decks";
import {
  HAND_SIZE,
  MAX_HAND_SIZE,
  MIN_HAND_SIZE,
  clampHandSize,
} from "../modules/finicardsV2/draw";
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
import type {
  CardRarity,
  CardType,
  V2DeckRecord,
} from "../types/PocketbaseTablesV2";
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
        `Challenge someone - ${HAND_SIZE} cards are dealt from the deck you bring`,
      )
      .addUserOption((option) =>
        option
          .setName("opponent")
          .setDescription("Who are you challenging?")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("deck")
          .setDescription("Which deck to bring (blank uses your only deck)")
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("draw")
          .setDescription(
            `Cards dealt to each side (${MIN_HAND_SIZE}-${MAX_HAND_SIZE}, default ${HAND_SIZE})`,
          )
          .setMinValue(MIN_HAND_SIZE)
          .setMaxValue(MAX_HAND_SIZE)
          .setRequired(false),
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
  .addSubcommandGroup((group) =>
    group
      .setName("deck")
      .setDescription("Build and manage the decks your battles draw from")
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List your decks"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("build")
          .setDescription("Build a deck automatically from your collection")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Name for the deck")
              .setRequired(true),
          )
          .addIntegerOption((option) =>
            option
              .setName("size")
              .setDescription(`How many cards (${MIN_DECK_SIZE}-${MAX_DECK_SIZE}, default 20)`)
              .setMinValue(MIN_DECK_SIZE)
              .setMaxValue(MAX_DECK_SIZE)
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("type")
              .setDescription("Only cards of this type")
              .setRequired(false)
              .addChoices(
                { name: "power", value: "power" },
                { name: "wit", value: "wit" },
                { name: "heart", value: "heart" },
              ),
          )
          .addStringOption((option) =>
            option
              .setName("rarity")
              .setDescription("Only cards of this rarity")
              .setRequired(false)
              .addChoices(
                { name: "common", value: "common" },
                { name: "uncommon", value: "uncommon" },
                { name: "full art", value: "full_art" },
              ),
          )
          .addStringOption((option) =>
            option
              .setName("tag")
              .setDescription("Only cards carrying this tag")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("show")
          .setDescription("Show a deck's cards")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Which deck")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a card to a deck")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Which deck")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("card")
              .setDescription("Card id from /finicard-v2 collection")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a card from a deck")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Which deck")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("card")
              .setDescription("Card id to remove")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Delete a deck")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Which deck")
              .setRequired(true),
          ),
      ),
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
    /* The deck group is dispatched first - `getSubcommand()` returns the leaf
       name either way, so without this a `deck list` would fall through to the
       flat cases. */
    if (interaction.options.getSubcommandGroup(false) === "deck") {
      await handleDeckSubcommand(interaction, {
        serverId,
        serverName,
        identifier,
      });
      return;
    }

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
          await addCoin(
            interaction.user.id,
            serverId,
            Math.round((PACK_COST / PACK_SIZE) * shortfall),
            interaction.user.username,
            serverName,
            "Reserve",
          );
        }

        const reimbursement =
          shortfall > 0 ? Math.round((PACK_COST / PACK_SIZE) * shortfall) : 0;

        await interaction.editReply(
          await buildPackMessage({
            cards: pulls.map((owned) => toBattleCard(owned)),
            cost: PACK_COST,
            shortfall,
            reimbursement,
          }),
        );
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

        /* The rendered card carries the name, stats, tags and ability, so the
           text face is only needed when the render fails. */
        const message = await buildCardMessage(cards[0]);

        if (!message) {
          await interaction.editReply(renderCardFace(cards[0]));
          return;
        }

        await interaction.editReply(message);
        return;
      }

      /* -------------------------------------------------------- battle ---- */
      case "battle": {
        const opponent = interaction.options.getUser("opponent", true);
        const wager = interaction.options.getInteger("wager") ?? 0;
        const deckName = interaction.options.getString("deck");
        const handSize = clampHandSize(
          interaction.options.getInteger("draw") ?? HAND_SIZE,
        );

        if (opponent.id === interaction.user.id) {
          await interaction.editReply("You can't challenge yourself.");
          return;
        }
        if (opponent.bot) {
          await interaction.editReply(
            "Bots don't have decks. Challenge a person.",
          );
          return;
        }

        const decks = await getDecks(interaction.user.id, serverId);

        if (decks.length === 0) {
          await interaction.editReply(
            `You have no decks. Build one with \`/finicard-v2 deck build name:Main\` - a battle deals ${HAND_SIZE} cards from it.`,
          );
          return;
        }

        const deck = deckName
          ? await findDeckByName(interaction.user.id, serverId, deckName)
          : decks.length === 1
            ? decks[0]
            : null;

        if (!deck) {
          await interaction.editReply(
            deckName
              ? `You have no deck called **${deckName}**. Yours: ${decks.map((d) => `**${d.name}**`).join(", ")}.`
              : `You have several decks - say which one: ${decks.map((d) => `**${d.name}**`).join(", ")}.`,
          );
          return;
        }

        const opponentDecks = await getDecks(opponent.id, serverId);

        if (opponentDecks.length === 0) {
          await interaction.editReply(
            `${opponent.displayName} has no decks yet, so they can't answer a challenge.`,
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

        const created = await createChallenge({
          serverId,
          channelId: interaction.channelId,
          challengerId: interaction.user.id,
          challengerName: interaction.user.displayName,
          defenderId: opponent.id,
          defenderName: opponent.displayName,
          deck,
          wager,
          handSize,
        });

        if (!created.ok) {
          await interaction.editReply(created.reason);
          return;
        }

        await stakeWager(party, wager);

        const acceptButton = new ButtonBuilder()
          .setCustomId(`v2_battle_accept:${created.battle.id}:${opponent.id}`)
          .setLabel("Accept")
          .setStyle(ButtonStyle.Primary);
        const declineButton = new ButtonBuilder()
          .setCustomId(`v2_battle_decline:${created.battle.id}:${opponent.id}`)
          .setLabel("Decline")
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          acceptButton,
          declineButton,
        );

        /* The challenger's hand is dealt now but shown to nobody - not even to
           them - until the defender accepts. That is what stops a challenger
           cancelling and re-issuing until they like their draw. */
        await interaction.editReply({
          content: [
            `## ${interaction.user.displayName} challenges ${opponent}`,
            `Bringing **${deck.name}**. ${handSize} cards are already dealt, face down.`,
            wager > 0 ? `**Wager:** ${wager} fc each` : "**Friendly** (no wager)",
            "",
            `${opponent}, accept with a deck of your own. Both hands are revealed the moment you do, and *then* you each pick ${RULES.rounds} of your ${handSize} in secret.`,
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
          const awaitingCards = battle.state === "awaiting_defender";
          const opponentName =
            battle.challenger_id === interaction.user.id
              ? battle.defender_name
              : battle.challenger_name;

          const action = awaitingCards
            ? new ButtonBuilder()
                .setCustomId(
                  `v2_battle_accept:${battle.id}:${interaction.user.id}`,
                )
                .setLabel(`Accept ${opponentName}`.slice(0, 80))
                .setStyle(ButtonStyle.Primary)
            : new ButtonBuilder()
                .setCustomId(`v2_lineup_open:${battle.id}`)
                .setLabel(`Set lineup vs ${opponentName}`.slice(0, 80))
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
            battle.state === "awaiting_defender"
              ? "accept with a deck"
              : "set your lineup";
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

/* -------------------------------------------------------------------------- */
/* Decks                                                                      */
/* -------------------------------------------------------------------------- */

type DeckContext = {
  serverId: string;
  serverName: string;
  identifier: string;
};

/**
 * The `deck` subcommand group.
 *
 * `build` is the path that matters: it assembles a deck from the collection with
 * optional filters, so a player never has to type a card id to get playing. The
 * manual `add` / `remove` are there for tuning afterwards.
 */
const handleDeckSubcommand = async (
  interaction: ChatInputCommandInteraction,
  context: DeckContext,
) => {
  const { serverId, serverName, identifier } = context;
  const userId = interaction.user.id;

  const describeDeck = async (deck: V2DeckRecord) => {
    const contents = await loadDeck(deck, serverId);
    const composition = { power: 0, wit: 0, heart: 0 };
    for (const card of contents.cards) composition[card.type] += 1;

    return [
      `### ${deck.name} — ${contents.cards.length} cards ${compositionString(composition)}`,
      contents.missing.length > 0
        ? `_${contents.missing.length} card(s) in this deck are no longer in your collection._`
        : "",
      contents.cards
        .map(
          (card) =>
            `${TYPE_EMOJI[card.type]} **${card.name}**${card.foil ? " ✨" : ""} \`${card.stats.power}/${card.stats.wit}/${card.stats.heart}\` · ${RARITY_LABEL[card.rarity]} · \`${card.instanceId}\``,
        )
        .join("\n"),
    ]
      .filter(Boolean)
      .join("\n");
  };

  switch (interaction.options.getSubcommand()) {
    case "list": {
      const decks = await getDecks(userId, serverId);

      if (decks.length === 0) {
        await interaction.editReply(
          `You have no decks. Build one with \`/finicard-v2 deck build name:Main\` — a battle deals ${HAND_SIZE} cards from it.`,
        );
        return;
      }

      const lines = decks.map(
        (deck) =>
          `• **${deck.name}** — ${(deck.cards ?? []).length} cards${
            (deck.cards ?? []).length < HAND_SIZE ? " ⚠️ too small to battle" : ""
          }`,
      );

      await interaction.editReply(
        `### Your decks\n${lines.join("\n")}\n\n_Bring one with \`/finicard-v2 battle deck:<name>\`._`,
      );
      return;
    }

    case "build": {
      const name = interaction.options.getString("name", true);
      const size = interaction.options.getInteger("size") ?? undefined;
      const type = interaction.options.getString("type") as
        | CardType
        | null;
      const rarity = interaction.options.getString("rarity") as
        | CardRarity
        | null;
      const tag = interaction.options.getString("tag") ?? undefined;

      const result = await autoBuildDeck({
        userId,
        serverId,
        identifier,
        name,
        filter: {
          size,
          tag,
          ...(type ? { type } : {}),
          ...(rarity ? { rarity } : {}),
        },
      });

      if (!result.ok) {
        await interaction.editReply(result.reason);
        return;
      }

      await interaction.editReply(
        `Built **${result.deck.name}** with ${result.taken} of your ${result.eligible} cards.\n\n${await describeDeck(result.deck)}`,
      );
      return;
    }

    case "show": {
      const deck = await findDeckByName(
        userId,
        serverId,
        interaction.options.getString("name", true),
      );

      if (!deck) {
        await interaction.editReply("You have no deck by that name.");
        return;
      }

      for (const [index, chunk] of splitBigString(
        await describeDeck(deck),
      ).entries()) {
        if (index === 0) await interaction.editReply(chunk);
        else await interaction.followUp(chunk);
      }
      return;
    }

    case "add":
    case "remove": {
      const isAdd = interaction.options.getSubcommand() === "add";
      const deck = await findDeckByName(
        userId,
        serverId,
        interaction.options.getString("name", true),
      );

      if (!deck) {
        await interaction.editReply("You have no deck by that name.");
        return;
      }

      const rawCard = interaction.options.getString("card", true);
      const { cards, errors } = await resolveLineup(userId, serverId, [rawCard], 1);

      if (cards.length === 0) {
        await interaction.editReply(
          errors.join("\n") || `No card of yours matches \`${rawCard}\`.`,
        );
        return;
      }

      const card = cards[0];
      const updated = await updateDeckCards(
        deck,
        isAdd
          ? { add: [card.instanceId] }
          : { remove: [card.instanceId] },
      );

      if (!updated.ok) {
        await interaction.editReply(updated.reason);
        return;
      }

      await interaction.editReply(
        `${isAdd ? "Added" : "Removed"} **${card.name}** ${isAdd ? "to" : "from"} **${deck.name}** (${(updated.deck.cards ?? []).length} cards).`,
      );
      return;
    }

    case "delete": {
      const deck = await findDeckByName(
        userId,
        serverId,
        interaction.options.getString("name", true),
      );

      if (!deck) {
        await interaction.editReply("You have no deck by that name.");
        return;
      }

      await deleteDeck(deck.id!);
      await interaction.editReply(`Deleted **${deck.name}**.`);
      return;
    }

    default:
      await interaction.editReply("Unknown deck subcommand.");
  }
};
