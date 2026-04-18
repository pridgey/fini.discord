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
};

export type ResultsBuilderReturn = {
  components?: (ContainerBuilder | TextDisplayBuilder)[];
  files?: AttachmentBuilder[];
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
