import { Attachment } from "discord.js";
import { ChatModel } from "../../types/PocketbaseTables";
import { ReplyContext } from "./formatReplyContext";

export type AIConverseOptions = {
  skipSave?: boolean;
  skipHistory?: boolean;
  skipPersonality?: boolean;
  /**
   * Forces a specific backend instead of honouring the user's /chat-config
   * choice. Used by the one-shot generation commands, which are tuned around
   * a particular model and shouldn't silently change quality when someone
   * flips their chat preference.
   */
  model?: ChatModel;
};

export type AIConverseProps = {
  userID: string;
  message: string;
  server: string;
  attachment?: Attachment;
  /** The message the user replied to, if they replied to one. */
  reply?: ReplyContext;
  options?: AIConverseOptions;
};
