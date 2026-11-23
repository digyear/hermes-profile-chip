// profile-chip — always-visible profile readout in the status bar, with a
// click-to-switch profile menu for new chats, grouped by gateway.
//
// The problem it solves: a brand-new draft (Ctrl+N) shows no profile anywhere
// in the chat pane — core's title-bar profile tag only mounts once the first
// message creates the stored session. This chip reads the FOCUSED chat owner,
// which falls back to the active gateway owner while no session exists, so the
// draft's (connection, profile) is named before the first send.
//
// Clicking the chip opens a dropdown listing EVERY registered gateway's
// profiles (host.profiles.list({connectionId}) per connection, cross-checked
// against host.profileRoutes(), which inventories the whole connection
// registry). Picking one opens a fresh draft on that exact (connection,
// profile) via host.newChat(route) — text already typed in the current draft
// is carried over — so switching profile or gateway no longer requires
// visiting the profile rail / connection switcher first. Connect-on-demand
// SSH sources appear through their credential-free seed route and dial on
// first pick. On shells without the menu/newChat APIs the chip degrades to
// the plain readout whose click refreshes the gateway labels.
//
// Surface: one statusBar.left contribution. Identity mark replicates core's
// ProfileGlyph vocabulary: default = home codicon (uncolored by design), named
// profiles = soft-tinted initial tile in the deterministic identity hue.
// Defensive against older shells: missing atoms/APIs degrade instead of throwing.
import * as SDK from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useState } from 'react'

const host = SDK.host
const ID = 'profile-chip'

// ---------------------------------------------------------------------------
// Strings (English fallback; Simplified Chinese bundled as 'zh').
// ---------------------------------------------------------------------------
const MESSAGES = {
  en: {
    menuHeader: 'New chat in profile…',
    loading: 'Loading profiles…',
    noProfiles: 'No profiles found',
    chipTipPick: (p, g) => `Profile: ${p} · Gateway: ${g} — click to start a new chat in another profile`,
    chipTipRefresh: (p, g) => `Profile: ${p} · Gateway: ${g} (click to refresh)`,
    openFailed: name => `Could not open profile "${name}"`
  },
  zh: {
    menuHeader: '新建会话，选择 profile…',
    loading: '正在加载 profile…',
    noProfiles: '未找到 profile',
    chipTipPick: (p, g) => `Profile: ${p} · 网关: ${g} — 点击选择其它 profile 新建会话`,
    chipTipRefresh: (p, g) => `Profile: ${p} · 网关: ${g}（点击刷新）`,
    openFailed: name => `无法打开 profile「${name}」`
  }
}

function fallbackTranslate(key, ...args) {
  const value = MESSAGES.en[key]
  return typeof value === 'function' ? value(...args) : (value ?? key)
}
let translate = fallbackTranslate

function useT() {
  // usePluginI18n re-renders on locale switches; fall back if unavailable.
  // The condition is build-stable, so hook order never changes across renders.
  return typeof SDK.usePluginI18n === 'function' ? SDK.usePluginI18n(ID) : fallbackTranslate
}

// Subscribe to a nanostore atom that may not exist on older builds.
function useAtomSafe(atom, fallback) {
  const [value, setValue] = useState(() =>
    atom && typeof atom.get === 'function' ? atom.get() : fallback
  )
  useEffect(() => {
    if (!atom || typeof atom.subscribe !== 'function') return undefined
    setValue(atom.get())
    return atom.subscribe(setValue)
  }, [atom])
  return value
}

// Core's deterministic identity color (lib/profile-color.ts): default/empty is
// intentionally uncolored; named profiles get hash*31 % 360 at S68% L58%.
// Inlined so older builds without the SDK export still match the palette.
function identityColor(name) {
  const key = String(name || '').trim()
  if (!key || key === 'default') return null
  try {
    if (typeof SDK.profileColor === 'function') {
      const c = SDK.profileColor(key)
      if (c) return c
    }
  } catch {
    // fall through to the inlined algorithm
  }
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360} 68% 58%)`
}

// First letter/number/emoji grapheme — same rule as core profileShortLabel.
function shortLabel(name) {
  const label = String(name || '').trim()
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    for (const { segment } of seg.segment(label)) {
      if (/[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(segment)) return segment
    }
  } catch {
    // older engine — fall back to first code point
  }
  return label ? Array.from(label)[0] : '?'
}

// Core ProfileGlyph replica (components/ui/profile-glyph.tsx): default =
// home codicon in quaternary text; named profiles = 16px rounded tile with
// a 22% soft tint of the identity color and the profile initial. The
// codicon font is loaded app-wide, so the same classes render identically.
function Glyph({ name }) {
  const isDefault = !String(name || '').trim() || String(name).trim() === 'default'
  if (isDefault) {
    return jsx('span', {
      className: 'grid size-4 shrink-0 place-items-center',
      children: jsx('i', {
        'aria-hidden': true,
        className: 'codicon codicon-home text-(--ui-text-quaternary)',
        style: { fontSize: '0.75rem' }
      })
    })
  }
  const color = identityColor(name)
  return jsx('span', {
    className:
      'grid size-4 shrink-0 place-items-center rounded-[3px] text-[0.5rem] font-semibold uppercase leading-none',
    style: {
      backgroundColor: `color-mix(in srgb, ${color || 'var(--ui-text-quaternary)'} 22%, transparent)`,
      color: color || undefined
    },
    children: shortLabel(name)
  })
}

// Module-level cache: connection id -> display label (tooltip + group headers).
const labelCache = new Map()

async function refreshLabels() {
  if (!host || typeof host.connections !== 'function') return
  try {
    const rows = await host.connections()
    for (const row of rows) {
      if (row && row.id) labelCache.set(String(row.id), String(row.label || row.id))
    }
  } catch {
    // Registry unavailable — fall back to raw ids.
  }
}

function connectionLabel(connectionId) {
  const id = String(connectionId || '').trim()
  if (!id || id === 'local') return labelCache.get('local') || 'This device'
  return labelCache.get(id) || id
}

// ---------------------------------------------------------------------------
// Profile switching (public SDK only).
// ---------------------------------------------------------------------------
function normalize(name) {
  return String(name ?? '').trim().toLowerCase() || 'default'
}

function labelOf(p) {
  return (p && (p.display_name || p.bot_title || p.name)) || 'default'
}

function sortProfiles(list) {
  // default first, then alphabetical — same order as the profile rail.
  return [...list].sort((a, b) => {
    if (Boolean(a.is_default) !== Boolean(b.is_default)) return a.is_default ? -1 : 1
    return labelOf(a).localeCompare(labelOf(b))
  })
}

/**
 * Every gateway's profiles, grouped by connection.
 * - profileRoutes() inventories ALL registered sources (incl. credential-free
 *   SSH seed routes), so it is the authority on what newChat can target.
 * - profiles.list({connectionId}) adds display names / default flags per
 *   gateway without swapping the foreground; cross-checked against the routes
 *   so a gateway that ignores the scope param cannot leak another's list.
 */
async function loadGroups(chipConnectionId) {
  const [routes, conns] = await Promise.all([
    typeof host.profileRoutes === 'function'
      ? host.profileRoutes().catch(() => [])
      : Promise.resolve([]),
    typeof host.connections === 'function'
      ? host.connections().catch(() => [])
      : Promise.resolve([])
  ])
  for (const row of conns || []) {
    if (row && row.id) labelCache.set(String(row.id), String(row.label || row.id))
  }
  const ids = (conns || []).map(c => c && c.id).filter(Boolean)
  for (const r of routes || []) {
    if (r && r.connectionId && !ids.includes(r.connectionId)) ids.push(r.connectionId)
  }
  const metas = await Promise.all(
    ids.map(id =>
      host.profiles
        .list({ connectionId: id })
        .then(res => (Array.isArray(res?.profiles) ? res.profiles : []))
        .catch(() => null)
    )
  )
  const groups = []
  ids.forEach((id, i) => {
    const routeNames = new Set(
      (routes || []).filter(r => r && r.connectionId === id).map(r => normalize(r.profile))
    )
    let list = metas[i] ? sortProfiles(metas[i]) : []
    if (routeNames.size) {
      const matched = list.filter(p => routeNames.has(normalize(p.name)))
      list = matched.length
        ? matched
        : sortProfiles([...routeNames].map(n => ({ name: n })))
    }
    if (list.length) groups.push({ id, profiles: list })
  })
  // The chip's own gateway first; registry order for the rest.
  groups.sort((a, b) => (a.id === chipConnectionId ? -1 : b.id === chipConnectionId ? 1 : 0))
  return { groups, routes: routes || [] }
}

async function readDraft() {
  if (typeof host.composer?.getDraft !== 'function') return ''
  try {
    return (await host.composer.getDraft('new')) ?? (await host.composer.getDraft(null)) ?? ''
  } catch {
    return ''
  }
}

/** Write the carried-over text into the new draft once its composer mounts. */
function restoreDraft(text) {
  if (!text || !text.trim() || typeof host.composer?.setDraft !== 'function') return
  let tries = 0
  const attempt = async () => {
    tries += 1
    let ok = false
    try {
      ok = await host.composer.setDraft('new', text)
    } catch {
      ok = false
    }
    if (!ok && tries < 12) setTimeout(attempt, 250)
  }
  setTimeout(attempt, 150)
}

async function switchTo(group, p, ctx, t) {
  const { current, connectionId, activeConnectionId, routes } = ctx
  if (group.id === connectionId && normalize(p.name) === normalize(current)) return
  const text = await readDraft()
  const route =
    (routes || []).find(
      r => r && r.connectionId === group.id && normalize(r.profile) === normalize(p.name)
    ) || null
  try {
    if (route) host.newChat(route)
    else if (group.id === activeConnectionId) host.newChat(p.name)
    else throw new Error(`no route for ${group.id}/${p.name}`)
  } catch (error) {
    host.notifyError?.(error, t('openFailed', labelOf(p)))
    return
  }
  restoreDraft(text)
}

// Menu kit present on this shell? (Build-stable; gates the whole dropdown.)
const MENU_READY =
  typeof SDK.DropdownMenu === 'function' &&
  typeof SDK.DropdownMenuTrigger === 'function' &&
  typeof SDK.DropdownMenuContent === 'function' &&
  typeof SDK.DropdownMenuItem === 'function'

function ProfileChip() {
  // Follows the chat the user is LOOKING AT; on a brand-new draft it resolves
  // to the active gateway's (connectionId, profile) — the case core hides.
  const owner = useAtomSafe(host && host.state.focusedSessionOwner, null)
  const activeProfile = useAtomSafe(host && host.state.profile, 'default')
  const activeConnectionId = useAtomSafe(host && host.state.connectionId, null)
  const [, bump] = useState(0)
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(null) // { groups, routes } | null
  const t = useT()

  const connectionId = (owner && owner.connectionId) || activeConnectionId || ''
  const profile = (owner && owner.profile) || activeProfile || 'default'

  useEffect(() => {
    let alive = true
    refreshLabels().then(() => {
      if (alive) bump(n => n + 1)
    })
    return () => {
      alive = false
    }
  }, [connectionId])

  const gateway = connectionLabel(connectionId)
  const canPick =
    MENU_READY &&
    !!host &&
    typeof host.newChat === 'function' &&
    !!host.profiles &&
    typeof host.profiles.list === 'function'

  const handleOpen = next => {
    setOpen(next)
    if (next && canPick) {
      // Refetch on every open; keep the previous list visible while loading.
      loadGroups(connectionId)
        .then(setMenu)
        .catch(() => setMenu({ groups: [], routes: [] }))
    }
  }

  // Same chrome as core interactive statusbar items (STATUSBAR_ACTION_CLASS):
  // 11px, tertiary text, normal weight, standard hover. One uniform text run.
  const button = jsx('button', {
    type: 'button',
    title: canPick ? t('chipTipPick', profile, gateway) : t('chipTipRefresh', profile, gateway),
    'aria-label': `Profile: ${profile}`,
    className:
      'inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground',
    onClick: canPick
      ? undefined
      : () => {
          void refreshLabels().then(() => bump(n => n + 1))
        },
    children: jsxs('span', {
      className: 'inline-flex items-center gap-1 whitespace-nowrap',
      children: [
        jsx(Glyph, { name: profile }),
        jsx('span', { children: profile }),
        canPick
          ? jsx('span', { 'aria-hidden': true, className: 'text-(--ui-text-quaternary)', children: '▾' })
          : null
      ]
    })
  })

  if (!canPick) return button

  const groups = (menu && menu.groups) || []
  const content = [
    jsx('div', {
      className: 'px-2 py-1.5 text-[0.6875rem] text-(--ui-text-tertiary)',
      children: t('menuHeader')
    }, 'header'),
    jsx(SDK.DropdownMenuSeparator, {}, 'sep-top')
  ]
  if (menu === null) {
    content.push(jsxs(SDK.DropdownMenuItem, { disabled: true, children: t('loading') }, 'loading'))
  } else if (!groups.length) {
    content.push(jsxs(SDK.DropdownMenuItem, { disabled: true, children: t('noProfiles') }, 'empty'))
  } else {
    groups.forEach((g, gi) => {
      if (groups.length > 1) {
        if (gi > 0) content.push(jsx(SDK.DropdownMenuSeparator, {}, `sep-${g.id}`))
        content.push(
          jsx('div', {
            className: 'px-2 py-1.5 text-[0.6875rem] text-(--ui-text-tertiary)',
            children: connectionLabel(g.id)
          }, `gh-${g.id}`)
        )
      }
      g.profiles.forEach(p => {
        content.push(
          jsxs(
            SDK.DropdownMenuItem,
            {
              onSelect: () =>
                void switchTo(
                  g,
                  p,
                  { current: profile, connectionId, activeConnectionId, routes: menu.routes },
                  t
                ),
              className: 'gap-2',
              children: [
                jsx(Glyph, { name: p.name }),
                jsx('span', { className: 'flex-1 truncate', children: labelOf(p) }),
                g.id === connectionId && normalize(p.name) === normalize(profile)
                  ? jsx('span', { className: 'text-(--ui-text-tertiary)', children: '✓' })
                  : null
              ]
            },
            `${g.id}:${p.name}`
          )
        )
      })
    })
  }

  return jsx(SDK.DropdownMenu, {
    open,
    onOpenChange: handleOpen,
    children: jsxs('span', {
      className: 'inline-flex h-full items-center',
      children: [
        jsx(SDK.DropdownMenuTrigger, { asChild: true, children: button }),
        jsx(SDK.DropdownMenuContent, {
          align: 'start',
          side: 'top',
          className: 'min-w-52',
          children: content
        })
      ]
    })
  })
}

export default {
  id: ID,
  name: 'Profile Chip',
  register(ctx) {
    if (ctx.i18n && typeof ctx.i18n.register === 'function') {
      ctx.i18n.register(MESSAGES)
      if (typeof ctx.i18n.t === 'function') translate = (key, ...args) => ctx.i18n.t(key, ...args)
    }
    ctx.register({
      id: 'chip',
      area: 'statusBar.left',
      order: 5,
      render: () => jsx(ProfileChip, {})
    })
  }
}
