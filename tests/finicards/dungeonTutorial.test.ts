import { describe, expect, it } from "bun:test";
import {
  decodeMoves,
  encodeMoves,
  replayTutorial,
  type TutorialStage,
  type TutorialView,
} from "../../modules/finicards/dungeonTutorial";
import { buildTutorialMessage } from "../../modules/finicards/ui/dungeonTutorialMessage";

/** Every finished tutorial a player could reach, walking every allowed move. */
const everyPath = (): { moves: string[]; seen: TutorialView[] }[] => {
  const finished: { moves: string[]; seen: TutorialView[] }[] = [];
  const walk = (moves: string[], seen: TutorialView[]) => {
    const view = replayTutorial(moves);
    expect(view.moves).toEqual(moves);
    if (view.stage === "done") {
      finished.push({ moves, seen: [...seen, view] });
      return;
    }
    expect(view.allowed.size).toBeGreaterThan(0);
    for (const move of view.allowed) walk([...moves, move], [...seen, view]);
  };
  walk([], []);
  return finished;
};

const HAPPY = [
  "c0",
  "d0",
  "c2",
  "d0",
  "b2",
  "leave",
  "d0",
  "c1",
  "d0",
  "c3",
  "retreat",
];

describe("the dungeon tutorial", () => {
  const paths = everyPath();

  it("graduates down every path the coach allows", () => {
    expect(paths.length).toBeGreaterThan(50);
    const order: TutorialStage[] = [
      "wheel",
      "doors",
      "event",
      "after-event",
      "shop",
      "to-raccoons",
      "raccoons",
      "to-boss",
      "boss",
      "walk-out",
      "done",
    ];
    for (const { seen } of paths) {
      // A shop with purchases shows itself more than once; nothing else repeats.
      expect([...new Set(seen.map((view) => view.stage))]).toEqual(order);
    }
  });

  it("wins the first fight and the boss, and loses to the raccoons, every time", () => {
    for (const { seen } of paths) {
      const after = (stage: TutorialStage) =>
        seen.find((view) => view.stage === stage)!.state;
      expect(after("doors").path[0].result).toBe("won");
      expect(after("to-boss").path.at(-1)?.result).toBe("warded");
      expect(after("walk-out").path.at(-1)?.result).toBe("won");
      expect(after("walk-out").bossesWon).toBe(1);
    }
  });

  it("teaches Last Stand in the third slot, with Crouton always ready for it", () => {
    for (const { seen } of paths) {
      const boss = seen.find((view) => view.stage === "boss")!;
      expect(boss.allowed.has("c3")).toBe(true);
      expect(boss.coach).toContain("slot 3 of 3");
    }
  });

  it("leaves one door after a lost event, and two after a won one", () => {
    expect(replayTutorial(["c0", "d0", "c1"]).state.doors).toHaveLength(1);
    expect(replayTutorial(["c0", "d0", "c2"]).state.doors).toHaveLength(2);
    expect(replayTutorial(["c0", "d0", "c1"]).coach).toContain("Bread Crimes");
  });

  it("drops moves the coach was not waiting for", () => {
    // Brick Brickman is Power and the squirrel is Wit, so only Power is allowed.
    expect(replayTutorial(["c1"]).moves).toEqual([]);
    expect(replayTutorial(["d1", "retreat", "c0"]).moves).toEqual(["c0"]);
    expect(replayTutorial(["c0", "d1"]).stage).toBe("doors");
  });

  it("carries its moves in a short id and reads them back", () => {
    expect(encodeMoves(HAPPY)).toBe("c0d0c2d0b2ld0c1d0c3r");
    expect(decodeMoves(encodeMoves(HAPPY))).toEqual(HAPPY);
    expect(decodeMoves("")).toEqual([]);
  });

  it("builds buttons with only the taught move switched on, all within Discord's id limit", async () => {
    const view = replayTutorial(HAPPY.slice(0, 9));
    expect(view.stage).toBe("boss");
    const message = await buildTutorialMessage(view, {
      userId: "1",
      playerName: "Tester",
    });
    const tree = message.components.map((component) => component.toJSON());
    const json = JSON.stringify(tree);

    const buttons: { id: string; disabled: boolean }[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (typeof record.custom_id === "string") {
        buttons.push({
          id: record.custom_id,
          disabled: record.disabled === true,
        });
      }
      Object.values(record).forEach(walk);
    };
    walk(tree);
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons)
      expect(button.id.length).toBeLessThanOrEqual(100);

    const enabled = buttons
      .filter((button) => !button.disabled)
      .map((button) => button.id.split(":")[2]);
    expect(new Set(enabled)).toEqual(view.allowed);
    expect(json).toContain("Last Stand");
  });

  it("ends with a graduation and the run's summary", async () => {
    const view = replayTutorial(HAPPY);
    expect(view.stage).toBe("done");
    const message = await buildTutorialMessage(view, {
      userId: "1",
      playerName: "Tester",
    });
    expect(
      JSON.stringify(message.components.map((component) => component.toJSON())),
    ).toContain("graduated");
    expect(message.files).toHaveLength(1);
  });
});
