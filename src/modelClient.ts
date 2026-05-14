import { ModelClient } from "./types.js";

interface GatewayResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class VercelGatewayClient implements ModelClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://ai-gateway.vercel.sh/v1"
  ) {}

  async complete(input: Parameters<ModelClient["complete"]>[0]): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        reasoning_effort: input.reasoningEffort
      })
    });

    const json = (await response.json()) as GatewayResponse;
    if (!response.ok) {
      throw new Error(json.error?.message ?? `Gateway request failed with ${response.status}`);
    }

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Gateway response did not include assistant content.");
    }

    return content;
  }
}

export class MockModelClient implements ModelClient {
  private calls = 0;

  async complete(input: Parameters<ModelClient["complete"]>[0]): Promise<string> {
    this.calls += 1;
    const systemPrompt = input.messages.find((message) => message.role === "system")?.content ?? "";
    const last = input.messages.at(-1)?.content ?? "";

    if (systemPrompt.includes("You are the advisor")) {
      return this.mockAdvisor(last);
    }

    return [
      "I inspected the target snapshot and would start with a read-only architecture inventory.",
      "",
      "Proposed actions:",
      "- identify package manager and app framework",
      "- locate database access layer",
      "- locate React web-only APIs that block React Native migration",
      "- produce a migration checklist before editing files"
    ].join("\n");
  }

  private mockAdvisor(last: string): string {
    if (this.calls > 2 || last.includes("Executor output")) {
      return "/done\nMock review complete. The next implementation step is adding controlled file tools.";
    }

    return [
      "/goal",
      "Create a read-only inventory of the target codebase: framework, package manager, database-related files, and likely React-to-React-Native migration risks."
    ].join("\n");
  }
}
