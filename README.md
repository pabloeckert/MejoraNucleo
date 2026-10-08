# ⚠️ AVISO DE ARQUITECTURA — REPOSITORIO HISTÓRICO CONGELADO

> [!WARNING]
> **Repositorio Prototipo No Activo:**
> Este repositorio (`MejoraNucleo`) corresponde al prototipo inicial independiente de base de datos SQLite y Electron.
> 
> El **motor oficial, activo y en producción** de la persistencia de datos SQLite, migraciones y API relacional del ecosistema se encuentra consolidado y empaquetado en:
> 👉 **`c:\github\MejoraSuite\packages\nucleo`** (`@mejora/nucleo`)

---

## Directivas para Desarrolladores y Agentes IA
1. **No aplicar migraciones aquí:** Todas las nuevas tablas, índices o alteraciones de esquema SQLite deben crearse en `MejoraSuite/packages/nucleo/migrations/`.
2. **No crear conexiones duplicadas:** La base de datos soberana de Mejora Continua se gestiona a través del paquete `@mejora/nucleo` en el monorepo central de `MejoraSuite`.
3. **Estado de Git:** Este repositorio se mantiene únicamente como referencia histórica de la arquitectura inicial. No commitear código de producción en esta rama.
