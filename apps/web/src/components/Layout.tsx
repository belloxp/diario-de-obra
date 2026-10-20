import { Activity, CloudRain, FileText, Images, LayoutDashboard, LogOut, Menu, Moon, NotebookPen, Settings, Sun } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { useProject } from '../project';
import { useTheme } from '../theme';
import { Select } from './Select';
import { Avatar, Signature } from './ui';

type NavEntry = { to: string; label: string; icon: typeof Settings; end?: boolean };

const NAV: NavEntry[] = [
  { to: '/', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/fotos', label: 'Relatório fotográfico', icon: Images },
  { to: '/diario', label: 'Diário de obra', icon: NotebookPen },
  { to: '/chuva', label: 'Controle pluviométrico', icon: CloudRain },
  { to: '/relatorios', label: 'Relatórios', icon: FileText },
];

const ADMIN_NAV: NavEntry[] = [{ to: '/atividades', label: 'Atividades', icon: Activity }];

export function Layout() {
  const { user, logout } = useAuth();
  const { projects, project, setProjectId } = useProject();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  useLocation(); // fecha o menu móvel ao navegar via onClick dos links

  if (!user) return null;
  const activeProjects = projects.filter((p) => p.active);

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-badge">
            <img src={theme === 'dark' ? '/brand/icon-black.png' : '/brand/icon-white.png'} alt="" />
          </span>
          <div>
            <strong>Diário de Obra</strong>
            <span className="muted">JBSC Engenharia</span>
          </div>
        </div>

        <nav className="nav">
          {[...NAV, ...(user.role === 'admin' ? ADMIN_NAV : []), { to: '/configuracoes', label: 'Configurações', icon: Settings }].map(
            (item: NavEntry) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setOpen(false)}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            ),
          )}
        </nav>

        <div className="sidebar-foot">
          <div className="user-card">
            <Avatar name={user.name} />
            <div className="user-meta">
              <strong>{user.name}</strong>
              <span className="muted">{user.role === 'admin' ? 'Administrador' : 'Funcionário'}</span>
            </div>
            <button
              className="icon-btn"
              onClick={toggle}
              title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="icon-btn" onClick={logout} title="Sair" aria-label="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu size={22} />
          </button>
          <div className="project-pill">
            <span className="muted">Obra</span>
            {activeProjects.length > 0 ? (
              <Select
                variant="pill"
                ariaLabel="Selecionar obra"
                value={project?.id ?? ''}
                onChange={setProjectId}
                options={activeProjects.map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.contract_number ? ` — Contrato ${p.contract_number}` : ''}`,
                }))}
              />
            ) : (
              <strong>Nenhuma obra cadastrada</strong>
            )}
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
        <footer className="footer">
          <Signature />
        </footer>
      </div>
    </div>
  );
}
