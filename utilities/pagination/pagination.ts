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
}

/**
 * Utility function to create a pagination row with "Previous" and "Next" buttons, along with a page indicator.
 * Is generic and can be used across different paginated views by providing the appropriate context and namespace for button custom IDs.
 */
export function createPaginationRow(
  context: PaginationContext,
): ActionRowBuilder<ButtonBuilder> {
  const { userId, currentPage, totalPages, query, namespace } = context;

  const stateString = `${currentPage}:${encodeURIComponent(
    query || "",
  )}:${userId}`;

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
} {
  // userId is at the END (last position)
  const userId = args[args.length - 1];
  const currentPageStr = args[0];
  const encodedQuery = args[1];

  return {
    userId,
    currentPage: parseInt(currentPageStr, 10),
    query: encodedQuery ? decodeURIComponent(encodedQuery) : undefined,
  };
}
