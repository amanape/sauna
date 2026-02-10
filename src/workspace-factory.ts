import { Workspace, LocalFilesystem, LocalSandbox } from "@mastra/core/workspace";
import { OutputConstrainedFilesystem } from "./output-constrained-filesystem";

export interface WorkspaceOptions {
  skillsPaths?: string[];
  outputDir?: string;
}

export function createWorkspace(codebasePath: string, options?: WorkspaceOptions): Workspace {
  const baseFs = new LocalFilesystem({
    basePath: codebasePath,
    contained: true,
  });
  const filesystem = options?.outputDir
    ? new OutputConstrainedFilesystem(baseFs, options.outputDir)
    : baseFs;

  return new Workspace({
    filesystem,
    sandbox: new LocalSandbox({
      workingDirectory: codebasePath,
    }),
    ...(options?.skillsPaths ? { skills: options.skillsPaths } : {}),
  });
}
