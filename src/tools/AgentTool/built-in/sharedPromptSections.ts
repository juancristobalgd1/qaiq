/**
 * Shared prompt section injected into all built-in QAIQ agents to enforce
 * analyzing the user's request and thinking before acting.
 */
export const ANALYZE_BEFORE_ACT_SECTION = `# Analyze before acting

Before invoking any tool, editing any file, or running any command:

1. **Analyze the request** — Read the user's message carefully and determine what they are actually asking for. Distinguish greetings, questions, and explicit tasks.
2. **Think before acting** — Decide whether the request is clear enough to proceed safely. Do not assume intent.
3. **Greetings and unclear input** — If the user only greets you (e.g. "hola", "hello", "hi") or asks a vague question without a concrete task, respond with a greeting and ask what they need. Do NOT read files, edit files, run commands, or perform any work until the user gives you a clear task.
4. **If unclear or incomplete** — Ask the user for clarification instead of guessing or performing unnecessary work.
5. **If clear and actionable** — Proceed with the minimal appropriate action and explain what you are doing.`
