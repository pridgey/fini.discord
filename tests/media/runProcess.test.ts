import { describe, expect, it } from "bun:test";
import { ProcessError, runProcess } from "../../modules/media/runProcess";

/**
 * Covers the stdin option specifically.
 *
 * Everything else here is exercised through the commands that use it, but
 * stdin is the one input that changes how the child is spawned - and the
 * default has to stay closed, because ffmpeg blocks forever on its own
 * overwrite prompt if it finds a readable stdin.
 */

describe("stdin", () => {
  it("writes the text and closes, so a command reading to EOF finishes", async () => {
    const { stdout } = await runProcess("cat", [], {
      timeoutMs: 5_000,
      stdin: "the prompt",
    });

    expect(stdout).toBe("the prompt");
  });

  it("leaves stdin closed when none was given", async () => {
    // `cat` with no argument reads stdin, so it would hang here if stdin were
    // an inherited terminal rather than closed. Finishing empty is the point.
    const { stdout } = await runProcess("cat", [], { timeoutMs: 5_000 });

    expect(stdout).toBe("");
  });

  it("passes text through without a shell reading it", async () => {
    const hostile = "$(touch /tmp/fini-should-not-exist) `whoami` && rm -rf /";

    const { stdout } = await runProcess("cat", [], {
      timeoutMs: 5_000,
      stdin: hostile,
    });

    expect(stdout).toBe(hostile);
  });

  it("reports the command's own failure rather than a broken pipe", async () => {
    // `false` exits without reading stdin, so the write hits EPIPE. The useful
    // error is the exit code, not the plumbing.
    const failure = runProcess("false", [], {
      timeoutMs: 5_000,
      stdin: "unread",
    });

    await expect(failure).rejects.toBeInstanceOf(ProcessError);
    await expect(failure).rejects.toMatchObject({ code: 1 });
  });
});
