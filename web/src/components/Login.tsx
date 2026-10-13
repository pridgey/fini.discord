import { useState } from "react";
import { configured, signInWithDiscord } from "../lib/pb";
import { TypeIcon } from "./bits";

export const Login = ({ onSignedIn }: { onSignedIn: () => void }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signIn = async () => {
    setBusy(true);
    setError("");
    try {
      await signInWithDiscord();
      onSignedIn();
    } catch {
      setError("Sign-in did not finish. Allow the pop-up window and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="login-fan" aria-hidden="true">
        <span data-type="power">
          <TypeIcon type="power" size={54} />
        </span>
        <span data-type="heart">
          <TypeIcon type="heart" size={54} />
        </span>
        <span data-type="wit">
          <TypeIcon type="wit" size={54} />
        </span>
      </div>
      <p className="eyebrow">Fini's card game</p>
      <h1 className="wordmark">Finicards</h1>
      <p className="login-lede">Browse your collection and build decks, away from the scroll of a Discord channel.</p>
      {configured ? (
        <button type="button" className="button discord" disabled={busy} onClick={signIn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5a18 18 0 0 0-6.4 0L8.6 3a19.700 19.700 0 0 0-4.900 1.400C.6 9 0 13.500.2 17.900a19.900 19.900 0 0 0 6 3l.8-1.300a12.800 12.800 0 0 1-2-1l.5-.4a14.200 14.200 0 0 0 13 0l.5.4-2 1 .8 1.300a19.800 19.800 0 0 0 6-3c.4-5.100-.8-9.500-3.500-13.500ZM8.500 15.300c-1.200 0-2.100-1.100-2.100-2.400s.9-2.400 2.100-2.400 2.200 1.100 2.100 2.400c0 1.300-.9 2.400-2.100 2.400Zm7 0c-1.200 0-2.100-1.100-2.100-2.400s.9-2.400 2.100-2.400 2.200 1.100 2.100 2.400c0 1.300-.9 2.400-2.100 2.400Z" />
          </svg>
          {busy ? "Waiting for Discord…" : "Sign in with Discord"}
        </button>
      ) : (
        <p className="hint">This build has no mailbox address. Set VITE_POCKETBASE_URL and rebuild.</p>
      )}
      {error && <p className="hint error">{error}</p>}
      <p className="login-foot">Packs, selling and battles stay in Discord. Nothing here spends Finicoin.</p>
    </main>
  );
};
