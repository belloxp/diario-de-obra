import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { ProjectProvider } from './project';
import { ActivityPage } from './pages/Activity';
import { ActivityUserPage } from './pages/ActivityUser';
import { DashboardPage } from './pages/Dashboard';
import { DiaryPage } from './pages/Diary';
import { LoginPage } from './pages/Login';
import { PhotosPage } from './pages/Photos';
import { RainPage } from './pages/Rain';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="fullscreen-center">
        <Spinner label="Carregando…" />
      </div>
    );
  }
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <ProjectProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="fotos" element={<PhotosPage />} />
          <Route path="diario" element={<DiaryPage />} />
          <Route path="chuva" element={<RainPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          {user.role === 'admin' && (
            <>
              <Route path="atividades" element={<ActivityPage />} />
              <Route path="atividades/:id" element={<ActivityUserPage />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProjectProvider>
  );
}
