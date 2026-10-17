import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  type MediaGalleryItemBuilder,
} from "discord.js";
import type { V2DungeonRunState } from "../../../types/PocketbaseTablesV2";
import {
  DUNGEON_SCENE_FILE,
  DUNGEON_SUMMARY_FILE,
  cardImageName,
  renderCardImage,
  renderDungeonScene,
  renderDungeonSummary,
  renderHandStrip,
} from "../cardArt";
import {
  DUNGEON,
  DUNGEON_SIDE,
  PLAYER_SIDE,
  buffedCard,
  coinFor,
  cooldownLeft,
  describeEffect,
  doorHint,
  doorSight,
  eventChance,
  modsOf,
  nextLeg,
  nextSlot,
  weakenedEnemy,
  type DungeonReward,
  type Buff,
  type DungeonState,
  type Mods,
  type Room,
} from "../dungeon";
import { cardLabel } from "../lineupPicker";
import { CARD_EMOJI, TYPE_EMOJI } from "../rules";
import type { BattleCard, Side } from "../types";
import { enemyAbilityLines } from "./enemyAbility";
import { roundBlock } from "./resultMessage";
import {
  DRAW_ACCENT,
  NEUTRAL_ACCENT,
  SIDE_ACCENT,
  TYPE_ACCENT,
  TYPE_NAME,
  WHEEL_HINT,
  activeKeyword,
  cardLine,
  keywordLegend,
} from "./theme";

/**
 * A dungeon run, as one message that is edited in place on every click.
 *
 * While the run is live it is three blocks: where the run stands (geld, buffs
 * and what the last click did), the one room the player is in - or the doors
 * out of it - and the hand. The room is a single scene image, because it is the
 * only room there is to look at; the hand is a strip image for the reason the
 * reveal's hands are, with the cards on cooldown dimmed in place so the player
 * can see what is coming back and when.
 *
 * Once the run ends the room, the hand and the buttons go and a single block is
 * left: how far it got and what it paid.
 */

export type DungeonMessageInput = {
  runId: string;
  userId: string;
  playerName: string;
  state: V2DungeonRunState;
  entryFee: number;
  progress: DungeonState;
  /** The dealt hand, each card with its index into it. Printed stats. */
  hand: { card: BattleCard; index: number }[];
  /** What the run paid, once it has ended. */
  reward?: DungeonReward | null;
  /**
   * The tutorial's buttons: its own ids, and only the move being taught
   * switched on. Left out, every button belongs to the run.
   */
  controls?: {
    id: (action: string) => string;
    enabled: (action: string) => boolean;
  };
};

export type BuiltDungeonMessage = {
  components: ContainerBuilder[];
  files: AttachmentBuilder[];
  flags: [MessageFlags.IsComponentsV2];
};

export type DungeonImages = {
  scene: Buffer | null;
  hand: Buffer | null;
  /** The run's numbers and path. Finished runs only. */
  summary?: Buffer | null;
  /** One per boss drop, in `reward.cards` order. Finished runs only. */
  cards?: (Buffer | null)[];
};

/* A fixed name: a colliding or truncated one breaks `attachment://`. */
const HAND_FILE = "dungeon-hand.png";
/** Discord refuses a message with more files than this. */
const MAX_ATTACHMENTS = 10;

/* Twice the cards per row, so more pixels to keep each one sharp. */
const DUNGEON_HAND_WIDTH = 1800;

const DUNGEON_NAME = "The dungeon";
const SHOP_ACCENT = 0xffd166;
const EVENT_ACCENT = 0xb18cff;

const plural = (count: number, word: string, many = `${word}s`): string =>
  `${count} ${count === 1 ? word : many}`;

/** "Play a card to fight. It then rests for 2 rooms." */
const restLine = (rooms: number): string =>
  rooms > 0
    ? `-# Play a card to fight. It then rests for ${plural(rooms, "room")}.`
    : "-# Play a card to fight. It's ready again straight after.";

/** The hand as it plays right now: buffs applied, cooldowns counted. */
const handView = (input: DungeonMessageInput) => {
  const mods = modsOf(input.progress);
  return input.hand.map(({ card, index }) => ({
    index,
    raw: card,
    card: buffedCard(card, mods),
    cooldown: cooldownLeft(input.progress, card.instanceId),
  }));
};

/** Renders whatever images the run's current state shows. */
export const buildDungeonMessage = async (
  input: DungeonMessageInput,
): Promise<BuiltDungeonMessage> => {
  if (input.state !== "active") {
    const summary = await renderDungeonSummary({
      progress: input.progress,
      fell: input.state === "failed",
      coin: input.reward?.kind === "coin" ? input.reward.amount : 0,
    });
    // A message carries ten attachments, the summary among them; a run that
    // beat more bosses than that shows the first drops and lists the rest.
    const shown = MAX_ATTACHMENTS - (summary ? 1 : 0);
    return composeDungeonMessage(input, {
      scene: null,
      hand: null,
      summary,
      cards: await Promise.all(
        (input.reward?.cards ?? [])
          .slice(0, shown)
          .map((card) => renderCardImage(card)),
      ),
    });
  }

  const hand = handView(input);
  const [scene, strip] = await Promise.all([
    renderDungeonScene(input.progress),
    renderHandStrip(
      hand.map((entry) => entry.card),
      {
        cooldowns: hand.map((entry) => entry.cooldown),
        // Two across, so the hand is half as tall under the room's scene.
        columns: 2,
        width: DUNGEON_HAND_WIDTH,
      },
    ),
  ]);

  return composeDungeonMessage(input, { scene, hand: strip });
};

const lootLine = (progress: DungeonState): string | null => {
  if (progress.loot.length === 0) return null;
  const fullArts = progress.loot.filter(
    (rarity) => rarity === "full_art",
  ).length;
  const uncommons = progress.loot.length - fullArts;
  return `${CARD_EMOJI} ${[
    ...(uncommons > 0 ? [`${uncommons} uncommon`] : []),
    ...(fullArts > 0 ? [`${fullArts} full-art`] : []),
  ].join(" + ")} banked`;
};

const rewardLine = (
  reward: DungeonReward | null | undefined,
  state: V2DungeonRunState,
): string => {
  if (reward?.kind !== "coin") {
    return "Not enough geld to be worth a coin, so no Finicoin comes back.";
  }
  const lost =
    state === "failed"
      ? ` You fell, so only ${reward.kept} of it made it out.`
      : "";
  return `🪙 **${reward.geld} geld** carried.${lost} It converts to **${reward.amount} fc**.`;
};

/**
 * The groups buffs are shown in, by what they change. A buff that changes
 * things in two groups shows in both.
 */
const BUFF_GROUPS: { icon: string; label: string; keys: (keyof Mods)[] }[] = [
  { icon: "💪", label: "Your cards", keys: ["power", "wit", "heart", "type"] },
  { icon: "🧿", label: "Enemies", keys: ["enemy"] },
  { icon: "🪙", label: "Geld", keys: ["geld"] },
  { icon: "🎲", label: "Events", keys: ["roll"] },
  { icon: "⏱️", label: "Rest", keys: ["cooldown"] },
  { icon: "🗺️", label: "Doors", keys: ["scout", "fog"] },
];

/** One kind of change, as a few words: "+2 Power", "enemies −1". */
const modText = (key: keyof Mods, amount: number): string => {
  switch (key) {
    case "power":
    case "wit":
    case "heart":
      return `+${amount} ${TYPE_NAME[key]}`;
    case "type":
      return `+${amount} type stat`;
    case "enemy":
      return `−${amount} all stats`;
    case "geld":
      return `+${amount}% from fights`;
    case "roll":
      return `+${amount} to rolls`;
    case "cooldown":
      return amount < 0
        ? `${plural(-amount, "room")} shorter`
        : `${plural(amount, "room")} longer`;
    case "scout":
      return "enemies shown";
    case "fog":
      return "hidden";
    default:
      return "";
  }
};

/** What a buff changes within one group, joined: "+2 Power, +1 Heart". */
const groupText = (mods: Partial<Mods>, keys: (keyof Mods)[]): string =>
  keys
    .filter((key) => (mods[key] ?? 0) !== 0)
    .map((key) => modText(key, mods[key] ?? 0))
    .join(", ");

const roomsLeft = (buff: Buff): string =>
  buff.rooms === null
    ? ""
    : buff.mods.scout || buff.mods.fog
      ? plural(buff.rooms, "door choice")
      : plural(buff.rooms, "room");

/**
 * The run's buffs, a line per group: what the for-the-run buffs add up to,
 * then each timed one with how long it has left. Copies of a buff are one
 * entry - three Whetstones are "+3 Power", two of the same War Paint "×2".
 */
export const buffLines = (buffs: Buff[]): string[] =>
  BUFF_GROUPS.flatMap(({ icon, label, keys }) => {
    const touches = (buff: Buff) =>
      keys.some((key) => (buff.mods[key] ?? 0) !== 0);
    const lasting = buffs.filter(
      (buff) => buff.rooms === null && touches(buff),
    );
    const timed = buffs.filter((buff) => buff.rooms !== null && touches(buff));
    if (lasting.length === 0 && timed.length === 0) return [];

    const total: Partial<Mods> = {};
    for (const buff of lasting) {
      for (const key of keys)
        total[key] = (total[key] ?? 0) + (buff.mods[key] ?? 0);
    }

    const merged = new Map<string, { buff: Buff; count: number }>();
    for (const buff of timed) {
      const id = `${buff.name}|${buff.rooms}|${JSON.stringify(buff.mods)}`;
      const entry = merged.get(id);
      if (entry) entry.count++;
      else merged.set(id, { buff, count: 1 });
    }

    const parts = [
      ...(lasting.length > 0 ? [groupText(total, keys)] : []),
      ...[...merged.values()].map(
        ({ buff, count }) =>
          `${buff.name}${count > 1 ? ` ×${count}` : ""}: ${groupText(
            Object.fromEntries(
              keys.map((key) => [key, (buff.mods[key] ?? 0) * count]),
            ),
            keys,
          )} _(${roomsLeft(buff)})_`,
      ),
    ];
    return [`-# ${icon} ${label}: ${parts.join(" · ")}`];
  });

/** Wards, loaded dice and coffee: the run's charges, on a line of their own. */
const chargeLine = (progress: DungeonState): string | null => {
  const charges = [
    ...(progress.wards > 0 ? [`🛡️ ${plural(progress.wards, "ward")}`] : []),
    ...((progress.rerolls ?? 0) > 0
      ? [`🎲 ${plural(progress.rerolls ?? 0, "loaded die", "loaded dice")}`]
      : []),
    ...((progress.coffee ?? 0) > 0
      ? [`☕ ${plural(progress.coffee ?? 0, "coffee")}`]
      : []),
  ];
  return charges.length > 0 ? charges.join(" · ") : null;
};

const roomTitle = (room: Room, depth: number): string => {
  switch (room.kind) {
    case "shop":
      return `### 🛒 Room ${depth} — The shop`;
    case "event":
      return `### ❓ Room ${depth} — ${room.title}`;
    case "fight":
      return `### ${room.tier === "boss" ? "👑" : "⚔️"} Room ${depth} — ${
        room.tier === "boss"
          ? "Boss · "
          : room.tier === "elite"
            ? "Elite · "
            : ""
      }${room.enemy.name}`;
  }
};

const roomAccent = (room: Room): number =>
  room.kind === "shop"
    ? SHOP_ACCENT
    : room.kind === "event"
      ? EVENT_ACCENT
      : TYPE_ACCENT[room.enemy.type];

/** A door's hint as the player can see it: nothing at all through fog. */
const doorText = (room: Room, sight: ReturnType<typeof doorSight>): string =>
  sight === "fogged" ? "???" : doorHint(room);

const doorIcon = (room: Room, sight: ReturnType<typeof doorSight>): string =>
  sight === "fogged" ? "🌫️" : doorEmoji(room);

/** What a map shows behind a door: the enemy itself. */
const scoutLine = (room: Room, index: number): string =>
  room.kind === "fight"
    ? `🗺️ Door ${index + 1}: ${cardLine(room.enemy)}${room.enemy.keyword ? ` · _${activeKeyword(room.enemy)?.name ?? ""}_` : ""}`
    : `🗺️ Door ${index + 1}: ${doorHint(room)}`;

const doorEmoji = (room: Room): string =>
  room.kind === "shop"
    ? "🛒"
    : room.kind === "event"
      ? "❓"
      : room.tier === "boss"
        ? "👑"
        : TYPE_EMOJI[room.enemy.type];

/**
 * Builds the message from already-rendered images. A null image falls back to
 * text that carries the same numbers.
 */
export const composeDungeonMessage = (
  input: DungeonMessageInput,
  images: DungeonImages,
): BuiltDungeonMessage => {
  const { progress, state, runId } = input;
  const { room, depth, phase } = progress;
  const names: Record<Side, string> = {
    [PLAYER_SIDE]: input.playerName,
    [DUNGEON_SIDE]: DUNGEON_NAME,
  } as Record<Side, string>;

  const headline =
    state === "active"
      ? `## 🏰 Dungeon — room ${depth}`
      : state === "failed"
        ? `## 💀 Fell in room ${depth}`
        : `## 🚪 Walked out of room ${depth}`;

  const accent =
    state === "active"
      ? NEUTRAL_ACCENT
      : state === "failed"
        ? SIDE_ACCENT[DUNGEON_SIDE]
        : DRAW_ACCENT;

  const loot = lootLine(progress);
  const status =
    state === "active"
      ? [
          `🪙 **${progress.geld} geld** (${coinFor(progress.geld)} fc if you walk out)`,
          ...(loot ? [loot] : []),
        ]
      : [
          `${input.entryFee} fc entry`,
          `${plural(progress.fightsWon, "fight")} won`,
        ];

  const charges = state === "active" ? chargeLine(progress) : null;
  const buffs = state === "active" ? buffLines(progress.buffs) : [];
  const header = new ContainerBuilder()
    .setAccentColor(accent)
    .addTextDisplayComponents((text) =>
      text.setContent(
        [
          headline,
          [`<@${input.userId}>`, ...status].join(" · "),
          ...(charges ? [charges] : []),
          ...buffs,
        ].join("\n"),
      ),
    );

  if (progress.recap) {
    const { round, lines } = progress.recap;
    header
      .addSeparatorComponents((separator) => separator)
      .addTextDisplayComponents((text) =>
        text.setContent(
          [...(round ? [roundBlock(round, names)] : []), ...lines].join("\n"),
        ),
      );
  }

  /* ---------------------------------------------------------- finished ---- */
  if (state !== "active") {
    header
      .addSeparatorComponents((separator) => separator)
      .addTextDisplayComponents((text) =>
        text.setContent(
          [
            rewardLine(input.reward, state),
            ...(input.reward?.cards ?? []).map(
              (card) =>
                `${CARD_EMOJI} **Boss drop:** ${cardLine(card)} · \`${card.instanceId}\``,
            ),
          ].join("\n"),
        ),
      );

    const files: AttachmentBuilder[] = [];

    if (images.summary) {
      files.push(
        new AttachmentBuilder(images.summary, { name: DUNGEON_SUMMARY_FILE }),
      );
      header.addMediaGalleryComponents((gallery) =>
        gallery.addItems((item) =>
          item
            .setURL(`attachment://${DUNGEON_SUMMARY_FILE}`)
            .setDescription("Run summary"),
        ),
      );
    }

    const drops = (input.reward?.cards ?? []).flatMap((card, index) => {
      const image = images.cards?.[index];
      if (!image) return [];
      // Prefixed, so two copies of one card cannot share a filename.
      const name = `drop-${index}-${cardImageName(card)}`;
      files.push(new AttachmentBuilder(image, { name }));
      return [{ name, description: card.name }];
    });

    if (drops.length > 0) {
      header.addMediaGalleryComponents((gallery) =>
        gallery.addItems(
          ...drops.map(
            (drop) => (item: MediaGalleryItemBuilder) =>
              item
                .setURL(`attachment://${drop.name}`)
                .setDescription(drop.description),
          ),
        ),
      );
    }

    return {
      components: [header],
      files,
      flags: [MessageFlags.IsComponentsV2],
    };
  }

  /* ------------------------------------------------------------ active ---- */
  const files: AttachmentBuilder[] = [];
  const id = (action: string) =>
    input.controls?.id(action) ??
    `v2_dungeon:${runId}:${progress.step}:${action}`;
  const off = (action: string) =>
    !!input.controls && !input.controls.enabled(action);
  const mods = modsOf(progress);
  const hand = handView(input);
  const ready = hand.filter((entry) => entry.cooldown === 0);

  const gallery = (
    container: ContainerBuilder,
    image: Buffer | null,
    file: string,
    description: string,
    fallback: string[],
  ) => {
    if (image) {
      files.push(new AttachmentBuilder(image, { name: file }));
      container.addMediaGalleryComponents((media) =>
        media.addItems((item) =>
          item.setURL(`attachment://${file}`).setDescription(description),
        ),
      );
    } else if (fallback.length > 0) {
      container.addTextDisplayComponents((text) =>
        text.setContent(fallback.join("\n")),
      );
    }
  };

  /* Every button carries the step it was drawn for, so a click on an older
     copy of this message is refused instead of being played twice. */
  const buttonRows = (
    container: ContainerBuilder,
    buttons: ButtonBuilder[],
  ) => {
    for (let index = 0; index < buttons.length; index += 5) {
      container.addActionRowComponents(() =>
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          buttons.slice(index, index + 5),
        ),
      );
    }
  };

  /* ------------------------------------------------- the room, or doors -- */
  const scene = new ContainerBuilder();

  if (phase === "doors") {
    const { doors } = progress;
    const sight = doorSight(progress);
    scene
      .setAccentColor(NEUTRAL_ACCENT)
      .addTextDisplayComponents((text) =>
        text.setContent(
          doors.length === 1
            ? `### 🚪 Room ${depth + 1} — only one way on`
            : `### 🚪 Room ${depth + 1} — choose a door`,
        ),
      );
    gallery(
      scene,
      images.scene,
      DUNGEON_SCENE_FILE,
      doors.map((door) => doorText(door, sight)).join(" or "),
      doors.map(
        (door, index) =>
          `**${index + 1}** · ${doorIcon(door, sight)} ${doorText(door, sight)}`,
      ),
    );
    scene.addTextDisplayComponents((text) =>
      text.setContent(
        sight === "fogged"
          ? "🌫️ The fog is too thick to see what's behind either door. Pick one and hope."
          : [
              ...(sight === "scouted" ? doors.map(scoutLine) : []),
              "-# A door only tells you what kind of room is behind it.\n-# Every room you enter brings your resting cards one room closer.",
            ].join("\n"),
      ),
    );
    buttonRows(
      scene,
      doors.map((door, index) =>
        new ButtonBuilder()
          .setCustomId(id(`d${index}`))
          .setLabel(`${index + 1} · ${doorText(door, sight)}`)
          .setEmoji(doorIcon(door, sight))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(off(`d${index}`)),
      ),
    );
  } else {
    scene
      .setAccentColor(roomAccent(room))
      .addTextDisplayComponents((text) =>
        text.setContent(roomTitle(room, depth)),
      );

    if (room.kind === "fight") {
      gallery(scene, images.scene, DUNGEON_SCENE_FILE, room.enemy.name, [
        cardLine(room.enemy),
        `🪙 ${room.geld} geld for the win`,
      ]);
      scene.addTextDisplayComponents((text) =>
        text.setContent(
          // Sections a blank line apart: the enemy and its ability, which
          // slot this fight is, then how to play it.
          [
            [
              ...(room.preview
                ? [
                    `👀 **A sneak peek** — ${room.enemy.name.replace(/^Sudden /, "")} is from ${room.enemy.set ? `Set ${room.enemy.set}` : "a set"}, which isn't out yet.`,
                  ]
                : []),
              ...keywordLegend([room.enemy]),
              ...enemyAbilityLines(progress, weakenedEnemy(room.enemy, mods)),
            ],
            [
              `-# For abilities this is **slot ${nextSlot(progress)} of ${DUNGEON.legLength}**.`,
              `-# This is **leg ${nextLeg(progress)}**.`,
            ],
            [restLine(DUNGEON.cooldownRooms + mods.cooldown), WHEEL_HINT],
          ]
            .filter((section) => section.length > 0)
            .map((section) => section.join("\n"))
            .join("\n\n"),
        ),
      );
    }

    if (room.kind === "event") {
      gallery(scene, images.scene, DUNGEON_SCENE_FILE, room.title, [room.text]);
      scene.addTextDisplayComponents((text) =>
        text.setContent(
          [
            `Play a card: its **${TYPE_NAME[room.stat]}** + 🎲 d${DUNGEON.event.die} has to reach **${room.target}**.`,
            `-# Pass: ${describeEffect(room.reward)}. Fail: ${room.failEffect ? describeEffect(room.failEffect) : "only one door to choose from next"}. The card rests either way.`,
          ].join("\n"),
        ),
      );
    }

    if (room.kind === "shop") {
      gallery(
        scene,
        images.scene,
        DUNGEON_SCENE_FILE,
        "The shop",
        room.offers.map(
          (offer, index) =>
            `**${index + 1}** · ${offer.sold ? "~~" : ""}**${offer.name}** — ${offer.blurb} · 🪙 ${offer.price}${offer.sold ? "~~ sold" : ""}`,
        ),
      );
      scene.addTextDisplayComponents((text) =>
        text.setContent(
          `-# Geld only spends here, and what you buy lasts for this run. You have 🪙 **${progress.geld}**.`,
        ),
      );
      buttonRows(scene, [
        ...room.offers.map((offer, index) =>
          new ButtonBuilder()
            .setCustomId(id(`b${index}`))
            .setLabel(
              offer.sold
                ? `${offer.name} — sold`
                : `${offer.name} — ${offer.price} geld`,
            )
            .setStyle(ButtonStyle.Success)
            .setDisabled(
              offer.sold || offer.price > progress.geld || off(`b${index}`),
            ),
        ),
        new ButtonBuilder()
          .setCustomId(id("leave"))
          .setLabel("Leave the shop")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(off("leave")),
      ]);
    }
  }

  /* ---------------------------------------------------------- the hand -- */
  const playing = phase === "room" && room.kind !== "shop";
  const handBlock = new ContainerBuilder()
    .setAccentColor(SIDE_ACCENT[PLAYER_SIDE])
    .addTextDisplayComponents((text) =>
      text.setContent(
        !playing
          ? "### Your hand"
          : ready.length === 0
            ? "### Your hand — every card is resting"
            : room.kind === "event"
              ? "### Your hand — play a card at the event"
              : "### Your hand — play a card into the fight",
      ),
    );

  gallery(
    handBlock,
    images.hand,
    HAND_FILE,
    "Your hand",
    hand.map(
      (entry) =>
        `${cardLine(entry.card)}${entry.cooldown > 0 ? ` · ⏳ ready in ${plural(entry.cooldown, "room")}` : ""}`,
    ),
  );

  const legend = keywordLegend(hand.map((entry) => entry.card));
  if (legend.length > 0) {
    handBlock.addTextDisplayComponents((text) =>
      text.setContent(legend.join("\n")),
    );
  }

  if (playing) {
    buttonRows(
      handBlock,
      ready.map((entry) => {
        const label =
          room.kind === "event"
            ? `${cardLabel(entry.card).slice(0, 70)} · ${Math.round(eventChance(room, entry.raw, mods) * 100)}%`
            : cardLabel(entry.card);
        return new ButtonBuilder()
          .setCustomId(id(`c${entry.index}`))
          .setLabel(label)
          .setEmoji(TYPE_EMOJI[entry.card.type])
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(off(`c${entry.index}`));
      }),
    );
  }

  /* A coffee can be drunk in any room, on any card that is resting. */
  if ((progress.coffee ?? 0) > 0) {
    buttonRows(
      handBlock,
      hand
        .filter((entry) => entry.cooldown > 0)
        .map((entry) =>
          new ButtonBuilder()
            .setCustomId(id(`w${entry.index}`))
            .setLabel(`Wake ${entry.card.name}`.slice(0, 80))
            .setEmoji("☕")
            .setStyle(ButtonStyle.Success)
            .setDisabled(off(`w${entry.index}`)),
        ),
    );
  }

  const leaveWith = coinFor(progress.geld);
  buttonRows(handBlock, [
    ...(playing && room.kind === "event"
      ? [
          new ButtonBuilder()
            .setCustomId(id("leave"))
            .setLabel("Walk past (counts as failing)")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(off("leave")),
        ]
      : []),
    new ButtonBuilder()
      .setCustomId(id("retreat"))
      .setLabel(
        leaveWith > 0
          ? `Walk out with ${leaveWith} fc`
          : "Walk out with nothing",
      )
      .setStyle(ButtonStyle.Danger)
      .setDisabled(off("retreat")),
  ]);

  return {
    components: [header, scene, handBlock],
    files,
    flags: [MessageFlags.IsComponentsV2],
  };
};
