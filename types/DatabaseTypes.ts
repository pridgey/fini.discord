interface DatabaseItem {
  ID?: number;
  Item: string;
  User: string;
  DateCreated: number;
  TimesUsed: number;
  Server: string;
}

export interface HammerspaceItem extends DatabaseItem {}
export interface PhraseItem extends DatabaseItem {}
export interface SentenceItem extends DatabaseItem {}
export interface HammerspaceItem extends DatabaseItem {}

export interface BankRecord {
  ID?: number;
  User: string;
  Balance: number;
  Server: string;
}

export interface SettingsRecord {
  ID?: number;
  Key: string;
  Value: string;
  Server: string;
}

export interface StatsRecord {
  ID?: number;
  Collection: string;
  Field: string;
  Value: string;
  Server: string;
}

export interface FeedsRecord {
  ID?: number;
  URL: string;
  Items: number;
  User: string;
  Server: string;
}

export interface ChatLogRecord {
  ID?: number;
  Content: string;
}

export type DatabaseTables =
  | "Bank"
  | "Hammerspace"
  | "Phrase"
  | "Sentences"
  | "Settings"
  | "Stats"
  | "Feeds"
  | "ChatLog";

export type FieldValuePair<T> = {
  Field: keyof T;
  Value: string | number;
};
