# Reporte de auditoría — Nucleo

Fecha: 2026-09-10

## Resumen ejecutivo

Repo chico (20 archivos) y muy limpio. Working tree inicial limpio salvo `CLAUDE.md` sin trackear (copia del criterio global). 2 commits en `master`, nada raro preexistente.

## Hallazgos por severidad

- **Media**: quedan 5 vulnerabilidades (3 high, 2 moderate) que requieren bump mayor de Electron (31→44) y de Vite/electron-vite (5→8 / 2→5). No aplicado — requiere decisión humana por el riesgo de romper compatibilidad.
- **Baja**: `sandbox: false` en `src/main/index.ts` — revisar si sigue siendo necesario o si se puede endurecer.
- **Baja**: columna `pin` de `Usuario` guardada en texto plano — decidir si se hashea al implementar login real.
- **Baja**: no hay ESLint configurado (sin script `lint`) — el repo se usa como base para clonar negocios nuevos, vale la pena agregarlo.
- **Baja**: inconsistencia de documentación — `.claude/skills/mejora-nucleo/SKILL.md` y el comentario de `migrations/001_init.sql` dicen "seis entidades" pero el schema tiene siete tablas.

## Verificado sano

- Sin secretos trackeados (`.gitignore` excluye `*.db*` correctamente; `business-config.json` es solo un template vacío).
- Sin basura (`out/`, `node_modules/` bien gitignoreados; sin `.DS_Store`, logs, ni código comentado).
- `npm run typecheck` y `npm run build` pasan limpio.

## Acciones tomadas

- `npm audit fix` (no-breaking): resolvió 6 de 11 vulnerabilidades, solo tocó `package-lock.json`.
- `npm update @types/node autoprefixer`: únicos 2 patch bumps disponibles dentro del rango semver ya declarado.
- Verificado que `typecheck`/`build` siguen OK después de los cambios.
- Nada comiteado, nada pusheado.

## Pendientes que requieren decisión humana

1. Bump mayor de Electron (31→44) y Vite/electron-vite (5→8 / 2→5) para resolver las 5 vulnerabilidades restantes.
2. Revisar si `sandbox: false` en `src/main/index.ts` sigue siendo necesario.
3. Decidir si hashear la columna `pin` de `Usuario` cuando se implemente login.
4. Decidir qué hacer con el `CLAUDE.md` sin trackear (comitear, gitignorear o borrar).
5. Corregir la inconsistencia "seis entidades" → siete, en la skill y en el comentario de la migración.
6. Evaluar agregar ESLint al repo base.
