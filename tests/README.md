# Native tray tests

Run protocol and preference checks with `mise run test` and `mise run test-prefs`.

`statusNotifierClicks.js` runs inside GNOME Shell and injects pointer presses and releases through Clutter. It checks application menus in the panel and compact grid, then restores the visible limit and overflow settings. Run it from Looking Glass, adjusting the checkout path below. Wait for the console's close animation before testing or recreating panels; its modal grab otherwise intercepts pointer input.

```js
(async () => {
  const { testTrayClicks } = await import('file:///absolute/path/to/dash-to-panel/tests/statusNotifierClicks.js')
  Main.lookingGlass.close()
  await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 700, () => {
    resolve()
    return GLib.SOURCE_REMOVE
  }))
  if (Main.modalCount !== 0) throw new Error('Close desktop dialogs before testing')
  return await testTrayClicks(global.dashToPanel.panels[0].panelManager._systemTray)
})()
```
