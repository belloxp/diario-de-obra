import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ImagePlus, Images, Loader2, Trash2, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, uploadToR2 } from '../api';
import { useAuth } from '../auth';
import { CorrectableTextarea } from '../components/CorrectableTextarea';
import { NoProject } from '../components/NoProject';
import { Select } from '../components/Select';
import { Empty, ErrorNote, Modal, PageHeader, Spinner } from '../components/ui';
import { useProject } from '../project';
import type { Category, Photo } from '../types';
import { formatBytes, formatDateTime, fromDateTimeLocal, toDateTimeLocal } from '../utils';

const PAGE = 48;

export function PhotosPage() {
  const { project, loading } = useProject();
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState<string>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ categories: Category[] }>('/categories') });
  const categories = cats?.categories ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ['photos', project?.id, categoryId, from, to, limit],
    queryFn: () =>
      api.get<{ total: number; photos: Photo[] }>('/photos', {
        projectId: project!.id,
        categoryId: categoryId || undefined,
        from: from || undefined,
        to: to || undefined,
        limit,
      }),
    enabled: !!project,
    placeholderData: (prev) => prev,
  });

  if (loading) return <Spinner />;
  if (!project) return <NoProject />;

  const photos = data?.photos ?? [];

  return (
    <>
      <PageHeader
        title="Relatório fotográfico"
        subtitle="Fotos da obra organizadas por equipe/categoria, com data, hora e observação."
        actions={
          <button className="btn btn-primary" onClick={() => setUploading(true)}>
            <ImagePlus size={18} /> Enviar fotos
          </button>
        }
      />

      <div className="card toolbar">
        <div className="chips">
          <button className={`chip ${categoryId === '' ? 'active' : ''}`} onClick={() => { setCategoryId(''); setLimit(PAGE); }}>
            Todas
          </button>
          {categories.map((c) => (
            <button key={c.id} className={`chip ${categoryId === c.id ? 'active' : ''}`} onClick={() => { setCategoryId(c.id); setLimit(PAGE); }}>
              {c.name}
            </button>
          ))}
          <button className={`chip ${categoryId === 'none' ? 'active' : ''}`} onClick={() => { setCategoryId('none'); setLimit(PAGE); }}>
            Sem categoria
          </button>
        </div>
        <div className="date-range">
          <label>
            <span className="muted">De</span>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setLimit(PAGE); }} />
          </label>
          <label>
            <span className="muted">Até</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setLimit(PAGE); }} />
          </label>
          {(from || to) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFrom(''); setTo(''); }}>
              Limpar
            </button>
          )}
        </div>
      </div>

      <ErrorNote error={error} />
      {isLoading ? (
        <Spinner />
      ) : photos.length === 0 ? (
        <div className="card">
          <Empty
            icon={<Images size={28} />}
            title="Nenhuma foto encontrada"
            text="Envie as fotos do dia ou ajuste os filtros."
            action={
              <button className="btn btn-primary" onClick={() => setUploading(true)}>
                <ImagePlus size={18} /> Enviar fotos
              </button>
            }
          />
        </div>
      ) : (
        <>
          <p className="muted small">
            {photos.length} de {data?.total} foto(s)
          </p>
          <div className="photo-grid">
            {photos.map((p) => (
              <button key={p.id} className="photo-card" onClick={() => setSelected(p)}>
                <div className="photo-thumb">
                  <img src={p.url} alt={p.note || 'Foto da obra'} loading="lazy" />
                  {p.category_name && <span className="badge">{p.category_name}</span>}
                </div>
                <div className="photo-info">
                  <span className="muted">{formatDateTime(p.taken_at)}</span>
                  <p>{p.note || <em className="muted">Sem observação</em>}</p>
                  <span className="muted small">por {p.created_by_name ?? '—'}</span>
                </div>
              </button>
            ))}
          </div>
          {data && photos.length < data.total && (
            <div className="center">
              <button className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
                Carregar mais
              </button>
            </div>
          )}
        </>
      )}

      {selected && (
        <PhotoModal
          photo={selected}
          categories={categories}
          canEdit={user!.role === 'admin' || selected.created_by === user!.id}
          onClose={() => setSelected(null)}
        />
      )}
      {uploading && <UploadModal projectId={project.id} categories={categories} onClose={() => setUploading(false)} />}
    </>
  );
}

/* ---------------- Detalhe / edição ---------------- */

function PhotoModal({ photo, categories, canEdit, onClose }: { photo: Photo; categories: Category[]; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState(photo.note);
  const [categoryId, setCategoryId] = useState(photo.category_id ?? '');
  const [takenAt, setTakenAt] = useState(toDateTimeLocal(photo.taken_at));

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['photos'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['categories'] });
  };

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/photos/${photo.id}`, {
        note,
        categoryId: categoryId || null,
        takenAt: fromDateTimeLocal(takenAt),
      }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/photos/${photo.id}`),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  return (
    <Modal
      title="Foto da obra"
      onClose={onClose}
      wide
      footer={
        canEdit ? (
          <>
            <button
              className="btn btn-danger-ghost"
              onClick={() => window.confirm('Excluir esta foto? Essa ação não pode ser desfeita.') && remove.mutate()}
              disabled={remove.isPending}
            >
              <Trash2 size={16} /> Excluir
            </button>
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="photo-detail">
        <img src={photo.url} alt={photo.note || 'Foto da obra'} />
        <div className="stack">
          <div className="field">
            <span>Categoria</span>
            <Select
              value={categoryId}
              onChange={setCategoryId}
              disabled={!canEdit}
              placeholder="Sem categoria"
              options={[{ value: '', label: 'Sem categoria' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <label className="field">
            <span>Data e hora</span>
            <input type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} disabled={!canEdit} />
          </label>
          <div className="field">
            <span>Observação</span>
            {canEdit ? <CorrectableTextarea value={note} onChange={setNote} rows={5} /> : <p>{photo.note || '—'}</p>}
          </div>
          <p className="muted small">
            Enviada por {photo.created_by_name ?? '—'} em {formatDateTime(photo.created_at)}
            {photo.updated_by_name && <> · editada por {photo.updated_by_name} em {formatDateTime(photo.updated_at)}</>}
            {photo.size_bytes ? <> · {formatBytes(photo.size_bytes)}</> : null}
          </p>
          <ErrorNote error={save.error ?? remove.error} />
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Envio em lote ---------------- */

interface Item {
  id: string;
  file: File;
  preview: string;
  note: string;
  categoryId: string;
  takenAt: string;
  status: 'idle' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

function UploadModal({ projectId, categories, onClose }: { projectId: string; categories: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));

  function addFiles(list: FileList | File[]) {
    const defaultCat = categories.find((c) => c.name === 'Geral')?.id ?? '';
    const next: Item[] = Array.from(list)
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        note: '',
        categoryId: defaultCat,
        takenAt: toDateTimeLocal(new Date(file.lastModified || Date.now())),
        status: 'idle',
        progress: 0,
      }));
    setItems((cur) => [...cur, ...next]);
  }

  async function sendAll() {
    setBusy(true);
    for (const item of itemsRef.current) {
      if (item.status === 'done') continue;
      patch(item.id, { status: 'uploading', progress: 0, error: undefined });
      try {
        const { key, uploadUrl } = await api.post<{ key: string; uploadUrl: string }>('/photos/presign', {
          projectId,
          contentType: item.file.type,
          size: item.file.size,
        });
        await uploadToR2(uploadUrl, item.file, (pct) => patch(item.id, { progress: pct }));
        await api.post('/photos', {
          projectId,
          categoryId: item.categoryId || null,
          key,
          originalName: item.file.name,
          mimeType: item.file.type,
          takenAt: fromDateTimeLocal(item.takenAt),
          note: item.note,
        });
        patch(item.id, { status: 'done', progress: 100 });
      } catch (e) {
        patch(item.id, { status: 'error', error: e instanceof Error ? e.message : 'Falha no envio.' });
      }
    }
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ['photos'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['categories'] });
  }

  const pending = items.filter((i) => i.status !== 'done').length;
  const allDone = items.length > 0 && pending === 0;

  return (
    <Modal
      title="Enviar fotos"
      onClose={busy ? () => undefined : onClose}
      wide
      footer={
        <>
          <span className="muted small">
            {items.length === 0 ? 'Nenhuma foto selecionada' : allDone ? 'Tudo enviado!' : `${pending} foto(s) para enviar`}
          </span>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {allDone ? 'Fechar' : 'Cancelar'}
          </button>
          <button className="btn btn-primary" onClick={sendAll} disabled={busy || pending === 0}>
            {busy ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />} Enviar {pending > 0 ? `(${pending})` : ''}
          </button>
        </>
      }
    >
      <div
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <UploadCloud size={26} />
        <strong>Toque para escolher as fotos</strong>
        <span className="muted">ou arraste para cá · JPG, PNG, WEBP ou HEIC · até 20 MB cada</span>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 1 && (
        <div className="field inline-field">
          <span>Aplicar categoria a todas</span>
          <Select
            value=""
            placeholder="Escolher…"
            onChange={(v) => setItems((cur) => cur.map((i) => (i.status === 'done' ? i : { ...i, categoryId: v })))}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      )}

      <ul className="upload-list">
        {items.map((i) => (
          <li key={i.id} className={`upload-item ${i.status}`}>
            <img src={i.preview} alt="" />
            <div className="upload-fields">
              <div className="row">
                <Select
                  value={i.categoryId}
                  onChange={(v) => patch(i.id, { categoryId: v })}
                  disabled={i.status === 'done' || busy}
                  placeholder="Sem categoria"
                  options={[{ value: '', label: 'Sem categoria' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                />
                <input type="datetime-local" value={i.takenAt} onChange={(e) => patch(i.id, { takenAt: e.target.value })} disabled={i.status === 'done' || busy} />
              </div>
              {i.status === 'done' ? (
                <p className="muted">{i.note || 'Sem observação'}</p>
              ) : (
                <CorrectableTextarea value={i.note} onChange={(v) => patch(i.id, { note: v })} rows={2} placeholder="Observação sobre a foto (opcional)" />
              )}
              {i.status === 'uploading' && (
                <div className="progress">
                  <div style={{ width: `${i.progress}%` }} />
                </div>
              )}
              {i.status === 'error' && (
                <span className="error-note">
                  <AlertCircle size={14} /> {i.error}
                </span>
              )}
            </div>
            <div className="upload-state">
              {i.status === 'done' ? (
                <CheckCircle2 size={20} className="ok" />
              ) : (
                <button
                  className="icon-btn"
                  aria-label="Remover da lista"
                  disabled={busy}
                  onClick={() => {
                    URL.revokeObjectURL(i.preview);
                    setItems((cur) => cur.filter((x) => x.id !== i.id));
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
