import { ContainerBuilder, MessageFlags } from "discord.js";
import { DRAW_ACCENT } from "./theme";

/**
 * A one-line message in a container.
 *
 * Needed because a message created with `IsComponentsV2` cannot carry a plain
 * `content` field, and cannot be converted back. Anything that edits a
 * Components V2 message - including every error path on the lineup picker - has
 * to reply in kind, so those paths go through here rather than each inventing
 * their own container.
 */
export type NoticeMessage = {
  components: ContainerBuilder[];
  flags: [MessageFlags.IsComponentsV2];
};

export const notice = (
  text: string,
  accent: number = DRAW_ACCENT,
): NoticeMessage => ({
  components: [
    new ContainerBuilder()
      .setAccentColor(accent)
      .addTextDisplayComponents((display) => display.setContent(text)),
  ],
  flags: [MessageFlags.IsComponentsV2],
});
