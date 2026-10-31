# via

**Integrity.** Always on, always an error, and it cannot be turned off.

A `key` action's `via` does not name the DOM call that produces the key's effect. Synthetic key events are untrusted, so the stage plays the real call and shows the key.

**Fix.** Use a value from the vocabulary, such as `el.click()` for Enter or `dialog.requestClose()` for Escape. `dispatch(keydown)` is for before pages, where a script listens for the key.
