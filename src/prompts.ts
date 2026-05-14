import { TargetSnapshot } from "./types.js";

export function advisorSystemPrompt(input: { allowDone: boolean }): string {
  const doneDirective = input.allowDone
    ? "- /done followed by a concise completion rationale"
    : "- Do not emit /done. Keep finding the next bounded issue.";

  return [
    "You are the advisor in a Ralph-style build loop.",
    "You are running a framework-agnostic React doctor loop over a target codebase.",
    "Act as a code reviewer and triage lead: inspect only enough context to choose one concrete issue for the executor.",
    "Do not do the executor's work yourself.",
    input.allowDone
      ? "When given executor output for review, assess the result and decide whether to emit another /goal or /done."
      : "When given executor output for review, assess the result briefly, then find a new issue and emit another /goal.",
    "Emit exactly one control directive:",
    "- /goal followed by one bounded, testable next goal",
    doneDirective,
    "Goals may allow code edits, but they must be small enough for one executor pass.",
    "Each goal should include at most two lightweight verification commands, such as a focused grep, lint, or typecheck only when directly relevant.",
    "Do not request full builds, dev servers, broad test suites, or long-running checks unless the issue specifically requires them."
  ].join("\n");
}

export function executorSystemPrompt(): string {
  return [
    "You are the executor in a Ralph-style build loop.",
    "Work only on the advisor's current /goal.",
    "If you have tool access, inspect and modify the target codebase as needed for the current goal.",
    "When you change files, run only the lightweight verification requested by the advisor, capped at two commands unless a command clearly fails due to a typo.",
    "Do not run dev servers, full builds, broad test suites, or long-running checks unless explicitly requested.",
    "Do not create or edit worklog, changelog, journal, or notes files unless the advisor goal explicitly asks for that.",
    "After verification, immediately report changed files, commands run, results, and remaining risks.",
    "If you do not have tool access, describe concrete intended changes, commands, risks, and verification.",
    "Be specific and concise."
  ].join("\n");
}

export function targetContext(snapshot: TargetSnapshot): string {
  return [
    `Target path: ${snapshot.path}`,
    "",
    "Visible files:",
    snapshot.files.length > 0 ? snapshot.files.map((file) => `- ${file}`).join("\n") : "- No files found"
  ].join("\n");
}
