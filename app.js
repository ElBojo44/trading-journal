let editRow = null;

const API_URL =
  "https://script.google.com/macros/s/AKfycbx_J0ndvujV0pzEW7rD-R-N0EFiRE1TAbHzpiimRdBn81ANaPopYzwIF6PLF2hYkL0l/exec";

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

// filtros (si no existen en tu HTML, no rompen)
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

/** ===== NUEVOS CAMPOS (opcionales en HTML) =====
 * Si no existen en el HTML, se manejarán por prompt()
 */
const position_id = document.getElementById("position_id"); // input
const pata = document.getElementById("pata"); // select: SHORT/LONG/STOCK
const accion = document.getElementById("accion"); // select: OPEN/CLOSE/ROLL_CLOSE/ROLL_OPEN
const roll_group_id = document.getElementById("roll_group_id"); // hidden opcional

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

/** Genera un position_id cuando estás abriendo una posición nueva */
function generatePositionId({ tk, stratId, fechaISO }) {
  const ts = Date.now().toString(36).toUpperCase();
  const f = (fechaISO || todayLocalISO()).replaceAll("-", "");
  const s = (stratId || "STRAT").toUpperCase();
  return `${tk}-${s}-${f}-${ts}`;
}

/** Lee valores nuevos (con fallback por prompt si no hay inputs en HTML) */
function getOrPromptValue(el, promptLabel, defaultVal = "") {
  const v = el?.value;
  if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  const p = prompt(promptLabel, defaultVal);
  if (p === null) return null;
  return String(p).trim();
}

function safeUpper(x) {
  return String(x || "").trim().toUpperCase();
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

// ---------- POST sin CORS (fire-and-forget) ----------
async function apiPostNoCORS(payload) {
  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
}

// ---------- listeners para cálculo ----------
credito_debito?.addEventListener("input", calcularResultado);
credito_debito_salida?.addEventListener("input", calcularResultado);
contratos?.addEventListener("input", calcularResultado);
entrada_tipo?.addEventListener("change", calcularResultado);
salida_tipo?.addEventListener("change", calcularResultado);

// ---------- filtros: recargar ----------
historyRange?.addEventListener("change", () => cargarTrades());
brokerFilter?.addEventListener("change", () => cargarTrades());
tickerSearch?.addEventListener("input", () => cargarTrades());

// ---------- submit ----------
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  calcularResultado();

  const cat = (categoria?.value || "").toUpperCase();
  const stratId = estrategia?.value || "";
  const strat = getStrategyByCatId(cat, stratId);

  if (broker && !broker.value) {
    alert("Selecciona el Broker.");
    return;
  }

  if (!cat || !stratId || !strat) {
    alert("Selecciona Categoría y Estrategia.");
    return;
  }

  // ===== NUEVO: position_id / pata / accion / roll_group_id =====
  // Defaults:
  // - accion por defecto: OPEN
  // - pata por defecto:
  //    * DIAGONAL -> SHORT (lo más común al loggear income)
  //    * CC -> SHORT (call)
  //    * otros -> "" (no aplica)
  let accionVal = safeUpper(accion?.value || "OPEN");
  let pataVal = safeUpper(pata?.value || "");
  const stratKey = safeUpper(strat.id);

  if (!pataVal) {
    if (stratKey === "DIAGONAL" || stratKey === "CC") pataVal = "SHORT";
  }

  // position_id: si es OPEN y no tiene, lo generamos
  let posIdVal = (position_id?.value || "").trim();
  if (!posIdVal && accionVal === "OPEN") {
    posIdVal = generatePositionId({
      tk: safeUpper(ticker?.value || "TICKER"),
      stratId: stratKey,
      fechaISO: fecha?.value || todayLocalISO(),
    });
    if (position_id) position_id.value = posIdVal;
  }

  // Si el usuario está loggeando DIAGONAL o CC, exigimos position_id + pata + accion (con prompts si no hay inputs)
  if ((stratKey === "DIAGONAL" || stratKey === "CC") && !posIdVal) {
    const p = getOrPromptValue(position_id, "position_id (ej: AMZN-DIAGONAL-...)", "");
    if (p === null) return;
    posIdVal = p;
    if (position_id) position_id.value = posIdVal;
  }

  if ((stratKey === "DIAGONAL" || stratKey === "CC") && !pataVal) {
    const p = getOrPromptValue(pata, "Pata: SHORT / LONG / STOCK", "SHORT");
    if (p === null) return;
    pataVal = safeUpper(p);
    if (pata) pata.value = pataVal;
  }

  if ((stratKey === "DIAGONAL" || stratKey === "CC") && !accionVal) {
    const p = getOrPromptValue(accion, "Acción: OPEN / CLOSE / ROLL_CLOSE / ROLL_OPEN", "OPEN");
    if (p === null) return;
    accionVal = safeUpper(p);
    if (accion) accion.value = accionVal;
  }

  const rollIdVal = (roll_group_id?.value || "").trim();

  const estValue = (estado?.value || "OPEN").toUpperCase();
  // NOTA: en este modelo, cierre_fecha se usa si estado=CLOSED
  const cierre = estValue === "CLOSED" ? todayLocalISO() : "";

  const trade = {
    fecha: fecha.value,
    hora: hora.value,
    ticker: (ticker.value || "").toUpperCase(),

    broker: broker?.value || "",

    categoria: cat,
    estrategia_id: strat.id,
    estrategia: strat.label,
    sesgo: strat.sesgo,
    tipo: strat.tipo,

    expiracion: expiracion?.value || "",
    strikes: strikes?.value || "",

    entrada_tipo: (entrada_tipo?.value || "CREDITO").toUpperCase(),
    credito_debito: credito_debito?.value || "",

    salida_tipo: (salida_tipo?.value || "DEBITO").toUpperCase(),
    credito_debito_salida: credito_debito_salida?.value || "",

    contratos: contratos?.value || "",
    resultado: resultado?.value || "",

    notas: notas?.value || "",

    estado: estValue,
    cierre_fecha: cierre,

    // ===== NUEVO =====
    position_id: posIdVal,
    pata: pataVal,
    accion: accionVal,
    roll_group_id: rollIdVal,

    // editar row SOLO si lo haces manual: por defecto, los eventos nuevos NO deberían editar filas viejas
    _row: editRow,
  };

  try {
    await apiPostNoCORS(trade);

    salirModoEdicion();
    form.reset();
    setFechaHoy();
    setHoraAhora();

    // defaults útiles
    if (entrada_tipo) entrada_tipo.value = "CREDITO";
    if (salida_tipo) salida_tipo.value = "DEBITO";
    if (accion) accion.value = "OPEN";
    calcularResultado();

    // reset selects
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

  if (entrada_tipo) entrada_tipo.value = "CREDITO";
  if (salida_tipo) salida_tipo.value = "DEBITO";
  if (accion) accion.value = "OPEN";
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

    // 1) filtrar
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
        _posId: (t.position_id || "").trim(),
        _pata: (t.pata || "").trim().toUpperCase(),
        _accion: (t.accion || "").trim().toUpperCase(),
        _rollId: (t.roll_group_id || "").trim(),
      });
    });

    // 2) ordenar (más reciente arriba)
    items.sort((a, b) => {
      const aKey = `${a._fechaISO} ${a._hora}`;
      const bKey = `${b._fechaISO} ${b._hora}`;
      return bKey.localeCompare(aKey);
    });

    // 3) render + pnl
    if (list) list.innerHTML = "";
    let pnl = 0;

    items.forEach((t) => {
      if (t._estado === "CLOSED") pnl += t._resultadoNum;

      const li = document.createElement("li");

      const catTxt = t.categoria ? ` • ${t.categoria}` : "";
      const sesgoTxt = t.sesgo ? ` (${t.sesgo})` : "";
      const brokerTxt = t.broker ? ` • ${prettyBroker(t.broker)}` : "";

      const posTxt = t._posId ? ` • ${t._posId}` : "";
      const legTxt = t._pata ? ` • ${t._pata}` : "";
      const accionTxt = t._accion ? ` • ${t._accion}` : "";

      // Botones por evento
      // - Cerrar: crea NUEVO evento CLOSE (no edita fila vieja)
      // - Roll: crea 2 eventos (ROLL_CLOSE + ROLL_OPEN) con roll_group_id
      const canClose = t._estado === "OPEN"; // evento abierto (ej: OPEN/ROLL_OPEN)
      const closeBtnHtml = canClose ? `<button type="button" class="close">Cerrar</button>` : "";
      const rollBtnHtml = canClose ? `<button type="button" class="roll">Roll</button>` : "";

      li.innerHTML = `
        <div class="row1">
          <strong>${t._tickerUp}</strong> — ${t.estrategia || ""}${sesgoTxt}${catTxt}${brokerTxt}
          ${posTxt}${legTxt}${accionTxt} — <b>${t._estado}</b>
        </div>
        <div class="row2">
          ${t._fechaISO} ${t._hora} | $${t._resultadoNum.toFixed(2)}
        </div>
        <div class="rowBtns">
          <button type="button" class="edit">Editar</button>
          ${closeBtnHtml}
          ${rollBtnHtml}
          <button type="button" class="del">Borrar</button>
        </div>
      `;

      // Click en LI: resalta y carga al formulario
      li.addEventListener("click", () => {
        document.querySelectorAll("#tradesList li").forEach((el) => el.classList.remove("editing"));
        li.classList.add("editing");
        cargarTradeEnFormulario(t);
      });

      // Editar (solo si realmente quieres editar una fila histórica)
      li.querySelector(".edit").addEventListener("click", (ev) => {
        ev.stopPropagation();
        cargarTradeEnFormulario(t);
      });

      // Cerrar: crea NUEVA fila de evento CLOSE
      const closeBtn = li.querySelector(".close");
      if (closeBtn) {
        closeBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();

          // Si el evento no tiene position_id/pata, lo dejamos como antes (editar fila)
          // Pero para DIAGONAL/CC lo ideal es crear evento nuevo.
          const posId = t._posId || "";
          const leg = t._pata || "";

          const s = prompt("Precio de salida (ej: 0.10)", t.credito_debito_salida || "0");
          if (s === null) return;

          const salidaTipoPrompt = prompt(
            "Salida tipo: CREDITO o DEBITO",
            (t.salida_tipo || "DEBITO")
          );
          if (salidaTipoPrompt === null) return;

          const salidaTipo = String(salidaTipoPrompt || "").toUpperCase();
          if (!salidaTipo) return;

          // NUEVO EVENTO CLOSE (no editamos la fila original)
          const payload = {
            ...t,

            // fuerza como nuevo evento
            _row: null,

            // marca como cierre
            accion: "CLOSE",
            position_id: posId,
            pata: leg,

            credito_debito_salida: s,
            salida_tipo: salidaTipo === "CREDITO" ? "CREDITO" : "DEBITO",
            estado: "CLOSED",
            cierre_fecha: todayLocalISO(),
          };

          // Recalcular resultado para guardarlo correcto
          const qty = parseFloat(payload.contratos) || 0;

          const entradaSigned =
            String(payload.entrada_tipo || "CREDITO").toUpperCase() === "DEBITO"
              ? -(parseFloat(payload.credito_debito) || 0)
              : (parseFloat(payload.credito_debito) || 0);

          const salidaSigned =
            String(payload.salida_tipo || "DEBITO").toUpperCase() === "DEBITO"
              ? -(parseFloat(payload.credito_debito_salida) || 0)
              : (parseFloat(payload.credito_debito_salida) || 0);

          payload.resultado = qty
            ? ((entradaSigned + salidaSigned) * 100 * qty).toFixed(2)
            : payload.resultado;

          try {
            await apiPostNoCORS(payload);
            setTimeout(cargarTrades, 600);
          } catch (err) {
            console.error(err);
            alert(`No se pudo cerrar: ${err.message}`);
          }
        });
      }

      // Roll: crea 2 eventos (ROLL_CLOSE + ROLL_OPEN) con roll_group_id
      const rollBtn = li.querySelector(".roll");
      if (rollBtn) {
        rollBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();

          const posId = t._posId || "";
          const leg = t._pata || "";

          if (!posId || !leg) {
            alert("Este evento no tiene position_id/pata. Agrega esas columnas y vuelve a intentarlo.");
            return;
          }

          const rg = `ROLL-${Date.now().toString(36).toUpperCase()}`;

          const closePrice = prompt("ROLL - Precio para cerrar (BTC) (ej: 0.12)", t.credito_debito_salida || "0");
          if (closePrice === null) return;

          const closeType = prompt("ROLL - Tipo cierre: CREDITO o DEBITO", (t.salida_tipo || "DEBITO"));
          if (closeType === null) return;

          const newExp = prompt("ROLL - Nueva expiración (YYYY-MM-DD)", normalizarFecha(t.expiracion) || "");
          if (newExp === null) return;

          const newStrikes = prompt("ROLL - Nuevos strikes (ej: 187.5)", t.strikes || "");
          if (newStrikes === null) return;

          const newCredit = prompt("ROLL - Crédito/Débito de la nueva venta/compra (ej: 0.35)", t.credito_debito || "");
          if (newCredit === null) return;

          const newEntradaTipo = prompt("ROLL - Entrada tipo: CREDITO o DEBITO", (t.entrada_tipo || "CREDITO"));
          if (newEntradaTipo === null) return;

          // Evento 1: ROLL_CLOSE (cierre)
          const rollClose = {
            ...t,
            _row: null,
            accion: "ROLL_CLOSE",
            roll_group_id: rg,
            position_id: posId,
            pata: leg,
            estado: "CLOSED",
            cierre_fecha: todayLocalISO(),
            credito_debito_salida: closePrice,
            salida_tipo: String(closeType).toUpperCase() === "CREDITO" ? "CREDITO" : "DEBITO",
          };

          // calcular pnl del cierre
          {
            const qty = parseFloat(rollClose.contratos) || 0;
            const entradaSigned =
              String(rollClose.entrada_tipo || "CREDITO").toUpperCase() === "DEBITO"
                ? -(parseFloat(rollClose.credito_debito) || 0)
                : (parseFloat(rollClose.credito_debito) || 0);

            const salidaSigned =
              String(rollClose.salida_tipo || "DEBITO").toUpperCase() === "DEBITO"
                ? -(parseFloat(rollClose.credito_debito_salida) || 0)
                : (parseFloat(rollClose.credito_debito_salida) || 0);

            rollClose.resultado = qty
              ? ((entradaSigned + salidaSigned) * 100 * qty).toFixed(2)
              : rollClose.resultado;
          }

          // Evento 2: ROLL_OPEN (nueva apertura)
          const rollOpen = {
            ...t,
            _row: null,
            accion: "ROLL_OPEN",
            roll_group_id: rg,
            position_id: posId,
            pata: leg,
            estado: "OPEN",
            cierre_fecha: "",
            expiracion: newExp,
            strikes: newStrikes,
            credito_debito: newCredit,
            entrada_tipo: String(newEntradaTipo).toUpperCase() === "DEBITO" ? "DEBITO" : "CREDITO",
            // reset salida
            credito_debito_salida: "",
            salida_tipo: "DEBITO",
            resultado: "",
          };

          try {
            await apiPostNoCORS(rollClose);
            await apiPostNoCORS(rollOpen);
            setTimeout(cargarTrades, 700);
          } catch (err) {
            console.error(err);
            alert(`No se pudo rolar: ${err.message}`);
          }
        });
      }

      // Borrar (soft delete)
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

    // pnl card
    if (pnlValue) pnlValue.textContent = `$${pnl.toFixed(2)}`;
    if (pnlCard) {
      pnlCard.classList.remove("positive", "negative", "neutral");
      if (pnl > 0) pnlCard.classList.add("positive");
      else if (pnl < 0) pnlCard.classList.add("negative");
      else pnlCard.classList.add("neutral");
    }
  } catch (err) {
    console.error(err);
    alert(`No se pudieron cargar trades: ${err.message}`);
  }
}

// ---------- cargar trade en form ----------
function cargarTradeEnFormulario(t) {
  editRow = t._row;

  if (fecha) fecha.value = normalizarFecha(t.fecha) || "";
  if (hora) hora.value = t.hora || "";

  if (ticker) ticker.value = t.ticker || "";

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

  if (expiracion) expiracion.value = normalizarFecha(t.expiracion) || (t.expiracion || "");
  if (strikes) strikes.value = t.strikes || "";

  if (entrada_tipo) entrada_tipo.value = (t.entrada_tipo || "CREDITO").toUpperCase();
  if (credito_debito) credito_debito.value = t.credito_debito || "";

  if (salida_tipo) salida_tipo.value = (t.salida_tipo || "DEBITO").toUpperCase();
  if (credito_debito_salida) credito_debito_salida.value = t.credito_debito_salida || "";

  if (contratos) contratos.value = t.contratos || "";
  if (notas) notas.value = t.notas || "";

  if (estado) estado.value = (t.estado || "OPEN").toUpperCase();
  if (saveBtn) saveBtn.textContent = "Guardar Cambios";

  // NUEVO: cargar campos si existen
  if (position_id) position_id.value = t.position_id || "";
  if (pata) pata.value = (t.pata || "").toUpperCase();
  if (accion) accion.value = (t.accion || "").toUpperCase() || "OPEN";
  if (roll_group_id) roll_group_id.value = t.roll_group_id || "";

  calcularResultado();
}

// ---------- init ----------
setFechaHoy();
setHoraAhora();

// defaults
if (entrada_tipo) entrada_tipo.value = "CREDITO";
if (salida_tipo) salida_tipo.value = "DEBITO";
if (accion) accion.value = "OPEN";
calcularResultado();

// defaults filtros
if (historyRange) historyRange.value = historyRange.value || "TODAY";
if (brokerFilter) brokerFilter.value = brokerFilter.value || "ALL";
if (tickerSearch) tickerSearch.value = tickerSearch.value || "";

// init selects
if (broker) broker.value = broker.value || "";
if (categoria) categoria.value = categoria.value || "";
renderEstrategiasForCategoria(categoria?.value || "");

// load
cargarTrades();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
