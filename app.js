
/* ==============================
   INVESTING APP - app.js
   ============================== */

const API_URL = window.API_URL || "";
const list = document.getElementById("tradeList");
const listTitle = document.getElementById("listTitle");

const statusView = document.getElementById("statusView");
const viewMode = document.getElementById("viewMode");

statusView?.addEventListener("change", () => cargarTrades());
viewMode?.addEventListener("change", () => cargarTrades());

function normalizarFecha(v) {
  if (!v) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "string") return v.split("T")[0];
  return String(v);
}

function prettyBroker(b) { return b ? b : "—"; }
function fmtMoney(n) { const x = Number(n || 0); return `$${x.toFixed(2)}`; }

function isSpreadStrategyId(estrategia_id) {
  return String(estrategia_id || "").toUpperCase() === "PCS";
}

async function apiGet() {
  const res = await fetch(API_URL, { cache: "no-store" });
  return res.json();
}

async function apiPostNoCORS(payload) {
  await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function cargarTrades() {
  if (!list) return;
  list.innerHTML = "";
  if (listTitle) listTitle.textContent = "Trades";

  let raw = [];
  try { raw = await apiGet(); }
  catch { alert("No se pudo cargar datos."); return; }

  const items = raw
    .filter((r) => String(r.estado || "").toUpperCase() !== "DELETED")
    .map((r) => ({
      ...r,
      _rowNum: r._row,
      _tickerUp: String(r.ticker || "").toUpperCase(),
      _posId: r.position_id || "",
      _pata: r.pata || "",
      _accion: r.accion || "",
      _estado: r.estado || "",
      _fechaISO: normalizarFecha(r.fecha),
      _hora: r.hora || "",
      _resultadoNum: Number(r.resultado || 0),
    }));

  const timeline = [...items].sort((a, b) =>
    `${a._fechaISO} ${a._hora}`.localeCompare(`${b._fechaISO} ${b._hora}`)
  );

  function legKey(t) {
    return [
      (t._posId || "").trim(),
      (t._pata || "").trim(),
      (normalizarFecha(t.expiracion) || "").trim(),
      String(t.strikes || "").trim(),
    ].join("|");
  }

  function legGroupKey(t) {
    return [(t._posId || "").trim(), (t._pata || "").trim()].join("|");
  }

  const openSet = new Set();
  const openStackByLeg = new Map();

  timeline.forEach((t) => {
    if (!t._posId || !t._pata) return;
    const key = legKey(t);
    const gk = legGroupKey(t);
    const act = String(t._accion || "").toUpperCase();
    const st = String(t._estado || "").toUpperCase();

    if (st === "OPEN" && (act === "OPEN" || act === "ROLL_OPEN" || act === "")) {
      openSet.add(key);
      const arr = openStackByLeg.get(gk) || [];
      arr.push(key);
      openStackByLeg.set(gk, arr);
    }

    if (st === "CLOSED" && (act === "CLOSE" || act === "ROLL_CLOSE")) {
      if (openSet.has(key)) {
        openSet.delete(key);
        const arr = openStackByLeg.get(gk) || [];
        const idx = arr.lastIndexOf(key);
        if (idx >= 0) arr.splice(idx, 1);
        openStackByLeg.set(gk, arr);
        return;
      }
      const arr = openStackByLeg.get(gk) || [];
      const last = arr.pop();
      if (last) openSet.delete(last);
      openStackByLeg.set(gk, arr);
    }
  });

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
    spreadGroups[posId].legs.push({ ...t, _isReallyOpen: openSet.has(legKey(t)) });
    const k = `${t._fechaISO} ${t._hora}`;
    if (k > spreadGroups[posId].lastKey) spreadGroups[posId].lastKey = k;
  });

  const mode = viewMode?.value || "TRADES";
  if (mode === "SPREADS") {
    if (listTitle) listTitle.textContent = "🧩 Spreads";
    renderSpreads(spreadGroups);
    return;
  }

  const view = (statusView && statusView.value) ? statusView.value : "OPEN_ONLY";

  items.forEach((t) => {
    const key = legKey(t);
    const isReallyOpen = openSet.has(key);

    if (view === "OPEN_ONLY" && !(t._estado === "OPEN" && isReallyOpen)) return;
    if (view === "CLOSED_ONLY" && t._estado !== "CLOSED") return;

    const li = document.createElement("li");
    const openTag = (t._estado === "OPEN" && !isReallyOpen) ? " (ya cerrada)" : "";
    const isOpenEvent = (t._estado === "OPEN" && isReallyOpen);

    li.innerHTML = `
      <div><strong>${t._tickerUp}</strong> — ${t.estrategia || ""}</div>
      <div>Posición: <b>${t._posId || "—"}</b></div>
      <div>Pata: <b>${t._pata || "—"}</b> | Strike(s): <b>${t.strikes || "—"}</b></div>
      <div>Estado: <b>${t._estado}${openTag}</b> ${t._estado==="CLOSED"?` | PnL: <b>${fmtMoney(t._resultadoNum)}</b>`:""}</div>
    `;

    list.appendChild(li);
  });
}

function renderSpreads(groups) {
  if (!list) return;
  list.innerHTML = "";
  Object.values(groups).forEach((g) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div><strong>${g.ticker}</strong> — ${g.estrategiaLabel}</div>
      <div>Posición: <b>${g.position_id}</b></div>
      <div><button class="toggle">Ver patas</button></div>
      <div class="events" style="display:none"></div>
    `;
    const eventsDiv = li.querySelector(".events");
    const toggleBtn = li.querySelector(".toggle");
    eventsDiv.innerHTML = g.legs.map((e) => `
      <div>
        <b>${e._pata}</b> — ${e._estado}
        ${e._estado==="CLOSED"?` | PnL ${fmtMoney(e._resultadoNum)}`:""}
      </div>
    `).join("");
    toggleBtn.addEventListener("click", () => {
      const h = eventsDiv.style.display === "none";
      eventsDiv.style.display = h ? "block" : "none";
    });
    list.appendChild(li);
  });
}

if ("serviceWorker" in navigator) {
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const isHttps = location.protocol === "https:";
  if (isHttps || isLocalhost) navigator.serviceWorker.register("service-worker.js");
}

document.addEventListener("DOMContentLoaded", () => cargarTrades());
