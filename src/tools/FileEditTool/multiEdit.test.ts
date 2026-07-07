import { describe, expect, test } from 'bun:test'

import { inputSchema } from './types.js'
import type { FileEditInput } from './types.js'
import { collapseEditInput, getPatchForEdits, toFileEdits } from './utils.js'

function apply(
  fileContents: string,
  edits: Parameters<typeof getPatchForEdits>[0]['edits'],
): string {
  return getPatchForEdits({ filePath: 'test.ts', fileContents, edits })
    .updatedFile
}

describe('collapseEditInput', () => {
  test('single form collapses to a one-element edits array', () => {
    const input = {
      file_path: '/f.ts',
      old_string: 'a',
      new_string: 'b',
      replace_all: false,
    } as FileEditInput
    const { file_path, edits } = collapseEditInput(input)
    expect(file_path).toBe('/f.ts')
    expect(edits).toEqual([
      { old_string: 'a', new_string: 'b', replace_all: false },
    ])
  })

  test('single form defaults replace_all to false when absent', () => {
    const input = {
      file_path: '/f.ts',
      old_string: 'a',
      new_string: 'b',
    } as FileEditInput
    expect(toFileEdits(collapseEditInput(input).edits)[0]!.replace_all).toBe(
      false,
    )
  })

  test('multi form passes the edits array through', () => {
    const input = {
      file_path: '/f.ts',
      edits: [
        { old_string: 'a', new_string: 'b', replace_all: false },
        { old_string: 'c', new_string: 'd', replace_all: true },
      ],
    } as FileEditInput
    const { edits } = collapseEditInput(input)
    expect(edits).toHaveLength(2)
    expect(toFileEdits(edits)[1]!.replace_all).toBe(true)
  })

  test('neither form present yields empty edits (defensive)', () => {
    const input = { file_path: '/f.ts' } as unknown as FileEditInput
    expect(collapseEditInput(input).edits).toEqual([])
  })
})

describe('multi-edit sequential application (getPatchForEdits)', () => {
  test('single edit behaves exactly as before', () => {
    expect(
      apply('hello world', [
        { old_string: 'world', new_string: 'there', replace_all: false },
      ]),
    ).toBe('hello there')
  })

  test('sequential dependency: edit 1 makes edit 2 unambiguous', () => {
    // "x" appears twice originally (edit 2 alone would be ambiguous without
    // replace_all). Edit 1 rewrites the first line to "y", so edit 2's "x" is
    // now unique against the PROGRESSIVELY updated file — proving edits apply in
    // order to the running content, not independently to the original.
    expect(
      apply('x\nx', [
        { old_string: 'x\n', new_string: 'y\n', replace_all: false },
        { old_string: 'x', new_string: 'z', replace_all: false },
      ]),
    ).toBe('y\nz')
  })

  test('two independent edits apply in order', () => {
    expect(
      apply('alpha\nbeta\ngamma', [
        { old_string: 'alpha', new_string: 'ALPHA', replace_all: false },
        { old_string: 'gamma', new_string: 'GAMMA', replace_all: false },
      ]),
    ).toBe('ALPHA\nbeta\nGAMMA')
  })

  test('replace_all replaces every occurrence within a single edit', () => {
    expect(
      apply('x x x', [{ old_string: 'x', new_string: 'y', replace_all: true }]),
    ).toBe('y y y')
  })

  test('all-or-nothing: a later non-matching edit throws (engine never writes partial)', () => {
    expect(() =>
      apply('const foo = 1', [
        {
          old_string: 'const foo = 1',
          new_string: 'const bar = 1',
          replace_all: false,
        },
        {
          old_string: 'DOES_NOT_EXIST',
          new_string: 'zzz',
          replace_all: false,
        },
      ]),
    ).toThrow('String not found in file. Failed to apply edit.')
  })

  test('substring conflict: edit 2 old_string inside edit 1 new_string throws', () => {
    expect(() =>
      apply('foo', [
        { old_string: 'foo', new_string: 'foobar', replace_all: false },
        { old_string: 'bar', new_string: 'baz', replace_all: false },
      ]),
    ).toThrow('old_string is a substring of a new_string from a previous edit.')
  })

  test('no-op edit set throws (final content equals original)', () => {
    expect(() =>
      apply('same', [
        { old_string: 'same', new_string: 'same', replace_all: false },
      ]),
    ).toThrow()
  })
})

describe('inputSchema form exclusivity', () => {
  const schema = inputSchema()

  test('single form parses', () => {
    expect(() =>
      schema.parse({ file_path: '/f.ts', old_string: 'a', new_string: 'b' }),
    ).not.toThrow()
  })

  test('multi form parses', () => {
    expect(() =>
      schema.parse({
        file_path: '/f.ts',
        edits: [{ old_string: 'a', new_string: 'b' }],
      }),
    ).not.toThrow()
  })

  test('empty edits array is rejected', () => {
    expect(() => schema.parse({ file_path: '/f.ts', edits: [] })).toThrow()
  })

  test('both forms present is rejected', () => {
    expect(() =>
      schema.parse({
        file_path: '/f.ts',
        old_string: 'a',
        new_string: 'b',
        edits: [{ old_string: 'c', new_string: 'd' }],
      }),
    ).toThrow()
  })

  test('neither form present is rejected', () => {
    expect(() => schema.parse({ file_path: '/f.ts' })).toThrow()
  })
})
