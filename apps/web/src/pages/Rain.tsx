import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Droplets, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { NoProject } from '../components/NoProject';
import { ErrorNote, Modal, PageHeader, Spinner } from '../components/ui';
import { useProject } from '../project';
import type { RainCondition, RainRecord } from '../types';
import { currentMonth, formatDateLong, formatDateTime, formatMm, monthBounds, monthLabel, shiftMonth, todayISO } from '../utils';

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const CONDITIONS: { value: RainCondition; label: string }[] = [
  { value: 'rain', label: 'Chuva' },
  { value: 'impractical', label: 'Impraticável' },
  { value: 'good', label: 'Tempo bom' },
];
const CONDITION_LABEL: Record<RainCondition, string> = { rain: 'Chuva', impractical: 'Impraticável', good: 'Tempo bom' };

export function RainPage() {
  const { project, loading } = useProject();
  const [month, setMonth] = useState(currentMonth());
  const [day, setDay] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { from, to, days } = monthBounds(month);
  const { data, isLoading, error } = useQuery({
    queryKey: ['rain', project?.id, month],
    queryFn: () => api.get<{ records: RainRecord[] }>('/rain', { projectId: project!.id, from, to }),
    enabled: !!project,
  });

  if (loading) return <Spinner />;
  if (!project) return <NoProject />;

  const records = data?.records ?? [];
  const byDate = new Map(records.map((r) => [r.record_date, r]));
  const rainy = records.filter((r) => r.condition === 'rain');
  const impracticalDays = records.filter((r) => r.condition === 'impractical').length;
  const total = Math.round(rainy.reduce((s, r) => s + r.mm, 0) * 10) / 10;

  const firstWeekday = new Date(`${from}T12:00:00Z`).getUTCDay();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = todayISO();

  return (
    <>
      <PageHeader
        title="Controle pluviométrico"
        subtitle="Toque em um dia para classificar: chuva, dia impraticável ou tempo bom."
        actions={
          <button className="btn btn-ghost" onClick={() => setExporting(true)}>
            <Download size={18} /> Exportar planilha
          </button>
        }
      />

      <div className="stats stats-3">
        <div className="card stat">
          <div className="stat-icon">
            <Droplets size={20} />
          </div>
          <span className="stat-label">Chuva acumulada</span>
          <strong className="stat-value">{formatMm(total)}</strong>
          <span className="stat-hint">{rainy.length} dia(s) de chuva</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Dias com chuva</span>
          <strong className="stat-value">{rainy.length}</strong>
        </div>
        <div className="card stat">
          <span className="stat-label">Dias impraticáveis</span>
          <strong className="stat-value">{impracticalDays}</strong>
          <span className="stat-hint">não choveu, mas sem condição de trabalho</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div className="month-nav">
            <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, -1))}>
              ‹
            </button>
            <strong>{monthLabel(month)}</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()}>
              ›
            </button>
          </div>
          <div className="legend">
            <span>
              <i className="swatch swatch-cond-rain" /> Chuva
            </span>
            <span>
              <i className="swatch swatch-cond-impractical" /> Impraticável
            </span>
            <span>
              <i className="swatch swatch-cond-good" /> Tempo bom
            </span>
          </div>
        </div>

        <ErrorNote error={error} />
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="calendar">
            {WEEK.map((w) => (
              <div key={w} className="cal-head">
                {w}
              </div>
            ))}
            {cells.map((n, i) => {
              if (n === null) return <div key={`e${i}`} className="cal-cell empty-cell" />;
              const date = `${month}-${String(n).padStart(2, '0')}`;
              const rec = byDate.get(date);
              const cond = rec?.condition;
              const future = date > today;
              const tip = rec
                ? `${CONDITION_LABEL[cond!]}${cond === 'rain' ? ` · ${formatMm(rec.mm)}` : ''}${
                    rec.created_by_name ? ` — ${rec.created_by_name}` : ''
                  }`
                : undefined;
              return (
                <button
                  key={date}
                  className={`cal-cell ${cond ? `cond-${cond}` : ''} ${date === today ? 'today' : ''}`}
                  disabled={future}
                  onClick={() => setDay(date)}
                  data-tip={tip}
                >
                  <span className="cal-day">{n}</span>
                  {cond === 'rain' && <span className="cal-mm">{formatMm(rec!.mm)}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {day && <DayModal projectId={project.id} date={day} record={byDate.get(day) ?? null} onClose={() => setDay(null)} />}
      {exporting && <ExportModal projectId={project.id} from={from} to={to} onClose={() => setExporting(false)} />}
    </>
  );
}

function DayModal({ projectId, date, record, onClose }: { projectId: string; date: string; record: RainRecord | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [condition, setCondition] = useState<RainCondition>(record?.condition ?? 'rain');
  const [mm, setMm] = useState(record ? String(record.mm).replace('.', ',') : '');
  const [note, setNote] = useState(record?.note ?? '');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['rain'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    onClose();
  };
  const value = Number(mm.replace(',', '.'));
  const mmValid = mm.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 1000;
  const valid = condition === 'rain' ? mmValid : true;

  const save = useMutation({
    mutationFn: () =>
      api.put('/rain', {
        projectId,
        recordDate: date,
        condition,
        mm: condition === 'rain' ? Math.round(value * 10) / 10 : 0,
        note,
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: () => api.del(`/rain/${record!.id}`), onSuccess: refresh });
  const canRemove = !!record && (user!.role === 'admin' || record.created_by === user!.id);

  return (
    <Modal
      title={formatDateLong(date)}
      onClose={onClose}
      footer={
        <>
          {canRemove && (
            <button className="btn btn-danger-ghost" onClick={() => window.confirm('Remover a marcação deste dia?') && remove.mutate()} disabled={remove.isPending}>
              <Trash2 size={16} /> Remover
            </button>
          )}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <span>Condição do dia</span>
          <div className="seg">
            {CONDITIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`seg-btn seg-${c.value} ${condition === c.value ? 'active' : ''}`}
                onClick={() => setCondition(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {condition === 'rain' && (
          <label className="field">
            <span>Precipitação (mm)</span>
            <input inputMode="decimal" placeholder="0" value={mm} onChange={(e) => setMm(e.target.value)} autoFocus />
          </label>
        )}
        <label className="field">
          <span>Observação (opcional)</span>
          <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: chuva forte à tarde" />
        </label>
        {record && (
          <p className="muted small">
            Marcado por {record.created_by_name ?? '—'} em {formatDateTime(record.created_at)}
            {record.updated_by_name && <> · alterado por {record.updated_by_name} em {formatDateTime(record.updated_at)}</>}
          </p>
        )}
        <ErrorNote error={save.error ?? remove.error} />
      </div>
    </Modal>
  );
}

function ExportModal({ projectId, from: initialFrom, to: initialTo, onClose }: { projectId: string; from: string; to: string; onClose: () => void }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await api.download('/rain/export', { projectId, from, to }, `controle-pluviometrico_${from}_a_${to}.xlsx`);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Exportar planilha de chuvas"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={run} disabled={busy || !from || !to || from > to}>
            <Download size={16} /> {busy ? 'Gerando…' : 'Baixar .xlsx'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">
          A planilha traz todos os dias do período com a condição de cada um (chuva, impraticável, tempo bom) já coloridas, além de
          mm e totais.
        </p>
        <div className="row">
          <label className="field">
            <span>De</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>Até</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <ErrorNote error={error} />
      </div>
    </Modal>
  );
}
