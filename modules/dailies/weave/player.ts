import type { GuildMember, Interaction } from "discord.js";
import type { WeavePlayer } from "./daily";

/** Who is playing, from any interaction in a server: for the bank and for what's shown. */
export const weavePlayerOf = (
  interaction: Interaction,
  member: GuildMember | null,
): WeavePlayer => ({
  serverId: interaction.guildId ?? "",
  serverName: interaction.guild?.name ?? "unknown guild name",
  userId: interaction.user.id,
  username: interaction.user.username,
  displayName: member?.displayName ?? interaction.user.displayName,
});
