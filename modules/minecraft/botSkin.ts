/**
 * Choosing what Fini's bot looks like.
 *
 * A fake player's skin comes from the `textures` property on its GameProfile,
 * and the mod fills that in from the real Mojang account matching the bot's
 * name. That couples the two: call the bot Fini and it wears whatever the real
 * FINI account wears. Replacing the property server-side breaks the coupling -
 * verified in game, with a bot named FINI wearing Notch's and then
 * Dinnerbone's skin.
 *
 * Two kinds of skin can be described:
 *
 * - **account** - reuse a real account's textures, signature included. Always
 *   works, because the signature is Mojang's own and validates.
 * - **url** - point at any PNG. Necessarily *unsigned*, since only Mojang can
 *   sign a profile's textures, so it depends on the client accepting unsigned
 *   properties.
 */

export type SkinModel = "classic" | "slim";

export type SkinSpec =
  | { kind: "account"; name: string }
  | { kind: "url"; url: string; model: SkinModel };

/** A `textures` property ready to put on a GameProfile. */
export type TexturesProperty = {
  value: string;
  /** Null for anything we built ourselves - we cannot sign for Mojang. */
  signature: string | null;
};

export class SkinSpecError extends Error {}

/**
 * Parses a skin spec.
 *
 * - `account:Dinnerbone`
 * - `url:https://example.com/fini.png` (classic)
 * - `url:https://example.com/fini.png#slim`
 */
export const parseSkinSpec = (raw: string): SkinSpec => {
  const spec = raw.trim();
  const separator = spec.indexOf(":");
  if (separator < 0) {
    throw new SkinSpecError(
      `Skin spec must start with "account:" or "url:", got "${raw}"`,
    );
  }

  const kind = spec.slice(0, separator).toLowerCase();
  const rest = spec.slice(separator + 1).trim();

  if (kind === "account") {
    // Mojang names: 3-16 of [A-Za-z0-9_]
    if (!/^[A-Za-z0-9_]{3,16}$/.test(rest)) {
      throw new SkinSpecError(`"${rest}" is not a valid Minecraft username`);
    }
    return { kind: "account", name: rest };
  }

  if (kind === "url") {
    const hashIndex = rest.lastIndexOf("#");
    const url = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest;
    const modelPart = hashIndex >= 0 ? rest.slice(hashIndex + 1) : "classic";

    if (!/^https?:\/\/\S+$/.test(url)) {
      throw new SkinSpecError(`"${url}" is not an http(s) URL`);
    }
    if (modelPart !== "classic" && modelPart !== "slim") {
      throw new SkinSpecError(
        `Model must be "classic" or "slim", got "${modelPart}"`,
      );
    }

    return { kind: "url", url, model: modelPart };
  }

  throw new SkinSpecError(
    `Unknown skin spec kind "${kind}" - expected "account" or "url"`,
  );
};

/**
 * Builds the base64 payload the client expects for a `textures` property.
 *
 * `profileId` and `profileName` are echoed back by Mojang in real payloads.
 * The client does not check them against the player it belongs to, but they
 * are included so the payload matches the shape of a genuine one.
 */
export const buildTexturesValue = (args: {
  url: string;
  model: SkinModel;
  profileId: string;
  profileName: string;
  timestamp?: number;
}): string => {
  const { url, model, profileId, profileName, timestamp = Date.now() } = args;

  const skin: Record<string, unknown> = { url };
  // Mojang omits metadata entirely for the classic model
  if (model === "slim") {
    skin.metadata = { model: "slim" };
  }

  return Buffer.from(
    JSON.stringify({
      timestamp,
      profileId: profileId.replace(/-/g, ""),
      profileName,
      textures: { SKIN: skin },
    }),
  ).toString("base64");
};

/** Reads the model back out of a textures payload. For tests and diagnostics. */
export const readTexturesValue = (value: string) =>
  JSON.parse(Buffer.from(value, "base64").toString("utf8")) as {
    timestamp: number;
    profileId: string;
    profileName: string;
    textures: { SKIN?: { url: string; metadata?: { model?: string } } };
  };

const MOJANG_NAME_API = "https://api.mojang.com/users/profiles/minecraft";
const MOJANG_SESSION_API =
  "https://sessionserver.mojang.com/session/minecraft/profile";

/** The bot's own profile id, used when building a payload from scratch. */
export type ProfileIdentity = { id: string; name: string };

/**
 * Looks up an account's uuid by name. Null when no such account exists -
 * Mojang answers 404, which is not an error worth throwing over.
 */
const lookupAccount = async (
  name: string,
): Promise<ProfileIdentity | null> => {
  const response = await fetch(`${MOJANG_NAME_API}/${encodeURIComponent(name)}`);
  if (response.status === 404 || response.status === 204) return null;
  if (!response.ok) {
    throw new Error(`Mojang name lookup failed: ${response.status}`);
  }
  const body = (await response.json()) as { id: string; name: string };
  return body;
};

/**
 * Fetches an account's `textures` property, signature included.
 *
 * `unsigned=false` is what asks for the signature; without it Mojang returns
 * the payload alone and the client rejects it.
 */
const fetchAccountTextures = async (
  uuid: string,
): Promise<TexturesProperty | null> => {
  const response = await fetch(
    `${MOJANG_SESSION_API}/${uuid.replace(/-/g, "")}?unsigned=false`,
  );
  if (!response.ok) {
    throw new Error(`Mojang profile fetch failed: ${response.status}`);
  }
  const body = (await response.json()) as {
    properties?: { name: string; value: string; signature?: string }[];
  };

  const textures = body.properties?.find(
    (property) => property.name === "textures",
  );
  if (!textures) return null;

  return { value: textures.value, signature: textures.signature ?? null };
};

/**
 * Turns a spec into a property ready to inject.
 *
 * `identity` is only consulted for `url` specs, which have to build a payload
 * rather than borrow one.
 */
export const resolveSkinSpec = async (
  spec: SkinSpec,
  identity: ProfileIdentity,
): Promise<TexturesProperty> => {
  if (spec.kind === "account") {
    const account = await lookupAccount(spec.name);
    if (!account) {
      throw new SkinSpecError(`No Minecraft account named "${spec.name}"`);
    }
    const textures = await fetchAccountTextures(account.id);
    if (!textures) {
      throw new SkinSpecError(
        `Account "${account.name}" has no skin set, so there is nothing to copy`,
      );
    }
    return textures;
  }

  return {
    value: buildTexturesValue({
      url: spec.url,
      model: spec.model,
      profileId: identity.id,
      profileName: identity.name,
    }),
    // Nothing we build can carry a Mojang signature
    signature: null,
  };
};

/**
 * Renders the KubeJS server script that applies a skin in game.
 *
 * Generated rather than hand-edited so the repo stays the source of truth: the
 * script lives in the modpack's `kubejs/server_scripts`, which a pack update
 * deletes wholesale.
 *
 * Why a script at all, rather than a command: the textures have to be on the
 * GameProfile, and nothing exposes that over RCON. And why on a timer rather
 * than at spawn - KubeJS offers no hook for a fake player being created.
 */
export const renderSkinScript = (args: {
  botName: string;
  textures: TexturesProperty;
  description: string;
}): string => {
  const { botName, textures, description } = args;

  const signatureLiteral =
    textures.signature === null
      ? `/*\n * Null: nothing we build ourselves can carry a Mojang signature, since\n * Mojang only signs a profile's own textures.\n */\nvar SKIN_SIG = null;`
      : `var SKIN_SIG =\n  "${textures.signature}";`;

  return `// GENERATED by scripts/apply-bot-skin.ts - edit that, not this.
//
// Skin: ${description}
//
// A fake player's skin comes from the \`textures\` property on its GameProfile,
// which the mod fills in from the real Mojang account matching the bot's name.
// That couples name to skin. Replacing the property breaks the coupling.
//
// Known limitation, found in game: a client that has already resolved this
// player keeps the skin it first saw. Removing and re-adding the tab-list
// entry is not enough. So a change is only visible to clients that connect
// afterwards - set the skin before anyone joins, or reconnect to see it.

var SKIN_VALUE =
  "${textures.value}";
${signatureLiteral}

var BOT_NAME = "${botName.toLowerCase()}";
var CHECK_EVERY_TICKS = 40;

var skinTick = 0;
/** UUIDs already given the skin, so it is not reapplied every check. */
var applied = {};

function log(message) {
  console.info("[FINI-SKIN] " + message);
}

function findBot(server) {
  var players = server.playerList.players;
  for (var i = 0; i < players.size(); i++) {
    var player = players.get(i);
    if (String(player.gameProfile.name).toLowerCase() === BOT_NAME) {
      return player;
    }
  }
  return null;
}

/** Re-sends the tab-list entry so newly joined clients read the new profile. */
function resendPlayerInfo(server, target) {
  var RemovePacket = Java.loadClass(
    "net.minecraft.network.protocol.game.ClientboundPlayerInfoRemovePacket",
  );
  var UpdatePacket = Java.loadClass(
    "net.minecraft.network.protocol.game.ClientboundPlayerInfoUpdatePacket",
  );
  var List = Java.loadClass("java.util.List");

  var uuids = List.of(target.uuid);
  var targets = List.of(target);
  var viewers = server.playerList.players;

  for (var i = 0; i < viewers.size(); i++) {
    var connection = viewers.get(i).connection;
    connection.send(new RemovePacket(uuids));
    connection.send(UpdatePacket.createPlayerInitializing(targets));
  }
  return viewers.size();
}

ServerEvents.tick(function (event) {
  skinTick++;
  if (skinTick % CHECK_EVERY_TICKS !== 0) return;

  try {
    var server = event.server;
    var bot = findBot(server);
    if (bot === null) return;

    var key = String(bot.uuid);
    if (applied[key]) return;

    var Property = Java.loadClass("com.mojang.authlib.properties.Property");
    var properties = bot.gameProfile.properties;

    // Replace rather than add: the profile already carries the textures the
    // mod resolved from Mojang, and the client uses the first it finds
    properties.removeAll("textures");
    properties.put(
      "textures",
      SKIN_SIG === null
        ? new Property("textures", SKIN_VALUE)
        : new Property("textures", SKIN_VALUE, SKIN_SIG),
    );

    var viewers = resendPlayerInfo(server, bot);
    applied[key] = true;
    log(
      "applied skin to " + bot.gameProfile.name + " (signed=" +
        (SKIN_SIG !== null) + "), refreshed " + viewers + " viewer(s)",
    );
  } catch (e) {
    log("THREW: " + e);
  }
});
`;
};
