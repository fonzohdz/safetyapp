import { useRef, useState } from 'react';
import { INCIDENT_PHOTO_CATEGORIES, emptyIncidentPhoto } from './incidentModel';
import { incidentCopy as t } from './incidentCopy';
import { processIncidentPhotoFile, findLikelyDuplicatePhoto } from './incidentPhotoProcessing';
import { savePhotoBlob, deletePhotoBlob } from './incidentPhotoStorage';
import { useIncidentPhotoUrls } from './useIncidentPhotoUrls';

/* ── Incident Photos step ──
   Field UX goal: tap photo -> take/select picture -> optionally label it ->
   done. Everything else (resize/compress, IndexedDB storage, object-URL
   lifecycle, PDF appendix pagination) happens underneath without the user
   ever seeing it -- see incidentPhotoProcessing.js / incidentPhotoStorage.js
   / useIncidentPhotoUrls.js / incidentPdfGenerate.jsx. */
export default function IncidentPhotos({ incident, upd, showToast, prev, next }) {
  const c = t.photos;
  const photos = incident.photos || [];
  const photoUrls = useIncidentPhotoUrls(photos);
  const fileInputRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);

  function openPicker() {
    fileInputRef.current?.click();
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setIsProcessing(true);
    // A local accumulator, not `incident.photos` -- upd()/setIncident() is
    // async and this loop awaits between files, so re-reading the `incident`
    // prop after the first await would see a stale snapshot (React hasn't
    // re-rendered this component with the previous file's new photo yet)
    // and each subsequent upd() would silently clobber it. Accumulating
    // locally and always passing the FULL resulting array sidesteps that
    // entirely. Also doubles as in-batch duplicate detection (selecting the
    // same file twice in one picker action).
    let nextPhotos = photos.slice();
    try {
      for (const file of files) {
        const duplicate = findLikelyDuplicatePhoto(nextPhotos, file);
        if (duplicate) {
          const proceed = window.confirm(`"${file.name}" looks like a photo you already added. Add it again anyway?`);
          if (!proceed) continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const { blob, width, height, mimeType } = await processIncidentPhotoFile(file);
          const meta = {
            ...emptyIncidentPhoto(),
            width,
            height,
            mimeType,
            sourceName: file.name,
            sourceSize: file.size,
          };
          // eslint-disable-next-line no-await-in-loop
          await savePhotoBlob(meta.id, incident.id, blob);
          nextPhotos = [...nextPhotos, meta];
          upd({ photos: nextPhotos });
        } catch (err) {
          showToast?.(err?.message || `Couldn't add "${file.name}".`);
        }
      }
    } finally {
      setIsProcessing(false);
    }
  }

  function onInputChange(e) {
    const { files } = e.target;
    handleFiles(files);
    e.target.value = ''; // allow re-selecting the same file later
  }

  function removePhoto(photo) {
    if (!window.confirm(c.confirmRemove)) return;
    deletePhotoBlob(photo.id).catch(() => { /* metadata removal below still proceeds */ });
    upd({ photos: (incident.photos || []).filter(p => p.id !== photo.id) });
  }

  function updatePhoto(id, patch) {
    upd({ photos: (incident.photos || []).map(p => (p.id === id ? { ...p, ...patch } : p)) });
  }

  return (
    <div className="stepPanel">
      <div className="stepPanelHeader">
        <h3>{c.title}</h3>
        <p>{c.intro}</p>
      </div>
      <div className="incidentStepGrid">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={onInputChange}
          className="incPhotoFileInput"
          aria-label={c.addPhoto}
        />
        <button type="button" className="btn primary lg incPhotoAddBtn" onClick={openPicker} disabled={isProcessing} aria-busy={isProcessing}>
          {isProcessing ? c.processing : c.addPhoto}
        </button>

        {photos.length === 0 && <p className="helperText">{c.empty}</p>}

        <div className="incPhotoCardList">
          {photos.map((photo) => {
            const entry = photoUrls[photo.id];
            return (
              <div className="incPhotoCard" key={photo.id}>
                <div className="incPhotoCardThumbWrap">
                  {entry?.status === 'ready' && entry.url
                    ? <img src={entry.url} alt={photo.caption || photo.category || 'Incident photo'} className="incPhotoCardThumb" />
                    : <div className="incPhotoCardThumbPlaceholder">{entry?.status === 'missing' || entry?.status === 'error' ? c.unavailable : c.loading}</div>}
                </div>
                <div className="incPhotoCardFields">
                  <label className="field">
                    <span>{c.category}</span>
                    <select value={photo.category || ''} onChange={e => updatePhoto(photo.id, { category: e.target.value })}>
                      <option value="">{c.categoryNone}</option>
                      {INCIDENT_PHOTO_CATEGORIES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>{c.caption}</span>
                    <input
                      type="text"
                      value={photo.caption || ''}
                      placeholder={c.captionPlaceholder}
                      maxLength={220}
                      onChange={e => updatePhoto(photo.id, { caption: e.target.value })}
                    />
                  </label>
                  <button type="button" className="btn ghost sm incPhotoRemoveBtn" onClick={() => removePhoto(photo)} aria-label={`${c.remove}`}>
                    {c.remove}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="stepFooter">
        <div className="leftBtns">
          {prev && <button className="btn ghost" onClick={prev}>{t.nav.back}</button>}
        </div>
        <div className="rightBtns">
          {next && <button className="btn primary" onClick={next}>{t.nav.finish}</button>}
        </div>
      </div>
    </div>
  );
}
