import { $, $$, esc, icon, icons, notice, toast } from './ui.js';
import { token } from './auth.js';

export const photoSection = `<section class="form-section"><h2>Turf photographs</h2><p class="muted">Your cover photo appears in search results. All photos appear on the turf’s detail page once published.</p><label class="upload-label">${icon('upload')}<span>Choose JPG, PNG or WebP photos, up to 5 MB each<input id="photo-upload" type="file" accept="image/jpeg,image/png,image/webp" multiple></span></label><div id="photo-status" role="status" aria-live="polite"></div><div class="photo-manager" id="photos"></div></section>`;
const readPhoto = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Unable to read this photo. Choose it again.'));
  reader.readAsDataURL(file);
});

export function photoManager({ api, turfId, coverImageId, name, isCurrent }) {
  let pending = [], saved = [], working = false;
  const current = () => isCurrent() && $('#photos');
  function message(text, error = false) {
    if (current()) $('#photo-status').innerHTML = notice(text, error ? 'error' : 'info');
  }
  function lock(value) {
    working = value;
    if (!current()) return;
    $('#photo-upload').disabled = value;
    $$('#photos button').forEach(button => button.disabled = value);
    $('#turf-form button[type="submit"]').disabled = value || Boolean($('#turf-form').dataset.saving);
  }
  async function draw() {
    if (!current()) return;
    $('#photos').innerHTML = saved.map(p => `<div class="photo-item"><img data-private-image="${p.id}" alt="${esc(p.alt)}"><div class="photo-actions">${p.id === coverImageId ? '<span class="cover-label">Search cover</span>' : `<button type="button" class="outline" data-cover="${p.id}">Use as cover</button>`}<button type="button" class="quiet danger" data-remove-photo="${p.id}" aria-label="Remove ${esc(p.alt)}">Remove</button></div></div>`).join('') + pending.map((p, i) => `<div class="photo-item"><img src="${esc(p.preview)}" alt="${esc(p.file.name)}"><small>${esc(p.file.name)}</small><div class="photo-actions"><span class="muted">${p.failed ? 'Upload failed' : 'Ready to upload'}</span><button type="button" class="quiet danger" data-remove-pending="${i}">Remove</button></div></div>`).join('') + (!saved.length && !pending.length ? '<p class="muted">No photos yet. Add photographs of the real turf to help teams choose their pitch.</p>' : '') + (pending.some(p => p.failed) && turfId ? '<button type="button" class="outline" id="retry-photos">Retry remaining uploads</button>' : '');
    $$('[data-remove-pending]').forEach(b => b.onclick = () => { pending.splice(Number(b.dataset.removePending), 1); draw(); });
    $$('[data-cover]').forEach(b => b.onclick = () => mutate(async () => {
      await api(`/admin/turfs/${turfId}/cover`, 'PATCH', { imageId: b.dataset.cover });
      coverImageId = b.dataset.cover;
      message('Cover updated. This photo now appears in search results.');
    }));
    $$('[data-remove-photo]').forEach(b => b.onclick = () => mutate(async () => {
      await api('/admin/images/' + b.dataset.removePhoto, 'DELETE');
      await refresh();
      message('Photo removed.');
    }));
    $('#retry-photos')?.addEventListener('click', () => upload(turfId).catch(() => {}));
    $$('#photos button').forEach(button => button.disabled = working);
    icons();
    const elements = $$('[data-private-image]');
    const bearer = elements.length ? await token() : null;
    await Promise.all(elements.map(async el => {
      try {
        const response = await fetch('/api/images/' + el.dataset.privateImage, { headers: { Authorization: 'Bearer ' + bearer } });
        if (!response.ok) throw new Error('Unable to load photo');
        const url = URL.createObjectURL(await response.blob());
        if (!el.isConnected) { URL.revokeObjectURL(url); return; }
        el.onload = el.onerror = () => URL.revokeObjectURL(url);
        el.src = url;
      } catch { el.alt += ' (preview unavailable)'; }
    }));
  }
  async function refresh() {
    const result = await api(`/admin/turfs/${turfId}/photos`);
    saved = result.photos;
    // Read the current cover after deletion or a concurrent admin change.
    coverImageId = result.coverImageId;
  }
  async function mutate(action) {
    if (working) return;
    lock(true);
    try { await action(); await draw(); } catch (e) { message(e.message, true); } finally { lock(false); }
  }
  async function upload(id, turfName = name) {
    if (working) throw new Error('Wait for the current photo upload to finish.');
    turfId = id;
    lock(true);
    try {
      while (pending.length) {
        const photo = pending[0];
        message(`Uploading ${photo.file.name}… ${pending.length} remaining.`);
        try {
          const { image } = await api(`/admin/turfs/${id}/photos`, 'POST', { data: photo.preview.split(',')[1], alt: turfName });
          saved.push(image);
          coverImageId ||= image.id;
          pending.shift();
        } catch (e) { photo.failed = true; throw e; }
      }
      message('Photos saved. The cover will appear in search when the turf is published.');
    } catch (e) {
      message(`Some photos could not be uploaded. ${e.message} Retry the remaining uploads.`, true);
      throw e;
    } finally { await draw(); lock(false); }
  }
  $('#photo-upload').onchange = async e => {
    const files = [...e.target.files];
    e.target.value = '';
    lock(true);
    try {
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
          toast(`${file.name}: choose a JPG, PNG or WebP photo up to 5 MB.`);
          continue;
        }
        pending.push({ file, preview: await readPhoto(file) });
      }
      await draw();
      message(turfId ? 'Photos ready to upload.' : 'Photos ready. Save the turf to upload them; the first photo becomes the search cover.');
    } catch (e) { message(e.message, true); } finally { lock(false); }
    if (turfId && pending.length) await upload(turfId).catch(() => {});
  };
  return { upload, get hasPending() { return pending.length > 0; }, async load() { if (turfId) await refresh(); await draw(); } };
}
