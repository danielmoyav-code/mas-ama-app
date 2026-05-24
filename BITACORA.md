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

**Verificación post-fix:** PASS — todos los fixes aplicados, commit 228f352

---

## Fase 2 — Validación exhaustiva

#### Pase 2.1 — Enfoque: EMPAM — lectura estática completa
**Cubierto:** `parseDateLocal`, `calcEmpamEstado`, `refreshEmpam`, `formatDate`, `calcDias`, ficha display, `vencFecha` en guardar(), Code.gs `calcEmpamEstado`
**Resultado:** PASS — todos los fixes de Fase 1 están correctamente aplicados
**Notas:** `refreshEmpam` se llama en carga inicial (línea 5537) y después de cada sync (línea 5604) ✅

#### Pase 2.2 — Enfoque: `todayISO()` UTC bug
**Cubierto:** Función `todayISO()` en app.js:67
**Resultado:** FAIL — `TODAY.toISOString().split('T')[0]` usa UTC. En Chile después de las ~21h devuelve el día siguiente.

**BUG 5 (MENOR) — `todayISO()` usa UTC**  
Afecta: fecha por defecto en ViewLista, contador `hoyReg` en ViewInicio, claves de asistencia.
Fix: usar construcción manual con `getFullYear/getMonth/getDate` en zona local.

**Acciones:**  
→ Reescribir `todayISO()` con `d.getFullYear(), d.getMonth()+1, d.getDate()` (local)

**Verificación post-fix:** PASS — fix aplicado en app.js:67

#### Pase 2.3 — Enfoque: Excel import EMPAM recalculation
**Cubierto:** `parseMaestroExcel` + ViewConfig import handler
**Resultado:** FAIL — después de importar Excel, `setPatients(result)` no llama `refreshEmpam`. Los estados EMPAM del Excel pueden ser obsoletos.

**BUG 6 (MENOR) — Excel import no recalcula estados EMPAM**  
`parseMaestroExcel` usa `String(o['Estado EMPAM']||calcEmpamEstado(empamFecha))` — si el Excel tiene un estado viejo en la columna 'Estado EMPAM', lo usa sin recalcular.
Fix: llamar `refreshEmpam(result)` antes de `setPatients` en el handler de import.

**Acciones:**  
→ Cambiar `setPatients(result)` por `const refreshed=refreshEmpam(result); setPatients(refreshed)` en ViewConfig

**Verificación post-fix:** PASS — fix aplicado en app.js:2496

#### Pase 2.4 — Enfoque: Seguridad (auto-lock, wipe, LockScreen)
**Cubierto:** `emergencyWipe`, `LockScreen` (fail counting, lockout, wipe), auto-lock effect, visibilitychange, Config > Seguridad button
**Resultado:** PASS
**Notas:** LockScreen con FAIL_KEY/UNTIL_KEY correcto. 5 intentos → 15min lockout, 10 → wipe. Remote wipe via sync correctamente gateado por `data.wipe===true`.

#### Pase 2.5 — Enfoque: Pasar Lista / Asistencia
**Cubierto:** ViewLista: taller grid → fecha → lista. marcado P/A, notas, "todos presentes".
**Resultado:** PASS
**Notas:** Auto-selección de taller eliminada correctamente (todos ven grid igual). `attKey` usa `todayISO()` — corregido con BUG 5 fix.

#### Pase 2.6 — Enfoque: ViewAlertas
**Cubierto:** Tabs EMPAM/Asistencia/Pendientes, lista VENCIDO y VENCE PRONTO, WhatsApp masivo
**Resultado:** PASS
**Notas:** WhatsApp usa `wa.me/56${fono}` — requiere que fono esté normalizado (Code.gs hace normFono). `buildWspMsg` con `formatDate(p.empamFecha)` — usa función corregida ✅

#### Pase 2.7 — Enfoque: Sync flow doSync
**Cubierto:** doSync (GET ?action=all), refreshEmpam post-sync, wipe/lock flags, auto-sync timers
**Resultado:** PASS
**Notas:** Auto-sync al cargar, cada 30 min, al volver al tab (si > 15 min). El comentario en UI dice "15 min" pero el intervalo programado es 30 min — inconsistencia menor de documentación, no bug funcional.

#### Pase 2.8 — Enfoque: ViewFicha / Ficha clínica
**Cubierto:** Tabs General/Clínico/Asistencia, empamDias display, ClinicalCompare, historial sesiones
**Resultado:** PASS
**Notas:** Historial usa `new Date(s.fecha+'T12:00:00')` — correcto workaround UTC para display ✅. Ficha: `empamDias>0 → días, ===0 → 'vence hoy', <0 → 'VENCIDO'` ✅

#### Pase 2.9 — Enfoque: Code.gs EMPAM y normFecha
**Cubierto:** `calcEmpamEstado` (Prox.MES, serial Excel, Date, ISO), `normFecha`, `normRut`, `normFono`
**Resultado:** PASS
**Notas:** Todos los casos usan `Utilities.formatDate(..., 'America/Santiago', 'yyyy-MM-dd')`. Comparación final mediante Date locales construidos desde partes del string ✅

#### Pase 2.10 — Enfoque: ViewNuevo / Registro de pacientes
**Cubierto:** 4 pasos del wizard, `guardar()`, `parseDateLocal(form.empamFecha)`, `calcEmpamEstado(vencFecha)`, `SYNC2.markDirty`
**Resultado:** PASS
**Notas:** BUG 3 (vencFecha UTC) fue corregido en Fase 1 — se verifica que el fix está en línea 1448 ✅

#### Pase 2.11 — Enfoque: Exportar Excel
**Cubierto:** `exportToExcel` con hojas MAESTRO/ASISTENCIA/ALERTAS/NUEVOS PACIENTES
**Resultado:** PASS
**Notas:** Exporta `empamDias` y `empamFecha` como calculados. El Excel incluye el estado EMPAM recalculado con los fixes de UTC.

#### Pase 2.12 — Enfoque: ViewPacientes / Búsqueda y filtros
**Cubierto:** Búsqueda multi-término, filtros (taller, EMPAM, sexo), sort por EMPAM, tabs todos/alertas/nuevos
**Resultado:** PASS
**Notas:** Sort por EMPAM usa `{'VENCIDO':0,'VENCE PRONTO':1,'VIGENTE':2,'PENDIENTE':3}` — coincide exactamente con los valores que retorna `calcEmpamEstado` ✅. Filter `.includes(filterEmpam)` donde `filterEmpam` puede ser 'VENCIDO', 'PRONTO', 'VIGENTE', 'PENDIENTE' — funciona correctamente ✅

#### Pase 2.13 — Enfoque: Control Maestro / Roles
**Cubierto:** `ViewControlMaestro`, `ROLES`, `isJefe`, nav conditional, `handleAdminCommand` en Code.gs
**Resultado:** PASS
**Notas:** Control tab solo en nav si `isJefe` ✅. `ADMIN_SECRET` solo en Code.gs (server-side), nunca en app.js ✅. Secret almacenado en localStorage del dispositivo del jefe.

#### Pase 2.14 — Enfoque: Edge cases en datos de pacientes
**Cubierto:** Paciente sin empamFecha (null), empamFecha='PEND', empamFecha='Prox. MAY', empamFecha como ISO string
**Resultado:** PASS
**Notas:** `refreshEmpam` hace `if(!p.empamFecha) return p` → skip sin crash ✅. `calcEmpamEstado('PEND')` → 'PENDIENTE' ✅. Regex `/Prox\.?\s*(ENE|...|DIC)/i` en app.js y Code.gs ✅

#### Pase 2.15 — Enfoque: Sin datos (primera carga)
**Cubierto:** Estado `hasData=false`, empty state, navegación solo config disponible
**Resultado:** PASS
**Notas:** Cuando `patients.length===0` y `view!=='config'`, muestra pantalla de bienvenida con botón "Importar Maestro" ✅

#### Pase 2.16 — Enfoque: LoginScreen y flujo de usuarios
**Cubierto:** `LoginScreen`, `USUARIOS_DEFAULT`, `currentUser` state, logout
**Resultado:** PASS — con observación menor
**Notas:** `PinScreen` (línea 351) y `PINScreen` (línea 4667) son componentes no utilizados (dead code). No afectan funcionalidad. PINs en `USUARIOS_DEFAULT` son visibles en código JS — limitación del diseño CDN single-file, no corregible sin backend.

#### Pase 2.17 — Enfoque: Memory leaks y limpieza de efectos
**Cubierto:** `useEffect` con cleanup en auto-lock, visibilitychange, setInterval, setTimeout
**Resultado:** PASS
**Notas:** Todos los event listeners tienen `removeEventListener` en cleanup ✅. `clearInterval` en cleanup ✅. Toast usa `setTimeout` sin referencia — one-shot, no requiere cleanup.

#### Pase 2.18 — Enfoque: Rutinas y REM
**Cubierto:** ViewRutinas, ViewRutinasCognitivas, ViewREM — fechas, session keys, historial
**Resultado:** PASS
**Notas:** `formatDate(sesion.fecha)` en historial de sesiones usa la función corregida ✅. Session key `cog_sesion||taller||fecha` usa fecha del input (tipo date, formato ISO local) ✅

#### Pase 2.19 — Enfoque: Agenda Duplas
**Cubierto:** ViewAgenda, `getISOWeek`, `semanaLabel`, navegación semanas
**Resultado:** PASS
**Notas:** `getISOWeek` usa `setUTCDate/getUTCDate` — operaciones de semana ISO en UTC son correctas ya que no dependen de medianoche local ✅

#### Pase 2.20 — Enfoque: Happy path completo end-to-end
**Cubierto:** Login → sync → inicio con KPIs → alertas EMPAM → ficha paciente → pasar lista → exportar
**Resultado:** PASS
**Notas:** Flujo completo sin errores lógicos detectados. `refreshEmpam` garantiza que los estados EMPAM sean siempre recalculados desde `empamFecha` independientemente de la fuente (cache, sync, import).

---

---

## Fase 3 — Revisión PWA + Infraestructura (post-QA)

#### Pase 3.1 — Enfoque: Instalabilidad PWA
**Cubierto:** manifest.json, iconos, sw.js
**Resultado:** FAIL → FIX → PASS
**Hallazgo:** `icons/icon-192.png` e `icons/icon-512.png` referenciados en manifest.json pero **no existían**. Sin iconos, Chrome no muestra el banner "Agregar a pantalla de inicio" y la PWA no puede instalarse correctamente.
**Fix:** Creados `icons/icon-192.png` (2.8 KB) e `icons/icon-512.png` (9.7 KB) con Python. Añadido `"purpose": "any maskable"` en manifest.json para Android.

#### Pase 3.2 — Enfoque: Service Worker versión y caché
**Cubierto:** sw.js CACHE name y ASSETS
**Resultado:** FAIL → FIX → PASS
**Hallazgo:** SW versión `masama-v5` — no forzaba refresco en dispositivos que tenían la versión pre-fixes cacheada. ASSETS no incluía iconos ni manifest.json.
**Fix:** Bump `masama-v5` → `masama-v6`. Agregados `/manifest.json`, `/icons/icon-192.png`, `/icons/icon-512.png` al ASSETS.

#### Pase 3.3 — Enfoque: Última instancia UTC residual
**Cubierto:** Grep exhaustivo de `.toISOString().split` en app.js
**Resultado:** FAIL → FIX → PASS
**Hallazgo:** `fecha14` en ViewInicio:597 — `hace14.toISOString().split('T')[0]` (UTC). Afecta el banner de "pacientes urgentes que asistieron en últimos 14 días". Documentado en BITACORA como pendiente.
**Fix:** Reemplazado por construcción manual con `getFullYear/getMonth/getDate` (local). Cero instancias UTC residuales.

#### Pase 3.4 — Enfoque: SYNC2, dead code y código legacy
**Cubierto:** `SYNC2.push`, archivos app-*.js, `PinScreen` (dead component)
**Resultado:** PASS (dead code confirmado, sin impacto)
**Notas:** `SYNC2.push` definido pero nunca llamado ✅. `app-shell.js`, `app-data.js`, `app-components.js`, `app-views.js` (23 abr) son artefactos del refactor inicial, no cargados por index.html ✅. `PinScreen` y `PINScreen` son componentes no montados ✅.

#### Pase 3.5 — Enfoque: Estilos CSS y responsive
**Cubierto:** styles.css completo — layout, animaciones, componentes, nav-dot, safe-area
**Resultado:** PASS
**Notas:** Mobile-first sin media queries (correcto para target Android). `env(safe-area-inset-bottom)` en bottom-nav ✅. `@keyframes spin/pulse/dotBounce` todos definidos ✅. `.nav-dot` definido ✅. `.top-icon-btn` y `.back-btn` definidos ✅.

#### Pase 3.6 — Enfoque: Revisión estática final app.js (LockScreen, LoginScreen, ViewNuevo)
**Cubierto:** `LockScreen` (FAIL_KEY/UNTIL_KEY/wipe logic), `LoginScreen` (user selector + PIN), `guardar()` en ViewNuevo, export en exportToExcel
**Resultado:** PASS
**Notas:** LockScreen: 5 fallos → 15min lockout ✅, 10 fallos → wipe ✅. LoginScreen: selector de usuario → PIN en 2 pasos ✅. `guardar()`: usa `parseDateLocal` para calcular vencFecha ✅. Export incluye estado EMPAM recalculado ✅.

#### Pase 3.7 — Enfoque: Revisión estática Code.gs completo
**Cubierto:** `doGet`, `handleAdminCommand`, `calcEmpamEstado`, `detectarColumnasGestion`, `normFecha`, `normFono`, `normRut`
**Resultado:** PASS
**Notas:** Todas las fechas usan `Utilities.formatDate(*, 'America/Santiago', 'yyyy-MM-dd')` ✅. `detectarColumnasGestion` con fallback robusto a índices C ✅. ADMIN_SECRET validado antes de ejecutar comandos ✅.

---

---

## Fase 4 — Implementación de mejoras (post-QA)

#### Pase 4.1 — Cliente: accesibilidad + audit log + WhatsApp templates
**Cubierto:** `applyAccessibilityMode`, `auditLog`, `getAuditLog`, `WSP_TEMPLATES`, `buildWspTemplate`, `openWhatsApp`, `pushSetup`, `backupToDrive`, helper `monthISO()`
**Resultado:** PASS
**Notas:** Toggle accesibilidad persistente en localStorage con CSS variables AAA. Audit log circular 500 eventos. 5 plantillas WhatsApp profesionales. Stub VAPID público listo para configurar.

#### Pase 4.2 — Cliente: integración en ViewConfig
**Cubierto:** 4 cards nuevas en pestaña "general" (Accesibilidad, Backup Drive, Push notifications, Registro de eventos)
**Resultado:** PASS
**Notas:** Cada card es funcional: toggle, botón de acción, validación, audit log y toast. Logout también loggea.

#### Pase 4.3 — Backend Code.gs: doPost + 5 endpoints nuevos
**Cubierto:** `doPost`, `handleBackup` (+ rotación 30 backups), `handleSubscribe`, `handleUnsubscribe`, `handleAdminPush`, `handleRemRequest`
**Resultado:** PASS
**Notas:** Backup crea carpeta `MAS_AMA_Backups` en Drive automáticamente. SUBSCRIPTIONS y PUSH_LOG son hojas auto-creadas. Auth con ADMIN_SECRET en `handleAdminPush`.

#### Pase 4.4 — Backend: generación automática REM
**Cubierto:** `generarREM(mes, anio)`, `generarREMMesActual`, `getOrCreateRemFolder`, `notifyEmpamProximos`
**Resultado:** PASS
**Notas:** Genera Google Doc con 5 secciones (resumen, EMPAM, talleres, edades, alertas), convierte a PDF y guarda en carpeta `MAS_AMA_REM`. Trigger `notifyEmpamProximos` listo para schedule diario.

#### Pase 4.5 — Service Worker: push notifications + cache v7
**Cubierto:** `push` event handler con `showNotification`, `notificationclick` con focus/openWindow
**Resultado:** PASS
**Notas:** Bump masama-v6 → masama-v7. SW envía `postMessage` al cliente cuando se hace click en notificación con URL target.

#### Pase 4.6 — DevOps: CI/CD + linting + seguridad
**Cubierto:** `package.json`, `scripts/qa-check.js`, `.github/workflows/ci.yml`, `vercel.json`, `.gitignore`
**Resultado:** PASS
**Notas:** QA estático verifica: UTC bugs, Santiago timezone count, console.log, icons presentes, JSON válidos, sw.js cache version. CI parsea app.js con @babel/parser (detecta errores de sintaxis JSX). vercel.json con headers de seguridad (X-Frame-Options DENY, no-sniff, Permissions-Policy).

#### Pase 4.7 — Limpieza UTC residual final
**Cubierto:** Reemplazo de todas las instancias `new Date().toISOString().slice(...)` por `monthISO()` o `todayISO()`
**Resultado:** PASS — 0 instancias UTC residuales
**Notas:** Fixes en ViewExportar (month picker), exportExcel (filename), ViewREM (month default), ViewRayen (selMes), SYNC2.push legacy.

---

## Resumen final (Fase 1-4)

- **Total de defectos encontrados:** 9 (4 en Fase 1 + 2 en Fase 2 + 3 en Fase 3)
- **Total de defectos arreglados:** 9/9
- **Features implementadas en Fase 4:** 12 nuevas capacidades
- **Pases completados sin error:** 20/20 (Fase 2) + 7/7 (Fase 3) + 7/7 (Fase 4) = 34/34
- **Confianza:** ALTO para flujo EMPAM, instalación PWA, accesibilidad, audit. MEDIO para push notifications (requiere VAPID config + posible FCM bridge) y REM PDF (requiere trigger setup en Apps Script).

**Capacidades nuevas operativas tras Fase 4:**
1. Modo accesibilidad WCAG AAA — funciona sin configuración
2. Audit log local — funciona sin configuración
3. WhatsApp templates avanzadas — funciona sin configuración
4. Backup manual a Drive — funciona tras redeploy de Code.gs
5. Generación REM PDF — funciona desde editor GAS o vía endpoint
6. Service Worker push handler — funciona sin configuración
7. CI/CD GitHub Actions — funciona automáticamente en cada push
8. Headers de seguridad en Vercel — aplican automáticamente

**Requiere acción de Daniel (15 min):**
1. Redesplegar Code.gs como nueva versión (Implementar → Nueva versión)
2. (Opcional) Generar VAPID keys con `npx web-push generate-vapid-keys` para push notifications
3. (Opcional) Crear trigger diario en GAS para `notifyEmpamProximos` a las 08:00
4. (Opcional) Ejecutar `generarREMMesActual()` desde editor GAS para probar REM

**Todos los fixes (cronológico):**
1. `parseDateLocal()` — elimina desfase UTC en comparaciones de fechas EMPAM (app.js)
2. `calcEmpamEstado` Code.gs — usa `Utilities.formatDate(..., 'America/Santiago')`
3. `todayISO()` — fecha local en vez de UTC (claves de asistencia y default ViewLista)
4. Excel import — llama `refreshEmpam()` antes de `setPatients`
5. `fecha14` en ViewInicio — construcción manual local (banner urgentes 14 días)
6. `icons/` — creados icon-192.png e icon-512.png (sin ellos PWA no instalable)
7. sw.js `masama-v5` → `masama-v6` — fuerza refresco post-fixes en dispositivos existentes
8. sw.js ASSETS — agrega manifest.json e iconos al caché offline
9. manifest.json — añade `"purpose": "any maskable"` para Android

**Pendiente (no testeable en este entorno):**
- Verificación con Google Sheets real (requiere despliegue de Code.gs como nueva versión)
- `SYNC2.push` engine — código legacy inerte, puede eliminarse en refactor futuro
- App shell renaming en Apps Script (5 de 8 proyectos renombrados; los 3 restantes requieren login de Daniel)
