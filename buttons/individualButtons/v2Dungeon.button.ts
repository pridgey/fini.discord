import { ButtonInteraction, MessageFlags } from "discord.js";
import {
  buildRunMessage,
  settleRun,
} from "../../modules/finicardsV2/dungeonFlow";
import {
  act,
  getRun,
  type DungeonAction,
} from "../../modules/finicardsV2/dungeonStore";

export const namespace = "v2_dungeon";

/* Runs with a click being handled right now. A click reads the run, resolves a
   move and writes it back across several awaits, so two clicks arriving
   together would both see the same step - and on a walk-out, both be paid. */
const inFlight = new Set<string>();

/** `c2` plays hand card 2, `d0` takes door 0, `b1` buys shelf item 1. */
const parseAction = (raw: string): DungeonAction | null => {
  if (raw === "retreat" || raw === "leave") return { kind: raw };

  const index = Number.parseInt(raw.slice(1), 10);
  if (!Number.isInteger(index) || index < 0) return null;

  switch (raw[0]) {
    case "c":
      return { kind: "card", handIndex: index };
    case "d":
      return { kind: "door", index };
    case "b":
      return { kind: "buy", index };
    default:
      return null;
  }
};

/**
 * One click on a dungeon run: a card played, a door taken, something bought,
 * or a walk out.
 *
 * The run's message is public and edited in place, so anyone can see the
 * buttons - only the run's owner can press them.
 */
export async function execute(interaction: ButtonInteraction, args: string[]) {
  const [runId, stepRaw, actionRaw] = args;

  const refuse = (content: string) =>
    interaction.reply({ content, flags: [MessageFlags.Ephemeral] });

  const run = await getRun(runId);

  if (!run) {
    await refuse("❌ That run no longer exists.");
    return;
  }
  if (run.user_id !== interaction.user.id) {
    await refuse(
      "❌ This isn't your run. Start your own with `/finicard-v2 dungeon`.",
    );
    return;
  }
  if (inFlight.has(runId)) {
    await refuse("Still resolving your last click.");
    return;
  }

  inFlight.add(runId);

  try {
    // Rendering the next view can outlast Discord's three-second window.
    await interaction.deferUpdate();

    const action = parseAction(actionRaw ?? "");
    const outcome = action
      ? await act(
          runId,
          interaction.user.id,
          Number.parseInt(stepRaw, 10),
          action,
        )
      : ({ ok: false, reason: "That button isn't one I recognise." } as const);

    if (!outcome.ok) {
      await interaction.followUp({
        content: `❌ ${outcome.reason}`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    let current = outcome.run;

    if (current.state !== "active") {
      const reward = await settleRun(current, {
        userId: current.user_id,
        serverId: current.server_id,
        username: interaction.user.username,
        servername: interaction.guild?.name ?? "unknown guild name",
      });
      current = { ...current, reward };
    }

    await interaction.editReply(await buildRunMessage(current));
  } finally {
    inFlight.delete(runId);
  }
}
