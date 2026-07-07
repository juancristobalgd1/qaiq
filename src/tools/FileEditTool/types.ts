import { z } from 'zod/v4'
import { lazySchema } from '../../utils/lazySchema.js'
import { semanticBoolean } from '../../utils/semanticBoolean.js'

// A single edit operation inside the `edits` array. Mirrors the single-form
// content fields but without file_path (the array shares one file_path).
const editItemSchema = lazySchema(() =>
  z.strictObject({
    old_string: z.string().describe('The text to replace'),
    new_string: z
      .string()
      .describe(
        'The text to replace it with (must be different from old_string)',
      ),
    replace_all: semanticBoolean(z.boolean().default(false).optional()).describe(
      'Replace all occurrences of old_string (default false)',
    ),
  }),
)

// The input schema. Two mutually-exclusive forms:
//   Single: { file_path, old_string, new_string, replace_all? }
//   Multi:  { file_path, edits: [{ old_string, new_string, replace_all? }, ...] }
// Both content forms are optional at the field level; a superRefine enforces
// that EXACTLY ONE form is present. We keep a single strictObject (not a union)
// so the emitted tool JSON schema stays a flat object with
// additionalProperties:false and z.output stays a stable named type.
const inputSchema = lazySchema(() =>
  z
    .strictObject({
      file_path: z.string().describe('The absolute path to the file to modify'),
      old_string: z
        .string()
        .describe('The text to replace (single-edit form)')
        .optional(),
      new_string: z
        .string()
        .describe(
          'The text to replace it with, must differ from old_string (single-edit form)',
        )
        .optional(),
      replace_all: semanticBoolean(
        z.boolean().default(false).optional(),
      ).describe(
        'Replace all occurrences of old_string (default false, single-edit form)',
      ),
      edits: z
        .array(editItemSchema())
        .describe(
          'Array of edits to apply sequentially to the file. Each edit is ' +
            '{ old_string, new_string, replace_all? }. Edits are applied in ' +
            'order; each sees the file as modified by all previous edits. ' +
            'All edits must succeed or none are applied. Use this instead of ' +
            'the single old_string/new_string form when making multiple edits ' +
            'to one file.',
        )
        .optional(),
    })
    .superRefine((val, ctx) => {
      const hasSingle =
        val.old_string !== undefined || val.new_string !== undefined
      const hasMulti = val.edits !== undefined

      if (hasSingle && hasMulti) {
        ctx.addIssue({
          code: 'custom',
          message: 'Provide either old_string/new_string OR edits, not both.',
        })
        return
      }
      if (!hasSingle && !hasMulti) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Provide either old_string and new_string, or an edits array.',
        })
        return
      }
      if (hasSingle) {
        if (val.old_string === undefined || val.new_string === undefined) {
          ctx.addIssue({
            code: 'custom',
            message:
              'Both old_string and new_string are required in the single-edit form.',
          })
        }
      }
      if (hasMulti && val.edits !== undefined && val.edits.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'edits must contain at least one edit.',
        })
      }
    }),
)
type InputSchema = ReturnType<typeof inputSchema>

// Parsed output — what call() receives. z.output not z.input: with
// semanticBoolean the input side is unknown (preprocess accepts anything).
// With the two optional forms, old_string/new_string/edits are all
// `X | undefined` here; the normalizer + validateInput narrow at runtime.
export type FileEditInput = z.output<InputSchema>

// Individual edit without file_path. Derived from the array item so it stays in
// sync with editItemSchema (Omit<FileEditInput,'file_path'> would now carry the
// extra `edits` key, which is wrong for a single edit item).
export type EditInput = z.output<ReturnType<typeof editItemSchema>>

// Runtime version where replace_all is always defined
export type FileEdit = {
  old_string: string
  new_string: string
  replace_all: boolean
}

export const hunkSchema = lazySchema(() =>
  z.object({
    oldStart: z.number(),
    oldLines: z.number(),
    newStart: z.number(),
    newLines: z.number(),
    lines: z.array(z.string()),
  }),
)

export const gitDiffSchema = lazySchema(() =>
  z.object({
    filename: z.string(),
    status: z.enum(['modified', 'added']),
    additions: z.number(),
    deletions: z.number(),
    changes: z.number(),
    patch: z.string(),
    repository: z
      .string()
      .nullable()
      .optional()
      .describe('GitHub owner/repo when available'),
  }),
)

// Output schema for FileEditTool
const outputSchema = lazySchema(() =>
  z.object({
    filePath: z.string().describe('The file path that was edited'),
    oldString: z
      .string()
      .describe('The original string replaced by the first edit'),
    newString: z.string().describe('The new string from the first edit'),
    originalFile: z
      .string()
      .describe('The original file contents before editing'),
    structuredPatch: z
      .array(hunkSchema())
      .describe('Diff patch showing the changes'),
    userModified: z
      .boolean()
      .describe('Whether the user modified the proposed changes'),
    replaceAll: z
      .boolean()
      .describe('Whether the first edit replaced all occurrences'),
    editCount: z
      .number()
      .describe('Number of edits applied (1 for the single-edit form)'),
    gitDiff: gitDiffSchema().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type FileEditOutput = z.infer<OutputSchema>

export { editItemSchema, inputSchema, outputSchema }
