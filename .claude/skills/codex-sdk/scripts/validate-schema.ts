#!/usr/bin/env bun
/**
 * Validate JSON Schema definitions for use with Codex SDK
 *
 * This script helps validate and test JSON schemas before
 * using them with the Codex SDK's structured output feature.
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import Ajv from "ajv";
import { readFile } from "fs/promises";

const ajv = new Ajv({ strict: true, allErrors: true });

/**
 * Validate a JSON Schema
 */
function validateSchema(schema: any): {
  valid: boolean;
  errors?: string[];
} {
  try {
    const validate = ajv.compile(schema);
    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * Test schema with sample data
 */
function testSchema(
  schema: any,
  testData: any
): {
  valid: boolean;
  errors?: string[];
} {
  const validate = ajv.compile(schema);
  const valid = validate(testData);

  if (!valid) {
    return {
      valid: false,
      errors: validate.errors?.map(e =>
        `${e.instancePath} ${e.message}`
      )
    };
  }

  return { valid: true };
}

/**
 * Convert Zod schema to JSON Schema
 */
function convertZodSchema(zodSchema: z.ZodSchema): any {
  return zodToJsonSchema(zodSchema, {
    target: "openAi",
    errorMessages: true
  });
}

/**
 * Analyze schema complexity
 */
function analyzeSchema(schema: any): {
  depth: number;
  propertyCount: number;
  hasRequired: boolean;
  hasEnums: boolean;
  hasPatterns: boolean;
  complexity: "simple" | "moderate" | "complex";
} {
  let depth = 0;
  let propertyCount = 0;
  let hasRequired = false;
  let hasEnums = false;
  let hasPatterns = false;

  function traverse(obj: any, currentDepth: number = 0) {
    depth = Math.max(depth, currentDepth);

    if (obj.properties) {
      propertyCount += Object.keys(obj.properties).length;
      for (const prop of Object.values(obj.properties)) {
        traverse(prop, currentDepth + 1);
      }
    }

    if (obj.required && obj.required.length > 0) {
      hasRequired = true;
    }

    if (obj.enum) {
      hasEnums = true;
    }

    if (obj.pattern) {
      hasPatterns = true;
    }

    if (obj.items) {
      traverse(obj.items, currentDepth + 1);
    }
  }

  traverse(schema);

  const complexity =
    depth > 5 || propertyCount > 20 ? "complex" :
    depth > 3 || propertyCount > 10 ? "moderate" :
    "simple";

  return {
    depth,
    propertyCount,
    hasRequired,
    hasEnums,
    hasPatterns,
    complexity
  };
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Codex SDK Schema Validator

Usage:
  bun validate-schema.ts <schema-file.json> [test-data.json]
  bun validate-schema.ts --zod <schema.ts>
  bun validate-schema.ts --example

Options:
  --zod         Convert and validate a Zod schema file
  --example     Show example schemas
`);
    process.exit(0);
  }

  if (args[0] === "--example") {
    showExamples();
    return;
  }

  if (args[0] === "--zod") {
    // TODO: Implement Zod file import and validation
    console.log("Zod file validation not yet implemented");
    return;
  }

  // Validate JSON Schema file
  const schemaFile = args[0];
  const testDataFile = args[1];

  try {
    const schemaContent = await readFile(schemaFile, "utf-8");
    const schema = JSON.parse(schemaContent);

    console.log(`\n📋 Validating schema: ${schemaFile}\n`);

    // Validate schema structure
    const validation = validateSchema(schema);
    if (!validation.valid) {
      console.error("❌ Schema validation failed:");
      validation.errors?.forEach(e => console.error(`   ${e}`));
      process.exit(1);
    }

    console.log("✅ Schema structure is valid");

    // Analyze complexity
    const analysis = analyzeSchema(schema);
    console.log("\n📊 Schema Analysis:");
    console.log(`   Depth: ${analysis.depth}`);
    console.log(`   Properties: ${analysis.propertyCount}`);
    console.log(`   Complexity: ${analysis.complexity}`);
    console.log(`   Features: ${[
      analysis.hasRequired && "required fields",
      analysis.hasEnums && "enums",
      analysis.hasPatterns && "patterns"
    ].filter(Boolean).join(", ") || "none"}`);

    // Test with sample data if provided
    if (testDataFile) {
      console.log(`\n🧪 Testing with: ${testDataFile}\n`);

      const testContent = await readFile(testDataFile, "utf-8");
      const testData = JSON.parse(testContent);

      const testResult = testSchema(schema, testData);
      if (!testResult.valid) {
        console.error("❌ Test data validation failed:");
        testResult.errors?.forEach(e => console.error(`   ${e}`));
        process.exit(1);
      }

      console.log("✅ Test data validates successfully");
    }

    // Generate example usage
    console.log("\n💡 Usage with Codex SDK:");
    console.log("```typescript");
    console.log(`const schema = ${JSON.stringify(schema, null, 2)};`);
    console.log("\nconst result = await thread.run(");
    console.log('  "Your prompt here",');
    console.log("  { outputSchema: schema }");
    console.log(");");
    console.log("```");

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

function showExamples() {
  console.log(`
📚 Example Schemas for Codex SDK

1️⃣ Simple Review Schema:
${JSON.stringify({
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["approve", "request_changes", "comment"]
    },
    summary: {
      type: "string",
      description: "Brief summary of the review"
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["error", "warning", "info"] },
          message: { type: "string" }
        },
        required: ["severity", "message"]
      }
    }
  },
  required: ["verdict", "summary", "issues"]
}, null, 2)}

2️⃣ Complex Analysis Schema:
${JSON.stringify({
  type: "object",
  properties: {
    analysis: {
      type: "object",
      properties: {
        complexity: {
          type: "object",
          properties: {
            cyclomatic: { type: "number", minimum: 0 },
            cognitive: { type: "number", minimum: 0 },
            loc: { type: "integer", minimum: 0 }
          }
        },
        dependencies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
              isDevDependency: { type: "boolean" }
            }
          }
        }
      }
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["refactor", "update", "security", "performance"]
          },
          priority: {
            type: "integer",
            minimum: 1,
            maximum: 5
          },
          description: { type: "string" },
          estimatedEffort: {
            type: "string",
            enum: ["minutes", "hours", "days", "weeks"]
          }
        },
        required: ["type", "priority", "description"]
      }
    }
  }
}, null, 2)}

3️⃣ Using with Zod (TypeScript):
\`\`\`typescript
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const ReviewSchema = z.object({
  verdict: z.enum(["approve", "request_changes"]),
  confidence: z.number().min(0).max(1),
  findings: z.array(z.object({
    file: z.string(),
    line: z.number().positive(),
    issue: z.string()
  }))
});

// Convert for Codex SDK
const jsonSchema = zodToJsonSchema(ReviewSchema, { target: "openAi" });

// Use with type safety
type Review = z.infer<typeof ReviewSchema>;
const result: Review = await thread.run("Review code", {
  outputSchema: jsonSchema
});
\`\`\`
`);
}

// Run CLI
if (import.meta.main) {
  main().catch(console.error);
}