import { describe, expect, it } from "bun:test";
import {
  checkHostSafety,
  expandIPv6,
  isBlockedAddress,
} from "../../modules/media/urlSafety";

/**
 * `/ytdlp` fetches whatever url it is handed, so this is the only thing
 * standing between the bot and being a proxy into the machine it runs on. The
 * demonstrated exploit was `/ytdlp url:http://127.0.0.1:9099/recording.mp4`,
 * which fetched a localhost-only file and posted it into Discord.
 */

describe("isBlockedAddress", () => {
  it("blocks loopback and the private ranges", () => {
    for (const address of [
      "127.0.0.1",
      "127.255.255.254",
      "10.0.0.1",
      "10.255.255.255",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
    ]) {
      expect(isBlockedAddress(address)).toBe(true);
    }
  });

  // 169.254.169.254 is the cloud metadata endpoint; the range is also where
  // a machine with no DHCP lease ends up.
  it("blocks link-local, including cloud metadata", () => {
    expect(isBlockedAddress("169.254.169.254")).toBe(true);
    expect(isBlockedAddress("169.254.0.1")).toBe(true);
  });

  // Tailscale puts every node in 100.64/10, so this range is both CGNAT and
  // the tailnet - including the box's own share links.
  it("blocks CGNAT, which is where the tailnet lives", () => {
    expect(isBlockedAddress("100.64.0.1")).toBe(true);
    expect(isBlockedAddress("100.100.100.100")).toBe(true);
    expect(isBlockedAddress("100.127.255.255")).toBe(true);
  });

  it("blocks the reserved, documentation and multicast ranges", () => {
    for (const address of [
      "0.0.0.0",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "198.18.0.1",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedAddress(address)).toBe(true);
    }
  });

  // The boundaries are where an off-by-one in the mask arithmetic shows up.
  it("gets the range edges right rather than nearly right", () => {
    expect(isBlockedAddress("172.15.255.255")).toBe(false);
    expect(isBlockedAddress("172.32.0.1")).toBe(false);
    expect(isBlockedAddress("100.63.255.255")).toBe(false);
    expect(isBlockedAddress("100.128.0.1")).toBe(false);
    expect(isBlockedAddress("11.0.0.1")).toBe(false);
  });

  it("allows ordinary public addresses", () => {
    for (const address of [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "2606:4700::1111",
      "2001:4860:4860::8888",
    ]) {
      expect(isBlockedAddress(address)).toBe(false);
    }
  });

  it("blocks the IPv6 local ranges", () => {
    for (const address of [
      "::1",
      "::",
      "fe80::1",
      "fd00::1",
      "fc00::1",
      "ff02::1",
      "2001:db8::1",
    ]) {
      expect(isBlockedAddress(address)).toBe(true);
    }
  });

  // ::ffff:127.0.0.1 is loopback wearing a hat. Treating it as "some IPv6
  // address" and waving it through is the classic bypass.
  it("sees through IPv4-mapped and NAT64 addresses", () => {
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::ffff:192.168.1.1")).toBe(true);
    expect(isBlockedAddress("64:ff9b::7f00:1")).toBe(true);
    expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
  });

  // Fails closed: something unusual enough not to parse is exactly what
  // should not be let through on the grounds of being unusual.
  it("blocks anything it cannot parse", () => {
    for (const address of ["garbage", "999.1.1.1", "1.2.3", "", "::::"]) {
      expect(isBlockedAddress(address)).toBe(true);
    }
  });
});

describe("expandIPv6", () => {
  it("expands abbreviated forms to eight hextets", () => {
    expect(expandIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIPv6("2001:db8::1")).toEqual([
      0x2001, 0xdb8, 0, 0, 0, 0, 0, 1,
    ]);
  });

  it("folds an embedded IPv4 tail into two hextets", () => {
    expect(expandIPv6("::ffff:127.0.0.1")).toEqual([
      0, 0, 0, 0, 0, 0xffff, 0x7f00, 1,
    ]);
  });

  it("rejects malformed addresses", () => {
    expect(expandIPv6("1::2::3")).toBeNull();
    expect(expandIPv6("gggg::1")).toBeNull();
    expect(expandIPv6("1:2:3:4:5:6:7")).toBeNull();
  });
});

describe("checkHostSafety", () => {
  it("refuses names that resolve to the local machine", async () => {
    for (const host of ["localhost", "127.0.0.1"]) {
      const result = await checkHostSafety(host);

      expect(result.safe).toBe(false);
    }
  });

  it("refuses a bracketed IPv6 literal the same as a bare one", async () => {
    expect((await checkHostSafety("[::1]")).safe).toBe(false);
  });

  it("refuses a name that does not resolve at all", async () => {
    const result = await checkHostSafety("definitely-not-a-real-host.invalid");

    expect(result.safe).toBe(false);
  });

  it("explains itself rather than failing silently", async () => {
    const result = await checkHostSafety("127.0.0.1");

    expect(result.safe ? "" : result.reason).toContain("private or local");
  });
});
