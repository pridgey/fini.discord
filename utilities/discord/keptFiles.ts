/**
 * Files already on a message, to keep through an edit.
 *
 * An edit that uploads nothing new can still lose a message's files: Discord
 * matches a card's `attachment://name` only against files the edit names. And
 * a message laid out in cards (components v2) reports no `attachments` at all -
 * its files are only visible as the media its cards show, with the file's id
 * in the URL: `https://cdn.discordapp.com/attachments/<channel>/<id>/<name>`.
 * So the files are read from there.
 */

export type KeptFile = { id: string; filename: string };

type WithFiles = {
  components: readonly { toJSON(): unknown }[];
  /** Files no card shows - a preload's, say. */
  attachments?: { values(): Iterable<{ id: string; name: string }> };
};

const CDN_FILE = /\/attachments\/\d+\/(\d+)\/([^/?]+)/;

/** Every file on a message - shown by its cards or not - by id and name, once each. */
export const keptFiles = (message: WithFiles): KeptFile[] => {
  const files = new Map<string, KeptFile>();
  for (const attachment of message.attachments?.values() ?? []) {
    files.set(attachment.id, { id: attachment.id, filename: attachment.name });
  }
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const { url } = (value as { media?: { url?: unknown } }).media ?? {};
    const match = typeof url === "string" ? url.match(CDN_FILE) : null;
    if (match) {
      files.set(match[1], {
        id: match[1],
        filename: decodeURIComponent(match[2]),
      });
    }
    Object.values(value).forEach(visit);
  };
  visit(message.components.map((component) => component.toJSON()));
  return [...files.values()];
};
