/**
 * Finicards v2 - the battle-first card game described in `docs/Finicards-v2.md`.
 *
 * It replaced the first card game, whose code is gone: separate Pocketbase
 * collections (`v2_*`), separate types, separate commands. Only the v1 card
 * definitions remain, read by `convertLegacyCards`.
 *
 * Layering, innermost first:
 *   rules / keywords / statBudget   - data and pure maths, no I/O
 *   battleEngine                    - pure match resolution
 *   convertLegacyCards              - pure v1 -> v2 mapping
 *   cardStore / battleStore / packs - Pocketbase boundary
 *   renderBattle                    - Discord presentation
 */

export * from "./battleEngine";
export * from "./cardArt";
export * from "./battleStore";
export * from "./lineupPicker";
export * from "./draw";
export * from "./dungeon";
export * from "./dungeonFlow";
export * from "./dungeonStore";
export * from "./decks";
export * from "./battleFlow";
export * from "./cardStore";
export * from "./expireBattles";
export * from "./convertLegacyCards";
export * from "./keywords";
export * from "./packs";
export * from "./renderBattle";
export * from "./rules";
export * from "./statBudget";
export * from "./types";
export * from "./ui";
