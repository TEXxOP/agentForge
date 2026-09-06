import { ArrowDown, ArrowUp, Command, Compass, CornerDownLeft, FlaskConical, Keyboard, Search, SearchX, Settings2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import './command-palette.css';

const CHORD_WINDOW_MS = 1200;
const isApple = typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.userAgent || '');
const metaLabel = isApple ? '⌘' : 'Ctrl';
const groupIcons = { navigate: Compass, prove: FlaskConical, session: Settings2 };

const paletteKeys = [
  { label: 'Open the command palette', keys: [metaLabel, 'K'] },
  { label: 'Open the palette from anywhere', keys: ['/'] },
  { label: 'Show this shortcut list', keys: ['?'] },
  { label: 'Move between commands', keys: ['↑', '↓'] },
  { label: 'Jump to first or last command', keys: ['Home', 'End'] },
  { label: 'Run the highlighted command', keys: ['↵'] },
  { label: 'Close', keys: ['Esc'] }
];

function lower(value) {
  return typeof value === 'string' ? value.toLowerCase() : String(value == null ? '' : value).toLowerCase();
}

function groupIcon(name) {
  return groupIcons[lower(name)] || Command;
}

function isEditable(target) {
  if (!target || typeof target.tagName !== 'string') return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return target.isContentEditable === true;
}

function haystack(command) {
  const keys = Array.isArray(command.keys) ? command.keys.join(' ') : '';
  return lower(`${command.label} ${command.group || ''} ${command.hint || ''} ${command.id || ''} ${keys}`);
}

function chordOf(command) {
  const keys = Array.isArray(command.keys) ? command.keys.map((key) => lower(key)) : [];
  if (keys.length !== 2) return null;
  return keys[0].length === 1 && keys[1].length === 1 ? keys : null;
}

function KeyCaps({ keys, joiner }) {
  if (!Array.isArray(keys) || !keys.length) return null;
  const parts = [];
  keys.forEach((key, index) => {
    if (index > 0 && joiner) parts.push(<i key={`joiner-${index}`}>{joiner}</i>);
    parts.push(<kbd key={`cap-${index}`}>{key}</kbd>);
  });
  return <span className="command-keys mono">{parts}</span>;
}

function ShortcutList({ chords, onBack }) {
  return (
    <div className="command-shortcuts">
      <div className="command-shortcuts-head">
        <span className="mono-label">KEYBOARD CONTROL</span>
        <button type="button" className="command-toggle mono" onClick={onBack}>
          <Search size={12} /> Commands
        </button>
      </div>
      <div className="shortcut-block">
        {paletteKeys.map((item) => (
          <div className="shortcut-row" key={item.label}>
            <span>{item.label}</span>
            <KeyCaps keys={item.keys} />
          </div>
        ))}
      </div>
      {chords.length ? (
        <div className="shortcut-block">
          <span className="mono-label">JUMP TO</span>
          {chords.map((command) => (
            <div className="shortcut-row" key={command.id || command.label}>
              <span>{command.label}</span>
              <KeyCaps keys={command.keys} joiner="then" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CommandPalette({ commands }) {
  const [mode, setMode] = useState(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  const restoreRef = useRef(null);
  const chordRef = useRef(null);
  const stateRef = useRef({ mode: null, commands: [] });

  const list = (Array.isArray(commands) ? commands : []).filter(
    (command) => command && typeof command.run === 'function' && typeof command.label === 'string'
  );

  useEffect(() => {
    stateRef.current.mode = mode;
    stateRef.current.commands = list;
  });

  const closePalette = useCallback(() => {
    if (!stateRef.current.mode) return;
    stateRef.current.mode = null;
    chordRef.current = null;
    setMode(null);
    const previous = restoreRef.current;
    restoreRef.current = null;
    if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
      try {
        previous.focus();
      } catch (error) {
        /* focus restore is best effort */
      }
    }
  }, []);

  const openPalette = useCallback((nextMode = 'search') => {
    if (!stateRef.current.mode) {
      const active = document.activeElement;
      restoreRef.current = active && active !== document.body ? active : null;
      setQuery('');
      setActiveIndex(0);
    }
    stateRef.current.mode = nextMode;
    setMode(nextMode);
  }, []);

  const runCommand = useCallback(async (command) => {
    if (!command || typeof command.run !== 'function') return;
    closePalette();
    try {
      await command.run();
    } catch (error) {
      console.warn('[AgentProof] command failed', command.id || command.label, error);
    }
  }, [closePalette]);

  useEffect(() => {
    const opener = () => openPalette('search');
    window.__agentproofOpenPalette = opener;
    return () => {
      if (window.__agentproofOpenPalette === opener) delete window.__agentproofOpenPalette;
    };
  }, [openPalette]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || typeof event.key !== 'string') return;
      const open = Boolean(stateRef.current.mode);
      const key = event.key;

      if ((event.metaKey || event.ctrlKey) && !event.altKey && key.toLowerCase() === 'k') {
        event.preventDefault();
        if (open) closePalette();
        else openPalette('search');
        return;
      }

      if (key === 'Escape') {
        if (!open) return;
        event.preventDefault();
        closePalette();
        return;
      }

      if (open || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditable(event.target)) return;

      if (key === '/' || key === '?') {
        event.preventDefault();
        openPalette(key === '?' ? 'shortcuts' : 'search');
        return;
      }

      if (key.length !== 1) return;

      const pressed = key.toLowerCase();
      const pending = chordRef.current;
      chordRef.current = null;
      if (pending && Date.now() - pending.at < CHORD_WINDOW_MS) {
        const match = stateRef.current.commands.find((command) => {
          const chord = chordOf(command);
          return chord && chord[0] === pending.key && chord[1] === pressed;
        });
        if (match) {
          event.preventDefault();
          runCommand(match);
          return;
        }
      }
      const startsChord = stateRef.current.commands.some((command) => {
        const chord = chordOf(command);
        return chord && chord[0] === pressed;
      });
      if (startsChord) chordRef.current = { key: pressed, at: Date.now() };
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closePalette, openPalette, runCommand]);

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = tokens.length
    ? list.filter((command) => {
      const hay = haystack(command);
      return tokens.every((token) => hay.includes(token));
    })
    : list;

  const flat = [];
  const groupNames = [];
  const grouped = new Map();
  visible.forEach((command) => {
    const name = typeof command.group === 'string' && command.group.trim() ? command.group.trim() : 'Commands';
    if (!grouped.has(name)) {
      grouped.set(name, []);
      groupNames.push(name);
    }
    grouped.get(name).push(command);
  });
  const groups = groupNames.map((name) => ({
    name,
    items: grouped.get(name).map((command) => {
      const index = flat.length;
      flat.push(command);
      return { command, index };
    })
  }));
  const safeIndex = flat.length ? Math.min(activeIndex, flat.length - 1) : -1;
  const chordCommands = list.filter((command) => chordOf(command));

  useEffect(() => {
    if (!mode) return;
    if (mode === 'search') inputRef.current?.focus();
    else panelRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode !== 'search') return;
    const container = listRef.current;
    const row = container?.querySelector('[data-active="true"]');
    if (!container || !row) return;
    const header = row.previousElementSibling;
    const top = header && header.classList.contains('command-group') ? header.offsetTop : row.offsetTop;
    const bottom = row.offsetTop + row.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
  }, [activeIndex, mode, query]);

  const move = (delta) => {
    if (!flat.length) return;
    setActiveIndex((current) => {
      const base = current >= flat.length ? flat.length - 1 : Math.max(current, 0);
      return (base + delta + flat.length) % flat.length;
    });
  };

  const onPanelKeyDown = (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      if (mode === 'search') inputRef.current?.focus();
      return;
    }
    if (mode !== 'search' || event.nativeEvent?.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(flat.length - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (safeIndex >= 0) runCommand(flat[safeIndex]);
    }
  };

  return (
    <AnimatePresence>
      {mode ? (
        <motion.div
          key="agentproof-command-overlay"
          className="command-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePalette();
          }}
        >
          <motion.div
            ref={panelRef}
            className="command-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            tabIndex={-1}
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            onKeyDown={onPanelKeyDown}
          >
            {mode === 'search' ? (
              <Fragment>
                <div className="command-search">
                  <Search size={15} />
                  <input
                    ref={inputRef}
                    className="command-input"
                    type="text"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveIndex(0);
                    }}
                    placeholder="Search commands"
                    aria-label="Search commands"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="agentproof-command-list"
                    aria-autocomplete="list"
                    aria-activedescendant={safeIndex >= 0 ? `agentproof-command-${safeIndex}` : undefined}
                    autoComplete="off"
                    spellCheck="false"
                  />
                  <span className="command-count mono">{flat.length}</span>
                </div>
                {flat.length ? (
                  <ul
                    ref={listRef}
                    id="agentproof-command-list"
                    className="command-results"
                    role="listbox"
                    aria-label="Commands"
                  >
                    {groups.map((group) => (
                      <Fragment key={group.name}>
                        <li className="command-group" role="presentation">
                          <span className="mono-label">{group.name.toUpperCase()}</span>
                        </li>
                        {group.items.map(({ command, index }) => {
                          const Icon = groupIcon(command.group);
                          const active = index === safeIndex;
                          return (
                            <li
                              key={command.id || `${command.label}-${index}`}
                              id={`agentproof-command-${index}`}
                              className={`command-row${active ? ' is-active' : ''}`}
                              role="option"
                              aria-selected={active}
                              data-active={active ? 'true' : undefined}
                              onMouseEnter={() => setActiveIndex(index)}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => runCommand(command)}
                            >
                              {active ? <motion.span layoutId="command-active-row" className="command-row-marker" /> : null}
                              <span className="command-row-icon"><Icon size={14} /></span>
                              <span className="command-row-copy">
                                <strong>{command.label}</strong>
                                {command.hint ? <small>{command.hint}</small> : null}
                              </span>
                              <KeyCaps keys={command.keys} joiner={chordOf(command) ? 'then' : null} />
                            </li>
                          );
                        })}
                      </Fragment>
                    ))}
                  </ul>
                ) : (
                  <div className="command-empty">
                    <SearchX size={16} />
                    <strong>No matching command</strong>
                    <small>Try run, policy, approval, or reset. Press esc to close.</small>
                  </div>
                )}
              </Fragment>
            ) : (
              <ShortcutList chords={chordCommands} onBack={() => openPalette('search')} />
            )}
            <div className="command-footer">
              {mode === 'search' ? (
                <Fragment>
                  <span><kbd><ArrowUp size={10} /></kbd><kbd><ArrowDown size={10} /></kbd> move</span>
                  <span><kbd><CornerDownLeft size={10} /></kbd> run</span>
                </Fragment>
              ) : null}
              <span><kbd className="mono">esc</kbd> close</span>
              {mode === 'search' ? (
                <button type="button" className="command-toggle mono" onClick={() => openPalette('shortcuts')}>
                  <Keyboard size={12} /> Shortcuts
                </button>
              ) : (
                <span className="command-footer-note mono">Press ? for this list</span>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function CommandHint({ onOpen }) {
  const openPalette = () => {
    if (typeof onOpen === 'function') {
      onOpen();
      return;
    }
    if (typeof window !== 'undefined' && typeof window.__agentproofOpenPalette === 'function') {
      window.__agentproofOpenPalette();
    }
  };

  return (
    <button
      type="button"
      className="command-hint"
      onClick={openPalette}
      aria-label="Open command palette"
      title={`Command palette · ${metaLabel} K`}
    >
      <Search size={13} />
      <span className="mono">⌘K</span>
    </button>
  );
}
