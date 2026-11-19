import type { ButtonHandler } from "../../types/handlers";
import type { ButtonInteraction } from "discord.js";
import { handleMahjongButton } from "../../modules/games/mahjong/table";
import { MAHJONG_BUTTON } from "../../modules/games/mahjong/views";

export const namespace = MAHJONG_BUTTON;

/**
 * Every mahjong button: the lobby's, the table's, and the private hand
 * view's. Ids are `mahjong:<table>:<action>:<step>:<arg>`.
 */
export const execute: ButtonHandler["execute"] = async (
  interaction: ButtonInteraction,
  args: string[],
) => handleMahjongButton(interaction, args);
