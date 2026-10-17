import { ButtonInteraction } from "discord.js";
import {
  ABILITIES_BUTTON,
  buildAbilitiesMessage,
} from "../../modules/finicards/ui/abilitiesMessage";

export const namespace = ABILITIES_BUTTON;

/** Moves `/finicard abilities` between its overview and a group's page. */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [group] = args;
  const { components } = buildAbilitiesMessage(
    group === "overview" ? null : group,
  );
  await interaction.update({ components });
}
