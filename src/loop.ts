import { logBlock, logLine } from "./log.js";
import { advisorSystemPrompt, executorSystemPrompt, targetContext } from "./prompts.js";
import { snapshotTarget } from "./target.js";
import { LoopOptions, ModelClient } from "./types.js";

export async function runLoop(client: ModelClient, options: LoopOptions): Promise<void> {
  const context = options.includeTargetSnapshot
    ? targetContext(await snapshotTarget(options.targetPath))
    : `Target path: ${options.targetPath}`;

  logBlock("system", options.includeTargetSnapshot ? "Target snapshot" : "Target", context);

  let advisorInput = [
    "Initial task:",
    options.initialTask,
    "",
    context,
    "",
    "Set the first goal for the executor."
  ].join("\n");

  for (let round = 1; options.maxRounds === -1 || round <= options.maxRounds; round += 1) {
    const roundLimit = options.maxRounds === -1 ? "unbounded" : `${round}/${options.maxRounds}`;
    logLine("system", `Starting round ${roundLimit}`);

    const advisorOutput = await client.complete({
      model: options.advisorModel,
      reasoningEffort: "high",
      advisorEffort: options.advisorEffort,
      messages: [
        { role: "system", content: advisorSystemPrompt({ allowDone: options.allowDone }) },
        { role: "user", content: advisorInput }
      ]
    });
    logBlock("advisor", "Model output", advisorOutput);

    const advisorDirective = extractAdvisorDirective(advisorOutput);

    if (advisorDirective === "/done") {
      if (options.allowDone) {
        logLine("system", "Advisor marked the work done.");
        return;
      }

      logLine("system", "Advisor emitted /done, but this loop is configured to continue.");
      advisorInput = [
        "You emitted /done, but this run is configured to keep finding and fixing issues.",
        "Review the current codebase state briefly, find a different concrete issue, and respond with /goal only.",
        "",
        context
      ].join("\n");
      continue;
    }

    if (advisorDirective !== "/goal") {
      throw new Error(options.allowDone ? "Advisor response must include /goal or /done." : "Advisor response must include /goal.");
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
      options.allowDone
        ? "Respond with /goal for the next bounded step or /done if sufficient."
        : "Respond with /goal for a different bounded issue. Do not emit /done."
    ].join("\n");
  }

  if (options.maxRounds !== -1) {
    logLine("system", `Stopped after max rounds: ${options.maxRounds}`);
  }
}

function extractAdvisorDirective(output: string): "/goal" | "/done" | null {
  const line = output
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.startsWith("/goal") || value.startsWith("/done"));

  if (line?.startsWith("/goal")) return "/goal";
  if (line?.startsWith("/done")) return "/done";
  return null;
}
