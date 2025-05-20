// --- server.js (Revisado desde tu repositorio, con enfoque en arranque estable) ---
console.log("=======================================");
console.log("Iniciando script server.js (Versión Repositorio Revisada)...");
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
console.log("Paso 7: Módulo 'dotenv' configurado (o intentado).");

// --- Configuración Inicial ---
const app = express();
console.log("Paso 8: Aplicación Express creada ('app').");
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "TU_JWT_SECRET_EN_DOTENV_O_AQUI_PERO_SEGURO_Y_CONSISTENTE"; // Asegúrate que sea el mismo que usas para firmar/verificar

console.log(`Paso 9: Puerto configurado a: ${PORT}`);
if (JWT_SECRET === "TU_JWT_SECRET_EN_DOTENV_O_AQUI_PERO_SEGURO_Y_CONSISTENTE") {
    console.warn(" ADVERTENCIA: Estás usando un JWT_SECRET por defecto en server.js. Configúralo en .env para mayor seguridad.");
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

// Servir archivos estáticos del frontend desde la carpeta 'public'
// Esta línea es crucial para que tu index.html y app.js se sirvan.
app.use(express.static(path.join(__dirname, 'public')));
console.log("Paso 14: Middleware 'express.static' para 'public' configurado.");

// --- Variable global para la BD ---
// Se inicializará dentro del bloque de conexión.
let db;

// --- Middleware de Autenticación JWT ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ error: "Token no proporcionado." });

    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) {
            console.warn("Error de verificación de token:", err.name, err.message);
            return res.status(403).json({ error: err.name === 'TokenExpiredError' ? "Token expirado." : "Token inválido." });
        }
        req.user = userPayload;
        next();
    });
}
console.log("Paso 15: Middleware authenticateToken definido.");

// --- Rutas de la API ---
// (Aquí se definirán todas tus rutas app.get, app.post, etc.)
// COMIENZO DE DEFINICIÓN DE RUTAS
console.log("Paso 16: Definiendo rutas de API...");

app.get('/api', (req, res) => {
    console.log("  >> Petición GET /api recibida.");
    res.json({ message: "API del Gestor Escolar Funcionando Correctamente!" });
});

// Auth
app.post('/api/auth/login', (req, res) => {
    console.log("  >> Petición POST /api/auth/login recibida.");
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email y pass requeridos." });
    const normalizedEmail = email.toLowerCase();
    db.get("SELECT * FROM usuarios WHERE email = ?", [normalizedEmail], async (err, user) => {
        if (err) { console.error("DB error login:", err.message); return res.status(500).json({ error: "Error interno." }); }
        if (!user) return res.status(401).json({ error: "Credenciales incorrectas (email no encontrado)." });
        const passwordIsValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordIsValid) return res.status(401).json({ error: "Credenciales incorrectas (contraseña)." });
        let tokenPayload = { id: user.id, email: user.email, rol: user.rol, nombre_completo: user.nombre_completo };
        const expiresIn = '8h';
        if (user.rol === 'TUTOR') {
            db.get("SELECT id, nombre_clase FROM clases WHERE tutor_id = ?", [user.id], (errCl, cl) => {
                if (errCl) console.error("Error buscando clase tutor:", errCl.message);
                if (cl) { tokenPayload.claseId = cl.id; tokenPayload.claseNombre = cl.nombre_clase; }
                else { console.warn(`Tutor ${user.email} no tiene clase asignada como tutor_id.`); }
                const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
                console.log(`  Login exitoso para TUTOR: ${user.email}, Clase: ${cl ? cl.nombre_clase : 'N/A'}`);
                res.json({ token, user: tokenPayload, expiresIn });
            });
        } else {
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
            console.log(`  Login exitoso para: ${user.email}, Rol: ${user.rol}`);
            res.json({ token, user: tokenPayload, expiresIn });
        }
    });
});
app.get('/api/auth/me', authenticateToken, (req, res) => {
    console.log("  >> Petición GET /api/auth/me para:", req.user.email);
    res.json({ usuario: req.user });
});

// Usuarios (Solo Dirección)
app.get('/api/usuarios', authenticateToken, (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    db.all("SELECT u.id, u.email, u.nombre_completo, u.rol, c.id as clase_asignada_id, c.nombre_clase as clase_asignada_nombre FROM usuarios u LEFT JOIN clases c ON u.id = c.tutor_id ORDER BY u.nombre_completo", [], (err, usuarios) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ usuarios });
    });
});
app.post('/api/usuarios', authenticateToken, (req, res) => { /* ... (tu código POST usuarios) ... */ });
app.put('/api/usuarios/:idUsuario', authenticateToken, (req, res) => { /* ... (tu código PUT usuarios) ... */ });
app.delete('/api/usuarios/:idUsuario', authenticateToken, (req, res) => { /* ... (tu código DELETE usuarios) ... */ });

// Clases
app.get('/api/clases', authenticateToken, (req, res) => { /* ... (tu código GET clases) ... */ });
app.post('/api/clases', authenticateToken, (req, res) => { /* ... (tu código POST clases) ... */ });
app.get('/api/clases/:idClase', authenticateToken, (req,res)=>{ /* ... (tu código GET clase por ID) ... */});
app.put('/api/clases/:idClase', authenticateToken, (req,res)=>{ /* ... (tu código PUT clases) ... */});
app.delete('/api/clases/:idClase', authenticateToken, (req,res)=>{ /* ... (tu código DELETE clases) ... */});

// Alumnos
app.post('/api/alumnos', authenticateToken, (req, res) => { /* ... (tu código POST alumnos) ... */ });
app.get('/api/alumnos', authenticateToken, (req, res) => { /* ... (tu código GET alumnos) ... */ });
app.get('/api/alumnos/:idAlumno', authenticateToken, (req, res) => { /* ... (tu código GET alumno por ID) ... */ });
app.put('/api/alumnos/:idAlumno', authenticateToken, (req, res) => { /* ... (tu código PUT alumno) ... */ });
app.delete('/api/alumnos/:idAlumno', authenticateToken, (req, res) => { /* ... (tu código DELETE alumno) ... */ });

// Excursiones
app.post('/api/excursiones', authenticateToken, (req, res) => { /* ... (tu código POST excursiones) ... */ });
app.get('/api/excursiones', authenticateToken, (req, res) => { /* ... (tu código GET excursiones) ... */ });
app.get('/api/excursiones/:idExcursion', authenticateToken, (req, res) => { /* ... (tu código GET excursión por ID) ... */ });
app.put('/api/excursiones/:idExcursion', authenticateToken, (req, res) => { /* ... (tu código PUT excursión) ... */ });
app.delete('/api/excursiones/:idExcursion', authenticateToken, (req, res) => { /* ... (tu código DELETE excursión) ... */ });

// Participaciones
app.post('/api/participaciones', authenticateToken, (req, res) => { /* ... (tu código POST participaciones) ... */ });
app.get('/api/participaciones', authenticateToken, (req, res) => { /* ... (tu código GET participaciones) ... */ });
app.get('/api/participaciones/:idParticipacion', authenticateToken, (req,res)=>{ /* ... (tu código GET participación por ID) ... */});
app.put('/api/participaciones/:idParticipacion', authenticateToken, (req,res)=>{ /* ... (tu código PUT participación) ... */});
app.delete('/api/participaciones/:idParticipacion', authenticateToken, (req,res)=>{ /* ... (tu código DELETE participación) ... */});

// Dashboard
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => { /* ... (tu código GET dashboard) ... */ });

console.log("Paso 17: Todas las rutas de API definidas.");

// --- Helpers de BD con Promesas (Defínelos aquí si los vas a usar en tus rutas de arriba) ---
function dbGetAsyncP(sql, params = []) { return new Promise((resolve, reject) => { db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))); }); }
function dbRunAsyncP(sql, params = []) { return new Promise((resolve, reject) => { db.run(sql, params, function(err) { (err ? reject(err) : resolve(this)); }); }); }
function dbAllAsyncP(sql, params = []) { return new Promise((resolve, reject) => { db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))); }); }
console.log("Paso Aux: Helpers de BD (AsyncP) definidos.");


// --- Conectar a la Base de Datos e Iniciar el Servidor ---
const DB_FILE_PATH = path.join(__dirname, "database.db"); // Redefinido por si acaso, aunque DBSOURCE ya existe
console.log(`Paso 18: Intentando conectar a BD en: ${DB_FILE_PATH}`);

db = new sqlite3.Database(DB_FILE_PATH, (err) => { // Asigna a la variable 'db' global
    if (err) {
        console.error("Error FATAL al conectar con la base de datos:", err.message);
        process.exit(1);
    }
    console.log('Paso 19: Conectado a la base de datos SQLite (database.db).');
    db.run("PRAGMA foreign_keys = ON;", (fkErr) => {
        if (fkErr) {
            console.error("Paso 20: Error habilitando claves foráneas en SQLite:", fkErr.message);
        } else {
            console.log("Paso 20: Claves foráneas habilitadas en SQLite.");
        }

        // INICIAMOS EL SERVIDOR DESPUÉS DE ASEGURAR LA CONEXIÓN A LA BD Y CONFIGURACIÓN DE FK
        console.log("Paso 21: Intentando iniciar app.listen()...");
        app.listen(PORT, () => {
            console.log("====================================================");
            console.log(`      Servidor backend CORRIENDO en http://localhost:${PORT}`);
            console.log(`      Endpoints API disponibles en http://localhost:${PORT}/api`);
            console.log("      Para detener el servidor: Ctrl+C");
            console.log("====================================================");
        });
        console.log("Paso 22: Llamada a app.listen() realizada desde el callback de conexión a BD.");
    });
});

console.log("Paso 23: Fin del script server.js (antes de que los callbacks asíncronos principales terminen).");

process.on('SIGINT', () => {
    console.log('\nSIGINT. Cerrando BD y servidor...');
    if (db) { // Solo intentar cerrar si db está definida
        db.close(err => {
            if (err) console.error("Error cerrando BD:",err.message);
            else console.log('Conexión BD cerrada.');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
