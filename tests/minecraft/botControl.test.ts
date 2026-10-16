import { describe, expect, it } from "bun:test";
import { parseVec3, parseYaw } from "../../modules/minecraft/botControl";

// Both strings are verbatim RCON responses from this server
const POS = "[0] FINI has the following entity data: [200.5d, 82.0d, 200.5d]";
const ROTATION = "[0] FINI has the following entity data: [-90.0f, 0.0f]";

describe("parseVec3", () => {
  it("reads a position response", () => {
    expect(parseVec3(POS)).toEqual({ x: 200.5, y: 82.0, z: 200.5 });
  });

  // Positions go negative on three axes and the regex has to survive it
  it("reads negative coordinates", () => {
    expect(
      parseVec3(
        "[0] FINI has the following entity data: [-183.3d, -64.0d, -215.7d]",
      ),
    ).toEqual({ x: -183.3, y: -64.0, z: -215.7 });
  });

  it("returns null when the entity is gone", () => {
    expect(parseVec3("No entity was found")).toBeNull();
  });

  // A rotation response must not be mistaken for a position
  it("does not match a rotation response", () => {
    expect(parseVec3(ROTATION)).toBeNull();
  });
});

describe("parseYaw", () => {
  it("reads the yaw from a rotation response", () => {
    expect(parseYaw(ROTATION)).toBe(-90);
  });

  it("reads a positive yaw", () => {
    expect(
      parseYaw("[0] FINI has the following entity data: [180.0f, 0.0f]"),
    ).toBe(180);
  });

  it("returns null when the entity is gone", () => {
    expect(parseYaw("No entity was found")).toBeNull();
  });

  it("does not match a position response", () => {
    expect(parseYaw(POS)).toBeNull();
  });
});
