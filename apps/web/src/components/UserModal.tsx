import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import type { Role } from '../types';
import { Select } from './Select';
import { ErrorNote, Modal } from './ui';

interface Editable {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export function UserModal({ user, isSelf, onClose }: { user?: Editable; isSelf?: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'member');
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState('');

  const save = useMutation({
    mutationFn: () =>
      user
        ? api.patch(`/users/${user.id}`, { name, role, active, ...(password ? { password } : {}) })
        : api.post('/users', { name, email, role, password }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['user-activity'] });
      onClose();
    },
  });

  const valid = name.trim().length >= 2 && (user ? password === '' || password.length >= 8 : email.includes('@') && password.length >= 8);

  return (
    <Modal
      title={user ? 'Editar usuário' : 'Novo usuário'}
      onClose={onClose}
      footer={
        <>
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
        <label className="field">
          <span>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>E-mail (login)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!user} />
        </label>
        <div className="field">
          <span>Perfil</span>
          <Select
            value={role}
            onChange={(v) => setRole(v as Role)}
            disabled={isSelf}
            options={[
              { value: 'member', label: 'Funcionário' },
              { value: 'admin', label: 'Administrador' },
            ]}
          />
        </div>
        <label className="field">
          <span>{user ? 'Nova senha (deixe em branco para manter)' : 'Senha'}</span>
          <input type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" />
        </label>
        {user && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={isSelf} />
            <span>Usuário ativo (pode entrar no sistema)</span>
          </label>
        )}
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}
