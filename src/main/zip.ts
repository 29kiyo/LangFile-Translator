import { strToU8, zipSync } from 'fflate'

export function makeZip(files: { name: string; content: string }[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const f of files) entries[f.name] = strToU8(f.content)
  return zipSync(entries, { level: 6 })
}
