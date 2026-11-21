/* ██████████████████████████████████████████████████████████████
   ONDEA CRM — lines-editor.js
   Éditeur de lignes commun aux devis, factures et achats :
   désignation, quantité, prix unitaire HT, remise %, TVA, montant.
     • calcul instantané des totaux (HT, remise, TVA par taux, TTC) ;
     • saisie à la virgule française (« 12,50 ») ;
     • suggestions : les désignations déjà utilisées sont proposées et
       reprennent automatiquement leur dernier prix et taux de TVA ;
     • entièrement utilisable au clavier (libellés explicites).
   ██████████████████████████████████████████████████████████████ */
"use strict";

/* Catalogue implicite : dernière occurrence de chaque désignation */
function knownLineLabels() {
  const map = new Map();
  [...S.achats, ...S.devis, ...S.factures].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach(d => (d.lines || []).forEach(l => map.set(norm(l.label), l)));
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/* Zone HTML de l'éditeur (le contenu est dessiné par bindLinesEditor) */
const linesEditorHTML = (id, legend = 'Lignes') => `<fieldset class="fs"><legend>${esc(legend)}</legend><div id="${id}"></div>
  <div class="row wrap" style="margin:6px 0 12px;gap:8px"><button type="button" class="btn sm" data-addline="${id}">${svg('plus')} Ajouter une ligne</button><small class="muted">Astuce : commencez à taper une désignation déjà utilisée pour reprendre son prix.</small></div></fieldset>`;

/* lines : tableau de lignes initiales (copié). Retourne une fonction qui lit les lignes saisies. */
function bindLinesEditor(root, id, initial = [], { onTotals } = {}) {
  const host = $('#' + id, root);
  const rates = SETTINGS.vatRates;
  const known = knownLineLabels();
  const dl = id + 'Dl';
  let lines = initial.length ? initial.map(l => ({ ...l })) : [{ label: '', qty: 1, unitPrice: '', discount: 0, vatRate: SETTINGS.defaultVat }];
  const num = v => { const n = parseNum(v); return isNaN(n) ? 0 : n; };
  const read = () => lines.map(l => ({ id: l.id, label: String(l.label || '').trim(), qty: parseNum(l.qty), unitPrice: parseNum(l.unitPrice), discount: l.discount === '' || l.discount == null ? 0 : parseNum(l.discount), vatRate: Number(l.vatRate) }));
  const totals = () => docTotals({ lines: lines.map(l => ({ qty: num(l.qty), unitPrice: num(l.unitPrice), discount: num(l.discount), vatRate: Number(l.vatRate) || 0 })) });
  const totalsHTML = t => `${t.discount ? `<div><span>Total HT avant remise</span><b class="mono">${fmtMoney(t.ht + t.discount)}</b></div><div><span>Remises</span><b class="mono">− ${fmtMoney(t.discount)}</b></div>` : ''}<div><span>Total HT</span><b class="mono">${fmtMoney(t.ht)}</b></div>
    ${Object.entries(t.byRate).sort((a, b) => b[0] - a[0]).map(([r, x]) => `<div><span>TVA ${fmtPct(Number(r), Number(r) % 1 ? 1 : 0)} sur ${fmtMoney(x.base)}</span><b class="mono">${fmtMoney(x.tva)}</b></div>`).join('')}
    <div class="ttc"><span>Total TTC</span><b class="mono">${fmtMoney(t.ttc)}</b></div>`;
  const refreshTotals = () => {
    const t = totals();
    lines.forEach((l, i) => { const c = $(`[data-lt="${i}"]`, host); if (c) c.textContent = fmtMoney(lineHT({ qty: num(l.qty), unitPrice: num(l.unitPrice), discount: num(l.discount) })); });
    const box = $('.totals', host); if (box) box.innerHTML = totalsHTML(t);
    if (onTotals) onTotals(t);
  };
  const draw = () => {
    host.innerHTML = `<datalist id="${dl}">${known.slice(0, 300).map(l => `<option value="${esc(l.label)}"></option>`).join('')}</datalist>
      <div class="tbl-wrap flat"><table class="tbl lines-tbl" style="min-width:720px"><caption class="sr-only">Lignes du document</caption><thead><tr>
        <th scope="col">Désignation</th><th scope="col" class="num-c">Qté</th><th scope="col" class="num-c">Prix unit. HT</th><th scope="col" class="num-c">Remise %</th><th scope="col">TVA</th><th scope="col" class="num-c">Montant HT</th><th scope="col"><span class="sr-only">Retirer</span></th></tr></thead><tbody>
        ${lines.map((l, i) => `<tr>
          <td><label class="sr-only" for="${id}L${i}">Désignation ligne ${i + 1}</label><input class="inp l-lbl" id="${id}L${i}" data-f="label" data-i="${i}" list="${dl}" value="${esc(l.label)}" autocomplete="off"></td>
          <td class="num-c"><label class="sr-only" for="${id}Q${i}">Quantité ligne ${i + 1}</label><input class="inp l-num" id="${id}Q${i}" data-f="qty" data-i="${i}" inputmode="decimal" value="${esc(String(l.qty ?? '').replace('.', ','))}"></td>
          <td class="num-c"><label class="sr-only" for="${id}P${i}">Prix unitaire HT ligne ${i + 1}</label><input class="inp l-num" id="${id}P${i}" data-f="unitPrice" data-i="${i}" inputmode="decimal" value="${esc(String(l.unitPrice ?? '').replace('.', ','))}"></td>
          <td class="num-c"><label class="sr-only" for="${id}R${i}">Remise ligne ${i + 1}</label><input class="inp l-num" id="${id}R${i}" data-f="discount" data-i="${i}" inputmode="decimal" value="${esc(String(l.discount || '').replace('.', ','))}" placeholder="0"></td>
          <td><label class="sr-only" for="${id}V${i}">TVA ligne ${i + 1}</label><select class="sel l-vat" id="${id}V${i}" data-f="vatRate" data-i="${i}">${[...new Set([...rates, Number(l.vatRate)])].filter(r => !isNaN(r)).map(r => `<option value="${r}" ${Number(l.vatRate) === r ? 'selected' : ''}>${fmtPct(r, r % 1 ? 1 : 0)}</option>`).join('')}</select></td>
          <td class="num-c mono" data-lt="${i}">—</td>
          <td><button type="button" class="btn icon sm danger" data-lrm="${i}" aria-label="Retirer la ligne ${i + 1}" ${lines.length < 2 ? 'disabled' : ''}>${svg('x')}</button></td></tr>`).join('')}
      </tbody></table></div><div class="totals" aria-live="polite"></div>`;
    $$('[data-f]', host).forEach(inp => {
      const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        const i = +inp.dataset.i, f = inp.dataset.f;
        lines[i][f] = f === 'vatRate' ? Number(inp.value) : inp.value;
        /* Désignation connue : reprise du dernier prix et de la TVA si non saisis */
        if (f === 'label') {
          const k = known.find(x => norm(x.label) === norm(inp.value));
          if (k && (lines[i].unitPrice === '' || lines[i].unitPrice == null)) {
            lines[i].unitPrice = k.unitPrice; lines[i].vatRate = k.vatRate;
            $(`#${id}P${i}`, host).value = String(k.unitPrice).replace('.', ',');
            $(`#${id}V${i}`, host).value = String(k.vatRate);
          }
        }
        refreshTotals();
      });
    });
    $$('[data-lrm]', host).forEach(b => b.onclick = () => { lines.splice(+b.dataset.lrm, 1); draw(); });
    refreshTotals();
  };
  $(`[data-addline="${id}"]`, root).onclick = () => { lines.push({ label: '', qty: 1, unitPrice: '', discount: 0, vatRate: SETTINGS.defaultVat }); draw(); $(`#${id}L${lines.length - 1}`, host).focus(); };
  draw();
  return read;
}
