import { logBlock, logLine } from "./log.js";
import { advisorSystemPrompt, executorSystemPrompt, targetContext } from "./prompts.js";
import { snapshotTarget } from "./target.js";
import { LoopOptions, ModelClient } from "./types.js";

export async function runLoop(client: ModelClient, options: LoopOptions): Promise<void> {
  const snapshot = await snapshotTarget(options.targetPath);
  const context = targetContext(snapshot);

  logBlock("system", "Target snapshot", context);

  let advisorInput = [
    "Initial task:",
    options.initialTask,
    "",
    context,
    "",
    "Set the first goal for the executor."
  ].join("\n");

  for (let round = 1; round <= options.maxRounds; round += 1) {
    logLine("system", `Starting round ${round}/${options.maxRounds}`);

    const advisorOutput = await client.complete({
      model: options.advisorModel,
      reasoningEffort: "high",
      messages: [
        { role: "system", content: advisorSystemPrompt() },
        { role: "user", content: advisorInput }
      ]
    });
    logBlock("advisor", "Model output", advisorOutput);

    if (advisorOutput.trimStart().startsWith("/done")) {
      logLine("system", "Advisor marked the work done.");
      return;
    }

    if (!advisorOutput.trimStart().startsWith("/goal")) {
      throw new Error("Advisor response must start with /goal or /done.");
    }

    const executorOutput = await client.complete({
      model: options.executorModel,
      reasoningEffort: options.reasoningEffort,
      messages: [
        { role: "system", content: executorSystemPrompt() },
        {
          role: "user",
          content: [
            advisorOutput,
            "",
            "Target context:",
            context,
            "",
            "Execute this goal and report exactly what you did or would do."
          ].join("\n")
        }
      ]
    });
    logBlock("executor", "Model output", executorOutput);

    advisorInput = [
      "Review the executor output against your previous goal.",
      "",
      "Previous advisor goal:",
      advisorOutput,
      "",
      "Executor output:",
      executorOutput,
      "",
      "Respond with /goal for the next bounded step or /done if sufficient."
    ].join("\n");
  }

  logLine("system", `Stopped after max rounds: ${options.maxRounds}`);
}
