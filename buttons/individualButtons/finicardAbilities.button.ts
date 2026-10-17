import type { ButtonHandler } from "../../types/handlers";
import { ButtonInteraction } from "discord.js";
import {
  ABILITIES_BUTTON,
  buildAbilitiesMessage,
} from "../../modules/finicards/ui/abilitiesMessage";

export const namespace = ABILITIES_BUTTON;

/** Moves `/finicard abilities` between its overview and a group's page. */
export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [group] = args;
  const { components } = buildAbilitiesMessage(
    group === "overview" ? null : group,
  );
  await interaction.update({ components });
};
