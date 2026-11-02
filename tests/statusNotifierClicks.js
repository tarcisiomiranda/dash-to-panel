/* SPDX-License-Identifier: GPL-2.0-or-later */

import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import Shell from 'gi://Shell'

const wait = (milliseconds) =>
  new Promise((resolve) =>
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
      resolve()
      return GLib.SOURCE_REMOVE
    }),
  )

function assert(value, message) {
  if (!value) throw new Error(message)
}

export async function testTrayClicks(tray, captureDirectory = null) {
  const settings = tray._settings
  const saved = {
    enabled: settings.get_boolean('native-tray-overflow-enabled'),
    count: settings.get_int('native-tray-visible-count'),
  }
  const originalPointer = global.get_pointer()
  const pointer = Clutter.get_default_backend()
    .get_default_seat()
    .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE)
  const results = { inline: [], overflow: [] }
  const click = async (actor, button = 1) => {
    const [x, y] = actor.get_transformed_position()
    const [width, height] = actor.get_transformed_size()
    assert(
      actor.mapped && width > 0 && height > 0,
      'Click target is not mapped',
    )
    pointer.notify_absolute_motion(
      GLib.get_monotonic_time(),
      x + width / 2,
      y + height / 2,
    )
    await wait(100)
    pointer.notify_button(
      GLib.get_monotonic_time(),
      button,
      Clutter.ButtonState.PRESSED,
    )
    await wait(100)
    pointer.notify_button(
      GLib.get_monotonic_time(),
      button,
      Clutter.ButtonState.RELEASED,
    )
    await wait(200)
  }
  const labels = async (menu, id) => {
    let values = []
    for (let attempt = 0; attempt < 30; attempt++) {
      values = menu._getMenuItems().map((row) => row.label?.text || '')
      if (menu.isOpen && values.some((text) => text && text !== '…'))
        return values
      await wait(100)
    }
    throw new Error(`${id}: pointer click did not open a populated menu`)
  }
  const capture = async (actors, filename) => {
    if (!captureDirectory) return
    await wait(150)
    const bounds = actors.map((actor) => {
      const [x, y] = actor.get_transformed_position()
      const [width, height] = actor.get_transformed_size()
      return { x, y, right: x + width, bottom: y + height }
    })
    const x = Math.max(0, Math.floor(Math.min(...bounds.map((box) => box.x))))
    const y = Math.max(0, Math.floor(Math.min(...bounds.map((box) => box.y))))
    const right = Math.min(
      global.stage.width,
      Math.ceil(Math.max(...bounds.map((box) => box.right))),
    )
    const bottom = Math.min(
      global.stage.height,
      Math.ceil(Math.max(...bounds.map((box) => box.bottom))),
    )
    const stream = Gio.File.new_for_path(
      `${captureDirectory}/${filename}`,
    ).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null)
    try {
      await new Shell.Screenshot().screenshot_area(
        x,
        y,
        right - x,
        bottom - y,
        stream,
      )
    } finally {
      stream.close(null)
    }
  }
  try {
    settings.set_boolean('native-tray-overflow-enabled', false)
    await wait(300)
    const buttons = Array.from(tray._buttons.values()).filter(
      (button) =>
        button.visible && button._menuPath && button._menuPath !== '/',
    )
    assert(buttons.length > 0, 'No application menus are available to test')
    for (const button of buttons) {
      const id = button.item.properties.Id
      await click(button)
      const values = await labels(button.menu, id)
      if (id === 'synergy-3')
        await capture([button.menu.actor], 'native-tray-inline-menu.png')
      await click(button)
      assert(!button.menu.isOpen, `${id}: second click did not close the menu`)
      await click(button, 3)
      await labels(button.menu, id)
      button.menu.close()
      await wait(100)
      results.inline.push({
        id,
        labels: values,
        left: true,
        right: true,
        toggle: true,
      })
    }
    settings.set_boolean('native-tray-overflow-enabled', true)
    settings.set_int('native-tray-visible-count', 0)
    await wait(250)
    const overflow = tray._overflow
    await click(overflow.button)
    assert(
      overflow.button.menu.isOpen,
      'Arrow click did not open the icon grid',
    )
    for (const button of buttons) {
      const id = button.item.properties.Id
      const entry = overflow.tiles.get(button.item.key)
      assert(entry, `${id}: overflow tile is missing`)
      await click(entry.button)
      const values = await labels(entry.menu, id)
      assert(
        overflow.button.menu.isOpen,
        `${id}: application menu closed the grid`,
      )
      if (id === 'synergy-3')
        await capture(
          [overflow.button.menu.actor, entry.menu.actor],
          'native-tray-popup-menu.png',
        )
      entry.menu.close()
      await wait(100)
      results.overflow.push({ id, labels: values, left: true })
    }
    return results
  } finally {
    tray._overflow?.button.menu.close()
    for (const button of tray._buttons.values()) button.menu.close()
    settings.set_int('native-tray-visible-count', saved.count)
    settings.set_boolean('native-tray-overflow-enabled', saved.enabled)
    pointer.notify_absolute_motion(
      GLib.get_monotonic_time(),
      originalPointer[0],
      originalPointer[1],
    )
  }
}
