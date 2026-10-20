import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorNote, Modal, PageHeader, Spinner } from '../components/ui';
import type { Category, Project } from '../types';

type Tab = 'projects' | 'categories' | 'password';

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<Tab>(isAdmin ? 'projects' : 'password');

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="tabs">
        {isAdmin && (
          <>
            <button className={tab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')}>
              Obras
            </button>
            <button className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>
              Categorias de fotos
            </button>
          </>
        )}
        <button className={tab === 'password' ? 'active' : ''} onClick={() => setTab('password')}>
          Minha senha
        </button>
      </div>
      {tab === 'projects' && isAdmin && <ProjectsTab />}
      {tab === 'categories' && isAdmin && <CategoriesTab />}
      {tab === 'password' && <PasswordTab />}
    </>
  );
}

/* ---------- Obras ---------- */

function ProjectsTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['projects'], queryFn: () => api.get<{ projects: Project[] }>('/projects') });
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

  const toggle = useMutation({
    mutationFn: (p: Project) => api.patch(`/projects/${p.id}`, { active: !p.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  return (
    <section className="card">
      <div className="card-head">
        <h3>Obras</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus size={16} /> Nova obra
        </button>
      </div>
      <ErrorNote error={error ?? toggle.error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="list">
          {data?.projects.map((p) => (
            <li key={p.id} className={p.active ? '' : 'inactive'}>
              <div>
                <strong>{p.name}</strong>
                <span className="muted small block">
                  {[p.contract_number && `Contrato ${p.contract_number}`, p.location].filter(Boolean).join(' · ') || 'Sem detalhes'}
                </span>
              </div>
              <div className="list-actions">
                {!p.active && <span className="badge badge-muted">Inativa</span>}
                <button className="btn btn-ghost btn-sm" onClick={() => toggle.mutate(p)}>
                  {p.active ? 'Desativar' : 'Reativar'}
                </button>
                <button className="icon-btn" onClick={() => setEditing(p)} title="Editar">
                  <Pencil size={16} />
                </button>
              </div>
            </li>
          ))}
          {data?.projects.length === 0 && <li className="muted">Nenhuma obra cadastrada.</li>}
        </ul>
      )}
      {editing && <ProjectModal project={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ProjectModal({ project, onClose }: { project?: Project; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(project?.name ?? '');
  const [contractNumber, setContractNumber] = useState(project?.contract_number ?? '');
  const [location, setLocation] = useState(project?.location ?? '');

  const save = useMutation({
    mutationFn: () =>
      project
        ? api.patch(`/projects/${project.id}`, { name, contractNumber, location })
        : api.post('/projects', { name, contractNumber, location }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });

  return (
    <Modal
      title={project ? 'Editar obra' : 'Nova obra'}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => save.mutate()} disabled={name.trim().length < 2 || save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span>Nome da obra</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Rodovia SC-465 — Macieira" autoFocus />
        </label>
        <label className="field">
          <span>Contrato (opcional)</span>
          <input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="Ex.: 163/2022" />
        </label>
        <label className="field">
          <span>Local (opcional)</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}

/* ---------- Categorias ---------- */

function CategoriesTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ categories: Category[] }>('/categories') });
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<Category | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['categories'] });

  const create = useMutation({
    mutationFn: () => api.post('/categories', { name }),
    onSuccess: () => {
      setName('');
      void refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/categories/${id}`), onSuccess: refresh });

  return (
    <section className="card">
      <div className="card-head">
        <h3>Categorias de fotos (equipes)</h3>
      </div>
      <form
        className="inline-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (name.trim().length >= 2) create.mutate();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria, ex.: Laboratório" maxLength={80} />
        <button className="btn btn-primary" disabled={name.trim().length < 2 || create.isPending}>
          <Plus size={16} /> Adicionar
        </button>
      </form>
      <ErrorNote error={error ?? create.error ?? remove.error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="list">
          {data?.categories.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <span className="muted small block">{c.photos_count} foto(s)</span>
              </div>
              <div className="list-actions">
                <button className="icon-btn" onClick={() => setRenaming(c)} title="Renomear">
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-btn"
                  title="Excluir"
                  onClick={() =>
                    window.confirm(`Excluir a categoria "${c.name}"? As fotos dela ficarão sem categoria.`) && remove.mutate(c.id)
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {renaming && <RenameModal category={renaming} onClose={() => setRenaming(null)} onSaved={refresh} />}
    </section>
  );
}

function RenameModal({ category, onClose, onSaved }: { category: Category; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category.name);
  const save = useMutation({
    mutationFn: () => api.patch(`/categories/${category.id}`, { name }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Modal
      title="Renomear categoria"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => save.mutate()} disabled={name.trim().length < 2 || save.isPending}>
            Salvar
          </button>
        </>
      }
    >
      <div className="stack">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}

/* ---------- Senha ---------- */

function PasswordTab() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState(false);

  const save = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setDone(true);
    },
  });

  return (
    <section className="card narrow">
      <div className="card-head">
        <h3>Alterar minha senha</h3>
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setDone(false);
          save.mutate();
        }}
      >
        <label className="field">
          <span>Senha atual</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span>Nova senha</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required placeholder="Mínimo de 8 caracteres" />
        </label>
        <ErrorNote error={save.error} />
        {done && <div className="alert alert-ok">Senha alterada com sucesso.</div>}
        <div>
          <button className="btn btn-primary" disabled={save.isPending || next.length < 8 || !current}>
            {save.isPending ? 'Salvando…' : 'Alterar senha'}
          </button>
        </div>
      </form>
    </section>
  );
}
