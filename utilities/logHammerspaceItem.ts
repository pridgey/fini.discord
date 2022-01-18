import { db } from "./";

export const LogHammerspaceItem = (
  HammerspaceID: number,
  TimesUsed: number,
  GuildID: string
) =>
  db()
    .update(
      "Hammerspace",
      {
        Field: "ID",
        Value: HammerspaceID,
      },
      {
        Field: "TimesUsed",
        Value: TimesUsed,
      },
      GuildID
    )
    .catch((err) => console.error(err));
