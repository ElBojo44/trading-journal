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

function wrapBadges(htmlBadges) {
  return `<span style="float:right; display:flex; gap:6px; align-items:center; margin-top:2px;">${htmlBadges}</span>`;
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
  // Empezamos con PCS. Luego añadimos CCS/IC.
  return id === "PCS" || id === "PUT CREDIT SPREAD";
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
const accion = document.getElementById("accion");
const roll_group_id = document.getElementById("roll_group_id");

const estado = document.getElementById("estado");
const expiracion = document.getElementById("expiracion");
const strikes = document.getElementById("strikes");

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

function calcularResultadoFromInputs() {
  const qty = parseFloat(contratos?.value) || 0;
  const entradaSigned = toSignedAmount(entrada_tipo?.value, credito_debito?.value);
  const salidaSigned = toSignedAmount(salida_tipo?.value, credito_debito_salida?.value);

  if (!qty) {
    if (resultado) resultado.value = "";
    return;
  }

  const pnl = (entradaSigned + salidaSigned) * 100 * qty;
  if (resultado) resultado.value = Number.isFinite(pnl) ? pnl.toFixed(2) : "";
}

function computeEventPnL(tradeLike) {
  const qty = parseFloat(tradeLike.contratos) || 0;
  if (!qty) return "";
  const entradaSigned = toSignedAmount(tradeLike.entrada_tipo, tradeLike.credito_debito);
  const salidaSigned = toSignedAmount(tradeLike.salida_tipo, tradeLike.credito_debito_salida);
  const pnl = (entradaSigned + salidaSigned) * 100 * qty;
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

categoria?.addEventListener("change", () => renderEstrategiasForCategoria(categoria.value));

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

  // Para DIAGONAL/CC default SHORT; para spreads también
  if (!pataVal && (stratKey === "DIAGONAL" || stratKey === "CC" || stratKey === "PCS")) pataVal = "SHORT";

  let posIdVal = (position_id?.value || "").trim();

  // Generar position_id para DIAGONAL/CC/SPREADS cuando abres
  const needsPos = (stratKey === "DIAGONAL" || stratKey === "CC" || stratKey === "PCS");
  if (!posIdVal && accionVal === "OPEN" && needsPos) {
    posIdVal = generatePositionId({
      tk: safeUpper(ticker?.value || "TICKER"),
      stratId: stratKey,
      fechaISO: fecha?.value || todayLocalISO(),
    });
    if (position_id) position_id.value = posIdVal;
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
    calcularResultadoFromInputs();

    if (categoria) categoria.value = "";
    renderEstrategiasForCategoria("");

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
  calcularResultadoFromInputs();

  if (categoria) categoria.value = "";
  renderEstrategiasForCategoria("");
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

  const salidaTipoIn = prompt("Salida tipo: DEBITO o CREDITO", "DEBITO");
  if (salidaTipoIn === null) return;
  const salidaTipo = safeUpper(salidaTipoIn) === "CREDITO" ? "CREDITO" : "DEBITO";

  const payload = {
    ...openTrade,
    _row: null,
    force_new: true,

    accion: "CLOSE",
    estado: "CLOSED",
    cierre_fecha: todayLocalISO(),

    salida_tipo: salidaTipo,
    credito_debito_salida: salidaPrecio,

    resultado: "",
  };

  payload.resultado = computeEventPnL(payload);
  await apiPostNoCORS(payload);
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

  await apiPostNoCORS(rollClose);
  await apiPostNoCORS(rollOpen);
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
        ${isOpen ? '<button type="button" class="closeSpreadNet">Cerrar Spread (Neto)</button>' : ""}
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
        const pnl = (netEntry - netOut) * 100 * qty;

        const payload = {
          ...shortLeg,
          _row: null,
          force_new: true,

          position_id: g.position_id,
          pata: "SPREAD",
          accion: "CLOSE_SPREAD",
          estado: "CLOSED",
          cierre_fecha: todayLocalISO(),

          entrada_tipo: "CREDITO",
          credito_debito: netEntry.toFixed(2),
          salida_tipo: "DEBITO",
          credito_debito_salida: netOut.toFixed(2),

          strikes: `S:${shortLeg.strikes}|L:${longLeg.strikes}`,
          expiracion: shortLeg.expiracion || longLeg.expiracion || "",

          contratos: qty,
          resultado: pnl.toFixed(2),
          notas: (shortLeg.notas || "") + " [Cierre NETO]",
        };

        try {
          await apiPostNoCORS(payload);
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
        ${currentShort ? `<button type="button" class="closeShort">Cerrar short</button>` : ""}
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
        _hora: t.hora || "00:00",
        _estado: est,
        _resultadoNum: parseFloat(t.resultado) || 0,
        _tickerUp: tk,
        _posId: String(t.position_id || "").trim(),
        _pata: safeUpper(t.pata || ""),
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
  if (st === "OPEN" && (act === "OPEN" || act === "ROLL_OPEN" || act === "")) {
    openSet.add(key);
    const arr = openStackByLeg.get(gk) || [];
    arr.push(key);
    openStackByLeg.set(gk, arr);
  }

  // CLOSE / ROLL_CLOSE => cierra la ÚLTIMA pata abierta de ese (posId|pata)
  if (st === "CLOSED" && (act === "CLOSE" || act === "ROLL_CLOSE")) {
    const arr = openStackByLeg.get(gk) || [];
    const last = arr.pop();
    if (last) openSet.delete(last);
    openStackByLeg.set(gk, arr);
  }

  // ✅ cierre neto del spread: mata 1 SHORT y 1 LONG (últimos abiertos) para ese position_id
  if (st === "CLOSED" && act === "CLOSE_SPREAD") {
    const pos = (t._posId || "").trim();
    if (!pos) return;

    ["SHORT", "LONG"].forEach((leg) => {
      const gk2 = `${pos}|${leg}`;
      const arr2 = openStackByLeg.get(gk2) || [];
      const last2 = arr2.pop();
      if (last2) openSet.delete(last2);
      openStackByLeg.set(gk2, arr2);
    });
  }
}); // ✅ ESTE CIERRE ES EL QUE TE FALTA


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
            Pata: <b>${t._pata || "—"}</b> | Strike(s): <b>${t.strikes || "—"}</b> | Exp: <b>${normalizarFecha(t.expiracion) || "—"}</b>
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
      });

      // Cerrar pata
      const closeBtn = li.querySelector(".closeLeg");
      if (closeBtn) {
        closeBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          try {
            await closeLegFromOpen(t);
            setTimeout(cargarTrades, 650);
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
          await apiPostNoCORS(payload);
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
  if (hora) hora.value = t.hora || "";

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

  if (position_id) position_id.value = t.position_id || "";
  if (pata) pata.value = safeUpper(t.pata || "");
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

calcularResultadoFromInputs();
renderEstrategiasForCategoria(categoria?.value || "");

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
if ("serviceWorker" in navigator) {
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const isHttps = location.protocol === "https:";
  if (isHttps || isLocalhost) {
    navigator.serviceWorker.register("service-worker.js");
  }
}
