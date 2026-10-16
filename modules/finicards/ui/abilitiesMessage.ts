import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} from "discord.js";
import { GRADE_LABEL, KEYWORDS, type KeywordDefinition as Keyword } from "../keywords";
import { RULES } from "../rules";
import { NEUTRAL_ACCENT } from "./theme";

/**
 * `/finicard abilities`: every ability, sorted into groups a player would look
 * for them by - not the engine's resolution stages, which put nineteen
 * unrelated abilities under "conditional". The overview names each group's
 * abilities; a button opens a group with what each one does.
 */

export const ABILITIES_BUTTON = "v2_abilities";

type Group = { id: string; emoji: string; title: string; blurb: string; slugs: string[] };

export const ABILITY_GROUPS: Group[] = [
  {
    id: "position",
    emoji: "📍",
    title: "Lineup position",
    blurb: "Stronger in a particular slot of the lineup.",
    slugs: ["vanguard", "last_stand", "anchor", "gambit"],
  },
  {
    id: "momentum",
    emoji: "📈",
    title: "How the match is going",
    blurb: "Stronger after wins, losses or draws earlier in the match.",
    slugs: ["momentum", "avenge", "closer", "grudge", "second_wind", "echo"],
  },
  {
    id: "opponent",
    emoji: "🆚",
    title: "Facing the opponent",
    blurb: "Read the card across the table.",
    slugs: ["underdog", "rival", "giant_slayer", "intimidate", "purist"],
  },
  {
    id: "lineup",
    emoji: "🧩",
    title: "Building your lineup",
    blurb: "Reward the cards you play together.",
    slugs: ["kinship", "trinity", "chorus", "lone_wolf", "synergy", "thrifty", "versatile"],
  },
  {
    id: "defence",
    emoji: "🛡️",
    title: "Types and defence",
    blurb: "Bend the type triangle, or the defending stat.",
    slugs: ["adapt", "guard", "fortress", "bulwark", "pierce", "brace", "feint", "glass_cannon"],
  },
  {
    id: "rounds",
    emoji: "🎯",
    title: "Winning and losing rounds",
    blurb: "Change a close round, or pass something on after it.",
    slugs: ["first_strike", "edge", "rally", "martyr", "parting_shot", "spoiler"],
  },
  {
    id: "tiebreak",
    emoji: "⚖️",
    title: "Tiebreakers",
    blurb: "Count for more when the match is level on rounds.",
    slugs: ["overwhelm", "grit", "relentless", "mercy"],
  },
  {
    id: "copy",
    emoji: "🔇",
    title: "Copy and cancel",
    blurb: "Borrow or switch off the other card's ability.",
    slugs: ["mimic", "silence"],
  },
];

const bySlug = new Map(KEYWORDS.map((keyword) => [keyword.slug, keyword]));

/** A group's abilities, in the group's order, skipping any no longer in the game. */
export const abilitiesIn = (group: Group): Keyword[] =>
  group.slugs.flatMap((slug) => bySlug.get(slug) ?? []);

/**
 * Abilities no group lists - a new one waiting to be sorted. Shown in a group
 * of their own so nothing goes missing from the guide.
 */
export const ungroupedAbilities = (): Keyword[] => {
  const listed = new Set(ABILITY_GROUPS.flatMap((group) => group.slugs));
  return KEYWORDS.filter((keyword) => !listed.has(keyword.slug));
};

const allGroups = (): Group[] => {
  const extra = ungroupedAbilities();
  return extra.length === 0
    ? ABILITY_GROUPS
    : [
        ...ABILITY_GROUPS,
        {
          id: "other",
          emoji: "✨",
          title: "Other",
          blurb: "",
          slugs: extra.map((keyword) => keyword.slug),
        },
      ];
};

const INTRO = [
  "### Abilities",
  "A card can carry one ability. The rarer the card, the less likely it has one - and the less likely it's a strong one.",
  ...(RULES.keywordsEnabled ? [] : ["-# Abilities are switched off in battles for now."]),
];

const overview = (): string =>
  [
    ...INTRO,
    "",
    ...allGroups().map(
      (group) =>
        `${group.emoji} **${group.title}**\n-# ${abilitiesIn(group)
          .map((keyword) => keyword.name)
          .join(" · ")}`,
    ),
  ].join("\n");

const groupPage = (group: Group): string =>
  [
    `### ${group.emoji} ${group.title}`,
    ...(group.blurb ? [`-# ${group.blurb}`] : []),
    "",
    ...abilitiesIn(group).map(
      (keyword) => `**${keyword.name}** · _${GRADE_LABEL[keyword.grade]}_\n${keyword.description}`,
    ),
  ].join("\n");

/** Buttons for every group, and back to the overview; the open one is switched off. */
const navigation = (open: string | null) => {
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`${ABILITIES_BUTTON}:overview`)
      .setLabel("All")
      .setStyle(open === null ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(open === null),
    ...allGroups().map((group) =>
      new ButtonBuilder()
        .setCustomId(`${ABILITIES_BUTTON}:${group.id}`)
        .setEmoji(group.emoji)
        .setLabel(group.title)
        .setStyle(group.id === open ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(group.id === open),
    ),
  ];
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(i, i + 5)));
  }
  return rows;
};

/** The guide, open at a group's page, or at the overview for null or an unknown id. */
export const buildAbilitiesMessage = (groupId: string | null = null) => {
  const group = allGroups().find((candidate) => candidate.id === groupId) ?? null;
  const container = new ContainerBuilder()
    .setAccentColor(NEUTRAL_ACCENT)
    .addTextDisplayComponents((text) => text.setContent(group ? groupPage(group) : overview()))
    .addSeparatorComponents((separator) => separator)
    .addActionRowComponents(...navigation(group?.id ?? null));
  return { components: [container], flags: [MessageFlags.IsComponentsV2] as const };
};
