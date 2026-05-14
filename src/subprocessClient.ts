import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
      streamStderr: true,
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
            "stream-json",
            "--include-partial-messages",
            "--verbose",
            prompt
          ],
      cwd: this.targetPath,
      env: {
        AI_GATEWAY_API_KEY: this.gatewayApiKey,
        ANTHROPIC_BASE_URL: VERCEL_AI_GATEWAY_BASE_URL.replace(/\/v1$/, ""),
        ANTHROPIC_AUTH_TOKEN: this.gatewayApiKey,
        ANTHROPIC_API_KEY: ""
      },
      streamParser: enableHarnessFormatDemo ? "text" : "claude-stream-json"
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
    const codexHome = path.join(tmp, "codex-home");
    await mkdir(codexHome, { recursive: true });

    try {
      await runCommand({
        label: "executor",
        toolName: "Codex CLI",
        model,
        color: ansi.blue,
        streamStderr: true,
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
              "--ignore-user-config",
              "--ignore-rules",
              "--skip-git-repo-check",
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
          AI_GATEWAY_API_KEY: this.gatewayApiKey,
          CODEX_HOME: codexHome
        },
        streamParser: "text"
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
  streamStderr: boolean;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  streamParser: "text" | "claude-stream-json";
}): Promise<string> {
  logLine("system", `Starting ${input.label}: ${input.toolName} with ${input.model}`);
  renderHarnessHeader(input);

  return new Promise((resolve, reject) => {
    let lastVisibleOutputAt = Date.now();
    const markVisibleOutput = () => {
      lastVisibleOutputAt = Date.now();
    };
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let combined = "";
    let finalText = "";
    const stdoutPrefixer = createLinePrefixer(input.color, process.stdout, markVisibleOutput);
    const stderrPrefixer = createLinePrefixer(input.color, process.stderr, markVisibleOutput);
    const stdoutHandler =
      input.streamParser === "claude-stream-json"
        ? createClaudeStreamJsonHandler(stdoutPrefixer, (text) => {
            finalText = text;
          })
        : null;

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      combined += text;
      if (stdoutHandler) {
        stdoutHandler.write(text);
      } else {
        stdoutPrefixer.write(text);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      combined += text;
      if (input.streamStderr) {
        stderrPrefixer.write(filterSubprocessStderr(text));
      }
    });

    const heartbeat = setInterval(() => {
      if (Date.now() - lastVisibleOutputAt < 5000) return;
      stdoutPrefixer.write(`[waiting] ${input.toolName} is still running...\n`);
    }, 5000);

    child.on("error", reject);
    child.on("close", (code) => {
      clearInterval(heartbeat);
      stdoutPrefixer.flush();
      stderrPrefixer.flush();
      renderHarnessFooter(input.color);
      if (code === 0) {
        resolve((finalText || combined).trim());
      } else {
        const tail = combined.trim().split(/\r?\n/).slice(-20).join("\n");
        reject(new Error(`${input.label} exited with code ${code}${tail ? `\n${tail}` : ""}`));
      }
    });
  });
}

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  orange: "\x1b[38;5;208m",
  blue: "\x1b[38;5;39m"
};

const box = {
  innerWidth: 76,
  paddingWidth: 2,
  contentWidth: 72,
  top: "╔" + "═".repeat(76) + "╗",
  middle: "╠" + "═".repeat(76) + "╣",
  bottom: "╚" + "═".repeat(76) + "╝"
};

function renderHarnessHeader(input: { label: string; toolName: string; model: string; color: string }): void {
  const role = input.label === "advisor" ? "Advisor" : "Executor";
  const rows = [
    role,
    `model: ${input.model}`,
    `provider: Vercel AI Gateway ${VERCEL_AI_GATEWAY_BASE_URL}`,
    `tool: ${input.toolName}`,
    "",
    "live subprocess output"
  ];

  process.stdout.write(
    [
      "",
      colorizeBoxLine(input.color, box.top),
      ...rows.flatMap((row, index) => {
        if (row === "") return [colorizeBoxLine(input.color, box.middle)];
        return wrapBoxRow(row).map((line) => colorizeBoxLine(input.color, line));
      }),
      colorizeBoxLine(input.color, box.bottom)
    ].join("\n") + "\n"
  );
}

function renderHarnessFooter(color: string): void {
  process.stdout.write(`${colorizeBoxLine(color, footerLine("end of block"))}\n\n`);
}

function createLinePrefixer(color: string, stream: NodeJS.WriteStream, onWrite?: () => void): {
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
        for (const wrapped of wrapOutputLine(line)) {
          stream.write(`${color}> ${ansi.reset}${wrapped}\n`);
          onWrite?.();
        }
      }
    },
    flush(): void {
      if (!pending) return;
      for (const wrapped of wrapOutputLine(pending)) {
        stream.write(`${color}> ${ansi.reset}${wrapped}\n`);
        onWrite?.();
      }
      pending = "";
    }
  };
}

function createClaudeStreamJsonHandler(
  prefixer: ReturnType<typeof createLinePrefixer>,
  setFinalText: (text: string) => void
): {
  write(text: string): void;
} {
  let pending = "";
  let accumulated = "";
  const seenEvents = new Set<string>();

  return {
    write(text: string): void {
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = parseJsonLine(line);
        if (!parsed) {
          prefixer.write(`${line}\n`);
          continue;
        }

        const delta = extractClaudeDelta(parsed);
        if (delta) {
          accumulated += delta;
          prefixer.write(delta);
        }

        const finalText = extractClaudeFinalText(parsed);
        if (finalText) {
          setFinalText(finalText);
        }

        for (const eventLabel of extractClaudeEventLabels(parsed)) {
          if (seenEvents.has(eventLabel) && eventLabel === "[claude] session started") continue;
          seenEvents.add(eventLabel);
          prefixer.write(`${eventLabel}\n`);
        }
      }

      setFinalText(accumulated);
    }
  };
}

function parseJsonLine(line: string): unknown | null {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return null;
  }
}

function extractClaudeDelta(value: unknown): string {
  value = unwrapClaudeStreamEvent(value);
  if (!isRecord(value)) return "";

  const candidatePaths = [
    value.delta,
    isRecord(value.message) ? value.message.delta : undefined,
    value.content_block_delta,
    isRecord(value.event) ? value.event.delta : undefined
  ];

  for (const candidate of candidatePaths) {
    if (!isRecord(candidate)) continue;
    if (typeof candidate.text === "string") return candidate.text;
    if (typeof candidate.content === "string") return candidate.content;
    if (isRecord(candidate.delta) && typeof candidate.delta.text === "string") return candidate.delta.text;
  }

  if (typeof value.text === "string" && value.type === "content_block_delta") return value.text;
  return "";
}

function extractClaudeFinalText(value: unknown): string {
  value = unwrapClaudeStreamEvent(value);
  if (!isRecord(value)) return "";
  if (typeof value.result === "string") return value.result;
  if (typeof value.response === "string") return value.response;
  if (typeof value.text === "string" && (value.type === "result" || value.type === "final")) return value.text;
  return "";
}

function extractClaudeEventLabels(value: unknown): string[] {
  value = unwrapClaudeStreamEvent(value);
  if (!isRecord(value)) return [];
  const type = typeof value.type === "string" ? value.type : "";
  if (!type) return [];
  if (type === "assistant" || type === "result" || type === "content_block_delta") return [];

  if (type === "system") return ["[claude] session started"];
  if (type === "user" || type === "content_block_stop") return [];
  if (type === "content_block_start") return describeClaudeContentBlock(value);
  if (type === "message_start") return ["[claude] message started"];
  if (type === "message_stop") return ["[claude] message complete"];
  if (type === "tool_use") return describeClaudeToolUse(value);
  if (type === "tool_result") return describeClaudeToolResult(value);
  return [];
}

function describeClaudeContentBlock(value: Record<string, unknown>): string[] {
  const block = isRecord(value.content_block) ? value.content_block : isRecord(value.block) ? value.block : value;
  const blockType = typeof block.type === "string" ? block.type : "";
  if (blockType === "tool_use") return describeClaudeToolUse(block);
  if (blockType === "text") return ["[claude] writing response"];
  return blockType ? [`[claude] content block: ${blockType}`] : [];
}

function describeClaudeToolUse(value: Record<string, unknown>): string[] {
  const name = typeof value.name === "string" ? value.name : "tool";
  const input = isRecord(value.input) ? value.input : undefined;
  const command = input && typeof input.command === "string" ? input.command : "";
  const filePath = input && typeof input.file_path === "string" ? input.file_path : "";
  const pathValue = input && typeof input.path === "string" ? input.path : "";
  const pattern = input && typeof input.pattern === "string" ? input.pattern : "";

  if (command) return [`[claude] tool ${name}: ${command}`];
  if (filePath) return [`[claude] tool ${name}: ${filePath}`];
  if (pathValue) return [`[claude] tool ${name}: ${pathValue}`];
  if (pattern) return [`[claude] tool ${name}: ${pattern}`];
  return [`[claude] using tool: ${name}`];
}

function describeClaudeToolResult(value: Record<string, unknown>): string[] {
  const content = value.content;
  if (typeof content === "string") return [`[claude] tool result (${content.length} chars)`];
  if (Array.isArray(content)) return [`[claude] tool result (${content.length} item${content.length === 1 ? "" : "s"})`];
  return ["[claude] received tool result"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapClaudeStreamEvent(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (value.type === "stream_event" && isRecord(value.event)) return value.event;
  return value;
}

function filterSubprocessStderr(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const value = line.trim();
      if (!value) return true;
      if (value.includes("codex_core_plugins::manager: failed to warm featured plugin")) return false;
      if (value.includes("remote plugin sync request to https://chatgpt.com/backend-api/plugins/featured")) return false;
      if (value.includes("failed with status 403 Forbidden: <html>")) return false;
      if (value.includes("codex_core_plugins::manifest: ignoring interface.defaultPrompt")) return false;
      if (value.includes("codex_core_skills::loader: ignoring interface.icon_")) return false;
      if (value.includes("codex_core_plugins::startup_remote_sync: startup remote plugin sync failed")) return false;
      if (value.includes("chatgpt authentication required to sync remote plugins")) return false;
      if (value.startsWith("<") || value.includes("Cloudflare") || value.includes("_cf_chl_opt")) return false;
      return true;
    })
    .join("\n");
}

function colorizeBoxLine(color: string, line: string): string {
  return `${color}${ansi.bold}${line}${ansi.reset}`;
}

function wrapBoxRow(text: string): string[] {
  const padding = " ".repeat(box.paddingWidth);
  return wrapText(text, box.contentWidth).map((chunk) => `║${padding}${chunk.padEnd(box.contentWidth)}${padding}║`);
}

function footerLine(label: string): string {
  const padded = ` ${label} `;
  const left = Math.floor((box.innerWidth - padded.length) / 2);
  const right = box.innerWidth - padded.length - left;
  return "╚" + "═".repeat(left) + padded + "═".repeat(right) + "╝";
}

function wrapOutputLine(line: string): string[] {
  return wrapText(line, Math.max(40, process.stdout.columns ? process.stdout.columns - 4 : 96));
}

function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!word) continue;
    if (current.length + word.length <= width) {
      current += word;
      continue;
    }

    if (current.trimEnd()) lines.push(current.trimEnd());
    current = "";

    if (word.length > width) {
      for (let index = 0; index < word.length; index += width) {
        const chunk = word.slice(index, index + width);
        if (chunk.length === width) {
          lines.push(chunk);
        } else {
          current = chunk;
        }
      }
    } else {
      current = word.trimStart();
    }
  }

  if (current.trimEnd()) lines.push(current.trimEnd());
  return lines.length > 0 ? lines : [""];
}
