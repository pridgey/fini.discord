import { afterEach, describe, expect, it } from "bun:test";
import { realpathSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import {
  applySandbox,
  isSandboxAvailable,
  sandboxPrefix,
} from "../../modules/media/sandbox";
import { runProcess } from "../../modules/media/runProcess";

/**
 * ffmpeg and yt-dlp parse hostile input as their whole job, and they run as
 * the bot's own user - the one that can read `.env`, `pb_data` and `~/.ssh`.
 * These check the confinement actually confines, rather than that the flags
 * were spelled correctly.
 */

const WORK_DIR = "/tmp/job-dir";

describe("sandboxPrefix", () => {
  it("binds exactly one writable directory", () => {
    const prefix = sandboxPrefix({ workDir: WORK_DIR, network: false });
    const bindAt = prefix.indexOf("--bind");

    // One --bind, and it is the job's own workspace mapped to itself.
    expect(prefix.filter((arg) => arg === "--bind")).toHaveLength(1);
    expect(prefix.slice(bindAt, bindAt + 3)).toEqual([
      "--bind",
      WORK_DIR,
      WORK_DIR,
    ]);
  });

  it("mounts the system read-only", () => {
    const prefix = sandboxPrefix({ workDir: WORK_DIR, network: false });

    expect(prefix).toContain("--ro-bind");
    expect(prefix.join(" ")).toContain("--ro-bind /usr /usr");
    expect(prefix.join(" ")).not.toContain("--bind /usr");
  });

  // ffmpeg follows urls embedded in containers it decodes - an HLS playlist in
  // a crafted upload is its own SSRF otherwise.
  it("denies the network unless it is asked for", () => {
    const offline = sandboxPrefix({ workDir: WORK_DIR, network: false });
    const online = sandboxPrefix({ workDir: WORK_DIR, network: true });

    expect(offline).toContain("--unshare-all");
    expect(offline).not.toContain("--share-net");
    expect(online).toContain("--share-net");
  });

  it("does not outlive the bot or keep the controlling terminal", () => {
    const prefix = sandboxPrefix({ workDir: WORK_DIR, network: false });

    expect(prefix).toContain("--die-with-parent");
    expect(prefix).toContain("--new-session");
  });

  it("ends with a separator so the command cannot be read as a flag", () => {
    expect(sandboxPrefix({ workDir: WORK_DIR, network: false }).at(-1)).toBe(
      "--",
    );
  });

  it("mounts extra paths read-only, not writable", () => {
    // qwen-tts needs its own install directory and gigabytes of model weights,
    // both under $HOME - which is otherwise absent. Read-only so a compromised
    // decoder cannot rewrite the weights the next invocation loads.
    const prefix = sandboxPrefix({
      workDir: WORK_DIR,
      network: false,
      readOnlyPaths: ["/opt/llama", "/srv/models"],
    });

    expect(prefix.join(" ")).toContain("--ro-bind /opt/llama /opt/llama");
    expect(prefix.join(" ")).toContain("--ro-bind /srv/models /srv/models");
    // Still exactly one writable mount: the workspace.
    expect(prefix.filter((arg) => arg === "--bind")).toHaveLength(1);
  });

  it("mounts extra paths after the tmpfs that would otherwise hide them", () => {
    // A path under /tmp bound before `--tmpfs /tmp` is shadowed by it, and
    // weights that vanish look like a model bug rather than a mount ordering
    // one.
    const prefix = sandboxPrefix({
      workDir: WORK_DIR,
      network: false,
      readOnlyPaths: ["/srv/models"],
    });

    expect(prefix.indexOf("/srv/models")).toBeGreaterThan(
      prefix.indexOf("--tmpfs"),
    );
  });

  it("adds nothing when no extra paths are asked for", () => {
    const withOut = sandboxPrefix({ workDir: WORK_DIR, network: false });
    const withEmpty = sandboxPrefix({
      workDir: WORK_DIR,
      network: false,
      readOnlyPaths: [],
    });

    expect(withEmpty).toEqual(withOut);
  });
});

describe("resolver config", () => {
  it("gives a networked job somewhere for /etc/resolv.conf to point", () => {
    // `--share-net` is enough to reach a nameserver but not to find out where
    // one is: on a systemd-resolved host /etc/resolv.conf is a symlink into
    // /run, which is not mounted, so every lookup fails with "Name or service
    // not known" and looks like the network being down.
    const real = realpathSync("/etc/resolv.conf");
    const prefix = sandboxPrefix({ workDir: WORK_DIR, network: true });

    if (dirname(real) === "/etc") {
      // A plain file is already covered by the /etc bind.
      expect(prefix.filter((arg) => arg === "/etc")).toHaveLength(2);
      return;
    }

    const at = prefix.indexOf(dirname(real));
    expect(at).toBeGreaterThan(-1);
    expect(prefix.slice(at - 1, at + 2)).toEqual([
      "--ro-bind",
      dirname(real),
      dirname(real),
    ]);
  });

  it("does not hand it to a job that asked for no network", () => {
    const real = realpathSync("/etc/resolv.conf");
    if (dirname(real) === "/etc") return;

    const prefix = sandboxPrefix({ workDir: WORK_DIR, network: false });

    expect(prefix).not.toContain(dirname(real));
  });

  it("mounts it after /etc, so it lands on top of the symlink", () => {
    const real = realpathSync("/etc/resolv.conf");
    if (dirname(real) === "/etc") return;

    const prefix = sandboxPrefix({ workDir: WORK_DIR, network: true });

    expect(prefix.indexOf(dirname(real))).toBeGreaterThan(
      prefix.indexOf("/etc"),
    );
  });
});

describe("applySandbox", () => {
  it("passes the command through untouched when not sandboxing", () => {
    expect(applySandbox("ffmpeg", ["-i", "x"], undefined)).toEqual({
      command: "ffmpeg",
      args: ["-i", "x"],
    });
  });

  it("wraps the command when sandboxing", () => {
    const wrapped = applySandbox("ffmpeg", ["-i", "x"], {
      workDir: WORK_DIR,
      network: false,
    });

    if (!isSandboxAvailable()) {
      expect(wrapped.command).toBe("ffmpeg");
      return;
    }

    expect(wrapped.command).toBe("bwrap");
    // Everything after the separator is the real command, untouched.
    expect(wrapped.args.slice(wrapped.args.indexOf("--") + 1)).toEqual([
      "ffmpeg",
      "-i",
      "x",
    ]);
  });
});

// Skipped where bubblewrap is unavailable rather than failing - the module
// degrades to running unwrapped there, and so should the suite.
describe.if(isSandboxAvailable())("the sandbox actually confines", () => {
  const dirs: string[] = [];

  const workspace = async () => {
    const dir = await mkdtemp(join(tmpdir(), "fini-sandbox-test-"));
    dirs.push(dir);
    return dir;
  };

  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("cannot see the home directory, so cannot read .env or ~/.ssh", async () => {
    const dir = await workspace();

    const { stdout } = await runProcess(
      "sh",
      ["-c", "ls /home 2>&1 || true; ls ~ 2>&1 || true"],
      { timeoutMs: 15_000, sandbox: { workDir: dir, network: false } },
    );

    expect(stdout).not.toContain("pridgey");
    expect(stdout).not.toContain(".ssh");
  });

  it("can write to its own workspace and nowhere else", async () => {
    const dir = await workspace();

    const { stdout } = await runProcess(
      "sh",
      [
        "-c",
        `echo ok > ${dir}/written && cat ${dir}/written; touch /usr/should-fail 2>&1 || echo "usr is read-only"`,
      ],
      { timeoutMs: 15_000, sandbox: { workDir: dir, network: false } },
    );

    expect(stdout).toContain("ok");
    expect(stdout).toContain("usr is read-only");
  });

  it("has no network at all when the network is denied", async () => {
    const dir = await workspace();

    const { stdout } = await runProcess(
      "sh",
      [
        "-c",
        'curl -s -m 4 -o /dev/null http://1.1.1.1/ 2>&1 && echo REACHED || echo "no network"',
      ],
      { timeoutMs: 20_000, sandbox: { workDir: dir, network: false } },
    );

    expect(stdout).toContain("no network");
    expect(stdout).not.toContain("REACHED");
  });

  it("still runs ffmpeg for real", async () => {
    const dir = await workspace();
    await writeFile(join(dir, "marker"), "");

    await runProcess(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=64x64:d=1",
        "-frames:v",
        "1",
        join(dir, "frame.png"),
      ],
      { timeoutMs: 30_000, sandbox: { workDir: dir, network: false } },
    );

    const { stdout } = await runProcess("ls", [dir], { timeoutMs: 5_000 });
    expect(stdout).toContain("frame.png");
  });

  it("makes an extra path readable but refuses writes to it", async () => {
    const dir = await workspace();
    const models = await workspace();
    await writeFile(join(models, "model.gguf"), "weights");

    const { stdout } = await runProcess(
      "sh",
      [
        "-c",
        `cat ${models}/model.gguf; echo; echo tampered > ${models}/model.gguf 2>&1 || echo "weights are read-only"`,
      ],
      {
        timeoutMs: 15_000,
        sandbox: { workDir: dir, network: false, readOnlyPaths: [models] },
      },
    );

    expect(stdout).toContain("weights");
    expect(stdout).toContain("weights are read-only");
    // And the file on the host is untouched.
    expect(await Bun.file(join(models, "model.gguf")).text()).toBe("weights");
  });

  it("still hides the home directory when an extra path is mounted", async () => {
    const dir = await workspace();
    const models = await workspace();

    // Widening the mounts for the weights must not widen them for anything
    // else - `.env` and `~/.ssh` stay out of reach.
    const { stdout } = await runProcess(
      "sh",
      ["-c", "ls /home 2>&1 || true; ls ~ 2>&1 || true"],
      {
        timeoutMs: 15_000,
        sandbox: { workDir: dir, network: false, readOnlyPaths: [models] },
      },
    );

    expect(stdout).not.toContain("pridgey");
    expect(stdout).not.toContain(".ssh");
  });
});
