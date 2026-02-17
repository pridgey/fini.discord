export interface RconConfig {
  host: string;
  port: number;
  password: string;
}

export const rconConfig: RconConfig = {
  host: "localhost",
  port: 25575,
  password: process.env.MINECRAFT_RCON_PASS || "",
};
