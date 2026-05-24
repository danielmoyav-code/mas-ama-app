# MAS AMA Pro — Roadmap de Mejoras Profesional

**Fecha:** 2026-05-24  
**Estado del proyecto:** Producción · QA Fase 1+2+3 completada (9 bugs corregidos)  
**Stack actual:** React 18 CDN + Babel inline + localStorage + Google Apps Script + Vercel  

---

## 📊 Diagnóstico ejecutivo

### Fortalezas actuales
- ✅ Flujo EMPAM robusto post-QA (timezone Santiago consistente cliente↔servidor)
- ✅ Offline-first básico vía localStorage + Service Worker
- ✅ Multi-usuario con roles JEFE/KINE y auto-lock
- ✅ Sync read-only seguro contra Google Sheets
- ✅ Sin dependencias npm (bundle único, despliegue inmediato)

### Limitaciones técnicas detectadas
| # | Limitación | Impacto |
|---|------------|---------|
| L1 | `localStorage` limitado a ~5 MB | Con >1000 pacientes + asistencias se llena |
| L2 | Sin push notifications | Daniel/equipo no se entera de EMPAM vencidos automáticamente |
| L3 | Sin error tracking remoto | Bugs en celulares de usuarios pasan desapercibidos |
| L4 | Babel inline (transpila en navegador) | ~300ms de lag en cada carga; CPU alta en celulares viejos |
| L5 | Single-file 5800 líneas | Difícil de mantener, sin tree-shaking |
| L6 | Sin tests automatizados | Cada cambio requiere QA manual completa |
| L7 | PINs hardcoded en código | Cualquier user con DevTools los ve |
| L8 | Sin telemetría de uso | No sabemos qué features se usan, qué tarda más |
| L9 | Sin recordatorios WhatsApp automáticos | Cada kine debe enviar manualmente |
| L10 | Sin integración con MINSAL/FONASA | Doble carga manual de datos clínicos |

---

## 🎯 Quick Wins — Días (esfuerzo bajo, impact alto)

### QW1 · Push Notifications nativas para EMPAM vencidos
**Qué:** Cuando un EMPAM vence en 7 días, push automático al celular de Daniel/kine asignado.  
**Cómo:** Web Push API + VAPID keys (gratis, estándar W3C). Service Worker ya está, falta:
- Pedir permiso al login
- Endpoint en Code.gs que reciba el `subscription` y lo guarde en hoja `SUBSCRIPTIONS`
- Trigger diario en GAS que recorre pacientes con EMPAM próximo a vencer y dispara notificaciones
**Esfuerzo:** 1-2 días  
**Costo:** $0 (Web Push API es nativo)  
**Impact:** ALTO — no más EMPAM olvidados

### QW2 · Botón "Recordar por WhatsApp" usando deep links
**Qué:** Ya existe `wa.me/56${fono}` en ViewAlertas. Mejorar con plantillas pre-redactadas.  
**Cómo:** Plantilla por tipo de alerta (vencido, próximo, asistencia baja). Personalización con `{nombre}`, `{fecha}`, `{taller}`.  
**Esfuerzo:** 4 horas  
**Costo:** $0  
**Impact:** MEDIO — reduce fricción para Daniel

### QW3 · Backup automático a Google Drive
**Qué:** Cada vez que se importa Excel o cambia mucho la data, subir snapshot JSON a Drive.  
**Cómo:** Apps Script tiene `DriveApp.createFile()`. Endpoint nuevo en Code.gs `?action=backup` recibe JSON, guarda en carpeta dedicada con timestamp.  
**Esfuerzo:** 4 horas  
**Costo:** $0  
**Impact:** ALTO — protege contra wipe accidental o pérdida de celular

### QW4 · Modo "alta contraste" para adultos mayores
**Qué:** Toggle en Config que aumenta tamaños de fuente, contraste a 7:1 (AAA) y simplifica nav.  
**Cómo:** CSS variables ya definidas. Agregar `[data-mode="accessible"]` con overrides. `font-size:18px` mínimo, line-height 1.5.  
**Esfuerzo:** 1 día  
**Costo:** $0  
**Impact:** MEDIO — útil si la app llega a manos de pacientes directamente

### QW5 · Error tracking gratis con GlitchTip
**Qué:** Capturar JS errors de usuarios en producción, agruparlos, ver stack traces.  
**Cómo:** GlitchTip es Sentry-SDK compatible. Self-host en VPS de $5/mes o usar tier gratuito de cloud.  
**Esfuerzo:** 2-3 horas  
**Costo:** $0–5/mes  
**Impact:** ALTO — bugs invisibles ahora serán visibles

### QW6 · Telemetría básica con PostHog
**Qué:** Saber qué pantallas usa cada kine, dónde abandonan, qué tarda más.  
**Cómo:** Snippet posthog-js gratis hasta 1M eventos/mes. Sin PII, solo eventos anónimos.  
**Esfuerzo:** 2 horas  
**Costo:** $0  
**Impact:** MEDIO — informa decisiones de producto

---

## 🚀 Próximo nivel — Semanas (esfuerzo medio, impact alto)

### NL1 · Migrar localStorage → IndexedDB con Dexie.js
**Por qué:** localStorage tiene tope de ~5 MB y es sync (bloquea UI). Con 1000+ pacientes + 1 año de asistencia ya se llena.  
**Qué:** Dexie es 7 KB, IndexedDB-wrapper, soporta queries indexados.  
**Migración progresiva:**
1. Crear `DB.indexed` paralelo a `DB.localStorage`
2. Migración one-way al abrir la app si detecta data legacy
3. Mantener API similar (`DB.get`, `DB.set`) para no tocar 5800 líneas
**Esfuerzo:** 3-5 días  
**Costo:** $0  
**Impact:** ALTO — escala a 10000+ pacientes sin problemas

### NL2 · Build process con esbuild (eliminar Babel inline)
**Por qué:** Babel CDN transpila JSX en runtime → 300ms+ lag en cada carga. esbuild compila en 100ms.  
**Qué:** esbuild bundle único de app.js, sourcemaps para debugging, minify.  
**Cómo:** Script Node.js de 10 líneas. CI en GitHub Actions pre-deploy.  
**Esfuerzo:** 1 día  
**Costo:** $0  
**Impact:** ALTO — app carga 3x más rápido en celulares Android viejos

### NL3 · WhatsApp Business API automático (Twilio o WasenderAPI)
**Por qué:** Hoy cada kine envía mensajes a mano. Con WhatsApp Business API, mensajes masivos personalizados con un click.  
**Opciones:**
| Proveedor | Costo | Notas |
|-----------|-------|-------|
| Twilio | $0.005-0.05/msg | Más confiable, BAA disponible |
| WasenderAPI | $6/mes plano | Más barato, menos features |
| Meta Business Platform directo | Variable | Requiere verificación de número |
**Use cases:**
- Recordar EMPAM próximo a vencer (7, 3, 1 días antes)
- Recordar sesión del taller día previo
- Alerta de inasistencia 2 sesiones consecutivas
**Esfuerzo:** 1 semana (incluye verificación de WhatsApp Business)  
**Costo:** ~$10-30/mes para volúmenes de MAS AMA  
**Impact:** ALTO — reduce no-shows 30-40%

### NL4 · Dashboard analítico con Apps Script + Sheets
**Por qué:** Hoy Daniel tiene que abrir el Excel exportado para ver tendencias. Necesita un panel en vivo.  
**Qué:** Hoja en Google Sheets con:
- Gráficos de asistencia mensual por taller
- Evolución EMPAM (vencidos vs vigentes)
- Top 10 pacientes con riesgo
- TUG/EUP/HAQ promedios pre vs post por kine
**Cómo:** GAS lee data de la PWA o de la planilla maestra, popular hoja DASHBOARD con `getValues()/setValues()`. Charts nativos de Sheets.  
**Esfuerzo:** 3-4 días  
**Costo:** $0  
**Impact:** ALTO — Daniel deja de exportar Excel manualmente

### NL5 · Generación automática de informe REM PDF
**Por qué:** REM es informe mensual obligatorio para MINSAL. Hoy se arma manual.  
**Qué:** Apps Script genera un Google Doc con plantilla, mete los números calculados, exporta como PDF.  
**Cómo:** `DocumentApp.create()` + plantilla con placeholders `{{TOTAL_PACIENTES}}`, `{{ASISTENCIA_PROMEDIO}}`, etc.  
**Esfuerzo:** 3 días  
**Costo:** $0  
**Impact:** ALTO — ahorra horas mensuales de papeleo

### NL6 · Sincronización 2-way (push + pull)
**Por qué:** Hoy sync es solo lectura. Cuando un kine registra paciente nuevo localmente, queda solo en su celular hasta que Daniel actualice el Excel manualmente.  
**Qué:** Activar el `SYNC2.push` que ya está implementado pero inerte. Endpoint en Code.gs `?action=push` que recibe pacientes "dirty" y los inserta en hoja "NUEVOS_DESDE_APP".  
**Esfuerzo:** 1 semana (incluye QA exhaustiva de conflictos)  
**Costo:** $0  
**Impact:** ALTO — colaboración real entre kines

---

## 🌟 Visión futura — Meses (esfuerzo alto, impact transformador)

### VF1 · Integración con Claude API para asistencia clínica
**Use cases:**
1. **Resumen automático de evolución del paciente** — Claude lee historial clínico (TUG/EUP/HAQ pre vs post) y genera párrafo profesional.
2. **Sugerencia de plan de rutinas** — Dado el perfil del paciente (edad, EMPAM, alteraciones), Claude propone secuencia personalizada.
3. **Triage de mensajes** — Si Daniel recibe muchas consultas vía WhatsApp, Claude categoriza urgencia y sugiere respuesta.

**Importante:** Anthropic ofrece **Claude for Healthcare** con BAA HIPAA-ready desde 2026. Para Chile (Ley 19.628), aplican consideraciones similares.

**Esfuerzo:** 2-4 semanas por feature  
**Costo:** $5-20/mes según volumen  
**Impact:** TRANSFORMADOR — eleva la app de gestión a asistente clínico

### VF2 · Integración con MINSAL API
**Por qué:** MINSAL publica APIs OAuth2 para Atención Primaria desde 2026.  
**Endpoints útiles:**
- Datos demográficos verificados (RUT → nombre, dirección, FONASA)
- Historial de prestaciones (saber si paciente tiene EMPAM hecho en otro CESFAM)
**Bloqueo:** Requiere acreditación institucional CESFAM Félix de Amesti como consumidor API.  
**Esfuerzo:** 1-2 meses (incluye papeleo)  
**Costo:** $0  
**Impact:** ALTO — elimina entrada manual de RUT/nombre

### VF3 · Adopción del Community Health Toolkit (CHT)
**Qué:** Framework open-source de Medic.org desplegado en 15 países, ~40k trabajadores de salud comunitaria.  
**Features:** Messaging, task management, decision support workflows, longitudinal profiles, analytics.  
**Por qué considerarlo:** MAS AMA está reinventando muchas piezas que CHT ya resolvió.  
**Trade-off:** CHT es Android nativo + servidor CouchDB. Más complejo de operar pero más maduro.  
**Recomendación:** Evaluar con piloto de 1 mes antes de comprometerse. No reemplazar lo que funciona.

### VF4 · App nativa (React Native / Capacitor)
**Por qué:** PWA tiene limitaciones en iOS (push notifications irregulares, instalación poco intuitiva).  
**Opciones:**
- **Capacitor:** Envuelve la PWA existente en wrapper nativo. Cambio mínimo en código.
- **React Native:** Reescritura completa. Más performance, más complejo.
**Recomendación:** Si el equipo crece y hay usuarios iOS, ir por Capacitor primero.

---

## 🔧 Infraestructura / DevOps

### DV1 · GitHub Actions CI/CD
**Qué:** Pipeline que en cada push a `main`:
1. Lint con ESLint
2. Build con esbuild (NL2)
3. Smoke tests con Playwright headless
4. Deploy a Vercel preview
5. Si pasa todo, promover a prod
**Esfuerzo:** 1 día  
**Costo:** $0 (free tier de Actions)

### DV2 · Versionado semántico + changelog automático
**Qué:** Cada release con tag `v1.2.3`, changelog auto-generado de commits.  
**Herramienta:** `release-please` de Google Cloud.  
**Esfuerzo:** 4 horas

### DV3 · Multi-environment (staging / prod)
**Qué:** Branch `develop` → staging.mas-ama.vercel.app. Branch `main` → prod.  
**Por qué:** Probar cambios antes que lleguen al equipo de kines.  
**Esfuerzo:** 2 horas (Vercel maneja branch deploys nativamente)

### DV4 · Monitoreo de uptime
**Herramienta:** UptimeRobot (gratis hasta 50 monitores) o Better Stack.  
**Alertas:** Email/WhatsApp si la app o el GAS endpoint cae.  
**Esfuerzo:** 30 min

---

## 🎨 UX / Accesibilidad para Adultos Mayores

### UX1 · Cumplimiento WCAG 2.2 nivel AA mínimo
**Acciones:**
- Verificar contraste con axe DevTools (target: 4.5:1 normal, 7:1 AAA)
- `font-size` mínimo 16px en cuerpo, 18px en interacciones críticas
- Botones mínimo 44x44px (Apple HIG) o 48x48px (Material)
- `line-height: 1.5` mínimo
- `lang="es"` en `<html>` ✅ (ya está)

### UX2 · Modo "kine senior" 
**Qué:** Toggle que reduce densidad de información, agranda CTA principal de cada vista.  
**Inspiración:** Apps como WhatsApp tienen este modo.

### UX3 · Tutorial interactivo primera vez
**Qué:** Overlay tipo Intro.js que recorre las 4 funciones principales.  
**Herramienta:** Shepherd.js (gratis, 30 KB).  
**Esfuerzo:** 1 día

---

## 🔌 Conectores e Integraciones — ya disponibles en esta sesión

Estos MCP connectors están conectados en este entorno Claude y podrían usarse para automatizar workflows administrativos del proyecto:

| Conector | Use case en MAS AMA |
|----------|---------------------|
| **Gmail** | Enviar reporte semanal por correo a coordinador CESFAM |
| **Google Calendar** | Sincronizar fechas EMPAM con calendario de Daniel automáticamente |
| **Google Drive** | Backup automático de exports Excel (QW3) |
| **Figma** | Si se diseña una nueva pantalla, generar código React Connect |
| **PDF Tools** | Convertir REM/informes a PDF firmable |

### Skills de Claude Code aplicables
| Skill | Use case |
|-------|----------|
| `claude-api` | Implementar VF1 (asistente clínico con Claude) |
| `data:build-dashboard` | Implementar NL4 (dashboard analítico) |
| `data:explore-data` | Análisis ad-hoc de la base de pacientes |
| `anthropic-skills:xlsx` | Mejorar parser Excel y exports |
| `anthropic-skills:pdf` | Generar REM (NL5) |
| `iterative-app-qa` | Re-ejecutar QA tras cambios grandes |
| `security-review` | Auditar Code.gs antes de exponer endpoints nuevos |

---

## 🤖 Ideas inspiradas en apps similares

### Doctolib (FR) / TopDoctors (LATAM)
- Recordatorios SMS+WhatsApp+Email escalonados
- Confirmación de asistencia con 1 click
- Lista de espera automática

### MyChart (Epic) / Apple Health
- Timeline visual de eventos del paciente
- Compartir snapshot con familiar

### Babylon Health
- Triage por síntomas vía chat
- Adaptable: chat para que kine consulte protocolos

### CHT / Medic Mobile
- Tareas pendientes por trabajador con prioridad
- Reportes geo-localizados
- Encuestas dinámicas (formularios configurables sin código)

### MINSAL Portal Paciente
- Portal donde paciente ve sus citas y EMPAM
- Idea: Generar QR único por paciente que muestre su estado

---

## 💰 Estimación económica anual

| Item | Costo anual estimado |
|------|---------------------|
| Vercel (gratis Hobby tier) | $0 |
| Google Workspace (asumido del CESFAM) | $0 |
| WhatsApp Business API (Twilio, ~1500 msgs/mes) | $90-180 |
| Sentry/GlitchTip self-hosted (VPS $5/mes) | $60 |
| Claude API (uso moderado, ~10k requests/mes) | $120-240 |
| UptimeRobot (gratis) | $0 |
| Dominio (.cl, .health) | $30-50 |
| **TOTAL** | **~$300-530/año** |

Comparado con un sistema comercial tipo Epic, Cerner o incluso un SaaS local: **2-3 órdenes de magnitud más barato**.

---

## 🚦 Roadmap recomendada (priorizada por ROI)

### Sprint 1 — Próximas 2 semanas
1. ✅ QW3: Backup automático a Drive
2. ✅ QW5: Error tracking con GlitchTip
3. ✅ QW6: Telemetría con PostHog
4. ✅ DV1: GitHub Actions CI/CD
5. ✅ DV4: Monitoreo de uptime

### Sprint 2 — Mes 2
1. NL2: Build con esbuild
2. NL1: IndexedDB con Dexie
3. QW1: Push notifications
4. QW4: Modo accesible

### Sprint 3 — Mes 3
1. NL3: WhatsApp Business API
2. NL4: Dashboard analítico
3. NL5: REM PDF automático

### Sprint 4 — Mes 4+
1. NL6: Sync 2-way (push)
2. VF1: Claude API piloto (resumen evolución)
3. VF2: Iniciar acreditación MINSAL

---

## 🔐 Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|-----------|
| Filtración de datos clínicos | MEDIA | Cifrado en reposo (Web Crypto API), audit logs, rotación de admin secret |
| Pérdida de celular con app instalada | ALTA | Auto-lock 5min + remote wipe (ya implementado ✅) + 2FA opcional |
| Caída de Google Sheets | BAJA | Backup diario a Drive (QW3) + fallback localStorage |
| Cambio de número de WhatsApp del kine | ALTA | Onboarding wizard solicita confirmar número c/3 meses |
| Saturación localStorage | MEDIA | Migración a IndexedDB (NL1) antes de superar 500 pacientes |
| Sesión de Claude/Daniel expirada en GAS | ALTA | Sistema de tokens + refresh automático |

---

## 📚 Recursos y referencias

**Comunidad open source:**
- [Community Health Toolkit (CHT)](https://communityhealthtoolkit.org/) — framework de referencia
- [Dexie.js](https://dexie.org/) — IndexedDB wrapper
- [GlitchTip](https://glitchtip.com/) — Sentry alternativa open-source

**Estándares oficiales:**
- [WCAG 2.2 W3C](https://www.w3.org/TR/WCAG22/) — accesibilidad
- [API MINSAL](https://devportal.minsal.cl/) — interoperabilidad Chile
- [Datos Abiertos FONASA](https://datosabiertos.fonasa.cl/) — datasets públicos
- [Portal Salud Digital MINSAL](https://portalsaluddigital.minsal.cl/) — estrategias 2026

**IA en salud:**
- [Claude for Healthcare (Anthropic)](https://www.anthropic.com/news/healthcare-life-sciences)
- [Hathr.AI HIPAA-compliant Claude](https://www.hathr.ai/hipaa-compliant-ai-api)

**WhatsApp Business:**
- [Twilio WhatsApp API](https://www.twilio.com/en-us/messaging/channels/whatsapp)
- [WasenderAPI](https://www.wasenderapi.com/)

**Error tracking gratis:**
- [GlitchTip](https://glitchtip.com/)
- [PostHog](https://posthog.com/) — analytics + product
- [OneUptime](https://oneuptime.com/) — observabilidad completa

---

*Generado tras revisión profesional 2026-05-24 · Co-Authored-By: Claude Sonnet 4.6*
