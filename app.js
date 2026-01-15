let editRow = null;

const API_URL =
  "https://script.google.com/macros/s/AKfycbxKeT-nbsnM_kZbn7LPAlNEjJtBWC-vq1u6t_3XP-ztaGuj2CQt5bLXDAHe-nEHoqFg/exec";

// DOM
const form = document.getElementById("tradeForm");
const list = document.getElementById("tradesList");
const pnlCard = document.getElementById("pnlCard");
const pnlValue = document.getElementById("pnlValue");

const fecha = document.getElementById("fecha");
const hora = document.getElementById("hora");
const ticker = document.getElementById("ticker");
const estrategia = document.getElementById("estrategia");
const sesgo = document.getElementById("sesgo");
const tipo = document.getElementById("tipo");
const expiracion = document.getElementById("expiracion");
const strikes = document.getElementById("strikes");
const credito_debito = document.getElementById("credito_debito");
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

  // si viene tipo "2026-01-14T..."
  if (typeof f === "string" && f.includes("-")) {
    return f.split("T")[0];
  }

  const d = new Date(f);
  if (isNaN(d)) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function salirModoEdicion() {
  editRow = null;
  if (saveBtn) saveBtn.textContent = "Guardar Trade";
  document.querySelectorAll("#tradesList li").forEach((el) => el.classList.remove("editing"));
}

function setStatus(msg) {
  // si luego quieres un div de estado, lo enchufamos aquí
  // por ahora usamos console + alert suave
  console.log(msg);
}

// ---------- API helpers ----------
async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // ✅ CRÍTICO
    body: JSON.stringify(payload),
  });

  // Apps Script a veces responde 200 aunque sea error lógico,
  // por eso leemos JSON siempre.
  let data;
  try {
    data = await res.json();
  } catch {
    const text = await res.text();
    throw new Error(`Respuesta no-JSON: ${text}`);
  }

  if (!res.ok || data?.ok === false) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

async function apiGet() {
  const res = await fetch(API_URL, { method: "GET" });
  if (!res.ok) throw new Error(`GET falló: HTTP ${res.status}`);
  return res.json();
}

// ---------- submit ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const estValue = (estado?.value || "OPEN").toUpperCase();
  const cierre = estValue === "CLOSED" ? todayLocalISO() : "";

  const trade = {
    fecha: fecha.value,
    hora: hora.value,
    ticker: (ticker.value || "").toUpperCase(),
    estrategia: estrategia.value,
    sesgo: sesgo.value,
    tipo: tipo.value,
    expiracion: expiracion.value,
    strikes: strikes.value,
    credito_debito: credito_debito.value,
    contratos: contratos.value,
    resultado: resultado.value,
    notas: notas.value,

    estado: estValue,
    cierre_fecha: cierre,

    _row: editRow,
  };

  try {
    setStatus("Guardando trade...");
    await apiPost(trade);

    salirModoEdicion();
    form.reset();
    setFechaHoy();
    setHoraAhora();
    await cargarTrades();
    setStatus("Trade guardado ✅");
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
});

// ---------- cargar trades + PnL ----------
async function cargarTrades() {
  try {
    const data = await apiGet();

    const hoy = todayLocalISO();
    list.innerHTML = "";
    let pnlHoy = 0;

    data.forEach((t) => {
      if (!t.fecha) return;

      const fechaTrade = normalizarFecha(t.fecha);
      if (!fechaTrade) return;

      const est = (t.estado || "OPEN").toUpperCase();
      if (est === "DELETED") return;

      // Solo trades de hoy (si quieres ver todos, comenta esto)
      if (fechaTrade !== hoy) return;

      const resultadoNum = parseFloat(t.resultado) || 0;
      if (est === "CLOSED") pnlHoy += resultadoNum;

      const li = document.createElement("li");
      li.innerHTML = `
        <div class="row1">
          <strong>${t.ticker || ""}</strong> — ${t.estrategia || ""} (${t.sesgo || ""}) — <b>${est}</b>
        </div>
        <div class="row2">
          ${fechaTrade} ${t.hora || ""} | $${resultadoNum.toFixed(2)}
        </div>
        <div class="rowBtns">
          <button type="button" class="edit">Editar</button>
          <button type="button" class="close">Cerrar</button>
          <button type="button" class="del">Borrar</button>
        </div>
      `;

      // Click en li => editar
      li.addEventListener("click", () => {
        document.querySelectorAll("#tradesList li").forEach((el) => el.classList.remove("editing"));
        li.classList.add("editing");
        cargarTradeEnFormulario(t);
      });

      // Editar
      li.querySelector(".edit").addEventListener("click", (ev) => {
        ev.stopPropagation();
        cargarTradeEnFormulario(t);
      });

      // Cerrar
      li.querySelector(".close").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!t._row) return;

        const r = prompt("Resultado final ($). Ej: 25.50 o -12.00", t.resultado || "0");
        if (r === null) return;

        const payload = {
          ...t,
          resultado: r,
          estado: "CLOSED",
          cierre_fecha: todayLocalISO(),
          _row: t._row,
        };

        try {
          await apiPost(payload);
          await cargarTrades();
        } catch (err) {
          console.error(err);
          alert(`No se pudo cerrar: ${err.message}`);
        }
      });

      // Borrar (soft delete)
      li.querySelector(".del").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!t._row) return;

        if (!confirm(`Borrar trade de ${t.ticker}?`)) return;

        const payload = { ...t, estado: "DELETED", _row: t._row };

        try {
          await apiPost(payload);
          await cargarTrades();
        } catch (err) {
          console.error(err);
          alert(`No se pudo borrar: ${err.message}`);
        }
      });

      list.appendChild(li);
    });

    // actualizar card PnL
    pnlValue.textContent = `$${pnlHoy.toFixed(2)}`;
    pnlCard.classList.remove("positive", "negative", "neutral");
    if (pnlHoy > 0) pnlCard.classList.add("positive");
    else if (pnlHoy < 0) pnlCard.classList.add("negative");
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
  estrategia.value = t.estrategia || "";
  sesgo.value = t.sesgo || "";
  tipo.value = t.tipo || "";

  expiracion.value = normalizarFecha(t.expiracion) || (t.expiracion || "");
  strikes.value = t.strikes || "";
  credito_debito.value = t.credito_debito || "";
  contratos.value = t.contratos || "";
  resultado.value = t.resultado || "";
  notas.value = t.notas || "";

  if (estado) estado.value = (t.estado || "OPEN").toUpperCase();
  if (saveBtn) saveBtn.textContent = "Guardar Cambios";
}

// ---------- init ----------
setFechaHoy();
setHoraAhora();
cargarTrades();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
