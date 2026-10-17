import { AttachmentBuilder, ContainerBuilder, MessageFlags } from "discord.js";
import { DUNGEON_SUMMARY_FILE, renderDungeonSummary } from "../cardArt";
import { coinFor } from "../dungeon";
import { encodeMoves, type TutorialView } from "../dungeonTutorial";
import {
  buildDungeonMessage,
  type BuiltDungeonMessage,
} from "./dungeonMessage";

/** The tutorial's buttons: `v2_dtut:<moves so far>:<this move>`. */
export const TUTORIAL_NAMESPACE = "v2_dtut";

const COACH_ACCENT = 0x7ee0a8;

/**
 * The tutorial as a message: the coach's note on top of an ordinary run
 * message, whose buttons carry the tutorial's moves instead of a run id - and
 * are switched off, all but the move the coach is waiting for.
 */
export const buildTutorialMessage = async (
  view: TutorialView,
  player: { userId: string; playerName: string },
): Promise<BuiltDungeonMessage> => {
  const coach = new ContainerBuilder()
    .setAccentColor(COACH_ACCENT)
    .addTextDisplayComponents((text) => text.setContent(view.coach));

  if (view.stage === "done") {
    const summary = await renderDungeonSummary({
      progress: view.state,
      fell: false,
      coin: coinFor(view.state.geld),
    });
    const files = summary
      ? [new AttachmentBuilder(summary, { name: DUNGEON_SUMMARY_FILE })]
      : [];
    if (summary) {
      coach.addMediaGalleryComponents((gallery) =>
        gallery.addItems((item) =>
          item
            .setURL(`attachment://${DUNGEON_SUMMARY_FILE}`)
            .setDescription("Your practice run"),
        ),
      );
    }
    return { components: [coach], files, flags: [MessageFlags.IsComponentsV2] };
  }

  const moves = encodeMoves(view.moves);
  const run = await buildDungeonMessage({
    runId: "tutorial",
    userId: player.userId,
    playerName: player.playerName,
    state: "active",
    entryFee: 0,
    progress: view.state,
    hand: view.hand,
    controls: {
      id: (action) => `${TUTORIAL_NAMESPACE}:${moves}:${action}`,
      enabled: (action) => view.allowed.has(action),
    },
  });

  return { ...run, components: [coach, ...run.components] };
};
