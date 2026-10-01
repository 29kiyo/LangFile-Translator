export interface Replacement {
  /** 1始まりの行、列 (end は含まない。Monaco と同じ) */
  line: number
  startCol: number
  endCol: number
  text: string
}

/** テキストの指定範囲を置き換える (複数可。後ろから適用するので、同じ行に複数あってもずれない) */
export function applyReplacements(text: string, reps: Replacement[]): string {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  const abs = reps
    .filter((r) => starts[r.line - 1] !== undefined)
    .map((r) => ({
      s: starts[r.line - 1] + r.startCol - 1,
      e: starts[r.line - 1] + r.endCol - 1,
      text: r.text
    }))
    .sort((a, b) => b.s - a.s)
  let out = text
  for (const a of abs) out = out.slice(0, a.s) + a.text + out.slice(a.e)
  return out
}
