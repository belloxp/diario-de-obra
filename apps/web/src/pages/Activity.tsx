import { useQuery } from '@tanstack/react-query';
import { ChevronRight, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ActivityIcon } from '../components/ActivityIcon';
import { UserModal } from '../components/UserModal';
import { Avatar, Empty, ErrorNote, PageHeader, Spinner } from '../components/ui';
import type { ActivityItem, UserSummary } from '../types';
import { formatDateTime, timeAgo } from '../utils';

export function ActivityPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'users' | 'feed'>('users');
  const [creating, setCreating] = useState(false);
  const [limit, setLimit] = useState(50);

  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ users: UserSummary[] }>('/users') });
  const feed = useQuery({
    queryKey: ['activity-feed', limit],
    queryFn: () => api.get<{ items: ActivityItem[] }>('/activity', { limit }),
    enabled: tab === 'feed',
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title="Atividades"
        subtitle="Acompanhe o acesso e as ações de cada usuário no sistema."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <UserPlus size={18} /> Novo usuário
          </button>
        }
      />

      <div className="tabs">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          Usuários
        </button>
        <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>
          Todas as ações
        </button>
      </div>

      {tab === 'users' && (
        <section className="card flush">
          <ErrorNote error={users.error} />
          {users.isLoading ? (
            <Spinner />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Último acesso</th>
                    <th>Última ação</th>
                    <th className="num">Ações</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.data?.users.map((u) => (
                    <tr key={u.id} className="clickable" onClick={() => navigate(`/atividades/${u.id}`)}>
                      <td>
                        <div className="user-cell">
                          <Avatar name={u.name} />
                          <div>
                            <strong>{u.name}</strong>
                            <span className="muted small">
                              {u.email} · {u.role === 'admin' ? 'Administrador' : 'Funcionário'}
                              {!u.active && <span className="badge badge-muted"> Inativo</span>}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{timeAgo(u.last_login_at)}</strong>
                        {u.last_login_at && <span className="muted small block">{formatDateTime(u.last_login_at)}</span>}
                      </td>
                      <td className="cell-summary">
                        {u.last_activity_summary ? (
                          <>
                            <span className="line-clamp">{u.last_activity_summary}</span>
                            <span className="muted small block">{timeAgo(u.last_activity_at)}</span>
                          </>
                        ) : (
                          <span className="muted">Nenhuma ação ainda</span>
                        )}
                      </td>
                      <td className="num">{u.actions_count}</td>
                      <td className="chev">
                        <ChevronRight size={18} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'feed' && (
        <section className="card">
          <ErrorNote error={feed.error} />
          {feed.isLoading ? (
            <Spinner />
          ) : !feed.data || feed.data.items.length === 0 ? (
            <Empty title="Nenhuma ação registrada ainda" />
          ) : (
            <>
              <ul className="timeline">
                {feed.data.items.map((a) => (
                  <li key={a.id}>
                    <span className="dot icon-dot">
                      <ActivityIcon action={a.action} />
                    </span>
                    <div>
                      <p>
                        {a.user_id ? (
                          <Link to={`/atividades/${a.user_id}`} className="link">
                            <strong>{a.user_name}</strong>
                          </Link>
                        ) : (
                          <strong>Usuário removido</strong>
                        )}{' '}
                        {a.summary}
                      </p>
                      <span className="muted small">{formatDateTime(a.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {feed.data.items.length >= limit && (
                <div className="center">
                  <button className="btn btn-ghost" onClick={() => setLimit((l) => l + 50)}>
                    Carregar mais
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {creating && <UserModal onClose={() => setCreating(false)} />}
    </>
  );
}
