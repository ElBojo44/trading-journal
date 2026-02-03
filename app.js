// Trading Journal - app.js (Eventos por pata + filtros Abiertas/Cerradas/Todas + Vista SPREADS)
// Compatible con tu index.html (tradesList, listTitle, statusView, viewMode)
// Requiere en Google Sheet headers: position_id, pata, accion, roll_group_id, force_new

let editRow = null;

const API_URL =
  "https://script.google.com/macros/s/AKfycbzfUqoRycuCihTOg5AsRB_f9VBh4EEw_SyupdDX15VPBXvc4ceg-sLGRQy0AVm94o0i/exec";

/**
 * ========= CATALOGO =========
 */
const strategyCatalog = {
  INGRESOS: [
    { id: "CC", label: "Covered Call", tipo: "THETA", sesgo: "NEUTRAL_ALCISTA" },
    { id: "CSP", label: "Cash Secured Put", tipo: "THETA", sesgo: "NEUTRAL_ALCISTA" },
    { id: "WHEEL", label: "Wheel (Manual)", tipo: "THETA", sesgo: "NEUTRAL" },
    { id: "DIAGONAL", label: "Diagonal (PMCC)", tipo: "THETA", sesgo: "NEUTRAL_ALCISTA" },
    { id: "CALENDAR", label: "Calendar (Income)", tipo: "THETA", sesgo: "NEUTRAL" },
  ],
  DIRECCIONALES: [
    { id: "LONG_CALL", label: "Long Call", tipo: "DIRECCIONAL", sesgo: "BULL" },
    { id: "LONG_PUT", label: "Long Put", tipo: "DIRECCIONAL", sesgo: "BEAR" },
    { id: "CALL_DEBIT", label: "Call Debit Spread", tipo: "DIRECCIONAL", sesgo: "BULL" },
    { id: "PUT_DEBIT", label: "Put Debit Spread", tipo: "DIRECCIONAL", sesgo: "BEAR" },
  ],
  VOLATILIDAD: [
    { id: "STRADDLE", label: "Long Straddle", tipo: "VOLATILIDAD", sesgo: "NEUTRAL" },
    { id: "STRANGLE", label: "Long Strangle", tipo: "VOLATILIDAD", sesgo: "NEUTRAL" },
  ],
  SPREADS: [
    { id: "PCS", label: "Put Credit Spread", tipo: "CREDITO", sesgo: "BULL" },
    { id: "CCS", label: "Call Credit Spread", tipo: "CREDITO", sesgo: "BEAR" },
    { id: "IC", label: "Iron Condor", tipo: "CREDITO", sesgo: "NEUTRAL" },
    { id: "IB", label: "Iron Butterfly", tipo: "CREDITO", sesgo: "NEUTRAL" },
  ],
};



const brokerLabels = {
  SIGMA_TRADE: "Sigma Trade",
  THINKORSWIM: "ThinkorSwim",
  ROBINHOOD: "Robinhood",
  WEBULL: "Webull",
};
function prettyBroker(v) {
  return brokerLabels[v] || v || "";
}

function fmtMoney(n) {
  const x = Number(n || 0);
  return `$${x.toFixed(2)}`;
}

function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badge(text, bg = "#111", fg = "#fff") {
  const t = escHtml(text);
  return `<span class="badge" style="
    display:inline-block;
    padding:2px 8px;
    border-radius:999px;
    font-size:12px;
    line-height:18px;
    margin-left:6px;
    background:${bg};
    color:${fg};
    vertical-align:middle;
    white-space:nowrap;
  ">${t}</span>`;
}

function badgeEstrategiaId(id) {
  const x = String(id || "").trim().toUpperCase();
  if (!x) return "";
  // Colores por estrategia (ajústalos a tu gusto)
  if (x === "PCS") return badge("PCS", "#1f2937");     // gris oscuro
  if (x === "CCS") return badge("CCS", "#374151");
  if (x === "IC")  return badge("IC",  "#111827");
  if (x === "CC")  return badge("CC",  "#0f172a");
  if (x === "CSP") return badge("CSP", "#0f172a");
  if (x === "DIAGONAL") return badge("PMCC", "#0b3a2e");
  return badge(x, "#111");
}

function badgeEstado(est, isReallyOpen) {
  const e = String(est || "").toUpperCase();
  if (e === "CLOSED") return badge("CLOSED", "#111827");
  // OPEN
  if (isReallyOpen) return badge("OPEN", "#064e3b"); // verde
  return badge("OPEN (ya cerrada)", "#7c2d12");      // naranja/rojo
}

function badgeTipo(tipo) {
  const t = String(tipo || "").toUpperCase();
  if (!t) return "";
  if (t === "CREDITO") return badge("CRÉDITO", "#1d4ed8");     // azul
  if (t === "THETA") return badge("THETA", "#6d28d9");         // morado
  if (t === "DIRECCIONAL") return badge("DIR", "#b45309");     // ámbar
  if (t === "VOLATILIDAD") return badge("VOL", "#0e7490");     // teal
  return badge(t, "#111");
}

function dteFromExp(exp) {
  const iso = normalizarFecha(exp);
  const d = dateFromISO(iso);
  if (!d) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ms = d.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function badgeDTE(exp) {
  const dte = dteFromExp(exp);
  if (dte == null) return "";

  if (dte <= 0) return badge("0DTE", "#7c2d12");
  if (dte === 1) return badge("1DTE", "#92400e");
  if (dte <= 7) return badge(`${dte}DTE`, "#b45309");
  if (dte <= 30) return badge(`${dte}DTE`, "#1d4ed8");
  return badge(`${dte}DTE`, "#374151");
}

function badgePnL(pnlNum) {
  const n = Number(pnlNum || 0);
  const bg = n >= 0 ? "#065f46" : "#7f1d1d";
  const txt = (n >= 0 ? "+" : "") + fmtMoney(n);
  return badge(txt, bg);
}

// --- tiny styles for extra buttons (no depende de style.css) ---
(function ensureExtraButtonStyles(){
  if (document.getElementById("extraBtnStyles")) return;
  const st = document.createElement("style");
  st.id = "extraBtnStyles";
  st.textContent = `
    #repairBtn{
      border:1px solid rgba(0,0,0,.15);
      background:#fff;
      border-radius:12px;
      padding:8px 10px;
      cursor:pointer;
      font-size:13px;
      white-space:nowrap;
    }
    #repairBtn:hover{ background:rgba(0,0,0,.03); }
  `;
  document.head.appendChild(st);
})();

function wrapBadges(htmlBadges) {
  return `<span style="float:right; display:flex; gap:6px; align-items:center; margin-top:2px;">${htmlBadges}</span>`;
}


// ---------- Dashboard KPI ----------
function ensureDashboardContainer() {
  // Try to attach near PnL card / title
  let el = document.getElementById("statsDashboard");
  if (el) return el;

  // Inject responsive styles once
  if (!document.getElementById("statsDashboardStyles")) {
    const st = document.createElement("style");
    st.id = "statsDashboardStyles";
    st.textContent = `
      #statsDashboard{
        margin:12px auto 14px;
        border:1px solid rgba(0,0,0,.08);
        border-radius:12px;
        background:#fff;
        overflow:hidden;
      }
      #statsDashboard .dashHead{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:10px 12px;
        background:rgba(0,0,0,.03);
      }
      #statsDashboard .dashTitle{
        font-weight:700;
        font-size:13px;
        opacity:.9;
      }
      #statsDashboard .dashToggle{
        border:1px solid rgba(0,0,0,.15);
        background:#fff;
        border-radius:10px;
        padding:6px 10px;
        cursor:pointer;
        font-size:13px;
      }
      #statsDashboard .dashBody{
        padding:12px;
      }
      #statsDashboard .dashGrid{
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        align-items:stretch;
      }
      #statsDashboard .dashCol{
        flex:1;
        min-width:260px;
      }
      #statsDashboard .dashBadges{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
      }
      #statsDashboard .dashMeta{
        margin-top:8px;
        font-size:13px;
        opacity:.9;
        line-height:1.35;
      }
      #statsDashboard .dashTableWrap{
        overflow:auto;
        -webkit-overflow-scrolling:touch;
        border-radius:10px;
      }
      #statsDashboard table{
        width:100%;
        border-collapse:collapse;
        font-size:13px;
        min-width:420px; /* permite scroll horizontal en móvil */
      }
      #statsDashboard th, #statsDashboard td{
        padding:4px 6px;
      }
      #statsDashboard thead{
        opacity:.8;
      }

      @media (max-width: 520px){
        #statsDashboard .dashCol{ min-width: 100%; }
        #statsDashboard .dashBody{ padding:10px; }
        #statsDashboard .dashMeta{ font-size:12px; }
        #statsDashboard .dashToggle{ font-size:12px; padding:6px 9px; }
      }
    `;
    document.head.appendChild(st);
  }

  el = document.createElement("div");
  el.id = "statsDashboard";
  el.innerHTML = `
    <div class="dashHead">
      <div class="dashTitle">📊 Dashboard</div>
      <button type="button" class="dashToggle" aria-expanded="true">Ocultar</button>
    </div>
    <div class="dashBody"></div>
  `;

  const parent =
    (pnlCard && pnlCard.parentElement) ||
    (listTitle && listTitle.parentElement) ||
    document.body;

  if (pnlCard && pnlCard.parentElement) {
    pnlCard.insertAdjacentElement("afterend", el);
  } else if (listTitle) {
    listTitle.insertAdjacentElement("afterend", el);
  } else {
    parent.prepend(el);
  }

  // Toggle behavior + persistence
  const btn = el.querySelector(".dashToggle");
  const body = el.querySelector(".dashBody");
  const key = "statsDashboardCollapsed";
  const collapsed = localStorage.getItem(key) === "1";
  if (collapsed) {
    body.style.display = "none";
    btn.textContent = "Mostrar";
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", () => {
    const isHidden = body.style.display === "none";
    body.style.display = isHidden ? "block" : "none";
    btn.textContent = isHidden ? "Ocultar" : "Mostrar";
    btn.setAttribute("aria-expanded", isHidden ? "true" : "false");
    localStorage.setItem(key, isHidden ? "0" : "1");
  });

  return el;
}

function pct(n) {
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toFixed(0) + "%";
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a,b)=>a+b,0) / arr.length;
}

function renderDashboard(items) {
  const el = ensureDashboardContainer();
  const body = el.querySelector(".dashBody");
  if (!body) return;

  const closed = items.filter(t => (t._estado || "").toUpperCase() === "CLOSED");
  const openReal = items.filter(t => (t._estado || "").toUpperCase() === "OPEN" && t._isReallyOpen);

  const pnlTotal = closed.reduce((s,t)=> s + (Number(t._resultadoNum)||0), 0);
  const wins = closed.filter(t => (Number(t._resultadoNum)||0) > 0);
  const losses = closed.filter(t => (Number(t._resultadoNum)||0) < 0);

  const winRate = closed.length ? wins.length / closed.length : NaN;

  function avg(arr){
    const a = (Array.isArray(arr) ? arr : []).map(Number).filter(Number.isFinite);
    return a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0;
  }
  function pct(x){
    return Number.isFinite(x) ? (x*100).toFixed(0) + "%" : "—";
  }

  const avgWin = wins.length ? avg(wins.map(t => Number(t._resultadoNum)||0)) : 0;
  const avgLoss = losses.length ? avg(losses.map(t => Number(t._resultadoNum)||0)) : 0;
  const expectancy = Number.isFinite(winRate) ? (winRate*avgWin + (1-winRate)*avgLoss) : 0;

  // by strategy (top 6 by pnl)
  const byStrat = new Map();
  closed.forEach(t => {
    const k = (t.estrategia_id || t.estrategia || "—").toString();
    const rec = byStrat.get(k) || { pnl:0, n:0, w:0 };
    const r = Number(t._resultadoNum)||0;
    rec.pnl += r;
    rec.n += 1;
    if (r > 0) rec.w += 1;
    byStrat.set(k, rec);
  });

  const stratRows = [...byStrat.entries()]
    .sort((a,b)=> (b[1].pnl - a[1].pnl))
    .slice(0, 6)
    .map(([k,v]) => {
      const wr = v.n ? v.w / v.n : NaN;
      return `<tr>
        <td style="white-space:nowrap;"><b>${escHtml(k)}</b></td>
        <td style="text-align:right;">${fmtMoney(v.pnl)}</td>
        <td style="text-align:right;">${v.n}</td>
        <td style="text-align:right;">${pct(wr)}</td>
      </tr>`;
    }).join("");

  body.innerHTML = `
    <div class="dashGrid">
      <div class="dashCol">
        <div class="dashBadges">
          ${badge("Cerrados: " + closed.length, "#111827")}
          ${badge("Abiertos: " + openReal.length, "#064e3b")}
          ${badge("Win rate: " + (Number.isFinite(winRate) ? pct(winRate) : "—"), "#1d4ed8")}
          ${badge("PnL: " + fmtMoney(pnlTotal), pnlTotal >= 0 ? "#065f46" : "#7f1d1d")}
        </div>
        <div class="dashMeta">
          Avg win: <b>${fmtMoney(avgWin)}</b> • Avg loss: <b>${fmtMoney(avgLoss)}</b> • Expectancy: <b>${fmtMoney(expectancy)}</b>
        </div>
      </div>

      <div class="dashCol">
        <div style="font-size:13px; margin-bottom:6px;"><b>Top estrategias (por PnL)</b></div>
        <div class="dashTableWrap">
          <table>
            <thead>
              <tr>
                <th style="text-align:left;">Strat</th>
                <th style="text-align:right;">PnL</th>
                <th style="text-align:right;">#</th>
                <th style="text-align:right;">WR</th>
              </tr>
            </thead>
            <tbody>
              ${stratRows || `<tr><td colspan="4" style="padding:6px; opacity:.7;">—</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}



// Reverse lookup por label (para trades viejos)
const labelToStrategy = (() => {
  const map = new Map();
  Object.entries(strategyCatalog).forEach(([cat, arr]) => {
    arr.forEach((s) => map.set(String(s.label).toLowerCase(), { cat, id: s.id }));
  });
  return map;
})();

function getStrategyByCatId(cat, id) {
  const arr = strategyCatalog[cat];
  if (!arr) return null;
  return arr.find((s) => s.id === id) || null;
}

function findCatIdByLabel(label) {
  if (!label) return null;
  return labelToStrategy.get(String(label).toLowerCase()) || null;
}

function isSpreadStrategyId(estrategia_id) {
  const id = String(estrategia_id || "").toUpperCase();
  // Estrategias multi-pata (para agrupar en vista SPREADS)
  return id === "PCS" || id === "CCS" || id === "IC" || id === "IB" ||
         id === "PUT CREDIT SPREAD" || id === "CALL CREDIT SPREAD" ||
         id === "IRON CONDOR" || id === "IRON BUTTERFLY";
}

// Para el checkbox "Guardar como NETO (1 precio)"
function isMultiLegNettableStrategyId(estrategia_id) {
  const id = String(estrategia_id || "").trim().toUpperCase();
  return id === "PCS" || id === "CCS" || id === "IC" || id === "IB";
}

function isPositionStrategyId(estrategia_id) {
  const id = String(estrategia_id || "").trim().toUpperCase();
  return id === "CC" || id === "DIAGONAL";
}

// DOM
const form = document.getElementById("tradeForm");
const list = document.getElementById("tradesList");
const pnlCard = document.getElementById("pnlCard");
const pnlValue = document.getElementById("pnlValue");
const listTitle = document.getElementById("listTitle");

// filtros
const historyRange = document.getElementById("historyRange");
const brokerFilter = document.getElementById("brokerFilter");
const tickerSearch = document.getElementById("tickerSearch");

// extra UI
const repairBtn = document.getElementById("repairBtn") || document.querySelector(".repairBtn");
const netMode = document.getElementById("netMode");


// ---------- CC Combo UI (abrir SHORT + STOCK en 1 paso) ----------
let ccComboWrap = null;
let ccComboEnabled = null;
let ccShortPrice = null;
let ccStockPrice = null;

// Crea UI inline sin tocar index.html
function ensureCCComboUI() {
  if (ccComboWrap) return;
  if (!form) return;

  ccComboWrap = document.createElement("div");
  ccComboWrap.id = "ccComboWrap";
  ccComboWrap.style.cssText = "margin:10px 0; padding:10px; border:1px solid rgba(0,0,0,.12); border-radius:12px; display:none;";

  ccComboWrap.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
      <label style="display:flex; gap:8px; align-items:center; font-size:13px; opacity:.92;">
        <input type="checkbox" id="ccComboEnabled" />
        Abrir CC + Acciones (2 patas)
      </label>
      <small style="opacity:.85; line-height:1.25;">
        Entra el precio del <b>short call</b> y el precio de <b>las acciones</b> en un solo guardado.
      </small>
    </div>

    <div style="display:grid; gap:10px; grid-template-columns: 1fr; margin-top:10px;">
      <input type="number" step="0.01" id="ccShortPrice" placeholder="Precio short call (crédito) ej: 0.35" />
      <input type="number" step="0.01" id="ccStockPrice" placeholder="Precio acciones (compra) ej: 420.15" />
      <small style="opacity:.8; line-height:1.25;">
        Nota: las acciones se guardan como <b>pata=STOCK</b> con qty = contratos*100.
      </small>
    </div>
  `;

  // Insertar justo antes de NETO (o antes de Entrada si NETO no existe)
  const netLabel = document.querySelector('label input#netMode')?.closest("label");
  if (netLabel) {
    netLabel.insertAdjacentElement("beforebegin", ccComboWrap);
  } else {
    // fallback: antes de entrada_tipo
    entrada_tipo?.insertAdjacentElement("beforebegin", ccComboWrap);
  }

  ccComboEnabled = ccComboWrap.querySelector("#ccComboEnabled");
  ccShortPrice = ccComboWrap.querySelector("#ccShortPrice");
  ccStockPrice = ccComboWrap.querySelector("#ccStockPrice");

  ccComboEnabled?.addEventListener("change", syncCCComboMode);
}

// Muestra/oculta y deshabilita campos cuando aplica
function syncCCComboVisibility() {
  ensureCCComboUI();

  const stratId = safeUpper(estrategia?.value || "");
  const isCC = stratId === "CC";
  if (ccComboWrap) ccComboWrap.style.display = isCC ? "block" : "none";

  // Si no es CC, reset
  if (!isCC && ccComboEnabled) {
    ccComboEnabled.checked = false;
    if (ccShortPrice) ccShortPrice.value = "";
    if (ccStockPrice) ccStockPrice.value = "";
  }

  syncCCComboMode();
}

function syncCCComboMode() {
  const stratId = safeUpper(estrategia?.value || "");
  const isCC = stratId === "CC";
  const on = !!(isCC && ccComboEnabled?.checked);

  // En modo combo, forzamos que el trade sea OPEN y evitamos confusión
  const disable = (el, v) => { if (el) el.disabled = !!v; };

  // pata/tipo/entrada se setean internamente para cada pata
  disable(pata, on);
  disable(tipo_opcion, on);
  disable(entrada_tipo, on);
  disable(credito_debito, on);

  // Acciones/estado forzados a OPEN en combo
  if (on) {
    if (accion) accion.value = "OPEN";
    if (estado) estado.value = "OPEN";
  }
  disable(accion, on);
  disable(estado, on);

  // salida se deja libre (pero no se usa al abrir)
  // Mantener expiración/strikes/contratos activos porque el short los usa
}


// NUEVOS filtros/vistas
const statusView = document.getElementById("statusView"); // OPEN_ONLY / CLOSED_ONLY / ALL (si existe)
const viewMode = document.getElementById("viewMode");     // TRADES / SPREADS (si existe)

const fecha = document.getElementById("fecha");
const hora = document.getElementById("hora");
const ticker = document.getElementById("ticker");
const broker = document.getElementById("broker");

// categoria/estrategia
const categoria = document.getElementById("categoria");
const estrategia = document.getElementById("estrategia");

// Nuevos campos
const position_id = document.getElementById("position_id");
const pata = document.getElementById("pata");
const tipo_opcion = document.getElementById("tipo_opcion");
const accion = document.getElementById("accion");
const roll_group_id = document.getElementById("roll_group_id");

const estado = document.getElementById("estado");
const expiracion = document.getElementById("expiracion");
const strikes = document.getElementById("strikes");

// Multi-leg UI
const multiLegWrap = document.getElementById("multiLegWrap");
const multiLegEnabled = document.getElementById("multiLegEnabled");
const genLegsBtn = document.getElementById("genLegsBtn");
const legsTable = document.getElementById("legsTable");

const entrada_tipo = document.getElementById("entrada_tipo");
const credito_debito = document.getElementById("credito_debito");

const salida_tipo = document.getElementById("salida_tipo");
const credito_debito_salida = document.getElementById("credito_debito_salida");

const contratos = document.getElementById("contratos");
const resultado = document.getElementById("resultado");
const notas = document.getElementById("notas");

const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");

// ---------- helpers ----------
function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setFechaHoy() {
  if (fecha) fecha.value = todayLocalISO();
}

function setHoraAhora() {
  if (!hora) return;
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  hora.value = `${hh}:${mm}`;
}

function getHoraAhoraHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Normaliza hora para input type="time": HH:mm */
function normalizarHora(h) {
  if (!h) return "00:00";

  // ISO tipo 1899-12-31T03:43:00.000Z
  if (typeof h === "string" && h.includes("T")) {
    const m = h.match(/T(\d{2}):(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
  }

  // "HH:mm:ss" o "HH:mm"
  if (typeof h === "string" && /^\d{2}:\d{2}/.test(h)) {
    return h.slice(0, 5);
  }

  // Date
  const d = new Date(h);
  if (!isNaN(d)) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  return "00:00";
}

/** Limpia payload: evita mandar campos internos (_*) al Apps Script */
function cleanPayload(obj) {
  const allowed = [
    "fecha","hora","ticker","broker",
    "categoria","estrategia_id","estrategia","sesgo","tipo",
    "expiracion","strikes","tipo_opcion",
    "entrada_tipo","credito_debito",
    "salida_tipo","credito_debito_salida",
    "contratos","resultado","notas",
    "estado","cierre_fecha",
    "position_id","pata","accion","roll_group_id",
    "force_new","_row"
  ];
  const out = {};
  allowed.forEach((k) => {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  });
  return out;
}


function normalizarFecha(f) {
  if (!f) return "";
  if (typeof f === "string" && f.includes("-")) return f.split("T")[0];
  const d = new Date(f);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromISO(iso) {
  if (!iso) return null;
  const parts = iso.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function isWithinRange(fechaISO, rangeKey) {
  const d = dateFromISO(fechaISO);
  if (!d) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (rangeKey === "ALL") return true;
  if (rangeKey === "TODAY") return d.getTime() === today.getTime();

  const days = rangeKey === "7D" ? 7 : 30;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return d >= start && d <= today;
}

function rangeTitle(rangeKey) {
  if (rangeKey === "TODAY") return "📅 Trades de Hoy";
  if (rangeKey === "7D") return "📅 Trades (Últimos 7 días)";
  if (rangeKey === "30D") return "📅 Trades (Últimos 30 días)";
  return "📅 Trades (Todo)";
}

function salirModoEdicion() {
  editRow = null;
  if (saveBtn) saveBtn.textContent = "Guardar Trade";
  document.querySelectorAll("#tradesList li").forEach((el) => el.classList.remove("editing"));
}

function toSignedAmount(tipoSelectValue, amount) {
  const t = (tipoSelectValue || "CREDITO").toUpperCase();
  const val = parseFloat(amount) || 0;
  return t === "DEBITO" ? -val : val;
}

function isStockLegFromInputs() {
  const leg = safeUpper(pata?.value || "");
  return leg === "STOCK";
}

function calcularResultadoFromInputs() {
  const qty = parseFloat(contratos?.value) || 0;
  const entradaSigned = toSignedAmount(entrada_tipo?.value, credito_debito?.value);
  const salidaSigned = toSignedAmount(salida_tipo?.value, credito_debito_salida?.value);

  if (!qty) {
    if (resultado) resultado.value = "";
    return;
  }

  // STOCK: no multiplicador 100; Opciones: *100
  const mult = isStockLegFromInputs() ? 1 : 100;
  const pnl = (entradaSigned + salidaSigned) * mult * qty;
  if (resultado) resultado.value = Number.isFinite(pnl) ? pnl.toFixed(2) : "";
}

function isStockLeg(tradeLike) {
  const leg = safeUpper(tradeLike.pata || tradeLike._pata || "");
  return leg === "STOCK";
}

function computeEventPnL(tradeLike) {
  const qty = parseFloat(tradeLike.contratos) || 0;
  if (!qty) return "";

  const entradaSigned = toSignedAmount(tradeLike.entrada_tipo, tradeLike.credito_debito);
  const salidaSigned = toSignedAmount(tradeLike.salida_tipo, tradeLike.credito_debito_salida);

  const mult = isStockLeg(tradeLike) ? 1 : 100;
  const pnl = (entradaSigned + salidaSigned) * mult * qty;

  return Number.isFinite(pnl) ? pnl.toFixed(2) : "";
}

function safeUpper(x) {
  return String(x || "").trim().toUpperCase();
}

/** Genera un position_id cuando abres una posición nueva */
function generatePositionId({ tk, stratId, fechaISO }) {
  const ts = Date.now().toString(36).toUpperCase();
  const f = (fechaISO || todayLocalISO()).replaceAll("-", "");
  const s = (stratId || "STRAT").toUpperCase();
  return `${tk}-${s}-${f}-${ts}`;
}

// ---------- llenar estrategias por categoria ----------
function renderEstrategiasForCategoria(catValue, selectedId = "") {
  if (!estrategia) return;
  estrategia.innerHTML = `<option value="">Estrategia</option>`;
  const arr = strategyCatalog[catValue];
  if (!arr) return;
  arr.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.label;
    if (selectedId && selectedId === s.id) opt.selected = true;
    estrategia.appendChild(opt);
  });
}

function syncNetModeVisibility() {
  if (!netMode) return;
  const stratId = estrategia?.value || "";
  const show = isMultiLegNettableStrategyId(stratId);
  netMode.closest("label")?.style && (netMode.closest("label").style.display = show ? "block" : "none");
  if (!show) netMode.checked = false;
}

categoria?.addEventListener("change", () => renderEstrategiasForCategoria(categoria.value));

estrategia?.addEventListener("change", syncNetModeVisibility);

// Mostrar/ocultar CALL/PUT según la pata
function syncTipoOpcionVisibility() {
  if (!tipo_opcion) return;
  const leg = safeUpper(pata?.value || "");
  const isStock = leg === "STOCK";
  // si es stock, ocultamos y limpiamos
  tipo_opcion.style.display = isStock ? "none" : "";
  if (isStock) tipo_opcion.value = "";
}

pata?.addEventListener("change", syncTipoOpcionVisibility);

// ---------- Multi-leg builder (Spreads / IC) ----------
let multiLegDraft = []; // [{pata, tipo_opcion, strikes, entrada_tipo, defaultHint, entryPrice}]

function isMultiLegEligibleStrategy(estrategia_id) {
  const id = safeUpper(estrategia_id || "");
  return id === "PCS" || id === "CCS" || id === "IC" || id === "IB";
}

function parseStrikesToLegs(estrategia_id, strikesText) {
  const id = safeUpper(estrategia_id || "");
  const raw = String(strikesText || "").trim();
  if (!raw) return [];

  // Normalize separators
  const s = raw
    .replaceAll("|", " ")
    .replaceAll(",", " ")
    .replaceAll("-", "/")
    .replaceAll("\\", "/")
    .replace(/\s+/g, " ")
    .trim();

  // Helper: get number after label like SC:450 or S450
  function pickLabeled(label) {
    // Ej: SC:450, SP 430, S=440
    const re = new RegExp(`${label}\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)`, "i");
    const m = s.match(re);
    return m ? m[1] : null;
  }

  // First try labeled formats
  const labeled = {
    SC: pickLabeled("SC"),
    LC: pickLabeled("LC"),
    SP: pickLabeled("SP"),
    LP: pickLabeled("LP"),
    S: pickLabeled("S"),
    L: pickLabeled("L"),
  };

  // Then try plain numbers list (e.g. 440/435 or 450/455/430/425)
  const nums = s
    .split(/[\s/]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/[^0-9.]/g, ""))
    .filter((x) => x && !isNaN(Number(x)));

  const legs = [];

  if (id === "PCS" || id === "CCS") {
    const shortK = labeled.S || nums[0] || null;
    const longK = labeled.L || nums[1] || null;
    if (!shortK || !longK) return [];
    const optType = id === "PCS" ? "PUT" : "CALL";
    legs.push({ pata: "SHORT", tipo_opcion: optType, strikes: String(shortK), entrada_tipo: "CREDITO", defaultHint: "Short (crédito)" });
    legs.push({ pata: "LONG",  tipo_opcion: optType, strikes: String(longK),  entrada_tipo: "DEBITO",  defaultHint: "Long (débito)" });
    return legs;
  }

  if (id === "IC" || id === "IB") {
    const sc = labeled.SC || nums[0] || null;
    const lc = labeled.LC || nums[1] || null;
    const sp = labeled.SP || nums[2] || null;
    const lp = labeled.LP || nums[3] || null;
    if (!sc || !lc || !sp || !lp) return [];
    // Calls
    legs.push({ pata: "SHORT", tipo_opcion: "CALL", strikes: String(sc), entrada_tipo: "CREDITO", defaultHint: "Short Call (crédito)" });
    legs.push({ pata: "LONG",  tipo_opcion: "CALL", strikes: String(lc), entrada_tipo: "DEBITO",  defaultHint: "Long Call (débito)" });
    // Puts
    legs.push({ pata: "SHORT", tipo_opcion: "PUT",  strikes: String(sp), entrada_tipo: "CREDITO", defaultHint: "Short Put (crédito)" });
    legs.push({ pata: "LONG",  tipo_opcion: "PUT",  strikes: String(lp), entrada_tipo: "DEBITO",  defaultHint: "Long Put (débito)" });
    return legs;
  }

  return [];
}

function renderLegsTable() {
  if (!legsTable) return;
  if (!multiLegEnabled?.checked) {
    legsTable.innerHTML = "";
    return;
  }
  if (!multiLegDraft.length) {
    legsTable.innerHTML = `<div style="padding:8px; opacity:.8;">Escribe los strikes y toca <b>Generar patas</b>.</div>`;
    return;
  }

  const rows = multiLegDraft
    .map((l, i) => {
      const hint = escHtml(l.defaultHint || "");
      const pataTxt = escHtml(l.pata);
      const tipoTxt = escHtml(l.tipo_opcion);
      const strikeTxt = escHtml(l.strikes);
      const et = escHtml(l.entrada_tipo);
      const val = l.entryPrice != null ? String(l.entryPrice) : "";
      return `
        <tr>
          <td style="white-space:nowrap;"><b>${pataTxt}</b></td>
          <td style="white-space:nowrap;">${tipoTxt}</td>
          <td style="white-space:nowrap;">${strikeTxt}</td>
          <td style="white-space:nowrap;">${et}</td>
          <td style="min-width:140px;">
            <input data-leg-idx="${i}" class="legEntry" type="number" step="0.01" placeholder="precio" value="${escHtml(val)}" style="width:100%; padding:8px; border-radius:10px; border:1px solid rgba(0,0,0,.2);" />
            <div style="font-size:12px; opacity:.75; margin-top:4px;">${hint}</div>
          </td>
        </tr>
      `;
    })
    .join("");

  legsTable.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:13px; min-width:520px;">
      <thead style="opacity:.85;">
        <tr>
          <th style="text-align:left; padding:6px 6px;">Pata</th>
          <th style="text-align:left; padding:6px 6px;">Tipo</th>
          <th style="text-align:left; padding:6px 6px;">Strike</th>
          <th style="text-align:left; padding:6px 6px;">Entrada</th>
          <th style="text-align:left; padding:6px 6px;">Precio entrada</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  // capture inputs
  legsTable.querySelectorAll(".legEntry").forEach((inp) => {
    inp.addEventListener("input", (ev) => {
      const el = ev.target;
      const idx = Number(el.getAttribute("data-leg-idx"));
      if (!Number.isFinite(idx) || !multiLegDraft[idx]) return;
      multiLegDraft[idx].entryPrice = el.value;
    });
  });
}

function refreshMultiLegVisibility() {
  const stratId = safeUpper(estrategia?.value || "");
  const isEligible = isMultiLegEligibleStrategy(stratId);
  if (multiLegWrap) multiLegWrap.style.display = isEligible ? "block" : "none";

  // Neto y multi-leg son mutuamente excluyentes
  if (!isEligible) {
    if (multiLegEnabled) multiLegEnabled.checked = false;
    multiLegDraft = [];
    renderLegsTable();
    return;
  }

  if (netMode?.checked && multiLegEnabled?.checked) {
    multiLegEnabled.checked = false;
    multiLegDraft = [];
    renderLegsTable();
  }
}

estrategia?.addEventListener("change", refreshMultiLegVisibility);
estrategia?.addEventListener("change", syncCCComboVisibility);
netMode?.addEventListener("change", () => {
  // si neto se activa, apagar multi
  if (netMode.checked && multiLegEnabled) {
    multiLegEnabled.checked = false;
    multiLegDraft = [];
    renderLegsTable();
  }
});

multiLegEnabled?.addEventListener("change", () => {
  if (multiLegEnabled.checked && netMode) netMode.checked = false;
  if (!multiLegEnabled.checked) multiLegDraft = [];

  const on = !!multiLegEnabled.checked;
  // Evitar confusión: en multi-patas siempre abrimos
  if (on) {
    if (accion) accion.value = "OPEN";
    if (estado) estado.value = "OPEN";
  }
  // Deshabilitar campos que se vuelven “por pata”
  [pata, tipo_opcion, accion, entrada_tipo, credito_debito, salida_tipo, credito_debito_salida].forEach((el) => {
    if (!el) return;
    el.disabled = on;
  });

  renderLegsTable();
});

genLegsBtn?.addEventListener("click", () => {
  const stratId = safeUpper(estrategia?.value || "");
  const legs = parseStrikesToLegs(stratId, strikes?.value || "");
  if (!legs.length) {
    alert("No pude entender los strikes. Usa por ejemplo: PCS 440/435 o IC 450/455/430/425.");
    return;
  }
  multiLegDraft = legs.map((x) => ({ ...x, entryPrice: "" }));
  renderLegsTable();
});

// ---------- JSONP GET (sin CORS) ----------
function apiGetJSONP() {
  return new Promise((resolve, reject) => {
    const cb = `__cb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

    window[cb] = (data) => {
      try {
        resolve(data);
      } finally {
        delete window[cb];
        script.remove();
      }
    };

    const script = document.createElement("script");
    script.src = `${API_URL}?callback=${cb}&_=${Date.now()}`;
    script.onerror = () => {
      delete window[cb];
      script.remove();
      reject(new Error("JSONP falló (no se pudo cargar el script)."));
    };

    document.body.appendChild(script);
  });
}

// ---------- POST sin CORS ----------
async function apiPostNoCORS(payload) {
  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
}

// ---------- listeners ----------
credito_debito?.addEventListener("input", calcularResultadoFromInputs);
credito_debito_salida?.addEventListener("input", calcularResultadoFromInputs);
contratos?.addEventListener("input", calcularResultadoFromInputs);
entrada_tipo?.addEventListener("change", calcularResultadoFromInputs);
salida_tipo?.addEventListener("change", calcularResultadoFromInputs);

historyRange?.addEventListener("change", () => cargarTrades());
brokerFilter?.addEventListener("change", () => cargarTrades());
tickerSearch?.addEventListener("input", () => cargarTrades());
statusView?.addEventListener("change", () => cargarTrades());
viewMode?.addEventListener("change", () => cargarTrades());

// ---------- Reparar (cierra fantasmas en Google Sheet) ----------
repairBtn?.addEventListener("click", async () => {
  try {
    // Usamos el último estado calculado para evitar inconsistencias
    const st = window.__lastJournalState;
    if (!st || !Array.isArray(st.items)) {
      await cargarTrades();
    }
    const state = window.__lastJournalState;
    const items = (state && Array.isArray(state.items)) ? state.items : [];

    // Fantasmas: eventos OPEN que ya no están realmente abiertos
    const ghosts = items.filter(t => (t._estado === "OPEN") && !t._isReallyOpen && !!t._rowNum);

    if (!ghosts.length) {
      alert("No encontré patas fantasmas para reparar (en el rango actual). ✅");
      return;
    }

    const preview = ghosts
      .slice(0, 12)
      .map(g => `${g._tickerUp} | pos:${g._posId} | pata:${g._pata} | exp:${normalizarFecha(g.expiracion)||"—"} | strike:${g.strikes||"—"}`)
      .join("\n");

    const ok = confirm(
      `Encontré ${ghosts.length} pata(s) fantasma(s).\n\n` +
      `Esto va a marcar ESOS OPEN como CLOSED en Google Sheet (sin tocar PnL).\n\n` +
      `Muestra (máx 12):\n${preview}\n\n` +
      `¿Reparar ahora?`
    );
    if (!ok) return;

    for (const g of ghosts) {
      // Editar la fila original (no creamos un evento nuevo)
      const payload = {
        ...g,
        _row: g._rowNum,
        force_new: false,
        estado: "CLOSED",
        cierre_fecha: todayLocalISO(),
        // No tocamos resultado ni precios para no distorsionar PnL
        notas: (g.notas || "") + " [REPAIR: marcado CLOSED]",
      };
        await apiPostNoCORS(cleanPayload(payload));
    }

    alert(`Listo ✅ Reparé ${ghosts.length} pata(s). Recargando...`);
    setTimeout(cargarTrades, 750);
  } catch (err) {
    console.error(err);
    alert("No se pudo ejecutar Reparar. Mira la consola.");
  }
});

// ---------- submit ----------
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  calcularResultadoFromInputs();

  const cat = safeUpper(categoria?.value || "");
  const stratId = estrategia?.value || "";
  const strat = getStrategyByCatId(cat, stratId);

  if (!broker?.value) {
    alert("Selecciona el Broker.");
    return;
  }
  if (!cat || !stratId || !strat) {
    alert("Selecciona Categoría y Estrategia.");
    return;
  }

  // Defaults pata/accion
  const stratKey = safeUpper(strat.id);
  let accionVal = safeUpper(accion?.value || "OPEN");
  let pataVal = safeUpper(pata?.value || "");

  // Modo NETO (1 precio) => guardamos como una sola "pata" SPREAD
  if (netMode?.checked && isMultiLegNettableStrategyId(stratKey)) {
    if (accionVal === "ROLL_CLOSE" || accionVal === "ROLL_OPEN") {
      alert("En modo NETO no se usa ROLL. Desmarca NETO o guarda pata por pata.");
      return;
    }
    pataVal = "SPREAD";
    if (tipo_opcion) tipo_opcion.value = "";
  }

  // Para DIAGONAL/CC default SHORT; para spreads también
    if (!pataVal && (stratKey === "DIAGONAL" || stratKey === "CC" || stratKey === "CSP" || stratKey === "PCS" || stratKey === "CCS" || stratKey === "IC" || stratKey === "IB")) pataVal = "SHORT";

  let posIdVal = (position_id?.value || "").trim();

  // Generar position_id para DIAGONAL/CC/SPREADS cuando abres
    const needsPos = (stratKey === "DIAGONAL" || stratKey === "CC" || stratKey === "CSP" || stratKey === "PCS" || stratKey === "CCS" || stratKey === "IC" || stratKey === "IB");
    if (!posIdVal && accionVal === "OPEN" && needsPos) {
      posIdVal = generatePositionId({
      tk: safeUpper(ticker?.value || "TICKER"),
      stratId: stratKey,
      fechaISO: fecha?.value || todayLocalISO(),
    });
    if (position_id) position_id.value = posIdVal;
  }

  
  // ===== CC Combo (abre SHORT CALL + STOCK en 1 paso) =====
  const ccComboOn = (stratKey === "CC" && !!ccComboEnabled?.checked);

  if (ccComboOn) {
    // Solo crear (no editar) y solo OPEN
    if (editRow != null) {
      alert("CC Combo solo funciona para CREAR una nueva posición (no editar).");
      return;
    }
    if (accionVal !== "OPEN") {
      alert("CC Combo solo soporta ACCIÓN=OPEN.");
      return;
    }
    if (safeUpper(estado?.value || "OPEN") !== "OPEN") {
      alert("CC Combo es para abrir. Estado debe ser OPEN.");
      return;
    }

    const shortPx = Number(ccShortPrice?.value);
    const stockPx = Number(ccStockPrice?.value);
    const qtyOpt = Number(contratos?.value);

    if (!Number.isFinite(shortPx) || shortPx <= 0) {
      alert("Falta el precio del short call (crédito).");
      return;
    }
    if (!Number.isFinite(stockPx) || stockPx <= 0) {
      alert("Falta el precio de las acciones (compra).");
      return;
    }
    if (!Number.isFinite(qtyOpt) || qtyOpt <= 0) {
      alert("Contratos inválidos. Ej: 1");
      return;
    }

    // Acciones = contratos * 100
    const qtyStock = qtyOpt * 100;

    // Validación mínima para el short call
    if (!expiracion?.value) {
      const ok = confirm("No veo expiración. ¿Quieres guardar el CC Combo sin expiración?");
      if (!ok) return;
    }
    if (!(String(strikes?.value || "").trim())) {
      const ok = confirm("No veo strike(s). ¿Quieres guardar el CC Combo sin strike?");
      if (!ok) return;
    }

    // Asegurar position_id
    if (!posIdVal) {
      posIdVal = generatePositionId({
        tk: safeUpper(ticker?.value || "TICKER"),
        stratId: stratKey,
        fechaISO: fecha?.value || todayLocalISO(),
      });
      if (position_id) position_id.value = posIdVal;
    }

    const common = {
      fecha: fecha?.value || "",
      hora: hora?.value || "",
      ticker: safeUpper(ticker?.value || ""),
      broker: broker?.value || "",

      categoria: cat,
      estrategia_id: strat.id,
      estrategia: strat.label,
      sesgo: strat.sesgo,
      tipo: strat.tipo,

      estado: "OPEN",
      cierre_fecha: "",

      position_id: posIdVal,
      roll_group_id: "",
      force_new: true,
      _row: null,

      notas: notas?.value || "",
    };

    // 1) SHORT CALL
    const shortLeg = {
      ...common,
      pata: "SHORT",
      tipo_opcion: "CALL",
      accion: "OPEN",
      expiracion: expiracion?.value || "",
      strikes: String(strikes?.value || "").trim(),
      entrada_tipo: "CREDITO",
      credito_debito: shortPx.toFixed(2),
      salida_tipo: "DEBITO",
      credito_debito_salida: "",
      contratos: qtyOpt,
      resultado: "",
    };

    // 2) STOCK (compra)
    const stockLeg = {
      ...common,
      pata: "STOCK",
      tipo_opcion: "",
      accion: "BUY_STOCK",
      expiracion: "",
      strikes: "",
      entrada_tipo: "DEBITO",
      credito_debito: stockPx.toFixed(2),
      salida_tipo: "CREDITO",
      credito_debito_salida: "",
      contratos: qtyStock, // shares
      resultado: "",
    };

    try {
      await apiPostNoCORS(cleanPayload(shortLeg));
      await apiPostNoCORS(cleanPayload(stockLeg));

      // Reset
      form.reset();
      setFechaHoy();
      setHoraAhora();
      if (accion) accion.value = "OPEN";
      if (entrada_tipo) entrada_tipo.value = "CREDITO";
      if (salida_tipo) salida_tipo.value = "DEBITO";
      if (position_id) position_id.value = "";
      if (roll_group_id) roll_group_id.value = "";
      if (tipo_opcion) tipo_opcion.value = "";

      // Limpia CC combo
      if (ccComboEnabled) ccComboEnabled.checked = false;
      if (ccShortPrice) ccShortPrice.value = "";
      if (ccStockPrice) ccStockPrice.value = "";

      syncTipoOpcionVisibility();
      syncNetModeVisibility();
      syncCCComboVisibility();
      renderEstrategiasForCategoria("");

      setTimeout(cargarTrades, 650);
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar CC Combo. Mira la consola.");
    }
    return; // ✅ no seguir al guardado normal
  }

// ===== Multi-patas (1 trade => varias filas) =====
  const multiOn = !!(multiLegEnabled?.checked && isMultiLegEligibleStrategy(stratKey) && !netMode?.checked);
  if (multiOn) {
    // Solo creación (no edición) y solo OPEN
    if (editRow != null) {
      alert("Multi-patas solo funciona para CREAR nuevos trades (no editar).\nCrea uno nuevo o desmarca Multi-patas.");
      return;
    }
    if (accionVal !== "OPEN") {
      alert("Multi-patas solo soporta ACCIÓN=OPEN. Para cerrar, usa 'Cerrar pata' en la lista.");
      return;
    }
    if (safeUpper(estado?.value || "OPEN") !== "OPEN") {
      alert("Multi-patas es para abrir. Para cerrar, usa 'Cerrar pata'.");
      return;
    }

    // Generar patas si no están generadas todavía
    if (!multiLegDraft.length) {
      const legs = parseStrikesToLegs(stratKey, strikes?.value || "");
      if (!legs.length) {
        alert("No pude entender los strikes. Usa por ejemplo: PCS 440/435 o IC 450/455/430/425.");
        return;
      }
      multiLegDraft = legs.map((x) => ({ ...x, entryPrice: "" }));
      renderLegsTable();
      alert("Te generé las patas. Ahora llena el precio de entrada por pata y vuelve a Guardar.");
      return;
    }

    // Validar precios por pata
    const missing = multiLegDraft.filter((l) => !(String(l.entryPrice ?? "").trim()));
    if (missing.length) {
      alert("Faltan precios de entrada en una o más patas.\nLlena todos los precios y guarda.");
      return;
    }

    // Crear una fila por pata
    const common = {
      fecha: fecha?.value || "",
      hora: hora?.value || "",
      ticker: safeUpper(ticker?.value || ""),
      broker: broker?.value || "",

      categoria: cat,
      estrategia_id: strat.id,
      estrategia: strat.label,
      sesgo: strat.sesgo,
      tipo: strat.tipo,

      expiracion: expiracion?.value || "",
      contratos: contratos?.value || "",

      salida_tipo: "DEBITO",
      credito_debito_salida: "",
      resultado: "",

      notas: notas?.value || "",

      estado: "OPEN",
      cierre_fecha: "",

      position_id: posIdVal,
      accion: "OPEN",
      roll_group_id: "",
      force_new: true,

      _row: null,
    };

    try {
      for (const leg of multiLegDraft) {
        const payload = {
          ...common,
          pata: safeUpper(leg.pata),
          tipo_opcion: safeUpper(leg.tipo_opcion),
          strikes: String(leg.strikes || "").trim(),
          entrada_tipo: safeUpper(leg.entrada_tipo),
          credito_debito: String(leg.entryPrice).trim(),
        };
          await apiPostNoCORS(cleanPayload(payload));
      }

      // Reset
      form.reset();
      setFechaHoy();
      setHoraAhora();
      if (accion) accion.value = "OPEN";
      if (entrada_tipo) entrada_tipo.value = "CREDITO";
      if (salida_tipo) salida_tipo.value = "DEBITO";
      if (position_id) position_id.value = "";
      if (tipo_opcion) tipo_opcion.value = "";
      if (netMode) netMode.checked = false;
      if (multiLegEnabled) multiLegEnabled.checked = false;
      multiLegDraft = [];
      renderLegsTable();
      syncTipoOpcionVisibility();
      syncNetModeVisibility();
      renderEstrategiasForCategoria("");

      setTimeout(cargarTrades, 650);
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar multi-patas. Mira la consola.");
    }
    return; // ✅ important: no seguir con guardado normal
  }

  const est = safeUpper(estado?.value || "OPEN");
  const trade = {
    fecha: fecha?.value || "",
    hora: hora?.value || "",
    ticker: safeUpper(ticker?.value || ""),
    broker: broker?.value || "",

    categoria: cat,
    estrategia_id: strat.id,
    estrategia: strat.label,
    sesgo: strat.sesgo,
    tipo: strat.tipo,

    expiracion: expiracion?.value || "",
    strikes: strikes?.value || "",
    tipo_opcion: safeUpper(tipo_opcion?.value || ""), // CALL / PUT (vacío si STOCK)

    entrada_tipo: safeUpper(entrada_tipo?.value || "CREDITO"),
    credito_debito: credito_debito?.value || "",

    salida_tipo: safeUpper(salida_tipo?.value || "DEBITO"),
    credito_debito_salida: credito_debito_salida?.value || "",

    contratos: contratos?.value || "",
    resultado: resultado?.value || "",

    notas: notas?.value || "",

    estado: est,
    cierre_fecha: est === "CLOSED" ? todayLocalISO() : "",

    // nuevo
    position_id: posIdVal,
    pata: pataVal,
    accion: accionVal,
    roll_group_id: (roll_group_id?.value || "").trim(),
    force_new: false,

    _row: editRow,
  };

  try {
    await apiPostNoCORS(trade);

    salirModoEdicion();
    form.reset();
    setFechaHoy();
    setHoraAhora();

    if (entrada_tipo) entrada_tipo.value = "CREDITO";
    if (salida_tipo) salida_tipo.value = "DEBITO";
    if (accion) accion.value = "OPEN";
    if (position_id) position_id.value = "";
    if (roll_group_id) roll_group_id.value = "";
    if (tipo_opcion) tipo_opcion.value = "";
    syncTipoOpcionVisibility();
    calcularResultadoFromInputs();

    if (categoria) categoria.value = "";
    renderEstrategiasForCategoria("");
    syncNetModeVisibility();

    setTimeout(cargarTrades, 650);
  } catch (err) {
    console.error(err);
    alert(`No se pudo guardar: ${err.message}`);
  }
});

cancelBtn?.addEventListener("click", () => {
  salirModoEdicion();
  form.reset();
  setFechaHoy();
  setHoraAhora();

  if (entrada_tipo) entrada_tipo.value = "CREDITO";
  if (salida_tipo) salida_tipo.value = "DEBITO";
  if (accion) accion.value = "OPEN";
  if (position_id) position_id.value = "";
  if (roll_group_id) roll_group_id.value = "";
  if (tipo_opcion) tipo_opcion.value = "";
  syncTipoOpcionVisibility();
  calcularResultadoFromInputs();

  if (categoria) categoria.value = "";
  renderEstrategiasForCategoria("");
  syncNetModeVisibility();
});

// ---------- UI actions: crear evento CLOSE desde un OPEN ----------
async function closeLegFromOpen(openTrade) {
  const posId = String(openTrade.position_id || openTrade._posId || "").trim();
  const leg = safeUpper(openTrade.pata || openTrade._pata || "");
  if (!posId || !leg) {
    alert("Este OPEN no tiene position_id/pata. Asegúrate de guardarlo con esos campos.");
    return;
  }

  const salidaPrecio = prompt("Precio de salida para cerrar esta pata (ej: 0.08)", "");
  if (salidaPrecio === null) return;

    const suggestedClose = (String(openTrade.entrada_tipo || "").toUpperCase() === "DEBITO") ? "CREDITO" : "DEBITO";

  const salidaTipoIn = prompt("Salida tipo: DEBITO o CREDITO", suggestedClose);
  if (salidaTipoIn === null) return;
  const salidaTipo = safeUpper(salidaTipoIn) === "CREDITO" ? "CREDITO" : "DEBITO";

    const payload = {
        ...openTrade,
        _row: null,
        force_new: true,

        // ✅ usa fecha/hora de cierre reales
        fecha: todayLocalISO(),
        hora: getHoraAhoraHHMM(),

        // ✅ fuerza claves
        position_id: posId,
        pata: leg,

        accion: "CLOSE",
        estado: "CLOSED",
        cierre_fecha: todayLocalISO(),

        salida_tipo: salidaTipo,
        credito_debito_salida: salidaPrecio,

        resultado: "",
    };

    payload.resultado = computeEventPnL(payload);

    // ✅ IMPORTANTÍSIMO: mandar limpio
    await apiPostNoCORS(cleanPayload(payload));

}

// ---------- UI actions: roll pata (crea 2 eventos) ----------
async function rollLegFromOpen(openTrade) {
  const posId = String(openTrade.position_id || openTrade._posId || "").trim();
  const leg = safeUpper(openTrade.pata || openTrade._pata || "");
  if (!posId || !leg) {
    alert("Este OPEN no tiene position_id/pata. Asegúrate de guardarlo con esos campos.");
    return;
  }

  const rg = `ROLL-${Date.now().toString(36).toUpperCase()}`;

  const closePrice = prompt("ROLL - Precio para cerrar (BTC) (ej: 0.12)", "");
  if (closePrice === null) return;

  const closeTypeIn = prompt("ROLL - Tipo cierre: DEBITO o CREDITO", "DEBITO");
  if (closeTypeIn === null) return;
  const closeType = safeUpper(closeTypeIn) === "CREDITO" ? "CREDITO" : "DEBITO";

  const newExp = prompt("ROLL - Nueva expiración (YYYY-MM-DD)", normalizarFecha(openTrade.expiracion) || "");
  if (newExp === null) return;

  const newStrikes = prompt("ROLL - Nuevo strike(s) (ej: 240)", openTrade.strikes || "");
  if (newStrikes === null) return;

  const newEntryPrice = prompt("ROLL - Precio nuevo (ej: 0.35)", "");
  if (newEntryPrice === null) return;

  const newEntryTypeIn = prompt("ROLL - Entrada tipo: CREDITO o DEBITO", "CREDITO");
  if (newEntryTypeIn === null) return;
  const newEntryType = safeUpper(newEntryTypeIn) === "DEBITO" ? "DEBITO" : "CREDITO";

  const rollClose = {
    ...openTrade,
    _row: null,
    force_new: true,
    accion: "ROLL_CLOSE",
    roll_group_id: rg,
    estado: "CLOSED",
    cierre_fecha: todayLocalISO(),
    salida_tipo: closeType,
    credito_debito_salida: closePrice,
    resultado: "",
  };
  rollClose.resultado = computeEventPnL(rollClose);

  const rollOpen = {
    ...openTrade,
    _row: null,
    force_new: true,
    accion: "ROLL_OPEN",
    roll_group_id: rg,
    estado: "OPEN",
    cierre_fecha: "",
    expiracion: newExp,
    strikes: newStrikes,
    entrada_tipo: newEntryType,
    credito_debito: newEntryPrice,
    salida_tipo: "DEBITO",
    credito_debito_salida: "",
    resultado: "",
  };

// Forzar campos clave + limpiar payload
rollClose.position_id = posId;
rollClose.pata = leg;
rollClose.hora = getHoraAhoraHHMM();

// Asegura que el ROLL_OPEN quede después del ROLL_CLOSE en el timeline
const dtmp = new Date();
dtmp.setMinutes(dtmp.getMinutes() + 1);
const hh2 = String(dtmp.getHours()).padStart(2, "0");
const mm2 = String(dtmp.getMinutes()).padStart(2, "0");
rollOpen.position_id = posId;
rollOpen.pata = leg;
rollOpen.hora = `${hh2}:${mm2}`;

await apiPostNoCORS(cleanPayload(rollClose));
await apiPostNoCORS(cleanPayload(rollOpen));

}


// ---------- UI actions: cerrar TODAS las patas abiertas de una posición ----------
async function closeAllLegsSequential(openLegs, label = "") {
  const legs = Array.isArray(openLegs) ? openLegs.filter(Boolean) : [];
  if (!legs.length) {
    alert("No hay patas abiertas para cerrar.");
    return;
  }

  const title = label ? `\n\n${label}` : "";
  if (!confirm(`Vas a cerrar ${legs.length} pata(s) una por una.${title}\n\n¿Continuar?`)) return;

  // Cerramos en orden: SHORT primero, luego LONG, luego lo demás (por orden natural)
  const orderRank = (p) => {
    const x = String(p || "").toUpperCase();
    if (x === "SHORT" || x === "SHORT_CALL" || x === "SHORT_PUT") return 1;
    if (x === "LONG" || x === "LONG_CALL" || x === "LONG_PUT") return 2;
    if (x === "SPREAD") return 3;
    return 4;
  };

  legs.sort((a, b) => orderRank(a._pata || a.pata) - orderRank(b._pata || b.pata));

  for (const leg of legs) {
    try {
      // closeLegFromOpen ya pide precio y tipo de salida y calcula PnL
      await closeLegFromOpen(leg);
    } catch (err) {
      console.error(err);
      alert("Se detuvo el cierre en lote por un error. Revisa consola.");
      return;
    }
  }
}




// ---------- NETO: cerrar TODAS las patas abiertas con 1 solo precio ----------
async function closeAllLegsNet(openLegs, groupMeta = {}) {
  const legs = Array.isArray(openLegs) ? openLegs.filter(Boolean) : [];
  if (!legs.length) {
    alert("No hay patas abiertas para cerrar.");
    return;
  }

  // Si ya es NETO (pata=SPREAD) y solo hay una, usamos el cierre normal (1 prompt)
  if (legs.length === 1 && safeUpper(legs[0]._pata || legs[0].pata) === "SPREAD") {
    await closeLegFromOpen(legs[0]);
    return;
  }

  const posId = String(groupMeta.position_id || legs[0].position_id || legs[0]._posId || "").trim();
  const tk = String(groupMeta.ticker || legs[0].ticker || legs[0]._tickerUp || "").trim();
  const title = `${tk || ""} • ${posId || ""}`.trim();

  const signedEntry = (e) => {
    const px = Number(e.credito_debito || 0);
    const et = safeUpper(e.entrada_tipo || "CREDITO");
    return et === "DEBITO" ? -px : px;
  };

  const netEntry = legs.reduce((s, e) => s + signedEntry(e), 0);
  const qty = Number(legs[0].contratos || 1) || 1;

  const netOutStr = prompt(
    `Cerrar TODAS NETO (1 precio)\n${title}\n\nEntrada neta: ${netEntry.toFixed(2)}\nQty: ${qty}\n\nPrecio neto de salida (ej: 1.20):`,
    ""
  );
  if (netOutStr === null) return;

  const netOut = Number(netOutStr);
  if (!Number.isFinite(netOut) || netOut < 0) {
    alert("Precio de salida inválido.");
    return;
  }

  const suggestedOut = netEntry >= 0 ? "DEBITO" : "CREDITO";
  const outTypeIn = prompt("Tipo de salida: DEBITO o CREDITO", suggestedOut);
  if (outTypeIn === null) return;
  const outType = safeUpper(outTypeIn) === "CREDITO" ? "CREDITO" : "DEBITO";

  if (!confirm(`Confirmar cierre NETO de TODAS las patas (${legs.length})?\n${title}`)) return;

  const legsSummary = legs.map((e) => {
    const p = safeUpper(e._pata || e.pata || "");
    const to = safeUpper(e._tipoOpcion || e.tipo_opcion || "");
    const st = String(e.strikes || "").trim();
    return `${p}${to ? "-" + to : ""}:${st || "—"}`;
  }).join(" | ");

  const entradaTipo = netEntry >= 0 ? "CREDITO" : "DEBITO";
  const entradaVal = Math.abs(netEntry);

  const payload = {
    ...legs[0],
    _row: null,
    force_new: true,

    position_id: posId || legs[0].position_id || legs[0]._posId || "",
    pata: "SPREAD",
    accion: "CLOSE_ALL_NET",
    estado: "CLOSED",
    cierre_fecha: todayLocalISO(),

    entrada_tipo: entradaTipo,
    credito_debito: entradaVal.toFixed(2),

    salida_tipo: outType,
    credito_debito_salida: netOut.toFixed(2),

    strikes: legsSummary,
    expiracion: legs[0].expiracion || "",

    contratos: qty,
    resultado: "",
    notas: (legs[0].notas || "") + " [Cierre NETO: todas]",
  };
  // Forzar campos clave (evita CLOSE que no mate el OPEN) + hora estable
  payload.position_id = posId;
  payload.pata = "SPREAD";
  payload.hora = getHoraAhoraHHMM();

  payload.resultado = computeEventPnL(payload);
  await apiPostNoCORS(cleanPayload(payload));
}

// ---------- Vista spreads (PCS) ----------
function renderSpreads(spreadGroups) {
  if (!list) return;
  list.innerHTML = "";

  const spreads = Object.values(spreadGroups).sort((a, b) =>
    (b.lastKey || "").localeCompare(a.lastKey || "")
  );

  spreads.forEach((g) => {
    const legs = [...g.legs].sort((x, y) => {
      if (x._pata === y._pata) return 0;
      if (x._pata === "SHORT") return -1;
      if (y._pata === "SHORT") return 1;
      return 0;
    });

    // PnL realizado (solo eventos CLOSED)
    let realized = 0;
    legs.forEach((e) => {
      if (e._estado === "CLOSED") realized += Number(e._resultadoNum || 0);
    });

    // Patas realmente abiertas
    const openLegs = legs.filter((e) => e._estado === "OPEN" && e._isReallyOpen);
    const isOpen = openLegs.length > 0;

    const stratId = String(legs[0]?.estrategia_id || "").toUpperCase();
    const openSpreadLeg = openLegs.find(e => (e._pata || "").toUpperCase() === "SPREAD") || null;
    // Si es PCS/CCS con patas separadas, mantenemos el botón neto existente.
    // Si se guardó en modo NETO (pata=SPREAD), cerraremos esa pata directamente.
    const canNetClose = isOpen && ((stratId === "PCS" || stratId === "CCS") || !!openSpreadLeg);

    const expCommon = legs[0]?.expiracion ? normalizarFecha(legs[0].expiracion) : "—";
    const qtyCommon = legs[0]?.contratos || "—";

    const li = document.createElement("li");
    li.innerHTML = `
      <div class="row1">
        <strong>${g.ticker}</strong> — ${g.estrategiaLabel} • ${prettyBroker(g.broker)}
        ${badgeEstrategiaId((legs[0]?.estrategia_id || "PCS"))}
        ${badgeTipo(legs[0]?.tipo || "CREDITO")}
        ${badgeDTE(legs[0]?.expiracion || expCommon)}
        ${badgeEstado(isOpen ? "OPEN" : "CLOSED", isOpen)}
        ${!isOpen ? badgePnL(realized) : ""}
      </div>

      <div class="row2">
        <small>
          Posición: <b>${g.position_id}</b><br/>
          Exp: <b>${expCommon}</b> | Qty: <b>${qtyCommon}</b> |
          Estado: <b>${isOpen ? "ABIERTO" : "CERRADO"}</b> |
          Realizado: <b>${fmtMoney(realized)}</b>
        </small>
      </div>

      <div class="rowBtns">
        <button type="button" class="toggle">Ver patas</button>
        ${isOpen ? '<button type="button" class="closeAllLegs">Cerrar todas</button>' : ""},
        ${isOpen ? '<button type="button" class="closeAllNet">Cerrar todas (Neto)</button>' : ""},
        ${canNetClose ? '<button type="button" class="closeSpreadNet">Cerrar Spread (Neto)</button>' : ""}
      </div>

      <div class="events" style="display:none; margin-top:8px;"></div>
    `;

    const eventsDiv = li.querySelector(".events");
    const toggleBtn = li.querySelector(".toggle");

    // Render patas/eventos
    eventsDiv.innerHTML = legs.map((e, idx) => {
      const exp = normalizarFecha(e.expiracion) || "—";
      const strike = e.strikes || "—";
      const leg = e._pata || "—";
      const act = e._accion || "—";
      const st = e._estado || "—";

      const openTag = (e._estado === "OPEN" && !e._isReallyOpen) ? " (ya cerrada)" : "";
      const canAct = (e._estado === "OPEN" && e._isReallyOpen);

      return `
        <div style="padding:8px 0; border-top:1px solid rgba(0,0,0,.08);">
          <div><b>${leg}</b> • ${act} • <b>${st}${openTag}</b></div>
          <div><small>
            Strike(s): <b>${strike}</b> | Exp: <b>${exp}</b> | Qty: <b>${e.contratos || "—"}</b>
            ${e._estado === "CLOSED" ? ` | PnL: <b>${fmtMoney(e._resultadoNum)}</b>` : ""}
          </small></div>
          <div style="margin-top:6px;">
            ${canAct ? `
              <button type="button" class="closeLeg" data-idx="${idx}">Cerrar pata</button>
              <button type="button" class="rollLeg" data-idx="${idx}">Roll pata</button>
            ` : ""}
          </div>
        </div>
      `;
    }).join("");

    // Toggle
    toggleBtn.addEventListener("click", () => {
      const isHidden = eventsDiv.style.display === "none";
      eventsDiv.style.display = isHidden ? "block" : "none";
      toggleBtn.textContent = isHidden ? "Ocultar patas" : "Ver patas";
    });


    // Cerrar todas las patas abiertas (una por una)
    const closeAllBtn = li.querySelector(".closeAllLegs");
    if (closeAllBtn) {
      closeAllBtn.addEventListener("click", async () => {
        const openLegsNow = legs.filter((e) => e._estado === "OPEN" && e._isReallyOpen);
        try {
          await closeAllLegsSequential(openLegsNow, `${g.ticker} • ${g.position_id}`);
          setTimeout(cargarTrades, 850);
        } catch (err) {
          console.error(err);
          alert("No se pudieron cerrar todas las patas.");
        }
      });
    }


const closeAllNetBtn = li.querySelector(".closeAllNet");
if (closeAllNetBtn) {
  closeAllNetBtn.addEventListener("click", async () => {
    const openLegsNow = legs.filter((e) => e._estado === "OPEN" && e._isReallyOpen);
    try {
      await closeAllLegsNet(openLegsNow, { ticker: g.ticker, position_id: g.position_id });
      setTimeout(cargarTrades, 850);
    } catch (err) {
      console.error(err);
      alert("No se pudo cerrar NETO (todas las patas).");
    }
  });
}

    // Delegación para cerrar/roll desde el listado de patas
    eventsDiv.addEventListener("click", async (ev) => {
      const el = ev.target;
      if (!(el instanceof HTMLElement)) return;

      const idxAttr = el.getAttribute("data-idx");
      if (idxAttr == null) return;

      const idx = Number(idxAttr);
      const legEvent = legs[idx];
      if (!legEvent) return;

      try {
        if (el.classList.contains("closeLeg")) {
          await closeLegFromOpen(legEvent);
          setTimeout(cargarTrades, 650);
        } else if (el.classList.contains("rollLeg")) {
          await rollLegFromOpen(legEvent);
          setTimeout(cargarTrades, 700);
        }
      } catch (err) {
        console.error(err);
        alert("No se pudo completar la acción.");
      }
    });

    // 👉 Cerrar Spread (Neto)
    const closeSpreadNetBtn = li.querySelector(".closeSpreadNet");
    if (closeSpreadNetBtn) {
      closeSpreadNetBtn.addEventListener("click", async () => {
        // Si la posición se guardó en modo NETO (pata=SPREAD), cerramos esa pata.
        if (openSpreadLeg) {
          try {
            await closeLegFromOpen(openSpreadLeg);
            setTimeout(cargarTrades, 700);
          } catch (err) {
            console.error(err);
            alert("No se pudo cerrar el spread neto.");
          }
          return;
        }

        // patas realmente abiertas
        const openLegsNow = legs.filter(e => e._estado === "OPEN" && e._isReallyOpen);

        const shortLeg = openLegsNow.find(e => (e._pata || "").toUpperCase() === "SHORT");
        const longLeg  = openLegsNow.find(e => (e._pata || "").toUpperCase() === "LONG");

        if (!shortLeg || !longLeg) {
          alert("Para cerrar neto se necesita SHORT y LONG abiertos.");
          return;
        }

        const shortEntry =
          Number(shortLeg.credito_debito || 0) *
          ((shortLeg.entrada_tipo || "").toUpperCase() === "DEBITO" ? -1 : 1);

        const longEntry =
          Number(longLeg.credito_debito || 0) *
          ((longLeg.entrada_tipo || "").toUpperCase() === "DEBITO" ? -1 : 1);

        const netEntry = shortEntry + longEntry;

        const netOutStr = prompt(
          `Cerrar PCS NETO\nEntrada neta: ${netEntry.toFixed(2)}\n\nPrecio neto de salida (ej: 1.20):`,
          ""
        );
        if (netOutStr === null) return;

        const netOut = Number(netOutStr);
        if (!Number.isFinite(netOut) || netOut < 0) {
          alert("Precio de salida inválido.");
          return;
        }

        if (!confirm(`Confirmar cierre NETO del spread ${g.ticker}?`)) return;

        const qty = Number(shortLeg.contratos || longLeg.contratos || 1) || 1;
        const entradaTipo = netEntry >= 0 ? "CREDITO" : "DEBITO";
const entradaVal = Math.abs(netEntry);
const salidaTipo = netEntry >= 0 ? "DEBITO" : "CREDITO";

const payload = {
  ...shortLeg,
  _row: null,
  force_new: true,

  position_id: g.position_id,
  pata: "SPREAD",
  accion: "CLOSE_SPREAD",
  estado: "CLOSED",
  cierre_fecha: todayLocalISO(),

  entrada_tipo: entradaTipo,
  credito_debito: entradaVal.toFixed(2),
  salida_tipo: salidaTipo,
  credito_debito_salida: netOut.toFixed(2),

  strikes: `S:${shortLeg.strikes}|L:${longLeg.strikes}`,
  expiracion: shortLeg.expiracion || longLeg.expiracion || "",

  contratos: qty,
  resultado: "",
  notas: (shortLeg.notas || "") + " [Cierre NETO]",
};

payload.hora = getHoraAhoraHHMM();
payload.resultado = computeEventPnL(payload);


        try {
            await apiPostNoCORS(cleanPayload(payload));
          setTimeout(cargarTrades, 700);
        } catch (err) {
          console.error(err);
          alert("No se pudo cerrar el spread neto.");
        }
      });
    }

    list.appendChild(li);
  });
}

function renderPositions(positionGroups) { 
  if (!list) return;
  list.innerHTML = "";

  const groups = Object.values(positionGroups).sort((a, b) =>
    (b.lastKey || "").localeCompare(a.lastKey || "")
  );

    groups.forEach((g) => {
        const legs = [...g.legs].sort((a, b) => {
            const ak = `${a._fechaISO} ${a._hora}`;
            const bk = `${b._fechaISO} ${b._hora}`;
            return bk.localeCompare(ak); // DESC
        });

        // PnL realizado (solo eventos CLOSED)
        let realized = 0;
        legs.forEach((e) => {
            if (e._estado === "CLOSED") realized += Number(e._resultadoNum || 0);
        });

        // Patas realmente abiertas
        const openLegs = legs.filter((e) => e._estado === "OPEN" && e._isReallyOpen);
        const isOpen = openLegs.length > 0;

        // Pata operativa: SHORT call (CC/PMCC)
        const currentShort =
            openLegs.find((e) => ["SHORT_CALL", "SHORT"].includes((e._pata || "").toUpperCase())) ||
            null;

        // Datos header (preferimos el SHORT actual)
        const exp = currentShort
            ? normalizarFecha(currentShort.expiracion)
            : (normalizarFecha(legs[0]?.expiracion) || "—");

        const strike = currentShort ? (currentShort.strikes || "—") : (legs[0]?.strikes || "—");
        const qty = currentShort ? (currentShort.contratos || "—") : (legs[0]?.contratos || "—");

        // Badges (por grupo)
        const stratId = String(legs[0]?.estrategia_id || "").toUpperCase();
        const tipo = legs[0]?.tipo || "";

        const li = document.createElement("li");
        li.innerHTML = `
      <div class="row1">
        <strong>${g.ticker}</strong> — ${g.estrategiaLabel} • ${prettyBroker(g.broker)}
        ${badgeEstrategiaId(stratId)}
        ${badgeTipo(tipo)}
        ${badgeDTE(exp)}
        ${badgeEstado(isOpen ? "OPEN" : "CLOSED", isOpen)}
      </div>

      <div class="row2">
        <small>
          Posición: <b>${g.position_id}</b><br/>
          Short: Strike(s): <b>${strike}</b> | Exp: <b>${exp}</b> | Qty: <b>${qty}</b> |
          Realizado: <b>${fmtMoney(realized)}</b>
        </small>
      </div>

      <div class="rowBtns">
        <button type="button" class="toggle">Ver eventos</button>
        ${isOpen ? '<button type="button" class="closeAllLegs">Cerrar todas</button>' : ""},
        ${ currentShort ? `<button type="button" class="closeShort">Cerrar short</button>` : "" },
        ${currentShort ? `<button type="button" class="rollShort">Roll short</button>` : ""}
      </div>

      <div class="events" style="display:none; margin-top:8px;"></div>
    `;

    const eventsDiv = li.querySelector(".events");
    const toggleBtn = li.querySelector(".toggle");

    // Timeline de eventos
    eventsDiv.innerHTML = legs.map((e, idx) => {
      const expi = normalizarFecha(e.expiracion) || "—";
      const openTag = (e._estado === "OPEN" && !e._isReallyOpen) ? " (ya cerrada)" : "";
      const canAct = (e._estado === "OPEN" && e._isReallyOpen);

      return `
        <div style="padding:8px 0; border-top:1px solid rgba(0,0,0,.08);">
          <div><b>${e._pata || "—"}</b> • ${e._accion || "—"} • <b>${e._estado}${openTag}</b></div>
          <div><small>
            Strike(s): <b>${e.strikes || "—"}</b> | Exp: <b>${expi}</b> | Qty: <b>${e.contratos || "—"}</b>
            ${e._estado === "CLOSED" ? ` | PnL: <b>${fmtMoney(e._resultadoNum)}</b>` : ""}
          </small></div>
          <div style="margin-top:6px;">
            ${canAct ? `
              <button type="button" class="closeLeg" data-idx="${idx}">Cerrar pata</button>
              <button type="button" class="rollLeg" data-idx="${idx}">Roll pata</button>
            ` : ""}
          </div>
        </div>
      `;
    }).join("");

    toggleBtn.addEventListener("click", () => {
      const hidden = eventsDiv.style.display === "none";
      eventsDiv.style.display = hidden ? "block" : "none";
      toggleBtn.textContent = hidden ? "Ocultar eventos" : "Ver eventos";
    });


    // Cerrar todas las patas abiertas (una por una)
    const closeAllBtn = li.querySelector(".closeAllLegs");
    if (closeAllBtn) {
      closeAllBtn.addEventListener("click", async () => {
        const openLegsNow = legs.filter((e) => e._estado === "OPEN" && e._isReallyOpen);
        try {
          await closeAllLegsSequential(openLegsNow, `${g.ticker} • ${g.position_id}`);
          setTimeout(cargarTrades, 850);
        } catch (err) {
          console.error(err);
          alert("No se pudieron cerrar todas las patas.");
        }
      });
    }

    // Acciones rápidas sobre el short actual
    const closeShortBtn = li.querySelector(".closeShort");
    if (closeShortBtn && currentShort) {
      closeShortBtn.addEventListener("click", async () => {
        try {
          await closeLegFromOpen(currentShort);
          setTimeout(cargarTrades, 650);
        } catch (err) {
          console.error(err);
          alert("No se pudo cerrar el short.");
        }
      });
    }

    const rollShortBtn = li.querySelector(".rollShort");
    if (rollShortBtn && currentShort) {
      rollShortBtn.addEventListener("click", async () => {
        try {
          await rollLegFromOpen(currentShort);
          setTimeout(cargarTrades, 700);
        } catch (err) {
          console.error(err);
          alert("No se pudo rolar el short.");
        }
      });
    }

    // Delegación para acciones dentro del timeline
    eventsDiv.addEventListener("click", async (ev) => {
      const el = ev.target;
      if (!(el instanceof HTMLElement)) return;

      const idxAttr = el.getAttribute("data-idx");
      if (idxAttr == null) return;

      const idx = Number(idxAttr);
      const legEvent = legs[idx];
      if (!legEvent) return;

      try {
        if (el.classList.contains("closeLeg")) {
          await closeLegFromOpen(legEvent);
          setTimeout(cargarTrades, 650);
        } else if (el.classList.contains("rollLeg")) {
          await rollLegFromOpen(legEvent);
          setTimeout(cargarTrades, 700);
        }
      } catch (err) {
        console.error(err);
        alert("No se pudo completar la acción.");
      }
    });

    list.appendChild(li); 
  });
}


   
// ---------- cargar trades ----------
async function cargarTrades() {
  try {
    const data = await apiGetJSONP();

    const rangeKey = historyRange?.value || "TODAY";
    const brokerKey = brokerFilter?.value || "ALL";
    const search = (tickerSearch?.value || "").trim().toUpperCase();

    if (listTitle) listTitle.textContent = rangeTitle(rangeKey);

    const items = [];
    (Array.isArray(data) ? data : []).forEach((t) => {
      const est = safeUpper(t.estado || "OPEN");
      if (est === "DELETED") return;

      const fechaISO = normalizarFecha(t.fecha);
      if (!fechaISO) return;
      if (!isWithinRange(fechaISO, rangeKey)) return;

      if (brokerKey !== "ALL" && String(t.broker || "") !== brokerKey) return;

      const tk = safeUpper(t.ticker || "");
      if (search && !tk.includes(search)) return;

let estrategiaIdNorm = t.estrategia_id || "";

// 🔁 Inferir desde el label si no existe
if (!estrategiaIdNorm && t.estrategia) {
  const found = findCatIdByLabel(t.estrategia);
  if (found) estrategiaIdNorm = found.id; // "PCS", "CC", etc.
}


      items.push({
        ...t,
        estrategia_id: estrategiaIdNorm,
        _fechaISO: fechaISO,
        _hora: normalizarHora(t.hora || t.fecha),
        _estado: est,
        _resultadoNum: parseFloat(t.resultado) || 0,
        _tickerUp: tk,
        _posId: String(t.position_id || "").trim(),
        _pata: safeUpper(t.pata || ""),
        _tipoOpcion: safeUpper(t.tipo_opcion || ""),
        _accion: safeUpper(t.accion || ""),
        _rowNum: t._row,
      });
    });

    // Orden DESC para mostrar, pero para timeline necesitamos ASC
    items.sort((a, b) => {
      const aKey = `${a._fechaISO} ${a._hora}`;
      const bKey = `${b._fechaISO} ${b._hora}`;
      return bKey.localeCompare(aKey);
    });

    // ===== Determinar "abiertas reales" con fallback =====
    const timeline = [...items].sort((a, b) => {
      const ak = `${a._fechaISO} ${a._hora}`;
      const bk = `${b._fechaISO} ${b._hora}`;
      return ak.localeCompare(bk);
    });

    function legKey(t) {
      return [
        (t._posId || "").trim(),
        (t._pata || "").trim(),
        (t._tipoOpcion || "").trim(),
        (normalizarFecha(t.expiracion) || "").trim(),
        String(t.strikes || "").trim(),
      ].join("|");
    }
    function legGroupKey(t) {
      return [
        (t._posId || "").trim(),
        (t._pata || "").trim(),
      ].join("|");
    }

    const openSet = new Set();
    const openStackByLeg = new Map();

timeline.forEach((t) => {
  if (!t._posId || !t._pata) return;

  const key = legKey(t);
  const gk = legGroupKey(t);

  const act = (t._accion || "").toUpperCase();
  const st = (t._estado || "").toUpperCase();

  // OPEN / ROLL_OPEN => abre una pata específica (por expiración+strike)
  if (st === "OPEN" && (act === "OPEN" || act === "ROLL_OPEN" || act === "" || act === "BUY_STOCK")) {
    openSet.add(key);
    const arr = openStackByLeg.get(gk) || [];
    if (!arr.includes(key)) arr.push(key); // ✅ anti-duplicado
    openStackByLeg.set(gk, arr);
  }

  // CLOSE / ROLL_CLOSE => cierra la ÚLTIMA pata abierta de ese (posId|pata)
    if (st === "CLOSED") {
        const arr = openStackByLeg.get(gk) || [];

        // 1) intenta cerrar EXACTAMENTE esta pata (mismo strike/exp/tipo)
        const idx = arr.lastIndexOf(key);
        if (idx !== -1) {
            arr.splice(idx, 1);
            openSet.delete(key);
            openStackByLeg.set(gk, arr);
        } else {
            // 2) fallback: si no matchea exacto, cierra la última abierta del grupo
            const last = arr.pop();
            if (last) openSet.delete(last);
            openStackByLeg.set(gk, arr);
        }
    }


    // ✅ cierres netos:
  // - CLOSE_SPREAD (legacy): mata 1 SHORT y 1 LONG (PCS/CCS)
  // - CLOSE_ALL_NET: mata TODAS las patas abiertas del position_id (PCS/CCS/IC/IB, etc.)
  if (st === "CLOSED" && (act === "CLOSE_SPREAD" || act === "CLOSE_ALL_NET")) {
    const pos = (t._posId || "").trim();
    if (!pos) return;

    if (act === "CLOSE_SPREAD") {
      ["SHORT", "LONG"].forEach((leg) => {
        const gk2 = `${pos}|${leg}`;
        const arr2 = openStackByLeg.get(gk2) || [];
        const last2 = arr2.pop();
        if (last2) openSet.delete(last2);
        openStackByLeg.set(gk2, arr2);
      });
      return;
    }

    // CLOSE_ALL_NET: limpiar todo lo que esté abierto bajo ese position_id
    for (const [gk2, arr2] of openStackByLeg.entries()) {
      if (!gk2.startsWith(pos + "|")) continue;
      while (arr2.length) {
        const last2 = arr2.pop();
        if (last2) openSet.delete(last2);
      }
      openStackByLeg.set(gk2, arr2);
    }
  }
});


    
    // Anotar _isReallyOpen para dashboard / vista trades
    items.forEach((t) => {
      const hasPos = !!(t._posId && t._pata);
      t._legKey = legKey(t);
      t._isReallyOpen = hasPos ? openSet.has(t._legKey) : (t._estado === "OPEN");
    });

    // Guardar ...
    window.__lastJournalState = {
      items: items.map((x) => ({ ...x })),
      loadedAt: Date.now(),
    };
// ===== SPREAD GROUPS (PCS) =====
    const spreadGroups = {};
    items.forEach((t) => {
      if (!isSpreadStrategyId(t.estrategia_id)) return;
      const posId = (t._posId || "").trim();
      if (!posId) return;

      if (!spreadGroups[posId]) {
        spreadGroups[posId] = {
          position_id: posId,
          ticker: t._tickerUp,
          broker: t.broker || "",
          estrategiaLabel: t.estrategia || "",
          lastKey: "",
          legs: [],
        };
      }

      const g = spreadGroups[posId];
      g.legs.push({ ...t, _isReallyOpen: openSet.has(legKey(t)) });

      const k = `${t._fechaISO} ${t._hora}`;
      if (k > g.lastKey) g.lastKey = k;
    });

// ===== POSITION GROUPS (CC + DIAGONAL/PMCC) =====
const positionGroups = {};
items.forEach((t) => {
  if (!isPositionStrategyId(t.estrategia_id)) return;

  const posId = (t._posId || "").trim();
  if (!posId) return; // si no hay position_id, no agrupamos aquí

  if (!positionGroups[posId]) {
    positionGroups[posId] = {
      position_id: posId,
      ticker: t._tickerUp,
      broker: t.broker || "",
      estrategiaLabel: t.estrategia || "",
      lastKey: "",
      legs: [],
    };
  }

  const g = positionGroups[posId];
  g.legs.push({ ...t, _isReallyOpen: openSet.has(legKey(t)) });

  const k = `${t._fechaISO} ${t._hora}`;
  if (k > g.lastKey) g.lastKey = k;
});


    // Dashboard KPIs
    try { renderDashboard(items); } catch (e) { console.warn('Dashboard error', e); }

    // ===== Render según modo =====
    const mode = viewMode?.value || "TRADES";
    if (mode === "SPREADS") {
      if (listTitle) listTitle.textContent = "🧩 Spreads (PCS)";
      renderSpreads(spreadGroups);
      return;
    }
if (mode === "POSITIONS") {
  if (listTitle) listTitle.textContent = "🧷 Posiciones (CC/PMCC)";
  renderPositions(positionGroups);
  return;
}



    // ===== Render trades =====
    if (list) list.innerHTML = "";

    // PnL del rango (solo CLOSED)
    let pnl = 0;
    items.forEach((t) => {
      if (t._estado === "CLOSED") pnl += t._resultadoNum;
    });

    const view = (statusView && statusView.value) ? statusView.value : "OPEN_ONLY";

    items.forEach((t) => {
      const key = legKey(t);
      const hasPos = !!(t._posId && t._pata);
      const isReallyOpen = hasPos ? openSet.has(key) : (t._estado === "OPEN");

      // Filtrado
      if (view === "OPEN_ONLY") {
        if (!(t._estado === "OPEN" && isReallyOpen)) return;
      }
      if (view === "CLOSED_ONLY") {
        if (t._estado !== "CLOSED") return;
      }

      const li = document.createElement("li");

      const openTag = (t._estado === "OPEN" && !isReallyOpen) ? " (ya cerrada)" : "";
      const isOpenEvent = (t._estado === "OPEN" && isReallyOpen);
      const closeLegBtnHtml = isOpenEvent ? `<button type="button" class="closeLeg">Cerrar pata</button>` : "";
      const rollLegBtnHtml = isOpenEvent ? `<button type="button" class="rollLeg">Roll pata</button>` : "";

      li.innerHTML = `
       <div class="row1">
         <strong>${t._tickerUp}</strong> — ${t.estrategia || ""} • ${prettyBroker(t.broker)}
         ${wrapBadges(
       [
         badgeEstrategiaId(t.estrategia_id),
         badgeTipo(t.tipo),
         badgeDTE(t.expiracion),
         badgeEstado(t._estado, isReallyOpen),
         (t._estado === "CLOSED" ? badgePnL(t._resultadoNum) : "")
       ].join("")
       )}
       </div>


        <div class="row2">
          <small>
            Posición: <b>${t._posId || "—"}</b><br/>
            Pata: <b>${t._pata || "—"}</b>
            ${t._tipoOpcion ? ` | Tipo: <b>${t._tipoOpcion}</b>` : ""}
            | Strike(s): <b>${t.strikes || "—"}</b> | Exp: <b>${normalizarFecha(t.expiracion) || "—"}</b>
          </small>
        </div>
        <div class="row3">
          <small>
            Entrada: <b>${(safeUpper(t.entrada_tipo) === "DEBITO" ? "-" : "+")}${t.credito_debito || "—"}</b>
            | Estado: <b>${t._estado}${openTag}</b>
            ${t._estado === "CLOSED" ? ' | PnL: <b>' + fmtMoney(t._resultadoNum) + '</b>' : ""}
          </small>
        </div>

        <div class="rowBtns">
          <button type="button" class="edit">Editar</button>
          ${closeLegBtnHtml}
          ${rollLegBtnHtml}
          <button type="button" class="del">Borrar</button>
        </div>
      `;
        

      // Editar
        li.querySelector(".edit").addEventListener("click", (ev) => {
            ev.stopPropagation();
            cargarTradeEnFormulario(t);

            // 👇 baja al formulario
            document.getElementById("tradeForm")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });

            // 👇 resalta el trade en la lista por 1.2s
            li.classList.add("flash-edit");
            setTimeout(() => li.classList.remove("flash-edit"), 1200);
        });


      // Cerrar pata
      const closeBtn = li.querySelector(".closeLeg");
      if (closeBtn) {
        closeBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            await closeLegFromOpen(t);
            setTimeout(cargarTrades, 1200);
          } catch (err) {
            console.error(err);
            alert("No se pudo cerrar la pata.");
          }
        });
      }

      // Roll pata
      const rollBtn = li.querySelector(".rollLeg");
      if (rollBtn) {
        rollBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            await rollLegFromOpen(t);
            setTimeout(cargarTrades, 700);
          } catch (err) {
            console.error(err);
            alert("No se pudo rolar la pata.");
          }
        });
      }

      // Borrar
      li.querySelector(".del").addEventListener("click", async (ev) => {
        ev.stopPropagation();

        if (!t._rowNum) {
          alert("Este trade es antiguo o no tiene referencia de fila. Bórralo desde Google Sheets.");
          return;
        }

        if (!confirm(`Borrar trade de ${t._tickerUp}?`)) return;

        const payload = { ...t, estado: "DELETED", _row: t._rowNum };
        try {
            await apiPostNoCORS(cleanPayload(payload));
          setTimeout(cargarTrades, 600);
        } catch (err) {
          console.error(err);
          alert("No se pudo borrar.");
        }
      });

      list.appendChild(li);
    });

    // pnl card
    if (pnlValue) pnlValue.textContent = "$" + pnl.toFixed(2);
    if (pnlCard) {
      pnlCard.classList.remove("positive", "negative", "neutral");
      if (pnl > 0) pnlCard.classList.add("positive");
      else if (pnl < 0) pnlCard.classList.add("negative");
      else pnlCard.classList.add("neutral");
    }
  } catch (err) {
    console.error(err);
    alert("Error cargando trades. Mira la consola.");
  }
}

// ---------- cargar trade en form ----------
function cargarTradeEnFormulario(t) {
  editRow = t._rowNum;

  if (fecha) fecha.value = normalizarFecha(t.fecha) || "";
  if (hora) hora.value = normalizarHora(t.hora);


  if (ticker) ticker.value = t.ticker || "";
  if (broker) broker.value = t.broker || "";

  let cat = safeUpper(t.categoria || "");
  let stratId = t.estrategia_id || "";

  if (!cat || !stratId) {
    const found = findCatIdByLabel(t.estrategia);
    if (found) {
      cat = found.cat;
      stratId = found.id;
    }
  }


  if (categoria) categoria.value = cat || "";
  renderEstrategiasForCategoria(cat || "", stratId || "");
  syncNetModeVisibility();

  if (position_id) position_id.value = t.position_id || "";
  if (pata) pata.value = safeUpper(t.pata || "");
  if (netMode) netMode.checked = (safeUpper(t.pata || "") === "SPREAD");
  if (tipo_opcion) tipo_opcion.value = safeUpper(t.tipo_opcion || "");
  syncTipoOpcionVisibility();
  if (accion) accion.value = safeUpper(t.accion || "OPEN");
  if (roll_group_id) roll_group_id.value = t.roll_group_id || "";

  if (estado) estado.value = safeUpper(t.estado || "OPEN");
  if (expiracion) expiracion.value = normalizarFecha(t.expiracion) || (t.expiracion || "");
  if (strikes) strikes.value = t.strikes || "";

  if (entrada_tipo) entrada_tipo.value = safeUpper(t.entrada_tipo || "CREDITO");
  if (credito_debito) credito_debito.value = t.credito_debito || "";

  if (salida_tipo) salida_tipo.value = safeUpper(t.salida_tipo || "DEBITO");
  if (credito_debito_salida) credito_debito_salida.value = t.credito_debito_salida || "";

  if (contratos) contratos.value = t.contratos || "";
  if (resultado) resultado.value = t.resultado || "";
  if (notas) notas.value = t.notas || "";

  if (saveBtn) saveBtn.textContent = "Guardar Cambios";

  calcularResultadoFromInputs();
}

// ---------- init ----------
setFechaHoy();
setHoraAhora();

if (entrada_tipo) entrada_tipo.value = "CREDITO";
if (salida_tipo) salida_tipo.value = "DEBITO";
if (accion) accion.value = "OPEN";
if (tipo_opcion) tipo_opcion.value = "";
syncTipoOpcionVisibility();

calcularResultadoFromInputs();
renderEstrategiasForCategoria(categoria?.value || "");
syncNetModeVisibility();
try { syncCCComboVisibility(); } catch (e) {}
try { refreshMultiLegVisibility(); } catch (e) {}
try { renderLegsTable(); } catch (e) {}

// --- Asegurar opción "POSITIONS" y renombrarla ---
(function ensurePositionsViewOption() {
  if (!viewMode) return;

  const opts = [...viewMode.options];
  let opt = opts.find(o => String(o.value).toUpperCase() === "POSITIONS");

  if (!opt) {
    opt = document.createElement("option");
    opt.value = "POSITIONS";
    viewMode.appendChild(opt);
  }

  // Renombrar (aunque ya existiera)
  opt.textContent = "Ver: Posiciones (CC/PMCC)";
})();

// Cargar al inicio
cargarTrades();

// Service worker: solo HTTPS o localhost



