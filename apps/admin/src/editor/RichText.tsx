'use client';
import { blocksToHtml, parseRich, sanitizeRich } from '@hunt/engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Kleuren die ook op de donkere achtergrond van de speler-app goed leesbaar zijn. */
const COLORS = [
  { value: '', label: 'Standaard' },
  { value: '#f5a524', label: 'Oranje' },
  { value: '#f85149', label: 'Rood' },
  { value: '#3fb950', label: 'Groen' },
  { value: '#58a6ff', label: 'Blauw' },
  { value: '#bc8cff', label: 'Paars' },
  { value: '#9ca3af', label: 'Grijs' },
];

function Tool(props: { title: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      className={`tool${props.active ? ' active' : ''}`}
      title={props.title}
      aria-label={props.title}
      // Voorkomt dat de selectie in de tekst verdwijnt bij het klikken.
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

const ICON = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const };
const icons = {
  ul: (
    <svg {...ICON}>
      <circle cx="2.5" cy="4" r=".6" fill="currentColor" />
      <circle cx="2.5" cy="8" r=".6" fill="currentColor" />
      <circle cx="2.5" cy="12" r=".6" fill="currentColor" />
      <path d="M6 4h8M6 8h8M6 12h8" />
    </svg>
  ),
  ol: (
    <svg {...ICON}>
      <path d="M2 2.5h1v3M2 5.5h2M2 9.5c0-.6.5-1 1-1s1 .4 1 .9c0 .8-2 1.3-2 2.1h2" strokeWidth={1.1} />
      <path d="M7 4h7M7 8h7M7 12h7" />
    </svg>
  ),
  left: (
    <svg {...ICON}>
      <path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8" />
    </svg>
  ),
  center: (
    <svg {...ICON}>
      <path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8" />
    </svg>
  ),
  right: (
    <svg {...ICON}>
      <path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8" />
    </svg>
  ),
  link: (
    <svg {...ICON}>
      <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1" />
    </svg>
  ),
  clear: (
    <svg {...ICON}>
      <path d="M4 3h8M8 3l-2 10M10 10l4 4M14 10l-4 4" />
    </svg>
  ),
};

/**
 * Tekstvak met opmaak, zoals in Loquiz. Bewaart gewone tekst zolang er geen opmaak
 * in zit, anders een klein stukje schone HTML (zie parseRich in de engine).
 */
export function RichText(props: { value: string; onChange: (value: string) => void; placeholder?: string; minHeight?: number; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [, rerender] = useState(0);

  // Waarde van buiten (laden, andere taal): de inhoud vervangen.
  useEffect(() => {
    const el = ref.current;
    if (!el || props.value === emitted.current) return;
    el.innerHTML = props.value ? blocksToHtml(parseRich(props.value)) : '';
    emitted.current = props.value;
  }, [props.value]);

  useEffect(() => {
    // Kleuren als style-attribuut in plaats van <font>.
    try {
      document.execCommand('styleWithCSS', false, 'true');
    } catch {
      /* oudere browsers */
    }
    const update = () => rerender((n) => n + 1);
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const value = sanitizeRich(el.innerHTML);
    emitted.current = value;
    if (value !== props.value) props.onChange(value);
  };

  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const state = (command: string) => {
    if (typeof document === 'undefined' || !ref.current?.contains(document.getSelection()?.anchorNode ?? null)) return false;
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  };

  const link = () => {
    const url = window.prompt('Adres van de link (https://…)', 'https://');
    if (url === null) return;
    if (url.trim() === '' || url.trim() === 'https://') run('unlink');
    else if (/^(https?:\/\/|mailto:|tel:)\S+$/i.test(url.trim())) run('createLink', url.trim());
    else window.alert('Een link moet beginnen met https://, mailto: of tel:');
  };

  return (
    <div className="rte">
      <div className="rte-bar">
        <Tool title="Vet (Ctrl+B)" active={state('bold')} onClick={() => run('bold')}>
          <b>B</b>
        </Tool>
        <Tool title="Cursief (Ctrl+I)" active={state('italic')} onClick={() => run('italic')}>
          <i style={{ fontFamily: 'Georgia, serif' }}>I</i>
        </Tool>
        <Tool title="Onderstrepen (Ctrl+U)" active={state('underline')} onClick={() => run('underline')}>
          <u>U</u>
        </Tool>
        <span className="rte-color">
          <Tool title="Tekstkleur" onClick={() => setColorOpen(!colorOpen)}>
            <span style={{ borderBottom: '3px solid var(--accent)', lineHeight: 1, fontWeight: 700 }}>A</span>
          </Tool>
          {colorOpen ? (
            <span className="rte-palette" onMouseDown={(e) => e.preventDefault()}>
              {COLORS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  className="swatch"
                  style={{ background: c.value || 'var(--text)' }}
                  onClick={() => {
                    setColorOpen(false);
                    run('foreColor', c.value || getComputedStyle(ref.current!).color);
                    if (!c.value) {
                      // "Standaard": de kleur weer weghalen.
                      const el = ref.current!;
                      el.querySelectorAll<HTMLElement>('[style*="color"]').forEach((n) => {
                        if (getComputedStyle(n).color === getComputedStyle(el).color) n.style.removeProperty('color');
                      });
                      emit();
                    }
                  }}
                />
              ))}
            </span>
          ) : null}
        </span>
        <Tool title="Link" active={false} onClick={link}>
          {icons.link}
        </Tool>
        <span className="rte-sep" />
        <Tool title="Genummerde lijst" active={state('insertOrderedList')} onClick={() => run('insertOrderedList')}>
          {icons.ol}
        </Tool>
        <Tool title="Lijst met bolletjes" active={state('insertUnorderedList')} onClick={() => run('insertUnorderedList')}>
          {icons.ul}
        </Tool>
        <span className="rte-sep" />
        <Tool title="Links uitlijnen" active={state('justifyLeft') && !state('justifyCenter')} onClick={() => run('justifyLeft')}>
          {icons.left}
        </Tool>
        <Tool title="Centreren" active={state('justifyCenter')} onClick={() => run('justifyCenter')}>
          {icons.center}
        </Tool>
        <Tool title="Rechts uitlijnen" active={state('justifyRight')} onClick={() => run('justifyRight')}>
          {icons.right}
        </Tool>
        <span className="rte-sep" />
        <Tool
          title="Opmaak wissen"
          onClick={() => {
            run('removeFormat');
            run('unlink');
          }}
        >
          {icons.clear}
        </Tool>
      </div>
      <div
        ref={ref}
        id={props.id}
        className="rte-area"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={props.placeholder ?? ''}
        style={{ minHeight: props.minHeight ?? 110 }}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Plakken uit Word of een website: alleen de toegestane opmaak overhouden.
          e.preventDefault();
          const html = e.clipboardData.getData('text/html');
          const text = e.clipboardData.getData('text/plain');
          const clean = html ? blocksToHtml(parseRich(sanitizeRich(html))) : blocksToHtml(parseRich(text.replace(/\r\n?/g, '\n')));
          document.execCommand('insertHTML', false, clean);
          emit();
        }}
      />
    </div>
  );
}
