import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logLine } from "./log.js";
import { ChatMessage, ModelClient } from "./types.js";

const VERCEL_AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

export class CodingHarnessClient implements ModelClient {
  constructor(
    private readonly targetPath: string,
    private readonly gatewayApiKey: string
  ) {}

  async complete(input: Parameters<ModelClient["complete"]>[0]): Promise<string> {
    const system = input.messages.find((message) => message.role === "system")?.content ?? "";
    const prompt = renderPrompt(input.messages);

    if (system.includes("You are the advisor")) {
      return this.runClaudeAdvisor(input.model, system, prompt);
    }

    return this.runCodexExecutor(input.model, system, prompt, input.reasoningEffort ?? "low");
  }

  private async runClaudeAdvisor(model: string, system: string, prompt: string): Promise<string> {
    const normalizedModel = normalizeClaudeModel(model);
    return runCommand({
      label: "claude",
      command: "claude",
      args: [
        "--bare",
        "--print",
        "--model",
        normalizedModel,
        "--no-session-persistence",
        "--system-prompt",
        system,
        "--permission-mode",
        "bypassPermissions",
        "--dangerously-skip-permissions",
        "--output-format",
        "text",
        prompt
      ],
      cwd: this.targetPath,
      env: {
        AI_GATEWAY_API_KEY: this.gatewayApiKey,
        ANTHROPIC_BASE_URL: VERCEL_AI_GATEWAY_BASE_URL.replace(/\/v1$/, ""),
        ANTHROPIC_AUTH_TOKEN: this.gatewayApiKey,
        ANTHROPIC_API_KEY: ""
      }
    });
  }

  private async runCodexExecutor(
    model: string,
    system: string,
    prompt: string,
    reasoningEffort: "low" | "medium" | "high"
  ): Promise<string> {
    const tmp = await mkdtemp(path.join(tmpdir(), "agentic-doctor-codex-"));
    const lastMessagePath = path.join(tmp, "last-message.txt");

    try {
      await runCommand({
        label: "codex",
        command: "codex",
        args: [
          "exec",
          "--cd",
          this.targetPath,
          "--model",
          model,
          "--dangerously-bypass-approvals-and-sandbox",
          "--sandbox",
          "danger-full-access",
          "--output-last-message",
          lastMessagePath,
          "-c",
          'model_provider="vercel"',
          "-c",
          'model_providers.vercel.name="Vercel AI Gateway"',
          "-c",
          `model_providers.vercel.base_url="${VERCEL_AI_GATEWAY_BASE_URL}"`,
          "-c",
          'model_providers.vercel.env_key="AI_GATEWAY_API_KEY"',
          "-c",
          'model_providers.vercel.wire_api="responses"',
          "-c",
          `model_reasoning_effort="${reasoningEffort}"`,
          [system, "", prompt].join("\n")
        ],
        cwd: this.targetPath,
        env: {
          AI_GATEWAY_API_KEY: this.gatewayApiKey
        }
      });

      return (await readFile(lastMessagePath, "utf8")).trim();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
}

function renderPrompt(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => `<${message.role}>\n${message.content}\n</${message.role}>`)
    .join("\n\n");
}

function normalizeClaudeModel(model: string): string {
  const withoutProvider = model.replace(/^anthropic\//, "");
  if (withoutProvider === "claude-sonnet-4.6") return "claude-sonnet-4-6";
  if (withoutProvider === "claude-opus-4.6") return "claude-opus-4-6";
  if (withoutProvider === "claude-haiku-4.5") return "claude-haiku-4-5";
  return withoutProvider.replace(/\.(\d+)$/, "-$1");
}

async function runCommand(input: {
  label: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}): Promise<string> {
  logLine("system", `Starting ${input.label}: ${input.command} ${redactedArgs(input.args).join(" ")}`);

  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let combined = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      combined += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      combined += text;
      process.stderr.write(text);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(combined.trim());
      } else {
        reject(new Error(`${input.label} exited with code ${code}`));
      }
    });
  });
}

function redactedArgs(args: string[]): string[] {
  return args.map((arg) => (arg.length > 240 ? `${arg.slice(0, 240)}...` : arg));
}
