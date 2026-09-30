import type { Provider } from '@shared/types'
import type { Marks } from '../../shared/keyscan.ts'
import type { Adapter } from './adapters.ts'
import { BadFormatError, createAdapter } from './adapters.ts'
import type { Mode } from './core.ts'
import { extract, makeBatches, parseIgnoreKeys, protect, restore } from './core.ts'

export interface EngineOptions {
  providers: Provider[]
  distribution: boolean
  mode: Mode
  ignoreKeys: string
  /** 行マーカーによる個別の無視 / 解除 (出現位置単位) */
  marks?: Marks
  from: string
  to: string
  signal: AbortSignal
  onProgress: (done: number, total: number) => void
  log: (msg: string) => void
  /** テスト用: アダプタの差し替え */
  makeAdapter?: (p: Provider) => Adapter
}

export interface EngineResult {
  text: string
  /** 原文のまま残った文字列の数 */
  warnings: number
  used: string[]
}

/** 形式不正のときはバッチを半分に分けて再試行 */
async function translateSplit(a: Adapter, texts: string[], o: EngineOptions): Promise<string[]> {
  try {
    return await a.translate(texts, o.from, o.to, o.signal)
  } catch (e) {
    if (e instanceof BadFormatError && texts.length > 1) {
      const mid = Math.ceil(texts.length / 2)
      const head = await translateSplit(a, texts.slice(0, mid), o)
      const tail = await translateSplit(a, texts.slice(mid), o)
      return [...head, ...tail]
    }
    throw e
  }
}

export async function translateJson(text: string, o: EngineOptions): Promise<EngineResult> {
  const clean = text.replace(/^\uFEFF/, '')
  let json: unknown
  try {
    json = JSON.parse(clean)
  } catch (e) {
    throw new Error(`JSON parse error: ${(e as Error).message}`)
  }

  const providers = o.providers.filter((p) => p.enabled).sort((a, b) => a.priority - b.priority)
  if (providers.length === 0) throw new Error('No enabled provider')
  const make = o.makeAdapter ?? createAdapter
  const adapters = new Map(providers.map((p) => [p.id, make(p)] as const))
  const maxItems = Math.min(...[...adapters.values()].map((a) => a.maxItems))
  const maxChars = Math.min(...[...adapters.values()].map((a) => a.maxChars))

  const ex = extract(json, o.mode, parseIgnoreKeys(o.ignoreKeys), o.marks)
  const prot = ex.texts.map(protect)
  const batches = makeBatches(
    prot.map((x) => x.text),
    maxItems,
    maxChars
  )
  const total = prot.length

  const results: (string[] | undefined)[] = new Array(batches.length).fill(undefined)
  const dead = new Set<string>()
  const used = new Set<string>()
  let lastError: Error | null = null
  let warnings = 0
  let done = 0
  o.onProgress(0, total)

  let pending = batches.map((_, i) => i)
  while (pending.length) {
    if (providers.every((p) => dead.has(p.id))) throw lastError ?? new Error('All providers failed')
    const queue = [...pending]
    // 分配: プロバイダーごとに1ワーカー / 通常: 1ワーカーが優先順位順に試す
    const chains = o.distribution ? providers.filter((p) => !dead.has(p.id)).map((p) => [p]) : [providers]
    await Promise.all(
      chains.map(async (chain) => {
        while (queue.length) {
          o.signal.throwIfAborted()
          const bi = queue.shift() as number
          const texts = batches[bi].map((i) => prot[i].text)
          let ok = false
          for (const p of chain) {
            if (dead.has(p.id)) continue
            try {
              results[bi] = await translateSplit(adapters.get(p.id) as Adapter, texts, o)
              used.add(p.name)
              ok = true
              break
            } catch (e) {
              if (o.signal.aborted) throw e
              if (e instanceof BadFormatError) {
                o.log(`[${p.name}] bad response format: ${e.message}`)
                continue
              }
              dead.add(p.id)
              lastError = e as Error
              o.log(`[${p.name}] failed: ${(e as Error).message}`)
            }
          }
          if (!ok) {
            // 全て使用不可: このバッチは次のパスで残りのプロバイダーが引き継ぐ
            if (chain.every((p) => dead.has(p.id))) return
            // 形式不正で翻訳できなかった: 原文のまま残す
            results[bi] = texts
            warnings += texts.length
          }
          done += texts.length
          o.onProgress(done, total)
        }
      })
    )
    pending = batches.map((_, i) => i).filter((i) => !results[i])
  }

  const map = new Map<string, string>()
  batches.forEach((idx, bi) => {
    const tr = results[bi] as string[]
    idx.forEach((i, j) => {
      const r = restore(tr[j], prot[i].tokens)
      if (r === null) {
        warnings++
        return
      }
      map.set(ex.texts[i], r)
    })
  })

  const indent = clean.match(/^[ \t]+(?=\S)/m)?.[0] ?? 2
  const outText = JSON.stringify(ex.build(map), null, indent) + (/\n$/.test(clean) ? '\n' : '')
  return { text: outText, warnings, used: [...used] }
}
