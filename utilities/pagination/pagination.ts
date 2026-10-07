import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from "discord.js";
import { PaginationContext } from "../../types/PocketbaseTables";
import { QueryHandler, QueryMap } from "../../queries/QueryHandler";
import { pb } from "../pocketbase";

export interface PaginationParams {
  page?: number;
  perPage?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  perPage: number;
}

export interface PaginationState {
  userId: string;
  currentPage: number;
  totalPages: number;
  namespace: string;
  wrap?: boolean;
}

interface PaginationContextData {
  userId: string;
  queryId: string;
  perPage: number;
  query?: string;
  sort?: string;
  filter?: string;
  totalPagesOverride?: number;
  wrap?: boolean;
}

/**
 * Creates a pagination context in the database
 * Returns the context ID to use in button customIds
 */
export async function createPaginationContext({
  userId,
  queryId,
  perPage,
  query,
  sort,
  filter,
  totalPagesOverride,
  wrap,
}: PaginationContextData): Promise<string> {
  try {
    // Delete all expired contexts before creating a new one
    await deleteExpiredPaginationContexts();

    // Create new context
    const created = await pb
      .collection<PaginationContext>("pagination_context")
      .create({
        user_id: userId,
        query_id: queryId,
        query,
        sort,
        filter,
        per_page: perPage,
        current_page: 1,
        total_pages_override: totalPagesOverride,
        wrap,
      });
    return created.id!;
  } catch (error) {
    console.error("Error saving pagination context:", error);
    throw error;
  }
}

/**
 * Deletes pagination contexts that have not been updated in the last 15 minutes
 */
export async function deleteExpiredPaginationContexts(): Promise<void> {
  try {
    const expirationTime = new Date(Date.now() - 15 * 60 * 1000)
      .toISOString()
      .replace("T", " "); // 15 minutes ago

    const expiredContexts = await pb
      .collection<PaginationContext>("pagination_context")
      .getList(1, 100, {
        filter: `updated < "${expirationTime}"`,
        requestKey: "get-expired-contexts",
      });

    for (const context of expiredContexts.items) {
      await pb
        .collection<PaginationContext>("pagination_context")
        .delete(context.id!, { requestKey: `delete-context-${context.id}` });
    }
  } catch (error) {
    console.error("Error deleting expired pagination contexts:", error);
  }
}

/**
 * Retrieves pagination context from the database
 */
export async function getPaginationContext(
  contextId: string,
): Promise<PaginationContext | null> {
  try {
    const context = await pb
      .collection<PaginationContext>("pagination_context")
      .getOne(contextId, { requestKey: `get-context-${contextId}` });

    return context;
  } catch (error) {
    console.error("Error getting pagination context:", error);
    return null;
  }
}

/**
 * Updates the current page in a pagination context
 */
export async function updatePaginationPage(
  contextId: string,
  newPage: number,
): Promise<void> {
  try {
    await pb
      .collection<PaginationContext>("pagination_context")
      .update(contextId, {
        current_page: newPage,
      });
  } catch (error) {
    console.error("Error updating pagination page:", error);
    throw error;
  }
}

/**
 * Creates pagination buttons with just the context ID
 */
export function createPaginationRow(
  // omit namespace because it's pagination - namespace will just be "prev_page" or "next_page"
  context: Omit<PaginationState, "namespace"> & { contextId: string },
): ActionRowBuilder<ButtonBuilder> {
  const { userId, currentPage, totalPages, contextId, wrap } = context;

  // Super simple customId - just namespace, contextId, and userId
  const prevButton = new ButtonBuilder()
    .setCustomId(`prev_page:${contextId}:${userId}`)
    .setLabel("◀ Previous")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage === 1 && !wrap);

  const pageIndicator = new ButtonBuilder()
    .setCustomId("page_indicator")
    .setLabel(`Page ${currentPage}/${totalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const nextButton = new ButtonBuilder()
    .setCustomId(`next_page:${contextId}:${userId}`)
    .setLabel("Next ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage >= totalPages && !wrap);

  const row = new ActionRowBuilder<ButtonBuilder>();
  row.setComponents([prevButton, pageIndicator, nextButton]);

  return row;
}

/**
 * Parses pagination state from button args
 */
export function parsePaginationState(args: string[]): {
  contextId: string;
  userId: string;
} {
  const [contextId, userId] = args;
  return { contextId, userId };
}

/** A message payload ready to hand to `interaction.update()`. */
export type PaginationPage = {
  components: (ContainerBuilder | TextDisplayBuilder | ActionRowBuilder<ButtonBuilder>)[];
  files: AttachmentBuilder[];
  /** Always empty: see the note in {@link renderPaginationPage}. */
  attachments: never[];
  flags?: [MessageFlags.IsComponentsV2];
};

/**
 * Renders one page of a paginated result, ready to replace the message with.
 *
 * This is the whole body of the `next_page` and `prev_page` buttons, minus the
 * decision of *which* page - they each worked it out and then ran an identical
 * forty lines. Pulling it out is what lets a third caller (the finicards v2
 * "back to collection" button) return to the page a player left without
 * duplicating it again, and it removes a real divergence: `prev_page` never
 * passed `wrap` through to {@link createPaginationRow}, so on a wrapping
 * context the Previous button stayed disabled on page 1.
 *
 * `attachments: []` is deliberate and load-bearing. A page may carry a file
 * (v1 `/card-collection` renders one card image per page) while the next page
 * carries none, and an edit that doesn't clear the attachment list leaves the
 * previous page's image stuck under the new content.
 *
 * @param contextId The pagination context to read the query back out of
 * @param page The page to render; the stored current page is updated to match
 * @param buildRow Injectable for tests, which cannot rely on the real
 *   `createPaginationRow` being in place - `mock.module` is process-global in
 *   Bun and another suite stubs this module out. Defaults to the real one.
 * @returns The payload, or null if the context has expired
 */
export async function renderPaginationPage({
  contextId,
  page,
  buildRow = createPaginationRow,
}: {
  contextId: string;
  page: number;
  buildRow?: typeof createPaginationRow;
}): Promise<PaginationPage | null> {
  const context = await getPaginationContext(contextId);

  if (!context) return null;

  const query = QueryHandler(context.query_id as keyof QueryMap);

  const result = await query.query({
    queryString: context.query,
    page,
    perPage: context.per_page,
    filterOption: context.filter,
    sortOption: context.sort,
  });

  await updatePaginationPage(contextId, page);

  const {
    components: resultComponents,
    files,
    useComponentsV2,
  } = await query.buildResults({
    items: result.items,
    userId: context.user_id,
    queryString: context.query,
    sortOption: context.sort,
    contextId,
  });

  const pageRow = buildRow({
    userId: context.user_id,
    currentPage: result.currentPage,
    totalPages: context.total_pages_override || result.totalPages,
    contextId,
    wrap: context.wrap,
  });

  return {
    components: [...(resultComponents ?? []), pageRow],
    files: files ?? [],
    attachments: [],
    ...(useComponentsV2 && {
      flags: [MessageFlags.IsComponentsV2] as [MessageFlags.IsComponentsV2],
    }),
  };
}

/**
 * Works out the page a step lands on, wrapping when the context allows it.
 *
 * Without `wrap` the buttons at the ends are disabled, so this mostly clamps
 * defensively - a stale message can still deliver a click after the result set
 * has shrunk.
 *
 * `totalPages` comes from the context's `total_pages_override`, which is the
 * only page count known *before* running the query. A wrapping context must
 * therefore set it: without a total there is nothing to wrap backwards onto, so
 * a wrap request degrades to a clamp rather than guessing.
 * @param current The page currently displayed
 * @param step +1 for next, -1 for previous
 * @param options The known page count, if any, and whether the ends join up
 * @returns The page to render
 */
export function stepPage(
  current: number,
  step: number,
  options: { totalPages?: number; wrap?: boolean } = {},
): number {
  const { totalPages, wrap } = options;
  const target = current + step;

  if (target < 1) return wrap && totalPages ? totalPages : 1;
  if (totalPages && target > totalPages) return wrap ? 1 : totalPages;

  return target;
}
