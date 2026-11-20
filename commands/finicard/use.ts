import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type Message,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { V2ItemRecord } from "../../types/PocketbaseTablesV2";
import {
  getCardDefinitions,
  getPopulationCounts,
  getUserCollection,
  grantCard,
  rollCopyKeyword,
  toBattleCard,
  updateCopy,
} from "../../modules/finicards/cardStore";
import { cardInPlay, findSellable } from "../../modules/finicards/market";
import { cardSuggestions } from "../../modules/finicards/cardSuggestions";
import {
  cleanNickname,
  rerolledKeyword,
  scrollChoices,
} from "../../modules/finicards/cardBoons";
import { findKeyword } from "../../modules/finicards/keywords";
import { announcePiecesFound } from "../../modules/finicards/pieceNotice";
import type { OwnedCard } from "../../modules/finicards/types";
import {
  activateItem,
  getItems,
  grantItems,
  piecesTaken,
  spendItem,
  spendPieces,
  stillHoldsItem,
  summonedHolders,
} from "../../modules/finicards/itemStore";
import {
  COLLECTIONS,
  itemByKey,
  rollItem,
  standInFor,
  type CollectionKey,
  type ItemDefinition,
} from "../../modules/finicards/items";
import { planUse } from "../../modules/finicards/useItem";
import {
  SUMMON_FILE,
  SUMMON_MS,
  renderSummonGif,
} from "../../modules/finicards/cardArt/summonAnimation";
import { renderCardMedia } from "../../modules/finicards/cardArt/legendaryGif";
import {
  buildSummonMessage,
  buildSummonNotice,
} from "../../modules/finicards/ui/summonMessage";
import { getBotChannelForServer } from "../../utilities/config/configUtils";
import { sendTo } from "../../modules/dailies/shared";

/** How long the card rests at the end of the animation before the still takes over. */
const REST_MS = 1500;

/**
 * Where a use from the satchel answers. The satchel's own message is left to
 * be redrawn, so what happens is said beneath it: `say` posts it for the
 * channel to see, and called again changes that same post; `whisper` tells
 * only the player, for a use that went nowhere.
 */
export type UseScene = {
  interaction: StringSelectMenuInteraction | ModalSubmitInteraction;
  say(payload: string | InteractionEditReplyOptions): Promise<Message>;
  whisper(text: string): Promise<unknown>;
};

/** A scene for an interaction already acknowledged with `deferUpdate`. */
export const sceneFor = (
  interaction: StringSelectMenuInteraction | ModalSubmitInteraction,
): UseScene => {
  let posted: Message | null = null;
  return {
    interaction,
    say: async (payload) => {
      const options = typeof payload === "string" ? { content: payload } : payload;
      posted = posted
        ? await interaction.editReply({ ...options, message: posted.id })
        : await interaction.followUp(options as InteractionReplyOptions);
      return posted;
    },
    whisper: (text) =>
      interaction.followUp({
        content: text,
        flags: [MessageFlags.Ephemeral],
        allowedMentions: { parse: [] },
      }),
  };
};

/**
 * Uses what was picked from the satchel's dropdown - an item's key, or
 * `summon:<set>` - or, for a card boon, what its form named.
 */
export const useItem = async (
  scene: UseScene,
  picked: string,
  serverId: string,
  form?: { card: string; name: string },
): Promise<void> => {
  const { interaction } = scene;
  const [items, holders] = await Promise.all([
    getItems(interaction.user.id, serverId),
    summonedHolders(serverId),
  ]);
  const plan = planUse(picked, items, holders);

  if (plan.kind === "say") {
    await scene.whisper(plan.text);
    return;
  }
  if (plan.kind === "activate") {
    await activateItem(plan.row.id ?? "");
    await scene.whisper(plan.text);
    return;
  }
  if (plan.kind === "card") {
    await useOnCard(scene, plan.row, plan.item, serverId, form);
    return;
  }
  if (plan.kind === "open") {
    await openBox(scene, plan.row, plan.item, serverId);
    return;
  }
  const serverName = interaction.guild?.name ?? "unknown guild name";
  await summon(
    scene,
    plan.set,
    plan.rows,
    serverId,
    `${interaction.user.username}-${serverName}`,
  );
};

/* --------------------------------------------------------- card boons -- */

/** How long an Ability Scroll's choice stays open. */
const SCROLL_MS = 120_000;

/** Why an ability can't change right now, and that nothing was spent. */
export const inPlayText = (
  name: string,
  where: "dungeon" | "battle",
  item: ItemDefinition,
): string =>
  `**${name}** is in ${
    where === "dungeon" ? "your dungeon run" : "a battle that isn't over"
  } right now, so its ability can't change mid-fight. Use the **${item.name}** once ${
    where === "dungeon" ? "the run" : "the battle"
  } is over - it hasn't been spent.`;

/** "**Edge** - Wins its round if the round would be a draw" */
const keywordLine = (slug: string): string => {
  const keyword = findKeyword(slug);
  return keyword ? `**${keyword.name}** - ${keyword.description}` : "no ability";
};

/** A card's picture, after a card boon changed it. */
const pictureOf = async (copy: OwnedCard) => {
  const media = await renderCardMedia(toBattleCard(copy)).catch(() => null);
  return media ? [new AttachmentBuilder(media.buffer, { name: media.name })] : [];
};

/**
 * The player's card a form named: by id, or by its name when only one of
 * their cards answers to it. Otherwise the cards it could be, to say back.
 */
const findCard = async (
  userId: string,
  serverId: string,
  typed: string,
): Promise<{ copy: OwnedCard } | { maybe: string[] }> => {
  const byId = await findSellable(userId, serverId, typed);
  if (byId) return { copy: byId };
  const copies = await getUserCollection(userId, serverId);
  const needle = typed.trim().toLowerCase();
  const matches = cardSuggestions(copies, typed);
  // A name typed in full picks its card from among longer names.
  const exact = matches.filter((match) => {
    const copy = copies.find((each) => each.id === match.value);
    if (!copy) return false;
    const card = toBattleCard(copy);
    return [card.name, card.cardName].some(
      (name) => name?.toLowerCase() === needle,
    );
  });
  const picked = exact.length === 1 ? exact : matches;
  if (picked.length === 1) {
    const copy = copies.find((each) => each.id === picked[0].value);
    if (copy) return { copy };
  }
  return { maybe: (exact.length ? exact : matches).map((match) => match.name) };
};

/**
 * A card boon on the copy named in its form: a nickname, a new keyword, three
 * to choose from, or foil. The boon is spent only once the change is made.
 */
const useOnCard = async (
  scene: UseScene,
  row: V2ItemRecord,
  item: ItemDefinition,
  serverId: string,
  form?: { card: string; name: string },
): Promise<void> => {
  const { interaction } = scene;
  const typed = form?.card.trim();
  if (!typed) {
    await scene.whisper(
      `${item.emoji} Say which card the **${item.name}** is for - its name or id.`,
    );
    return;
  }
  const found = await findCard(interaction.user.id, serverId, typed);
  if ("maybe" in found) {
    await scene.whisper(
      found.maybe.length
        ? [
            `More than one of your cards answers to \`${typed}\`. Use the ${item.name} again with one of these ids:`,
            ...found.maybe.slice(0, 10).map((label) => `- ${label}`),
          ].join("\n")
        : `\`${typed}\` isn't one of your cards. Give its name or id as \`/finicard collection\` shows it.`,
    );
    return;
  }
  const copy = found.copy;
  if (!copy.id) return;
  const card = toBattleCard(copy);

  if (item.key === "card_name_tag") {
    const nickname = cleanNickname(form?.name ?? "");
    if (!nickname) {
      await scene.whisper(
        "The new name can be up to 32 letters, numbers and spaces. The Name Tag is still yours.",
      );
      return;
    }
    const updated = await updateCopy(copy.id, { nickname });
    await spendItem(row.id ?? "");
    await scene.say({
      content: `${item.emoji} Your **${copy.definition.card_name}** \`${copy.id}\` is now called **${nickname}**.`,
      files: await pictureOf({ ...copy, ...updated }),
    });
    return;
  }

  if (item.key === "card_foil_kit") {
    if (copy.foil) {
      await scene.whisper(
        `Your **${card.name}** \`${copy.id}\` is already foil - the kit's still yours.`,
      );
      return;
    }
    const updated = await updateCopy(copy.id, { foil: true });
    await spendItem(row.id ?? "");
    await scene.say({
      content: `${item.emoji} Your **${card.name}** \`${copy.id}\` is foil now.`,
      files: await pictureOf({ ...copy, ...updated }),
    });
    return;
  }

  // An ability fitted to a fight already in front of the player would be a
  // cheat, so a card in play keeps its ability until the fight is over.
  if (item.key === "card_reroll" || item.key === "card_scroll") {
    const busy = await cardInPlay(interaction.user.id, serverId, copy.id);
    if (busy) {
      await scene.whisper(inPlayText(card.name, busy, item));
      return;
    }
  }

  if (item.key === "card_reroll") {
    const keyword = rerolledKeyword(card.rarity, copy.keyword ?? "");
    const updated = await updateCopy(copy.id, { keyword });
    await spendItem(row.id ?? "");
    await scene.say({
      content: [
        `${item.emoji} Your **${card.name}** \`${copy.id}\` rerolled its ability.`,
        `Was: ${keywordLine(copy.keyword ?? "")}`,
        `Now: ${keywordLine(keyword)}`,
      ].join("\n"),
      files: await pictureOf({ ...copy, ...updated }),
    });
    return;
  }

  // The Ability Scroll: three to choose from, nothing spent until one is picked.
  const choices = scrollChoices(card.rarity, copy.keyword ?? "");
  const message = await scene.say({
    content: [
      `${item.emoji} Pick a new ability for your **${card.name}** \`${copy.id}\`. It has ${keywordLine(copy.keyword ?? "")}.`,
      ...choices.map((slug, index) => `**${index + 1}.** ${keywordLine(slug)}`),
      "-# Nothing's spent until you pick. The choice closes in 2 minutes.",
    ].join("\n"),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...choices.map((slug, index) =>
          new ButtonBuilder()
            .setCustomId(`v2scroll-${index}`)
            .setLabel(`${index + 1}. ${findKeyword(slug)?.name ?? slug}`)
            .setStyle(ButtonStyle.Primary),
        ),
      ),
    ],
  });

  const press = await message
    .awaitMessageComponent({
      componentType: ComponentType.Button,
      time: SCROLL_MS,
      filter: (each) => each.user.id === interaction.user.id,
    })
    .catch(() => null);
  if (!press) {
    await scene
      .say({
        content: "📜 The scroll rolled itself back up. Nothing was spent.",
        components: [],
      })
      .catch(() => undefined);
    return;
  }

  // Both may have gone elsewhere while the choice was open.
  const keyword = choices[Number(press.customId.split("-")[1])] ?? choices[0];
  const still = await findSellable(interaction.user.id, serverId, copy.id);
  if (!still || !(await stillHoldsItem(interaction.user.id, row.id ?? ""))) {
    await press.update({
      content: "That card or the scroll is no longer yours, so nothing changed.",
      components: [],
    });
    return;
  }
  // It may have been dealt into a fight while the choice was open.
  const busy = await cardInPlay(interaction.user.id, serverId, copy.id);
  if (busy) {
    await press.update({
      content: inPlayText(card.name, busy, item),
      components: [],
    });
    return;
  }
  const updated = await updateCopy(copy.id, { keyword });
  await spendItem(row.id ?? "");
  await press.update({
    content: `${item.emoji} Your **${card.name}** \`${copy.id}\` now has ${keywordLine(keyword)}.`,
    components: [],
    files: await pictureOf({ ...copy, ...updated }),
  });
};

/* ------------------------------------------------------------- boxes -- */

/**
 * Opens a Mystery Box into another item, as deep in the dungeon as items go -
 * never a piece someone holds or carries, and never another box. A piece is
 * news on the server.
 */
const openBox = async (
  scene: UseScene,
  row: V2ItemRecord,
  item: ItemDefinition,
  serverId: string,
): Promise<void> => {
  const { interaction } = scene;
  const taken = await piecesTaken(serverId);
  let key = rollItem(35, taken, Math.random);
  for (let tries = 0; tries < 20 && itemByKey(key)?.kind === "box"; tries++)
    key = rollItem(35, taken, Math.random);
  if (itemByKey(key)?.kind === "box") key = standInFor(key, Math.random);

  const { granted, taken: lost } = await grantItems(
    interaction.user.id,
    serverId,
    [key],
    { source: "box" },
  );
  // Claimed by someone else in the moment between: something of its tier.
  const final = granted[0]?.item ??
    (
      await grantItems(
        interaction.user.id,
        serverId,
        lost.map((each) => standInFor(each, Math.random)),
        { source: "box" },
      )
    ).granted[0]?.item;
  if (!final) {
    await scene.whisper("The box was empty. It's still yours to try again.");
    return;
  }
  await spendItem(row.id ?? "");
  const inside = itemByKey(final)!;
  await scene.say(
    `${item.emoji} The **${item.name}** holds ${inside.emoji} **${inside.name}**!\n-# ${inside.blurb}`,
  );
  void announcePiecesFound(interaction.client, serverId, interaction.user.id, [
    final,
  ]);
};

const summon = async (
  scene: UseScene,
  set: CollectionKey,
  /** One of each of the set's pieces, as the player holds them. */
  pieces: Awaited<ReturnType<typeof getItems>>,
  serverId: string,
  identifier: string,
): Promise<void> => {
  const { interaction } = scene;
  const { summons } = COLLECTIONS[set];
  const definition = (await getCardDefinitions({ includeInactive: true })).find(
    (each) => each.card_name === summons && each.rarity === "summoned",
  );
  if (!definition?.id) {
    await scene.whisper(
      `**${summons}** isn't ready to be summoned yet. Your pieces are safe.`,
    );
    return;
  }
  // One per server, checked again at the last moment.
  const counts = await getPopulationCounts(serverId);
  if ((counts.get(definition.id) ?? 0) > 0) {
    await scene.whisper(
      `**${summons}** has already been summoned on this server. Your pieces are safe.`,
    );
    return;
  }

  // The card first, then the pieces: a failure between leaves the player
  // with both, never with neither.
  const record = await grantCard({
    userId: interaction.user.id,
    serverId,
    identifier,
    definitionId: definition.id,
    keyword: rollCopyKeyword(definition.rarity),
    acquiredFrom: "summon",
  });
  await spendPieces(
    pieces,
    pieces.map((row) => row.item),
  );

  const card = toBattleCard({ ...record, definition });
  const gif = await renderSummonGif(set, card);
  const message = await scene.say(
    buildSummonMessage({
      set,
      card,
      userId: interaction.user.id,
      media: gif ? { name: SUMMON_FILE, buffer: gif } : await renderCardMedia(card),
      resting: !gif,
    }),
  );

  // The server hears of it in the bot channel, unless that's where it happened.
  const botChannel = await getBotChannelForServer(serverId).catch(() => null);
  if (botChannel && botChannel !== interaction.channelId) {
    await sendTo(
      interaction.client,
      botChannel,
      buildSummonNotice(set, interaction.user.id, message.url),
    );
  }

  if (!gif) return;
  await new Promise((resolve) => setTimeout(resolve, SUMMON_MS + REST_MS));
  const still = await renderCardMedia(card);
  await scene
    .say({
      ...buildSummonMessage({
        set,
        card,
        userId: interaction.user.id,
        media: still,
        resting: true,
      }),
      attachments: [],
    })
    .catch((error) => console.error("Couldn't settle a summoning:", error));
};
