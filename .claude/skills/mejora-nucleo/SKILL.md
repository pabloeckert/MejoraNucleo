---
name: mejora-nucleo
description: Usar esta skill al trabajar en el nucleo Mejora o en cualquier repo clonado desde el (Carnicería, TallerWaldi, Libreria, o un cliente nuevo) que necesite el modelo de datos base de negocio - catalogo de productos o servicios, caja, turnos, clientes, transacciones. Se activa al crear el esqueleto de un negocio nuevo, al tocar el schema de base de datos, o al decidir en que entidad va un campo nuevo.
---

# Nucleo Mejora - modelo de datos reciclable

## Que es esto
Motor de datos unico, pensado para reciclarse entre negocios de cualquier rubro. La logica no cambia por rubro - lo que cambia es la configuracion (nombre, categorias, terminologia) y cual de los dos catalogos usa el negocio.

## Decision de arquitectura: Electron + SQLite local, no Supabase
El usuario final no tiene conocimiento tecnico, necesita funcionar sin internet, y no debe depender de un login ni de un costo de infraestructura por cliente. MejoraCRM y MejoraApp son una familia aparte (SaaS propio en Supabase) - no mezclar esa arquitectura con el nucleo.

## Las seis entidades (schema cerrado, validado con input de negocio real)

**Negocio** - id, nombre, rubro, moneda, catalogo_activo (producto/servicio/ambos).

**Usuario** - id, nombre, rol (dueno/gerente/vendedor), pin.

**TurnoCaja** - id, usuario_id, monto_apertura, monto_cierre, fecha_apertura, fecha_cierre, diferencia.

**Cliente** - id, nombre, whatsapp, instagram_tiktok, empresa (opcional), cargo (opcional), tag (frecuente/ocasional), notas.

**Item** - id, tipo (producto/servicio), nombre, categoria, descripcion (beneficio en una frase), precio_costo (si aplica), precio_venta, stock (si es producto), duracion (si es servicio), tiempo_entrega (opcional), alerta_stock_minimo.

**Transaccion** - id, turno_id, cliente_id (opcional), fecha, lineas (item_id + cantidad + precio_unitario), total, medio_pago (efectivo/tarjeta/transferencia/QR), forma_pago (contado/financiado).

**MovimientoCaja** - id, turno_id, tipo (venta/gasto/ajuste), categoria (servicios/proveedores/sueldos/caja_chica/operativo - solo si tipo=gasto), monto, motivo, fecha.

## Los dos catalogos intercambiables
Catalogo-Producto (con stock) para negocios que venden algo fisico.
Catalogo-Servicio (con duracion) para negocios que venden turnos o tiempo.
Un negocio puede activar uno o los dos via catalogo_activo en Negocio.

## Que NO va en el schema, y por que
- Ticket promedio, cantidad de ventas: se calculan sobre Transaccion, van a reportes, no son campos guardados.
- Quien atendio a cada cliente: ya sale de Transaccion, turno_id, usuario_id. No se duplica.

## Backlog v2 - decidido, no implementado, no perder esto
1. Permisos por rol configurables por el dueno (hoy el rol es fijo: cada rol tiene una vista predefinida, no editable). Se activa cuando el primer cliente real lo pida.
2. Feedback post-venta (entidad FeedbackVenta ligada a Transaccion: atencion, rapidez, transparencia). Se activa cuando el negocio tenga volumen para medirlo o un cliente lo pida como diferencial.

## Como aplicar esto a un negocio nuevo
1. Clonar este repo (Nucleo) hacia Clientes/nombre-del-negocio.
2. Definir el business-config propio: nombre, rubro, moneda, catalogo_activo, categorias del rubro.
3. No tocar las seis entidades base salvo que aparezca un caso realmente nuevo. Si aparece, es una decision de arquitectura que se discute antes de tocar codigo, no se improvisa en el momento.
