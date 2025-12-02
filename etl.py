import pymysql
import requests
import json
from decimal import Decimal
import datetime

# -------------------------
# Helpers para normalizar valores
# -------------------------

def normalize_value(v):
    """Convierte tipos no serializables (Decimal, date) a tipos JSON-friendly."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    return v

# -------------------------
# 1. Conexión a la BD
# -------------------------

connection = pymysql.connect(
    host="auth-db465.hstgr.io",
    user="u549055514_Turing",
    password="Salmos#100",
    database="u549055514_Banco_Turing",
    cursorclass=pymysql.cursors.DictCursor,
    port=3306
)

SQL_BASE = """
SELECT
    sc.id_solicitud,
    c.id_cliente,
    c.anios_empleo,
    sc.canal_origen,
    COALESCE(h.cantidad_atrasos, 0)           AS cantidad_atrasos,
    c.comportamiento_pago,
    c.comuna,
    c.deuda_total,
    c.edad,
    c.etnia,
    c.ingresos_mensuales,
    c.limite_tc,
    COALESCE(h.max_dias_mora_historico, 0)    AS max_dias_mora_historico,
    sc.monto_solicitado,
    c.nacionalidad,
    COALESCE(b.patrimonio_inmobiliario, 0)    AS patrimonio_inmobiliario,
    sc.plazo_meses,
    c.sexo,
    sc.tasa_interes_anual,
    COALESCE(b.tiene_propiedad_en_remate, 0)  AS tiene_propiedad_en_remate,
    c.tipo_contrato,
    sc.tipo_producto,
    sc.incumplio
FROM solicitudes_credito sc
JOIN clientes c
    ON sc.id_cliente = c.id_cliente
LEFT JOIN (
    SELECT
        id_cliente,
        COUNT(*)                         AS cantidad_atrasos,
        COALESCE(MAX(dias_atraso), 0)    AS max_dias_mora_historico
    FROM historial_pagos
    WHERE dias_atraso > 0
    GROUP BY id_cliente
) h
    ON c.id_cliente = h.id_cliente
LEFT JOIN (
    SELECT
        id_cliente,
        COALESCE(SUM(avaluo_fiscal), 0)                     AS patrimonio_inmobiliario,
        CASE WHEN MAX(en_remate) = 1 THEN 1 ELSE 0 END      AS tiene_propiedad_en_remate
    FROM bienes_raices
    GROUP BY id_cliente
) b
    ON c.id_cliente = b.id_cliente
LIMIT 1000;  -- quita el LIMIT si quieres todo
"""

API_URL = "https://scoring-bancoturing.semilla42.com/predict_batch"

# Campos que la API espera EXACTAMENTE
FEATURE_COLS = [
    "anios_empleo",
    "canal_origen",
    "cantidad_atrasos",
    "comportamiento_pago",
    "comuna",
    "deuda_total",
    "edad",
    "etnia",
    "id_cliente",
    "ingresos_mensuales",
    "limite_tc",
    "max_dias_mora_historico",
    "monto_solicitado",
    "nacionalidad",
    "patrimonio_inmobiliario",
    "plazo_meses",
    "sexo",
    "tasa_interes_anual",
    "tiene_propiedad_en_remate",
    "tipo_contrato",
    "tipo_producto",
]

def main():
    # 1) Extraer dataset base desde MySQL
    with connection:
        with connection.cursor() as cursor:
            cursor.execute(SQL_BASE)
            rows_db = cursor.fetchall()

    print(f"Filas extraídas desde la BD: {len(rows_db)}")

    # Normalizar todos los valores (Decimal, fechas, etc.)
    rows = []
    for r in rows_db:
        fila_normalizada = {k: normalize_value(v) for k, v in r.items()}
        rows.append(fila_normalizada)

    # 2) Preparar payload para la API (solo columnas que espera)
    clientes_payload = []
    for r in rows:
        registro = {col: r[col] for col in FEATURE_COLS}
        clientes_payload.append(registro)

    payload = {"clientes": clientes_payload}

    # 3) Llamar a la API de scoring
    print("\n>>> Llamando a la API...")
    resp = requests.post(API_URL, json=payload)

    print(f"Status code API: {resp.status_code}")

    resp.raise_for_status()
    respuesta_json = resp.json()

    # La estructura es: { "status": "...", "total": N, "data": [ ... ] }
    if respuesta_json.get("status") != "success":
        print("❌ La API no devolvió 'success'. Respuesta completa:")
        print(respuesta_json)
        return

    resultados_api = respuesta_json.get("data", [])
    print(f"Registros devueltos por la API (data): {len(resultados_api)}")

    # 4) Mezclar: datos originales + score_riesgo + decision_legacy + probabilidad_default
    # Usamos un mapa por id_cliente para emparejar rápido
    mapa_api = {r["id_cliente"]: r for r in resultados_api}

    final_data = []
    for base in rows:
        api_row = mapa_api.get(base["id_cliente"])
        if api_row:
            base["score_riesgo"] = api_row.get("score_riesgo")
            base["decision_legacy"] = api_row.get("decision_legacy")
            base["probabilidad_default"] = api_row.get("probabilidad_default")
            base["mensaje_modelo"] = api_row.get("mensaje")
        else:
            # Por si algún cliente no vino en la respuesta (no debería, pero por si acaso)
            base["score_riesgo"] = None
            base["decision_legacy"] = None
            base["probabilidad_default"] = None
            base["mensaje_modelo"] = None

        final_data.append(base)

    # 5) Exportar a data.json
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)

    print("\n✅ data.json generado correctamente.")

if __name__ == "__main__":
    main()
