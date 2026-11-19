# Profile Chip

A draft-aware profile readout for the **Hermes Desktop status bar**.

On a multi-profile / multi-gateway desktop — especially in the **All sessions**
view — a brand-new draft (`Ctrl+N`) shows no profile anywhere: the title-bar
profile tag and sidebar badges only mount after the first message creates the
stored session. Profile Chip names the owner up front, in the left status-bar
cluster, with the app's own profile mark.

## What it shows

- The profile mark + name of the chat in focus — including a fresh draft that
  has no session yet.
- `default`: the neutral `home` codicon (core intentionally leaves the root
  profile uncolored). Named profiles: a soft-tinted initial tile in the
  deterministic identity hue — the same glyph and color as the profile rail
  and Bot Mode avatars.
- On hover: `Profile: <name> · Gateway: <connection label>`, so two gateways'
  `default` profiles never read alike. Click re-reads the connection registry
  (handy right after renaming a gateway).

The chip copies the core `STATUSBAR_ACTION_CLASS` (11px, `--ui-text-tertiary`,
standard hover), so it reads as a native status-bar item.

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
- `host.connections()` and `profileColor` are feature-detected; missing exports
  fall back to a local identity-hue hash instead of failing module load.

## Privacy

Reads profile, connection and focused-session state through the public Desktop
SDK only. No agent tools, hooks, middleware or env vars; no network calls,
filesystem access, shell, credentials or telemetry.

## Developer notes

One file, no build step. Disk plugins load uncompiled: UI is built with
`jsx()` from `react/jsx-runtime`, and only `@hermes/plugin-sdk`, `react` and
`react/jsx-runtime` are importable. See the
[Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)
for every surface this plugin touches.

## License

MIT
