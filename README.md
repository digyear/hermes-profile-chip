# Profile Chip

A draft-aware profile readout **and click-to-switch profile menu** for the
**Hermes Desktop status bar**.

On a multi-profile / multi-gateway desktop — especially in the **All sessions**
view — a brand-new draft (`Ctrl+N`) shows no profile anywhere: the title-bar
profile tag and sidebar badges only mount after the first message creates the
stored session. Profile Chip names the owner up front, in the left status-bar
cluster, with the app's own profile mark — and lets you start the draft in any
profile on any registered gateway without leaving the keyboard.

## What it shows

- The profile mark + name of the chat in focus — including a fresh draft that
  has no session yet.
- `default`: the neutral `home` codicon (core intentionally leaves the root
  profile uncolored). Named profiles: a soft-tinted initial tile in the
  deterministic identity hue — the same glyph and color as the profile rail
  and Bot Mode avatars.
- On hover: `Profile: <name> · Gateway: <connection label>`, so two gateways'
  `default` profiles never read alike.

The chip copies the core `STATUSBAR_ACTION_CLASS` (11px, `--ui-text-tertiary`,
standard hover), so it reads as a native status-bar item.

## Switching profile / gateway

Click the chip (it carries a small `▾`) to open a dropdown grouped by gateway:

- Every registered connection gets a section (`This device`, each remote
  gateway), listing that gateway's profiles — the same list the profile rail
  reads, fetched per connection via `host.profiles.list({ connectionId })`
  without swapping the foreground.
- `host.profileRoutes()` inventories the whole connection registry and is the
  authority on what a new chat can target; the per-gateway lists are
  cross-checked against it. Connect-on-demand SSH sources appear through their
  credential-free seed route and dial on first pick.
- The current (gateway, profile) carries a `✓`; your current gateway's section
  comes first.
- Picking an entry opens a fresh draft on that exact (connection, profile) via
  `host.newChat(route)`. Text already typed in the current draft is carried
  over to the new one (`host.composer` draft get/set).
- Menu chrome, keyboard navigation and outside-click dismissal come from the
  SDK's `DropdownMenu` kit — the same components core menus use.
- Strings follow the app language (English fallback, Simplified Chinese
  bundled) through the plugin i18n surface.

On shells without the menu / `newChat` APIs the chip degrades to the plain
readout, and clicking it re-reads the connection registry (handy right after
renaming a gateway).

## Install

From the Hermes plugin catalog (once the entry is merged):

```bash
hermes plugins install profile-chip
```

or in Desktop: **Settings → Plugins → Catalog → Profile Chip → Install**, then
enable the Desktop component.

Manual install (any build):

```bash
mkdir -p "<HERMES_HOME>/desktop-plugins/profile-chip"
cp desktop/plugin.js "<HERMES_HOME>/desktop-plugins/profile-chip/plugin.js"
```

`<HERMES_HOME>` is `~/.hermes` by default (`%LOCALAPPDATA%\hermes` on Windows).
Desktop plugins are app-level: one `desktop-plugins/` root serves every profile
and connection. The app watches that folder and hot-reloads on every save; if
the chip does not appear, run **Ctrl+K → Reload desktop plugins**. Enable or
disable it in **Capabilities → Plugins**.

## Compatibility

- Requires Hermes Desktop with the status-bar contribution surface
  (`>=0.23.0` recommended).
- Draft-aware ownership uses `host.state.focusedSessionOwner`; on older builds
  the chip degrades gracefully to the active gateway's profile.
- The picker menu feature-detects the `DropdownMenu` kit, `host.newChat`,
  `host.profiles.list` and `host.profileRoutes`; missing pieces fall back to
  the read-only chip instead of failing module load.
- `host.connections()` and `profileColor` are feature-detected; missing exports
  fall back to a local identity-hue hash.

## Privacy

Reads profile, connection and focused-session state, and reads/writes the
unsent composer draft (for carry-over), through the public Desktop SDK only.
No agent tools, hooks, middleware or env vars; no network calls, filesystem
access, shell, credentials or telemetry.

## Developer notes

One file, no build step. Disk plugins load uncompiled: UI is built with
`jsx()` from `react/jsx-runtime`, and only `@hermes/plugin-sdk`, `react` and
`react/jsx-runtime` are importable. See the
[Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)
for every surface this plugin touches.

## License

MIT
