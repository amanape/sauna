#!/usr/bin/env bun
/**
 * Multi-Agent Workflow with Codex SDK and Agents SDK
 *
 * This example shows how to use Codex as an MCP server
 * and coordinate multiple specialized agents.
 */

import { Codex } from "@openai/codex-sdk";
import { Agent } from "@openai/agents-sdk";
import { spawn } from "child_process";

// Start Codex as MCP server
async function startCodexMCPServer(): Promise<{
  url: string;
  cleanup: () => void;
}> {
  console.log("Starting Codex MCP server...");

  const codexProcess = spawn("codex", ["mcp-server"], {
    env: {
      ...process.env,
      CODEX_MCP_PORT: "8080"
    }
  });

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    url: "http://localhost:8080",
    cleanup: () => codexProcess.kill()
  };
}

// Example: Multi-agent code review pipeline
class MultiAgentReviewPipeline {
  private pmAgent: Agent;
  private securityAgent: Agent;
  private performanceAgent: Agent;
  private architectAgent: Agent;

  constructor(private codexUrl: string) {
    // Initialize specialized agents
    this.pmAgent = new Agent({
      name: "PM-Agent",
      systemPrompt: "You are a product manager reviewing code for feature completeness.",
      tools: [{
        type: "mcp",
        url: codexUrl,
        tools: ["codex", "codex-reply"]
      }]
    });

    this.securityAgent = new Agent({
      name: "Security-Agent",
      systemPrompt: "You are a security expert reviewing code for vulnerabilities.",
      tools: [{
        type: "mcp",
        url: codexUrl,
        tools: ["codex", "codex-reply"]
      }]
    });

    this.performanceAgent = new Agent({
      name: "Performance-Agent",
      systemPrompt: "You are a performance engineer optimizing code efficiency.",
      tools: [{
        type: "mcp",
        url: codexUrl,
        tools: ["codex", "codex-reply"]
      }]
    });

    this.architectAgent = new Agent({
      name: "Architect-Agent",
      systemPrompt: "You are a software architect reviewing design patterns.",
      tools: [{
        type: "mcp",
        url: codexUrl,
        tools: ["codex", "codex-reply"]
      }]
    });
  }

  async reviewPullRequest(
    prUrl: string
  ): Promise<ComprehensiveReview> {
    console.log(`\n🔍 Starting multi-agent review of ${prUrl}\n`);

    // Phase 1: Parallel specialized reviews
    console.log("Phase 1: Specialized reviews...");
    const [
      featureReview,
      securityReview,
      performanceReview,
      architectureReview
    ] = await Promise.all([
      this.getFeatureReview(prUrl),
      this.getSecurityReview(prUrl),
      this.getPerformanceReview(prUrl),
      this.getArchitectureReview(prUrl)
    ]);

    // Phase 2: Synthesize reviews
    console.log("\nPhase 2: Synthesizing reviews...");
    const synthesis = await this.synthesizeReviews({
      featureReview,
      securityReview,
      performanceReview,
      architectureReview
    });

    // Phase 3: Generate action items
    console.log("\nPhase 3: Generating action items...");
    const actionItems = await this.generateActionItems(synthesis);

    return {
      featureReview,
      securityReview,
      performanceReview,
      architectureReview,
      synthesis,
      actionItems
    };
  }

  private async getFeatureReview(prUrl: string): Promise<FeatureReview> {
    const result = await this.pmAgent.run(
      `Use codex to analyze the PR at ${prUrl} for:
      - Feature completeness
      - User experience impact
      - Documentation coverage
      Return structured output with findings.`
    );

    return JSON.parse(result);
  }

  private async getSecurityReview(prUrl: string): Promise<SecurityReview> {
    const result = await this.securityAgent.run(
      `Use codex to perform security analysis on ${prUrl}:
      - Check for OWASP top 10 vulnerabilities
      - Review authentication/authorization
      - Identify sensitive data handling
      - Check for injection vulnerabilities
      Return structured findings with severity levels.`
    );

    return JSON.parse(result);
  }

  private async getPerformanceReview(
    prUrl: string
  ): Promise<PerformanceReview> {
    const result = await this.performanceAgent.run(
      `Use codex to analyze performance aspects of ${prUrl}:
      - Algorithm complexity
      - Database query efficiency
      - Memory usage patterns
      - Potential bottlenecks
      Return metrics and optimization suggestions.`
    );

    return JSON.parse(result);
  }

  private async getArchitectureReview(
    prUrl: string
  ): Promise<ArchitectureReview> {
    const result = await this.architectAgent.run(
      `Use codex to review architectural aspects of ${prUrl}:
      - Design pattern adherence
      - SOLID principles
      - Code modularity
      - Dependency management
      Return architectural assessment.`
    );

    return JSON.parse(result);
  }

  private async synthesizeReviews(
    reviews: SpecializedReviews
  ): Promise<Synthesis> {
    // Create a synthesis agent for this specific task
    const synthesisAgent = new Agent({
      name: "Synthesis-Agent",
      systemPrompt: `You synthesize multiple code reviews into actionable insights.
      You have access to Codex for additional analysis if needed.`,
      tools: [{
        type: "mcp",
        url: this.codexUrl,
        tools: ["codex"]
      }]
    });

    const result = await synthesisAgent.run(
      `Synthesize these specialized reviews into a coherent summary:
      ${JSON.stringify(reviews, null, 2)}

      Identify:
      1. Critical issues that need immediate attention
      2. Conflicts between different review perspectives
      3. Overall code quality assessment
      4. Recommended merge decision`
    );

    return JSON.parse(result);
  }

  private async generateActionItems(
    synthesis: Synthesis
  ): Promise<ActionItem[]> {
    const actionAgent = new Agent({
      name: "Action-Agent",
      systemPrompt: "You convert review findings into concrete action items.",
      tools: [{
        type: "mcp",
        url: this.codexUrl,
        tools: ["codex"]
      }]
    });

    const result = await actionAgent.run(
      `Based on this synthesis, generate specific action items:
      ${JSON.stringify(synthesis, null, 2)}

      For each action item include:
      - Title
      - Priority (critical/high/medium/low)
      - Assignee type (author/reviewer/team)
      - Estimated effort
      - Specific steps to complete`
    );

    return JSON.parse(result);
  }
}

// Example: Collaborative debugging session
async function collaborativeDebugging() {
  const { url: codexUrl, cleanup } = await startCodexMCPServer();

  try {
    // Create specialized debugging agents
    const agents = {
      tracer: new Agent({
        name: "Tracer",
        systemPrompt: "You trace code execution and identify flow issues.",
        tools: [{
          type: "mcp",
          url: codexUrl,
          tools: ["codex", "codex-reply"]
        }]
      }),

      analyzer: new Agent({
        name: "Analyzer",
        systemPrompt: "You analyze error patterns and root causes.",
        tools: [{
          type: "mcp",
          url: codexUrl,
          tools: ["codex", "codex-reply"]
        }]
      }),

      fixer: new Agent({
        name: "Fixer",
        systemPrompt: "You implement fixes for identified issues.",
        tools: [{
          type: "mcp",
          url: codexUrl,
          tools: ["codex", "codex-reply"]
        }]
      })
    };

    // Collaborative debugging workflow
    console.log("🐛 Starting collaborative debugging session\n");

    // Step 1: Trace the issue
    console.log("Step 1: Tracing execution flow...");
    const trace = await agents.tracer.run(
      `Use codex to trace the execution flow of the authentication
      module and identify where the login failure occurs.`
    );

    // Step 2: Analyze the root cause
    console.log("\nStep 2: Analyzing root cause...");
    const analysis = await agents.analyzer.run(
      `Based on this trace: ${trace}
      Use codex to analyze the root cause and identify all
      contributing factors to the authentication failure.`
    );

    // Step 3: Implement fix
    console.log("\nStep 3: Implementing fix...");
    const fix = await agents.fixer.run(
      `Based on this analysis: ${analysis}
      Use codex to implement a comprehensive fix that addresses
      all identified issues. Include tests.`
    );

    console.log("\n✅ Debugging session complete!");
    console.log("Fix implemented:", fix);

  } finally {
    cleanup();
  }
}

// Example: Automated refactoring pipeline
async function refactoringPipeline() {
  const codex = new Codex();

  // Run Codex directly for initial analysis
  const thread = codex.startThread();

  const analysisSchema = {
    type: "object",
    properties: {
      refactoringOpportunities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            location: { type: "string" },
            impact: { type: "string" },
            effort: { type: "number" }
          }
        }
      }
    }
  };

  console.log("🔧 Analyzing codebase for refactoring opportunities...\n");

  const analysis = await thread.run(
    "Analyze the codebase for refactoring opportunities",
    { outputSchema: analysisSchema }
  );

  // Now use agents for specialized refactoring
  const { url: codexUrl, cleanup } = await startCodexMCPServer();

  try {
    const refactoringAgent = new Agent({
      name: "Refactoring-Specialist",
      systemPrompt: `You are an expert at code refactoring.
      You apply specific refactoring patterns safely.`,
      tools: [{
        type: "mcp",
        url: codexUrl,
        tools: ["codex", "codex-reply"]
      }]
    });

    // Apply each refactoring
    for (const opportunity of analysis.refactoringOpportunities) {
      if (opportunity.impact === "high" && opportunity.effort < 5) {
        console.log(`Applying ${opportunity.type} refactoring...`);

        await refactoringAgent.run(
          `Use codex to apply ${opportunity.type} refactoring at
          ${opportunity.location}. Ensure all tests still pass.`
        );
      }
    }

  } finally {
    cleanup();
  }
}

// Type definitions
interface ComprehensiveReview {
  featureReview: FeatureReview;
  securityReview: SecurityReview;
  performanceReview: PerformanceReview;
  architectureReview: ArchitectureReview;
  synthesis: Synthesis;
  actionItems: ActionItem[];
}

interface FeatureReview {
  completeness: number;
  missingFeatures: string[];
  uxImpact: string;
  documentationCoverage: number;
}

interface SecurityReview {
  vulnerabilities: Array<{
    type: string;
    severity: "critical" | "high" | "medium" | "low";
    location: string;
    recommendation: string;
  }>;
  overallRisk: "high" | "medium" | "low";
}

interface PerformanceReview {
  bottlenecks: Array<{
    location: string;
    impact: string;
    suggestion: string;
  }>;
  complexityScore: number;
  estimatedImprovement: string;
}

interface ArchitectureReview {
  patterns: string[];
  violations: string[];
  modularityScore: number;
  suggestions: string[];
}

interface SpecializedReviews {
  featureReview: FeatureReview;
  securityReview: SecurityReview;
  performanceReview: PerformanceReview;
  architectureReview: ArchitectureReview;
}

interface Synthesis {
  criticalIssues: string[];
  conflicts: string[];
  overallQuality: number;
  mergeDecision: "approve" | "request_changes" | "needs_discussion";
  summary: string;
}

interface ActionItem {
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  assignee: "author" | "reviewer" | "team";
  estimatedEffort: string;
  steps: string[];
}

// Example runner
async function runExamples() {
  console.log("=== Multi-Agent Workflow Examples ===\n");

  // Example 1: Multi-agent review
  const { url, cleanup } = await startCodexMCPServer();
  try {
    const pipeline = new MultiAgentReviewPipeline(url);
    const review = await pipeline.reviewPullRequest(
      "https://github.com/example/repo/pull/123"
    );
    console.log("\nReview complete:", review);
  } finally {
    cleanup();
  }

  // Example 2: Collaborative debugging
  await collaborativeDebugging();

  // Example 3: Refactoring pipeline
  await refactoringPipeline();
}

if (import.meta.main) {
  runExamples().catch(console.error);
}

export {
  MultiAgentReviewPipeline,
  startCodexMCPServer
};