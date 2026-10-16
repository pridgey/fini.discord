import { ButtonInteraction, ChatInputCommandInteraction, type GuildMember } from "discord.js";
import {
  getCardDefinitions,
  getPopulationCounts,
  toBattleCard,
} from "../../modules/finicards/cardStore";
import {
  getUnopenedFreePacks,
  markFreePackOpened,
  passOnSpecial,
} from "../../modules/finicards/freePacks";
import { rollGuaranteedTier, type LegendaryTier } from "../../modules/finicards/legendary";
import {
  availableSecretArts,
  openPack,
  PACK_COST,
  PACK_SIZE,
  SET_PACK_COST,
} from "../../modules/finicards/packs";
import { presentPack } from "../../modules/finicards/packFlow";
import { createLog } from "../../modules/logger/logger";
import { addCoin, getUserBalance } from "../../modules/finicoin";
import { ADMIN_ID, isAdmin } from "../../utilities/discord/isAdmin";

const NO_LEGENDARY: Record<LegendaryTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

/** Pack odds under which a Legendary of `tier`, and only that tier, is certain. */
const certainTier = (tier: LegendaryTier): Record<LegendaryTier, number> => ({
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  [tier]: 1,
});

/* -------------------------------------------------------------------------- */
/* Packs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Logs a pack bought with the button under the last one. No command ran, so
 * nothing else would: the row is written the way `/finicard pack` writes its
 * own, so the two are counted together, and says which it was.
 *
 * Never rejects - it is not awaited, and an unhandled rejection takes the bot down.
 */
const logAgainPack = async (press: ButtonInteraction, set: number | null): Promise<void> => {
  try {
    const output = await press
      .fetchReply()
      .then((reply) => reply.content)
      .catch(() => "<no reply - interaction expired>");

    await createLog({
      command: "/finicard",
      input: `Command options:\n${[
        "subcommand: pack",
        `set: ${set ?? undefined}`,
        "test: undefined",
        "via: another pack button",
      ].join(",\n")}`,
      output,
      server_id: press.guild?.id || "unknown",
      user_id: press.user.id,
    });
  } catch (error) {
    console.error("Error logging a pack bought by button:", error);
  }
};

/**
 * Buys - or, for a free pack, hands over - one pack and presents it on the
 * reply `interaction` has already deferred.
 *
 * Shared by `/finicard pack` and by the button at the end of a pack that buys
 * another of the same kind, which is why it takes its options rather than
 * reading them off a command.
 */
export const openPackFor = async (
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  { set, test }: { set: number | null; test: string | null },
): Promise<void> => {
  const serverId = interaction.guildId ?? "unknown guild id";
  const serverName = interaction.guild?.name ?? "unknown guild name";
  const identifier = `${interaction.user.username}-${serverName}`;


  // A forced pull is a test, not a purchase: it costs nothing - which is
  // why only the bot admin may ask for one.
  if (test && !isAdmin(interaction.user.id)) {
    await interaction.editReply("The `test` option is for the bot admin. Leave it off to open a pack.");
    return;
  }

  // A free pack the player is owed is opened before one they pay for.
  // It is a pack of every set, so asking for one set buys a pack instead.
  const freePacks =
    test || set
      ? []
      : await getUnopenedFreePacks(interaction.user.id, serverId).catch(() => []);
  const freePack = freePacks[0] ?? null;

  const price = set ? SET_PACK_COST : PACK_COST;
  const cost = test || freePack ? 0 : price;
  const forcedTier = test?.startsWith("legendary_")
    ? (Number(test.slice(-1)) as LegendaryTier)
    : null;

  const balance =
    (await getUserBalance(interaction.user.id, serverId)) || 0;

  if (balance < cost) {
    await interaction.editReply(
      `${set ? `A Set ${set} pack` : "A pack"} costs ${price} fc and you have ${balance}.`,
    );
    return;
  }

  const definitions = (await getCardDefinitions()).filter(
    (definition) => !set || definition.set === set,
  );
  // Asked for, and impossible: say so rather than hand over a plain pack.
  if (
    test === "secret_art" &&
    availableSecretArts(definitions, await getPopulationCounts(serverId)).length === 0
  ) {
    await interaction.editReply(
      definitions.some((definition) => definition.secret_art)
        ? "Every active Secret Art is already at its 3 copies on this server."
        : `No Secret Art is active${set ? ` in set ${set}` : ""}, so a pack has none to find. Mark one active in the card manager and try again.`,
    );
    return;
  }
  if (set && definitions.length === 0) {
    await interaction.editReply(`Set ${set} has no active cards to pull.`);
    return;
  }
  if (definitions.length === 0) {
    await interaction.editReply(
      "The card pool is empty, so there is nothing to pull.",
    );
    return;
  }

  if (cost > 0) {
    await addCoin(
      "Reserve",
      serverId,
      cost,
      interaction.user.username,
      serverName,
      interaction.user.id,
    );
  }

  const { pulls, shortfall } = await openPack({
    userId: interaction.user.id,
    serverId,
    identifier,
    ...(set ? { set } : {}),
    ...(test === "secret_art" ? { secretArtChance: 1 } : {}),
    ...(forcedTier ? { legendaryOdds: certainTier(forcedTier) } : {}),
    // A free pack holds what was placed in it and rolls nothing special
    // by chance: each server's batch has exactly one of each.
    ...(freePack
      ? {
          secretArtChance: freePack.special === "secret_art" ? 1 : 0,
          legendaryOdds:
            freePack.special === "legendary"
              ? certainTier(rollGuaranteedTier(Math.random()))
              : NO_LEGENDARY,
        }
      : {}),
  });

  if (freePack) {
    await markFreePackOpened(freePack.id ?? "");
    // Placed but not there to give - no Secret Art left on the server,
    // say. Another unopened free pack takes it, so the server still
    // gets its one.
    const delivered =
      freePack.special === "secret_art"
        ? pulls.some((pull) => pull.definition.secret_art)
        : freePack.special === "legendary"
          ? pulls.some((pull) => !!pull.legendary)
          : true;
    if (!delivered && freePack.special) {
      await passOnSpecial(serverId, freePack.special, ADMIN_ID || undefined);
    }
  }

  if (shortfall > 0 && cost > 0) {
    // Refund at the per-card rate, the way /booster-pack does.
    await addCoin(
      interaction.user.id,
      serverId,
      Math.round((cost / PACK_SIZE) * shortfall),
      interaction.user.username,
      serverName,
      "Reserve",
    );
  }

  const reimbursement =
    shortfall > 0 ? Math.round((cost / PACK_SIZE) * shortfall) : 0;

  const cards = pulls.map((owned) => ({ ...toBattleCard(owned), isNew: owned.isNew }));
  const pack = {
    cards,
    opener: (interaction.member as GuildMember | null)?.displayName ?? interaction.user.displayName,
    cost,
    shortfall,
    reimbursement,
    ...(freePack
      ? {
          note: `Free pack · ${freePacks.length - 1} more to open`,
        }
      : set
        ? { note: `Set ${set} pack · ${cost > 0 ? `${cost} fc` : "test, free"}` }
        : {}),
  };

  // The sealed pack first, then its cards one at a time. A test pack was not
  // bought, so it does not offer to buy another.
  await presentPack(
    interaction,
    pack,
    test
      ? undefined
      : {
          label: set
            ? `Buy another Set ${set} pack · ${SET_PACK_COST} fc`
            : freePacks.length > 1
              ? "Open another free pack"
              : `Buy another pack · ${PACK_COST} fc`,
          buy: (press) =>
            openPackFor(press, { set, test: null }).finally(() => logAgainPack(press, set)),
        },
  );
};