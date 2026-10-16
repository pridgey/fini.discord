import { ChatInputCommandInteraction } from "discord.js";
import { DUNGEON } from "../../modules/finicards/dungeon";
import { buildRunMessage, payEntryFee } from "../../modules/finicards/dungeonFlow";
import { getActiveRun, startRun } from "../../modules/finicards/dungeonStore";
import { canAfford } from "../../modules/finicards/wagers";
import { replayTutorial } from "../../modules/finicards/dungeonTutorial";
import { buildTutorialMessage } from "../../modules/finicards/ui/dungeonTutorialMessage";
import type { FinicardContext } from "./context";
import { pickDeck } from "./pickDeck";

/** `/finicard dungeon` and `dungeon-tutorial`. */

/** `/finicard dungeon-tutorial` - the free practice run. */
export const showDungeonTutorial = async (
  interaction: ChatInputCommandInteraction,
  _context: FinicardContext,
): Promise<void> => {
  await interaction.editReply(
    await buildTutorialMessage(replayTutorial([]), {
      userId: interaction.user.id,
      playerName: interaction.user.displayName,
    }),
  );
  return;
};

/** `/finicard dungeon` - starts a run, or brings back the one in progress. */
export const enterDungeon = async (
  interaction: ChatInputCommandInteraction,
  { serverId, serverName }: FinicardContext,
): Promise<void> => {
  /* One run at a time. Asking again while one is live brings it back
     rather than charging for another - the fee is already paid, and the
     message it was on may be a long way up the channel. */
  const active = await getActiveRun(interaction.user.id, serverId);

  if (active) {
    await interaction.editReply(await buildRunMessage(active));
    return;
  }

  const deckName = interaction.options.getString("deck");
  const picked = await pickDeck(
    interaction,
    serverId,
    deckName,
    `You have no decks. Build one with \`/finicard deck build name:Main\` - a dungeon run deals ${DUNGEON.handSize} cards from it. New to dungeons? \`/finicard dungeon-tutorial\` is free.`,
  );
  if (!picked) return;
  const { deck } = picked;

  const party = {
    userId: interaction.user.id,
    serverId,
    username: interaction.user.username,
    servername: serverName,
  };

  if (!(await canAfford(party, DUNGEON.entryFee))) {
    await interaction.editReply(
      `A dungeon run costs ${DUNGEON.entryFee} fc and you can't cover that right now.`,
    );
    return;
  }

  const started = await startRun({
    serverId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    playerName: interaction.user.displayName,
    deck,
  });

  if (!started.ok) {
    await interaction.editReply(started.reason);
    return;
  }

  await payEntryFee(party, DUNGEON.entryFee);

  await interaction.editReply(await buildRunMessage(started.run));
  return;
};
