/**
 * Finicards v2 - the battle-first card game described in `docs/Finicards-v2.md`.
 *
 * This module is completely independent of `modules/finicards`: separate
 * Pocketbase collections (`v2_*`), separate types, separate commands. Both can
 * run at the same time, and the switchover is a matter of retiring the v1
 * commands once v2 feels right.
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
