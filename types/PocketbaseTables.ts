export type BankRecord = {
  user_id: string;
  balance: number;
  server_id: string;
};

export type ChatRecord = {
  user_id: string;
  message: string;
  author: "bot" | "user";
};

export type HammerspaceRecord = {
  item: string;
  times_used: number;
  server_id: string;
  create_by_user_id: string;
  type: "item" | "sentence" | "phrase";
};

export type LogRecord = {
  user_id: string;
  server_id: string;
  command: string;
  input: string;
  output: string;
};

export type ReminderRecord = {
  time: string;
  server_id: string;
  user_id: string;
  channel_id: string;
  reminder_text: string;
};
