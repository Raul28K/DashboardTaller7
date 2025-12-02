// Dimensiones generales
const margin = { top: 20, right: 20, bottom: 60, left: 60 };
const width = 800 - margin.left - margin.right;
const height = 360 - margin.top - margin.bottom;

let fullData = [];
let currentFilter = {
  comuna: null,
};

const filtroLabel = document.getElementById("filtro-actual");
const btnClear = document.getElementById("btn-clear");
btnClear.addEventListener("click", () => {
  currentFilter.comuna = null;
  filtroLabel.textContent = "Filtro: Ninguno";
  updateAllCharts();
});

// Utilidad para aplicar filtros globales
function getFilteredData() {
  let data = fullData;
  if (currentFilter.comuna) {
    data = data.filter((d) => d.comuna === currentFilter.comuna);
  }
  return data;
}

// Carga de datos
d3.json("data.json").then((data) => {
  // Conversión de tipos por seguridad
  data.forEach((d) => {
    d.ingresos_mensuales = +d.ingresos_mensuales;
    d.score_riesgo = d.score_riesgo != null ? +d.score_riesgo : null;
    d.edad = +d.edad;
    d.probabilidad_default =
      d.probabilidad_default != null ? +d.probabilidad_default : null;
  });

  fullData = data;

  createComunaChart();
  createScatterChart();
  createEdadChart();
  updateAllCharts();
});

// --------------------
// 1. Tasa de rechazo por comuna
// --------------------
let comunaSvg, comunaX, comunaY, comunaBars;

function createComunaChart() {
  comunaSvg = d3
    .select("#chart-comuna")
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  comunaX = d3.scaleBand().padding(0.2).range([0, width]);
  comunaY = d3.scaleLinear().range([height, 0]);

  comunaSvg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  comunaSvg.append("g").attr("class", "y-axis");

  comunaSvg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height + 40)
    .attr("text-anchor", "middle")
    .text("Comuna (top 20 por cantidad de solicitudes)");

  comunaSvg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", -height / 2)
    .attr("y", -40)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .text("Tasa de rechazo");
}

function updateComunaChart() {
  // Usamos SIEMPRE el fullData para que las tasas no cambien con el filtro
  const grouped = d3.group(fullData, (d) => d.comuna);
  const stats = Array.from(grouped, ([comuna, values]) => {
    const total = values.length;
    const rechazados = values.filter(
      (d) => d.decision_legacy === "RECHAZADO"
    ).length;
    return {
      comuna,
      total,
      tasaRechazo: total > 0 ? rechazados / total : 0,
    };
  });

  // Nos quedamos con top 20 comunas por cantidad
  const top = stats
    .sort((a, b) => d3.descending(a.total, b.total))
    .slice(0, 20);

  comunaX.domain(top.map((d) => d.comuna));
  comunaY.domain([0, d3.max(top, (d) => d.tasaRechazo) || 0.1]);

  comunaSvg
    .select(".x-axis")
    .call(d3.axisBottom(comunaX))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  comunaSvg
    .select(".y-axis")
    .call(d3.axisLeft(comunaY).tickFormat(d3.format(".0%")));

  comunaBars = comunaSvg
    .selectAll(".bar")
    .data(top, (d) => d.comuna);

  comunaBars
    .enter()
    .append("rect")
    .attr("class", "bar")
    .merge(comunaBars)
    .attr("x", (d) => comunaX(d.comuna))
    .attr("width", comunaX.bandwidth())
    .attr("y", (d) => comunaY(d.tasaRechazo))
    .attr("height", (d) => height - comunaY(d.tasaRechazo))
    .attr("fill", (d) =>
      d.comuna === currentFilter.comuna ? "#f97316" : "#3b82f6"
    )
    .on("click", (event, d) => {
      if (currentFilter.comuna === d.comuna) {
        currentFilter.comuna = null;
        filtroLabel.textContent = "Filtro: Ninguno";
      } else {
        currentFilter.comuna = d.comuna;
        filtroLabel.textContent = `Filtro: Comuna = ${d.comuna}`;
      }
      updateAllCharts();
    })
    .on("mouseover", function () {
      d3.select(this).attr("opacity", 0.8);
    })
    .on("mouseout", function () {
      d3.select(this).attr("opacity", 1);
    });

  comunaBars.exit().remove();
}

// --------------------
// 2. Scatter ingresos vs score
// --------------------
let scatterSvg, scatterX, scatterY, scatterColor, scatterDots;

function createScatterChart() {
  scatterSvg = d3
    .select("#chart-scatter")
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  scatterX = d3.scaleLinear().range([0, width]);
  scatterY = d3.scaleLinear().range([height, 0]);
  scatterColor = d3
    .scaleOrdinal()
    .domain(["APROBADO", "RECHAZADO"])
    .range(["#22c55e", "#ef4444"]);

  scatterSvg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  scatterSvg.append("g").attr("class", "y-axis");

  scatterSvg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height + 40)
    .attr("text-anchor", "middle")
    .text("Ingresos mensuales (CLP)");

  scatterSvg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", -height / 2)
    .attr("y", -40)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .text("Score de riesgo");
}

function updateScatterChart() {
  const data = getFilteredData().filter(
    (d) => d.ingresos_mensuales > 0 && d.score_riesgo != null
  );

  if (data.length === 0) return;

  scatterX.domain(d3.extent(data, (d) => d.ingresos_mensuales));
  scatterY.domain(d3.extent(data, (d) => d.score_riesgo));

  scatterSvg.select(".x-axis").call(d3.axisBottom(scatterX));
  scatterSvg.select(".y-axis").call(d3.axisLeft(scatterY));

  scatterDots = scatterSvg.selectAll(".dot").data(data, (d) => d.id_solicitud);

  scatterDots
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("r", 3)
    .merge(scatterDots)
    .attr("cx", (d) => scatterX(d.ingresos_mensuales))
    .attr("cy", (d) => scatterY(d.score_riesgo))
    .attr("fill", (d) => scatterColor(d.decision_legacy || "APROBADO"));

  scatterDots.exit().remove();
}

// --------------------
// 3. Tasa de rechazo por grupo de edad
// --------------------
let edadSvg, edadX, edadY, edadBars;

function createEdadChart() {
  edadSvg = d3
    .select("#chart-edad")
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  edadX = d3.scaleBand().padding(0.2).range([0, width]);
  edadY = d3.scaleLinear().range([height, 0]);

  edadSvg.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`);
  edadSvg.append("g").attr("class", "y-axis");

  edadSvg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height + 40)
    .attr("text-anchor", "middle")
    .text("Rango de edad");

  edadSvg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", -height / 2)
    .attr("y", -40)
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .text("Tasa de rechazo");
}

function updateEdadChart() {
  const data = getFilteredData();

  // Creamos bins de edad (ej: 18-24, 25-34, 35-44, etc.)
  const bins = [
    { label: "18-24", min: 18, max: 24 },
    { label: "25-34", min: 25, max: 34 },
    { label: "35-44", min: 35, max: 44 },
    { label: "45-54", min: 45, max: 54 },
    { label: "55-64", min: 55, max: 64 },
    { label: "65+", min: 65, max: 120 },
  ];

  const stats = bins.map((b) => {
    const values = data.filter((d) => d.edad >= b.min && d.edad <= b.max);
    const total = values.length;
    const rechazados = values.filter(
      (d) => d.decision_legacy === "RECHAZADO"
    ).length;
    return {
      rango: b.label,
      total,
      tasaRechazo: total > 0 ? rechazados / total : 0,
    };
  });

  edadX.domain(stats.map((d) => d.rango));
  edadY.domain([0, d3.max(stats, (d) => d.tasaRechazo) || 0.1]);

  edadSvg.select(".x-axis").call(d3.axisBottom(edadX));
  edadSvg
    .select(".y-axis")
    .call(d3.axisLeft(edadY).tickFormat(d3.format(".0%")));

  edadBars = edadSvg.selectAll(".bar").data(stats, (d) => d.rango);

  edadBars
    .enter()
    .append("rect")
    .attr("class", "bar")
    .merge(edadBars)
    .attr("x", (d) => edadX(d.rango))
    .attr("width", edadX.bandwidth())
    .attr("y", (d) => edadY(d.tasaRechazo))
    .attr("height", (d) => height - edadY(d.tasaRechazo))
    .attr("fill", "#6366f1");

  edadBars.exit().remove();
}

// --------------------
// Actualizar todo
// --------------------
function updateAllCharts() {
  updateComunaChart();
  updateScatterChart();
  updateEdadChart();
}
