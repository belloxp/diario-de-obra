import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotebookPen, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { CorrectableTextarea } from '../components/CorrectableTextarea';
import { NoProject } from '../components/NoProject';
import { Empty, ErrorNote, Modal, PageHeader, Spinner } from '../components/ui';
import { useProject } from '../project';
import type { DiaryEntry } from '../types';
import { currentMonth, formatDateLong, formatDateTime, monthBounds, monthLabel, shiftMonth, todayISO } from '../utils';

export function DiaryPage() {
  const { project, loading } = useProject();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<DiaryEntry | null>(null);

  const { from, to } = monthBounds(month);
  const { data, isLoading, error } = useQuery({
    queryKey: ['diary', project?.id, month],
    queryFn: () => api.get<{ entries: DiaryEntry[] }>('/diary', { projectId: project!.id, from, to, limit: 200 }),
    enabled: !!project,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['diary'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const create = useMutation({
    mutationFn: () => api.post('/diary', { projectId: project!.id, entryDate: date, text }),
    onSuccess: () => {
      setText('');
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/diary/${id}`), onSuccess: refresh });

  if (loading) return <Spinner />;
  if (!project) return <NoProject />;

  const entries = data?.entries ?? [];
  const grouped = entries.reduce<Record<string, DiaryEntry[]>>((acc, e) => {
    (acc[e.entry_date] ??= []).push(e);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort().reverse();

  return (
    <>
      <PageHeader title="Diário de obra" subtitle="Resumo diário das atividades executadas." />

      <section className="card">
        <div className="card-head">
          <h3>Novo registro</h3>
        </div>
        <div className="stack">
          <label className="field inline-field">
            <span>Data</span>
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <CorrectableTextarea value={text} onChange={setText} rows={5} maxLength={20000} placeholder="Descreva as atividades do dia, equipes, ocorrências…" />
          <ErrorNote error={create.error} />
          <div>
            <button className="btn btn-primary" onClick={() => create.mutate()} disabled={create.isPending || !text.trim() || !date}>
              {create.isPending ? 'Salvando…' : 'Salvar registro'}
            </button>
          </div>
        </div>
      </section>

      <div className="month-nav standalone">
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, -1))}>
          ‹
        </button>
        <strong>{monthLabel(month)}</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()}>
          ›
        </button>
      </div>

      <ErrorNote error={error ?? remove.error} />
      {isLoading ? (
        <Spinner />
      ) : days.length === 0 ? (
        <div className="card">
          <Empty icon={<NotebookPen size={28} />} title="Nenhum registro neste mês" text="Escreva o primeiro registro acima." />
        </div>
      ) : (
        days.map((d) => (
          <section key={d} className="card day-group">
            <h3 className="day-title">{formatDateLong(d)}</h3>
            {grouped[d]!.map((e) => {
              const canEdit = user!.role === 'admin' || e.created_by === user!.id;
              return (
                <article key={e.id} className="entry">
                  <p className="entry-text">{e.text}</p>
                  <div className="entry-meta">
                    <span className="muted small">
                      {e.created_by_name ?? '—'} · {formatDateTime(e.created_at)}
                      {e.updated_by_name && <> · editado por {e.updated_by_name} em {formatDateTime(e.updated_at)}</>}
                    </span>
                    {canEdit && (
                      <span className="entry-actions">
                        <button className="icon-btn" title="Editar" onClick={() => setEditing(e)}>
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Excluir"
                          onClick={() => window.confirm('Excluir este registro do diário?') && remove.mutate(e.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ))
      )}

      {editing && <EditModal entry={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </>
  );
}

function EditModal({ entry, onClose, onSaved }: { entry: DiaryEntry; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(entry.text);
  const [date, setDate] = useState(entry.entry_date);
  const save = useMutation({
    mutationFn: () => api.patch(`/diary/${entry.id}`, { text, entryDate: date }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Modal
      title="Editar registro"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending || !text.trim()}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field inline-field">
          <span>Data</span>
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <CorrectableTextarea value={text} onChange={setText} rows={8} maxLength={20000} />
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}
