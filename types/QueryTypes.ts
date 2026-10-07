import {
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
} from "discord.js";

export type ResultsBuilder<T> = {
  items: T[];
  userId?: string;
  queryString?: string;
  sortOption?: string;
  /**
   * The pagination context this page was rendered from, when there is one.
   *
   * Only needed by results whose own buttons have to get *back* to the list -
   * the finicards v2 collection swaps the message out for a card and needs the
   * context id to restore the page the player left. Optional because most
   * results just render and are never returned to.
   */
  contextId?: string;
};

export type ResultsBuilderReturn = {
  components?: (ContainerBuilder | TextDisplayBuilder)[];
  files?: AttachmentBuilder[];
  useComponentsV2?: boolean;
};

export type QueryFunction<T> = {
  query: ({ page, perPage, sortOption, filterOption }: QueryParams) => Promise<{
    items: T[];
    totalItems: number;
    totalPages: number;
    currentPage: number;
    perPage: number;
  }>;
  id: string;
  buildResults: (params: ResultsBuilder<T>) => Promise<ResultsBuilderReturn>;
};

export type QueryParams = {
  queryString?: string;
  page: number;
  perPage: number;
  sortOption?: string;
  filterOption?: string;
  additionalData?: Record<string, unknown>;
};
