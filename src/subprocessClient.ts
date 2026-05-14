import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logLine } from "./log.js";
import { ChatMessage, ModelClient } from "./types.js";

const VERCEL_AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const enableHarnessFormatDemo = process.env.AGENTIC_DOCTOR_HARNESS_FORMAT_DEMO === "1";

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
      label: "advisor",
      toolName: "Claude Code",
      model,
      color: ansi.orange,
      command: enableHarnessFormatDemo ? "printf" : "claude",
      args: enableHarnessFormatDemo
        ? ["/goal Demo advisor goal\\nsecond advisor line\\n"]
        : [
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
        label: "executor",
        toolName: "Codex CLI",
        model,
        color: ansi.blue,
        command: enableHarnessFormatDemo ? "sh" : "codex",
        args: enableHarnessFormatDemo
          ? ["-c", `printf 'executor demo line\\nsecond executor line\\n' > "${lastMessagePath}"; printf 'executor demo line\\nsecond executor line\\n'`]
          : [
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
  toolName: string;
  model: string;
  color: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}): Promise<string> {
  logLine("system", `Starting ${input.label}: ${input.command} ${redactedArgs(input.args).join(" ")}`);
  renderHarnessHeader(input);

  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let combined = "";
    const stdoutPrefixer = createLinePrefixer(input.color, process.stdout);
    const stderrPrefixer = createLinePrefixer(input.color, process.stderr);

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      combined += text;
      stdoutPrefixer.write(text);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      combined += text;
      stderrPrefixer.write(text);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      stdoutPrefixer.flush();
      stderrPrefixer.flush();
      renderHarnessFooter(input.color);
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

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  orange: "\x1b[38;5;208m",
  blue: "\x1b[38;5;39m"
};

function renderHarnessHeader(input: { label: string; toolName: string; model: string; color: string }): void {
  const role = input.label === "advisor" ? "Advisor" : "Executor";
  const model = `model: ${input.model}`;
  const provider = `provider: Vercel AI Gateway ${VERCEL_AI_GATEWAY_BASE_URL}`;
  const tool = `tool: ${input.toolName}`;

  process.stdout.write(
    [
      "",
      `${input.color}${ansi.bold}╔══════════════════════════════════════════════════════════════════════════════╗${ansi.reset}`,
      `${input.color}${ansi.bold}║  ${role.padEnd(74)}║${ansi.reset}`,
      `${input.color}${ansi.bold}║  ${model.padEnd(74)}║${ansi.reset}`,
      `${input.color}${ansi.bold}║  ${provider.padEnd(74)}║${ansi.reset}`,
      `${input.color}${ansi.bold}║  ${tool.padEnd(74)}║${ansi.reset}`,
      `${input.color}${ansi.bold}╠══════════════════════════════════════════════════════════════════════════════╣${ansi.reset}`,
      `${input.color}${ansi.bold}║  live subprocess output                                                   ║${ansi.reset}`,
      `${input.color}${ansi.bold}╚══════════════════════════════════════════════════════════════════════════════╝${ansi.reset}`
    ].join("\n") + "\n"
  );
}

function renderHarnessFooter(color: string): void {
  process.stdout.write(`${color}${ansi.bold}╚════════════════════════════════ end of block ═══════════════════════════════╝${ansi.reset}\n\n`);
}

function createLinePrefixer(color: string, stream: NodeJS.WriteStream): {
  write(text: string): void;
  flush(): void;
} {
  let pending = "";

  return {
    write(text: string): void {
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";

      for (const line of lines) {
        stream.write(`${color}> ${ansi.reset}${line}\n`);
      }
    },
    flush(): void {
      if (!pending) return;
      stream.write(`${color}> ${ansi.reset}${pending}\n`);
      pending = "";
    }
  };
}
