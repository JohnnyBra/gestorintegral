// --- server.js (Versión extendida) ---
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "CAMBIAME_ESTE_SECRETO_POR_ALGO_SEGURO_EN_PRODUCCION_YA_YA";
if (JWT_SECRET === "CAMBIAME_ESTE_SECRETO_POR_ALGO_SEGURO_EN_PRODUCCION_YA_YA") {
    console.warn("ADVERTENCIA: JWT_SECRET por defecto!");
}

const DBSOURCE = path.join(__dirname, "database.db");
const db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) { console.error("Error BD:", err.message); process.exit(1); }
    else { console.log('Conectado a SQLite.'); db.run("PRAGMA foreign_keys = ON;", console.log("FKs habilitadas."));}
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ error: "Token no proporcionado." });
    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) return res.status(403).json({ error: err.name === 'TokenExpiredError' ? "Token expirado." : "Token inválido." });
        req.user = userPayload; next();
    });
}

// --- API Routes ---
app.get('/api', (req, res) => res.json({ message: "API Gestor Escolar OK V2" }));

// Auth (sin cambios respecto a la última versión)
app.post('/api/auth/login', (req, res) => { /* ... tu código de login ... */ });
app.get('/api/auth/me', authenticateToken, (req, res) => res.json({ usuario: req.user }));

// Usuarios (Solo Dirección - sin cambios respecto a la última versión)
app.get('/api/usuarios', authenticateToken, (req, res) => { /* ... */ });
app.post('/api/usuarios', authenticateToken, async (req, res) => { /* ... */ });
app.put('/api/usuarios/:idUsuario', authenticateToken, (req, res) => { /* ... (Código de PUT Usuarios que te di antes, asegúrate que está completo y maneja la asignación de clase) ... */ });
app.delete('/api/usuarios/:idUsuario', authenticateToken, (req, res) => { /* ... (Código de DELETE Usuarios que te di antes) ... */ });


// Clases (Dirección CRUD, Tutor lee - sin cambios respecto a la última versión)
app.get('/api/clases', authenticateToken, (req, res) => { /* ... */ });
app.post('/api/clases', authenticateToken, (req, res) => { /* ... */ });
app.get('/api/clases/:idClase', authenticateToken, (req, res) => { /* ... */ });
app.put('/api/clases/:idClase', authenticateToken, (req, res) => { /* ... */ });
app.delete('/api/clases/:idClase', authenticateToken, (req, res) => { /* ... */ });

// Alumnos (CRUD completo)
app.post('/api/alumnos', authenticateToken, (req, res) => { /* ... (Código POST Alumnos que ya tenías) ... */ });
app.get('/api/alumnos', authenticateToken, (req, res) => { /* ... (Código GET Alumnos que ya tenías) ... */ });
app.get('/api/alumnos/:idAlumno', authenticateToken, (req, res) => { /* ... (Código GET Alumno por ID que ya tenías) ... */ });
app.put('/api/alumnos/:idAlumno', authenticateToken, (req, res) => { /* ... (Código PUT Alumno que ya tenías) ... */ });
app.delete('/api/alumnos/:idAlumno', authenticateToken, (req, res) => { /* ... (Código DELETE Alumno que ya tenías) ... */ });


// Excursiones (CRUD completo)
app.post('/api/excursiones', authenticateToken, (req, res) => { /* ... (Código POST Excursiones que ya tenías) ... */ });
app.get('/api/excursiones', authenticateToken, (req, res) => { /* ... (Código GET Excursiones que ya tenías) ... */ });
app.get('/api/excursiones/:idExcursion', authenticateToken, (req, res) => { /* ... (Código GET Excursión por ID que ya tenías) ... */ });
app.put('/api/excursiones/:idExcursion', authenticateToken, (req, res) => { /* ... (Código PUT Excursión que ya tenías) ... */ });
app.delete('/api/excursiones/:idExcursion', authenticateToken, (req, res) => { /* ... (Código DELETE Excursión que ya tenías) ... */ });

// Participaciones Excursión (CRUD completo)
app.post('/api/participaciones', authenticateToken, (req, res) => { /* ... (Código POST Participaciones que ya tenías) ... */ });
app.get('/api/participaciones', authenticateToken, (req, res) => { /* ... (Código GET Participaciones que ya tenías) ... */ });
app.get('/api/participaciones/:idParticipacion', authenticateToken, (req, res) => { /* ... (Código GET Participación por ID que ya tenías) ... */ });
app.put('/api/participaciones/:idParticipacion', authenticateToken, (req, res) => { /* ... (Código PUT Participación que ya tenías) ... */ });
app.delete('/api/participaciones/:idParticipacion', authenticateToken, (req, res) => { /* ... (Código DELETE Participación que ya tenías) ... */ });


// --- NUEVO ENDPOINT PARA EL DASHBOARD ---
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => {
    const summary = {
        totalClases: 0,
        totalAlumnos: 0,
        totalExcursiones: 0,
        proximasExcursiones: [], // Para Dirección: las 3 próximas globales/cualquier clase. Para Tutor: las 3 próximas de su clase.
        // Específico para Tutor:
        infoSuClase: null, // { nombreClase, numAlumnos }
        resumenProximaExcursionSuClase: null // { nombreExcursion, fecha, totalInscritos, autorizadosSi, autorizadosNo, pagadoSi, pagadoParcial, pagadoNo }
    };

    try {
        // Promesas para conteos generales (para Dirección, y base para Tutor)
        const pTotalClases = new Promise((resolve, reject) => db.get("SELECT COUNT(*) as count FROM clases", (e, r) => e ? reject(e) : resolve(r.count)));
        const pTotalAlumnosGlobal = new Promise((resolve, reject) => db.get("SELECT COUNT(*) as count FROM alumnos", (e, r) => e ? reject(e) : resolve(r.count)));
        const pTotalExcursiones = new Promise((resolve, reject) => db.get("SELECT COUNT(*) as count FROM excursiones", (e, r) => e ? reject(e) : resolve(r.count)));
        
        const [totalClases, totalAlumnosGlobal, totalExcursiones] = await Promise.all([pTotalClases, pTotalAlumnosGlobal, pTotalExcursiones]);
        summary.totalClases = totalClases;
        summary.totalExcursiones = totalExcursiones;

        if (req.user.rol === 'DIRECCION') {
            summary.totalAlumnos = totalAlumnosGlobal;
            // Próximas 3 excursiones (globales o de cualquier clase)
            const sqlProxExcursionesDir = `
                SELECT id, nombre_excursion, fecha_excursion, para_clase_id 
                FROM excursiones 
                WHERE date(fecha_excursion) >= date('now') 
                ORDER BY fecha_excursion ASC LIMIT 3`;
            summary.proximasExcursiones = await new Promise((resolve, reject) => db.all(sqlProxExcursionesDir, (e,r) => e ? reject(e) : resolve(r)));

        } else if (req.user.rol === 'TUTOR') {
            if (req.user.claseId && req.user.claseNombre) {
                summary.infoSuClase = { nombreClase: req.user.claseNombre, numAlumnos: 0 };
                const pAlumnosEnSuClase = new Promise((resolve, reject) => 
                    db.get("SELECT COUNT(*) as count FROM alumnos WHERE clase_id = ?", [req.user.claseId], (e,r) => e ? reject(e) : resolve(r.count))
                );
                summary.infoSuClase.numAlumnos = await pAlumnosEnSuClase;
                summary.totalAlumnos = summary.infoSuClase.numAlumnos; // Para tutor, total alumnos es de su clase

                // Próximas 3 excursiones de su clase (o globales)
                const sqlProxExcursionesTutor = `
                    SELECT id, nombre_excursion, fecha_excursion, para_clase_id 
                    FROM excursiones 
                    WHERE (para_clase_id = ? OR para_clase_id IS NULL) AND date(fecha_excursion) >= date('now')
                    ORDER BY fecha_excursion ASC LIMIT 3`;
                summary.proximasExcursiones = await new Promise((resolve, reject) => db.all(sqlProxExcursionesTutor, [req.user.claseId], (e,r) => e ? reject(e) : resolve(r)));

                // Resumen de autorización/pago para la excursión más inminente de su clase
                if (summary.proximasExcursiones.length > 0) {
                    const proximaExcursionId = summary.proximasExcursiones[0].id;
                    const sqlResumenParticipacion = `
                        SELECT
                            COUNT(p.id) as totalInscritos,
                            SUM(CASE WHEN p.autorizacion_firmada = 'Sí' THEN 1 ELSE 0 END) as autorizadosSi,
                            SUM(CASE WHEN p.autorizacion_firmada = 'No' THEN 1 ELSE 0 END) as autorizadosNo,
                            SUM(CASE WHEN p.pago_realizado = 'Sí' THEN 1 ELSE 0 END) as pagadoSi,
                            SUM(CASE WHEN p.pago_realizado = 'Parcial' THEN 1 ELSE 0 END) as pagadoParcial,
                            SUM(CASE WHEN p.pago_realizado = 'No' THEN 1 ELSE 0 END) as pagadoNo
                        FROM participaciones_excursion p
                        JOIN alumnos a ON p.alumno_id = a.id
                        WHERE p.excursion_id = ? AND a.clase_id = ?
                    `;
                    const resumenParticipacion = await new Promise((resolve, reject) => 
                        db.get(sqlResumenParticipacion, [proximaExcursionId, req.user.claseId], (e,r) => e ? reject(e) : resolve(r))
                    );
                    summary.resumenProximaExcursionSuClase = {
                        nombreExcursion: summary.proximasExcursiones[0].nombre_excursion,
                        fecha: summary.proximasExcursiones[0].fecha_excursion,
                        ...resumenParticipacion
                    };
                }
            } else {
                 summary.totalAlumnos = 0; // Tutor sin clase no tiene alumnos
            }
        }
        res.json(summary);
    } catch (error) {
        console.error("Error generando resumen del dashboard:", error);
        res.status(500).json({ error: "Error generando resumen." });
    }
});


// --- Iniciar el Servidor ---
app.listen(PORT, () => { /* ... tu log de inicio ... */ });
process.on('SIGINT', () => { /* ... tu cierre de DB ... */ });