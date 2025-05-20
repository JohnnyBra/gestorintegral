// --- server.js (Versión Muy Completa) ---
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "RECUERDA_CAMBIAR_ESTE_SECRETO_EN_PRODUCCION";
if (JWT_SECRET === "RECUERDA_CAMBIAR_ESTE_SECRETO_EN_PRODUCCION") {
    console.warn("ADVERTENCIA: JWT_SECRET por defecto. ¡Cámbialo en .env o aquí!");
}

const DBSOURCE = path.join(__dirname, "database.db");
const db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) { console.error("Error BD:", err.message); process.exit(1); }
    else {
        console.log('Conectado a SQLite.');
        db.run("PRAGMA foreign_keys = ON;", (fkErr) => {
            if (fkErr) console.error("Error habilitando FKs:", fkErr.message);
            else console.log("Claves foráneas habilitadas.");
        });
    }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
console.log("Middleware para estáticos de 'public' configurado.");

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ error: "Token no proporcionado." });
    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) return res.status(403).json({ error: err.name === 'TokenExpiredError' ? "Token expirado." : "Token inválido." });
        req.user = userPayload;
        next();
    });
}
console.log("Middleware authenticateToken definido.");

app.get('/api', (req, res) => res.json({ message: "API Gestor Escolar OK V3" }));
console.log("Ruta GET /api definida.");

// --- Autenticación ---
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email y pass requeridos." });
    const normalizedEmail = email.toLowerCase();
    db.get("SELECT * FROM usuarios WHERE email = ?", [normalizedEmail], async (err, user) => {
        if (err) { console.error("DB error login:", err.message); return res.status(500).json({ error: "Error interno." }); }
        if (!user) return res.status(401).json({ error: "Credenciales incorrectas (email)." });
        const passwordIsValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordIsValid) return res.status(401).json({ error: "Credenciales incorrectas (pass)." });
        let tokenPayload = { id: user.id, email: user.email, rol: user.rol, nombre_completo: user.nombre_completo };
        const expiresIn = '8h';
        if (user.rol === 'TUTOR') {
            db.get("SELECT id, nombre_clase FROM clases WHERE tutor_id = ?", [user.id], (errCl, cl) => {
                if (errCl) console.error("Error buscando clase tutor:", errCl.message);
                if (cl) { tokenPayload.claseId = cl.id; tokenPayload.claseNombre = cl.nombre_clase; }
                else { console.warn(`Tutor ${user.email} no tiene clase asignada como tutor_id.`); }
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
console.log("Endpoints Auth definidos.");

// --- Gestión de Usuarios (Solo Dirección) ---
app.get('/api/usuarios', authenticateToken, (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    db.all("SELECT u.id, u.email, u.nombre_completo, u.rol, c.nombre_clase as clase_asignada_nombre FROM usuarios u LEFT JOIN clases c ON u.id = c.tutor_id ORDER BY u.nombre_completo", [], (err, usuarios) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ usuarios });
    });
});
app.post('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    const { email, nombre_completo, password, rol, clase_asignada_id } = req.body; // clase_asignada_id es el ID de la tabla 'clases'
    if (!email || !nombre_completo || !password || !rol) return res.status(400).json({ error: 'Faltan datos.' });
    if (rol !== 'DIRECCION' && rol !== 'TUTOR') return res.status(400).json({ error: 'Rol inválido.' });
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
                        await dbRunAsync("UPDATE clases SET tutor_id = NULL WHERE tutor_id = ? AND id != ?", [newUID, clase_asignada_id]); // Desasignar de otra clase si este tutor estaba antes
                        await dbRunAsync("UPDATE clases SET tutor_id = ? WHERE id = ?", [newUID, clase_asignada_id]); // Asignar a la nueva
                        res.status(201).json({ message:"Usuario creado y asignado.", usuario: { id: newUID, email: normEmail, nombre_completo, rol, clase_asignada_id } });
                    } else {
                        res.status(201).json({ message:"Usuario creado.", usuario: { id: newUID, email: normEmail, nombre_completo, rol } });
                    }
                });
        } catch (e) { res.status(500).json({ error: "Error hash pass." }); }
    });
});
app.put('/api/usuarios/:idUsuario', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    const idUsuarioAEditar = parseInt(req.params.idUsuario);
    const { nombre_completo, rol, new_password, clase_asignada_id } = req.body; // clase_asignada_id es el ID de la tabla 'clases'
    if (isNaN(idUsuarioAEditar)) return res.status(400).json({ error: "ID usuario inválido." });

    let sqlFields = []; let params = [];
    if (nombre_completo) { sqlFields.push("nombre_completo = ?"); params.push(nombre_completo); }
    if (rol) { sqlFields.push("rol = ?"); params.push(rol); }
    if (new_password) {
        try { const hash = await bcrypt.hash(new_password, 10); sqlFields.push("password_hash = ?"); params.push(hash); }
        catch (e) { return res.status(500).json({ error: "Error con nueva pass." }); }
    }

    const actualizarUsuarioDB = () => {
        if (sqlFields.length > 0) {
            db.run(`UPDATE usuarios SET ${sqlFields.join(", ")} WHERE id = ?`, [...params, idUsuarioAEditar], async function (errU) {
                if (errU) return res.status(500).json({ error: errU.message });
                if (this.changes === 0 && (clase_asignada_id === undefined || rol !== 'TUTOR')) return res.status(404).json({ error: `Usuario ${idUsuarioAEditar} no encontrado o sin cambios.` });
                gestionarAsignacionClase();
            });
        } else { // Solo se modifica la clase asignada
            gestionarAsignacionClase();
        }
    };

    const gestionarAsignacionClase = async () => {
        const rolFinal = rol || (await dbGetAsync("SELECT rol FROM usuarios WHERE id = ?", [idUsuarioAEditar])).rol;
        if (rolFinal === 'TUTOR' && clase_asignada_id !== undefined) { // Si es tutor y se quiere cambiar/asignar clase
            await dbRunAsync("UPDATE clases SET tutor_id = NULL WHERE tutor_id = ? AND id != ?", [idUsuarioAEditar, clase_asignada_id === null ? -1 : clase_asignada_id]); // Desasignar de otras clases
            await dbRunAsync("UPDATE clases SET tutor_id = ? WHERE id = ?", [clase_asignada_id === null ? null : idUsuarioAEditar, clase_asignada_id]);
        } else if (rolFinal === 'DIRECCION') { // Si se cambia a Dirección, desasignar de cualquier clase
            await dbRunAsync("UPDATE clases SET tutor_id = NULL WHERE tutor_id = ?", [idUsuarioAEditar]);
        }
        res.json({ message: `Usuario ID ${idUsuarioAEditar} actualizado.` });
    };
    actualizarUsuarioDB();
});
app.delete('/api/usuarios/:idUsuario', authenticateToken, (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    const id = parseInt(req.params.idUsuario);
    if (isNaN(id) || id === req.user.id) return res.status(400).json({ error: "ID inválido o no puedes autoeliminarte." });
    db.get("SELECT rol FROM usuarios WHERE id=?",[id],(e,u)=>{ if(e)return res.status(500).json({error:e.message}); if(!u)return res.status(404).json({error:"Usuario no encontrado."}); if(u.rol==='DIRECCION'){db.get("SELECT COUNT(*) as c FROM usuarios WHERE rol='DIRECCION'",(eC,rC)=>{if(eC)return res.status(500).json({error:eC.message}); if(rC.c<=1)return res.status(400).json({error:"No se puede eliminar último Director."});procedeBorrado();});}else{procedeBorrado();}});
    function procedeBorrado(){ db.run("DELETE FROM usuarios WHERE id=?",[id],function(eD){if(eD)return res.status(500).json({error:eD.message});res.json({message:`Usuario ${id} eliminado.`});});}
});
console.log("Endpoints Usuarios definidos.");

// Clases
app.get('/api/clases', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.post('/api/clases', authenticateToken, (req, res) => { /* ... como antes, con validación de tutor ... */ });
app.get('/api/clases/:idClase', authenticateToken, (req,res)=>{ /* ... como antes ... */});
app.put('/api/clases/:idClase', authenticateToken, (req,res)=>{ /* ... como antes, con validación de tutor y unicidad de nombre ... */});
app.delete('/api/clases/:idClase', authenticateToken, (req,res)=>{ /* ... como antes ... */});
console.log("Endpoints Clases definidos.");

// Alumnos
app.post('/api/alumnos', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.get('/api/alumnos', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.get('/api/alumnos/:idAlumno', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.put('/api/alumnos/:idAlumno', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.delete('/api/alumnos/:idAlumno', authenticateToken, (req, res) => { /* ... como antes ... */ });
console.log("Endpoints Alumnos definidos.");

// Excursiones
app.post('/api/excursiones', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.get('/api/excursiones', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.get('/api/excursiones/:idExcursion', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.put('/api/excursiones/:idExcursion', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.delete('/api/excursiones/:idExcursion', authenticateToken, (req, res) => { /* ... como antes ... */ });
console.log("Endpoints Excursiones definidos.");

// Participaciones
app.post('/api/participaciones', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.get('/api/participaciones', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.get('/api/participaciones/:idParticipacion', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.put('/api/participaciones/:idParticipacion', authenticateToken, (req, res) => { /* ... como antes ... */ });
app.delete('/api/participaciones/:idParticipacion', authenticateToken, (req, res) => { /* ... como antes ... */ });
console.log("Endpoints Participaciones definidos.");

// Dashboard
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => { /* ... como antes ... */ });
console.log("Endpoint Dashboard definido.");

// --- Helpers para Promesas con DB (opcional, para evitar anidamiento) ---
function dbGetAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });
}
function dbRunAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) { // Usar function() para this.lastID/changes
            if (err) reject(err); else resolve(this);
        });
    });
}
// Puedes usar estas funciones dbGetAsync y dbRunAsync en tus endpoints para un código más limpio

// --- Iniciar el Servidor ---
app.listen(PORT, () => {
    console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
    console.log("Endpoints API disponibles en http://localhost:${PORT}/api");
});
console.log("Llamada a app.listen() completada.");
process.on('SIGINT', () => { db.close(err => { if (err) console.error(err.message); console.log('Conexión BD cerrada.'); process.exit(0); }); });
