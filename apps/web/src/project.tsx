import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Project } from './types';

interface ProjectState {
  projects: Project[];
  project: Project | null;
  setProjectId: (id: string) => void;
  loading: boolean;
}

const KEY = 'diario.projectId';
const ProjectContext = createContext<ProjectState | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ['projects'], queryFn: () => api.get<{ projects: Project[] }>('/projects') });
  const projects = useMemo(() => data?.projects ?? [], [data]);
  const [projectId, setProjectId] = useState<string | null>(() => localStorage.getItem(KEY));

  const project = useMemo(() => {
    const active = projects.filter((p) => p.active);
    return projects.find((p) => p.id === projectId && p.active) ?? active[0] ?? null;
  }, [projects, projectId]);

  useEffect(() => {
    if (project) localStorage.setItem(KEY, project.id);
  }, [project]);

  const value = useMemo(
    () => ({ projects, project, setProjectId: (id: string) => setProjectId(id), loading: isLoading }),
    [projects, project, isLoading],
  );
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject fora do ProjectProvider');
  return ctx;
}
