import { isCompactLinePrefixEnabled } from '../../utils/file.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

function getPreReadInstruction(): string {
  return `\n- You must use your \`${FILE_READ_TOOL_NAME}\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file. `
}

export function getEditToolDescription(): string {
  return getDefaultEditDescription()
}

function getDefaultEditDescription(): string {
  const prefixFormat = isCompactLinePrefixEnabled()
    ? 'line number + arrow'
    : 'spaces + line number + arrow'
  const minimalUniquenessHint =
    process.env.USER_TYPE === 'ant'
      ? `\n- Use the smallest old_string that's clearly unique — usually 2-4 adjacent lines is sufficient. Avoid including 10+ lines of context when less uniquely identifies the target.`
      : ''
  return `Performs exact string replacements in files.

Usage:${getPreReadInstruction()}
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: ${prefixFormat}. Everything after that is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.${minimalUniquenessHint}
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.

Multiple edits to one file:
- To make several edits to the same file in one call, pass an \`edits\` array instead of a single \`old_string\`/\`new_string\`. Each entry is \`{ old_string, new_string, replace_all? }\`.
- Provide EITHER the single \`old_string\`/\`new_string\` form OR the \`edits\` array — never both.
- Edits are applied SEQUENTIALLY in the order given. Each edit operates on the file as modified by all previous edits (so an earlier edit can make a later edit's \`old_string\` unique). A later edit's \`old_string\` must NOT be wholly contained within an earlier edit's \`new_string\` — that is rejected to avoid ambiguous cascading edits.
- Each edit's \`old_string\` must be unique in the file AT THE POINT IT IS APPLIED (or set that edit's \`replace_all\`). The same uniqueness rule as the single form applies to every edit.
- Edits are ALL-OR-NOTHING: if any edit fails to apply, the file is left unchanged and an error naming the failing edit is returned.
- Prefer the \`edits\` array over multiple separate Edit calls when changing one file in several places.`
}
