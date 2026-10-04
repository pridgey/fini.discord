import { Rcon } from "rcon-client";
import { RconConfig } from "./rcon.config";
import {
  blockAhead,
  normaliseHeading,
  type Vec3,
  type WanderAction,
  type WanderSenses,
} from "./botWander";

/**
 * Drives a SiliconeDolls fake player over RCON.
 *
 * Holds one connection open rather than reconnecting per command: the wander
 * loop issues a few commands every few seconds, and `Rcon.connect` per command
 * is what makes the monitor's probes cost ~37ms each.
 */
export class BotControl {
  private rcon: Rcon | null = null;

  constructor(
    private readonly rconConfig: RconConfig,
    private readonly botName: string,
  ) {}

  private async connection(): Promise<Rcon> {
    if (!this.rcon) {
      this.rcon = await Rcon.connect(this.rconConfig);
      // A dropped socket must not be reused, or every later command throws
      this.rcon.on("end", () => {
        this.rcon = null;
      });
    }
    return this.rcon;
  }

  async send(command: string): Promise<string> {
    try {
      const rcon = await this.connection();
      return await rcon.send(command);
    } catch (error) {
      // Force a fresh connection next time rather than wedging on a dead one
      this.rcon = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const rcon = this.rcon;
    this.rcon = null;
    if (rcon) {
      try {
        await rcon.end();
      } catch {
        // Already gone
      }
    }
  }

  /** True when the bot is currently on the server. */
  async isOnline(): Promise<boolean> {
    const response = await this.send("list");
    return response.toLowerCase().includes(this.botName.toLowerCase());
  }

  async spawn(at: Vec3): Promise<string> {
    return this.send(
      `player ${this.botName} spawn at ${at.x} ${at.y} ${at.z} facing 0 0 in minecraft:overworld in creative`,
    );
  }

  /**
   * Spawns the bot next to a player, a little above their head so it drops
   * onto solid ground instead of materialising inside their base. Falling is
   * harmless in creative.
   */
  async spawnNear(playerName: string, heightOffset = 4): Promise<string> {
    return this.send(
      `execute at ${playerName} run player ${this.botName} spawn at ~ ~${heightOffset} ~ facing 0 0 in minecraft:overworld in creative`,
    );
  }

  /**
   * Says something to everyone, as the bot.
   *
   * `tellraw` rather than `say` so the name is styled and the message isn't
   * prefixed with the server's `[...]` formatting. JSON.stringify does the
   * escaping, which matters because the text comes from a language model.
   */
  async broadcast(message: string): Promise<string> {
    const component = [
      { text: `<${this.botName}> `, color: "aqua" },
      { text: message, color: "white" },
    ];
    return this.send(`tellraw @a ${JSON.stringify(component)}`);
  }

  async despawn(): Promise<string> {
    return this.send(`player ${this.botName} kill`);
  }

  async getPosition(): Promise<Vec3 | null> {
    const response = await this.send(
      `data get entity ${this.botName} Pos`,
    );
    return parseVec3(response);
  }

  /** Yaw in degrees, as the server reports it. */
  async getHeading(): Promise<number | null> {
    const response = await this.send(
      `data get entity ${this.botName} Rotation`,
    );
    return parseYaw(response);
  }

  /**
   * Applies one decision.
   *
   * `turn` is **relative** on this mod - issuing `turn 90 0` twice ends up at
   * 180, not 90 - so an absolute heading has to be sent as a delta from where
   * the bot is actually looking. `look` is absolute but only accepts compass
   * words, which would restrict wandering to four directions.
   */
  async apply(action: WanderAction, currentHeading: number): Promise<void> {
    switch (action.kind) {
      case "walk":
        await this.walk();
        return;

      case "jump":
      case "swim":
        /*
         * Repeats until stopped. On land this clears a one-block step; in
         * water holding jump is what makes a player swim upwards, so the same
         * command keeps the bot at the surface instead of on the seabed.
         */
        await this.send(`player ${this.botName} jump interval 10`);
        await this.walk();
        return;

      case "turn":
      case "recall":
        await this.face(action.heading, currentHeading);
        await this.walk();
        return;

      case "rescue":
        // The service chooses where to drop it, since it knows the anchor
        return;
    }
  }

  private async walk(): Promise<void> {
    await this.send(`player ${this.botName} move forward`);
  }

  private async face(
    targetHeading: number,
    currentHeading: number,
  ): Promise<void> {
    const delta = normaliseHeading(targetHeading - currentHeading);
    // Sub-degree turns aren't worth a command
    if (Math.abs(delta) < 1) return;
    await this.send(
      `player ${this.botName} turn ${delta.toFixed(1)} 0`,
    );
  }

  /**
   * How far the ground ahead runs without a dangerous drop, in blocks, capped
   * at `lookahead`.
   *
   * Only looks for drops. Walls are left to the stuck escalation, which
   * already handles them well, and checking for them too would double the
   * probe count - each probe costs about a server tick, so a clear scan is the
   * common case and sets the budget.
   */
  async senseGround(
    position: Vec3,
    heading: number,
    lookahead: number,
  ): Promise<number> {
    for (let distance = 1; distance <= lookahead; distance++) {
      const ahead = blockAhead(position, heading, distance);

      const belowIsAir = await this.isAir({
        x: ahead.x,
        y: ahead.y - 1,
        z: ahead.z,
      });

      // Solid footing - keep scanning
      if (!belowIsAir) continue;

      // Air underfoot is fine for a single step down, a hazard beyond that
      const twoBelowIsAir = await this.isAir({
        x: ahead.x,
        y: ahead.y - 2,
        z: ahead.z,
      });
      if (twoBelowIsAir) return distance - 1;
    }

    return lookahead;
  }

  /**
   * Is the bot in water?
   *
   * Worth knowing because a submerged player sinks and walks the seabed unless
   * it holds jump, and because the ground lookahead cannot see water at all -
   * water is not air, so an ocean reads as solid footing.
   */
  async senseWater(position: Vec3): Promise<boolean> {
    const response = await this.send(
      `execute if block ${Math.floor(position.x)} ${Math.floor(position.y)} ${Math.floor(position.z)} minecraft:water`,
    );
    return response.includes("Test passed");
  }

  /** Clear space above the bot's head, so a jump can actually lift it. */
  async senseHeadroom(position: Vec3): Promise<boolean> {
    return this.isAir({
      x: Math.floor(position.x),
      y: Math.floor(position.y) + 2,
      z: Math.floor(position.z),
    });
  }

  /**
   * `execute if block <pos> minecraft:air` answers `Test passed` or
   * `Test failed`, which is the cheapest readable block query over RCON.
   */
  private async isAir(at: {
    x: number;
    y: number;
    z: number;
  }): Promise<boolean> {
    const response = await this.send(
      `execute if block ${at.x} ${at.y} ${at.z} minecraft:air`,
    );
    return response.includes("Test passed");
  }

  /**
   * Last resort for a bot embedded in terrain, which cannot free itself on
   * foot. Drops it from high above a nearby point and lets it fall - safe in
   * creative, and it lands on whatever the surface happens to be.
   */
  async rescue(to: Vec3): Promise<string> {
    return this.send(
      `tp ${this.botName} ${to.x.toFixed(1)} ${to.y.toFixed(0)} ${to.z.toFixed(1)}`,
    );
  }

  /** Clears every queued action, including a repeating jump. */
  async stop(): Promise<void> {
    await this.send(`player ${this.botName} stop`);
  }
}

/**
 * Reads `data get entity <name> Pos`, which answers like:
 *
 *     [0] FINI has the following entity data: [200.5d, 82.0d, 200.5d]
 */
export const parseVec3 = (response: string): Vec3 | null => {
  const match = response.match(
    /\[\s*(-?[\d.]+)d,\s*(-?[\d.]+)d,\s*(-?[\d.]+)d\s*\]/,
  );
  if (!match) return null;
  return {
    x: parseFloat(match[1]),
    y: parseFloat(match[2]),
    z: parseFloat(match[3]),
  };
};

/**
 * Reads `data get entity <name> Rotation`, which answers like:
 *
 *     [0] FINI has the following entity data: [-90.0f, 0.0f]
 */
export const parseYaw = (response: string): number | null => {
  const match = response.match(/\[\s*(-?[\d.]+)f,\s*(-?[\d.]+)f\s*\]/);
  if (!match) return null;
  return parseFloat(match[1]);
};
