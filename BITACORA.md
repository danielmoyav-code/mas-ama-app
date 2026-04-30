# Bitácora de QA Iterativa

**App:** MAS AMA Pro — PWA de gestión de talleres CESFAM Félix de Amesti  
**Inicio:** 2026-04-29T00:00:00  
**Tipo de app:** PWA (React CDN + Google Apps Script)  
**Funciones principales identificadas:**
- Sync con Google Sheets (doSync / Code.gs)
- Cálculo y visualización de alertas EMPAM
- Pasar lista / asistencia
- Ficha clínica de paciente
- Exportar Excel
- Panel de seguridad (auto-lock, wipe remoto)
- Control Maestro (JEFE)

---

## Fase 1 — Caza de defectos

### Ciclo 1

#### Pase 1.1 — Lente: Lectura estática del flujo EMPAM completo

**Hallazgos:**

**BUG 1 (CRÍTICO) — Timezone UTC en `new Date("YYYY-MM-DD")`**  
`new Date("2025-04-15")` JavaScript lo interpreta como UTC midnight. En Chile (UTC-3/UTC-4),
esto equivale a las 20:00–21:00 del día 14, así que `toLocaleDateString('es-CL')` muestra
"14 de abril" en vez de "15 de abril". Afecta a:
- `calcEmpamEstado` app.js:117 — usa `TODAY` (congelado) y `new Date(fecha)` UTC
- `refreshEmpam` app.js:131 — `new Date(p.empamFecha)` UTC
- `formatDate` app.js:70 — `new Date(d)` UTC → muestra fecha equivocada
- `calcDias` app.js:138 — `new Date(fecha)` UTC

Consecuencia directa: las fechas aparecen 1 día antes de lo real y el estado puede marcarse
VENCIDO un día antes del vencimiento real.

**BUG 2 (MENOR) — `empamDias>0` en ficha, app.js:1825**  
Si `empamDias===0` (vence HOY), muestra "VENCIDO" en vez de "hoy".

**BUG 3 (MENOR) — `vencFecha` nuevo paciente usa UTC, app.js:1432**  
`new Date(form.empamFecha).setFullYear(...)` opera sobre UTC midnight → `.toISOString().split('T')[0]`
puede devolver la fecha anterior. La fecha de vencimiento del EMPAM nuevo queda mal guardada.

**BUG 4 (CRÍTICO - Code.gs) — `calcEmpamEstado` compara con `new Date()` (servidor UTC)**  
Ramas serial (línea 456-462) e `instanceof Date` (línea 477) usan `new Date()` del servidor
(UTC), mientras que las fechas pueden ser midnight local o UTC. Off-by-one en el mismo día.

**Acciones:**  
→ Agregar `parseDateLocal()` en app.js — parsea "YYYY-MM-DD" como midnight local  
→ Reescribir `calcEmpamEstado` app.js con `parseDateLocal` + `hoy` local midnight  
→ Corregir `refreshEmpam`, `formatDate`, `calcDias`  
→ Corregir display ficha `empamDias>0` → lógica correcta  
→ Corregir `vencFecha` en guardar() nuevo paciente  
→ Reescribir `calcEmpamEstado` Code.gs con fechas Santiago via `Utilities.formatDate`

**Verificación post-fix:** pendiente

---
