#!/usr/bin/env bun
/**
 * Automated Code Review with Codex SDK
 *
 * This example demonstrates how to build an automated code review system
 * using the OpenAI Codex SDK with structured output and error handling.
 */

import { Codex } from "@openai/codex-sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

// Define review schema using Zod for type safety
const ReviewSchema = z.object({
  summary: z.string().describe("Brief summary of the code quality"),

  issues: z
    .array(
      z.object({
        file: z.string(),
        line: z.number().positive(),
        column: z.number().optional(),
        severity: z.enum(["error", "warning", "info"]),
        category: z.enum([
          "bug",
          "security",
          "performance",
          "style",
          "maintainability",
          "best-practice",
        ]),
        message: z.string(),
        suggestion: z.string().optional(),
        codeSnippet: z.string().optional(),
      }),
    )
    .describe("List of issues found"),

  metrics: z
    .object({
      complexity: z.number().min(0).max(100).describe("Code complexity score"),
      maintainability: z
        .number()
        .min(0)
        .max(100)
        .describe("Maintainability index"),
      testability: z
        .number()
        .min(0)
        .max(100)
        .describe("How testable the code is"),
      security: z.number().min(0).max(100).describe("Security score"),
    })
    .describe("Quality metrics"),

  suggestions: z.array(z.string()).describe("General improvement suggestions"),

  verdict: z
    .enum([
      "approve",
      "approve_with_suggestions",
      "request_changes",
      "needs_major_refactor",
    ])
    .describe("Overall review verdict"),
});

type Review = z.infer<typeof ReviewSchema>;

class CodeReviewer {
  private codex: Codex;
  private thread: any;

  constructor() {
    this.codex = new Codex();
    this.thread = this.codex.startThread({
      model: "gpt-5.3-codex",
      reasoning_effort: "high",
    });
  }

  /**
   * Review a single file
   */
  async reviewFile(filePath: string): Promise<Review> {
    const content = await readFile(filePath, "utf-8");
    const extension = filePath.split(".").pop() || "unknown";

    const prompt = `
Review this ${extension} file for:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Code style and best practices
- Maintainability concerns

File: ${filePath}
Content:
\`\`\`${extension}
${content}
\`\`\`
`;

    return await this.thread.run(prompt, {
      outputSchema: zodToJsonSchema(ReviewSchema, { target: "openAi" }),
    });
  }

  /**
   * Review multiple files in a project
   */
  async reviewProject(files: string[]): Promise<{
    fileReviews: Map<string, Review>;
    projectSummary: ProjectSummary;
  }> {
    const fileReviews = new Map<string, Review>();

    // Review each file
    for (const file of files) {
      try {
        console.log(`Reviewing ${file}...`);
        const review = await this.reviewFile(file);
        fileReviews.set(file, review);
      } catch (error) {
        console.error(`Error reviewing ${file}:`, error);
      }
    }

    // Generate project summary
    const projectSummary = await this.generateProjectSummary(fileReviews);

    return { fileReviews, projectSummary };
  }

  /**
   * Generate summary across all reviewed files
   */
  private async generateProjectSummary(
    reviews: Map<string, Review>,
  ): Promise<ProjectSummary> {
    const allIssues = Array.from(reviews.values()).flatMap((r) => r.issues);

    const ProjectSummarySchema = z.object({
      totalFiles: z.number(),
      totalIssues: z.number(),
      criticalIssues: z.number(),
      issuesByCategory: z.record(z.number()),
      overallHealth: z.number().min(0).max(100),
      topPriorities: z.array(z.string()).max(5),
      verdict: z.enum(["ready", "needs_work", "requires_refactor"]),
    });

    const summaryPrompt = `
Based on these code reviews, provide a project-level summary:

${JSON.stringify(Array.from(reviews.entries()), null, 2)}
`;

    return await this.thread.run(summaryPrompt, {
      outputSchema: zodToJsonSchema(ProjectSummarySchema, {
        target: "openAi",
      }),
    });
  }

  /**
   * Generate a markdown report
   */
  async generateReport(
    reviews: Map<string, Review>,
    summary: ProjectSummary,
  ): Promise<string> {
    let report = `# Code Review Report

Generated: ${new Date().toISOString()}

## Summary

- **Files Reviewed**: ${summary.totalFiles}
- **Total Issues**: ${summary.totalIssues}
- **Critical Issues**: ${summary.criticalIssues}
- **Overall Health**: ${summary.overallHealth}/100
- **Verdict**: ${summary.verdict}

## Top Priorities

${summary.topPriorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## Issues by Category

${Object.entries(summary.issuesByCategory)
  .map(([cat, count]) => `- **${cat}**: ${count}`)
  .join("\n")}

---

## File Reviews
`;

    for (const [file, review] of reviews) {
      report += `
### ${file}

**Verdict**: ${review.verdict}
**Summary**: ${review.summary}

#### Metrics
- Complexity: ${review.metrics.complexity}/100
- Maintainability: ${review.metrics.maintainability}/100
- Testability: ${review.metrics.testability}/100
- Security: ${review.metrics.security}/100

#### Issues (${review.issues.length})
`;

      if (review.issues.length > 0) {
        report += review.issues
          .map(
            (issue) => `
**[${issue.severity.toUpperCase()}]** Line ${issue.line}: ${issue.message}
- Category: ${issue.category}
${issue.suggestion ? `- Suggestion: ${issue.suggestion}` : ""}
${issue.codeSnippet ? `\`\`\`\n${issue.codeSnippet}\n\`\`\`` : ""}
`,
          )
          .join("\n");
      }

      if (review.suggestions.length > 0) {
        report += `
#### Suggestions
${review.suggestions.map((s) => `- ${s}`).join("\n")}
`;
      }

      report += "\n---\n";
    }

    return report;
  }

  /**
   * Export reviews to various formats
   */
  async exportResults(
    reviews: Map<string, Review>,
    summary: ProjectSummary,
    outputDir: string,
  ) {
    // Markdown report
    const mdReport = await this.generateReport(reviews, summary);
    await writeFile(join(outputDir, "code-review.md"), mdReport);

    // JSON export
    await writeFile(
      join(outputDir, "code-review.json"),
      JSON.stringify(
        {
          summary,
          reviews: Object.fromEntries(reviews),
        },
        null,
        2,
      ),
    );

    // GitHub-compatible annotations
    const annotations = this.generateGitHubAnnotations(reviews);
    await writeFile(
      join(outputDir, "github-annotations.json"),
      JSON.stringify(annotations, null, 2),
    );
  }

  /**
   * Generate GitHub Actions compatible annotations
   */
  private generateGitHubAnnotations(reviews: Map<string, Review>) {
    const annotations = [];

    for (const [file, review] of reviews) {
      for (const issue of review.issues) {
        annotations.push({
          path: file,
          start_line: issue.line,
          end_line: issue.line,
          start_column: issue.column,
          end_column: issue.column,
          annotation_level: this.mapSeverityToGitHub(issue.severity),
          message: issue.message,
          title: issue.category,
          raw_details: issue.suggestion,
        });
      }
    }

    return annotations;
  }

  private mapSeverityToGitHub(
    severity: "error" | "warning" | "info",
  ): "failure" | "warning" | "notice" {
    switch (severity) {
      case "error":
        return "failure";
      case "warning":
        return "warning";
      case "info":
        return "notice";
    }
  }
}

// Type definitions
interface ProjectSummary {
  totalFiles: number;
  totalIssues: number;
  criticalIssues: number;
  issuesByCategory: Record<string, number>;
  overallHealth: number;
  topPriorities: string[];
  verdict: "ready" | "needs_work" | "requires_refactor";
}

// Example usage
async function main() {
  const reviewer = new CodeReviewer();

  // Example 1: Review a single file
  console.log("Example 1: Single file review");
  const singleReview = await reviewer.reviewFile("./src/index.ts");
  console.log("Verdict:", singleReview.verdict);
  console.log("Issues found:", singleReview.issues.length);

  // Example 2: Review entire project
  console.log("\nExample 2: Project review");
  const files = [
    "./src/index.ts",
    "./src/utils/auth.ts",
    "./src/api/users.ts",
    "./src/db/connection.ts",
  ];

  const { fileReviews, projectSummary } = await reviewer.reviewProject(files);
  console.log("Project health:", projectSummary.overallHealth);
  console.log("Top priorities:", projectSummary.topPriorities);

  // Example 3: Generate reports
  console.log("\nExample 3: Generating reports");
  await reviewer.exportResults(fileReviews, projectSummary, "./review-output");
  console.log("Reports saved to ./review-output");
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}

export { CodeReviewer, ReviewSchema, type Review };
