export type RoleName = "advisor" | "executor";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelClient {
  complete(input: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    reasoningEffort?: "low" | "medium" | "high";
  }): Promise<string>;
}

export interface LoopOptions {
  targetPath: string;
  executorModel: string;
  advisorModel: string;
  maxRounds: number;
  initialTask: string;
  reasoningEffort: "low" | "medium" | "high";
}

export interface TargetSnapshot {
  path: string;
  files: string[];
}
