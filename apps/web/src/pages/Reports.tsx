import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Download, ExternalLink, FileText, ImagePlus, PenLine, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { CorrectableTextarea } from '../components/CorrectableTextarea';
import { NoProject } from '../components/NoProject';
import { Select } from '../components/Select';
import { Empty, ErrorNote, Modal, PageHeader, Spinner } from '../components/ui';
import { useProject } from '../project';
import type { Report, StateMode } from '../types';
import { currentMonth, formatDate, formatDateTime, monthBounds } from '../utils';

function StatusBadge({ status }: { status: Report['status'] }) {
  if (status === 'signed')
    return (
      <span className="rbadge rbadge-signed">
        <CheckCircle2 size={13} /> Assinado
      </span>
    );
  if (status === 'pending_signature')
    return (
      <span className="rbadge rbadge-pending">
        <Clock size={13} /> Aguardando assinatura
      </span>
    );
  return <span className="rbadge rbadge-draft">Rascunho</span>;
}

export function ReportsPage() {
  const { project, loading } = useProject();
  const [creating, setCreating] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', project?.id],
    queryFn: () => api.get<{ reports: Report[] }>('/reports', { projectId: project!.id }),
    enabled: !!project,
  });

  if (loading) return <Spinner />;
  if (!project) return <NoProject />;
  const reports = data?.reports ?? [];

  return (
    <>
      <PageHeader
        title="Relatórios fotográficos"
        subtitle="Gere o PDF com capa, fotos por categoria e assinatura digital via ZapSign."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} /> Novo relatório
          </button>
        }
      />

      <ErrorNote error={error} />
      {isLoading ? (
        <Spinner />
      ) : reports.length === 0 ? (
        <Empty icon={<FileText size={28} />} title="Nenhum relatório ainda" text="Crie o primeiro relatório fotográfico do período." />
      ) : (
        <div className="card">
          <ul className="list">
            {reports.map((r) => (
              <ReportRow key={r.id} report={r} />
            ))}
          </ul>
        </div>
      )}

      {creating && <ReportModal projectId={project.id} contractNumber={project.contract_number} onClose={() => setCreating(false)} />}
    </>
  );
}

function ReportRow({ report }: { report: Report }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['reports'] });

  async function download() {
    setBusy('pdf');
    setErr(null);
    try {
      await api.download(`/reports/${report.id}/pdf`, {}, `relatorio-${String(report.number).padStart(3, '0')}.pdf`);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  }

  const sign = useMutation({
    mutationFn: () => api.post<{ signUrl: string | null }>(`/reports/${report.id}/sign`),
    onMutate: () => setErr(null),
    onSuccess: (res) => {
      refresh();
      if (res.signUrl) window.open(res.signUrl, '_blank', 'noopener');
    },
    onError: (e) => setErr(e),
  });
  const refreshStatus = useMutation({
    mutationFn: () => api.post(`/reports/${report.id}/refresh-status`),
    onSuccess: refresh,
    onError: (e) => setErr(e),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/reports/${report.id}`),
    onSuccess: refresh,
    onError: (e) => setErr(e),
  });
  const canDelete = user!.role === 'admin' || report.created_by === user!.id;

  return (
    <li>
      <div style={{ minWidth: 0 }}>
        <strong>Relatório {String(report.number).padStart(3, '0')}</strong>
        <div className="muted small">
          {formatDate(report.period_from)} a {formatDate(report.period_to)} · {report.photos_count} foto
          {report.photos_count === 1 ? '' : 's'}
          {report.signed_at ? ` · assinado em ${formatDateTime(report.signed_at)}` : ''}
        </div>
        <div style={{ marginTop: 6 }}>
          <StatusBadge status={report.status} />
        </div>
        {err ? <div className="error-note" style={{ marginTop: 6 }}>{err instanceof Error ? err.message : 'Erro.'}</div> : null}
      </div>

      <div className="list-actions">
        <button className="btn btn-ghost btn-sm" onClick={download} disabled={busy === 'pdf'}>
          <Download size={15} /> {busy === 'pdf' ? 'Gerando…' : 'PDF'}
        </button>

        {report.status === 'draft' && (
          <button className="btn btn-primary btn-sm" onClick={() => sign.mutate()} disabled={sign.isPending}>
            <PenLine size={15} /> {sign.isPending ? 'Enviando…' : 'Assinar'}
          </button>
        )}
        {report.status === 'pending_signature' && (
          <>
            {report.zapsign_sign_url && (
              <a className="btn btn-ghost btn-sm" href={report.zapsign_sign_url} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> Abrir
              </a>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => refreshStatus.mutate()} disabled={refreshStatus.isPending}>
              <RefreshCw size={15} className={refreshStatus.isPending ? 'spin' : ''} /> Status
            </button>
          </>
        )}
        {canDelete && (
          <button
            className="icon-btn"
            title="Excluir"
            onClick={() => window.confirm(`Excluir o relatório ${String(report.number).padStart(3, '0')}?`) && remove.mutate()}
            disabled={remove.isPending}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </li>
  );
}

function ReportModal({
  projectId,
  contractNumber,
  onClose,
}: {
  projectId: string;
  contractNumber: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const bounds = monthBounds(currentMonth());
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [contract, setContract] = useState(contractNumber ?? '');
  const [stateMode, setStateMode] = useState<StateMode>('sc');
  const [stateLogo, setStateLogo] = useState<string | null>(null);
  const [logoName, setLogoName] = useState('');
  const [title, setTitle] = useState('');

  function onPickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoName(file.name);
    const reader = new FileReader();
    reader.onload = () => setStateLogo(String(reader.result));
    reader.readAsDataURL(file);
  }

  const save = useMutation({
    mutationFn: () =>
      api.post('/reports', {
        projectId,
        title,
        contractNumber: contract,
        periodFrom: from,
        periodTo: to,
        stateMode,
        ...(stateMode === 'custom' && stateLogo ? { stateLogo } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reports'] });
      onClose();
    },
  });
  const valid = from && to && from <= to && (stateMode !== 'custom' || !!stateLogo);

  return (
    <Modal
      title="Novo relatório fotográfico"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending ? 'Criando…' : 'Criar relatório'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row">
          <label className="field">
            <span>Período — de</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>Até</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Nº do contrato</span>
          <input value={contract} onChange={(e) => setContract(e.target.value)} placeholder="Ex.: 163/2022" />
        </label>
        <div className="field">
          <span>Texto da capa (objeto do contrato)</span>
          <CorrectableTextarea
            value={title}
            onChange={setTitle}
            rows={4}
            placeholder="Ex.: COORDENAÇÃO, SUPERVISÃO E CONTROLE DE OBRAS RODOVIÁRIAS NA RODOVIA SC-485…"
          />
        </div>
        <div className="field">
          <span>Brasão do estado (capa e cabeçalho)</span>
          <Select
            value={stateMode}
            onChange={(v) => setStateMode(v as StateMode)}
            options={[
              { value: 'sc', label: 'Santa Catarina (SC)' },
              { value: 'none', label: 'Sem brasão' },
              { value: 'custom', label: 'Outro estado (enviar imagem)' },
            ]}
          />
          {stateMode === 'custom' && (
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              <label className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
                <ImagePlus size={15} /> {stateLogo ? 'Trocar imagem' : 'Escolher imagem da bandeira'}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPickLogo} />
              </label>
              {logoName && <span className="muted small">{logoName}</span>}
              {!stateLogo && <span className="muted small">Envie um PNG/JPG da bandeira ou brasão do estado.</span>}
            </div>
          )}
        </div>
        <p className="muted small">
          As fotos do período entram automaticamente, agrupadas por categoria. "Geral" aparece sem título; as demais com o título em
          cima.
        </p>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}
