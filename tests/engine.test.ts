import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Provider } from '../src/shared/types.ts'
import { BadFormatError } from '../src/main/translate/adapters.ts'
import { translateJson } from '../src/main/translate/engine.ts'

const P = (id: string, priority: number, enabled = true): Provider => ({
  id,
  type: 'lmstudio',
  name: id.toUpperCase(),
  baseUrl: '',
  apiKey: '',
  model: '',
  enabled,
  priority
})

type Fn = (texts: string[]) => Promise<string[]>
const adapter = (fn: Fn) => ({ maxItems: 2, maxChars: 1000, translate: (t: string[]) => fn(t) })
const upper: Fn = async (t) => t.map((s) => s.toUpperCase())

const run = (json: unknown, providers: Provider[], fns: Record<string, Fn>, extra: Record<string, unknown> = {}) =>
  translateJson(typeof json === 'string' ? json : JSON.stringify(json), {
    providers,
    distribution: false,
    mode: 'structure',
    ignoreKeys: '',
    from: 'auto',
    to: 'ja',
    signal: new AbortController().signal,
    onProgress: () => {},
    log: () => {},
    makeAdapter: (p: Provider) => adapter(fns[p.id]),
    ...extra
  })

test('translates values, protects placeholders, honors ignore keys', async () => {
  const r = await run({ a: 'hello', b: 'world {n}', c: 'keep' }, [P('a', 1)], { a: upper }, { ignoreKeys: 'c' })
  assert.deepEqual(JSON.parse(r.text), { a: 'HELLO', b: 'WORLD {n}', c: 'keep' })
  assert.equal(r.warnings, 0)
})

test('keys mode translates keys too', async () => {
  const r = await run({ greeting: 'hi' }, [P('a', 1)], { a: upper }, { mode: 'keys' })
  assert.deepEqual(JSON.parse(r.text), { GREETING: 'HI' })
})

test('falls back to the next provider and stops using a failed one', async () => {
  let aCalls = 0
  const failing: Fn = async () => {
    aCalls++
    throw new Error('HTTP 429: quota')
  }
  const r = await run({ a: 'one', b: 'two', c: 'three' }, [P('b', 2), P('a', 1)], { a: failing, b: upper })
  assert.deepEqual(JSON.parse(r.text), { a: 'ONE', b: 'TWO', c: 'THREE' })
  assert.deepEqual(r.used, ['B'])
  assert.equal(aCalls, 1)
})

test('uses only enabled providers in priority order', async () => {
  const calls: string[] = []
  const rec =
    (id: string): Fn =>
    async (t) => {
      calls.push(id)
      return t.map((s) => s.toUpperCase())
    }
  const r = await run({ a: 'x1' }, [P('b', 2), P('a', 1), P('c', 0, false)], {
    a: rec('a'),
    b: rec('b'),
    c: rec('c')
  })
  assert.deepEqual(calls, ['a'])
  assert.deepEqual(r.used, ['A'])
})

test('distribution uses all providers in parallel', async () => {
  const seen: string[] = []
  const slow =
    (id: string): Fn =>
    async (t) => {
      await new Promise((res) => setTimeout(res, 20))
      seen.push(id)
      return t.map((s) => s.toUpperCase())
    }
  const r = await run(
    { a: 'aa', b: 'bb', c: 'cc', d: 'dd' },
    [P('a', 1), P('b', 2)],
    { a: slow('a'), b: slow('b') },
    { distribution: true }
  )
  assert.deepEqual(JSON.parse(r.text), { a: 'AA', b: 'BB', c: 'CC', d: 'DD' })
  assert.deepEqual([...seen].sort(), ['a', 'b'])
})

test('distribution: a failed worker hands its batch to the others', async () => {
  const boom: Fn = async () => {
    throw new Error('HTTP 500')
  }
  const r = await run(
    { a: 'aa', b: 'bb', c: 'cc', d: 'dd' },
    [P('a', 1), P('b', 2)],
    { a: boom, b: upper },
    { distribution: true }
  )
  assert.deepEqual(JSON.parse(r.text), { a: 'AA', b: 'BB', c: 'CC', d: 'DD' })
  assert.deepEqual(r.used, ['B'])
})

test('rejects when every provider fails', async () => {
  const boom: Fn = async () => {
    throw new Error('HTTP 500: down')
  }
  await assert.rejects(run({ a: 'aa' }, [P('a', 1), P('b', 2)], { a: boom, b: boom }), /HTTP 500/)
})

test('splits a batch when the response format is bad', async () => {
  const picky: Fn = async (t) => {
    if (t.length > 1) throw new BadFormatError('count')
    return t.map((s) => s.toUpperCase())
  }
  const r = await run({ a: 'aa', b: 'bb' }, [P('a', 1)], { a: picky })
  assert.deepEqual(JSON.parse(r.text), { a: 'AA', b: 'BB' })
  assert.equal(r.warnings, 0)
})

test('keeps the original text when a single item cannot be parsed', async () => {
  const bad: Fn = async () => {
    throw new BadFormatError('nope')
  }
  const r = await run({ a: 'hello' }, [P('a', 1)], { a: bad })
  assert.deepEqual(JSON.parse(r.text), { a: 'hello' })
  assert.equal(r.warnings, 1)
})

test('keeps the original when a placeholder is lost', async () => {
  const drop: Fn = async (t) => t.map(() => 'DROPPED')
  const r = await run({ a: 'hi {n}' }, [P('a', 1)], { a: drop })
  assert.deepEqual(JSON.parse(r.text), { a: 'hi {n}' })
  assert.equal(r.warnings, 1)
})

test('aborts when the signal is aborted', async () => {
  const ac = new AbortController()
  ac.abort()
  await assert.rejects(
    run({ a: 'aa' }, [P('a', 1)], { a: upper }, { signal: ac.signal }),
    (e: Error) => e.name === 'AbortError'
  )
})

test('reports progress up to the total', async () => {
  const seen: [number, number][] = []
  await run(
    { a: 'aa', b: 'bb', c: 'cc' },
    [P('a', 1)],
    { a: upper },
    { onProgress: (d: number, t: number) => seen.push([d, t]) }
  )
  assert.deepEqual(seen.at(-1), [3, 3])
})

test('rejects invalid JSON and missing providers', async () => {
  await assert.rejects(run('{oops', [P('a', 1)], { a: upper }), /JSON/)
  await assert.rejects(run({ a: 'aa' }, [P('a', 1, false)], { a: upper }), /provider/i)
})

test('keeps indentation and trailing newline', async () => {
  const r = await run('{\n    "a": "hello"\n}\n', [P('a', 1)], { a: upper })
  assert.equal(r.text, '{\n    "a": "HELLO"\n}\n')
})
