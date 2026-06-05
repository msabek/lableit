import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { projects as projectsApi, assets as assetsApi, Project, Asset } from '../api';

export function useProjectData(projectId?: string) {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [projectAssets, setProjectAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = useCallback(async (projId: string) => {
    // Don't load if auth isn't ready or user isn't signed in
    if (!isAuthLoaded || !isSignedIn) return;
    try {
      const assetList = await assetsApi.getAll(projId);
      setProjectAssets(assetList);
    } catch (err: any) {
      console.error('Failed to load assets:', err);
      // Don't set error for 401 - auth will handle it
      if (err.response?.status !== 401) {
        setError('Failed to load assets');
      }
    }
  }, [isAuthLoaded, isSignedIn]);

  const loadProject = useCallback(async (id: string) => {
    // Don't load if auth isn't ready or user isn't signed in
    if (!isAuthLoaded || !isSignedIn) return;
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
      // Don't set error for 401 - auth will handle it
      if (err.response?.status !== 401) {
        setError('Failed to load project');
      }
    } finally {
      setLoading(false);
    }
  }, [loadAssets, isAuthLoaded, isSignedIn]);

  useEffect(() => {
    // Only fetch data when auth is loaded and user is signed in
    if (!isAuthLoaded || !isSignedIn) return;
    
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
  }, [projectId, loadProject, isAuthLoaded, isSignedIn]);

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
