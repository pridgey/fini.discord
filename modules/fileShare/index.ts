/**
 * Serving big files as links when Discord will not take them as attachments.
 *
 *   fileShare   - the token store, publishing, and expiry
 *   shareServer - the loopback http server Tailscale Funnel proxies to
 *
 * Off unless `FINI_SHARE_BASE_URL` is set. See `README.md` for the Funnel side.
 */

export * from "./fileShare";
export * from "./shareServer";
