import { useMemo } from 'react';

/**
 * AssetResolver Hook
 * Scans fullMeshState for generated artifacts/files and returns download links.
 */
export const useAssetResolver = (fullMeshState: any) => {
  return useMemo(() => {
    const assets: Record<string, string> = {};
    
    if (!fullMeshState) return assets;

    const toOutputUrl = (rawPath?: string | null) => {
      if (!rawPath) return null;

      const normalizedPath = String(rawPath).replace(/\\/g, '/');

      if (
        normalizedPath.startsWith('http://') ||
        normalizedPath.startsWith('https://') ||
        normalizedPath.startsWith('/outputs/')
      ) {
        return normalizedPath;
      }

      const outputsMarker = '/outputs/';
      const outputsIndex = normalizedPath.toLowerCase().lastIndexOf(outputsMarker);
      if (outputsIndex >= 0) {
        return normalizedPath.slice(outputsIndex);
      }

      const fileName = normalizedPath.split('/').pop();
      return fileName ? `/outputs/${encodeURIComponent(fileName)}` : null;
    };

    // Scan for files array in any branch (flattening the search)
    const scan = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (Array.isArray(obj)) {
        obj.forEach(item => {
          if (item && item.filename && item.downloadUrl) {
            const resolvedUrl = toOutputUrl(item.downloadUrl) || item.downloadUrl;
            assets[item.filename] = resolvedUrl;
          }
          if (item && item.name && item.path) {
            const resolvedUrl = toOutputUrl(item.path);
            if (resolvedUrl) {
              assets[item.name] = resolvedUrl;
            }
          }
        });
      }

      Object.keys(obj).forEach(key => {
        if (key === 'files' || key === 'artifacts' || key === 'outputs') {
          scan(obj[key]);
        } else if (typeof obj[key] === 'object') {
          scan(obj[key]);
        }
      });
    };

    scan(fullMeshState);
    return assets;
  }, [fullMeshState]);
};
