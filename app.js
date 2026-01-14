let editRow = null;

const API_URL = "https://script.google.com/macros/s/AKfycbwIkegEZj9eeBfiZMyYaCOAQlAr_R24Tm0tDOmpTkuwVChjZtjIlIEuARRwoURqydb8/exec";

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

// helpers
function todayLocalISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setFechaHoy() {
  fecha.value = todayLocalISO()
}

// submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const trade = {
    fecha: fecha.value,
    hora: hora.value,
    ticker: ticker.value.toUpperCase(),
    estrategia: estrategia.value,
    sesgo: sesgo.value,
    tipo: tipo.value,
    expiracion: expiracion.value,
    strikes: strikes.value,
    credito_debito: credito_debito.value,
    contratos: contratos.value,
    resultado: resultado.value,
    notas: notas.value,
    _row: editRow // ← CLAVE
};


  await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(trade)
  });

  editRow = null;
  form.querySelector("button").textContent = "Guardar Trade";

  form.reset();
  setFechaHoy();
  cargarTrades();
});

// cargar trades + PnL
async function cargarTrades() {
  const res = await fetch(API_URL);
  const data = await res.json();

  const hoy = todayLocalISO()
  let pnlHoy = 0;

  list.innerHTML = "";

  data.forEach(t => {
    if (!t.fecha) return;

    const fechaTrade = normalizarFecha(t.fecha);
    if (!fechaTrade) return;
    if (fechaTrade === hoy) {
      const resultadoNum = parseFloat(t.resultado) || 0;
      pnlHoy += resultadoNum;

      const li = document.createElement("li");
      li.textContent = `${t.hora} | ${t.ticker} | ${t.estrategia} | ${t.sesgo} | $${resultadoNum.toFixed(2)}`;
            
      li.addEventListener("click", () => {
        document.querySelectorAll("#tradesList li").forEach(el => el.classList.remove("editing"));
        li.classList.add("editing");
        cargarTradeEnFormulario(t);
});


      list.appendChild(li);
      
    }
  });

  pnlValue.textContent = `$${pnlHoy.toFixed(2)}`;

  pnlCard.classList.remove("positive", "negative", "neutral");
  if (pnlHoy > 0) pnlCard.classList.add("positive");
  else if (pnlHoy < 0) pnlCard.classList.add("negative");
  else pnlCard.classList.add("neutral");
}

// init
setFechaHoy();
cargarTrades();

function normalizarFecha(fecha) {
  if (!fecha) return null;

  // si ya viene como yyyy-mm-dd
  if (typeof fecha === "string" && fecha.includes("-")) {
    return fecha.split("T")[0];
  }

  // si viene como número o Date
  const d = new Date(fecha);
  if (isNaN(d)) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


function cargarTradeEnFormulario(t) {
  editRow = t._row;


  fecha.value = t.fecha || "";
  hora.value = t.hora || "";
  ticker.value = t.ticker || "";
  estrategia.value = t.estrategia || "";
  sesgo.value = t.sesgo || "";
  tipo.value = t.tipo || "";
  expiracion.value = t.expiracion || "";
  strikes.value = t.strikes || "";
  credito_debito.value = t.credito_debito || "";
  contratos.value = t.contratos || "";
  resultado.value = t.resultado || "";
  notas.value = t.notas || "";

  // feedback visual
  form.querySelector("button").textContent = "Guardar Cambios";
}

