/**
 * MejoraNucleo - Punto de entrada del paquete central de persistencia
 */
export { getDb, getDbStatus, closeDb, applyMigrations } from './db/connection.mjs';
export { ContactoRepository, parseContactoCanonical } from './models/Contacto.mjs';
export { UsuarioRepository, parseUsuarioCanonical } from './models/Usuario.mjs';
export { server } from './server.mjs';
