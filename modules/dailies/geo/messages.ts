import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { GeocodedGuess, PlaceInfo } from "./geocode";
import { judgeGuess, MAX_PAY, PAY, photoMultiplier, type Check, type Verdict } from "./judge";
import { renderMap } from "./map";
import { formatDistance, type LatLon } from "./score";

/**
 * The screens of the location game, shared by the daily and the `/geo-test`
 * prototype. Each takes the custom ids its buttons should carry, so the two
 * route their clicks to their own handlers.
 */

/** What a screen needs to know about a round. */
export type RoundFacts = {
  answer: LatLon;
  photoCount: number;
  credit: string;
  source: string;
  license: string;
};

export const button = (customId: string, label: string, style: ButtonStyle, emoji?: string) => {
  const built = new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
  return emoji ? built.setEmoji(emoji) : built;
};

export const row = (...buttons: ButtonBuilder[]) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);

/** The box a guess is typed into. */
export const guessModal = (customId: string) =>
  new ModalBuilder()
    .setCustomId(customId)
    .setTitle("Where was this taken?")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("A place, or coordinates")
        .setDescription("A country, a city, a street, a landmark - or paste lat, lon from a map.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("place")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g. Lyon, France  or  45.7640, 4.8357")
            .setRequired(true)
            .setMaxLength(200),
        ),
    );

export const photoFiles = (photos: Buffer[]) =>
  photos.map((photo, i) => new AttachmentBuilder(photo, { name: `view-${i + 1}.jpg` }));

/** "📸 Only 2 photos ×1.5", when a round pays extra for having fewer. */
const photoLine = (photoCount: number): string | null => {
  const multiplier = photoMultiplier(photoCount);
  if (multiplier === 1) return null;
  return `📸 Only ${photoCount === 1 ? "1 photo" : `${photoCount} photos`} **×${multiplier}**`;
};

/** The most a round with this many photos pays. */
export const maxPayFor = (photoCount: number) => Math.round(MAX_PAY * photoMultiplier(photoCount));

/** The lines that open a round: the question, the prize, and how it's paid. */
export const roundIntro = (photoCount: number): string[] => {
  const multiplier = photoMultiplier(photoCount);
  return [
    "🌍 **Where in the world is this?**",
    [`🪙 **${maxPayFor(photoCount)} fc** up for grabs`, photoLine(photoCount)].filter(Boolean).join(" · "),
    `-# ${PAY.northSouth} per hemisphere · ${PAY.continent} continent · ${PAY.country} country · ${PAY.province} province · ${PAY.city} town · up to ${PAY.closeness} for landing close${multiplier > 1 ? `, all ×${multiplier}` : ""}`,
  ];
};

/** Where the bot understood the guess to be, to lock in or redo. */
export const guessView = async (guess: GeocodedGuess, ids: { lock: string; retry: string }) => ({
  content: `📍 **${guess.label}**\nIs this where you meant? Locking in is final.`,
  files: [
    new AttachmentBuilder(await renderMap([{ lat: guess.lat, lon: guess.lon, color: "#3b82f6" }]), {
      name: "guess.png",
    }),
  ],
  components: [
    row(
      button(ids.lock, "Lock in", ButtonStyle.Success, "✅"),
      button(ids.retry, "Try again", ButtonStyle.Secondary, "↩️"),
    ),
  ],
});

export type Scored = { verdict: Verdict; multiplier: number; total: number };

/** What a guess earns: the checks, the bonus, and the photo multiplier. */
export const scoreGuess = (facts: RoundFacts, place: PlaceInfo, guess: GeocodedGuess): Scored => {
  const verdict = judgeGuess(guess, { ...facts.answer, place });
  const multiplier = photoMultiplier(facts.photoCount);
  return { verdict, multiplier, total: Math.round(verdict.total * multiplier) };
};

const MARK: Record<Check["outcome"], string> = { earned: "✅", missed: "❌", locked: "🔒" };

const checkLine = (check: Check) =>
  check.outcome === "earned"
    ? `✅ ${check.label} **+${check.fc}**`
    : `${MARK[check.outcome]} ${check.label}${check.note ? ` · _${check.note}_` : ""}`;

/** Where it was, in words: "Lyon, Auvergne-Rhône-Alpes, France". */
export const placeName = (place: PlaceInfo) =>
  [place.city, place.province, place.country].filter(Boolean).join(", ");

export const creditLine = (facts: RoundFacts) =>
  `-# Photos by ${facts.credit} via ${facts.source}, ${facts.license}. Places and map © OpenStreetMap contributors.`;

/** The answer beside the guess, each check, and what it paid. */
export const revealView = async (
  facts: RoundFacts,
  place: PlaceInfo,
  guess: GeocodedGuess,
  scored: Scored,
  { paid }: { paid: boolean },
) => {
  const { verdict, total } = scored;
  const map = await renderMap([
    { lat: guess.lat, lon: guess.lon, color: "#3b82f6", label: "You" },
    { ...facts.answer, color: "#ef4444", label: "Here" },
  ]);
  return {
    content: [
      `📏 **${formatDistance(verdict.km)}** away · 🪙 ${paid ? "you won" : "would pay"} **${total} fc** of ${maxPayFor(facts.photoCount)}`,
      "",
      ...verdict.checks.map(checkLine),
      verdict.bonus > 0 ? `🎯 Landing close **+${verdict.bonus}**` : null,
      verdict.total > 0 ? photoLine(facts.photoCount) : null,
      "",
      `It was taken in **${placeName(place)}**. You guessed ${guess.label}.`,
      creditLine(facts),
    ]
      .filter((line) => line !== null)
      .join("\n"),
    files: [new AttachmentBuilder(map, { name: "reveal.png" })],
  };
};
