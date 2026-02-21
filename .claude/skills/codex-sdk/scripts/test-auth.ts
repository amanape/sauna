#!/usr/bin/env bun
/**
 * Test Codex SDK Authentication Setup
 *
 * This script helps verify that authentication is properly
 * configured for the Codex SDK.
 */

import { Codex } from "@openai/codex-sdk";
import { homedir } from "os";
import { join } from "path";
import { readFile, access } from "fs/promises";
import { constants } from "fs";

const AUTH_FILE = join(homedir(), ".codex", "auth.json");
const CONFIG_FILE = join(homedir(), ".codex", "config.toml");

/**
 * Check authentication status
 */
async function checkAuth(): Promise<{
  method: "api_key" | "chatgpt" | "none";
  valid: boolean;
  details: string;
}> {
  // Check environment variable
  if (process.env.OPENAI_API_KEY) {
    return {
      method: "api_key",
      valid: true,
      details: "API key found in environment variable",
    };
  }

  // Check auth.json file
  try {
    await access(AUTH_FILE, constants.R_OK);
    const authContent = await readFile(AUTH_FILE, "utf-8");
    const auth = JSON.parse(authContent);

    if (auth.access_token) {
      const expired =
        auth.expires_at && new Date(auth.expires_at * 1000) < new Date();

      return {
        method: "chatgpt",
        valid: !expired,
        details: expired
          ? "ChatGPT auth token expired"
          : "ChatGPT auth token found",
      };
    }
  } catch {
    // File doesn't exist or invalid
  }

  return {
    method: "none",
    valid: false,
    details: "No authentication configured",
  };
}

/**
 * Test basic Codex functionality
 */
async function testBasicFunctionality(): Promise<{
  success: boolean;
  error?: string;
  model?: string;
}> {
  try {
    const codex = new Codex();
    const thread = codex.startThread();

    const result = await thread.run("Return the number 42", {
      outputSchema: {
        type: "number",
      },
    });

    return {
      success: result === 42,
      model: thread.options.model,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check configuration
 */
async function checkConfig(): Promise<{
  exists: boolean;
  model?: string;
  settings?: Record<string, any>;
}> {
  try {
    await access(CONFIG_FILE, constants.R_OK);
    const configContent = await readFile(CONFIG_FILE, "utf-8");

    // Basic TOML parsing (simplified)
    const model = configContent.match(/model\s*=\s*"([^"]+)"/)?.[1];

    return {
      exists: true,
      model,
      settings: {
        hasCustomModel: !!model,
      },
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Interactive authentication setup
 */
async function setupAuth() {
  console.log("\n🔧 Authentication Setup\n");

  console.log("Choose authentication method:");
  console.log("1. API Key (OpenAI Platform)");
  console.log("2. ChatGPT Login (Browser)");
  console.log("3. Skip setup\n");

  const choice = prompt("Enter choice (1-3): ");

  switch (choice) {
    case "1":
      console.log("\n📝 API Key Setup:");
      console.log(
        "1. Get your API key from: https://platform.openai.com/api-keys",
      );
      console.log("2. Set the environment variable:");
      console.log("   export OPENAI_API_KEY='your-key-here'");
      console.log("\nOr add to your shell profile for persistence.");
      break;

    case "2":
      console.log("\n🌐 ChatGPT Login Setup:");
      console.log("Run: codex login");
      console.log("\nThis will open your browser for authentication.");
      break;

    case "3":
      console.log("\nSkipping setup. You can configure auth later.");
      break;

    default:
      console.log("\nInvalid choice.");
  }
}

// Main diagnostic function
async function main() {
  console.log("🔍 Codex SDK Authentication Test\n");

  // Check authentication
  console.log("1️⃣ Checking authentication...");
  const auth = await checkAuth();
  console.log(`   Method: ${auth.method || "none"}`);
  console.log(`   Status: ${auth.valid ? "✅" : "❌"} ${auth.details}`);

  // Check configuration
  console.log("\n2️⃣ Checking configuration...");
  const config = await checkConfig();
  console.log(`   Config file: ${config.exists ? "✅ Found" : "❌ Not found"}`);
  if (config.model) {
    console.log(`   Model: ${config.model}`);
  }

  // Test functionality
  if (auth.valid) {
    console.log("\n3️⃣ Testing Codex SDK...");
    const test = await testBasicFunctionality();
    if (test.success) {
      console.log(`   ✅ Connection successful`);
      console.log(`   Model: ${test.model}`);
    } else {
      console.log(`   ❌ Test failed: ${test.error}`);
    }
  } else {
    console.log("\n⚠️  Skipping functionality test (no auth)");
  }

  // Show paths
  console.log("\n📁 Codex Paths:");
  console.log(`   Auth file: ${AUTH_FILE}`);
  console.log(`   Config file: ${CONFIG_FILE}`);

  // Offer setup if not authenticated
  if (!auth.valid) {
    const setup = prompt("\nWould you like to set up authentication? (y/n): ");
    if (setup?.toLowerCase() === "y") {
      await setupAuth();
    }
  }

  // Summary
  console.log("\n📊 Summary:");
  if (auth.valid) {
    console.log("✅ Codex SDK is properly configured and ready to use!");
  } else {
    console.log("❌ Authentication needs to be configured.");
    console.log("\nNext steps:");
    console.log("- Run 'codex login' for ChatGPT authentication");
    console.log("- Or set OPENAI_API_KEY environment variable");
  }
}

// Additional utility functions
export async function getAuthStatus() {
  return await checkAuth();
}

export async function verifyConnection() {
  return await testBasicFunctionality();
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}
