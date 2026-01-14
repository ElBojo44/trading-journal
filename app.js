let editRow = null;

const API_URL =
  "https://script.google.com/macros/s/AKfycbwybH9w2bcfcFIRamw9zUrb071x13NxFP37FVCqI3AKuC3SEIGh6JUeCHhcIKbiRIIC/exec";

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
const saveBtn = document.getElementById("saveBtn");     // ojo: tu HTML tiene saveBtn
const cancelBtn = document.getElementById("cancelBtn"); // ojo: tu HTML tiene cancelBtn

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

    _row: editRow
  };

  await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(trade)
  });

  salirModoEdicion();
  form.reset();
  setFechaHoy();
  setHoraAhora();
  cargarTrades();
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
  const res = await fetch(API_URL);
  const data = await res.json();

  const hoy = todayLocalISO();
  list.innerHTML = "";

  let pnlHoy = 0;

  data.forEach((t) => {
    if (!t.fecha) return;

    const fechaTrade = normalizarFecha(t.fecha);
    if (!fechaTrade) return;

    const est = (t.estado || "OPEN").toUpperCase();
    if (est === "DELETED") return; // soft delete

    // Solo trades de hoy
    if (fechaTrade !== hoy) return;

    const resultadoNum = parseFloat(t.resultado) || 0;

    // PnL recomendado: solo CLOSED
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

    // Highlight + editar al tocar el li
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
        _row: t._row
      };

      await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
      cargarTrades();
    });

    // Borrar (soft delete)
    li.querySelector(".del").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!t._row) return;

      if (!confirm(`Borrar trade de ${t.ticker}?`)) return;

      const payload = { ...t, estado: "DELETED", _row: t._row };
      await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
      cargarTrades();
    });

    list.appendChild(li);
  });

  // actualizar card PnL
  pnlValue.textContent = `$${pnlHoy.toFixed(2)}`;
  pnlCard.classList.remove("positive", "negative", "neutral");
  if (pnlHoy > 0) pnlCard.classList.add("positive");
  else if (pnlHoy < 0) pnlCard.classList.add("negative");
  else pnlCard.classList.add("neutral");
}

// ---------- cargar trade en form (edición completa) ----------
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
