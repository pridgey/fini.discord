import PocketBase from "pocketbase";

console.log("Pocketbase URL:", { processEnv: process.env.POCKETBASE_URL });

export const pb = new PocketBase(process.env.POCKETBASE_URL || "");
