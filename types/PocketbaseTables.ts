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
};

export type PollRecord = {
  id?: string;
  name: string;
  user_id: string;
  users_can_add: boolean;
  single_vote: boolean;
  slug: number;
};

export type PollOptionRecord = {
  id?: string;
  option_name: string;
  user_id: string;
  poll: string;
  option_number: number;
  slug: number;
};

export type PollVoteRecord = {
  id?: string;
  poll_option: string;
  user_id: string;
};

export type WeatherRecord = {
  id?: string;
  time: string;
  server_id: string;
  user_id: string;
  city: string;
  additional_prompt: string;
};
