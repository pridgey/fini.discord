import type { SelectHandler } from "../../types/handlers";
import {
  GuildMember,
  MessageFlags,
  StringSelectMenuInteraction,
} from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { GIST_BUTTON } from "../../modules/dailies/gist/board";
import {
  GIST_LIVE,
  callGistLetter,
  playableGist,
} from "../../modules/dailies/gist/daily";
import { weavePlayerOf } from "../../modules/dailies/weave/player";
import { dailyPlayed } from "../../modules/dailies/post";

/** Shares the buttons' namespace: one id scheme, `gist:<round>:<action>`. */
export const namespace = GIST_BUTTON;

/** A letter picked from the board's "Call a consonant" or "Buy a vowel" dropdown. */
export const execute: SelectHandler["execute"] = async (
  interaction: StringSelectMenuInteraction,
  args: string[],
) => {
  const [roundId] = args;
  if (
    !GIST_LIVE &&
    !(await requireAdmin(interaction, "play Gist while it's on trial"))
  )
    return;
  const playable = await playableGist(roundId);
  if ("refusal" in playable || !interaction.guildId) {
    await interaction.reply({
      content:
        "refusal" in playable
          ? playable.refusal
          : "Gist is played in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Drawing the new board can outlast Discord's three seconds.
  await interaction.deferUpdate();
  const player = weavePlayerOf(
    interaction,
    interaction.member as GuildMember | null,
  );
  const { board } = await callGistLetter(
    playable.round,
    player,
    interaction.values[0] ?? "",
  );
  dailyPlayed(interaction.client, interaction.guildId);
  await interaction.editReply({ ...board, attachments: [] });
};
