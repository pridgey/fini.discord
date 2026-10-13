/**
 * Makes a sign-in link for the site running against a local mailbox.
 *
 *   bun --env-file=.env run scripts/finicards_v2_web_dev_login.ts [discord id]
 *
 * A local mailbox has no Discord application to sign in through, so this
 * stands in for it: it makes a user tied to the Discord id (yours, from
 * ADMIN_ID, unless one is given) and prints a link that signs in as them.
 * The site only accepts such a link in development - `bun run dev` - and the
 * script refuses to touch a mailbox that is not on this machine.
 */
import { remote, remoteUrl, signIn, webSyncEnabled } from "../modules/finicardsV2/webSync";

const discordId = process.argv[2] ?? process.env.ADMIN_ID ?? "";
const site = process.env.FINI_WEB_DEV_SITE ?? "http://127.0.0.1:5199";

if (!webSyncEnabled() || !discordId) {
  console.error("Set the FINI_WEB_POCKETBASE_* settings, and pass a Discord id or set ADMIN_ID.");
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(remoteUrl())) {
  console.error(`Refusing: ${remoteUrl()} is not a local mailbox.`);
  process.exit(1);
}

await signIn();
const users = remote.collection("users");
const links = await remote.collection("_externalAuths").getFullList({
  filter: remote.filter("provider = 'discord' && providerId = {:id}", { id: discordId }),
});

let userId = links[0]?.recordRef as string | undefined;
if (!userId) {
  const password = crypto.randomUUID();
  const user = await users.create({ name: "Local player", password, passwordConfirm: password });
  await remote.collection("_externalAuths").create({
    collectionRef: user.collectionId,
    recordRef: user.id,
    provider: "discord",
    providerId: discordId,
  });
  userId = user.id;
}

const session = await users.impersonate(userId, 60 * 60 * 24);
console.log(`${site}/?token=${session.authStore.token}`);
