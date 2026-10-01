import type { Untranslated } from '@shared/untranslated'

const MAX = 20
const expanded = new WeakMap<HTMLElement, boolean>()

/** 同じ行に複数あっても1行として数える */
function perLine(list: Untranslated[]): Untranslated[] {
  const seen = new Set<number>()
  const out: Untranslated[] = []
  for (const u of list) {
    if (!seen.has(u.line)) {
      seen.add(u.line)
      out.push(u)
    }
  }
  return out
}

export const uniqueLines = (list: Untranslated[]): number => perLine(list).length

/** 未翻訳の行番号の一覧を描く。0件のときは箱ごと隠す。番号のクリックで jump を呼ぶ */
export function renderUntranslated(
  box: HTMLElement,
  list: Untranslated[],
  t: (key: string) => string,
  jump: (u: Untranslated) => void,
  dismiss: (items: Untranslated[]) => void
): void {
  box.textContent = ''
  const items = perLine(list)
  if (items.length === 0) {
    expanded.delete(box)
    box.hidden = true
    return
  }
  box.hidden = false
  const label = document.createElement('span')
  label.className = 'un-label'
  label.textContent = t('un.label').replace('{n}', String(items.length))
  box.appendChild(label)
  const all = expanded.get(box) === true
  for (const u of all ? items : items.slice(0, MAX)) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'un-chip'
    b.textContent = String(u.line)
    b.title = `${u.kind === 'key' ? `${t('un.key')}: ` : ''}${u.source.slice(0, 120)}`
    b.title += `\n${t('un.dismissHint')}`
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      dismiss(list.filter((x) => x.line === u.line))
    })
    b.addEventListener('click', () => jump(u))
    box.appendChild(b)
  }
  if (!all && items.length > MAX) {
    const more = document.createElement('button')
    more.type = 'button'
    more.className = 'un-more'
    more.textContent = t('un.more').replace('{n}', String(items.length - MAX))
    more.addEventListener('click', () => {
      expanded.set(box, true)
      renderUntranslated(box, list, t, jump, dismiss)
    })
    box.appendChild(more)
  }
}
