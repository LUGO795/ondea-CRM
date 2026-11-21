/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — demo.js
   Jeu de données de démonstration réaliste (fictif) :
     • 24 clients (particuliers, professionnels, revendeurs,
       collectivités) sur 18 mois, avec logos, statuts variés ;
     • contacts, achats, devis, factures (payées, partielles, en
       retard…), interactions et relances planifiées, notes internes,
       points de fidélité à tous les niveaux, documents PDF ;
     • 2 commerciaux fictifs pour tester les filtres par commercial.
   Tout est marqué « demo: true » : « Supprimer la démo » retire ces
   éléments SANS toucher aux données réellement créées par l'utilisateur.
   « Restaurer la démo » recharge l'ensemble à tout moment.
   Génération déterministe (même jeu à chaque chargement, dates à jour).
   ██████████████████████████████████████████████████████████████ */
"use strict";

const DEMO_KEY = 'ocrm_demo_removed';   // localStorage : la démo a été retirée sur ce poste
const demoPresent = () => S.clients.some(c => c.demo) || S.achats.some(a => a.demo) || S.categories.some(c => c.demo);

/* Générateur pseudo-aléatoire déterministe */
function seededRandom(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* Catalogue fictif : studio web et communication */
const DEMO_PRODUCTS = [
  ['Création de site vitrine (5 pages)', 1890, 20], ['Boutique en ligne e-commerce', 4200, 20], ['Maintenance et mises à jour (mois)', 89, 20],
  ['Hébergement et nom de domaine (an)', 180, 20], ['Logo et charte graphique', 650, 20], ['Formation WordPress (1 journée)', 490, 20],
  ['Template premium Ondea', 79, 20], ['Audit SEO complet', 720, 20], ['Pack réseaux sociaux (mois)', 340, 20],
  ['Shooting photo produits (demi-journée)', 450, 20], ['Rédaction de contenu (page)', 120, 20], ['Cartes de visite (lot de 500)', 65, 20],
  ['Guide « Réussir son site Internet » (livre)', 29.9, 5.5]
];
/* [civilité, prénom, nom, entreprise, fonction, ville, CP, statut, catégorie, source, mois depuis la création, domaine e-mail] */
const DEMO_CLIENTS = [
  ['Mme', 'Camille', 'Rossi', 'Boulangerie Rossi & Fils', 'Gérante', 'Draguignan', '83300', 'vip', 1, 'Bouche-à-oreille', 17, 'boulangerie-rossi'],
  ['M', 'Julien', 'Marchetti', 'Garage Marchetti Auto', 'Directeur', 'Toulon', '83000', 'actif', 1, 'Site Internet', 15, 'garage-marchetti'],
  ['Mme', 'Sarah', 'Benali', 'Cabinet Benali Avocats', 'Avocate associée', 'Marseille', '13006', 'vip', 1, 'Partenaire', 16, 'benali-avocats'],
  ['M', 'Thomas', 'Girard', 'Domaine des Trois Chênes', 'Viticulteur', 'Lorgues', '83510', 'actif', 1, 'Salon / événement', 13, 'trois-chenes'],
  ['Mme', 'Léa', 'Fontaine', 'Fleurs & Sens', 'Fleuriste', 'Fréjus', '83600', 'relance', 1, 'Réseaux sociaux', 11, 'fleurs-et-sens'],
  ['M', 'Nicolas', 'Perrin', 'Perrin Rénovation', 'Artisan', 'Brignoles', '83170', 'actif', 1, 'Bouche-à-oreille', 14, 'perrin-renovation'],
  ['Mme', 'Inès', 'Moreau', 'Studio Yoga Lumière', 'Fondatrice', 'Saint-Raphaël', '83700', 'actif', 1, 'Site Internet', 9, 'yoga-lumiere'],
  ['M', 'Antoine', 'Lefèvre', 'Hôtel Le Belvédère', 'Directeur', 'Hyères', '83400', 'vip', 1, 'Prospection', 18, 'hotel-belvedere'],
  ['Mme', 'Claire', 'Dubois', 'Agence ImmoVar', 'Responsable marketing', 'Toulon', '83000', 'inactif', 1, 'Publicité', 17, 'immovar'],
  ['M', 'Hugo', 'Blanc', 'Bureau Pro Distribution', 'Responsable achats', 'Aix-en-Provence', '13100', 'actif', 2, 'Partenaire', 12, 'bureaupro-distribution'],
  ['Mme', 'Manon', 'Garnier', 'Digital Sud Revendeur', 'Gérante', 'Nice', '06000', 'actif', 2, 'Salon / événement', 10, 'digitalsud'],
  ['M', 'Lucas', 'Chevalier', 'Imprimerie du Var', 'Directeur commercial', 'La Seyne-sur-Mer', '83500', 'relance', 2, 'Prospection', 8, 'imprimerie-du-var'],
  ['Mme', 'Nathalie', 'Roux', 'Mairie de Callas', 'Chargée de communication', 'Callas', '83830', 'actif', 3, 'Prospection', 14, 'mairie-callas'],
  ['M', 'Olivier', 'Faure', 'Association Les Amis du Patrimoine', 'Président', 'Draguignan', '83300', 'prospect', 3, 'Bouche-à-oreille', 2, 'amis-patrimoine'],
  ['Mme', 'Isabelle', 'Lambert', 'École Montessori Les Lavandes', 'Directrice', 'Le Muy', '83490', 'actif', 3, 'Réseaux sociaux', 7, 'montessori-lavandes'],
  ['Mme', 'Emma', 'Martin', '', 'Photographe indépendante', 'Draguignan', '83300', 'actif', 0, 'Réseaux sociaux', 12, 'gmail-demo'],
  ['M', 'Paul', 'Bernard', '', 'Retraité', 'Trans-en-Provence', '83720', 'inactif', 0, 'Bouche-à-oreille', 16, 'orange-demo'],
  ['Mme', 'Chloé', 'Petit', '', 'Coach sportive', 'Fréjus', '83600', 'vip', 0, 'Site Internet', 13, 'gmail-demo'],
  ['M', 'Maxime', 'Durand', '', 'Auto-entrepreneur', 'Toulon', '83000', 'prospect', 0, 'Publicité', 1, 'free-demo'],
  ['Mme', 'Julie', 'Leroy', '', 'Artiste peintre', 'Cotignac', '83570', 'relance', 0, 'Salon / événement', 6, 'gmail-demo'],
  ['M', 'Alexandre', 'Morel', '', 'Consultant', 'Cannes', '06400', 'actif', 0, 'Site Internet', 5, 'outlook-demo'],
  ['Mme', 'Sophie', 'Fournier', '', 'Kinésithérapeute', 'Draguignan', '83300', 'prospect', 0, 'Bouche-à-oreille', 0, 'gmail-demo'],
  ['M', 'Romain', 'Mercier', '', 'Étudiant', 'Nice', '06100', 'archive', 0, 'Réseaux sociaux', 15, 'free-demo'],
  ['Mme', 'Laura', 'Bonnet', 'Bonnet Créations', 'Créatrice de bijoux', 'Grasse', '06130', 'prospect', 1, 'Site Internet', 1, 'bonnet-creations']
];

/* Logo fictif (SVG) : initiales dorées sur dégradé — image réelle stockée dans IndexedDB */
function demoLogo(name, hue) {
  const ini = initialsOf(name).replace(/[<&>]/g, '');
  return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,22%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,12%)"/></linearGradient></defs><rect width="200" height="200" rx="36" fill="url(#g)"/><circle cx="100" cy="100" r="70" fill="none" stroke="#d8b35e" stroke-width="3" opacity=".7"/><text x="100" y="122" font-family="Georgia,serif" font-size="62" font-weight="700" text-anchor="middle" fill="#f4d999">${ini}</text></svg>`], { type: 'image/svg+xml' });
}
/* Petit PDF valide d'une page (documents de démonstration) */
function demoPdf(title, lines) {
  const latin = s => String(s).replace(/€/g, 'EUR').replace(/[’‘]/g, "'").replace(/[«»]/g, '"').replace(/[^\x20-\xFF]/g, '').replace(/[\\()]/g, m => '\\' + m);
  const body = ['BT /F1 20 Tf 60 770 Td (' + latin(title) + ') Tj ET', ...lines.map((l, i) => `BT /F1 11 Tf 60 ${730 - i * 18} Td (${latin(l)}) Tj ET`), 'BT /F1 9 Tf 60 60 Td (Document fictif - donnees de demonstration Ondea CRM) Tj ET'].join('\n');
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', `<< /Length ${body.length} >>\nstream\n${body}\nendstream`];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return new Blob([bytes], { type: 'application/pdf' });
}

async function loadDemoData() {
  requireRight('demo', 'charger les données de démonstration');
  if (demoPresent()) throw new Error('Les données de démonstration sont déjà chargées.');
  const rnd = seededRandom(20261002);
  const R = (a, b) => a + rnd() * (b - a), RI = (a, b) => Math.floor(R(a, b + 1)), pick = arr => arr[Math.floor(rnd() * arr.length)];
  const today = todayISO();
  const at = (day, h = 10, m = 0) => { const d = new Date(day + 'T12:00:00'); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const dayBetween = (a, b) => (a >= b ? b : addDays(a, RI(0, Math.max(0, daysBetween(a, b)))));
  const put = { clients: [], contacts: [], achats: [], devis: [], factures: [], interactions: [], notes: [], fidelite: [], documents: [], categories: [], journal: [], media: [] };
  let counters = clone(COUNTERS);
  const num = (kind, date) => { const r = nextNumber(counters, kind, Number(String(date).slice(0, 4))); counters = r.counters; return r.number; };

  /* ---- Commerciaux fictifs (désactivables, supprimés avec la démo) ---- */
  const ops = clone(OPERATORS);
  const demoOps = [{ id: uid('op'), name: 'Sophie Laurent (démo)', role: 'commercial', pin: '', active: true, demo: true, createdAt: nowStamp() }, { id: uid('op'), name: 'Marc Petit (démo)', role: 'manager', pin: '', active: true, demo: true, createdAt: nowStamp() }];
  ops.push(...demoOps);
  const reps = [SESSION_OP?.id, ...demoOps.map(o => o.id)].filter(Boolean);
  const repName = id => ops.find(o => o.id === id)?.name || '';

  /* ---- Catégories (réutilisées si une catégorie du même nom existe) ---- */
  const CAT = [['Particuliers', 'Clients particuliers', 1], ['Professionnels', 'TPE, PME, commerçants et artisans', 2], ['Revendeurs', 'Partenaires qui revendent nos produits', 3], ['Collectivités', 'Mairies, écoles et associations', 4]].map(([name, description, color]) => {
    const ex = S.categories.find(c => norm(c.name) === norm(name)); if (ex) return ex.id;
    const c = { id: uid('cat'), name, description, color, createdAt: at(addDays(today, -560)), demo: true }; put.categories.push(c); return c.id;
  });

  /* ---- Clients ---- */
  const clients = DEMO_CLIENTS.map(([civ, first, last, company, job, city, zip, status, cat, source, months, dom], i) => {
    const created = addDays(today, -Math.round(months * 30.4) - RI(0, 12));
    const mailDom = dom.endsWith('-demo') ? dom.replace('-demo', '') + '-demo.fr' : dom + '.exemple.fr';
    const c = {
      id: uid('cli'), number: '', civility: civ, firstName: first, lastName: last, company, jobTitle: job,
      phone: `0${pick(['4 94', '4 98', '6 1' + RI(0, 9), '7 6' + RI(0, 9)])} ${pad2(RI(10, 99))} ${pad2(RI(10, 99))} ${pad2(RI(10, 99))}`,
      phone2: i % 4 === 0 ? `06 ${pad2(RI(10, 99))} ${pad2(RI(10, 99))} ${pad2(RI(10, 99))} ${pad2(RI(10, 99))}` : '',
      email: `${norm(first).replace(/[^a-z]/g, '')}.${norm(last).replace(/[^a-z]/g, '')}@${mailDom}`,
      address: `${RI(2, 140)} ${pick(['avenue de la République', 'rue des Oliviers', 'boulevard Clemenceau', 'chemin des Vignes', 'place du Marché', 'rue Jean Jaurès', 'allée des Pins'])}`,
      address2: i % 5 === 1 ? pick(['Bâtiment B', 'ZA Les Bréguières', 'Le Clos des Lavandes']) : '', zip, city, country: 'France',
      website: company ? 'www.' + dom.replace('-demo', '') + '.fr' : '', birthDate: !company && i % 2 === 0 ? `${RI(1958, 2001)}-${pad2(RI(1, 12))}-${pad2(RI(1, 28))}` : '',
      status, categoryId: CAT[cat], source, salesRepId: reps[i % reps.length], photoId: null, tags: '',
      createdAt: at(created, RI(8, 18), RI(0, 59)), updatedAt: at(created, 18), demo: true, _created: created
    };
    if (status === 'archive') c.prevStatus = 'inactif';
    if (company && i % 3 !== 2) {
      const mid = uid('media');
      put.media.push({ id: mid, blob: demoLogo(company, (i * 47) % 360), type: 'image/svg+xml', name: 'logo-' + dom + '.svg', size: 600, at: nowStamp(), demo: true });
      c.photoId = mid;
    }
    return c;
  });
  clients.slice().sort((a, b) => a._created.localeCompare(b._created)).forEach(c => { const r = nextNumber(counters, 'client'); counters = r.counters; c.number = r.number; });

  /* ---- Contacts (1 à 3 par entreprise) ---- */
  const FIRST = ['Martine', 'Jean', 'Pierre', 'Lucie', 'Karim', 'Élodie', 'François', 'Aurélie', 'Mehdi', 'Sandrine', 'Vincent', 'Céline'];
  const LAST = ['Dupont', 'Garcia', 'Roche', 'Michel', 'André', 'Simon', 'Laurent', 'Lopez', 'Vidal', 'Guerin'];
  const JOBS = ['Responsable achats', 'Comptabilité', 'Assistante de direction', 'Responsable communication', 'Directeur technique', 'Secrétariat'];
  clients.forEach(c => {
    if (!c.company) return;
    const dom = c.email.split('@')[1];
    const list = [{ civility: c.civility, firstName: c.firstName, lastName: c.lastName, jobTitle: c.jobTitle, phone: c.phone, email: c.email }];
    const extra = RI(0, 2);
    for (let k = 0; k < extra; k++) { const f = pick(FIRST), l = pick(LAST); list.push({ civility: /e$|ie$|ine$/.test(f) ? 'Mme' : 'M', firstName: f, lastName: l, jobTitle: pick(JOBS), phone: `04 ${pad2(RI(10, 99))} ${pad2(RI(10, 99))} ${pad2(RI(10, 99))} ${pad2(RI(10, 99))}`, email: `${norm(f).replace(/[^a-z]/g, '')}.${norm(l)}@${dom}` }); }
    list.forEach((x, k) => put.contacts.push({ id: uid('ctc'), clientId: c.id, ...x, notes: k === 1 ? 'À mettre en copie des factures.' : '', isPrimary: k === 0, history: [{ at: c.createdAt, by: repName(c.salesRepId), text: 'Création du contact' }], createdAt: c.createdAt, updatedAt: c.createdAt, demo: true }));
  });

  /* ---- Achats ---- */
  const prof = c => !!c.company;
  const lineFor = c => { const p = prof(c) ? pick(DEMO_PRODUCTS.slice(0, 12)) : pick([DEMO_PRODUCTS[6], DEMO_PRODUCTS[5], DEMO_PRODUCTS[12], DEMO_PRODUCTS[10], DEMO_PRODUCTS[4], DEMO_PRODUCTS[0]]); const qty = /mois|page|Template|livre/.test(p[0]) ? RI(1, 4) : 1; return { id: uid('ln'), label: p[0], qty, unitPrice: p[1], discount: rnd() < .15 ? pick([5, 10, 15]) : 0, vatRate: p[2] }; };
  const autoIt = (c, type, title, ref, date, desc = '') => ({ id: uid('itr'), clientId: c.id, contactId: null, type, date, time: `${pad2(RI(8, 18))}:${pick(['00', '15', '30', '45'])}`, title, description: desc, userId: c.salesRepId, userName: repName(c.salesRepId), done: true, auto: true, ref, createdAt: at(date), demo: true });
  const NB = { vip: [6, 9], actif: [3, 6], inactif: [1, 3], relance: [2, 3], archive: [1, 2], prospect: [0, 0] };
  clients.forEach((c, ci) => {
    const [a, b] = NB[c.status];
    const n = RI(a, b);
    const end = c.status === 'inactif' || c.status === 'archive' ? addDays(today, -RI(200, 320)) : today;
    for (let k = 0; k < n; k++) {
      const date = dayBetween(c._created > end ? addDays(end, -30) : c._created, end);
      const lines = [lineFor(c)]; if (rnd() < .4) lines.push(lineFor(c));
      const recent = daysBetween(date, today) < 20;
      const status = recent && rnd() < .45 ? 'attente' : (ci === 9 && k === 0 ? 'remboursee' : ci === 4 && k === 1 ? 'annulee' : 'payee');
      put.achats.push({ id: uid('ach'), number: '', clientId: c.id, date, lines, paymentMethod: pick(['Carte bancaire', 'Virement', 'Virement', 'Chèque', 'Espèces', 'PayPal']), status, sellerId: c.salesRepId, seller: repName(c.salesRepId), comment: rnd() < .2 ? pick(['Livraison souhaitée avant fin du mois.', 'Client très satisfait du précédent projet.', 'Paiement en deux fois accepté.', 'Remise fidélité appliquée.']) : '', invoiceId: null, fromInvoice: false, createdAt: at(date, 11), updatedAt: at(date, 11), demo: true });
    }
  });
  put.achats.sort((a, b) => a.date.localeCompare(b.date)).forEach(a => a.number = num('achats', a.date));

  /* ---- Factures liées aux achats (une sur deux) ---- */
  const byId = id => clients.find(c => c.id === id);
  const invoice = (c, date, lines, extra = {}) => ({ id: uid('fac'), number: '', clientId: c.id, date, dueDate: addDays(date, 30), lines: lines.map(l => ({ ...l, id: uid('ln') })), paymentMethod: '', comment: '', status: 'issued', payments: [], paidDate: '', quoteId: null, achatId: null, history: [{ at: at(date, 9), status: 'issued', by: repName(c.salesRepId) }], createdAt: at(date, 9), updatedAt: at(date, 9), demo: true, ...extra });
  put.achats.forEach((a, i) => {
    if (i % 2 === 1 || a.status === 'annulee') return;
    const c = byId(a.clientId); const f = invoice(c, a.date, a.lines, { achatId: a.id, comment: `Achat ${a.number}`, paymentMethod: a.paymentMethod });
    if (a.status === 'payee' || a.status === 'remboursee') { f.payments = [{ id: uid('pay'), date: a.date, amount: docTotals(f).ttc, method: a.paymentMethod, note: '' }]; f.status = 'paid'; f.paidDate = a.date; f.history.push({ at: at(a.date, 17), status: 'paid', by: repName(c.salesRepId) }); }
    a.invoiceId = f.id; put.factures.push(f);
  });

  /* ---- Devis (avec transformations en factures) ---- */
  const quoteFor = (c, date, status, lines) => ({ id: uid('dev'), number: '', clientId: c.id, date, validUntil: addDays(date, 30), lines, comment: rnd() < .3 ? 'Acompte de 30 % à la commande, solde à la livraison.' : '', sellerId: c.salesRepId, status, history: [{ at: at(date, 9), status: 'draft', by: repName(c.salesRepId) }], invoiceId: null, createdAt: at(date, 9), updatedAt: at(date, 9), demo: true });
  const QS = [ // [index client, jours depuis, statut]
    [0, 40, 'accepted'], [1, 75, 'accepted'], [2, 20, 'sent'], [3, 10, 'sent'], [4, 26, 'sent'], [5, 120, 'refused'], [6, 3, 'draft'], [7, 55, 'accepted'], [9, 33, 'accepted'], [10, 5, 'sent'],
    [11, 45, 'sent'], [12, 90, 'accepted'], [13, 8, 'sent'], [14, 64, 'refused'], [15, 15, 'accepted'], [17, 50, 'accepted'], [18, 2, 'draft'], [19, 70, 'expired'], [20, 130, 'refused'], [23, 6, 'sent'], [8, 240, 'expired'], [2, 100, 'accepted']
  ];
  QS.forEach(([ci, ago, status]) => {
    const c = clients[ci]; const date = addDays(today, -ago);
    const lines = [lineFor(c), lineFor(c)].filter((l, k, arr) => k === 0 || arr[0].label !== l.label);
    const q = quoteFor(c, date, status, lines);
    if (status !== 'draft') { q.history.push({ at: at(addDays(date, 1), 10), status: 'sent', by: repName(c.salesRepId) }); q.sentAt = at(addDays(date, 1), 10); }
    if (['accepted', 'refused', 'expired'].includes(status)) q.history.push({ at: at(addDays(date, RI(3, 12)), 15), status, by: repName(c.salesRepId) });
    put.devis.push(q);
  });
  put.devis.sort((a, b) => a.date.localeCompare(b.date)).forEach(q => q.number = num('devis', q.date));
  /* Devis acceptés → factures : payées, partiellement payées, en retard ou à échéance */
  let accIdx = 0;
  put.devis.filter(q => q.status === 'accepted').forEach(q => {
    const c = byId(q.clientId); const date = addDays(q.date, RI(4, 9));
    if (date > today) return;
    const f = invoice(c, date, q.lines, { quoteId: q.id, comment: `Selon devis ${q.number}`, paymentMethod: 'Virement' });
    const mode = accIdx++ % 4;   // 0 payée · 1 partielle · 2 émise (retard si échue) · 3 payée
    const t = docTotals(f).ttc;
    if (mode === 0 || mode === 3) {
      const pd = dayBetween(date, f.dueDate < today ? f.dueDate : today);
      f.payments = [{ id: uid('pay'), date: pd, amount: t, method: 'Virement', note: 'Virement reçu' }]; f.status = 'paid'; f.paidDate = pd; f.history.push({ at: at(pd, 16), status: 'paid', by: repName(c.salesRepId) });
      const a = { id: uid('ach'), number: '', clientId: c.id, date: pd, lines: f.lines.map(l => ({ ...l, id: uid('ln') })), paymentMethod: 'Virement', status: 'payee', sellerId: c.salesRepId, seller: repName(c.salesRepId), comment: `Règlement de la facture`, invoiceId: f.id, fromInvoice: true, createdAt: at(pd, 16), updatedAt: at(pd, 16), demo: true };
      a.number = num('achats', pd); f.achatId = a.id; put.achats.push(a);
    } else if (mode === 1) {
      const pd = dayBetween(date, today); const amt = round2(t * .3);
      f.payments = [{ id: uid('pay'), date: pd, amount: amt, method: 'Virement', note: 'Acompte de 30 %' }]; f.status = 'partial'; f.history.push({ at: at(pd, 16), status: 'partial', by: repName(c.salesRepId), note: 'Acompte' });
    }
    q.invoiceId = f.id; put.factures.push(f);
  });
  /* Factures autonomes : brouillon, annulée, en retard */
  put.factures.push(invoice(clients[1], addDays(today, -2), [lineFor(clients[1])], { status: 'draft', history: [{ at: at(addDays(today, -2)), status: 'draft', by: repName(clients[1].salesRepId) }] }));
  put.factures.push(invoice(clients[10], addDays(today, -95), [lineFor(clients[10])], { status: 'cancelled', comment: 'Erreur de destinataire — refacturée.' }));
  put.factures.push(invoice(clients[4], addDays(today, -58), [lineFor(clients[4]), lineFor(clients[4])], { paymentMethod: 'Chèque' }));
  put.factures.push(invoice(clients[11], addDays(today, -41), [lineFor(clients[11])], { paymentMethod: 'Virement' }));
  put.factures.sort((a, b) => a.date.localeCompare(b.date)).forEach(f => f.number = num('factures', f.date));

  /* ---- Interactions automatiques (documents) ---- */
  put.achats.forEach(a => { const c = byId(a.clientId); put.interactions.push(autoIt(c, 'achat', `Achat ${a.number} — ${fmtMoney(docTotals(a).ttc)} (${ACHAT_STATUS[a.status].label.toLowerCase()})`, { type: 'achat', id: a.id }, a.date, a.lines.map(l => `${fmtNum(l.qty)} × ${l.label}`).join('\n'))); });
  put.devis.forEach(q => { const c = byId(q.clientId); put.interactions.push(autoIt(c, 'devis', `Devis ${q.number} — ${fmtMoney(docTotals(q).ttc)} TTC`, { type: 'devis', id: q.id, event: 'create' }, q.date));
    if (q.status !== 'draft') put.interactions.push(autoIt(c, 'email', `Devis ${q.number} : envoyé`, { type: 'devis', id: q.id, event: 'sent' }, addDays(q.date, 1)));
    if (['accepted', 'refused'].includes(q.status)) put.interactions.push(autoIt(c, 'devis', `Devis ${q.number} : ${DEVIS_STATUS[q.status].label.toLowerCase()}`, { type: 'devis', id: q.id, event: q.status }, dayOf(q.history[q.history.length - 1].at))); });
  put.factures.forEach(f => { const c = byId(f.clientId); put.interactions.push(autoIt(c, 'facture', `Facture ${f.number} — ${fmtMoney(docTotals(f).ttc)} TTC`, { type: 'facture', id: f.id, event: 'create' }, f.date));
    f.payments.forEach(p => put.interactions.push(autoIt(c, 'facture', `Règlement de ${fmtMoney(p.amount)} — facture ${f.number}${f.status === 'paid' ? ' (soldée)' : ''}`, { type: 'facture', id: f.id, event: 'payment' }, p.date))); });

  /* ---- Interactions manuelles (appels, e-mails, rendez-vous…) ---- */
  const MANUAL = [
    ['appel', 'Point d\'avancement du projet', 'Le client valide la maquette de la page d\'accueil. Prochaine étape : contenus.'],
    ['email', 'Envoi des accès à l\'espace d\'administration', 'Identifiants envoyés par e-mail sécurisé.'],
    ['rdv', 'Rendez-vous de lancement', 'Présentation de l\'équipe, recueil des besoins, planning validé.'],
    ['message', 'Question sur la facturation', 'Souhaite recevoir les factures au format PDF par e-mail.'],
    ['appel', 'Appel de satisfaction', 'Très satisfait. Intéressé par le pack réseaux sociaux.'],
    ['rdv', 'Atelier de formation sur site', 'Formation de 2 personnes à la mise à jour des contenus.'],
    ['email', 'Proposition de renouvellement', 'Renouvellement de l\'hébergement proposé avec 10 % de remise.'],
    ['autre', 'Rencontre au salon Var Entreprendre', 'Échange sur un futur projet de boutique en ligne.']
  ];
  clients.forEach((c, i) => {
    if (c.status === 'prospect' && i % 2) return;
    const end = c.status === 'inactif' || c.status === 'archive' ? addDays(today, -RI(200, 300)) : addDays(today, -1);
    const n = c.status === 'vip' ? 5 : c.status === 'actif' ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const [type, title, desc] = MANUAL[(i + k * 3) % MANUAL.length];
      const date = dayBetween(c._created, end < c._created ? c._created : end);
      const ct = put.contacts.filter(x => x.clientId === c.id);
      put.interactions.push({ id: uid('itr'), clientId: c.id, contactId: ct.length ? pick(ct).id : null, type, date, time: `${pad2(RI(8, 18))}:${pick(['00', '15', '30', '45'])}`, title, description: desc, userId: c.salesRepId, userName: repName(c.salesRepId), done: true, auto: false, ref: null, createdAt: at(date, 12), demo: true });
    }
  });
  /* Relances et rendez-vous planifiés : en retard, aujourd'hui, à venir */
  [[4, -6, 'relance', 'Relancer pour le devis en attente', 'Le devis expire bientôt : proposer un échange téléphonique.'], [11, -3, 'relance', 'Relance paiement facture', 'Facture échue : appeler la comptabilité.'], [0, 0, 'rdv', 'Rendez-vous : bilan annuel', 'Bilan des résultats du site et propositions pour l\'année à venir.'],
   [19, 0, 'appel', 'Rappeler Julie Leroy', 'Souhaite un devis pour une galerie en ligne.'], [13, 4, 'rdv', 'Présentation du devis à l\'association', 'Réunion du bureau à 18 h.'], [2, 9, 'relance', 'Relance devis site vitrine', ''], [7, 15, 'rdv', 'Shooting photo des chambres', 'Prévoir l\'accès à toutes les chambres rénovées.']]
    .forEach(([ci, d, type, title, desc]) => { const c = clients[ci]; put.interactions.push({ id: uid('itr'), clientId: c.id, contactId: null, type, date: addDays(today, d), time: `${pad2(RI(9, 17))}:00`, title, description: desc, userId: c.salesRepId, userName: repName(c.salesRepId), done: false, auto: false, ref: null, createdAt: nowStamp(), demo: true }); });

  /* ---- Notes internes ---- */
  [[0, 'Préférences de contact', 'Joindre de préférence le matin avant 10 h (fournée terminée). Ne pas appeler le lundi.', 'normale', 'ouverte', true], [2, 'Client stratégique', 'Recommande régulièrement nos services à son réseau. Soigner le suivi.', 'importante', 'ouverte', true],
   [4, 'Retard de paiement récurrent', 'Deuxième facture payée en retard. Demander un acompte de 50 % sur les prochains projets.', 'urgente', 'ouverte', false], [8, 'Changement de responsable', 'Mme Dubois a quitté l\'agence : identifier le nouvel interlocuteur.', 'importante', 'en_cours', false],
   [11, 'Litige sur la livraison', 'Contestation d\'un délai : geste commercial de 10 % accordé. Dossier clos.', 'urgente', 'traitee', false], [17, 'Anniversaire', 'Cliente fidèle depuis l\'ouverture : penser à un petit cadeau pour ses 2 ans de collaboration.', 'faible', 'ouverte', false],
   [7, 'Budget 2027', 'Budget refonte prévu au printemps. Préparer une proposition en février.', 'normale', 'ouverte', false], [12, 'Marchés publics', 'Toute commande doit passer par un bon de commande signé du maire.', 'importante', 'ouverte', false],
   [15, 'Portfolio', 'Accepte que son site figure dans notre portfolio.', 'faible', 'traitee', false], [9, 'Conditions revendeur', 'Remise revendeur de 15 % sur les templates. Paiement à 45 jours.', 'normale', 'ouverte', false],
   [19, 'Hésitation sur le budget', 'Intéressée mais budget limité : proposer le template premium + personnalisation.', 'normale', 'en_cours', false], [3, 'Vendanges', 'Pas de rendez-vous possible de mi-septembre à mi-octobre.', 'importante', 'ouverte', false]]
    .forEach(([ci, title, content, priority, status, pinned], k) => { const c = clients[ci]; const d = dayBetween(c._created, addDays(today, -k)); put.notes.push({ id: uid('not'), clientId: c.id, date: d, title, content, priority, status, pinned, authorId: c.salesRepId, authorName: repName(c.salesRepId), createdAt: at(d, 14), updatedAt: at(d, 14), demo: true }); });

  /* ---- Fidélité : points des achats payés + bonus + récompenses ---- */
  put.achats.forEach(a => { const mv = loyaltyMoveForAchat(a); if (mv) { mv.userName = a.seller; mv.createdAt = at(a.date, 12); mv.demo = true; put.fidelite.push(mv); } });
  clients.filter(c => ['vip', 'actif'].includes(c.status)).forEach((c, k) => { if (k % 2 === 0) put.fidelite.push({ id: uid('fid'), clientId: c.id, date: addDays(c._created, 1), type: 'bonus', points: 100, label: 'Bonus de bienvenue', rewardId: null, ref: null, auto: false, userName: repName(c.salesRepId), createdAt: at(addDays(c._created, 1)), demo: true }); });
  const earned = id => sum(put.fidelite.filter(f => f.clientId === id && f.points > 0), f => f.points);
  [[0, 0], [2, 2], [7, 0], [17, 1]].forEach(([ci, ri]) => { const c = clients[ci]; const r = SETTINGS.loyalty.rewards[ri]; if (!r || earned(c.id) < r.cost) return; const d = addDays(today, -RI(10, 60)); put.fidelite.push({ id: uid('fid'), clientId: c.id, date: d, type: 'utilisation', points: -r.cost, label: r.name, rewardId: r.id, ref: null, auto: false, userName: repName(c.salesRepId), createdAt: at(d), demo: true }); });

  /* ---- Documents (PDF fictifs stockés dans IndexedDB) ---- */
  [[0, 'contrat', 'Contrat de maintenance 2026', ['Prestataire : ' + (SETTINGS.companyName || 'Votre entreprise'), 'Client : Boulangerie Rossi & Fils', 'Objet : maintenance et mises a jour mensuelles', 'Duree : 12 mois renouvelables', 'Montant : 89 EUR HT par mois']],
   [2, 'contrat', 'Contrat de prestation - site vitrine', ['Client : Cabinet Benali Avocats', 'Creation d\'un site vitrine de 5 pages', 'Delai de livraison : 6 semaines']],
   [7, 'justificatif', 'Extrait Kbis Hotel Le Belvedere', ['Extrait d\'immatriculation (fictif)', 'Hotel Le Belvedere - Hyeres']],
   [12, 'administratif', 'Bon de commande Mairie de Callas', ['Bon de commande n. 2026-118', 'Service communication - Mairie de Callas']],
   [9, 'justificatif', 'RIB Bureau Pro Distribution', ['Releve d\'identite bancaire (fictif)', 'IBAN : FR76 0000 0000 0000 0000 0000 000']],
   [3, 'devis', 'Devis signé - Domaine des Trois Chenes', ['Devis accepte et signe par le client', 'Bon pour accord']]]
    .forEach(([ci, kind, title, lines]) => {
      const c = clients[ci]; const blob = demoPdf(title, lines); const mid = uid('media'); const name = title.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') + '.pdf';
      put.media.push({ id: mid, blob, type: 'application/pdf', name, size: blob.size, at: nowStamp(), demo: true });
      const d = dayBetween(c._created, today);
      put.documents.push({ id: uid('doc'), clientId: c.id, name, kind, mediaId: mid, size: blob.size, type: 'application/pdf', date: d, comment: kind === 'contrat' ? 'Signé par les deux parties' : '', createdAt: at(d, 15), userName: repName(c.salesRepId), demo: true });
    });

  /* ---- Journal ---- */
  clients.forEach(c => put.journal.push({ id: uid('jr'), at: c.createdAt, kind: 'client', text: `a créé la fiche client <b>${esc(clientName(c))}</b> (${c.number})`, ref: { type: 'client', id: c.id }, operatorId: c.salesRepId, operatorName: repName(c.salesRepId), demo: true }));
  put.devis.slice(-6).forEach(q => put.journal.push({ id: uid('jr'), at: q.createdAt, kind: 'devis', text: `a créé le devis <b>${q.number}</b> pour ${esc(clientName(byId(q.clientId)))}`, ref: { type: 'devis', id: q.id }, operatorName: repName(byId(q.clientId).salesRepId), demo: true }));
  put.factures.slice(-6).forEach(f => put.journal.push({ id: uid('jr'), at: f.createdAt, kind: 'facture', text: `a créé la facture <b>${f.number}</b> pour ${esc(clientName(byId(f.clientId)))}`, ref: { type: 'facture', id: f.id }, operatorName: repName(byId(f.clientId).salesRepId), demo: true }));
  put.journal.push(journalEntry('system', 'a chargé les <b>données de démonstration</b>', {}, { demo: true }));

  clients.forEach(c => { delete c._created; put.clients.push(c); });
  await commit({ put, kv: { counters, operators: ops } }, { what: 'demo' });
  PREF.set(DEMO_KEY, '');
  return { clients: put.clients.length, achats: put.achats.length };
}

/* Suppression des données de démonstration (les données réelles sont conservées) */
function confirmRemoveDemo() {
  const n = { c: S.clients.filter(c => c.demo).length, a: S.achats.filter(a => a.demo).length, f: S.factures.filter(f => f.demo).length };
  confirmDialog(`Supprimer les données de démonstration ? ${n.c} clients, ${n.a} achats, ${n.f} factures ainsi que les devis, contacts, interactions, notes, points, documents et commerciaux fictifs seront effacés. Vos propres données, le logo et les réglages sont conservés.`,
    async () => { const r = await removeDemoData(); toast(`Démonstration supprimée${r.kept ? ` (${r.kept} élément(s) fictif(s) conservé(s) car utilisé(s) par vos données)` : ''}.`, 'ok', 6000); }, { yes: 'Supprimer la démonstration' });
}
async function removeDemoData() {
  requireRight('demo', 'supprimer les données de démonstration');
  const demoClients = new Set(S.clients.filter(c => c.demo).map(c => c.id));
  const del = {}; const put = { clients: [], contacts: [], categories: [] };
  ['contacts', 'achats', 'devis', 'factures', 'interactions', 'notes', 'fidelite', 'documents'].forEach(k => { del[k] = S[k].filter(x => x.demo || demoClients.has(x.clientId)).map(x => x.id); });
  del.clients = [...demoClients];
  del.journal = S.journal.filter(j => j.demo || (j.ref?.id && demoClients.has(j.ref.id))).map(j => j.id);
  let kept = 0;
  /* Catégories fictives : supprimées sauf si un client réel les utilise (alors conservées et « dé-marquées ») */
  const realClients = S.clients.filter(c => !c.demo);
  del.categories = [];
  S.categories.filter(c => c.demo).forEach(c => { if (realClients.some(x => x.categoryId === c.id)) { put.categories.push({ ...c, demo: false }); kept++; } else del.categories.push(c.id); });
  /* Commerciaux fictifs : retirés (sauf l'opérateur connecté) ; les clients réels qu'ils suivaient sont désaffectés */
  const demoOps = new Set(OPERATORS.filter(o => o.demo && o.id !== SESSION_OP?.id).map(o => o.id));
  realClients.filter(c => demoOps.has(c.salesRepId)).forEach(c => put.clients.push({ ...clone(c), salesRepId: '' }));
  const media = await IDB.getAll('media');
  const usedReal = new Set([...realClients.map(c => c.photoId), ...S.documents.filter(d => !del.documents.includes(d.id)).map(d => d.mediaId), SETTINGS.logoId].filter(Boolean));
  del.media = media.filter(m => m.demo && !usedReal.has(m.id)).map(m => m.id);
  await commit({ del, put, kv: { operators: OPERATORS.filter(o => !demoOps.has(o.id)) } }, { what: 'demo' });
  PREF.set(DEMO_KEY, '1');
  return { kept };
}

/* ---------- Bandeau « démonstration » (Supprimer / Restaurer la démo) ---------- */
function demoBanner() {
  if (!can('demo')) return '';
  if (demoPresent()) {
    const n = S.clients.filter(c => c.demo).length;
    return `<div class="notice demo-notice" role="note">${svg('info')}<div class="grow"><b>Données de démonstration actives</b> — ${n} clients fictifs, identifiés par l'étiquette <span class="chip gold xs">Démo</span>. Vous pouvez les supprimer à tout moment sans toucher à vos propres données.</div>
      <button type="button" class="btn sm" id="demoRemove">${svg('trash')} Supprimer la démo</button></div>`;
  }
  if (PREF.get(DEMO_KEY) !== '1') return '';
  return `<div class="notice demo-notice" role="note">${svg('info')}<div class="grow"><b>Données de démonstration retirées</b> — vos propres données, le logo et les réglages de l'entreprise sont conservés. Vous pouvez réafficher l'ensemble des données fictives à tout moment.</div>
    <button type="button" class="btn sm gold" id="demoRestore">${svg('undo')} Restaurer la démo</button></div>`;
}
function bindDemoBanner(root) {
  const rm = $('#demoRemove', root); if (rm) rm.onclick = () => confirmRemoveDemo();
  const rs = $('#demoRestore', root); if (rs) rs.onclick = e => guard(e.currentTarget, async () => { await loadDemoData(); toast('Données de démonstration restaurées', 'ok'); });
}
