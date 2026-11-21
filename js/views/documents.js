/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — views/documents.js
   Documents clients (contrat, devis, facture, justificatif, document
   administratif, autre) : fichiers stockés localement dans IndexedDB
   (magasin « media », Blob), aperçu des images, ouverture dans un
   nouvel onglet, téléchargement, renommage, suppression confirmée.
   Glisser-déposer accepté. 25 Mo maximum par fichier.
   ██████████████████████████████████████████████████████████████ */
"use strict";

const DCF_DEFAULT = { q: '', kind: '', client: '', page: 1 };
const DCF = UI_STATE.load('documents', DCF_DEFAULT);
const DOC_ICON = { contrat: 'clipcheck', devis: 'file', facture: 'receipt', justificatif: 'shield', administratif: 'folder', autre: 'clipfile' };

function filteredDocuments(f = DCF) {
  const t = norm(f.q);
  return S.documents.filter(d => (!f.kind || d.kind === f.kind) && (!f.client || d.clientId === f.client) && (!t || norm(d.name + ' ' + d.comment + ' ' + clientName(d.clientId)).includes(t)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

VIEWS.documents = (el) => {
  const size = sum(S.documents, d => d.size);
  el.innerHTML = pageHead('Documents', crumbFor('documents'),
    can('doc.edit') ? `<button type="button" class="btn gold" id="docNew">${svg('up')} Ajouter des documents</button>` : '',
    `${S.documents.length} document(s) · ${fmtSize(size)} enregistrés dans ce navigateur (IndexedDB)`) +
    (can('doc.edit') ? dropZoneHTML('docDrop') : '') +
    `<div class="tbl-tools" role="search" aria-label="Filtrer les documents">
      ${searchBox('docQ', 'Rechercher un document', DCF.q, 'Nom du fichier, client, commentaire…', 300)}
      ${filterSelect('docKind', 'Type de document', Object.entries(DOC_KINDS), DCF.kind, 'Tous types')}
      ${filterSelect('docClient', 'Client', optClients(() => true).map(([v, l]) => [v, l.split(' — ')[0]]), DCF.client, 'Tous clients')}
      <button type="button" class="btn ghost sm" id="docReset">Réinitialiser</button></div>
    <section class="panel"><div class="panel-b" id="docList" aria-live="polite"></div></section>`;
  const draw = () => {
    UI_STATE.save('documents', DCF);
    const rows = filteredDocuments();
    const pg = paginate(rows, DCF);
    const host = $('#docList', el);
    host.innerHTML = rows.length ? docListHTML(pg.rows, { client: true }) + pagerHTML(DCF.page, pg.pages, pg.total, pg.start, pg.rows.length, 'document')
      : S.documents.length ? '<p class="muted">Aucun document ne correspond à ces filtres.</p>' : emptyState('folder', 'Aucun document', 'Associez des contrats, justificatifs ou documents administratifs à vos clients. Ils restent stockés sur ce poste.');
    hydrateMedia(host); bindPager(host, DCF, draw); bindDocList(host);
  };
  draw();
  $('#docQ', el).oninput = debounce(e => { DCF.q = e.target.value; DCF.page = 1; draw(); }, 150);
  [['docKind', 'kind'], ['docClient', 'client']].forEach(([id, k]) => $('#' + id, el).onchange = e => { DCF[k] = e.target.value; DCF.page = 1; draw(); });
  $('#docReset', el).onclick = () => { Object.assign(DCF, DCF_DEFAULT); UI_STATE.save('documents', DCF); route(); };
  if ($('#docNew', el)) $('#docNew', el).onclick = () => documentForm(DCF.client || '');
  if (can('doc.edit')) bindDropZone(el, 'docDrop', files => documentForm(DCF.client || '', files));
};

/* ---------- Zone de dépôt (glisser-déposer ou parcourir) ---------- */
const dropZoneHTML = id => `<div class="drop-zone" id="${id}">${svg('up')}<p><b>Déposez vos fichiers ici</b> ou <label class="link-btn" style="cursor:pointer">parcourez votre ordinateur<input type="file" id="${id}In" multiple class="sr-only"></label></p><small class="muted">PDF, images, documents bureautiques… 25 Mo maximum par fichier.</small></div>`;
function bindDropZone(root, id, onFiles) {
  const z = $('#' + id, root); if (!z) return;
  ['dragenter', 'dragover'].forEach(t => z.addEventListener(t, e => { e.preventDefault(); z.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => z.addEventListener(t, e => { e.preventDefault(); z.classList.remove('over'); }));
  z.addEventListener('drop', e => { const f = [...(e.dataTransfer?.files || [])]; if (f.length) onFiles(f); });
  $('#' + id + 'In', root).onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) onFiles(f); };
}

function docListHTML(list, { client = false } = {}) {
  return `<div class="doc-list">${list.map(d => `<div class="doc-row" data-doc="${d.id}">
      <div class="doc-ic">${/^image\//.test(d.type) ? `<img data-media="${esc(d.mediaId)}" alt="Aperçu de ${esc(d.name)}">` : svg(DOC_ICON[d.kind] || 'file')}</div>
      <div class="grow"><b>${esc(d.name)}</b><small>${esc(DOC_KINDS[d.kind] || 'Autre')} · ${fmtSize(d.size)} · ajouté le ${fmtDate(d.createdAt)}${d.userName ? ' par ' + esc(d.userName) : ''}${d.demo ? ' · démo' : ''}</small>
        ${client ? `<button type="button" class="link-btn d-block" data-tocli="${d.clientId}" style="font-size:.84rem">${esc(clientName(d.clientId))}</button>` : ''}${d.comment ? `<small class="d-block soft">${esc(d.comment)}</small>` : ''}</div>
      <div class="row wrap" style="gap:6px">
        <button type="button" class="btn sm ghost" data-docopen="${d.id}">${svg('eye')} Ouvrir</button>
        <button type="button" class="btn icon sm ghost" data-docdl="${d.id}" aria-label="Télécharger ${esc(d.name)}" title="Télécharger">${svg('down')}</button>
        ${can('doc.edit') ? `<button type="button" class="btn icon sm ghost" data-docedit="${d.id}" aria-label="Renommer ou reclasser ${esc(d.name)}" title="Modifier">${svg('edit')}</button>` : ''}
        ${can('doc.delete') ? `<button type="button" class="btn icon sm danger" data-docdel="${d.id}" aria-label="Supprimer ${esc(d.name)}" title="Supprimer">${svg('trash')}</button>` : ''}
      </div></div>`).join('')}</div>`;
}
async function documentBlob(d) {
  const m = await IDB.getMedia(d.mediaId);
  if (!m || !m.blob) throw new Error('Fichier introuvable dans la base locale (supprimé ou non restauré).');
  return m.blob;
}
function bindDocList(root) {
  $$('[data-tocli]', root).forEach(b => b.onclick = () => go('client', { id: b.dataset.tocli, tab: 'documents' }));
  $$('[data-docopen]', root).forEach(b => b.onclick = () => guard(b, async () => {
    const d = documentById(b.dataset.docopen); const blob = await documentBlob(d);
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) downloadBlob(blob, d.name);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }));
  $$('[data-docdl]', root).forEach(b => b.onclick = () => guard(b, async () => { const d = documentById(b.dataset.docdl); downloadBlob(await documentBlob(d), d.name); }));
  $$('[data-docedit]', root).forEach(b => b.onclick = () => documentEditForm(b.dataset.docedit));
  $$('[data-docdel]', root).forEach(b => b.onclick = () => {
    const d = documentById(b.dataset.docdel); if (!d) return;
    confirmDialog(`Supprimer définitivement le document « ${d.name} » de ${clientName(d.clientId)} ? Le fichier sera effacé de ce navigateur.`, async () => { await deleteDocument(d.id); toast('Document supprimé', 'dng'); }, { yes: 'Supprimer le document' });
  });
}

/* Ajout de documents (avec fichiers déjà choisis ou non) */
function documentForm(clientId = '', files = []) {
  if (!S.clients.length) { toast('Créez d\'abord un client.', 'warn'); return go('clients', { action: 'new' }); }
  let chosen = [...files];
  const guessKind = name => /contrat/i.test(name) ? 'contrat' : /devis/i.test(name) ? 'devis' : /factur/i.test(name) ? 'facture' : /(kbis|rib|justif|identit|attestation)/i.test(name) ? 'justificatif' : 'autre';
  openModal({
    title: 'Ajouter des documents', wide: true,
    body: `${clientPicker('dcCli', 'Client', clientId, { filter: () => true })}
      <div class="field"><span class="flabel">Fichiers</span><label class="btn sm" style="cursor:pointer;align-self:flex-start">${svg('up')} Choisir des fichiers<input type="file" id="dcFiles" multiple class="sr-only"></label><div id="dcChosen" class="small-p soft" style="margin-top:8px" aria-live="polite"></div></div>
      <div class="grid-2">${selectHTML({ id: 'dcKind', label: 'Type de document', options: Object.entries(DOC_KINDS), value: chosen[0] ? guessKind(chosen[0].name) : 'autre' })}${fieldHTML({ id: 'dcCom', label: 'Commentaire (facultatif)', value: '' })}</div>`,
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="dcSave">${svg('up')} Enregistrer</button>`,
    onOpen: m => {
      bindClientPicker(m, 'dcCli');
      const show = () => { $('#dcChosen', m).innerHTML = chosen.length ? chosen.map(f => `${svg('file', 'inl')} ${esc(f.name)} <span class="muted">(${fmtSize(f.size)})</span>`).join('<br>') : 'Aucun fichier choisi.'; };
      show();
      $('#dcFiles', m).onchange = e => { chosen = chosen.concat([...e.target.files]); e.target.value = ''; if (chosen[0]) $('#dcKind', m).value = guessKind(chosen[0].name); show(); };
      $('#dcSave', m).onclick = e => guard(e.currentTarget, async () => {
        try { const docs = await addDocuments(val(m, 'dcCli'), chosen, { kind: val(m, 'dcKind'), comment: val(m, 'dcCom') }); closeModal(1); toast(`${docs.length} document(s) ajouté(s)`, 'ok'); }
        catch (err) { formError(m, err.message); }
      });
    }
  });
}
function documentEditForm(id) {
  const d = documentById(id); if (!d) return;
  openModal({
    title: 'Modifier le document',
    body: fieldHTML({ id: 'deName', label: 'Nom', value: d.name, req: true }) + selectHTML({ id: 'deKind', label: 'Type', options: Object.entries(DOC_KINDS), value: d.kind }) + textareaHTML({ id: 'deCom', label: 'Commentaire', value: d.comment || '', rows: 2 }),
    footer: `<button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn gold" id="deSave">Enregistrer</button>`,
    onOpen: m => $('#deSave', m).onclick = e => guard(e.currentTarget, async () => {
      try { await updateDocument(id, { name: val(m, 'deName'), kind: val(m, 'deKind'), comment: val(m, 'deCom') }); closeModal(1); toast('Document mis à jour', 'ok'); }
      catch (err) { formError(m, err.message); markInvalid(m, ['deName']); }
    })
  });
}
