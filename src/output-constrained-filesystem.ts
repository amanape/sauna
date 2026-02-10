// OutputConstrainedFilesystem — wraps a WorkspaceFilesystem to restrict write
// operations to a specific output directory while allowing reads everywhere.
// Traces to: specs/agent-framework-and-workspace.md, specs/discovery-agent.md

import { normalize, posix } from "node:path";
import type {
  WorkspaceFilesystem,
  FileContent,
  FileStat,
  FileEntry,
  ReadOptions,
  WriteOptions,
  ListOptions,
  RemoveOptions,
  CopyOptions,
} from "@mastra/core/workspace";

export class OutputConstrainedFilesystem implements WorkspaceFilesystem {
  private readonly inner: WorkspaceFilesystem;
  private readonly outputPrefix: string;

  constructor(inner: WorkspaceFilesystem, outputDir: string) {
    this.inner = inner;
    // Normalize to a clean prefix like "output/" for startsWith checks
    const normalized = posix.normalize(outputDir.replace(/^\//, ""));
    this.outputPrefix = normalized.endsWith("/") ? normalized : normalized + "/";
  }

  // --- Identity (delegated) ---

  get id() { return this.inner.id; }
  get name() { return this.inner.name; }
  get provider() { return this.inner.provider; }
  get readOnly() { return this.inner.readOnly; }
  get basePath() { return this.inner.basePath; }
  get status() { return this.inner.status; }
  set status(v) { this.inner.status = v; }

  // --- Lifecycle (delegated) ---

  init() { return this.inner.init?.(); }
  start() { return this.inner.start?.(); }
  stop() { return this.inner.stop?.(); }
  destroy() { return this.inner.destroy?.(); }
  isReady() { return this.inner.isReady?.() ?? true; }
  getInfo() { return this.inner.getInfo!(); }
  getInstructions() { return this.inner.getInstructions?.() ?? ""; }

  // --- Read operations (unrestricted) ---

  readFile(path: string, options?: ReadOptions) {
    return this.inner.readFile(path, options);
  }

  readdir(path: string, options?: ListOptions) {
    return this.inner.readdir(path, options);
  }

  exists(path: string) {
    return this.inner.exists(path);
  }

  stat(path: string) {
    return this.inner.stat(path);
  }

  // --- Write operations (constrained to output directory) ---

  async writeFile(path: string, content: FileContent, options?: WriteOptions) {
    this.assertWithinOutput(path);
    return this.inner.writeFile(path, content, options);
  }

  async appendFile(path: string, content: FileContent) {
    this.assertWithinOutput(path);
    return this.inner.appendFile(path, content);
  }

  async deleteFile(path: string, options?: RemoveOptions) {
    this.assertWithinOutput(path);
    return this.inner.deleteFile(path, options);
  }

  async mkdir(path: string, options?: { recursive?: boolean }) {
    this.assertWithinOutput(path);
    return this.inner.mkdir(path, options);
  }

  async rmdir(path: string, options?: RemoveOptions) {
    this.assertWithinOutput(path);
    return this.inner.rmdir(path, options);
  }

  async copyFile(src: string, dest: string, options?: CopyOptions) {
    this.assertWithinOutput(dest);
    return this.inner.copyFile(src, dest, options);
  }

  async moveFile(src: string, dest: string, options?: CopyOptions) {
    this.assertWithinOutput(dest);
    return this.inner.moveFile(src, dest, options);
  }

  // --- Path validation ---

  private assertWithinOutput(path: string): void {
    const normalized = posix.normalize(path.replace(/^\//, ""));
    const withTrailing = normalized + "/";
    if (!withTrailing.startsWith(this.outputPrefix)) {
      throw new Error(
        `Write operation blocked: "${path}" is outside the allowed output directory "${this.outputPrefix.slice(0, -1)}"`,
      );
    }
  }
}
