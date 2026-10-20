import { useQuery } from '@tanstack/react-query';
import { CloudRain, Droplets, Images, NotebookPen } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { NoProject } from '../components/NoProject';
import { RainDrops } from '../components/RainDrops';
import { Empty, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { useProject } from '../project';
import type { DashboardData } from '../types';
import { currentMonth, formatDate, formatMm, monthBounds, monthLabel, shiftMonth, timeAgo, todayISO } from '../utils';

/** nível 0..4 pela precipitação (tons de azul, estilo painel do GitHub) */
function rainLevel(mm: number): number {
  if (mm <= 0) return 0;
  if (mm < 5) return 1;
  if (mm < 15) return 2;
  if (mm < 30) return 3;
  return 4;
}

/** Mini heatmap do mês: um quadradinho por dia. O widget inteiro leva ao controle de chuvas. */
function MonthHeatmap({ month, daily }: { month: string; daily: { date: string; mm: number }[] }) {
  const navigate = useNavigate();
  const { days } = monthBounds(month);
  const byDay = new Map(daily.map((d) => [Number(d.date.slice(8, 10)), d.mm]));
  const today = todayISO();

  return (
    <button className="month-heatmap" onClick={() => navigate('/chuva')} aria-label="Abrir controle pluviométrico">
      <div className="mh-grid">
        {Array.from({ length: days }, (_, i) => i + 1).map((n) => {
          const date = `${month}-${String(n).padStart(2, '0')}`;
          const mm = byDay.get(n) ?? 0;
          const future = date > today;
          return <span key={n} className={`mh-cell level-${rainLevel(mm)} ${date === today ? 'today' : ''} ${future ? 'future' : ''}`} />;
        })}
      </div>
    </button>
  );
}

function StatCard({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: string; hint?: string; tone?: 'accent' | 'rain' }) {
  return (
    <div className={`card stat ${tone ? `stat-${tone}` : ''}`}>
      {tone === 'rain' && <RainDrops />}
      <div className="stat-icon">{icon}</div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { project, loading } = useProject();
  const [month, setMonth] = useState(currentMonth());

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', project?.id, month],
    queryFn: () => api.get<DashboardData>('/dashboard', { projectId: project!.id, month }),
    enabled: !!project,
  });

  if (loading) return <Spinner />;
  if (!project) return <NoProject />;

  const firstName = user!.name.split(' ')[0];
  const maxCat = Math.max(1, ...(data?.photosByCategory.map((c) => c.count) ?? [1]));

  return (
    <>
      <PageHeader
        title={`Olá, ${firstName}`}
        subtitle={`${project.name}${project.contract_number ? ` · Contrato ${project.contract_number}` : ''}`}
        actions={
          <div className="month-nav">
            <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, -1))}>
              ‹
            </button>
            <strong>{monthLabel(month)}</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()}>
              ›
            </button>
          </div>
        }
      />

      <ErrorNote error={error} />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="stats">
            <StatCard icon={<Images size={20} />} label="Fotos no mês" value={String(data.photos.month)} hint={`${data.photos.total} no total`} tone="accent" />
            <StatCard icon={<NotebookPen size={20} />} label="Registros no diário" value={String(data.diary.month)} hint={`${data.diary.total} no total`} />
            <StatCard icon={<CloudRain size={20} />} label="Dias com chuva" value={String(data.rain.rainyDays)} hint="no mês selecionado" />
            <StatCard icon={<Droplets size={20} />} label="Chuva acumulada" value={formatMm(data.rain.totalMm)} hint="no mês selecionado" tone="rain" />
          </div>

          <section className="card">
            <div className="card-head">
              <h3>Chuva do mês</h3>
              <Link to="/chuva" className="link">
                Abrir controle
              </Link>
            </div>
            {data.rain.daily.length === 0 ? (
              <Empty title="Sem chuva registrada neste mês" text="Dias sem marcação contam como sem chuva." />
            ) : (
              <MonthHeatmap month={month} daily={data.rain.daily} />
            )}
          </section>

          <div className="grid-2">
            <section className="card">
              <div className="card-head">
                <h3>Fotos por categoria</h3>
                <Link to="/fotos" className="link">
                  Ver fotos
                </Link>
              </div>
              {data.photosByCategory.length === 0 ? (
                <Empty title="Nenhuma foto neste mês" />
              ) : (
                <ul className="bars">
                  {data.photosByCategory.map((c) => (
                    <li key={c.name}>
                      <div className="bars-row">
                        <span>{c.name}</span>
                        <strong>{c.count}</strong>
                      </div>
                      <div className="bars-track">
                        <div className="bars-fill" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h3>{user!.role === 'admin' ? 'Atividade recente da equipe' : 'Suas últimas ações'}</h3>
                {user!.role === 'admin' && (
                  <Link to="/atividades" className="link">
                    Ver tudo
                  </Link>
                )}
              </div>
              {data.recentActivity.length === 0 ? (
                <Empty title="Nenhuma atividade ainda" />
              ) : (
                <ul className="timeline compact">
                  {data.recentActivity.map((a) => (
                    <li key={a.id}>
                      <span className="dot" />
                      <div>
                        <p>
                          {user!.role === 'admin' && <strong>{a.user_name ?? 'Usuário removido'} </strong>}
                          {a.summary}
                        </p>
                        <span className="muted">{timeAgo(a.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <p className="muted small">Período: {formatDate(data.from)} a {formatDate(data.to)}</p>
        </>
      )}
    </>
  );
}
