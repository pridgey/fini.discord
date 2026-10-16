/**
 * Whether an address is on a private network. Kept apart from the card
 * manager's server, which pulls the whole card manager in with it.
 */

/** Loopback, the private IPv4 ranges, Tailscale's, and their IPv6 kin. */
export const isPrivateAddress = (address: string): boolean => {
  const ip = address.replace(/^::ffff:/i, "").toLowerCase();
  if (ip === "::1") return true;
  if (ip.includes(":")) return /^(fc|fd|fe[89ab])/.test(ip);
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    // Tailscale hands out 100.64.0.0/10.
    (a === 100 && b >= 64 && b <= 127)
  );
};
