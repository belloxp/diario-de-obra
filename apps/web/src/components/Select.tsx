import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Dropdown custom (substitui o <select> nativo em todo o app).
 * Teclado: setas, Enter, Esc. Fecha ao clicar fora.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Selecionar…',
  disabled,
  ariaLabel,
  variant,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  variant?: 'pill';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActive(idx >= 0 ? idx : 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  }

  function onKey(e: KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = options[active];
      if (o) choose(o);
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`select ${variant === 'pill' ? 'select-pill' : ''} ${open ? 'open' : ''} ${className ?? ''}`}
    >
      <button
        type="button"
        className="select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        <span className={`select-value ${selected ? '' : 'placeholder'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} className="select-caret" />
      </button>

      {open && (
        <div className="select-menu" role="listbox">
          {options.map((o, i) => (
            <button
              type="button"
              key={o.value || `opt-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`select-option ${o.value === value ? 'selected' : ''} ${i === active ? 'active' : ''} ${
                o.disabled ? 'disabled' : ''
              }`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o)}
              disabled={o.disabled}
            >
              <span className="select-option-main">
                <span className="select-option-label">{o.label}</span>
                {o.hint && <span className="select-option-hint">{o.hint}</span>}
              </span>
              {o.value === value && <Check size={16} className="select-option-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
