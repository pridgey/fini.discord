import { readFile } from "fs/promises";
import { join } from "path";
import { MINECRAFT_SERVER_DIR } from "./minecraft.config";

const PROJECT_SLUG = "all-the-mons";

export const PACK_URL = `https://www.curseforge.com/minecraft/modpacks/${PROJECT_SLUG}`;
const PACK_FILES_URL = `${PACK_URL}/files/all?showAlphaFiles=show`;
// Public CurseForge mirror - no API key, unlike api.curseforge.com
const WIDGET_URL = `https://api.cfwidget.com/minecraft/modpacks/${PROJECT_SLUG}`;

// Better Compatibility Checker records the pack version, so replacing config/
// during an update keeps this honest without a hand-maintained version file
const BCC_CONFIG = join(MINECRAFT_SERVER_DIR, "config/bcc-common.toml");

const SUCCESS_CACHE_MS = 30 * 60 * 1000;
const FAILURE_CACHE_MS = 5 * 60 * 1000;

export type PackUpdate = {
  name: string;
  installed: string;
  latest: string;
  updateAvailable: boolean;
  releasedAt: string | null;
  filesUrl: string;
};

/** Splits "1.3.0" / "0.13.0-beta" into comparable parts */
const parseVersion = (version: string) => {
  const [core, ...suffix] = version.split("-");

  return {
    numbers: core.split(".").map((part) => Number.parseInt(part, 10) || 0),
    isPrerelease: suffix.length > 0,
  };
};

/** True when `candidate` is a genuine upgrade over `current` */
export const isNewerVersion = (candidate: string, current: string) => {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  const length = Math.max(a.numbers.length, b.numbers.length);

  for (let i = 0; i < length; i++) {
    const difference = (a.numbers[i] ?? 0) - (b.numbers[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }

  // Same numbers - a full release beats the beta of the same version
  return !a.isPrerelease && b.isPrerelease;
};

/** "All the Mons-1.3.0.zip" -> "1.3.0", "...-0.13.0-beta.zip" -> "0.13.0-beta" */
export const versionFromFileName = (fileName: string) =>
  fileName
    .replace(/\.zip$/i, "")
    .match(/(\d+(?:\.\d+)*(?:-[A-Za-z0-9.]+)?)$/)?.[1] ?? null;

export const getInstalledPack = async () => {
  try {
    const toml = await readFile(BCC_CONFIG, "utf8");
    const version = toml.match(/^\s*modpackVersion\s*=\s*"([^"]+)"/m)?.[1];
    const name = toml.match(/^\s*modpackName\s*=\s*"([^"]+)"/m)?.[1];

    return version ? { name: name || "Modpack", version } : null;
  } catch (error) {
    console.error("Could not read the installed modpack version:", error);
    return null;
  }
};

const getLatestRelease = async () => {
  const response = await fetch(WIDGET_URL, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`cfwidget returned ${response.status}`);
  }

  const body = (await response.json()) as {
    download?: { name?: string; uploaded_at?: string };
  };

  const fileName = body.download?.name;
  const version = fileName ? versionFromFileName(fileName) : null;

  return version
    ? { version, releasedAt: body.download?.uploaded_at ?? null }
    : null;
};

let cache: { until: number; value: PackUpdate | null } | null = null;

/**
 * Compares the installed pack against the latest CurseForge release. Returns
 * null when either side can't be determined - callers should treat that as
 * "no update to advertise" rather than as an error.
 */
export const checkForPackUpdate = async (): Promise<PackUpdate | null> => {
  if (cache && Date.now() < cache.until) return cache.value;

  let value: PackUpdate | null = null;

  try {
    const [installed, latest] = await Promise.all([
      getInstalledPack(),
      getLatestRelease(),
    ]);

    if (installed && latest) {
      value = {
        name: installed.name,
        installed: installed.version,
        latest: latest.version,
        updateAvailable: isNewerVersion(latest.version, installed.version),
        releasedAt: latest.releasedAt,
        filesUrl: PACK_FILES_URL,
      };
    }
  } catch (error) {
    console.error("Modpack update check failed:", error);
  }

  cache = {
    until: Date.now() + (value ? SUCCESS_CACHE_MS : FAILURE_CACHE_MS),
    value,
  };

  return value;
};
