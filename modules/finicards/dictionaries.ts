import { CardDefinitionRecord } from "../../types/PocketbaseTables";

type CardColor = {
  start: string;
  stop: string;
  pip: string;
};

export const cardColorDictionary: Record<
  CardDefinitionRecord["color"],
  CardColor
> = {
  blue: {
    start: "#002BFF",
    stop: "#010C50",
    pip: "#0379FF",
  },
  yellow: {
    start: "#FFE100",
    stop: "#4D5001",
    pip: "#F7FF03",
  },
  black: {
    start: "#676767",
    stop: "#101010",
    pip: "#4B4B4B",
  },
  purple: {
    start: "#9900FF",
    stop: "#370150",
    pip: "#AF03FF",
  },
  red: {
    start: "#FF0000",
    stop: "#500101",
    pip: "#FF0303",
  },
  green: {
    start: "#0DFF00",
    stop: "#115001",
    pip: "#36FF03",
  },
  light: {
    start: "",
    stop: "",
    pip: "",
  },
  shadow: {
    start: "",
    stop: "",
    pip: "",
  },
};

// The x position of pills
export const pillXDictionary = [0, 35, 112, 189, 266, 343, 420];

// The y position of pills
export const pillYDictionary = {
  c: {
    strength: 521,
    agility: 579,
    endurance: 637,
    intellect: 695,
    luck: 753,
  },
  u: {
    strength: 524,
    agility: 582,
    endurance: 640,
    intellect: 698,
    luck: 756,
  },
};

// Which file template to pull when generating card image
export const cardLayoutDictionary: Record<
  CardDefinitionRecord["rarity"],
  string
> = {
  c: "common-template.svg",
  u: "rare-template.svg",
  fa: "full-art-template.svg",
  l: "",
};

type CardImageSize = {
  width: number;
  height: number;
};

// The image size based on the layout
export const cardImageSizeDictionary: Record<
  CardDefinitionRecord["rarity"],
  CardImageSize
> = {
  c: {
    width: 600,
    height: 374,
  },
  u: {
    width: 860,
    height: 484,
  },
  fa: {
    width: 736,
    height: 1308,
  },
  l: {
    width: 736,
    height: 1308,
  },
};
