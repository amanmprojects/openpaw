---
name: ink-tui
description: |-
  Build terminal UIs with Ink (React for CLIs). Use for interactive CLI apps,
  dashboards, menus, forms, progress indicators, and terminal-based interfaces.

  Use proactively when user says "build TUI", "terminal UI", "CLI interface",
  "ink component", "ink spinner", "ink select", "terminal dashboard",
  or mentions React-style terminal apps.

  Examples:
  - user: "Create an interactive CLI menu" → build with Ink + ink-select-input
  - user: "Add a progress bar to my CLI" → implement with ink-progress-bar or @inkjs/ui
  - user: "Build a terminal dashboard" → compose Box/Text with hooks and ecosystem components
  - user: "Make a multi-step wizard CLI" → ink-stepper or multi-screen pattern
  - user: "Add keyboard navigation to my CLI" → useInput, useFocus, useFocusManager
---

# Ink TUI Skill

Build rich, interactive terminal UIs using [Ink](https://github.com/vadimdemedes/ink) — React for CLIs.
Used by Claude Code, Gemini CLI, Cloudflare Wrangler, Shopify CLI, Prisma, and more.

## References

- `references/ink-readme.md` — Full official Ink API: all components, hooks, render options, testing, ARIA
- `references/ecosystem-components.md` — Third-party components: @inkjs/ui, ink-spinner, ink-select-input, ink-table, ink-task-list, ink-form, ink-gradient, and 25+ more
- `references/best-practices.md` — Architecture patterns, performance, input handling, testing, pitfalls

---

## Quick Start

```sh
npx create-ink-app --typescript my-cli
# or manually:
npm install ink react @types/react
```

```tsx
import React from 'react';
import {render, Box, Text, useInput, useApp} from 'ink';

const App = () => {
  const {exit} = useApp();

  useInput((input, key) => {
    if (input === 'q') exit();
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">My CLI</Text>
      <Text dimColor>Press q to quit</Text>
    </Box>
  );
};

render(<App />);
```

---

## Core Components

| Component | Purpose |
|---|---|
| `<Text>` | Render styled text (color, bold, italic, underline, wrap/truncate) |
| `<Box>` | Flexbox layout container — padding, margin, border, gap, flex props |
| `<Newline>` | Insert `\n` inside `<Text>` |
| `<Spacer>` | Flexible space between items |
| `<Static>` | Permanently rendered output (completed tasks, logs) |
| `<Transform>` | Transform string output (gradients, effects) |

## Core Hooks

| Hook | Purpose |
|---|---|
| `useInput(handler, {isActive})` | Keyboard input handling |
| `useApp()` | `{exit}` — unmount the app |
| `useFocus({id, autoFocus, isActive})` | `{isFocused}` — focusable components |
| `useFocusManager()` | `{focusNext, focusPrevious, focus, activeId}` |
| `useStdout()` | `{write}` — write outside Ink's output |
| `useStdin()` | `{isRawModeSupported, setRawMode}` |
| `useCursor()` | `{setCursorPosition}` — IME cursor control |
| `useIsScreenReaderEnabled()` | Accessibility detection |

---

## Workflow

### 1. Assess the TUI type needed
- **Static output** (progress, logs): use `<Static>` + simple state
- **Interactive menu**: use `ink-select-input` or `@inkjs/ui Select`
- **Form**: use `ink-form` or `@inkjs/ui TextInput`
- **Dashboard**: compose `<Box>` layout + `ink-use-stdout-dimensions`
- **Multi-screen**: use screen state + `useInput` for navigation

### 2. Choose components from ecosystem
Consult `references/ecosystem-components.md` for the right package.
Prefer `@inkjs/ui` for standard inputs — it's the official library.

### 3. Structure the app
```
src/
  cli.tsx          ← render() entry point
  app.tsx          ← root App component (handles global input)
  components/      ← reusable UI components
  screens/         ← top-level screen components
```

### 4. Handle input correctly
- Use `useInput` with `{isActive}` to prevent input conflicts between panels
- Always guard `setRawMode` with `isRawModeSupported`
- Clean up all timers and listeners in `useEffect` return

### 5. Performance
- Use `<Static>` for completed/immutable output — never re-renders
- Set `incrementalRendering: true` for frequently updating UIs
- Use `ink-virtual-list` for lists with 100+ items
- Batch state updates to minimize re-renders

---

## Common Patterns

### Loading + Spinner
```tsx
import Spinner from 'ink-spinner';

{loading ? (
  <Text color="green"><Spinner type="dots" /> Processing...</Text>
) : (
  <Text color="green">Done!</Text>
)}
```

### Bordered Panel with Title
```tsx
<Box borderStyle="round" borderColor="blue" flexDirection="column" padding={1}>
  <Text bold>Panel Title</Text>
  <Text>{content}</Text>
</Box>
```

### Task List
```tsx
import {TaskList, Task} from 'ink-task-list';

<TaskList>
  <Task label="Step 1" state="success" />
  <Task label="Step 2" state="loading" />
  <Task label="Step 3" state="pending" />
</TaskList>
```

### Keyboard-Navigated List
```tsx
const [index, setIndex] = useState(0);

useInput((input, key) => {
  if (key.upArrow) setIndex(i => Math.max(0, i - 1));
  if (key.downArrow) setIndex(i => Math.min(items.length - 1, i + 1));
  if (key.return) onSelect(items[index]);
});

return (
  <Box flexDirection="column">
    {items.map((item, i) => (
      <Text key={item.id} color={i === index ? 'blue' : undefined}>
        {i === index ? '▶ ' : '  '}{item.label}
      </Text>
    ))}
  </Box>
);
```

### Multi-Screen App
```tsx
type Screen = 'home' | 'list' | 'detail';
const [screen, setScreen] = useState<Screen>('home');

useInput((input, key) => {
  if (key.escape && screen !== 'home') setScreen('home');
  if (input === 'q') exit();
});

const screens: Record<Screen, JSX.Element> = {
  home: <HomeScreen onNavigate={setScreen} />,
  list: <ListScreen onSelect={() => setScreen('detail')} />,
  detail: <DetailScreen onBack={() => setScreen('list')} />,
};

return screens[screen];
```

### Terminal Dimensions
```tsx
import useStdoutDimensions from 'ink-use-stdout-dimensions';

const [columns, rows] = useStdoutDimensions();
<Box width={columns} height={rows}>...</Box>
```

### Status Message (success/error/warning)
```tsx
const StatusMessage: React.FC<{ type: 'success' | 'error' | 'warning'; message: string }> = ({
  type,
  message,
}) => {
  const config = {
    success: { icon: '✅', color: 'green' },
    error: { icon: '❌', color: 'red' },
    warning: { icon: '⚠️', color: 'yellow' },
  };
  const { icon, color } = config[type];

  return (
    <Box>
      <Text color={color}>{icon} {message}</Text>
    </Box>
  );
};
```

### Collapsible Section
```tsx
const CollapsibleSection: React.FC<{
  title: string; isOpen: boolean; children: React.ReactNode
}> = ({ title, isOpen, children }) => (
  <Box flexDirection="column">
    <Text bold>{isOpen ? '▼' : '▶'} {title}</Text>
    {isOpen && <Box marginLeft={2}>{children}</Box>}
  </Box>
);
```

### List with Icons
```tsx
interface ListItem {
  icon: string;
  label: string;
  value: string;
}

const List: React.FC<{ items: ListItem[] }> = ({ items }) => (
  <Box flexDirection="column">
    {items.map((item, i) => (
      <Box key={i}>
        <Text color="yellow">{item.icon} </Text>
        <Text bold>{item.label}: </Text>
        <Text>{item.value}</Text>
      </Box>
    ))}
  </Box>
);
```

### Custom useInterval Hook
```tsx
function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// Usage: custom spinner without ink-spinner
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const [frame, setFrame] = useState(0);
useInterval(() => setFrame((prev) => (prev + 1) % frames.length), 80);
```

### Custom useAsync Hook
```tsx
function useAsync<T>(asyncFunction: () => Promise<T>) {
  const [state, setState] = useState<{
    loading: boolean; error: Error | null; data: T | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    let mounted = true;
    asyncFunction()
      .then((data) => {
        if (mounted) setState({ loading: false, error: null, data });
      })
      .catch((error: Error) => {
        if (mounted) setState({ loading: false, error, data: null });
      });
    return () => { mounted = false; };
  }, [asyncFunction]);

  return state;
}
```

---

## render() Key Options

```tsx
render(<App />, {
  exitOnCtrlC: true,          // default: true
  patchConsole: true,          // prevent console.log conflicts
  incrementalRendering: true,  // only redraw changed lines
  maxFps: 30,                  // default: 30fps
  concurrent: true,            // React concurrent mode + Suspense
  kittyKeyboard: {mode: 'auto'}, // enhanced keyboard (kitty/WezTerm/Ghostty)
});
```

---

## Testing

```tsx
import {render} from 'ink-testing-library';

const {lastFrame, stdin} = render(<MyComponent prop="value" />);
expect(lastFrame()).toContain('Expected text');
stdin.write('q'); // simulate keypress
```

---

## Pitfalls to Avoid

1. **No `<Box>` inside `<Text>`** — only text nodes and nested `<Text>` allowed
2. **`measureElement` only works in `useEffect`** — not during render (returns 0,0)
3. **Always guard `setRawMode` with `isRawModeSupported`**
4. **Always cleanup timers/listeners** in `useEffect` return
5. **Don't use `console.log`** — use `useStdout().write()` or rely on `patchConsole`
6. **Use `<Static>` for completed output** — don't re-render immutable items
7. **Batch state updates** — separate `setState` calls cause separate renders
8. **Don't use DOM APIs** (`document`, `window`) — no browser globals in terminal
9. **Don't use CSS classes or inline styles** — use Ink props (`color`, `backgroundColor`, `borderStyle`, etc.)
10. **Don't create deeply nested component trees** — keep layouts flat
11. **Check `useEffect` dependency arrays** — missing deps cause stale closures; extra deps cause re-render loops
12. **Guard async state updates** — check `mounted` flag before `setState` in async callbacks to avoid updates on unmounted components
13. **Use `React.memo`** for expensive components that receive stable props
14. **Wrap risky components in error boundaries** to prevent full app crashes
