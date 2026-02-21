#!/usr/bin/env bun
/**
 * Streaming Output with Codex SDK
 *
 * This example demonstrates real-time streaming capabilities
 * for long-running operations with progress updates.
 */

import { Codex } from "@openai/codex-sdk";

// Progress UI components
class ProgressTracker {
  private startTime = Date.now();
  private toolCalls = new Map<string, number>();
  private filesChanged: string[] = [];
  private currentPhase = "Initializing";

  updatePhase(phase: string) {
    this.currentPhase = phase;
    this.render();
  }

  recordToolCall(toolName: string) {
    const count = this.toolCalls.get(toolName) || 0;
    this.toolCalls.set(toolName, count + 1);
    this.render();
  }

  recordFileChange(path: string) {
    if (!this.filesChanged.includes(path)) {
      this.filesChanged.push(path);
    }
    this.render();
  }

  private render() {
    console.clear();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);

    console.log("╔══════════════════════════════════════╗");
    console.log("║       Codex Operation Progress       ║");
    console.log("╚══════════════════════════════════════╝");
    console.log();
    console.log(`⏱  Elapsed: ${elapsed}s`);
    console.log(`📍 Phase: ${this.currentPhase}`);
    console.log();

    if (this.toolCalls.size > 0) {
      console.log("🔧 Tool Usage:");
      for (const [tool, count] of this.toolCalls) {
        console.log(`   ${tool}: ${count}x`);
      }
      console.log();
    }

    if (this.filesChanged.length > 0) {
      console.log(`📝 Files Modified: ${this.filesChanged.length}`);
      this.filesChanged.slice(-5).forEach((file) => {
        console.log(`   ${file}`);
      });
      if (this.filesChanged.length > 5) {
        console.log(`   ... and ${this.filesChanged.length - 5} more`);
      }
      console.log();
    }
  }
}

// Main streaming example
async function streamingExample() {
  const codex = new Codex();
  const thread = codex.startThread({
    model: "gpt-5.3-codex",
    workingDirectory: process.cwd(),
  });

  const tracker = new ProgressTracker();

  console.log("Starting Codex streaming operation...\n");

  const { events, result } = await thread.runStreamed(
    "Analyze this codebase and create a comprehensive documentation structure",
    {
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          filesAnalyzed: { type: "number" },
          documentationCreated: {
            type: "array",
            items: { type: "string" },
          },
          recommendations: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  );

  // Process events in real-time
  let itemCount = 0;
  for await (const event of events) {
    switch (event.type) {
      case "item.completed":
        itemCount++;
        tracker.updatePhase(`Processing item ${itemCount}`);

        // Log specific content types
        if (event.item.summary) {
          console.log("\n📄 Summary received:");
          console.log(event.item.summary);
        }
        break;

      case "tool.call":
        tracker.recordToolCall(event.toolName);

        // Update phase based on tool
        if (event.toolName === "Search") {
          tracker.updatePhase("Searching codebase");
        } else if (event.toolName === "Read") {
          tracker.updatePhase("Analyzing files");
        } else if (event.toolName === "Write") {
          tracker.updatePhase("Creating documentation");
        }
        break;

      case "file.changed":
        tracker.recordFileChange(event.path);
        console.log(`\n✏️  ${event.operation}: ${event.path}`);
        break;

      case "error":
        console.error("\n❌ Error:", event.error.message);
        break;

      case "turn.completed":
        tracker.updatePhase("Completed");
        console.log("\n✅ Operation completed!");
        console.log(`Total tokens: ${event.usage.total_tokens}`);
        if (event.usage.reasoning_tokens) {
          console.log(`Reasoning tokens: ${event.usage.reasoning_tokens}`);
        }
        console.log(`Duration: ${event.duration}ms`);
        break;
    }
  }

  // Get final result
  const finalResult = await result;
  console.log("\n📊 Final Result:");
  console.log(JSON.stringify(finalResult, null, 2));

  return finalResult;
}

// Advanced streaming patterns
class StreamProcessor {
  /**
   * Buffer events and process in batches
   */
  static async processBatched<T>(
    events: AsyncIterable<any>,
    batchSize: number,
    processor: (batch: any[]) => Promise<T>,
  ): Promise<T[]> {
    const results: T[] = [];
    let batch: any[] = [];

    for await (const event of events) {
      batch.push(event);

      if (batch.length >= batchSize) {
        const result = await processor(batch);
        results.push(result);
        batch = [];
      }
    }

    // Process remaining
    if (batch.length > 0) {
      const result = await processor(batch);
      results.push(result);
    }

    return results;
  }

  /**
   * Filter events by type
   */
  static async *filterByType(events: AsyncIterable<any>, ...types: string[]) {
    for await (const event of events) {
      if (types.includes(event.type)) {
        yield event;
      }
    }
  }

  /**
   * Transform events
   */
  static async *transform<T, U>(
    events: AsyncIterable<T>,
    transformer: (event: T) => U | Promise<U>,
  ): AsyncIterable<U> {
    for await (const event of events) {
      yield await transformer(event);
    }
  }

  /**
   * Timeout wrapper
   */
  static async *withTimeout<T>(
    events: AsyncIterable<T>,
    timeoutMs: number,
  ): AsyncIterable<T> {
    const start = Date.now();

    for await (const event of events) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Stream timeout after ${timeoutMs}ms`);
      }
      yield event;
    }
  }
}

// Example: Real-time code migration
async function codeMigrationExample() {
  const codex = new Codex();
  const thread = codex.startThread();

  console.log("🔄 Starting code migration...\n");

  const { events } = await thread.runStreamed(
    "Migrate all JavaScript files to TypeScript with proper types",
    {
      outputSchema: {
        type: "object",
        properties: {
          migrated: {
            type: "array",
            items: {
              type: "object",
              properties: {
                original: { type: "string" },
                migrated: { type: "string" },
                types_added: { type: "number" },
              },
            },
          },
          summary: { type: "string" },
        },
      },
    },
  );

  // Track migration progress
  const migrations = new Map<string, MigrationStatus>();

  for await (const event of events) {
    if (event.type === "tool.call" && event.toolName === "Read") {
      const path = event.arguments.path;
      if (path.endsWith(".js")) {
        migrations.set(path, { status: "analyzing", startTime: Date.now() });
        console.log(`🔍 Analyzing: ${path}`);
      }
    }

    if (event.type === "file.changed" && event.operation === "create") {
      const jsPath = event.path.replace(".ts", ".js");
      if (migrations.has(jsPath)) {
        const migration = migrations.get(jsPath)!;
        migration.status = "completed";
        migration.endTime = Date.now();
        const duration = migration.endTime - migration.startTime;
        console.log(`✅ Migrated: ${jsPath} -> ${event.path} (${duration}ms)`);
      }
    }
  }

  // Summary
  console.log("\n📊 Migration Summary:");
  console.log(`Files processed: ${migrations.size}`);
  const completed = Array.from(migrations.values()).filter(
    (m) => m.status === "completed",
  ).length;
  console.log(`Successfully migrated: ${completed}`);
}

// Example: Progress bars for long operations
async function progressBarExample() {
  const codex = new Codex();
  const thread = codex.startThread();

  const progressBar = new ProgressBar(50);

  const { events } = await thread.runStreamed(
    "Analyze and optimize all images in the project",
  );

  let processed = 0;
  let total = 0;

  for await (const event of events) {
    if (event.type === "item.completed" && event.item.total_images) {
      total = event.item.total_images;
    }

    if (event.type === "file.changed") {
      processed++;
      if (total > 0) {
        progressBar.update(processed / total);
      }
    }
  }

  progressBar.complete();
}

// Helper: Progress bar
class ProgressBar {
  constructor(private width: number) {}

  update(progress: number) {
    const filled = Math.floor(progress * this.width);
    const empty = this.width - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    const percent = Math.floor(progress * 100);
    process.stdout.write(`\r[${bar}] ${percent}%`);
  }

  complete() {
    this.update(1);
    console.log(" ✓");
  }
}

// Type definitions
interface MigrationStatus {
  status: "analyzing" | "migrating" | "completed";
  startTime: number;
  endTime?: number;
}

// Example runner
async function runExamples() {
  console.log("=== Streaming Output Examples ===\n");

  console.log("1. Basic streaming with progress tracking");
  await streamingExample();

  console.log("\n2. Code migration with real-time updates");
  await codeMigrationExample();

  console.log("\n3. Progress bar example");
  await progressBarExample();
}

if (import.meta.main) {
  runExamples().catch(console.error);
}

export { StreamProcessor, ProgressTracker, ProgressBar };
