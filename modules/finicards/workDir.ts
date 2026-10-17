import path from "path";

/**
 * Where the Finicards tools keep their local, unshared files: the card
 * manager's working copies and edit log, the art check's pages, Legendary
 * previews. Gitignored, and large - the card manager's alone runs to gigabytes.
 *
 * Fixed at `scripts/test_images` from the repo root, where the tools have
 * always written, so moving a tool never moves its files.
 */
export const FINICARDS_WORK_DIR = path.resolve(
  import.meta.dir,
  "..",
  "..",
  "scripts",
  "test_images",
);
