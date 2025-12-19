const API_URL = "https://script.google.com/macros/s/AKfycbwIkegEZj9eeBfiZMyYaCOAQlAr_R24Tm0tDOmpTkuwVChjZtjIlIEuARRwoURqydb8/exec";

const form = document.getElementById("tradeForm");
const list = document.getElementById("tradesList");

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
    notas: notas.value
  };

  await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(trade)
  });

  form.reset();
  cargarTrades();
});

async function cargarTrades() {
  const res = await fetch(API_URL);
  const data = await res.json();

  list.innerHTML = "";
  data.forEach(t => {
    const li = document.createElement("li");
    li.textContent = `${t.hora} | ${t.ticker} | ${t.estrategia} | $${t.resultado}`;
    list.appendChild(li);
  });
}

async function cargarTrades() {
  const res = await fetch(API_URL);
  const data = await res.json();

  const hoy = new Date().toISOString().split("T")[0];

  list.innerHTML = "";
  data
    .filter(t => t.fecha === hoy)
    .forEach(t => {
      const li = document.createElement("li");
      li.textContent = `${t.hora} | ${t.ticker} | ${t.estrategia} | ${t.sesgo} | $${t.resultado}`;
      list.appendChild(li);
    });
}
