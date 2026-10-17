import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";

/**
 * The shapes of the files Fini loads by folder: slash commands in
 * `commands/*.command.ts`, buttons in `buttons/individualButtons/*.button.ts`,
 * forms in `modals/individualModals/*.modal.ts`.
 *
 * Each file types its `execute` with these, so a wrong signature fails to
 * compile; the loaders check each file's exports with the guards below, so a
 * missing one is reported at startup, not when someone presses the button.
 */

/** Records the command in the log table. Called once the reply exists to be read back. */
export type LogCommand = () => void | Promise<void>;

export type SlashCommand = {
  data: {
    name: string;
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
  };
  execute(
    interaction: ChatInputCommandInteraction,
    logCommand: LogCommand,
  ): Promise<unknown>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<unknown>;
};

/**
 * A button, found by its custom id's first part, `namespace`. The rest of the
 * id, split on ":", arrives as `args`.
 */
export type ButtonHandler = {
  namespace: string;
  execute(interaction: ButtonInteraction, args: string[]): Promise<unknown>;
};

/** A submitted form, routed the same way as a button. */
export type ModalHandler = {
  namespace: string;
  execute(
    interaction: ModalSubmitInteraction,
    args: string[],
  ): Promise<unknown>;
};

const isFunction = (value: unknown) => typeof value === "function";

export const isSlashCommand = (file: unknown): file is SlashCommand => {
  const { data, execute, autocomplete } = (file ?? {}) as Partial<
    Record<string, unknown>
  >;
  const { name, toJSON } = (data ?? {}) as Partial<Record<string, unknown>>;
  return (
    typeof name === "string" &&
    isFunction(toJSON) &&
    isFunction(execute) &&
    (autocomplete === undefined || isFunction(autocomplete))
  );
};

const isRouted = (file: unknown): file is ButtonHandler | ModalHandler => {
  const { namespace, execute } = (file ?? {}) as Partial<
    Record<string, unknown>
  >;
  return (
    typeof namespace === "string" && namespace.length > 0 && isFunction(execute)
  );
};

export const isButtonHandler = (file: unknown): file is ButtonHandler =>
  isRouted(file);
export const isModalHandler = (file: unknown): file is ModalHandler =>
  isRouted(file);
