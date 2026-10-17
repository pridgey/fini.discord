import {
  SlashCommandBuilder,
  SlashCommandStringOption,
} from "@discordjs/builders";
import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import {
  SORT_LABEL as COLLECTION_SORT_LABEL,
  TIER_LABEL as COLLECTION_TIER_LABEL,
  type CollectionSort,
  type CollectionTier,
} from "../modules/finicards/collectionFilters";
import {
  HAND_SIZE,
  MAX_HAND_SIZE,
  MIN_HAND_SIZE,
} from "../modules/finicards/draw";
import { DUNGEON } from "../modules/finicards/dungeon";
import {
  BOOSTER_SETS,
  PACK_COST,
  SET_PACK_COST,
} from "../modules/finicards/packs";
import { runSell } from "../modules/finicards/sellFlow";
import { runTrade } from "../modules/finicards/tradeFlow";
import { buildAbilitiesMessage } from "../modules/finicards/ui/abilitiesMessage";
import type { FinicardContext } from "./finicard/context";
import { showCard, showCollection, showRecord } from "./finicard/collection";
import { showPending, startBattle, startPractice } from "./finicard/battle";
import { enterDungeon, showDungeonTutorial } from "./finicard/dungeon";
import { grantCards } from "./finicard/grant";
import { openPackFor } from "./finicard/pack";
import { handleDeckSubcommand } from "./finicard/deck";

/**
 * Finicards: the card game.
 *
 * One command with subcommands rather than a spread of top-level commands, so
 * the whole game is found in one place. It was named with a `-v2` suffix while
 * it was tested alongside the first game; v1's `/booster-pack`, `/card-collection`,
 * `/sell-card` and `/fuse-cards` were retired when it launched,
 * and later deleted.
 */

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
  .setDescription(
    "Finicards - packs, your collection, decks, battles and dungeons",
  )
  .addSubcommand((sub) =>
    sub
      .setName("pack")
      .setDescription(
        `Open a booster pack: five cards for ${PACK_COST} fc, or ${SET_PACK_COST} fc from one set. Free packs open first.`,
      )
      .addIntegerOption((opt) =>
        opt
          .setName("set")
          .setDescription(
            `Draw every card from one set (${SET_PACK_COST} fc). Leave blank for a mix of all sets.`,
          )
          .addChoices(
            ...BOOSTER_SETS.map((set) => ({ name: `Set ${set}`, value: set })),
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("test")
          .setDescription(
            "[Bot admin] Testing: force a special pull into this pack, free of charge",
          )
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
      .setDescription(
        "Your cards - as a list with their ids, or as binder pages",
      )
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
          .setDescription(
            "What order to show the cards in (default: newest first)",
          )
          .addChoices(
            ...(Object.keys(COLLECTION_SORT_LABEL) as CollectionSort[]).map(
              (value) => ({
                name: COLLECTION_SORT_LABEL[value],
                value,
              }),
            ),
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
            ...(Object.keys(COLLECTION_TIER_LABEL) as CollectionTier[]).map(
              (value) => ({
                name: COLLECTION_TIER_LABEL[value],
                value,
              }),
            ),
          )
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("set")
          .setDescription("Only cards from this set")
          .addChoices(
            ...BOOSTER_SETS.map((set) => ({ name: `Set ${set}`, value: set })),
          )
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option.setName("foil").setDescription("Only foils").setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName("ability")
          .setDescription("Only cards that rolled an ability")
          .setRequired(false),
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
      .setName("dungeon-tutorial")
      .setDescription(
        "Learn the dungeon with a borrowed hand - free, private, five rooms",
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("pending").setDescription("Battles waiting on your lineup"),
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
      .setDescription(
        "Sell or trade one of your cards - to anyone, to a player, or to Fini",
      )
      .addStringOption((option) =>
        option
          .setName("card")
          .setDescription("The card's id, from /finicard collection")
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName("price")
          .setDescription(
            "Asking price in Finicoin (ignored when selling to Fini)",
          )
          .setMinValue(0)
          .setRequired(false),
      )
      .addUserOption((option) =>
        option
          .setName("who")
          .setDescription(
            "Who to sell to: a player, or Fini. Leave blank to offer it to anyone",
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("trade")
      .setDescription(
        "Offer another player a trade: your cards and fc for theirs",
      )
      .addUserOption((option) =>
        option
          .setName("with")
          .setDescription("Who to trade with")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("give")
          .setDescription(
            "Your card ids, separated by spaces (from /finicard collection)",
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("want")
          .setDescription(
            "Their card ids, separated by spaces (from /finicard collection)",
          )
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("give_fc")
          .setDescription("Finicoin you add to your side")
          .setMinValue(0)
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("want_fc")
          .setDescription("Finicoin you ask them to add")
          .setMinValue(0)
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("abilities").setDescription("Every ability and what it does"),
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
  const serverName = interaction.guild?.name ?? "unknown guild name";
  const context: FinicardContext = {
    serverId: interaction.guildId ?? "unknown guild id",
    serverName,
    identifier: `${interaction.user.username}-${serverName}`,
  };

  /* A practice battle, the dungeon tutorial and the abilities guide are shown
     only to the player running them, and whether a reply is ephemeral is
     fixed at the moment it is deferred. */
  const isPrivate = ["practice", "dungeon-tutorial", "abilities"].includes(
    interaction.options.getSubcommand(false) ?? "",
  );
  await interaction.deferReply(
    isPrivate ? { flags: [MessageFlags.Ephemeral] } : undefined,
  );

  try {
    /* The deck group is dispatched first - `getSubcommand()` returns the leaf
       name either way, so without this a `deck list` would fall through to the
       flat cases. */
    if (interaction.options.getSubcommandGroup(false) === "deck") {
      await handleDeckSubcommand(interaction, context);
      return;
    }

    switch (interaction.options.getSubcommand()) {
      case "pack":
        return await openPackFor(interaction, {
          set: interaction.options.getInteger("set"),
          test: interaction.options.getString("test"),
        });
      case "collection":
        return await showCollection(interaction, context);
      case "card":
        return await showCard(interaction, context);
      case "battle":
        return await startBattle(interaction, context);
      case "practice":
        return await startPractice(interaction, context);
      case "dungeon-tutorial":
        return await showDungeonTutorial(interaction, context);
      case "dungeon":
        return await enterDungeon(interaction, context);
      case "pending":
        return await showPending(interaction, context);
      case "record":
        return await showRecord(interaction, context);
      case "abilities":
        await interaction.editReply(buildAbilitiesMessage());
        return;
      case "sell":
        return await runSell(interaction, context);
      case "trade":
        return await runTrade(interaction, context);
      case "grant":
        return await grantCards(interaction, context);
      default:
        await interaction.editReply("Unknown subcommand.");
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
