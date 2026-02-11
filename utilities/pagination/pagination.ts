import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { PaginationContext } from "../../types/PocketbaseTables";
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
}

/**
 * Creates or updates a pagination context in the database
 * Returns the context ID to use in button customIds
 */
export async function savePaginationContext(
  userId: string,
  contextType: string,
  query?: string,
  sort?: string,
  filters?: Record<string, any>,
): Promise<string> {
  try {
    // Delete all expired contexts before creating a new one
    await deleteExpiredPaginationContexts();

    // Try to find existing context for this user and type
    const existing = await pb
      .collection<PaginationContext>("pagination_context")
      .getFirstListItem(
        `user_id = "${userId}" && context_type = "${contextType}"`,
        { requestKey: `find-context-${userId}-${contextType}` },
      )
      .catch(() => null);

    if (existing) {
      // Update existing context
      const updated = await pb
        .collection<PaginationContext>("pagination_context")
        .update(existing.id!, {
          query,
          sort,
          filters,
          current_page: 1, // Reset to page 1
        });
      return updated.id!;
    } else {
      // Create new context
      const created = await pb
        .collection<PaginationContext>("pagination_context")
        .create({
          user_id: userId,
          context_type: contextType,
          query,
          sort,
          filters,
          current_page: 1,
        });
      return created.id!;
    }
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
    const expirationTime = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 minutes ago

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
  context: PaginationState & { contextId: string },
): ActionRowBuilder<ButtonBuilder> {
  const { userId, currentPage, totalPages, namespace, contextId } = context;

  // Super simple customId - just namespace, contextId, and userId
  const prevButton = new ButtonBuilder()
    .setCustomId(`${namespace}_prev_page:${contextId}:${userId}`)
    .setLabel("◀ Previous")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage === 1);

  const pageIndicator = new ButtonBuilder()
    .setCustomId("page_indicator")
    .setLabel(`Page ${currentPage}/${totalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const nextButton = new ButtonBuilder()
    .setCustomId(`${namespace}_next_page:${contextId}:${userId}`)
    .setLabel("Next ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage >= totalPages);

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
