import { SlashCommandBuilder, SlashCommandStringOption } from "@discordjs/builders";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import {
  buildCardMessage,
  buildRevealMessage,
  compositionString,
  NEUTRAL_ACCENT,
} from "../modules/finicardsV2/ui";
import { buildCardPages, buildDeckPages } from "../modules/finicardsV2/cardPages";
import {
  buildCollectionQuery,
  SORT_LABEL as COLLECTION_SORT_LABEL,
  TIER_LABEL as COLLECTION_TIER_LABEL,
  type CollectionSort,
  type CollectionTier,
} from "../modules/finicardsV2/collectionFilters";
import { V2_USER_CARD } from "../modules/finicardsV2/cardStore";
import { pb } from "../utilities/pocketbase";
import {
  DECK_SIZE,
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
  getPopulationCounts,
  getUserCollection,
  loadLineupByIds,
  resolveLineup,
  toBattleCard,
} from "../modules/finicardsV2/cardStore";
import {
  createChallenge,
  createPracticeBattle,
  getBattleRecordForUser,
  getPendingBattlesForUser,
} from "../modules/finicardsV2/battleStore";
import { DUNGEON } from "../modules/finicardsV2/dungeon";
import {
  buildRunMessage,
  payEntryFee,
} from "../modules/finicardsV2/dungeonFlow";
import { getActiveRun, startRun } from "../modules/finicardsV2/dungeonStore";
import { GRADE_LABEL, KEYWORDS } from "../modules/finicardsV2/keywords";
import {
  getUnopenedFreePacks,
  markFreePackOpened,
  passOnSpecial,
} from "../modules/finicardsV2/freePacks";
import { rollGuaranteedTier, type LegendaryTier } from "../modules/finicardsV2/legendary";
import {
  availableSecretArts,
  BOOSTER_SETS,
  openPack,
  PACK_COST,
  PACK_SIZE,
  SET_PACK_COST,
} from "../modules/finicardsV2/packs";
import { presentPack } from "../modules/finicardsV2/packFlow";
import { createLog } from "../modules/logger/logger";
import { runSell } from "../modules/finicardsV2/sellFlow";
import { renderCardFace } from "../modules/finicardsV2/renderBattle";
import {
  RARITY_LABEL,
  RULES,
  TYPE_EMOJI,
} from "../modules/finicardsV2/rules";
import { canAfford, stakeWager } from "../modules/finicardsV2/wagers";
import { addCoin, getUserBalance } from "../modules/finicoin";
import { ADMIN_ID, isAdmin } from "../utilities/discord/isAdmin";
import type {
  CardRarity,
  CardType,
  V2DeckRecord,
} from "../types/PocketbaseTablesV2";
import { splitBigString } from "../utilities/splitBigString";

/**
 * Finicards: the card game.
 *
 * One command with subcommands rather than a spread of top-level commands, so
 * the whole game is found in one place. It was named with a `-v2` suffix while
 * it was tested alongside the first game; v1's `/booster-pack`, `/card-collection`,
 * `/sell-card` and `/fuse-cards` were retired when it launched
 * (`commands/archived`).
 */

const MAX_PENDING_SHOWN = 5;

const NO_LEGENDARY: Record<LegendaryTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

/** Pack odds under which a Legendary of `tier`, and only that tier, is certain. */
const certainTier = (tier: LegendaryTier): Record<LegendaryTier, number> => ({
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  [tier]: 1,
});

/** The `view` choice shared by every command that shows cards as pages. */
const withViewOption = (option: SlashCommandStringOption) =>
  option
    .setName("view")
    .setDescription("How to show it (default: list)")
    .addChoices(
      { name: "List - ten to a page", value: "list" },
      { name: "Binder - six cards to a page, as a picture", value: "binder" },
    )
    .setRequired(false);

export const data = new SlashCommandBuilder()
  .setName("finicard")
  .setDescription("Finicards - packs, your collection, decks, battles and dungeons")
  .addSubcommand((sub) =>
    sub
      .setName("pack")
      .setDescription(`Open a booster pack: five cards for ${PACK_COST} fc, or ${SET_PACK_COST} fc from one set. Free packs open first.`)
      .addIntegerOption((opt) =>
        opt
          .setName("set")
          .setDescription(`Draw every card from one set (${SET_PACK_COST} fc). Leave blank for a mix of all sets.`)
          .addChoices(...BOOSTER_SETS.map((set) => ({ name: `Set ${set}`, value: set }))),
      )
      .addStringOption((opt) =>
        opt
          .setName("test")
          .setDescription("[Bot admin] Testing: force a special pull into this pack, free of charge")
          .addChoices(
            { name: "Secret Art", value: "secret_art" },
            { name: "Legendary tier 1", value: "legendary_1" },
            { name: "Legendary tier 2", value: "legendary_2" },
            { name: "Legendary tier 3", value: "legendary_3" },
            { name: "Legendary tier 4", value: "legendary_4" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("collection")
      .setDescription("Your cards - as a list with their ids, or as binder pages")
      .addUserOption((option) =>
        option
          .setName("who")
          .setDescription("Whose collection to view (blank for your own)")
          .setRequired(false),
      )
      .addStringOption(withViewOption)
      .addStringOption((option) =>
        option
          .setName("sort")
          .setDescription("What order to show the cards in (default: newest first)")
          .addChoices(
            ...(Object.keys(COLLECTION_SORT_LABEL) as CollectionSort[]).map((value) => ({
              name: COLLECTION_SORT_LABEL[value],
              value,
            })),
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("Only cards of this type")
          .addChoices(
            { name: "Power", value: "power" },
            { name: "Wit", value: "wit" },
            { name: "Heart", value: "heart" },
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("rarity")
          .setDescription("Only cards of this rarity")
          .addChoices(
            ...(Object.keys(COLLECTION_TIER_LABEL) as CollectionTier[]).map((value) => ({
              name: COLLECTION_TIER_LABEL[value],
              value,
            })),
          )
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("set")
          .setDescription("Only cards from this set")
          .addChoices(...BOOSTER_SETS.map((set) => ({ name: `Set ${set}`, value: set })))
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option.setName("foil").setDescription("Only foils").setRequired(false),
      )
      .addBooleanOption((option) =>
        option.setName("keyword").setDescription("Only cards that rolled a keyword").setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("search")
          .setDescription("Only cards whose name or series contains this")
          .setMaxLength(60)
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("card")
      .setDescription("Show one of your cards in detail")
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("The card id from /finicard collection")
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
      .setName("practice")
      .setDescription(
        "Play both sides of a battle yourself - private, nothing staked or recorded",
      )
      .addStringOption((option) =>
        option
          .setName("deck")
          .setDescription("Deck for the first side (blank uses your only deck)")
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("against")
          .setDescription("Deck for the other side (blank uses the same deck)")
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
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("dungeon")
      .setDescription(
        `Solo run - ${DUNGEON.entryFee} fc, ${DUNGEON.handSize} cards, endless rooms. Earn geld, walk out before you fall`,
      )
      .addStringOption((option) =>
        option
          .setName("deck")
          .setDescription("Which deck to bring (blank uses your only deck)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("pending")
      .setDescription("Battles waiting on your lineup"),
  )
  .addSubcommand((sub) =>
    sub.setName("record").setDescription("Your battle record"),
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
          .setDescription("Show a deck's cards, as a list or a binder")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Which deck")
              .setRequired(true),
          )
          .addStringOption(withViewOption),
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
              .setDescription("Card id from /finicard collection")
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
      .setName("sell")
      .setDescription("Sell or trade one of your cards - to anyone, to a player, or to Fini")
      .addStringOption((option) =>
        option
          .setName("card")
          .setDescription("The card's id, from /finicard collection")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("price")
          .setDescription("Asking price in Finicoin (ignored when selling to Fini)")
          .setMinValue(0)
          .setRequired(false),
      )
      .addUserOption((option) =>
        option
          .setName("who")
          .setDescription("Who to sell to: a player, or Fini. Leave blank to offer it to anyone")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("keywords")
      .setDescription("The v2 keyword library and what each one does"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("grant")
      .setDescription("[Bot admin] Hand out free cards")
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

  /* A practice battle is shown only to the player running it, and whether a
     reply is ephemeral is fixed at the moment it is deferred. */
  const isPrivate = interaction.options.getSubcommand(false) === "practice";
  await interaction.deferReply(
    isPrivate ? { flags: [MessageFlags.Ephemeral] } : undefined,
  );

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
        await openPackFor(interaction, {
          set: interaction.options.getInteger("set"),
          test: interaction.options.getString("test"),
        });
        return;
      }

      /* ---------------------------------------------------- collection ---- */
      case "collection": {
        const target = interaction.options.getUser("who") ?? interaction.user;

        const collection = await getUserCollection(target.id, serverId);

        if (collection.length === 0) {
          await interaction.editReply(
            `${target.id === interaction.user.id ? "You have" : `${target.displayName} has`} no cards yet. Try \`/finicard pack\`.`,
          );
          return;
        }

        const owner = `user_id = "${target.id}" && server_id = "${serverId}"`;
        const asked = buildCollectionQuery({
          sort: interaction.options.getString("sort") as CollectionSort | null,
          type: interaction.options.getString("type") as CardType | null,
          tier: interaction.options.getString("rarity") as CollectionTier | null,
          set: interaction.options.getInteger("set"),
          foil: interaction.options.getBoolean("foil"),
          keyword: interaction.options.getBoolean("keyword"),
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
            `You have no decks. Build one with \`/finicard deck build name:Main\` - a battle deals ${HAND_SIZE} cards from it.`,
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

      /* ------------------------------------------------------ practice ---- */
      case "practice": {
        const deckName = interaction.options.getString("deck");
        const againstName = interaction.options.getString("against");
        const handSize = clampHandSize(
          interaction.options.getInteger("draw") ?? HAND_SIZE,
        );

        const decks = await getDecks(interaction.user.id, serverId);

        if (decks.length === 0) {
          await interaction.editReply(
            `You have no decks. Build one with \`/finicard deck build name:Main\` - a battle deals ${HAND_SIZE} cards from it.`,
          );
          return;
        }

        const yours = decks.map((d) => `**${d.name}**`).join(", ");
        const deck = deckName
          ? await findDeckByName(interaction.user.id, serverId, deckName)
          : decks.length === 1
            ? decks[0]
            : null;

        if (!deck) {
          await interaction.editReply(
            deckName
              ? `You have no deck called **${deckName}**. Yours: ${yours}.`
              : `You have several decks - say which one: ${yours}.`,
          );
          return;
        }

        // Blank plays the deck against itself, dealt as two separate hands.
        const against = againstName
          ? await findDeckByName(interaction.user.id, serverId, againstName)
          : deck;

        if (!against) {
          await interaction.editReply(
            `You have no deck called **${againstName}**. Yours: ${yours}.`,
          );
          return;
        }

        const created = await createPracticeBattle({
          serverId,
          channelId: interaction.channelId,
          userId: interaction.user.id,
          deck,
          against,
          handSize,
        });

        if (!created.ok) {
          await interaction.editReply(created.reason);
          return;
        }

        const { battle } = created;
        const [challengerHand, defenderHand] = await Promise.all([
          loadLineupByIds(battle.challenger_hand),
          loadLineupByIds(battle.defender_hand),
        ]);

        await interaction.editReply(
          await buildRevealMessage({
            battleId: battle.id!,
            wager: 0,
            practice: true,
            challenger: {
              side: "challenger",
              name: battle.challenger_name,
              userId: interaction.user.id,
              cards: challengerHand,
            },
            defender: {
              side: "defender",
              name: battle.defender_name,
              userId: interaction.user.id,
              cards: defenderHand,
            },
          }),
        );
        return;
      }

      /* ------------------------------------------------------- dungeon ---- */
      case "dungeon": {
        /* One run at a time. Asking again while one is live brings it back
           rather than charging for another - the fee is already paid, and the
           message it was on may be a long way up the channel. */
        const active = await getActiveRun(interaction.user.id, serverId);

        if (active) {
          await interaction.editReply(await buildRunMessage(active));
          return;
        }

        const deckName = interaction.options.getString("deck");
        const decks = await getDecks(interaction.user.id, serverId);

        if (decks.length === 0) {
          await interaction.editReply(
            `You have no decks. Build one with \`/finicard deck build name:Main\` - a dungeon run deals ${DUNGEON.handSize} cards from it.`,
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

        const party = {
          userId: interaction.user.id,
          serverId,
          username: interaction.user.username,
          servername: serverName,
        };

        if (!(await canAfford(party, DUNGEON.entryFee))) {
          await interaction.editReply(
            `A dungeon run costs ${DUNGEON.entryFee} fc and you can't cover that right now.`,
          );
          return;
        }

        const started = await startRun({
          serverId,
          channelId: interaction.channelId,
          userId: interaction.user.id,
          playerName: interaction.user.displayName,
          deck,
        });

        if (!started.ok) {
          await interaction.editReply(started.reason);
          return;
        }

        await payEntryFee(party, DUNGEON.entryFee);

        await interaction.editReply(await buildRunMessage(started.run));
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
              `• **${keyword.name}** (${GRADE_LABEL[keyword.grade]}) — ${keyword.description}`,
            );
            return accumulator;
          },
          {},
        );

        const body = [
          "### v2 keyword library",
          RULES.keywordsEnabled
            ? "_Keywords are **active** in battles._"
            : "_Keywords are **switched off** - battles are pure stats for now._",
          "_The rarer the card, the less likely it carries one, and the less likely it is a strong one._",
          "",
          ...Object.entries(byStage).map(
            ([stage, entries]) =>
              `**Resolves at: ${stage}**\n${entries.join("\n")}`,
          ),
          "",
          "_Resolution order is fixed: copy → suppress → placement → conditional → matchup → defense → damage → outcome → post-round → post-loss → tiebreak._",
        ].join("\n");

        for (const [index, chunk] of splitBigString(body).entries()) {
          if (index === 0) await interaction.editReply(chunk);
          else await interaction.followUp(chunk);
        }
        return;
      }

      /* ---------------------------------------------------------- sell ---- */
      case "sell": {
        await runSell(interaction, { serverId, serverName });
        return;
      }

      /* --------------------------------------------------------- grant ---- */
      case "grant": {
        // The bot admin alone, not server administrators: a granted card is
        // a free pull against the server's population limits.
        if (!isAdmin(interaction.user.id)) {
          await interaction.editReply("Only the bot admin can grant cards.");
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
          `Granted ${pulls.length} card(s) to ${target.displayName}.${
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
    console.error("Error during /finicard", error);
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
/* Packs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Logs a pack bought with the button under the last one. No command ran, so
 * nothing else would: the row is written the way `/finicard pack` writes its
 * own, so the two are counted together, and says which it was.
 *
 * Never rejects - it is not awaited, and an unhandled rejection takes the bot down.
 */
const logAgainPack = async (press: ButtonInteraction, set: number | null): Promise<void> => {
  try {
    const output = await press
      .fetchReply()
      .then((reply) => reply.content)
      .catch(() => "<no reply - interaction expired>");

    await createLog({
      command: "/finicard",
      input: `Command options:\n${[
        "subcommand: pack",
        `set: ${set ?? undefined}`,
        "test: undefined",
        "via: another pack button",
      ].join(",\n")}`,
      output,
      server_id: press.guild?.id || "unknown",
      user_id: press.user.id,
    });
  } catch (error) {
    console.error("Error logging a pack bought by button:", error);
  }
};

/**
 * Buys - or, for a free pack, hands over - one pack and presents it on the
 * reply `interaction` has already deferred.
 *
 * Shared by `/finicard pack` and by the button at the end of a pack that buys
 * another of the same kind, which is why it takes its options rather than
 * reading them off a command.
 */
const openPackFor = async (
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  { set, test }: { set: number | null; test: string | null },
): Promise<void> => {
  const serverId = interaction.guildId ?? "unknown guild id";
  const serverName = interaction.guild?.name ?? "unknown guild name";
  const identifier = `${interaction.user.username}-${serverName}`;


  // A forced pull is a test, not a purchase: it costs nothing - which is
  // why only the bot admin may ask for one.
  if (test && !isAdmin(interaction.user.id)) {
    await interaction.editReply("The `test` option is for the bot admin. Leave it off to open a pack.");
    return;
  }

  // A free pack the player is owed is opened before one they pay for.
  // It is a pack of every set, so asking for one set buys a pack instead.
  const freePacks =
    test || set
      ? []
      : await getUnopenedFreePacks(interaction.user.id, serverId).catch(() => []);
  const freePack = freePacks[0] ?? null;

  const price = set ? SET_PACK_COST : PACK_COST;
  const cost = test || freePack ? 0 : price;
  const forcedTier = test?.startsWith("legendary_")
    ? (Number(test.slice(-1)) as LegendaryTier)
    : null;

  const balance =
    (await getUserBalance(interaction.user.id, serverId)) || 0;

  if (balance < cost) {
    await interaction.editReply(
      `${set ? `A Set ${set} pack` : "A pack"} costs ${price} fc and you have ${balance}.`,
    );
    return;
  }

  const definitions = (await getCardDefinitions()).filter(
    (definition) => !set || definition.set === set,
  );
  // Asked for, and impossible: say so rather than hand over a plain pack.
  if (
    test === "secret_art" &&
    availableSecretArts(definitions, await getPopulationCounts(serverId)).length === 0
  ) {
    await interaction.editReply(
      definitions.some((definition) => definition.secret_art)
        ? "Every active Secret Art is already at its 3 copies on this server."
        : `No Secret Art is active${set ? ` in set ${set}` : ""}, so a pack has none to find. Mark one active in the card manager and try again.`,
    );
    return;
  }
  if (set && definitions.length === 0) {
    await interaction.editReply(`Set ${set} has no active cards to pull.`);
    return;
  }
  if (definitions.length === 0) {
    await interaction.editReply(
      "The card pool is empty, so there is nothing to pull.",
    );
    return;
  }

  if (cost > 0) {
    await addCoin(
      "Reserve",
      serverId,
      cost,
      interaction.user.username,
      serverName,
      interaction.user.id,
    );
  }

  const { pulls, shortfall } = await openPack({
    userId: interaction.user.id,
    serverId,
    identifier,
    ...(set ? { set } : {}),
    ...(test === "secret_art" ? { secretArtChance: 1 } : {}),
    ...(forcedTier ? { legendaryOdds: certainTier(forcedTier) } : {}),
    // A free pack holds what was placed in it and rolls nothing special
    // by chance: each server's batch has exactly one of each.
    ...(freePack
      ? {
          secretArtChance: freePack.special === "secret_art" ? 1 : 0,
          legendaryOdds:
            freePack.special === "legendary"
              ? certainTier(rollGuaranteedTier(Math.random()))
              : NO_LEGENDARY,
        }
      : {}),
  });

  if (freePack) {
    await markFreePackOpened(freePack.id ?? "");
    // Placed but not there to give - no Secret Art left on the server,
    // say. Another unopened free pack takes it, so the server still
    // gets its one.
    const delivered =
      freePack.special === "secret_art"
        ? pulls.some((pull) => pull.definition.secret_art)
        : freePack.special === "legendary"
          ? pulls.some((pull) => !!pull.legendary)
          : true;
    if (!delivered && freePack.special) {
      await passOnSpecial(serverId, freePack.special, ADMIN_ID || undefined);
    }
  }

  if (shortfall > 0 && cost > 0) {
    // Refund at the per-card rate, the way /booster-pack does.
    await addCoin(
      interaction.user.id,
      serverId,
      Math.round((cost / PACK_SIZE) * shortfall),
      interaction.user.username,
      serverName,
      "Reserve",
    );
  }

  const reimbursement =
    shortfall > 0 ? Math.round((cost / PACK_SIZE) * shortfall) : 0;

  const cards = pulls.map((owned) => toBattleCard(owned));
  const pack = {
    cards,
    cost,
    shortfall,
    reimbursement,
    ...(freePack
      ? {
          note: `Free pack · ${freePacks.length - 1} more to open`,
        }
      : set
        ? { note: `Set ${set} pack · ${cost > 0 ? `${cost} fc` : "test, free"}` }
        : {}),
  };

  // The sealed pack first, then its cards one at a time. A test pack was not
  // bought, so it does not offer to buy another.
  await presentPack(
    interaction,
    pack,
    test
      ? undefined
      : {
          label: set
            ? `Buy another Set ${set} pack · ${SET_PACK_COST} fc`
            : freePacks.length > 1
              ? "Open another free pack"
              : `Buy another pack · ${PACK_COST} fc`,
          buy: (press) =>
            openPackFor(press, { set, test: null }).finally(() => logAgainPack(press, set)),
        },
  );
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
          `You have no decks. Build one with \`/finicard deck build name:Main\` — a battle deals ${HAND_SIZE} cards from it.`,
        );
        return;
      }

      // One row per deck, each with a button onto the same pages as
      // `deck show`.
      const container = new ContainerBuilder()
        .setAccentColor(NEUTRAL_ACCENT)
        .addTextDisplayComponents((text) => text.setContent("### Your decks"));

      for (const deck of decks) {
        const size = (deck.cards ?? []).length;
        container.addSectionComponents((section) =>
          section
            .addTextDisplayComponents((text) =>
              text.setContent(
                `**${deck.name}** — ${size} cards${
                  size < DECK_SIZE ? `\n-# ⚠️ too small to play (needs ${DECK_SIZE})` : ""
                }`,
              ),
            )
            .setButtonAccessory((button) =>
              button
                .setCustomId(`v2_deck_show:${deck.id}:${userId}`)
                .setLabel("View")
                .setStyle(ButtonStyle.Secondary),
            ),
        );
      }

      container.addTextDisplayComponents((text) =>
        text.setContent("-# Bring one with `/finicard battle deck:<name>`."),
      );

      await interaction.editReply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2],
      });
      return;
    }

    case "build": {
      const name = interaction.options.getString("name", true);
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

      const pages = await buildDeckPages(deck, {
        viewerId: userId,
        binder: interaction.options.getString("view") === "binder",
      });
      await interaction.editReply(
        pages ??
          `**${deck.name}** has no cards left in your collection. Add some with \`/finicard deck add\`.`,
      );
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
        `${isAdd ? "Added" : "Removed"} **${card.name}** ${isAdd ? "to" : "from"} **${deck.name}** (${(updated.deck.cards ?? []).length} of ${DECK_SIZE} cards${
          (updated.deck.cards ?? []).length < DECK_SIZE ? " - add another before you play it" : ""
        }).`,
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
