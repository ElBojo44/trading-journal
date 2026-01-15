let editRow = null;

const API_URL =
  "https://script.google.com/macros/s/AKfycbzfUqoRycuCihTOg5AsRB_f9VBh4EEw_SyupdDX15VPBXvc4ceg-sLGRQy0AVm94o0i/exec";

/**
 * ========= CATALOGO =========
 * categoria (input)
 * estrategia (input filtrado)
 * tipo/sesgo (derivado)
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

const fecha = document.getElementById("fecha");
const hora = document.getElementById("hora");
const ticker = document.getElementById("ticker");

// broker input
const broker = document.getElementById("broker");

// categoria/estrategia
const categoria = document.getElementById("categoria");
const estrategia = document.getElementById("estrategia");

const expiracion = document.getElementById("expiracion");
const strikes = document.getElementById("strikes");

const entrada_tipo = document.getElementById("entrada_tipo");
const credito_debito = document.getElementById("credito_debito");

const salida_tipo = document.getElementById("salida_tipo");
const credito_debito_salida = document.getElementById("credito_debito_salida");

const contratos = document.getElementById("contratos");
const resultado = document.getElementById("resultado");
const notas = document.getElementById("notas");

const estado = document.getElementById("estado");
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
  if (!f) return null;
  if (typeof f === "string" && f.includes("-")) return f.split("T")[0];

  const d = new Date(f);
  if (isNaN(d)) return null;

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

  if (rangeKey === "TODAY") {
    return d.getTime() === today.getTime();
  }

  const days = rangeKey === "7D" ? 7 : 30;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1)); // incluye hoy
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
  return t === "DEBITO" ? -val : val; // Crédito +, Débito -
}

function calcularResultado() {
  const qty = parseFloat(contratos.value) || 0;

  const entradaSigned = toSignedAmount(entrada_tipo.value, credito_debito.value);
  const salidaSigned = toSignedAmount(salida_tipo.value, credito_debito_salida.value);

  if (!qty) {
    resultado.value = "";
    return;
  }

  const pnl = (entradaSigned + salidaSigned) * 100 * qty;
  resultado.value = Number.isFinite(pnl) ? pnl.toFixed(2) : "";
}

// ---------- llenar estrategias por categoria ----------
function renderEstrategiasForCategoria(catValue, selectedId = "") {
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

categoria?.addEventListener("change", () => {
  renderEstrategiasForCategoria(categoria.value);
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

// ---------- listeners para cálculo ----------
credito_debito.addEventListener("input", calcularResultado);
credito_debito_salida.addEventListener("input", calcularResultado);
contratos.addEventListener("input", calcularResultado);
entrada_tipo.addEventListener("change", calcularResultado);
salida_tipo.addEventListener("change", calcularResultado);

// ---------- filtros: recargar ----------
historyRange?.addEventListener("change", () => cargarTrades());
brokerFilter?.addEventListener("change", () => cargarTrades());
tickerSearch?.addEventListener("input", () => cargarTrades());

// ---------- submit ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  calcularResultado();

  const cat = (categoria.value || "").toUpperCase();
  const stratId = estrategia.value || "";
  const strat = getStrategyByCatId(cat, stratId);

  if (!broker.value) {
    alert("Selecciona el Broker.");
    return;
  }

  if (!cat || !stratId || !strat) {
    alert("Selecciona Categoría y Estrategia.");
    return;
  }

  const estValue = (estado?.value || "OPEN").toUpperCase();
  const cierre = estValue === "CLOSED" ? todayLocalISO() : "";

  const trade = {
    fecha: fecha.value,
    hora: hora.value,
    ticker: (ticker.value || "").toUpperCase(),

    broker: broker.value,

    categoria: cat,
    estrategia_id: strat.id,
    estrategia: strat.label,
    sesgo: strat.sesgo,
    tipo: strat.tipo,

    expiracion: expiracion.value,
    strikes: strikes.value,

    entrada_tipo: (entrada_tipo.value || "CREDITO").toUpperCase(),
    credito_debito: credito_debito.value,

    salida_tipo: (salida_tipo.value || "DEBITO").toUpperCase(),
    credito_debito_salida: credito_debito_salida.value,

    contratos: contratos.value,
    resultado: resultado.value,

    notas: notas.value,

    estado: estValue,
    cierre_fecha: cierre,
    _row: editRow,
  };

  try {
    await apiPostNoCORS(trade);

    salirModoEdicion();
    form.reset();
    setFechaHoy();
    setHoraAhora();

    entrada_tipo.value = "CREDITO";
    salida_tipo.value = "DEBITO";
    calcularResultado();

    if (broker) broker.value = "";
    if (categoria) categoria.value = "";
    renderEstrategiasForCategoria("");

    setTimeout(cargarTrades, 600);
  } catch (err) {
    console.error(err);
    alert(`No se pudo guardar: ${err.message}`);
  }
});

// Cancelar edición
cancelBtn?.addEventListener("click", () => {
  salirModoEdicion();
  form.reset();
  setFechaHoy();
  setHoraAhora();

  entrada_tipo.value = "CREDITO";
  salida_tipo.value = "DEBITO";
  calcularResultado();

  if (broker) broker.value = "";
  if (categoria) categoria.value = "";
  renderEstrategiasForCategoria("");
});

// ---------- cargar trades + PnL ----------
async function cargarTrades() {
  try {
    const data = await apiGetJSONP();

    const rangeKey = historyRange?.value || "TODAY";
    const brokerKey = brokerFilter?.value || "ALL";
    const search = (tickerSearch?.value || "").trim().toUpperCase();

    if (listTitle) listTitle.textContent = rangeTitle(rangeKey);

    // 1) filtrar a un array
    const items = [];

    data.forEach((t) => {
      if (!t.fecha) return;

      const fechaTrade = normalizarFecha(t.fecha);
      if (!fechaTrade) return;

      const est = (t.estado || "OPEN").toUpperCase();
      if (est === "DELETED") return;

      if (!isWithinRange(fechaTrade, rangeKey)) return;

      if (brokerKey !== "ALL" && (t.broker || "") !== brokerKey) return;

      const tk = String(t.ticker || "").toUpperCase();
      if (search && !tk.includes(search)) return;

      items.push({
        ...t,
        _fechaISO: fechaTrade,
        _hora: t.hora || "00:00",
        _estado: est,
        _resultadoNum: parseFloat(t.resultado) || 0,
        _tickerUp: tk,
      });
    });

    // 2) ordenar (más reciente arriba)
    items.sort((a, b) => {
      const aKey = `${a._fechaISO} ${a._hora}`;
      const bKey = `${b._fechaISO} ${b._hora}`;
      return bKey.localeCompare(aKey);
    });

    // 3) render + pnl
    list.innerHTML = "";
    let pnl = 0;

    items.forEach((t) => {
      if (t._estado === "CLOSED") pnl += t._resultadoNum;

      const li = document.createElement("li");

      const catTxt = t.categoria ? ` • ${t.categoria}` : "";
      const sesgoTxt = t.sesgo ? ` (${t.sesgo})` : "";
      const brokerTxt = t.broker ? ` • ${prettyBroker(t.broker)}` : "";

      li.innerHTML = `
        <div class="row1">
          <strong>${t._tickerUp}</strong> — ${t.estrategia || ""}${sesgoTxt}${catTxt}${brokerTxt} — <b>${t._estado}</b>
        </div>
        <div class="row2">
          ${t._fechaISO} ${t._hora} | $${t._resultadoNum.toFixed(2)}
        </div>
        <div class="rowBtns">
          <button type="button" class="edit">Editar</button>
          <button type="button" class="close">Cerrar</button>
          <button type="button" class="del">Borrar</button>
        </div>
      `;

      li.addEventListener("click", () => {
        document.querySelectorAll("#tradesList li").forEach((el) => el.classList.remove("editing"));
        li.classList.add("editing");
        cargarTradeEnFormulario(t);
      });

      li.querySelector(".edit").addEventListener("click", (ev) => {
        ev.stopPropagation();
        cargarTradeEnFormulario(t);
      });

      li.querySelector(".close").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!t._row) return;

        const s = prompt("Precio de salida (ej: 0.10)", t.credito_debito_salida || "0");
        if (s === null) return;

        const salidaTipo = prompt("Salida tipo: CREDITO o DEBITO", (t.salida_tipo || "DEBITO")).toUpperCase();
        if (!salidaTipo) return;

        const payload = {
          ...t,
          credito_debito_salida: s,
          salida_tipo: salidaTipo === "CREDITO" ? "CREDITO" : "DEBITO",
          estado: "CLOSED",
          cierre_fecha: todayLocalISO(),
          _row: t._row
        };

        const qty = parseFloat(payload.contratos) || 0;
        const entradaSigned = (String(payload.entrada_tipo || "CREDITO").toUpperCase() === "DEBITO")
          ? -(parseFloat(payload.credito_debito) || 0)
          : (parseFloat(payload.credito_debito) || 0);

        const salidaSigned = (String(payload.salida_tipo || "DEBITO").toUpperCase() === "DEBITO")
          ? -(parseFloat(payload.credito_debito_salida) || 0)
          : (parseFloat(payload.credito_debito_salida) || 0);

        payload.resultado = qty ? ((entradaSigned + salidaSigned) * 100 * qty).toFixed(2) : payload.resultado;

        try {
          await apiPostNoCORS(payload);
          setTimeout(cargarTrades, 600);
        } catch (err) {
          console.error(err);
          alert(`No se pudo cerrar: ${err.message}`);
        }
      });

      li.querySelector(".del").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!t._row) return;
        if (!confirm(`Borrar trade de ${t._tickerUp}?`)) return;

        const payload = { ...t, estado: "DELETED", _row: t._row };

        try {
          await apiPostNoCORS(payload);
          setTimeout(cargarTrades, 600);
        } catch (err) {
          console.error(err);
          alert(`No se pudo borrar: ${err.message}`);
        }
      });

      list.appendChild(li);
    });

    pnlValue.textContent = `$${pnl.toFixed(2)}`;
    pnlCard.classList.remove("positive", "negative", "neutral");
    if (pnl > 0) pnlCard.classList.add("positive");
    else if (pnl < 0) pnlCard.classList.add("negative");
    else pnlCard.classList.add("neutral");
  } catch (err) {
    console.error(err);
    alert(`No se pudieron cargar trades: ${err.message}`);
  }
}

// ---------- cargar trade en form ----------
function cargarTradeEnFormulario(t) {
  editRow = t._row;

  fecha.value = normalizarFecha(t.fecha) || "";
  hora.value = t.hora || "";

  ticker.value = t.ticker || "";

  if (broker) broker.value = t.broker || "";

  // categoria/estrategia nueva o fallback por label
  let cat = (t.categoria || "").toUpperCase();
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

  expiracion.value = normalizarFecha(t.expiracion) || (t.expiracion || "");
  strikes.value = t.strikes || "";

  entrada_tipo.value = (t.entrada_tipo || "CREDITO").toUpperCase();
  credito_debito.value = t.credito_debito || "";

  salida_tipo.value = (t.salida_tipo || "DEBITO").toUpperCase();
  credito_debito_salida.value = t.credito_debito_salida || "";

  contratos.value = t.contratos || "";
  notas.value = t.notas || "";

  if (estado) estado.value = (t.estado || "OPEN").toUpperCase();
  if (saveBtn) saveBtn.textContent = "Guardar Cambios";

  calcularResultado();
}

// ---------- init ----------
setFechaHoy();
setHoraAhora();

entrada_tipo.value = "CREDITO";
salida_tipo.value = "DEBITO";
calcularResultado();

// defaults filtros
if (historyRange) historyRange.value = "TODAY";
if (brokerFilter) brokerFilter.value = "ALL";
if (tickerSearch) tickerSearch.value = "";

// init selects
if (broker) broker.value = "";
if (categoria) categoria.value = "";
renderEstrategiasForCategoria("");

// load
cargarTrades();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
