export type BankRecord = {
  id?: string;
  user_id: string;
  balance: number;
  server_id: string;
};

export type ChatRecord = {
  id?: string;
  user_id: string;
  message: string;
  author: "bot" | "user";
  chatType: string;
  server_id: string;
};

export type HammerspaceRecord = {
  id?: string;
  item: string;
  times_used: number;
  server_id: string;
  created?: string;
  created_by_user_id: string;
  type: "item" | "sentence" | "phrase";
};

export type LogRecord = {
  id?: string;
  user_id: string;
  server_id: string;
  command: string;
  input: string;
  output: string;
  created?: string;
};

export type ReminderRecord = {
  id?: string;
  time: string;
  server_id: string;
  user_id: string;
  channel_id: string;
  reminder_text: string;
};

export type TtsRecord = {
  id?: string;
  prompt: string;
  server_id: string;
  user_id: string;
  channel_id: string;
};

export type PersonalitiesRecord = {
  id?: string;
  user_id: string;
  prompt: string;
  active: boolean;
  personality_name: string;
  server_id: string;
};

export type WeatherRecord = {
  id?: string;
  time: string;
  server_id: string;
  user_id: string;
  city: string;
  additional_prompt: string;
};

export type CardDefinitionRecord = {
  id?: string;
  card_name: string;
  color:
    | "red"
    | "blue"
    | "yellow"
    | "purple"
    | "green"
    | "black"
    | "light"
    | "shadow";
  type: string;
  series: string;
  rarity: "c" | "u" | "fa" | "l" | "i";
  image: string;
  strength: number;
  agility: number;
  endurance: number;
  intellect: number;
  luck: number;
  population: number;
  mod_operation?: "addition" | "subtraction" | "multiplication" | "division";
  description: string;
};

export type UserCardRecord = {
  id?: string;
  user_id: string;
  server_id: string;
  identifier: string;
  card: string;
};
