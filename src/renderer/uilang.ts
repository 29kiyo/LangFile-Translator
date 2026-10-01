import { validateLocale, type LocaleDict } from '@shared/locale-file'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

/** 言語コードの表示名 (その言語自身での名前 + コード。例: français (France) (fr-fr)) */
export function langDisplayName(code: string): string {
  let name = code
  try {
    name = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
  } catch {
    name = code
  }
  return name === code ? code : `${name} (${code})`
}

export interface UiLangDeps {
  t: (key: string) => string
  /** 英語の辞書 (言語ファイルの検証と雛形に使う) */
  en: LocaleDict
  /** 追加済みの言語 (コード → 辞書) */
  custom: () => Record<string, LocaleDict>
  /** 追加・削除のあとに、言語の一覧と表示を読み直す */
  reload: () => Promise<void>
}

/** 設定画面の「表示言語の追加」 */
export function initUiLang(d: UiLangDeps): { render: () => void } {
  const { t } = d
  const list = $<HTMLUListElement>('uil-list')
  const result = $('uil-result')
  document.addEventListener('ui-lang-changed', () => {
    result.textContent = ''
  })

  const render = (): void => {
    list.innerHTML = ''
    const all = d.custom()
    const codes = Object.keys(all).sort()
    list.hidden = codes.length === 0
    for (const code of codes) {
      const missing = Object.keys(d.en).filter((k) => !all[code][k]).length
      const li = document.createElement('li')
      const name = document.createElement('span')
      name.className = 'uname'
      name.textContent = langDisplayName(code)
      const meta = document.createElement('span')
      meta.className = 'umeta'
      meta.textContent = missing ? t('uil.missing').replace('{n}', String(missing)) : t('uil.complete')
      const del = document.createElement('button')
      del.textContent = t('providers.delete')
      // 削除は2回クリック (confirm ダイアログは使わない)
      let armed = false
      del.addEventListener('click', async () => {
        if (!armed) {
          armed = true
          del.textContent = t('providers.confirmDelete')
          setTimeout(() => {
            armed = false
            del.textContent = t('providers.delete')
          }, 3000)
          return
        }
        await window.api.deleteUiLocale(code)
        await d.reload()
      })
      li.append(name, meta, del)
      list.appendChild(li)
    }
  }

  $('uil-add').addEventListener('click', async () => {
    const files = await window.api.pickUiLocaleFiles()
    if (files.length === 0) return
    const lines: string[] = []
    let changed = false
    for (const f of files) {
      const c = validateLocale(f.name, f.text, d.en, f.tooBig)
      if (!c.ok) {
        lines.push(`${f.name}: ${t(`uil.err.${c.error ?? 'badJson'}`)}`)
        continue
      }
      const r = await window.api.saveUiLocale({
        code: c.code,
        dict: c.dict,
        sourcePath: f.path,
        confirm: {
          message: t('uil.confirmDelete').replace('{file}', f.name),
          yes: t('uil.delete'),
          no: t('uil.keep')
        }
      })
      if (!r.ok) {
        lines.push(`${f.name}: ${t('tr.failed')}: ${r.message}`)
        continue
      }
      changed = true
      const parts = [t('uil.added').replace('{code}', c.code)]
      if (c.missing.length) parts.push(t('uil.missing').replace('{n}', String(c.missing.length)))
      if (r.deleted) parts.push(t('uil.deleted'))
      if (r.message) parts.push(r.message)
      lines.push(`${f.name}: ${parts.join(' / ')}`)
    }
    result.textContent = lines.join('\n')
    if (changed) await d.reload()
  })

  $('uil-template').addEventListener('click', async () => {
    const p = await window.api.saveFile('en.json', `${JSON.stringify(d.en, null, 2)}\n`)
    result.textContent = t('editor.saved') + p
  })

  document.addEventListener('i18n-changed', render)
  return { render }
}
