/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — db.js
   Accès à IndexedDB (base locale du navigateur).

   Magasins (object stores) et index :
     clients       → fiches clients      (number, email, status, categoryId, city, createdAt)
     contacts      → contacts des clients (clientId, email)
     achats        → historique des achats (clientId, number, date)
     devis         → devis               (clientId, number, status, date)
     factures      → factures            (clientId, number, status, dueDate)
     interactions  → timeline CRM        (clientId, date, type)
     notes         → notes internes      (clientId, priority)
     fidelite      → mouvements de points (clientId, date)
     documents     → métadonnées des documents (clientId, kind) — le fichier
                     lui-même est un Blob du magasin « media »
     categories    → catégories de clients personnalisables
     journal       → activité récente (créations, modifications…)
     media         → fichiers binaires (photos, logos, documents)
     kv            → réglages, opérateurs, compteurs de numérotation

   Versionnement et migrations : chaque version ajoute ce qui manque,
   sans jamais effacer les données existantes (voir MIGRATIONS).

   Toutes les écritures passent par IDB.tx() : une seule transaction pour
   plusieurs magasins. Si une écriture échoue, AUCUNE n'est appliquée
   (atomicité garantie par IndexedDB).

   Si IndexedDB est indisponible (navigation privée stricte, iframe…),
   un stockage en mémoire prend le relais et un bandeau prévient l'utilisateur.
   ██████████████████████████████████████████████████████████████ */
"use strict";

const DB_NAME = 'OndeaCRMDB';
const DB_VERSION = 2;
const STORES = ['clients', 'contacts', 'achats', 'devis', 'factures', 'interactions', 'notes', 'fidelite', 'documents', 'categories', 'journal', 'media', 'kv'];

/* Index créés à la version 2 (accélèrent les recherches ciblées dans la base) */
const STORE_INDEXES = {
  clients: ['number', 'email', 'status', 'categoryId', 'city', 'createdAt'],
  contacts: ['clientId', 'email'],
  achats: ['clientId', 'number', 'date'],
  devis: ['clientId', 'number', 'status', 'date'],
  factures: ['clientId', 'number', 'status', 'dueDate'],
  interactions: ['clientId', 'date', 'type'],
  notes: ['clientId', 'priority'],
  fidelite: ['clientId', 'date'],
  documents: ['clientId', 'kind'],
  journal: ['at']
};
/* Étapes de migration : MIGRATIONS[n] amène la base de la version n-1 à n */
const MIGRATIONS = {
  /* v1 : création des magasins */
  1: (db) => {
    STORES.forEach(name => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === 'kv' ? 'key' : 'id' }); });
  },
  /* v2 : ajout des index de recherche */
  2: (db, tx) => {
    Object.entries(STORE_INDEXES).forEach(([store, keys]) => {
      const os = tx.objectStore(store);
      keys.forEach(k => { if (!os.indexNames.contains(k)) os.createIndex(k, k, { unique: false }); });
    });
  }
};

const IDB = {
  db: null,
  memory: null,      // repli en mémoire si IndexedDB n'est pas disponible
  get persistent() { return !!this.db; },

  /* Ouverture (création et migrations au premier lancement ou après mise à jour) */
  open() {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { this._fallback(e); return resolve(false); }
      const timer = setTimeout(() => { this._fallback(new Error('délai dépassé')); resolve(false); }, 5000);
      req.onupgradeneeded = e => {
        const d = e.target.result, tx = e.target.transaction;
        for (let v = (e.oldVersion || 0) + 1; v <= DB_VERSION; v++) { if (MIGRATIONS[v]) MIGRATIONS[v](d, tx); }
      };
      req.onsuccess = e => {
        clearTimeout(timer);
        this.db = e.target.result;
        /* Une autre fenêtre met à jour la base : on ferme proprement */
        this.db.onversionchange = () => { this.db.close(); toast('La base a été mise à jour dans un autre onglet. Rechargez la page.', 'warn', 8000); };
        resolve(true);
      };
      req.onerror = e => { clearTimeout(timer); this._fallback(e.target.error); resolve(false); };
      req.onblocked = () => { toast('Fermez les autres onglets d\'Ondea CRM puis rechargez.', 'warn', 8000); };
    });
  },
  _fallback(err) {
    console.warn('[Ondea CRM] IndexedDB indisponible, stockage en mémoire :', err);
    this.db = null;
    this.memory = {}; STORES.forEach(s => this.memory[s] = new Map());
  },

  /* Lecture de tout un magasin */
  getAll(store) {
    if (!this.db) return Promise.resolve([...(this.memory[store] || new Map()).values()].map(clone));
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const rq = tx.objectStore(store).getAll();
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => reject(rq.error);
    });
  },
  get(store, key) {
    if (!this.db) return Promise.resolve(clone(this.memory[store].get(key)) || null);
    return new Promise((resolve) => {
      const rq = this.db.transaction(store, 'readonly').objectStore(store).get(key);
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror = () => resolve(null);
    });
  },
  /* Lecture ciblée par index (ex. tous les documents d'un client) */
  byIndex(store, index, value) {
    if (!this.db) return Promise.resolve([...this.memory[store].values()].filter(o => o[index] === value).map(clone));
    return new Promise((resolve, reject) => {
      const os = this.db.transaction(store, 'readonly').objectStore(store);
      if (!os.indexNames.contains(index)) { const rq = os.getAll(); rq.onsuccess = () => resolve((rq.result || []).filter(o => o[index] === value)); rq.onerror = () => reject(rq.error); return; }
      const rq = os.index(index).getAll(IDBKeyRange.only(value));
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => reject(rq.error);
    });
  },

  /* Transaction d'écriture multi-magasins.
     fn reçoit un objet { put(store, obj), del(store, key), clear(store) }.
     La promesse est résolue quand TOUT est écrit, rejetée sinon (rien n'est écrit). */
  tx(storeNames, fn) {
    storeNames = [...new Set(storeNames)];
    if (!this.db) {
      /* Mode mémoire : on prépare les changements puis on les applique d'un bloc */
      const ops = [];
      const api = { put: (s, o) => ops.push(['put', s, clone(o)]), del: (s, k) => ops.push(['del', s, k]), clear: s => ops.push(['clear', s]) };
      try { fn(api); } catch (e) { return Promise.reject(e); }
      ops.forEach(([op, s, v]) => {
        const m = this.memory[s];
        if (op === 'put') m.set(v[s === 'kv' ? 'key' : 'id'], v); else if (op === 'del') m.delete(v); else m.clear();
      });
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = this.db.transaction(storeNames, 'readwrite'); }
      catch (e) { return reject(e); }
      const api = {
        put: (s, o) => tx.objectStore(s).put(o),
        del: (s, k) => tx.objectStore(s).delete(k),
        clear: s => tx.objectStore(s).clear()
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Erreur IndexedDB'));
      tx.onabort = () => reject(tx.error || new Error('Transaction annulée (espace disque insuffisant ?)'));
      try { fn(api); } catch (e) { try { tx.abort(); } catch (_) { } reject(e); }
    });
  },

  /* ---- Médias (photos, logos, documents) ---- */
  async putMedia(blob, name = '', meta = {}) {
    const id = meta.id || uid('media');
    await this.tx(['media'], t => t.put('media', { id, blob, type: blob.type, name, size: blob.size, at: nowStamp(), demo: !!meta.demo }));
    return id;
  },
  getMedia(id) { return id ? this.get('media', id) : Promise.resolve(null); },

  /* Estimation de l'espace utilisé */
  async estimate() {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { }
    return null;
  },
  /* Demande de stockage persistant (évite l'effacement automatique par le navigateur) */
  async persist() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { }
    return false;
  }
};

/* Copie profonde simple (les objets métiers sont du JSON pur ; les Blob sont conservés) */
function clone(o) {
  if (o == null) return o;
  if (typeof structuredClone === 'function') { try { return structuredClone(o); } catch (e) { } }
  return JSON.parse(JSON.stringify(o));
}

/* ---------- Cache des URL d'images ----------
   Les fichiers sont stockés en Blob dans IndexedDB ; on crée une URL temporaire
   à la demande, UNIQUEMENT pour les vignettes affichées (pas de chargement massif). */
const MEDIA_URLS = new Map();
async function mediaURL(id) {
  if (!id) return null;
  if (MEDIA_URLS.has(id)) return MEDIA_URLS.get(id);
  const m = await IDB.getMedia(id);
  if (!m || !m.blob) return null;
  const u = URL.createObjectURL(m.blob);
  MEDIA_URLS.set(id, u);
  /* On limite le cache à 300 fichiers pour préserver la mémoire */
  if (MEDIA_URLS.size > 300) { const [k, v] = MEDIA_URLS.entries().next().value; URL.revokeObjectURL(v); MEDIA_URLS.delete(k); }
  return u;
}
function forgetMediaURL(id) { if (MEDIA_URLS.has(id)) { URL.revokeObjectURL(MEDIA_URLS.get(id)); MEDIA_URLS.delete(id); } }

/* Remplit toutes les <img data-media="…"> d'une zone (vignettes visibles seulement) */
async function hydrateMedia(root = document) {
  const imgs = $$('img[data-media]', root);
  for (const img of imgs) {
    const id = img.dataset.media;
    const u = await mediaURL(id);
    if (u) { img.src = u; img.removeAttribute('data-media'); }
    else { img.closest('.av')?.classList.add('noimg'); }
  }
}
