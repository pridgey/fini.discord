/**
 * discord.js's typed option getters, for fake interactions whose options only
 * implement `get(name)`. Spread into a fake's `options`:
 *
 *   options: { ...typedOptionGetters, get: mock(() => ({ value: "x" })) }
 *
 * Each reads through `this.get` when it's called, so a test can still swap
 * `get` out afterwards. Like the real ones, they return null for an option
 * that wasn't given.
 */

type Option = {
  value?: unknown;
  attachment?: unknown;
  channel?: unknown;
  user?: unknown;
};
type FakeOptions = { get(name: string): Option | null | undefined };

const valueOf = (options: FakeOptions, name: string) =>
  options.get(name)?.value ?? null;

export const typedOptionGetters = {
  getString(this: FakeOptions, name: string) {
    return valueOf(this, name);
  },
  getBoolean(this: FakeOptions, name: string) {
    return valueOf(this, name);
  },
  getNumber(this: FakeOptions, name: string) {
    return valueOf(this, name);
  },
  getInteger(this: FakeOptions, name: string) {
    return valueOf(this, name);
  },
  getAttachment(this: FakeOptions, name: string) {
    return this.get(name)?.attachment ?? null;
  },
  getChannel(this: FakeOptions, name: string) {
    return this.get(name)?.channel ?? null;
  },
  getUser(this: FakeOptions, name: string) {
    return this.get(name)?.user ?? null;
  },
};
