import { promises as dns } from "dns";

/**
 * Keeps `/ytdlp` from being used as a proxy into the machine it runs on.
 *
 * yt-dlp fetches whatever url it is handed, and the only check before this
 * existed was the scheme. That made the command a working SSRF: anyone in the
 * server could point it at `http://127.0.0.1:8090` and read Pocketbase, at
 * `http://192.168.x.x` and reach the LAN, or at a camera whose mjpeg stream
 * ffmpeg would happily decode and post into the channel. Differences in the
 * error text also made it a serviceable port scanner.
 *
 * The defence is to resolve the host first and refuse anything that lands on
 * an address which is not on the public internet.
 */

/** IPv4 ranges that are not the public internet, as [network, prefix bits]. */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT - and where Tailscale puts every tailnet node
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, and cloud metadata at 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, includes 255.255.255.255
];

/** Packs a dotted quad into a 32 bit number, or null if it is not one. */
const ipv4ToInt = (address: string): number | null => {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;

    const octet = Number(part);
    if (octet > 255) return null;

    value = value * 256 + octet;
  }

  return value;
};

/**
 * Expands an IPv6 address to its eight hextets.
 *
 * Written out rather than pattern-matched on the string because `fc00::/7` and
 * `fe80::/10` are bit-prefix ranges, and "starts with fc or fd" style checks
 * get them subtly wrong on abbreviated forms.
 * @param address The address, without brackets
 * @returns Eight 16-bit numbers, or null if it does not parse
 */
export const expandIPv6 = (address: string): number[] | null => {
  let text = address.toLowerCase();

  // An embedded IPv4 tail (::ffff:127.0.0.1, NAT64) becomes two hextets.
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted) {
    const packed = ipv4ToInt(dotted[1]);
    if (packed === null) return null;

    text = `${text.slice(0, dotted.index)}${(packed >>> 16).toString(16)}:${(
      packed & 0xffff
    ).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const parseGroup = (group: string) =>
    group ? group.split(":").filter(Boolean) : [];

  const head = parseGroup(halves[0]);
  const tail = halves.length === 2 ? parseGroup(halves[1]) : [];

  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 0 : missing !== 0) return null;

  const groups = [
    ...head,
    ...Array<string>(halves.length === 2 ? missing : 0).fill("0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;

  const hextets = groups.map((group) =>
    /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN,
  );

  return hextets.some(Number.isNaN) ? null : hextets;
};

/**
 * Whether an address is somewhere we refuse to fetch from.
 *
 * Fails closed: an address that cannot be parsed is treated as blocked, since
 * the alternative is letting something through precisely because it was
 * unusual enough not to be understood.
 * @param address An IPv4 or IPv6 address, without brackets
 * @returns True if the address must not be fetched
 */
export const isBlockedAddress = (address: string): boolean => {
  const v4 = ipv4ToInt(address);

  if (v4 !== null) {
    return BLOCKED_V4.some(([network, bits]) => {
      const base = ipv4ToInt(network)!;
      const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;

      return (v4 & mask) >>> 0 === (base & mask) >>> 0;
    });
  }

  const hextets = expandIPv6(address);
  if (!hextets) return true;

  const [h0, h1] = hextets;

  // ::ffff:a.b.c.d is an IPv4 address wearing a hat - check the IPv4 rules
  // against it rather than letting it through as "some IPv6 address".
  const isV4Mapped =
    hextets.slice(0, 5).every((hextet) => hextet === 0) && h1 === 0
      ? hextets[5] === 0xffff
      : false;
  const isNat64 = h0 === 0x0064 && h1 === 0xff9b;

  if (isV4Mapped || isNat64) {
    const embedded = `${hextets[6] >> 8}.${hextets[6] & 0xff}.${
      hextets[7] >> 8
    }.${hextets[7] & 0xff}`;

    return isBlockedAddress(embedded);
  }

  if (hextets.every((hextet) => hextet === 0)) return true; // ::
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1)
    return true; // ::1
  if ((h0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((h0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (h0 === 0x2001 && h1 === 0x0db8) return true; // documentation

  return false;
};

export type UrlSafety = { safe: true } | { safe: false; reason: string };

/**
 * Checks that every address a hostname resolves to is on the public internet.
 *
 * Every address, not just the first: a name that returns both a public and a
 * private address would otherwise pass the check and then be connected to on
 * whichever one the resolver felt like.
 *
 * This does not close DNS rebinding. yt-dlp resolves the name again itself, and
 * a name whose answer changes between our lookup and theirs still wins. Pinning
 * the resolved address would need yt-dlp to accept one, which it does not;
 * the sandbox is what limits the damage if it happens.
 * @param hostname The host to check, without brackets
 * @returns Whether it is safe to fetch, and why not if it is not
 */
export const checkHostSafety = async (hostname: string): Promise<UrlSafety> => {
  const host = hostname.replace(/^\[|\]$/g, "");

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return { safe: false, reason: "I couldn't resolve that hostname." };
  }

  if (!addresses.length) {
    return { safe: false, reason: "I couldn't resolve that hostname." };
  }

  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      return {
        safe: false,
        reason:
          "That address is on a private or local network, and I only fetch from the public internet.",
      };
    }
  }

  return { safe: true };
};
