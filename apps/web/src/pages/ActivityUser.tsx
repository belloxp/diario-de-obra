import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ActivityIcon } from '../components/ActivityIcon';
import { UserModal } from '../components/UserModal';
import { Avatar, Empty, ErrorNote, Spinner } from '../components/ui';
import type { ActivityItem, Role } from '../types';
import { formatDateTime, timeAgo } from '../utils';

interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export function ActivityUserPage() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();
  const [limit, setLimit] = useState(50);
  const [editing, setEditing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['user-activity', id, limit],
    queryFn: () => api.get<{ user: UserDetail; items: ActivityItem[] }>(`/users/${id}/activity`, { limit }),
    placeholderData: (prev) => prev,
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorNote error={error ?? new Error('Usuário não encontrado.')} />;
  const { user, items } = data;
  const actions = items.filter((i) => i.action !== 'auth.login');

  return (
    <>
      <Link to="/atividades" className="back-link">
        <ArrowLeft size={16} /> Voltar para atividades
      </Link>

      <section className="card profile-head">
        <Avatar name={user.name} size={56} />
        <div className="profile-meta">
          <h1>{user.name}</h1>
          <span className="muted">
            {user.email} · {user.role === 'admin' ? 'Administrador' : 'Funcionário'}
            {!user.active && <span className="badge badge-muted"> Inativo</span>}
          </span>
        </div>
        <button className="btn btn-ghost" onClick={() => setEditing(true)}>
          <Pencil size={16} /> Editar
        </button>
      </section>

      <div className="stats stats-3">
        <div className="card stat">
          <span className="stat-label">Último acesso</span>
          <strong className="stat-value sm">{timeAgo(user.last_login_at)}</strong>
          {user.last_login_at && <span className="stat-hint">{formatDateTime(user.last_login_at)}</span>}
        </div>
        <div className="card stat">
          <span className="stat-label">Última ação</span>
          <strong className="stat-value sm">{actions[0] ? timeAgo(actions[0].created_at) : '—'}</strong>
          {actions[0] && <span className="stat-hint line-clamp">{actions[0].summary}</span>}
        </div>
        <div className="card stat">
          <span className="stat-label">Cadastrado em</span>
          <strong className="stat-value sm">{formatDateTime(user.created_at)}</strong>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Ações realizadas</h3>
        </div>
        {actions.length === 0 ? (
          <Empty title="Nenhuma ação registrada" />
        ) : (
          <ul className="timeline">
            {actions.map((a) => (
              <li key={a.id}>
                <span className="dot icon-dot">
                  <ActivityIcon action={a.action} />
                </span>
                <div>
                  <p>{a.summary}</p>
                  <span className="muted small">{formatDateTime(a.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {items.length >= limit && (
          <div className="center">
            <button className="btn btn-ghost" onClick={() => setLimit((l) => l + 100)}>
              Carregar mais
            </button>
          </div>
        )}
      </section>

      {editing && <UserModal user={user} isSelf={me?.id === user.id} onClose={() => setEditing(false)} />}
    </>
  );
}
