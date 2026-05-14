#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { MockModelClient, VercelGatewayClient } from "./modelClient.js";
import { runLoop } from "./loop.js";
import { anthropicAdvisorModels, chooseModel, openaiExecutorModels } from "./modelPicker.js";

const program = new Command();

program
  .name("agentic-doctor")
  .description("Run an advisor/executor Ralph loop against a target codebase.")
  .version("0.1.0");

program
  .command("run")
  .requiredOption("-t, --target <path>", "Target codebase path, e.g. ~/f")
  .option("--executor-model <model>", "Executor model id; prompts when omitted")
  .option("--advisor-model <model>", "Advisor model id; prompts when omitted")
  .option("--max-rounds <count>", "Maximum advisor/executor rounds", parseInteger, 5)
  .option("--task <task>", "Initial task", "Build a framework-agnostic React doctor workflow for this codebase.")
  .option("--reasoning <effort>", "Executor reasoning effort: low, medium, high", "low")
  .option("--mock", "Use a mock model client instead of Vercel AI Gateway", false)
  .action(async (options) => {
    const reasoning = parseReasoning(options.reasoning);
    const advisorModel = await chooseModel({
      provided: options.advisorModel,
      label: "advisor",
      models: anthropicAdvisorModels,
      fallback: anthropicAdvisorModels[0]
    });
    const executorModel = await chooseModel({
      provided: options.executorModel,
      label: "executor",
      models: openaiExecutorModels,
      fallback: openaiExecutorModels[0]
    });

    const client = options.mock
      ? new MockModelClient()
      : new VercelGatewayClient(
          requiredEnv("AI_GATEWAY_API_KEY"),
          process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1"
        );

    await runLoop(client, {
      targetPath: options.target,
      executorModel,
      advisorModel,
      maxRounds: options.maxRounds,
      initialTask: options.task,
      reasoningEffort: reasoning
    });
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`agentic-doctor: ${message}\n`);
  process.exitCode = 1;
});

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }
  return parsed;
}

function parseReasoning(value: string): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error(`Expected reasoning to be low, medium, or high; got: ${value}`);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it in .env or pass --mock.`);
  }
  return value;
}
