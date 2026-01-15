let editRow = null;

const API_URL =
  "https://script.google.com/macros/s/AKfycbzfUqoRycuCihTOg5AsRB_f9VBh4EEw_SyupdDX15VPBXvc4ceg-sLGRQy0AVm94o0i/exec";

/* =================== CATALOGOS =================== */
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

const prettyBroker = (v) => brokerLabels[v] || v || "";

/* =================== DOM =================== */
const list = document.getElementById("tradesList");
const pnlValue = document.getElementById("pnlValue");
const pnlCard = document.getElementById("pnlCard");
const listTitle = document.getElementById("listTitle");

const historyRange = document.getElementById("historyRange");
const brokerFilter = document.getElementById("brokerFilter");
const tickerSearch = document.getElementById("tickerSearch");

/* =================== HELPERS =================== */
function normalizarFecha(f) {
  if (!f) return null;
  return typeof f === "string" ? f.split("T")[0] : null;
}

function dateFromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isWithinRange(fechaISO, rangeKey) {
  if (rangeKey === "ALL") return true;
  const d = dateFromISO(fechaISO);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (rangeKey === "TODAY") return d.getTime() === today.getTime();

  const days = rangeKey === "7D" ? 7 : 30;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return d >= start && d <= today;
}

/* =================== LOAD =================== */
async function apiGetJSONP() {
  return new Promise((resolve, reject) => {
    const cb = "__cb_" + Date.now();
    window[cb] = (data) => {
      resolve(data);
      delete window[cb];
      script.remove();
    };
    const script = document.createElement("script");
    script.src = `${API_URL}?callback=${cb}`;
    document.body.appendChild(script);
  });
}

async function cargarTrades() {
  const data = await apiGetJSONP();

  const rangeKey = historyRange.value;
  const brokerKey = brokerFilter.value;
  const search = tickerSearch.value.trim().toUpperCase();

  let filtered = data.filter((t) => {
    if (!t.fecha) return false;
    if (t.estado === "DELETED") return false;

    const fechaISO = normalizarFecha(t.fecha);
    if (!isWithinRange(fechaISO, rangeKey)) return false;

    if (brokerKey !== "ALL" && t.broker !== brokerKey) return false;
    if (search && !t.ticker?.includes(search)) return false;

    return true;
  });

  // 🔥 ORDEN: más reciente arriba
  filtered.sort((a, b) => {
    const da = `${a.fecha} ${a.hora || ""}`;
    const db = `${b.fecha} ${b.hora || ""}`;
    return db.localeCompare(da);
  });

  list.innerHTML = "";
  let pnl = 0;

  filtered.forEach((t) => {
    if (t.estado === "CLOSED") pnl += Number(t.resultado || 0);

    const li = document.createElement("li");
    li.innerHTML = `
      <div class="row1">
        <strong>${t.ticker}</strong> — ${t.estrategia}
        (${t.sesgo}) • ${prettyBroker(t.broker)} — <b>${t.estado}</b>
      </div>
      <div class="row2">
        ${normalizarFecha(t.fecha)} ${t.hora || ""} | $${Number(t.resultado || 0).toFixed(2)}
      </div>
    `;
    list.appendChild(li);
  });

  pnlValue.textContent = `$${pnl.toFixed(2)}`;
  pnlCard.className = "pnl " + (pnl > 0 ? "positive" : pnl < 0 ? "negative" : "neutral");
}

/* =================== INIT =================== */
historyRange.addEventListener("change", cargarTrades);
brokerFilter.addEventListener("change", cargarTrades);
tickerSearch.addEventListener("input", cargarTrades);

historyRange.value = "TODAY";
brokerFilter.value = "ALL";

cargarTrades();
