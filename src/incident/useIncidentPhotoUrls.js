import { useEffect, useRef, useState } from 'react';
import { getPhotoBlob } from './incidentPhotoStorage';

/* Loads each photo's blob from IndexedDB (see incidentPhotoStorage.js) and
   turns it into an object URL for display -- used both by the on-screen
   Photos step (thumbnails) and by the PDF export root (appendix images), so
   there is exactly one place that owns this lifecycle.

   Returns a plain object keyed by photo id: { [id]: { url, status } },
   status one of 'loading' | 'ready' | 'missing' | 'error'. Callers render a
   placeholder for anything other than 'ready' instead of ever pointing an
   <img> at a URL that isn't actually live yet -- there is no error boundary
   anywhere in this app, so a broken/loading image must never crash or
   silently show a broken-image icon in a generated PDF.

   Object URLs are revoked (a) the moment a photo id disappears from the
   incident's photos array (removed by the user) and (b) on unmount --
   nothing here is ever left dangling across renders. */
export function useIncidentPhotoUrls(photos) {
  const entriesRef = useRef({});
  const [, forceRender] = useState(0);
  const photoIds = (photos || []).map(p => p.id).join(',');

  useEffect(() => {
    let cancelled = false;
    const ids = new Set((photos || []).map(p => p.id));
    let changed = false;

    Object.keys(entriesRef.current).forEach((id) => {
      if (!ids.has(id)) {
        const entry = entriesRef.current[id];
        if (entry.url) URL.revokeObjectURL(entry.url);
        delete entriesRef.current[id];
        changed = true;
      }
    });

    (photos || []).forEach((p) => {
      if (entriesRef.current[p.id]) return;
      entriesRef.current[p.id] = { url: null, status: 'loading' };
      changed = true;
      getPhotoBlob(p.id)
        .then((blob) => {
          if (cancelled) return;
          entriesRef.current[p.id] = blob
            ? { url: URL.createObjectURL(blob), status: 'ready' }
            : { url: null, status: 'missing' };
          forceRender((n) => n + 1);
        })
        .catch(() => {
          if (cancelled) return;
          entriesRef.current[p.id] = { url: null, status: 'error' };
          forceRender((n) => n + 1);
        });
    });

    if (changed) forceRender((n) => n + 1);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoIds]);

  useEffect(() => () => {
    Object.values(entriesRef.current).forEach((entry) => { if (entry.url) URL.revokeObjectURL(entry.url); });
    entriesRef.current = {};
  }, []);

  return entriesRef.current;
}
