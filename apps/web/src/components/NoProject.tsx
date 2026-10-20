import { Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Empty } from './ui';

export function NoProject() {
  const { user } = useAuth();
  return (
    <div className="card">
      <Empty
        icon={<Building2 size={28} />}
        title="Nenhuma obra cadastrada"
        text={
          user?.role === 'admin'
            ? 'Cadastre a primeira obra para começar a registrar fotos, diário e chuvas.'
            : 'Peça ao administrador para cadastrar a obra.'
        }
        action={
          user?.role === 'admin' ? (
            <Link className="btn btn-primary" to="/configuracoes">
              Cadastrar obra
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
