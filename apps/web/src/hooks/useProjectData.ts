import { useState, useEffect, useCallback } from 'react';
import { projects as projectsApi, assets as assetsApi, Project, Asset } from '../api';

export function useProjectData(projectId?: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [projectAssets, setProjectAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = useCallback(async (projId: string) => {
    try {
      const assetList = await assetsApi.getAll(projId);
      setProjectAssets(assetList);
    } catch (err: any) {
      console.error('Failed to load assets:', err);
      setError('Failed to load assets');
    }
  }, []);

  const loadProject = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const proj = await projectsApi.get(id);
      setProject(proj);
      // Project now contains assets directly
      if (proj.assets && proj.assets.length > 0) {
        setProjectAssets(proj.assets);
      } else {
        // Fallback to loading assets separately
        loadAssets(id);
      }
    } catch (err: any) {
      console.error('Failed to load project:', err);
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [loadAssets]);

  useEffect(() => {
    if (projectId) {
      loadProject(projectId);
    } else {
       // Mock data for demo if no ID
       const mockProject: Project = {
        id: '1',
        name: 'Demo Project',
        createdAt: new Date().toISOString(),
        assets: [],
        classes: [
          { id: '1', projectId: '1', name: 'person', color: '#FF0000', threshold: 0.6 },
          { id: '2', projectId: '1', name: 'car', color: '#00FF00', threshold: 0.55 },
        ]
      };
      setProject(mockProject);
    }
  }, [projectId, loadProject]);

  const refreshAssets = useCallback(() => {
    if (projectId) {
      loadAssets(projectId);
    }
  }, [projectId, loadAssets]);

  return {
    project,
    setProject, // Exposed for optimistic updates (e.g. threshold changes)
    projectAssets,
    loading,
    error,
    setError,
    loadAssets,
    refreshAssets
  };
}
