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
    advisorEffort?: "low" | "medium" | "high" | "xhigh" | "max";
  }): Promise<string>;
}

export interface LoopOptions {
  targetPath: string;
  executorModel: string;
  advisorModel: string;
  maxRounds: number;
  initialTask: string;
  reasoningEffort: "low" | "medium" | "high";
  advisorEffort: "low" | "medium" | "high" | "xhigh" | "max";
  includeTargetSnapshot: boolean;
  allowDone: boolean;
}

export interface TargetSnapshot {
  path: string;
  files: string[];
}
