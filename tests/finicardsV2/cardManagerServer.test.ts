import { describe, expect, test } from "bun:test";
import { isPrivateAddress } from "../../modules/finicardsV2/privateAddress";

describe("card manager: who may reach it", () => {
  test("the house, the tailnet and this machine", () => {
    for (const address of [
      "127.0.0.1",
      "::1",
      "192.168.1.13",
      "::ffff:192.168.1.20",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "100.112.132.31",
      "fd7a:115c:a1e0::1",
      "fe80::1",
    ]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
  });

  test("nobody else", () => {
    for (const address of [
      "8.8.8.8",
      "172.32.0.1",
      "172.15.0.1",
      "100.63.0.1",
      "100.128.0.1",
      "192.169.1.1",
      "::ffff:203.0.113.9",
      "2001:4860:4860::8888",
      "",
      "not an address",
      "999.1.1.1",
    ]) {
      expect(isPrivateAddress(address)).toBe(false);
    }
  });
});
