import { LIBRE_LOCAL_URL, PROVIDER_PRESETS } from '@shared/providers'
import type { Provider, ProviderType } from '@shared/types'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export function initProviders(t: (key: string) => string): { render: () => void } {
  let providers: Provider[] = []
  let editing: Provider | null = null
  let isNew = false
  let dragId = ''
  let lastType: ProviderType = 'lmstudio'

  const list = $<HTMLUListElement>('provider-list')
  const form = $('provider-form')
  const fType = $<HTMLSelectElement>('pf-type')
  const fName = $<HTMLInputElement>('pf-name')
  const fMode = $<HTMLSelectElement>('pf-mode')
  const fUrl = $<HTMLInputElement>('pf-url')
  const fKey = $<HTMLInputElement>('pf-key')
  const fModel = $<HTMLInputElement>('pf-model')
  const fPriority = $<HTMLInputElement>('pf-priority')
  const fEnabled = $<HTMLInputElement>('pf-enabled')
  const result = $('pf-result')
  document.addEventListener('ui-lang-changed', () => {
    result.textContent = ''
  })
  const testBtn = $<HTMLButtonElement>('pf-test')

  for (const [type, p] of Object.entries(PROVIDER_PRESETS)) {
    const o = document.createElement('option')
    o.value = type
    o.textContent = p.label
    fType.appendChild(o)
  }

  const sorted = (): Provider[] => [...providers].sort((a, b) => a.priority - b.priority)
  const renumber = (order: Provider[]): void => order.forEach((p, i) => (p.priority = i + 1))
  const persist = async (): Promise<void> => {
    providers = (await window.api.setSettings({ providers })).providers
  }

  const render = (): void => {
    list.innerHTML = ''
    if (providers.length === 0) {
      const li = document.createElement('li')
      li.className = 'empty'
      li.textContent = t('providers.empty')
      list.appendChild(li)
      return
    }
    for (const p of sorted()) {
      const li = document.createElement('li')
      li.draggable = true
      li.classList.toggle('disabled', !p.enabled)

      const handle = document.createElement('span')
      handle.className = 'handle'
      handle.textContent = '⠿'
      const prio = document.createElement('span')
      prio.className = 'prio'
      prio.textContent = `#${p.priority}`
      const name = document.createElement('span')
      name.className = 'pname'
      name.textContent = p.name
      const meta = document.createElement('span')
      meta.className = 'meta'
      meta.textContent = PROVIDER_PRESETS[p.type].label + (p.model ? ` / ${p.model}` : '')
      const en = document.createElement('input')
      en.type = 'checkbox'
      en.className = 'switch'
      en.checked = p.enabled
      en.title = t('providers.enabled')
      const edit = document.createElement('button')
      edit.textContent = t('providers.edit')
      const del = document.createElement('button')
      del.textContent = t('providers.delete')
      li.append(handle, prio, name, meta, en, edit, del)

      en.addEventListener('change', async () => {
        p.enabled = en.checked
        li.classList.toggle('disabled', !p.enabled)
        await persist()
      })
      edit.addEventListener('click', () => openForm({ ...p }, false))

      // 削除は2回クリック (confirm ダイアログは Windows で入力欄のフォーカスが壊れることがあるため使わない)
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
        const next = sorted().filter((x) => x.id !== p.id)
        renumber(next)
        providers = next
        await persist()
        render()
      })

      // ドラッグ&ドロップで優先順位を並べ替え
      li.addEventListener('dragstart', (e) => {
        dragId = p.id
        li.classList.add('dragging')
        e.dataTransfer?.setData('text/plain', p.id)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      })
      li.addEventListener('dragend', () => {
        dragId = ''
        render()
      })
      li.addEventListener('dragover', (e) => {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        const r = li.getBoundingClientRect()
        const after = e.clientY > r.top + r.height / 2
        li.classList.toggle('over-bottom', after)
        li.classList.toggle('over-top', !after)
      })
      li.addEventListener('dragleave', () => li.classList.remove('over-top', 'over-bottom'))
      li.addEventListener('drop', async (e) => {
        e.preventDefault()
        li.classList.remove('over-top', 'over-bottom')
        const dragged = providers.find((x) => x.id === dragId)
        if (!dragged || dragged.id === p.id) return
        const r = li.getBoundingClientRect()
        const after = e.clientY > r.top + r.height / 2
        const order = sorted().filter((x) => x.id !== dragged.id)
        order.splice(order.findIndex((x) => x.id === p.id) + (after ? 1 : 0), 0, dragged)
        renumber(order)
        providers = order
        await persist()
        render()
      })

      list.appendChild(li)
    }
  }

  const applyTypeUI = (): void => {
    const type = fType.value as ProviderType
    const preset = PROVIDER_PRESETS[type]
    const local = type === 'libretranslate' && fMode.value === 'local'
    $('pf-mode-row').hidden = type !== 'libretranslate'
    $('pf-key-row').hidden = !preset.needsKey || local
    $('pf-model-row').hidden = !preset.needsModel
  }

  const openForm = (p: Provider, asNew: boolean): void => {
    editing = p
    isNew = asNew
    lastType = p.type
    fType.value = p.type
    fName.value = p.name
    fMode.value = p.mode ?? 'api'
    fUrl.value = p.baseUrl
    fKey.value = p.apiKey
    fModel.value = p.model
    fPriority.value = String(p.priority)
    fEnabled.checked = p.enabled
    result.textContent = ''
    $('pf-models').innerHTML = ''
    applyTypeUI()
    form.hidden = false
  }

  const readForm = (): Provider => {
    const type = fType.value as ProviderType
    return {
      id: editing?.id ?? newId(),
      type,
      name: fName.value.trim() || PROVIDER_PRESETS[type].label,
      baseUrl: fUrl.value.trim(),
      apiKey: fKey.value.trim(),
      model: fModel.value.trim(),
      enabled: fEnabled.checked,
      priority: Math.max(1, parseInt(fPriority.value, 10) || providers.length + 1),
      mode: type === 'libretranslate' ? (fMode.value as 'api' | 'local') : undefined
    }
  }

  $('btn-provider-add').addEventListener('click', () => {
    const preset = PROVIDER_PRESETS.lmstudio
    openForm(
      {
        id: newId(),
        type: 'lmstudio',
        name: preset.label,
        baseUrl: preset.baseUrl,
        apiKey: '',
        model: '',
        enabled: true,
        priority: providers.length + 1
      },
      true
    )
  })

  // 種類を選ぶとURLを自動入力
  fType.addEventListener('change', () => {
    const type = fType.value as ProviderType
    const preset = PROVIDER_PRESETS[type]
    if (!fName.value.trim() || fName.value === PROVIDER_PRESETS[lastType].label) fName.value = preset.label
    fMode.value = 'api'
    fUrl.value = preset.baseUrl
    fModel.value = ''
    lastType = type
    applyTypeUI()
  })
  fMode.addEventListener('change', () => {
    fUrl.value = fMode.value === 'local' ? LIBRE_LOCAL_URL : PROVIDER_PRESETS.libretranslate.baseUrl
    applyTypeUI()
  })

  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true
    result.textContent = t('providers.testing')
    const r = await window.api.testProvider(readForm())
    testBtn.disabled = false
    if (r.ok) {
      const shown = r.models.slice(0, 8).join(', ')
      result.textContent =
        t('providers.testOk') + (r.models.length ? ` (${r.models.length} ${t('providers.models')}): ${shown}` : '')
    } else {
      result.textContent = `${t('providers.testFail')}: ${r.message}`
    }
    if (r.ok && r.models.length && !fModel.value.trim()) {
      fModel.value = r.models.find((m) => !/embed/i.test(m)) ?? r.models[0]
    }
    const dl = $('pf-models')
    dl.innerHTML = ''
    for (const m of r.models) {
      const o = document.createElement('option')
      o.value = m
      dl.appendChild(o)
    }
  })

  $('pf-save').addEventListener('click', async () => {
    const p = readForm()
    if (!p.baseUrl) {
      result.textContent = t('providers.urlRequired')
      return
    }
    const next = isNew ? [...providers, p] : providers.map((x) => (x.id === p.id ? p : x))
    next.sort((a, b) => a.priority - b.priority || (a.id === p.id ? -1 : b.id === p.id ? 1 : 0))
    renumber(next)
    providers = next
    await persist()
    form.hidden = true
    render()
  })
  $('pf-cancel').addEventListener('click', () => {
    form.hidden = true
  })

  const dist = $<HTMLInputElement>('dist-enabled')
  dist.addEventListener('change', () => void window.api.setSettings({ distribution: { enabled: dist.checked } }))

  void window.api.getSettings().then((s) => {
    providers = s.providers ?? []
    dist.checked = s.distribution?.enabled ?? false
    render()
  })

  return { render }
}
