import { Eye, EyeOff, Loader2, Moon, Sun } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { Signature } from '../components/ui';
import { useTheme } from '../theme';

export function LoginPage() {
  const { login } = useAuth();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-hero">
        <img src="/brand/logo-white.png" alt="JBSC Engenharia" className="login-hero-logo" />
        <div>
          <h2>Diário de obra, fotos e chuvas em um só lugar.</h2>
          <p>Registre o dia a dia da obra direto do celular, com tudo organizado por equipe, data e hora.</p>
        </div>
        <span className="login-hero-foot">Gerenciamento e supervisão de obras</span>
      </section>

      <section className="login-panel">
        <button
          type="button"
          className="icon-btn login-theme-toggle"
          onClick={toggle}
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <form className="login-card" onSubmit={submit}>
          <img
            src={theme === 'dark' ? '/brand/logo-white.png' : '/brand/logo-black.png'}
            alt="JBSC Engenharia"
            className="login-logo-mobile"
          />
          <h1>Entrar</h1>
          <p className="muted">Use o e-mail e a senha fornecidos pelo administrador.</p>

          <label className="field">
            <span>E-mail</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>

          <label className="field">
            <span>Senha</span>
            <div className="input-icon">
              <input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : 'Entrar'}
          </button>
        </form>
        <Signature />
      </section>
    </div>
  );
}
