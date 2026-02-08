import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

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

export interface PaginationContext {
  userId: string;
  currentPage: number;
  totalPages: number;
  query?: string;
  namespace: string;
  sort?: string;
}

/**
 * Utility function to create a pagination row with "Previous" and "Next" buttons, along with a page indicator.
 * Is generic and can be used across different paginated views by providing the appropriate context and namespace for button custom IDs.
 */
export function createPaginationRow(
  context: PaginationContext,
): ActionRowBuilder<ButtonBuilder> {
  const { userId, currentPage, totalPages, query, namespace, sort } = context;

  // Namespace+Identifier:Page:Query:Sort:UserId
  const stateString = `${currentPage}:${encodeURIComponent(
    query || "",
  )}:${encodeURIComponent(sort || "")}:${userId}`;

  const prevButton = new ButtonBuilder()
    .setCustomId(`${namespace}_prev_page:${stateString}`)
    .setLabel("◀ Previous")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage === 1);

  const pageIndicator = new ButtonBuilder()
    .setCustomId("page_indicator")
    .setLabel(`Page ${currentPage}/${totalPages}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const nextButton = new ButtonBuilder()
    .setCustomId(`${namespace}_next_page:${stateString}`)
    .setLabel("Next ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage >= totalPages);

  const row = new ActionRowBuilder<ButtonBuilder>();
  row.setComponents([prevButton, pageIndicator, nextButton]);

  return row;
}

/**
 * Utility function to parse the pagination state from button interaction arguments.
 */
export function parsePaginationState(args: string[]): {
  userId: string;
  currentPage: number;
  query?: string;
  sort?: string;
} {
  const [currentPageStr, encodedQuery, encodedSort, userId] = args;

  return {
    userId,
    currentPage: parseInt(currentPageStr, 10),
    query:
      encodedQuery && encodedQuery !== ""
        ? decodeURIComponent(encodedQuery)
        : undefined,
    sort:
      encodedSort && encodedSort !== ""
        ? decodeURIComponent(encodedSort)
        : undefined,
  };
}
