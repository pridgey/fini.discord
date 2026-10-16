import { ButtonInteraction } from "discord.js";
import { decodeMoves, replayTutorial } from "../../modules/finicards/dungeonTutorial";
import {
  TUTORIAL_NAMESPACE,
  buildTutorialMessage,
} from "../../modules/finicards/ui/dungeonTutorialMessage";

export const namespace = TUTORIAL_NAMESPACE;

/**
 * One click in the dungeon tutorial. The id carries every move made so far;
 * this one is added and the tutorial replayed from the start. The message is
 * ephemeral, so the only person who can click it is the one taking the tutorial.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [movesRaw = "", action = ""] = args;

  // Drawing the room and the hand can outlast Discord's three-second window.
  await interaction.deferUpdate();

  const view = replayTutorial([...decodeMoves(movesRaw), action]);
  await interaction.editReply(
    await buildTutorialMessage(view, {
      userId: interaction.user.id,
      playerName: interaction.user.displayName,
    }),
  );
}
