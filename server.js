// --- server.js (Versión Depuración Estricta de Arranque) ---
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
console.log("Paso 7: Módulo 'dotenv' configurado (o intentado).");

// --- Configuración Inicial ---
const app = express();
console.log("Paso 8: Aplicación Express creada ('app').");
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "RECUERDA_CAMBIAR_ESTE_SECRETO_EN_PRODUCCION_FINAL_AHORA";
console.log(`Paso 9: Puerto configurado a: ${PORT}`);
if (JWT_SECRET === "RECUERDA_CAMBIAR_ESTE_SECRETO_EN_PRODUCCION_FINAL_AHORA") {
    console.warn(" ADVERTENCIA: Estás usando un JWT_SECRET por defecto. ¡Cámbialo en .env o aquí!");
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
try {
    app.use(express.static(path.join(__dirname, 'public')));
    console.log("Paso 14: Middleware 'express.static' para 'public' configurado.");
} catch (e) {
    console.error("ERROR CRÍTICO configurando express.static:", e);
    process.exit(1);
}


// --- Middleware de Autenticación JWT ---
function authenticateToken(req, res, next) {
    // console.log("[authenticateToken] Verificando token..."); // Log muy verboso, solo si es necesario
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ error: "Token no proporcionado." });
    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) {
            console.warn("[authenticateToken] Error de verificación:", err.name);
            return res.status(403).json({ error: err.name === 'TokenExpiredError' ? "Token expirado." : "Token inválido." });
        }
        req.user = userPayload;
        next();
    });
}
console.log("Paso 15: Middleware authenticateToken definido.");

// --- Rutas de la API (Definiciones) ---
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
                if (errCl) { console.error("Error buscando clase tutor:", errCl.message); /*
