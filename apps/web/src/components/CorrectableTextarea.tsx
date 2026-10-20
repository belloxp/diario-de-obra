import { Check, SpellCheck, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import type { SpellMatch } from '../types';

/**
 * Campo de texto com verificação de ortografia/acentuação (LanguageTool).
 * O texto só muda quando a pessoa clica em "Aplicar" em uma sugestão.
 */
export function CorrectableTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength = 5000,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  const [matches, setMatches] = useState<SpellMatch[] | null>(null);
  const [checkedText, setCheckedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function check(text = value) {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ matches: SpellMatch[] }>('/spellcheck', { text });
      setMatches(r.matches);
      setCheckedText(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível verificar o texto.');
    } finally {
      setBusy(false);
    }
  }

  function apply(m: SpellMatch, replacement: string) {
    if (checkedText !== value) return void check();
    const next = value.slice(0, m.offset) + replacement + value.slice(m.offset + m.length);
    onChange(next);
    void check(next); // reverifica para recalcular as posições
  }

  function ignore(m: SpellMatch) {
    setMatches((cur) => cur?.filter((x) => x !== m) ?? null);
  }

  const stale = matches !== null && checkedText !== value;

  return (
    <div className="correctable">
      <textarea
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      <div className="correctable-bar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => check()} disabled={busy || !value.trim()}>
          <SpellCheck size={15} /> {busy ? 'Verificando…' : 'Verificar texto'}
        </button>
        {matches && !stale && matches.length === 0 && (
          <span className="ok-note">
            <Check size={14} /> Nenhum erro encontrado
          </span>
        )}
        {error && <span className="error-note">{error}</span>}
        <span className="muted counter">
          {value.length}/{maxLength}
        </span>
      </div>

      {matches && !stale && matches.length > 0 && (
        <ul className="suggestions">
          {matches.map((m, i) => (
            <li key={`${m.offset}-${i}`}>
              <div>
                <span className="sug-original">{m.original}</span>
                <span className="muted sug-msg">{m.message}</span>
              </div>
              <div className="sug-actions">
                {m.replacements.slice(0, 3).map((r) => (
                  <button key={r} type="button" className="chip chip-apply" onClick={() => apply(m, r)}>
                    {r}
                  </button>
                ))}
                <button type="button" className="icon-btn" title="Ignorar" onClick={() => ignore(m)}>
                  <X size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
