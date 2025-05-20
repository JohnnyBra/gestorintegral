// --- server.js (Estructura Revisada para Arranque Estable) ---
console.log("=======================================");
console.log("Iniciando script server.js...");
console.log("=======================================");

const express = require('express');
console.log("Paso 1: Módulo 'express' importado.");
const sqlite3 = require('sqlite3').verbose();
console.log("Paso 2: Módulo 'sqlite3' importado.");
const bcrypt = require('bcryptjs');
console.log("Paso 3: Módulo 'bcryptjs' importado.");
const jwt = require('jsonwebtoken');
console.log("Paso 4: Módulo 'jsonwebtoken' importado.");
const cors = require('cors');
console.log("Paso 5: Módulo 'cors' importado.");
const path = require('path');
console.log("Paso 6: Módulo 'path' importado.");
require('dotenv').config();
console.log("Paso 7: Módulo 'dotenv' configurado.");

// --- Configuración Inicial ---
const app = express();
console.log("Paso 8: Aplicación Express creada ('app').");
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "TU_JWT_SECRET_EN_DOTENV_O_AQUI_PERO_SEGURO";
console.log(`Paso 9: Puerto configurado a: ${PORT}`);
if (JWT_SECRET === "TU_JWT_SECRET_EN_DOTENV_O_AQUI_PERO_SEGURO") { // Cambia esta cadena literal
    console.warn(" ADVERTENCIA: JWT_SECRET por defecto. ¡Configúralo en .env!");
} else {
    console.log("Paso 10: JWT_SECRET cargado.");
}

// --- Middlewares Globales ---
app.use(cors());
console.log("Paso 11: Middleware 'cors' aplicado.");
app.use(express.json());
console.log("Paso 12: Middleware 'express.json' aplicado.");
app.use(express.urlencoded({ extended: true }));
console.log("Paso 13: Middleware 'express.urlencoded' aplicado.");

app.use(express.static(path.join(__dirname, 'public')));
console.log("Paso 14: Middleware 'express.static' para 'public' configurado.");

// --- Variable global para la BD ---
let db; // Se inicializará más abajo

// --- Middleware de Autenticación JWT ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ error: "Token no proporcionado." });
    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) return res.status(403).json({ error: err.name === 'TokenExpiredError' ? "Token expirado." : "Token inválido." });
        req.user = userPayload; next();
    });
}
console.log("Paso 15: Middleware authenticateToken definido.");

// --- Rutas de la API ---
console.log("Paso 16: Definiendo rutas de API...");
app.get('/api', (req, res) => res.json({ message: "API Gestor Escolar V4 OK" }));

// Auth
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email y pass requeridos." });
    const normalizedEmail = email.toLowerCase();
    db.get("SELECT * FROM usuarios WHERE email = ?", [normalizedEmail], async (err, user) => {
        if (err) { console.error("DB error login:", err.message); return res.status(500).json({ error: "Error interno." }); }
        if (!user) return res.status(401).json({ error: "Credenciales incorrectas." });
        const passwordIsValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordIsValid) return res.status(401).json({ error: "Credenciales incorrectas." });
        let tokenPayload = { id: user.id, email: user.email, rol: user.rol, nombre_completo: user.nombre_completo };
        const expiresIn = '8h';
        if (user.rol === 'TUTOR') {
            db.get("SELECT id, nombre_clase FROM clases WHERE tutor_id = ?", [user.id], (errCl, cl) => {
                if (errCl) console.error("Error buscando clase tutor:", errCl.message);
                if (cl) { tokenPayload.claseId = cl.id; tokenPayload.claseNombre = cl.nombre_clase; }
                else { console.warn(`Tutor ${user.email} no tiene clase asignada.`); }
                const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
                res.json({ token, user: tokenPayload, expiresIn });
            });
        } else {
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
            res.json({ token, user: tokenPayload, expiresIn });
        }
    });
});
app.get('/api/auth/me', authenticateToken, (req, res) => res.json({ usuario: req.user }));

// Usuarios (Solo Dirección)
app.get('/api/usuarios', authenticateToken, (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    db.all("SELECT u.id, u.email, u.nombre_completo, u.rol, c.id as clase_asignada_id, c.nombre_clase as clase_asignada_nombre FROM usuarios u LEFT JOIN clases c ON u.id = c.tutor_id ORDER BY u.nombre_completo", [], (err, usuarios) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ usuarios });
    });
});
app.post('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    const { email, nombre_completo, password, rol, clase_asignada_id } = req.body;
    if (!email || !nombre_completo || !password || !rol) return res.status(400).json({ error: 'Faltan datos.' });
    const normEmail = email.toLowerCase();
    db.get("SELECT id FROM usuarios WHERE email = ?", [normEmail], async (err, exU) => {
        if (err) return res.status(500).json({ error: err.message });
        if (exU) return res.status(400).json({ error: `Email ${email} ya existe.` });
        try {
            const passHash = await bcrypt.hash(password, 10);
            db.run("INSERT INTO usuarios (email,nombre_completo,password_hash,rol) VALUES (?,?,?,?)",
                [normEmail, nombre_completo, passHash, rol], async function (errIns) {
                    if (errIns) return res.status(500).json({ error: errIns.message });
                    const newUID = this.lastID;
                    if (rol === 'TUTOR' && clase_asignada_id != null) {
                        await dbRunAsyncP("UPDATE clases SET tutor_id = NULL WHERE id = ? AND tutor_id IS NOT NULL AND tutor_id != ?", [clase_asignada_id, newUID]).catch(e => console.error("Error desasignando tutor previo:", e));
                        await dbRunAsyncP("UPDATE clases SET tutor_id = ? WHERE id = ?", [newUID, clase_asignada_id]).catch(e => console.error("Error asignando nuevo tutor:", e));
                        res.status(201).json({ usuario: { id: newUID, email: normEmail, nombre_completo, rol, clase_asignada_id } });
                    } else {
                        res.status(201).json({ usuario: { id: newUID, email: normEmail, nombre_completo, rol } });
                    }
                });
        } catch (e) { res.status(500).json({ error: "Error hash pass." }); }
    });
});
app.put('/api/usuarios/:idUsuario', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    const idUsuarioAEditar = parseInt(req.params.idUsuario);
    const { nombre_completo, rol, new_password, clase_asignada_id } = req.body;
    if (isNaN(idUsuarioAEditar)) return res.status(400).json({ error: "ID usuario inválido." });

    let sqlFields = []; let params = [];
    if (nombre_completo) { sqlFields.push("nombre_completo = ?"); params.push(nombre_completo); }
    if (rol && (rol === 'DIRECCION' || rol === 'TUTOR')) { sqlFields.push("rol = ?"); params.push(rol); }
    if (new_password) {
        try { const hash = await bcrypt.hash(new_password, 10); sqlFields.push("password_hash = ?"); params.push(hash); }
        catch (e) { return res.status(500).json({ error: "Error con nueva pass." }); }
    }
    if (sqlFields.length === 0 && clase_asignada_id === undefined) return res.status(400).json({ error: "Sin datos para actualizar." });

    try {
        if (sqlFields.length > 0) {
            const resultInfo = await dbRunAsyncP(`UPDATE usuarios SET ${sqlFields.join(", ")} WHERE id = ?`, [...params, idUsuarioAEditar]);
            if (resultInfo.changes === 0 && (clase_asignada_id === undefined && rol !== 'TUTOR')) { // No hubo cambios y no se está gestionando clase
                 return res.status(404).json({ error: `Usuario ${idUsuarioAEditar} no encontrado o sin cambios directos.` });
            }
        }
        const rolFinal = rol || (await dbGetAsyncP("SELECT rol FROM usuarios WHERE id = ?", [idUsuarioAEditar])).rol;
        if (rolFinal === 'TUTOR' && clase_asignada_id !== undefined) { // Si es tutor y se quiere (re)asignar clase
            await dbRunAsyncP("UPDATE clases SET tutor_id = NULL WHERE tutor_id = ? AND (? IS NULL OR id != ?)", [idUsuarioAEditar, clase_asignada_id, clase_asignada_id === null ? -1 : clase_asignada_id ]);
            if (clase_asignada_id !== null) { // Si se asigna a una clase (no si se desasigna con null)
                await dbRunAsyncP("UPDATE clases SET tutor_id = ? WHERE id = ?", [idUsuarioAEditar, clase_asignada_id]);
            }
        } else if (rolFinal === 'DIRECCION') { // Si se cambia a Dirección, desasignar de cualquier clase
            await dbRunAsyncP("UPDATE clases SET tutor_id = NULL WHERE tutor_id = ?", [idUsuarioAEditar]);
        }
        res.json({ message: `Usuario ID ${idUsuarioAEditar} actualizado.` });
    } catch (e) { res.status(500).json({error: "Error actualizando usuario o asignación: " + e.message}); }
});
app.delete('/api/usuarios/:idUsuario', authenticateToken, (req, res) => { /* ... (código DELETE usuarios que te di antes) ... */ });

// Clases
app.get('/api/clases', authenticateToken, (req, res) => { /* ... (código GET clases que te di antes) ... */ });
app.post('/api/clases', authenticateToken, (req, res) => { /* ... (código POST clases que te di antes) ... */ });
app.get('/api/clases/:idClase', authenticateToken, (req,res)=>{ /* ... (código GET clase por ID que te di antes) ... */});
app.put('/api/clases/:idClase', authenticateToken, async (req, res) => { // Adaptado para usar promesas
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    const idClase = parseInt(req.params.idClase);
    const { nombre_clase, tutor_id } = req.body; // tutor_id puede ser null para desasignar
    if (isNaN(idClase)) return res.status(400).json({ error: "ID de clase inválido." });
    try {
        const claseExistente = await dbGetAsyncP("SELECT * FROM clases WHERE id = ?", [idClase]);
        if (!claseExistente) return res.status(404).json({ error: `Clase ID ${idClase} no encontrada.` });
        const nombreFinal = (nombre_clase ? nombre_clase.toUpperCase() : claseExistente.nombre_clase);
        const tutorIdFinal = (tutor_id === undefined) ? claseExistente.tutor_id : (tutor_id === null || tutor_id === "" ? null : parseInt(tutor_id));

        if (nombre_clase && nombreFinal.toLowerCase() !== claseExistente.nombre_clase.toLowerCase()) {
            const otraClaseMismoNombre = await dbGetAsyncP("SELECT id FROM clases WHERE nombre_clase = ? AND id != ?", [nombreFinal, idClase]);
            if (otraClaseMismoNombre) return res.status(400).json({ error: `Nombre de clase '${nombreFinal}' ya en uso.` });
        }
        if (tutorIdFinal !== null) { // Si se intenta asignar un tutor
            const tutorInfo = await dbGetAsyncP("SELECT rol FROM usuarios WHERE id = ?", [tutorIdFinal]);
            if (!tutorInfo) return res.status(400).json({ error: `Usuario tutor ID ${tutorIdFinal} no existe.` });
            if (tutorInfo.rol !== 'TUTOR') return res.status(400).json({ error: `Usuario ID ${tutorIdFinal} no es un tutor.` });
            // Desasignar este tutor de cualquier otra clase ANTES de asignarlo a esta.
            await dbRunAsyncP("UPDATE clases SET tutor_id = NULL WHERE tutor_id = ? AND id != ?", [tutorIdFinal, idClase]);
        }
        await dbRunAsyncP("UPDATE clases SET nombre_clase = ?, tutor_id = ? WHERE id = ?", [nombreFinal, tutorIdFinal, idClase]);
        res.json({ message: `Clase ID ${idClase} actualizada.` });
    } catch (e) { res.status(500).json({ error: "Error actualizando clase: " + e.message }); }
});
app.delete('/api/clases/:idClase', authenticateToken, (req, res) => { /* ... (código DELETE clases que te di antes) ... */ });

// Alumnos, Excursiones, Participaciones (pega aquí tus CRUDs completos para estas entidades)
// ...
// ...
// ...

// Dashboard
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => { /* ... (código GET dashboard que te di antes) ... */ });

console.log("Paso 17: Definiciones de rutas completadas.");

// --- Helpers para Promesas con DB (colócalos cerca del inicio o antes de usarlos) ---
function dbGetAsyncP(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}
function dbRunAsyncP(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) { (err ? reject(err) : resolve(this)); });
    });
}
function dbAllAsyncP(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}
console.log("Paso Aux: Helpers de BD con Promesas definidos.");


// --- INICIAR CONEXIÓN BD Y SERVIDOR ---
const DB_FILE_PATH = path.join(__dirname, "database.db");
console.log(`Paso 18: Intentando conectar a BD en: ${DB_FILE_PATH}`);

db = new sqlite3.Database(DB_FILE_PATH, (err) => { // Re-asigna la variable global 'db'
    if (err) {
        console.error("Error FATAL al conectar con la base de datos:", err.message);
        process.exit(1);
    }
    console.log('Paso 19: Conectado a la base de datos SQLite (database.db).');
    db.run("PRAGMA foreign_keys = ON;", (fkErr) => {
        if (fkErr) console.error("Paso 20: Error habilitando FKs:", fkErr.message);
        else console.log("Paso 20: Claves foráneas habilitadas.");

        console.log("Paso 21: Intentando iniciar app.listen()...");
        app.listen(PORT, () => {
            console.log("====================================================");
            console.log(`      Servidor backend CORRIENDO en http://localhost:${PORT}`);
            console.log(`      Endpoints API disponibles en http://localhost:${PORT}/api`);
            console.log("      Para detener el servidor: Ctrl+C");
            console.log("====================================================");
        });
        console.log("Paso 22: Llamada a app.listen() realizada desde callback de BD.");
    });
});

console.log("Paso 23: Fin del script server.js (antes de callbacks principales).");

process.on('SIGINT', () => {
    console.log('\nSIGINT. Cerrando BD y servidor...');
    db.close(err => {
        if (err) console.error("Error cerrando BD:",err.message);
        else console.log('Conexión BD cerrada.');
        process.exit(0);
    });
});
