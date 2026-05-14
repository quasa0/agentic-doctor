import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export const anthropicAdvisorModels = [
  "anthropic/claude-opus-4.6",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5"
];

export const openaiExecutorModels = [
  "openai/gpt-5.5",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.3-codex"
];

export async function chooseModel(inputValue: {
  provided: string | undefined;
  label: string;
  models: string[];
  fallback: string;
}): Promise<string> {
  if (inputValue.provided) return inputValue.provided;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return inputValue.fallback;

  const rl = readline.createInterface({ input, output });
  try {
    output.write(`\nChoose ${inputValue.label} model:\n`);
    inputValue.models.forEach((model, index) => {
      output.write(`  ${index + 1}. ${model}\n`);
    });

    const answer = await rl.question(`Enter 1-${inputValue.models.length} or a custom model id [1]: `);
    const trimmed = answer.trim();
    if (!trimmed) return inputValue.fallback;

    const index = Number.parseInt(trimmed, 10);
    if (Number.isInteger(index) && index >= 1 && index <= inputValue.models.length) {
      return inputValue.models[index - 1];
    }

    return trimmed;
  } finally {
    rl.close();
  }
}
