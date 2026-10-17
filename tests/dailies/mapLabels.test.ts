import { describe, expect, it } from "bun:test";
import { placeLabels, type LabelSpot } from "../../modules/dailies/geo/map";

const overlaps = (a: LabelSpot["box"], b: LabelSpot["box"]) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe("placing names on the guess map", () => {
  it("keeps names apart when pins are bunched together", () => {
    const points = Array.from({ length: 6 }, (_, i) => ({
      x: 400 + i * 4,
      y: 240 + i * 3,
    }));
    const names = [
      "Here",
      "IcarusFountain",
      "AyaHimura",
      "JazzyEngineer",
      "graham1",
      "Pridgey",
    ];

    const spots = placeLabels(points, names, 800, 480).map((spot) => spot!);

    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(overlaps(spots[i].box, spots[j].box)).toBe(false);
      }
    }
  });

  it("puts the first pin's name straight above it when there's room", () => {
    const [here] = placeLabels([{ x: 400, y: 240 }], ["Here"], 800, 480);
    expect(here!.anchor).toBe("middle");
    expect(here!.box.bottom).toBeLessThan(240 - 40);
    expect(here!.leader).toBeUndefined();
  });

  it("keeps a name on the map when its pin is at the edge", () => {
    const [top] = placeLabels([{ x: 30, y: 45 }], ["IcarusFountain"], 800, 480);
    expect(top!.box.left).toBeGreaterThanOrEqual(2);
    expect(top!.box.top).toBeGreaterThanOrEqual(2);
  });

  it("skips pins without a name", () => {
    expect(placeLabels([{ x: 10, y: 10 }], [undefined], 800, 480)).toEqual([
      null,
    ]);
  });
});
