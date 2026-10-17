import { describe, expect, it } from "bun:test";
import {
  isButtonHandler,
  isModalHandler,
  isSlashCommand,
} from "../../types/handlers";

const run = async () => undefined;
const data = {
  name: "ping",
  toJSON: () => ({ name: "ping", description: "" }),
};

describe("handler shape checks", () => {
  it("accepts a slash command, with or without autocomplete", () => {
    expect(isSlashCommand({ data, execute: run })).toBe(true);
    expect(isSlashCommand({ data, execute: run, autocomplete: run })).toBe(
      true,
    );
  });

  it("rejects a command missing its data, its execute, or with a broken autocomplete", () => {
    expect(isSlashCommand({ execute: run })).toBe(false);
    expect(isSlashCommand({ data })).toBe(false);
    expect(isSlashCommand({ data: { name: "ping" }, execute: run })).toBe(
      false,
    );
    expect(isSlashCommand({ data, execute: run, autocomplete: "yes" })).toBe(
      false,
    );
    expect(isSlashCommand(null)).toBe(false);
  });

  it("needs a namespace and an execute for buttons and forms", () => {
    expect(isButtonHandler({ namespace: "v2_card_view", execute: run })).toBe(
      true,
    );
    expect(isModalHandler({ namespace: "weave_words", execute: run })).toBe(
      true,
    );
    expect(isButtonHandler({ namespace: "", execute: run })).toBe(false);
    expect(isButtonHandler({ execute: run })).toBe(false);
    expect(isModalHandler({ namespace: "x" })).toBe(false);
  });
});
