export interface HookSuccess {
  ok: true;
  output: string;
}

export interface HookFailure {
  ok: false;
  failedCommand: string;
  exitCode: number;
  output: string;
}

export type HookResult = HookSuccess | HookFailure;

export async function runHooks(
  hooks: string[],
  cwd: string,
): Promise<HookResult> {
  let combinedOutput = "";

  for (const command of hooks) {
    const proc = Bun.spawn(["sh", "-c", command], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;
    const output = stdout + stderr;
    combinedOutput += output;

    if (exitCode !== 0) {
      return {
        ok: false,
        failedCommand: command,
        exitCode,
        output: combinedOutput,
      };
    }
  }

  return { ok: true, output: combinedOutput };
}
