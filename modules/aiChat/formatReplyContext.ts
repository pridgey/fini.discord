/**
 * A discord message the user replied to while talking to the bot, reduced to
 * just what the model needs to know about it.
 */
export type ReplyContext = {
  /** The replied-to message's text. */
  text: string;
  /** Display name of whoever wrote it, preferring their server nickname. */
  authorName: string;
  /** True when the user quoting the message also wrote it. */
  authorIsUser: boolean;
  /** True when the bot itself wrote it. */
  authorIsSelf: boolean;
  /** True for any bot, including this one. */
  authorIsBot: boolean;
};

/**
 * Describes *who* wrote the quoted message.
 *
 * Attribution matters more than it looks: "fix this" pointed at your own
 * message is a request to revise it, the same words pointed at someone else's
 * are a request to comment on it, and pointed at the bot's own message it's a
 * correction. Without a name the model can only guess, and it usually guessed
 * that everything was the user talking to themselves.
 */
const describeAuthor = (reply: ReplyContext): string => {
  if (reply.authorIsSelf) {
    return "one of your own earlier messages";
  }

  if (reply.authorIsUser) {
    return "one of their own earlier messages";
  }

  if (reply.authorIsBot) {
    return `a message written by another bot, ${reply.authorName}`;
  }

  return `a message written by a different user, ${reply.authorName}`;
};

/**
 * Builds the sentence prepended to the user's prompt when they've replied to
 * something. Shared by every backend so the phrasing - and therefore the
 * stored chat history - doesn't drift between models.
 * @param reply The quoted message, or undefined if the user didn't reply to one
 * @returns The context sentence, or "" when there's nothing to quote
 */
export const formatReplyContext = (reply?: ReplyContext): string => {
  if (!reply?.text.length) return "";

  return `The user has included ${describeAuthor(
    reply,
  )} as context for this conversation:\n"""\n${reply.text}\n"""\n`;
};
