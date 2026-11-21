/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — modules/clients-images.js
   Images des clients (photo ou logo), comme les images fournisseurs
   d'Ondea Stock Intelligence :
     • « Images clients » (page Clients) :
         – importer plusieurs images d'un coup : chaque fichier est
           associé automatiquement à son client par le NOM du fichier
           (ex. « CLI-000001-hotel-le-belvedere.jpg » : nom du client
           ou n° client) — voir ressources/images/images-clients/ ;
         – télécharger toutes les images en un seul fichier ZIP ;
     • fiche client : bouton « Télécharger l'image ».
   Les images sont redimensionnées (1024 px max) et stockées dans
   IndexedDB : elles sont incluses dans la sauvegarde JSON.
   À charger APRÈS app.js.
   ██████████████████████████████████████████████████████████████ */
"use strict";

(function () {
  if (typeof VIEWS === 'undefined') return;

  /* « Hôtel Le Belvédère » → « hotel-le-belvedere » (même règle que les noms de fichiers fournis) */
  const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'et').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const ext = type => ({ 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif' }[type] || 'jpg');
  const fileNameOf = (c, type) => `${c.number}-${slug(clientName(c))}.${ext(type)}`;

  /* Client correspondant à un nom de fichier : nom complet d'abord, sinon n° client */
  function matchClient(fileName) {
    const base = slug(fileName.replace(/\.[a-z0-9]+$/i, ''));
    const byName = S.clients.filter(c => { const n = slug(clientName(c)); return n && (base === n || base.endsWith('-' + n)); });
    if (byName.length === 1) return byName[0];
    const num = (fileName.match(/CLI-\d{6}/i) || [])[0];
    return num ? S.clients.find(c => c.number.toUpperCase() === num.toUpperCase()) || null : null;
  }

  /* Enregistre l'image d'un client ; l'ancienne est supprimée si plus rien ne l'utilise */
  async function setClientImages(pairs) {
    requireRight('client.edit', 'modifier l\'image d\'un client');
    const media = [], clients = [], old = [];
    for (const { client, file } of pairs) {
      const blob = await resizeImage(file, 1024);
      const mid = uid('media');
      media.push({ id: mid, blob, type: blob.type || file.type, name: fileNameOf(client, blob.type || file.type), size: blob.size, at: nowStamp(), demo: false });
      if (client.photoId) old.push(client.photoId);
      clients.push({ ...clone(client), photoId: mid, updatedAt: nowStamp() });
    }
    const stillUsed = new Set([...S.clients.filter(c => !clients.some(x => x.id === c.id)).map(c => c.photoId), SETTINGS.logoId].filter(Boolean));
    await commit({ put: { media, clients, journal: [journalEntry('client', `a importé ${clients.length} image(s) client`, {})] }, del: { media: old.filter(id => !stillUsed.has(id)) } }, { what: 'client' });
  }

  /* ---------- ZIP sans compression (aucune bibliothèque) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function makeZip(files) {      /* files : [{ name, data: Uint8Array }] */
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(f => {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const local = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dosTime, 2], [12, dosDate, 2], [14, crc, 4], [18, size, 4], [22, size, 4], [26, name.length, 2], [28, 0, 2]].forEach(([o, v, n]) => n === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true));
      const cen = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dosTime, 2], [14, dosDate, 2], [16, crc, 4], [20, size, 4], [24, size, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]].forEach(([o, v, n]) => n === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true));
      parts.push(local, name, f.data); central.push(cen, name);
      offset += 30 + name.length + size;
    });
    const cenSize = central.reduce((n, p) => n + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cenSize, 4], [16, offset, 4], [20, 0, 2]].forEach(([o, v, n]) => n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true));
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }
  async function downloadAllImages() {
    const withImg = S.clients.filter(c => c.photoId);
    if (!withImg.length) throw new Error('Aucun client n\'a encore d\'image.');
    const files = [];
    for (const c of withImg) {
      const m = await IDB.getMedia(c.photoId); if (!m?.blob) continue;
      files.push({ name: fileNameOf(c, m.blob.type), data: new Uint8Array(await m.blob.arrayBuffer()) });
    }
    downloadBlob(makeZip(files), `ondea-crm-images-clients-${todayISO()}.zip`);
    toast(`${files.length} image(s) client téléchargée(s) (ZIP)`, 'ok');
  }
  async function downloadClientImage(c) {
    const m = await IDB.getMedia(c.photoId);
    if (!m?.blob) throw new Error('Image introuvable dans la base locale.');
    downloadBlob(m.blob, fileNameOf(c, m.blob.type));
  }

  /* ---------- Fenêtre « Images clients » ---------- */
  function imagesDialog() {
    let pairs = [];
    const n = S.clients.filter(c => c.photoId).length;
    openModal({
      title: 'Images clients', wide: true,
      body: `<p style="line-height:1.6">${n} client(s) sur ${S.clients.length} ont une photo ou un logo. Les images s'affichent dans les listes, les cartes et la fiche client (loupe au survol).</p>
        <fieldset class="fs" style="margin-top:14px"><legend>Importer plusieurs images</legend>
          <p class="small-p soft">Chaque fichier est associé à son client grâce à son nom : nom du client (« hotel-le-belvedere.jpg ») ou n° client (« CLI-000001-….jpg »). Les images fournies dans <b>ressources/images/images-clients/</b> sont déjà nommées ainsi.</p>
          ${can('client.edit') ? `<label class="btn" style="cursor:pointer">${svg('up')} Choisir les images…<input type="file" id="ciFiles" accept="image/*" multiple class="sr-only"></label>` : '<p class="muted">Votre profil ne permet pas de modifier les clients.</p>'}
          <div id="ciPreview" aria-live="polite" style="margin-top:12px"></div>
        </fieldset>
        <fieldset class="fs"><legend>Télécharger</legend>
          <p class="small-p soft">Toutes les images des clients dans un fichier ZIP, nommées « n° client-nom.jpg ».</p>
          <button type="button" class="btn" id="ciZip" ${n ? '' : 'disabled'}>${svg('down')} Télécharger toutes les images (${n})</button>
        </fieldset>`,
      footer: `<button type="button" class="btn ghost" data-close>Fermer</button><button type="button" class="btn gold" id="ciSave" disabled>${svg('check')} Associer les images</button>`,
      onOpen: m => {
        $('#ciZip', m).onclick = e => guard(e.currentTarget, downloadAllImages);
        const inp = $('#ciFiles', m); if (!inp) return;
        inp.onchange = () => {
          const files = [...inp.files].filter(f => /^image\//.test(f.type)); inp.value = '';
          pairs = files.map(file => ({ file, client: matchClient(file.name) }));
          const ok = pairs.filter(p => p.client), ko = pairs.filter(p => !p.client);
          $('#ciPreview', m).innerHTML = `<p class="notice-sm"><b>${ok.length}</b> image(s) reconnue(s)${ko.length ? `, <b class="dng-t">${ko.length}</b> sans client correspondant (ignorée(s))` : ''}.</p>
            <div style="max-height:260px;overflow:auto">${pairs.map(p => `<div class="list-row static"><span class="mono small-p" style="margin:0">${esc(p.file.name)}</span>${p.client ? `<span class="chip ok xs">${svg('check')}${esc(clientName(p.client))}${p.client.photoId ? ' · remplace' : ''}</span>` : '<span class="chip dng xs">aucun client</span>'}</div>`).join('')}</div>`;
          pairs = ok;
          $('#ciSave', m).disabled = !ok.length;
        };
        $('#ciSave', m).onclick = e => guard(e.currentTarget, async () => {
          await setClientImages(pairs); closeModal(1);
          toast(`${pairs.length} image(s) associée(s) aux clients`, 'ok');
        });
      }
    });
  }

  /* Page Clients : bouton « Images clients » */
  const _clients = VIEWS.clients;
  VIEWS.clients = function (el) {
    const r = _clients.apply(this, arguments);
    const actions = $('.page-head .row', el);
    if (actions) { actions.insertAdjacentHTML('afterbegin', `<button type="button" class="btn" id="cImages">${svg('image')} Images clients</button>`); $('#cImages', el).onclick = imagesDialog; }
    return r;
  };
  /* Fiche client : « Télécharger l'image » */
  const _detail = VIEWS.clientDetail;
  VIEWS.clientDetail = function (el, params) {
    const r = _detail.apply(this, arguments);
    const c = clientById(params.id);
    const actions = $('.page-head .row', el);
    if (c?.photoId && actions) { actions.insertAdjacentHTML('afterbegin', `<button type="button" class="btn" id="fdImg">${svg('down')} Télécharger l'image</button>`); $('#fdImg', el).onclick = e => guard(e.currentTarget, () => downloadClientImage(c)); }
    return r;
  };
})();
