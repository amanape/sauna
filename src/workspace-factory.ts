import { Workspace, LocalFilesystem, LocalSandbox } from "@mastra/core/workspace";

export interface WorkspaceOptions {
  skillsPaths?: string[];
}

export function createWorkspace(codebasePath: string, options?: WorkspaceOptions): Workspace {
  const filesystem = new LocalFilesystem({
    basePath: codebasePath,
    contained: true,
  });

  return new Workspace({
    filesystem,
    sandbox: new LocalSandbox({
      workingDirectory: codebasePath,
    }),
    ...(options?.skillsPaths ? { skills: options.skillsPaths } : {}),
  });
}
