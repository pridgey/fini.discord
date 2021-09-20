import { Message } from "discord.js";

export type Game = {
  // The description of the game
  Description: string;
  // The main function to run for the game, returns a multiplier and win boolean
  Run: (
    options: string[],
    message: Message
  ) => Promise<{ multiplier: number; win: boolean }>;
  // A function to run when the user wins
  Win: (message: Message) => void;
  // A function to run when the user loses
  Lose: (message: Message) => void;
  // A regex expression to validate game's arguments
  Validation: (args: string[]) => boolean;
};
