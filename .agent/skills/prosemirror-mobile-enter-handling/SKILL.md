---
name: ProseMirror Enter Handling for Mobile
description:
  Best practices for handling Enter key events in ProseMirror/Milkdown editors
  to ensure consistent behavior on mobile devices and IME.
---

# ProseMirror/Milkdown Mobile Enter Key Handling

## Problem

When customizing the `Enter` key behavior in ProseMirror (or Milkdown) using
`keydown` handlers (e.g., in `@milkdown/plugin-listener`), simply returning
`false` to let the "default behavior" take over is often insufficient on mobile
devices.

On mobile browsers, especially when using virtual keyboards or IME (Input Method
Editors), the `Enter` key event might:

1. Be interpreted as part of a composition session.
2. Trigger a default "insert newline" behavior instead of a "split list item"
   command.
3. Be swallowed or handled differently than on desktop.

This leads to issues like:

- Pressing Enter in a list item inserts a `<br>` or soft break instead of
  creating a new bullet point.
- Duplicate bullet points or erratic cursor movement.

## Solution

Instead of relying on the default handler (by returning `false`), you should
**explicitly execute the desired Prosemirror command** when your condition is
met.

### Incorrect Approach (Passive)

```typescript
if (key === "Enter") {
  if (isInListItem) {
    return false; // Hoping the default handler picks it up
  }
  // ... custom logic
}
```

### Correct Approach (Active)

Explicitly import and run the command that performs the standard action (e.g.,
`splitListItem`).

```typescript
import { splitListItem } from "@milkdown/prose/schema-list";

if (key === "Enter") {
  if (isInListItem) {
    // Force the specific command to run
    const command = splitListItem(schema.nodes.list_item);
    if (command(state, dispatch)) {
      return true; // Mark as handled
    }
  }
  // ... custom logic
}
```

## Why it works

By programmatically executing the command (`splitListItem`), you bypass the
ambiguity of how the browser or OS interprets the raw keyboard event. You tell
the editor engine directly: "Perform a list split operation now," ensuring
consistent behavior across Desktop and Mobile.
