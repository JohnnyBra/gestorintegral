// --- server.js (CORREGIDO) ---
console.log("==================================================");
console.log(" Iniciando server.js (Versión para Arranque Estable)");
console.log("==================================================");

// --- Imports ---
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); // Carga variables desde el archivo .env

console.log(" Paso 1: Módulos principales importados.");

// --- Configuración Inicial de Express y Constantes ---
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "ESTE_SECRETO_DEBE_SER_CAMBIADO_EN_PRODUCCION_Y_EN_.ENV";

if (JWT_SECRET === "ESTE_SECRETO_DEBE_SER_CAMBIADO_EN_PRODUCCION_Y_EN_.ENV") {
    console.warn(" ADVERTENCIA CRÍTICA: Estás usando un JWT_SECRET por defecto. ¡DEBES CAMBIARLO!");
}
console.log(` Paso 2: Express app creada. Puerto: ${PORT}. JWT_SECRET ${JWT_SECRET === "ESTE_SECRETO_DEBE_SER_CAMBIADO_EN_PRODUCCION_Y_EN_.ENV" ? "es el por defecto (INSEGURO)" : "cargado (esperemos que seguro)"}.`);

// --- Middlewares Globales de Express ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Para servir tu frontend
console.log(" Paso 3: Middlewares globales (cors, json, urlencoded, static) configurados.");

// --- Variable para la instancia de la Base de Datos (se inicializará después) ---
let db;

// --- Middleware de Autenticación JWT ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ error: "Token no proporcionado." });

    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) {
            console.warn(`[AuthMiddleware] Token inválido o expirado: ${err.name}`);
            return res.status(403).json({ error: err.name === 'TokenExpiredError' ? "Token expirado." : "Token inválido." });
        }
        req.user = userPayload;
        // console.log(`[AuthMiddleware] Usuario autenticado: ${req.user.email} (Rol: ${req.user.rol})`);
        next();
    });
}
console.log(" Paso 4: Middleware authenticateToken definido.");

// --- Helpers de Base de Datos con Promesas (para un código más limpio en los endpoints) ---
function dbGetAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("La base de datos no está inicializada."));
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}
function dbRunAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("La base de datos no está inicializada."));
        db.run(sql, params, function(err) { (err ? reject(err) : resolve(this)); }); // Usar function() para 'this'
    });
}
function dbAllAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("La base de datos no está inicializada."));
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

// Helper function to get class IDs from the same cycle as the tutor's class
async function getTutorCicloClaseIds(tutorClaseId) {
    if (!db) {
        console.error("[getTutorCicloClaseIds] La base de datos no está inicializada.");
        return [];
    }
    if (!tutorClaseId) {
        console.log("[getTutorCicloClaseIds] tutorClaseId no proporcionado.");
        return [];
    }

    try {
        console.log(`[getTutorCicloClaseIds] Buscando ciclo_id para tutorClaseId: ${tutorClaseId}`);
        const claseInfo = await dbGetAsync("SELECT ciclo_id FROM clases WHERE id = ?", [tutorClaseId]);

        if (!claseInfo || claseInfo.ciclo_id === null || claseInfo.ciclo_id === undefined) {
            console.log(`[getTutorCicloClaseIds] No se encontró ciclo_id para tutorClaseId: ${tutorClaseId} o ciclo_id es NULL.`);
            return [];
        }
        const cicloId = claseInfo.ciclo_id;
        console.log(`[getTutorCicloClaseIds] Encontrado ciclo_id: ${cicloId} para tutorClaseId: ${tutorClaseId}`);

        const clasesDelCicloRows = await dbAllAsync("SELECT id FROM clases WHERE ciclo_id = ?", [cicloId]);
        
        if (!clasesDelCicloRows || clasesDelCicloRows.length === 0) {
            console.log(`[getTutorCicloClaseIds] No se encontraron clases para ciclo_id: ${cicloId}`);
            return [];
        }

        const cicloClaseIds = clasesDelCicloRows.map(row => row.id);
        console.log(`[getTutorCicloClaseIds] Clases encontradas en el mismo ciclo (${cicloId}): ${cicloClaseIds.join(', ')} (excluyendo la propia clase del tutor si no está en este ciclo, lo cual no debería pasar)`);
        // La función debe devolver todas las clases del ciclo, incluyendo la del tutor.
        return cicloClaseIds;

    } catch (error) {
        console.error(`[getTutorCicloClaseIds] Error obteniendo clases del ciclo para tutorClaseId ${tutorClaseId}:`, error.message);
        return []; // Return empty on error
    }
}

console.log(" Paso 5: Helpers de BD con Promesas definidos (incluyendo getCoordinadorClases y getTutorCicloClaseIds).");

// --- Definición de Rutas de la API ---
console.log(" Paso 6: Definiendo rutas de API...");

app.get('/api', (req, res) => {
    console.log("  Ruta: GET /api solicitada.");
    res.json({ message: "API del Gestor Escolar v5 - ¡Funcionando!" });
});

// --- Autenticación ---
app.post('/api/auth/login', async (req, res) => {
    console.log("  Ruta: POST /api/auth/login, Body:", req.body);
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email y contraseña son requeridos." });
    try {
        const normalizedEmail = email.toLowerCase();
        const user = await dbGetAsync("SELECT * FROM usuarios WHERE email = ?", [normalizedEmail]);
        if (!user) return res.status(401).json({ error: "Credenciales incorrectas (usuario)." });
        const passwordIsValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordIsValid) return res.status(401).json({ error: "Credenciales incorrectas (contraseña)." });
        
        let tokenPayload = { id: user.id, email: user.email, rol: user.rol, nombre_completo: user.nombre_completo };
        const expiresIn = '8h';

        if (user.rol === 'TUTOR') {
            const claseRow = await dbGetAsync("SELECT id, nombre_clase FROM clases WHERE tutor_id = ?", [user.id]);
            if (claseRow) {
                tokenPayload.claseId = claseRow.id;
                tokenPayload.claseNombre = claseRow.nombre_clase;
            } else { console.warn(`Tutor ${user.email} no tiene clase asignada.`); }
        }
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
        console.log(`  Login exitoso para: ${user.email}`);
        res.json({ token, user: tokenPayload, expiresIn });
    } catch (error) {
        console.error("  Error en /api/auth/login:", error.message);
        res.status(500).json({ error: "Error interno del servidor." });
    }
});
app.get('/api/auth/me', authenticateToken, (req, res) => {
    console.log("  Ruta: GET /api/auth/me para:", req.user.email);
    res.json({ usuario: req.user });
});

// --- Gestión de Usuarios (Solo Dirección) ---
app.get('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    try {
        const usuarios = await dbAllAsync("SELECT u.id, u.email, u.nombre_completo, u.rol, c.id as clase_asignada_id, c.nombre_clase as clase_asignada_nombre FROM usuarios u LEFT JOIN clases c ON u.id = c.tutor_id ORDER BY u.nombre_completo");
        res.json({ usuarios });
    } catch (error) { res.status(500).json({ error: "Error obteniendo usuarios: " + error.message }); }
});

// POST /api/usuarios - Crear un nuevo usuario (TUTOR, TESORERIA, COORDINACION)
app.post('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado. Solo el rol DIRECCION puede crear usuarios.' });
    }

    const { email, nombre_completo, password, rol } = req.body;
    // Enhanced logging: Log received parameters
    console.log(`  Ruta: POST /api/usuarios, Received - Email: ${email}, Nombre: ${nombre_completo}, Rol: ${rol}`);

    if (!email || !nombre_completo || !password || !rol) {
        console.warn("  POST /api/usuarios - Validation failed: Missing required fields.");
        return res.status(400).json({ error: "Email, nombre_completo, password y rol son requeridos." });
    }

    const allowedRolesToCreate = ['TUTOR', 'TESORERIA']; // COORDINACION eliminado
    if (!allowedRolesToCreate.includes(rol)) {
        return res.status(400).json({ error: `Rol inválido. Roles permitidos: ${allowedRolesToCreate.join(', ')}.` });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail) { 
        return res.status(400).json({ error: "El email no puede estar vacío." });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({ error: "Formato de email inválido." });
    }
    
    if (password.length < 8) { 
        return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
    }

    try {
        const existingUser = await dbGetAsync("SELECT id FROM usuarios WHERE email = ?", [normalizedEmail]);
        if (existingUser) {
            return res.status(409).json({ error: "El email proporcionado ya está en uso." });
        }

        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Enhanced logging: Log parameters before DB insert
        console.log(`  POST /api/usuarios - Inserting user with - Normalized Email: ${normalizedEmail}, Trimmed Nombre: ${nombre_completo.trim()}, Password Hash Type: ${typeof password_hash}, Rol: ${rol}`);

        const result = await dbRunAsync(
            "INSERT INTO usuarios (email, nombre_completo, password_hash, rol) VALUES (?, ?, ?, ?)",
            [normalizedEmail, nombre_completo.trim(), password_hash, rol]
        );

        const nuevoUsuario = await dbGetAsync(
            "SELECT id, email, nombre_completo, rol FROM usuarios WHERE id = ?",
            [result.lastID]
        );
        
        console.log(`  Usuario con rol ${rol} creado con ID: ${result.lastID}, Email: ${normalizedEmail}`);
        res.status(201).json(nuevoUsuario);

    } catch (error) {
        // Enhanced logging: Log the full error object
        console.error("  Error details in POST /api/usuarios:", error);
        if (error.message && error.message.includes("UNIQUE constraint failed: usuarios.email")) {
             return res.status(409).json({ error: "El email proporcionado ya está en uso (error de BD)." });
        }
        res.status(500).json({ error: "Error interno del servidor al crear el usuario." });
    }
});

// PUT /api/usuarios/:id - Actualizar un usuario existente
app.put('/api/usuarios/:id', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado. Solo el rol DIRECCION puede modificar usuarios.' });
    }

    const userIdToUpdate = parseInt(req.params.id);
    if (isNaN(userIdToUpdate)) {
        return res.status(400).json({ error: "ID de usuario inválido." });
    }

    const { email, nombre_completo, rol: newRol } = req.body; // Capturar newRol del body
    console.log(`  Ruta: PUT /api/usuarios/${userIdToUpdate}, Body:`, req.body);

    if (email === undefined && nombre_completo === undefined && newRol === undefined) {
        return res.status(400).json({ error: "Debe proporcionar al menos un campo para actualizar (email, nombre_completo o rol)." });
    }
    
    let normalizedEmail;
    if (email !== undefined) {
        if (typeof email !== 'string') {
            return res.status(400).json({ error: "El email debe ser una cadena de texto." });
        }
        normalizedEmail = email.toLowerCase().trim();
        if (normalizedEmail === "") { 
            return res.status(400).json({ error: "El email no puede ser una cadena vacía si se proporciona." });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({ error: "Formato de email inválido." });
        }
    }

    let trimmedNombre;
    if (nombre_completo !== undefined) {
        if (typeof nombre_completo !== 'string') {
            return res.status(400).json({ error: "El nombre_completo debe ser una cadena de texto." });
        }
        trimmedNombre = nombre_completo.trim();
        if (trimmedNombre === "") { 
            return res.status(400).json({ error: "El nombre_completo no puede ser una cadena vacía si se proporciona." });
        }
    }

    try {
        const userToUpdate = await dbGetAsync("SELECT id, email, nombre_completo, rol FROM usuarios WHERE id = ?", [userIdToUpdate]);
        if (!userToUpdate) {
            return res.status(404).json({ error: "Usuario no encontrado." });
        }

        if (userToUpdate.id === req.user.id || userToUpdate.rol === 'DIRECCION') {
            return res.status(403).json({ error: "No se puede modificar un usuario con rol DIRECCION o a sí mismo mediante esta vía." });
        }
        
        const allowedRolesToUpdate = ['TUTOR', 'TESORERIA']; // COORDINACION eliminado
        // Se pueden modificar usuarios con estos roles. Si se proporciona un newRol, también debe ser uno de estos.
        // Si el rol actual es COORDINACION, ahora se permite su modificación (ya no está protegido como DIRECCION).
        if (!allowedRolesToUpdate.includes(userToUpdate.rol) && userToUpdate.rol !== null && userToUpdate.rol !== 'COORDINACION') {
             return res.status(403).json({ error: `Solo se pueden modificar usuarios con roles ${allowedRolesToUpdate.join(', ')} o COORDINACION (para cambiarlo a otro rol).` });
        }


        let updateFields = [];
        let updateParams = [];
        
        const newValues = { // Para construir el objeto de respuesta
            id: userToUpdate.id,
            email: userToUpdate.email, 
            nombre_completo: userToUpdate.nombre_completo,
            rol: userToUpdate.rol
        };

        if (normalizedEmail !== undefined && normalizedEmail !== userToUpdate.email) {
            const existingUserWithNewEmail = await dbGetAsync("SELECT id FROM usuarios WHERE email = ? AND id != ?", [normalizedEmail, userIdToUpdate]);
            if (existingUserWithNewEmail) {
                return res.status(409).json({ error: "El email proporcionado ya está en uso por otro usuario." });
            }
            updateFields.push("email = ?");
            updateParams.push(normalizedEmail);
            newValues.email = normalizedEmail; // Actualizar para la respuesta
        }

        if (trimmedNombre !== undefined && trimmedNombre !== userToUpdate.nombre_completo) {
            updateFields.push("nombre_completo = ?");
            updateParams.push(trimmedNombre);
            newValues.nombre_completo = trimmedNombre; // Actualizar para la respuesta
        }

        if (newRol !== undefined && newRol !== userToUpdate.rol) {
            const validNewRoles = ['TUTOR', 'TESORERIA']; // COORDINACION no es un nuevo rol válido
            if (!validNewRoles.includes(newRol)) {
                return res.status(400).json({ error: `Nuevo rol inválido. Roles permitidos para asignación: ${validNewRoles.join(', ')}.` });
            }
            // Si el rol anterior era TUTOR y el nuevo rol NO es TUTOR, desasignar de clase.
            if (userToUpdate.rol === 'TUTOR' && newRol !== 'TUTOR') {
                await dbRunAsync("UPDATE clases SET tutor_id = NULL WHERE tutor_id = ?", [userIdToUpdate]);
                console.log(`  Usuario ID ${userIdToUpdate} desasignado como tutor de sus clases debido a cambio de rol.`);
                // Si el frontend maneja la info del token, el usuario necesitará reloguear para ver el cambio de claseId/claseNombre.
            }
            updateFields.push("rol = ?");
            updateParams.push(newRol);
            newValues.rol = newRol; // Actualizar para la respuesta
        }


        if (updateFields.length > 0) {
            updateParams.push(userIdToUpdate);
            const sqlUpdate = `UPDATE usuarios SET ${updateFields.join(", ")} WHERE id = ?`;
            await dbRunAsync(sqlUpdate, updateParams);
            console.log(`  Usuario ID ${userIdToUpdate} actualizado. Campos: ${updateFields.join(", ")}`);
        } else {
            console.log(`  Usuario ID ${userIdToUpdate} no requirió actualización, datos idénticos o no proporcionados para cambio.`);
        }
        
        // Devolver el estado final del usuario modificado (sin el hash de la contraseña)
        const usuarioActualizadoParaRespuesta = {
            id: newValues.id,
            email: newValues.email,
            nombre_completo: newValues.nombre_completo,
            rol: newValues.rol
        };
        res.json(usuarioActualizadoParaRespuesta);

    } catch (error) {
        console.error(`  Error en PUT /api/usuarios/${userIdToUpdate}:`, error.message);
        if (error.message.includes("UNIQUE constraint failed: usuarios.email")) {
             return res.status(409).json({ error: "El email proporcionado ya está en uso (error de BD)." });
        }
        res.status(500).json({ error: "Error interno del servidor al actualizar el usuario." });
    }
});
console.log("Endpoint PUT /api/usuarios/:id definido.");

// DELETE /api/usuarios/:id - Eliminar un usuario
app.delete('/api/usuarios/:id', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado. Solo el rol DIRECCION puede eliminar usuarios.' });
    }

    const userIdToDelete = parseInt(req.params.id);
    if (isNaN(userIdToDelete)) {
        return res.status(400).json({ error: "ID de usuario inválido." });
    }
    
    console.log(`  Ruta: DELETE /api/usuarios/${userIdToDelete}`);

    try {
        const userToDelete = await dbGetAsync("SELECT id, rol FROM usuarios WHERE id = ?", [userIdToDelete]);
        if (!userToDelete) {
            return res.status(404).json({ error: "Usuario no encontrado." });
        }

        if (userToDelete.rol === 'DIRECCION') {
            return res.status(403).json({ error: "No se puede eliminar un usuario con rol DIRECCION." });
        }
        
        const result = await dbRunAsync("DELETE FROM usuarios WHERE id = ?", [userIdToDelete]);

        if (result.changes === 0) {
            return res.status(404).json({ error: "Usuario no encontrado para eliminar (posiblemente ya eliminado)." });
        }

        console.log(`  Usuario ID ${userIdToDelete} eliminado.`);
        res.status(200).json({ message: "Usuario eliminado exitosamente." }); 

    } catch (error) {
        console.error(`  Error en DELETE /api/usuarios/${userIdToDelete}:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al eliminar el usuario." });
    }
});
console.log("Endpoint DELETE /api/usuarios/:id definido.");

// GET /api/usuarios/tutores - Obtener todos los tutores (ID y Nombre)
app.get('/api/usuarios/tutores', authenticateToken, async (req, res) => {
    console.log("  Ruta: GET /api/usuarios/tutores, Usuario:", req.user.email);
    try {
        // No specific role check here as per instruction "Accessible by any authenticated user"
        // This implies DIRECCION or TUTOR can call this to see other tutors to share with.
        const tutores = await dbAllAsync("SELECT id, nombre_completo FROM usuarios WHERE rol = 'TUTOR' ORDER BY nombre_completo ASC");
        res.json({ tutores });
    } catch (error) {
        console.error("  Error en GET /api/usuarios/tutores:", error.message);
        res.status(500).json({ error: "Error interno del servidor al obtener la lista de tutores." });
    }
});
console.log("Endpoint GET /api/usuarios/tutores definido.");

// --- Gestión de Clases ---
app.get('/api/clases', authenticateToken, async (req, res) => {
    console.log("  Ruta: GET /api/clases, Usuario:", req.user.email, "Rol:", req.user.rol);
    try {
        let sql = `SELECT c.id, c.nombre_clase, c.tutor_id, c.ciclo_id, u.nombre_completo as nombre_tutor, u.email as email_tutor
                   FROM clases c LEFT JOIN usuarios u ON c.tutor_id = u.id`;
        const params = [];

        // COORDINACION block removed.
        // For DIRECCION or TUTOR (or other future roles that see all classes), no additional WHERE clause is needed unless specified.
        // TUTORs currently see all classes in this endpoint. This behavior is maintained.
        // DIRECCION also sees all classes.

        sql += " ORDER BY c.nombre_clase ASC";
        const clases = await dbAllAsync(sql, params);
        res.json({ clases });
    } catch (error) { 
        console.error("  Error en GET /api/clases:", error.message, error.stack);
        res.status(500).json({ error: "Error obteniendo clases: " + error.message });
    }
});
app.post('/api/clases', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado.' });
    }

    const { nombre_clase, tutor_id } = req.body;
    console.log("  Ruta: POST /api/clases, Body:", req.body);


    if (!nombre_clase || typeof nombre_clase !== 'string' || nombre_clase.trim() === '') {
        return res.status(400).json({ error: "El nombre de la clase es obligatorio y debe ser un texto." });
    }
    const nombreClaseNormalizado = nombre_clase.trim().toUpperCase();

    try {
        // Verificar si ya existe una clase con ese nombre (insensible a mayúsculas/minúsculas)
        const claseExistente = await dbGetAsync("SELECT id FROM clases WHERE lower(nombre_clase) = lower(?)", [nombreClaseNormalizado]);
        if (claseExistente) {
            return res.status(409).json({ error: `La clase '${nombreClaseNormalizado}' ya existe.` });
        }

        let tutorValidoId = null;
        if (tutor_id) {
            const idTutorNum = parseInt(tutor_id);
            if (isNaN(idTutorNum)) {
                 return res.status(400).json({ error: "ID de tutor inválido." });
            }
            const tutor = await dbGetAsync("SELECT id, rol FROM usuarios WHERE id = ? AND rol = 'TUTOR'", [idTutorNum]);
            if (!tutor) {
                return res.status(404).json({ error: "Tutor no encontrado o el usuario no es un tutor." });
            }
            // Verificar si este tutor ya está asignado a otra clase
            const claseDelTutor = await dbGetAsync("SELECT id, nombre_clase FROM clases WHERE tutor_id = ?", [idTutorNum]);
            if (claseDelTutor) {
                return res.status(409).json({ error: `El tutor seleccionado ya está asignado a la clase '${claseDelTutor.nombre_clase}'.` });
            }
            tutorValidoId = idTutorNum;
        }

        const result = await dbRunAsync("INSERT INTO clases (nombre_clase, tutor_id) VALUES (?, ?)", [nombreClaseNormalizado, tutorValidoId]);
        const nuevaClase = await dbGetAsync("SELECT c.id, c.nombre_clase, c.tutor_id, u.nombre_completo as nombre_tutor, u.email as email_tutor FROM clases c LEFT JOIN usuarios u ON c.tutor_id = u.id WHERE c.id = ?", [result.lastID]);
        
        console.log("  Clase creada con ID:", result.lastID);
        res.status(201).json({ message: "Clase creada exitosamente", clase: nuevaClase });

    } catch (error) {
        console.error("  Error en POST /api/clases:", error.message);
        if (error.message.includes("UNIQUE constraint failed: clases.nombre_clase")) { // Aunque ya lo validamos antes
             return res.status(409).json({ error: `La clase '${nombreClaseNormalizado}' ya existe.` });
        }
        res.status(500).json({ error: "Error interno del servidor al crear la clase." });
    }
});
console.log("Endpoint POST /api/clases definido.");


// PUT /api/clases/:id - Actualizar una clase existente
app.put('/api/clases/:id', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado.' });
    }

    const claseId = parseInt(req.params.id);
    const { nombre_clase, tutor_id } = req.body;
    console.log(`  Ruta: PUT /api/clases/${claseId}, Body:`, req.body);


    if (isNaN(claseId)) {
        return res.status(400).json({ error: "ID de clase inválido." });
    }
    if (!nombre_clase || typeof nombre_clase !== 'string' || nombre_clase.trim() === '') {
        return res.status(400).json({ error: "El nombre de la clase es obligatorio." });
    }
    const nombreClaseNormalizado = nombre_clase.trim().toUpperCase();

    try {
        // Verificar que la clase a editar existe
        const claseActual = await dbGetAsync("SELECT id, tutor_id FROM clases WHERE id = ?", [claseId]);
        if (!claseActual) {
            return res.status(404).json({ error: "Clase no encontrada para editar." });
        }

        // Verificar si el NUEVO nombre de clase ya existe en OTRA clase
        const otraClaseConMismoNombre = await dbGetAsync("SELECT id FROM clases WHERE lower(nombre_clase) = lower(?) AND id != ?", [nombreClaseNormalizado, claseId]);
        if (otraClaseConMismoNombre) {
            return res.status(409).json({ error: `Ya existe otra clase con el nombre '${nombreClaseNormalizado}'.` });
        }

        let tutorValidoId = null;
        if (tutor_id) {
            const idTutorNum = parseInt(tutor_id);
             if (isNaN(idTutorNum)) {
                 return res.status(400).json({ error: "ID de tutor inválido." });
            }
            const tutor = await dbGetAsync("SELECT id, rol FROM usuarios WHERE id = ? AND rol = 'TUTOR'", [idTutorNum]);
            if (!tutor) {
                return res.status(404).json({ error: "Tutor no encontrado o el usuario no es un tutor." });
            }
            // Verificar si este tutor ya está asignado a OTRA clase (que no sea la actual que estamos editando)
            const claseDelTutor = await dbGetAsync("SELECT id, nombre_clase FROM clases WHERE tutor_id = ? AND id != ?", [idTutorNum, claseId]);
            if (claseDelTutor) {
                return res.status(409).json({ error: `El tutor seleccionado ya está asignado a la clase '${claseDelTutor.nombre_clase}'.` });
            }
            tutorValidoId = idTutorNum;
        }
        
        // Si tutor_id es null o undefined en el body, se desasigna el tutor.
        // Si es una string vacía del select, se convierte a null arriba.
        // Si no se manda tutor_id en el body, no se actualiza el tutor? Depende de cómo lo mande el front.
        // Asumimos que el front siempre manda tutor_id (aunque sea null/vacío).
        
        await dbRunAsync("UPDATE clases SET nombre_clase = ?, tutor_id = ? WHERE id = ?", [nombreClaseNormalizado, tutorValidoId, claseId]);
        
        const claseActualizada = await dbGetAsync("SELECT c.id, c.nombre_clase, c.tutor_id, u.nombre_completo as nombre_tutor, u.email as email_tutor FROM clases c LEFT JOIN usuarios u ON c.tutor_id = u.id WHERE c.id = ?", [claseId]);
        
        console.log("  Clase actualizada con ID:", claseId);
        res.json({ message: "Clase actualizada exitosamente", clase: claseActualizada });

    } catch (error) {
        console.error(`  Error en PUT /api/clases/${claseId}:`, error.message);
         if (error.message.includes("UNIQUE constraint failed: clases.nombre_clase")) { // Por si acaso
             return res.status(409).json({ error: `Ya existe otra clase con el nombre '${nombreClaseNormalizado}'.` });
        }
        res.status(500).json({ error: "Error interno del servidor al actualizar la clase." });
    }
});
console.log("Endpoint PUT /api/clases/:id definido.");

// DELETE /api/clases/:id (Opcional, pero bueno para completar)
app.delete('/api/clases/:id', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado.' });
    }
    const claseId = parseInt(req.params.id);
    console.log(`  Ruta: DELETE /api/clases/${claseId}`);

    if (isNaN(claseId)) {
        return res.status(400).json({ error: "ID de clase inválido." });
    }

    try {
        // Antes de eliminar la clase, necesitamos considerar los alumnos asociados.
        // La BD tiene ON DELETE CASCADE para alumnos si se borra su clase_id de la tabla clases,
        // y ON DELETE SET NULL para el tutor_id en la tabla clases si se borra el usuario.
        // Aquí, al borrar una clase, los alumnos de esa clase se borrarán debido a la FK.
        const alumnosEnClase = await dbGetAsync("SELECT COUNT(*) as count FROM alumnos WHERE clase_id = ?", [claseId]);
        if (alumnosEnClase.count > 0) {
            return res.status(409).json({ error: `No se puede eliminar la clase porque tiene ${alumnosEnClase.count} alumnos asignados. Elimine o reasigne los alumnos primero.`});
            // Alternativamente, podrías permitir borrar la clase y sus alumnos, pero es una acción destructiva.
            // O podrías desvincular a los alumnos (SET NULL), pero la FK actual es ON DELETE CASCADE.
        }

        const result = await dbRunAsync("DELETE FROM clases WHERE id = ?", [claseId]);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Clase no encontrada para eliminar." });
        }
        console.log(`  Clase con ID ${claseId} eliminada.`);
        res.status(200).json({ message: "Clase eliminada exitosamente." }); // 204 No Content también es una opción si no devuelves mensaje.
    } catch (error) {
        console.error(`  Error en DELETE /api/clases/${claseId}:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al eliminar la clase." });
    }
});
console.log("Endpoint DELETE /api/clases/:id definido.");

// --- Gestión de Alumnos ---

// GET /api/alumnos - Obtener todos los alumnos o filtrados por clase
app.get('/api/alumnos', authenticateToken, async (req, res) => {
    console.log("  Ruta: GET /api/alumnos solicitada. Query params:", req.query);
    const { claseId } = req.query;
    const userRol = req.user.rol;
    const userId = req.user.id; 
    const userClaseId = req.user.claseId; 

    let baseSql = `SELECT a.id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                   FROM alumnos a 
                   JOIN clases c ON a.clase_id = c.id`;
    const params = [];
    let whereClauses = [];

    try {
        if (userRol === 'TUTOR') {
            if (!userClaseId) {
                console.warn(`  Tutor ${req.user.email} (ID: ${userId}) no tiene clase asignada. Devolviendo lista vacía de alumnos.`);
                return res.json({ alumnos: [] });
            }
            whereClauses.push("a.clase_id = ?");
            params.push(userClaseId);
        } else if (userRol === 'DIRECCION') {
            if (claseId) {
                whereClauses.push("a.clase_id = ?");
                params.push(claseId);
            }
        } else if (userRol === 'COORDINACION') {
            if (!claseId) {
                return res.status(400).json({ error: "Se requiere un ID de clase (claseId) para coordinadores." });
            }
            const assignedClaseIds = await getCoordinadorClases(userId);
            const numericClaseId = parseInt(claseId);
            if (isNaN(numericClaseId) || !assignedClaseIds.includes(numericClaseId)) {
                return res.status(403).json({ error: "Acceso denegado. El coordinador no tiene asignada esta clase." });
            }
            whereClauses.push("a.clase_id = ?");
            params.push(numericClaseId);
        } else {
            return res.status(403).json({ error: "Acceso no autorizado a la lista de alumnos." });
        }

        let finalSql = baseSql;
        if (whereClauses.length > 0) {
            finalSql += " WHERE " + whereClauses.join(" AND ");
        }
        finalSql += " ORDER BY c.nombre_clase ASC, a.apellidos_para_ordenar ASC, a.nombre_completo ASC"; 
        
        const alumnos = await dbAllAsync(finalSql, params);
        console.log(`  Alumnos encontrados: ${alumnos.length}`);
        res.json({ alumnos });

    } catch (error) {
        console.error("  Error en GET /api/alumnos:", error.message);
        res.status(500).json({ error: "Error obteniendo alumnos: " + error.message });
    }
});
console.log("Endpoint GET /api/alumnos definido.");


// POST /api/alumnos/importar_csv - Importar alumnos desde un CSV a una clase
app.post('/api/alumnos/importar_csv', authenticateToken, async (req, res) => {
    const { clase_id, csv_data } = req.body; // Esperamos el ID de la clase y el contenido del CSV como string
    console.log(`  Ruta: POST /api/alumnos/importar_csv para clase_id: ${clase_id}`);
    
    if (!clase_id || !csv_data) {
        return res.status(400).json({ error: "Se requiere clase_id y csv_data." });
    }

    const idClaseNum = parseInt(clase_id);
    if (isNaN(idClaseNum)) {
        return res.status(400).json({ error: "clase_id inválido." });
    }

    // Verificar permisos
    if (req.user.rol === 'TUTOR') {
        if (!req.user.claseId || req.user.claseId !== idClaseNum) {
            return res.status(403).json({ error: "Tutor solo puede importar alumnos a su clase asignada." });
        }
    } else if (req.user.rol === 'COORDINACION') {
        const assignedClaseIds = await getCoordinadorClases(req.user.id);
        if (!assignedClaseIds.includes(idClaseNum)) {
            return res.status(403).json({ error: "Coordinador solo puede importar alumnos a sus clases asignadas." });
        }
    } else if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: "Acción no autorizada." });
    }

    // Verificar que la clase existe
    try {
        // CORRECCIÓN AQUÍ: dbGetAsyncP -> dbGetAsync
        const claseDb = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [idClaseNum]);
        if (!claseDb) {
            return res.status(404).json({ error: `La clase con ID ${idClaseNum} no existe.` });
        }
    } catch (e) {
        console.error("  Error verificando la clase en POST /api/alumnos/importar_csv:", e.message);
        return res.status(500).json({ error: "Error verificando la clase: " + e.message });
    }

    const lineas = csv_data.split(/\r\n|\n/);
    let alumnosImportados = 0;
    let alumnosOmitidos = 0;
    let erroresEnLineas = [];
    const promesasDeInsercion = [];

    function limpiarComillasEnvolventes(textoStr) {
        let texto = String(textoStr).trim();
        if (texto.length >= 2 && texto.startsWith('"') && texto.endsWith('"')) {
            texto = texto.substring(1, texto.length - 1).replace(/""/g, '"');
        }
        return texto;
    }

    for (let i = 0; i < lineas.length; i++) {
        const lineaOriginal = lineas[i];
        let lineaParaProcesar = lineaOriginal.trim();
        if (lineaParaProcesar === '') continue;

        let contenidoCampo = limpiarComillasEnvolventes(lineaParaProcesar);

        if (i === 0 && (contenidoCampo.toLowerCase().includes('alumno') || contenidoCampo.toLowerCase().includes('apellido'))) {
            console.log("  Cabecera CSV omitida en importación:", lineaOriginal);
            continue; 
        }

        let apellidos = "";
        let nombre = "";
        const indiceUltimaComa = contenidoCampo.lastIndexOf(',');
        
        if (indiceUltimaComa > 0 && indiceUltimaComa < contenidoCampo.length - 1) {
            apellidos = contenidoCampo.substring(0, indiceUltimaComa).trim();
            nombre = contenidoCampo.substring(indiceUltimaComa + 1).trim();
        } else {
            if (contenidoCampo) {
                console.warn(`  Línea ${i + 1} en CSV no sigue el formato "Apellidos, Nombre": "${contenidoCampo}"`);
                erroresEnLineas.push({ linea: i + 1, dato: contenidoCampo, error: "Formato incorrecto (se esperaba 'Apellidos, Nombre')" });
            }
            continue; 
        }

        if (nombre && apellidos) {
            const nombreCompletoFinal = `${nombre} ${apellidos}`; // Formato: Nombre Apellidos
            const apellidosOrden = apellidos; // Usamos los apellidos parseados para ordenar
            promesasDeInsercion.push(
                // CORRECCIÓN AQUÍ: dbGetAsyncP -> dbGetAsync
                dbGetAsync("SELECT id FROM alumnos WHERE lower(nombre_completo) = lower(?) AND clase_id = ?", [nombreCompletoFinal.toLowerCase(), idClaseNum])
                .then(alumnoExistente => {
                    if (alumnoExistente) {
                        alumnosOmitidos++;
                        console.log(`  Alumno omitido (duplicado): ${nombreCompletoFinal} en clase ID ${idClaseNum}`);
                    } else {
                        // CORRECCIÓN AQUÍ: dbRunAsyncP -> dbRunAsync
                                  return dbRunAsync("INSERT INTO alumnos (nombre_completo, apellidos_para_ordenar, clase_id) VALUES (?, ?, ?)", [nombreCompletoFinal, apellidosOrden, idClaseNum])
                            .then(() => {
                                alumnosImportados++;
                                 console.log(`  Alumno importado: ${nombreCompletoFinal} (Orden: ${apellidosOrden}) a clase ID ${idClaseNum}`);
                            });
                    }
                })
                .catch(errIns => {
                    console.error(`  Error procesando alumno ${nombreCompletoFinal}: ${errIns.message}`);
                    erroresEnLineas.push({ linea: i + 1, dato: contenidoCampo, error: errIns.message });
                })
            );
        } else {
            erroresEnLineas.push({ linea: i + 1, dato: contenidoCampo, error: "Nombre o apellidos vacíos tras procesar." });
        }
    }

    try {
        await Promise.all(promesasDeInsercion);
        console.log("  Proceso de importación CSV completado.");
        res.json({
            message: "Proceso de importación CSV completado.",
            importados: alumnosImportados,
            omitidos_duplicados: alumnosOmitidos,
            lineas_con_error: erroresEnLineas.length,
            detalles_errores: erroresEnLineas
        });
    } catch (errorGeneral) {
        console.error("  Error general durante el proceso de importación CSV:", errorGeneral);
        res.status(500).json({ error: "Error interno durante la importación masiva." });
    }
});
console.log("Endpoint POST /api/alumnos/importar_csv definido.");

// --- CRUD PARA ALUMNOS (PENDIENTE DE IMPLEMENTAR COMPLETAMENTE: POST, PUT, DELETE individual) ---
// Ejemplo POST para crear un alumno individualmente (necesitarás esto para el formulario manual)
app.post('/api/alumnos', authenticateToken, async (req, res) => {
    const { nombre, apellidos, clase_id } = req.body; // NUEVO - Asume que el frontend envía esto
    console.log("  Ruta: POST /api/alumnos, Body:", req.body);

   if (!nombre || !apellidos || !clase_id) { // NUEVA VALIDACIÓN
    return res.status(400).json({ error: "Nombre, apellidos y clase_id son requeridos." });
    }
    const idClaseNum = parseInt(clase_id);
    if (isNaN(idClaseNum)) {
        return res.status(400).json({ error: "clase_id inválido." });
    }
const nombre_completo_a_guardar = `${nombre} ${apellidos}`;
const apellidos_para_ordenar_a_guardar = apellidos;
    // Lógica de permisos (similar a la importación CSV)
    if (req.user.rol === 'TUTOR') {
        if (!req.user.claseId || req.user.claseId !== idClaseNum) {
            return res.status(403).json({ error: "Tutor solo puede añadir alumnos a su clase asignada." });
        }
    } else if (req.user.rol === 'COORDINACION') {
        const assignedClaseIds = await getCoordinadorClases(req.user.id);
        if (!assignedClaseIds.includes(idClaseNum)) {
            return res.status(403).json({ error: "Coordinador solo puede añadir alumnos a sus clases asignadas." });
        }
    } else if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: "Acción no autorizada." });
    }
    
    try {
        // Verificar si la clase existe
        const claseDb = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [idClaseNum]);
        if (!claseDb) {
            return res.status(404).json({ error: `La clase con ID ${idClaseNum} no existe.` });
        }

        // Verificar si el alumno ya existe en esa clase
        const alumnoExistente = await dbGetAsync("SELECT id FROM alumnos WHERE lower(nombre_completo) = lower(?) AND clase_id = ?", [nombre_completo_a_guardar.toLowerCase(), idClaseNum]); // Corregido aquí
        if (alumnoExistente) {
            return res.status(409).json({ error: `El alumno '${nombre_completo_a_guardar}' ya existe en la clase seleccionada.`}); // Corregido aquí
        }

        const result = await dbRunAsync("INSERT INTO alumnos (nombre_completo, apellidos_para_ordenar, clase_id) VALUES (?, ?, ?)", [nombre_completo_a_guardar, apellidos_para_ordenar_a_guardar, idClaseNum]); // Corregido aquí
        const nuevoAlumno = await dbGetAsync("SELECT a.id, a.nombre_completo, a.clase_id, c.nombre_clase FROM alumnos a JOIN clases c ON a.clase_id = c.id WHERE a.id = ?", [result.lastID]);
        console.log("  Alumno creado con ID:", result.lastID);
        res.status(201).json({ message: "Alumno creado exitosamente", alumno: nuevoAlumno });
    } catch (error) {
        console.error("  Error en POST /api/alumnos:", error.message);
        res.status(500).json({ error: "Error creando alumno: " + error.message });
    }
});
console.log("Endpoint POST /api/alumnos (crear individual) definido.");

// PUT /api/alumnos/:id - Actualizar un alumno existente
app.put('/api/alumnos/:id', authenticateToken, async (req, res) => {
    const alumnoId = parseInt(req.params.id);
    if (isNaN(alumnoId)) {
        return res.status(400).json({ error: "ID de alumno inválido." });
    }

    const { nombre, apellidos, clase_id: nueva_clase_id_str } = req.body;
    console.log(`  Ruta: PUT /api/alumnos/${alumnoId}, Body:`, req.body);

    if (!nombre || !apellidos) { // clase_id puede o no venir para una actualización
        return res.status(400).json({ error: "Nombre y apellidos son requeridos." });
    }
    
    const nombre_completo_a_guardar = `${nombre.trim()} ${apellidos.trim()}`;
    const apellidos_para_ordenar_a_guardar = apellidos.trim();
    let nueva_clase_id = nueva_clase_id_str ? parseInt(nueva_clase_id_str) : undefined;

    if (nueva_clase_id_str && isNaN(nueva_clase_id)) {
        return res.status(400).json({ error: "clase_id inválido." });
    }

    try {
        const alumnoActual = await dbGetAsync("SELECT id, clase_id FROM alumnos WHERE id = ?", [alumnoId]);
        if (!alumnoActual) {
            return res.status(404).json({ error: "Alumno no encontrado." });
        }

        // RBAC: Verificar permisos para editar este alumno y para moverlo a la nueva clase si aplica
        let puedeEditar = false;
        if (req.user.rol === 'DIRECCION') {
            puedeEditar = true;
            if (nueva_clase_id !== undefined && nueva_clase_id !== alumnoActual.clase_id) {
                const claseDestino = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [nueva_clase_id]);
                if (!claseDestino) return res.status(400).json({ error: "La nueva clase de destino no existe." });
            }
        } else if (req.user.rol === 'TUTOR') {
            if (alumnoActual.clase_id !== req.user.claseId) {
                return res.status(403).json({ error: "Tutores solo pueden editar alumnos de su propia clase." });
            }
            if (nueva_clase_id !== undefined && nueva_clase_id !== alumnoActual.clase_id) {
                return res.status(403).json({ error: "Tutores no pueden cambiar la clase de un alumno." });
            }
            puedeEditar = true;
        } else if (req.user.rol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            if (!assignedClaseIds.includes(alumnoActual.clase_id)) {
                return res.status(403).json({ error: "Coordinadores solo pueden editar alumnos de sus clases asignadas." });
            }
            if (nueva_clase_id !== undefined && nueva_clase_id !== alumnoActual.clase_id) {
                if (!assignedClaseIds.includes(nueva_clase_id)) {
                    return res.status(403).json({ error: "Coordinadores solo pueden mover alumnos a otra de sus clases asignadas." });
                }
                const claseDestino = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [nueva_clase_id]);
                 if (!claseDestino) return res.status(400).json({ error: "La nueva clase de destino no existe." });
            }
            puedeEditar = true;
        }

        if (!puedeEditar) { // Aunque algunas rutas ya retornan, esta es una salvaguarda general.
            return res.status(403).json({ error: "No tiene permisos para modificar este alumno o asignarlo a la clase especificada." });
        }
        
        // Verificar duplicados si el nombre o la clase cambian
        if (nombre_completo_a_guardar.toLowerCase() !== alumnoActual.nombre_completo.toLowerCase() || (nueva_clase_id !== undefined && nueva_clase_id !== alumnoActual.clase_id)) {
            const claseParaChequeo = nueva_clase_id !== undefined ? nueva_clase_id : alumnoActual.clase_id;
            const alumnoExistenteEnClase = await dbGetAsync(
                "SELECT id FROM alumnos WHERE lower(nombre_completo) = lower(?) AND clase_id = ? AND id != ?",
                [nombre_completo_a_guardar.toLowerCase(), claseParaChequeo, alumnoId]
            );
            if (alumnoExistenteEnClase) {
                return res.status(409).json({ error: `Ya existe un alumno con el nombre '${nombre_completo_a_guardar}' en la clase de destino.` });
            }
        }


        let updateFields = ["nombre_completo = ?", "apellidos_para_ordenar = ?"];
        let updateParams = [nombre_completo_a_guardar, apellidos_para_ordenar_a_guardar];

        if (nueva_clase_id !== undefined && nueva_clase_id !== alumnoActual.clase_id) {
            updateFields.push("clase_id = ?");
            updateParams.push(nueva_clase_id);
        }
        updateParams.push(alumnoId);

        const sqlUpdate = `UPDATE alumnos SET ${updateFields.join(", ")} WHERE id = ?`;
        await dbRunAsync(sqlUpdate, updateParams);

        const alumnoActualizado = await dbGetAsync(
            "SELECT a.id, a.nombre_completo, a.clase_id, c.nombre_clase FROM alumnos a JOIN clases c ON a.clase_id = c.id WHERE a.id = ?",
            [alumnoId]
        );
        console.log(`  Alumno ID ${alumnoId} actualizado.`);
        res.json({ message: "Alumno actualizado exitosamente", alumno: alumnoActualizado });

    } catch (error) {
        console.error(`  Error en PUT /api/alumnos/${alumnoId}:`, error.message);
        if (error.message.includes("UNIQUE constraint failed")) { // Por si acaso, aunque ya se valida antes
             return res.status(409).json({ error: "Error de constraint: nombre de alumno duplicado en la clase." });
        }
        res.status(500).json({ error: "Error interno del servidor al actualizar el alumno." });
    }
});
console.log("Endpoint PUT /api/alumnos/:id definido.");

// DELETE /api/alumnos/:id - Eliminar un alumno
app.delete('/api/alumnos/:id', authenticateToken, async (req, res) => {
    const alumnoId = parseInt(req.params.id);
    if (isNaN(alumnoId)) {
        return res.status(400).json({ error: "ID de alumno inválido." });
    }
    console.log(`  Ruta: DELETE /api/alumnos/${alumnoId}`);

    try {
        const alumno = await dbGetAsync("SELECT id, clase_id FROM alumnos WHERE id = ?", [alumnoId]);
        if (!alumno) {
            return res.status(404).json({ error: "Alumno no encontrado." });
        }

        // RBAC
        let puedeEliminar = false;
        if (req.user.rol === 'DIRECCION') {
            puedeEliminar = true;
        } else if (req.user.rol === 'TUTOR') {
            if (alumno.clase_id === req.user.claseId) {
                puedeEliminar = true;
            }
        } else if (req.user.rol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            if (assignedClaseIds.includes(alumno.clase_id)) {
                puedeEliminar = true;
            }
        }

        if (!puedeEliminar) {
            return res.status(403).json({ error: "No tiene permisos para eliminar este alumno." });
        }
        
        // ON DELETE CASCADE en participaciones_excursion debería encargarse de borrar esas entradas.
        const result = await dbRunAsync("DELETE FROM alumnos WHERE id = ?", [alumnoId]);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Alumno no encontrado para eliminar (posiblemente ya eliminado)." });
        }

        console.log(`  Alumno ID ${alumnoId} eliminado.`);
        res.status(200).json({ message: "Alumno eliminado exitosamente." });

    } catch (error) {
        console.error(`  Error en DELETE /api/alumnos/${alumnoId}:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al eliminar el alumno." });
    }
});
console.log("Endpoint DELETE /api/alumnos/:id definido.");


// --- Gestión de Excursiones ---
app.post('/api/excursiones', authenticateToken, async (req, res) => {
    console.log("  Ruta: POST /api/excursiones, Body:", req.body);
    // Destructure with _raw suffix to indicate pre-trimmed values
    const { 
        nombre_excursion: nombre_excursion_raw, 
        actividad_descripcion: actividad_descripcion_raw, 
        lugar: lugar_raw, 
        fecha_excursion: fecha_excursion_raw, 
        hora_salida: hora_salida_raw, 
        hora_llegada: hora_llegada_raw, 
        vestimenta: vestimenta_raw, 
        transporte: transporte_raw, 
        justificacion_texto: justificacion_texto_raw,
        coste_excursion_alumno = 0 // Default si no se provee
    } = req.body;
    let { para_clase_id, notas_excursion: notas_excursion_raw } = req.body; 

    const creada_por_usuario_id = req.user.id;

    // Trim string inputs
    const nombre_excursion = typeof nombre_excursion_raw === 'string' ? nombre_excursion_raw.trim() : nombre_excursion_raw;
    const actividad_descripcion = typeof actividad_descripcion_raw === 'string' ? actividad_descripcion_raw.trim() : actividad_descripcion_raw;
    const lugar = typeof lugar_raw === 'string' ? lugar_raw.trim() : lugar_raw;
    const fecha_excursion = typeof fecha_excursion_raw === 'string' ? fecha_excursion_raw.trim() : fecha_excursion_raw;
    const hora_salida = typeof hora_salida_raw === 'string' ? hora_salida_raw.trim() : hora_salida_raw;
    const hora_llegada = typeof hora_llegada_raw === 'string' ? hora_llegada_raw.trim() : hora_llegada_raw;
    const vestimenta = typeof vestimenta_raw === 'string' ? vestimenta_raw.trim() : vestimenta_raw;
    const transporte = typeof transporte_raw === 'string' ? transporte_raw.trim() : transporte_raw;
    const justificacion_texto = typeof justificacion_texto_raw === 'string' ? justificacion_texto_raw.trim() : justificacion_texto_raw;
    const notas_excursion = typeof notas_excursion_raw === 'string' ? notas_excursion_raw.trim() : notas_excursion_raw;

    // Validación de campos obligatorios (después de trim)
    const requiredFieldsData = [
        { name: 'nombre_excursion', value: nombre_excursion },
        { name: 'actividad_descripcion', value: actividad_descripcion },
        { name: 'lugar', value: lugar },
        { name: 'fecha_excursion', value: fecha_excursion },
        { name: 'hora_salida', value: hora_salida },
        { name: 'hora_llegada', value: hora_llegada },
        { name: 'vestimenta', value: vestimenta },
        { name: 'transporte', value: transporte },
        { name: 'justificacion_texto', value: justificacion_texto }
    ];

    for (const field of requiredFieldsData) {
        if (field.value === undefined || field.value === null || field.value === '') { // Check for empty string after trim
            return res.status(400).json({ error: `El campo '${field.name}' es obligatorio y no puede estar vacío.` });
        }
    }

    // Validaciones específicas para vestimenta y transporte (valores ya trimeados)
    if (vestimenta !== 'Uniforme' && vestimenta !== 'Chándal') {
        return res.status(400).json({ error: "El campo 'vestimenta' debe ser 'Uniforme' o 'Chándal'." });
    }
    if (transporte !== 'Autobús' && transporte !== 'Andando') {
        return res.status(400).json({ error: "El campo 'transporte' debe ser 'Autobús' o 'Andando'." });
    }
    
    // Validación de formato de fecha (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fecha_excursion)) { // fecha_excursion ya está trimeada
        return res.status(400).json({ error: "Formato de fecha_excursion inválido. Use YYYY-MM-DD." });
    }

    // Validación de formato de hora (HH:MM) (valores ya trimeados)
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(hora_salida) || !timeRegex.test(hora_llegada)) {
        return res.status(400).json({ error: "Formato de hora_salida o hora_llegada inválido. Use HH:MM." });
    }
    
    if (coste_excursion_alumno !== undefined && (typeof coste_excursion_alumno !== 'number' || coste_excursion_alumno < 0)) { // No es string
        return res.status(400).json({ error: "coste_excursion_alumno debe ser un número no negativo." });
    }

    let finalParaClaseId = null; // Por defecto para excursiones globales o de dirección

    if (req.user.rol === 'TUTOR') {
        if (!req.user.claseId) {
            // Este chequeo es importante. Si un tutor no tiene claseId, no puede determinar su ciclo.
            return res.status(403).json({ error: "Tutor no asignado a ninguna clase. No puede crear excursiones." });
        }

        if (para_clase_id === null) { // Excursión explícitamente global
            finalParaClaseId = null;
        } else if (para_clase_id !== undefined && String(para_clase_id).trim() !== '') {
            const parsedParaClaseId = parseInt(para_clase_id);
            if (isNaN(parsedParaClaseId)) {
                return res.status(400).json({ error: "ID de para_clase_id inválido." });
            }

            if (parsedParaClaseId === req.user.claseId) {
                finalParaClaseId = parsedParaClaseId;
            } else {
                const cicloClaseIds = await getTutorCicloClaseIds(req.user.claseId);
                if (cicloClaseIds && cicloClaseIds.includes(parsedParaClaseId)) {
                    finalParaClaseId = parsedParaClaseId;
                } else {
                    return res.status(403).json({ error: "Tutores solo pueden crear excursiones para su propia clase, para clases de su mismo ciclo, o globales (especificando null)." });
                }
            }
        } else { // No se proporcionó para_clase_id o era string vacío, default a la clase del tutor
            finalParaClaseId = req.user.claseId;
        }
    } else if (req.user.rol === 'DIRECCION') {
        if (para_clase_id !== undefined && para_clase_id !== null && String(para_clase_id).trim() !== '') {
            const idClaseNum = parseInt(para_clase_id);
            if (isNaN(idClaseNum)) {
                 return res.status(400).json({ error: "ID de para_clase_id inválido." });
            }
            try {
                const clase = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [idClaseNum]);
                if (!clase) {
                    return res.status(404).json({ error: `La clase de destino con ID ${idClaseNum} no existe.` });
                }
                finalParaClaseId = idClaseNum;
            } catch (dbError) {
                console.error("  Error verificando clase en POST /api/excursiones:", dbError.message);
                return res.status(500).json({ error: "Error interno al verificar la clase de destino." });
            }
        } else {
            finalParaClaseId = null; // Excursión global (o no especificada para_clase_id) creada por Dirección
        }
    } else if (req.user.rol === 'COORDINACION') {
        if (para_clase_id !== undefined && para_clase_id !== null && String(para_clase_id).trim() !== '') {
            const idClaseNum = parseInt(para_clase_id);
            if (isNaN(idClaseNum)) {
                 return res.status(400).json({ error: "ID de para_clase_id inválido." });
            }
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            if (!assignedClaseIds.includes(idClaseNum)) {
                return res.status(403).json({ error: "Coordinadores solo pueden crear excursiones para sus clases asignadas." });
            }
            finalParaClaseId = idClaseNum;
        } else {
            finalParaClaseId = null; // Excursión global creada por Coordinación
        }
    } else {
        return res.status(403).json({ error: "Rol no autorizado para crear excursiones." });
    }

    const sqlInsert = `
        INSERT INTO excursiones (
            nombre_excursion, fecha_excursion, lugar, hora_salida, hora_llegada,
            coste_excursion_alumno, vestimenta, transporte, justificacion_texto,
            actividad_descripcion, notas_excursion, creada_por_usuario_id, para_clase_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const paramsInsert = [
        nombre_excursion, fecha_excursion, lugar, hora_salida, hora_llegada, // Ya trimeados
        coste_excursion_alumno, vestimenta, transporte, justificacion_texto, // Ya trimeados
        actividad_descripcion, notas_excursion ? notas_excursion : null, // Ya trimeados (notas_excursion puede ser null si era cadena vacía)
        creada_por_usuario_id, finalParaClaseId
    ];

    try {
        const result = await dbRunAsync(sqlInsert, paramsInsert);
        const nuevaExcursion = await dbGetAsync(
            `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
             FROM excursiones e 
             JOIN usuarios u ON e.creada_por_usuario_id = u.id 
             LEFT JOIN clases c ON e.para_clase_id = c.id 
             WHERE e.id = ?`,
            [result.lastID]
        );
        console.log(`  Excursión creada con ID: ${result.lastID} por Usuario ID: ${creada_por_usuario_id} para Clase ID: ${finalParaClaseId}`);
        res.status(201).json(nuevaExcursion);
    } catch (error) {
        console.error("  Error en POST /api/excursiones:", error.message);
        if (error.message.includes("FOREIGN KEY constraint failed")) {
            if (error.message.includes("clases")) {
                 return res.status(400).json({ error: "La clase especificada (para_clase_id) no existe." });
            } else if (error.message.includes("usuarios")) {
                 return res.status(400).json({ error: "El usuario creador no existe (esto no debería ocurrir si está autenticado)." });
            }
        }
        res.status(500).json({ error: "Error interno del servidor al crear la excursión." });
    }
});
console.log("Endpoint POST /api/excursiones definido.");

app.get('/api/excursiones', authenticateToken, async (req, res) => {
    console.log("  Ruta: GET /api/excursiones para usuario:", req.user.email, "Rol:", req.user.rol);
    let sql;
    const params = [];

    try {
        if (req.user.rol === 'DIRECCION' || req.user.rol === 'TESORERIA') {
            sql = `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
                   FROM excursiones e 
                   JOIN usuarios u ON e.creada_por_usuario_id = u.id 
                   LEFT JOIN clases c ON e.para_clase_id = c.id`;
            // No additional WHERE for DIRECCION or TESORERIA initially, fetches all.
        } else if (req.user.rol === 'TUTOR') {
            if (!req.user.claseId) {
                console.warn(`  Tutor ${req.user.email} (ID: ${req.user.id}) no tiene claseId en el token o asignada. Devolviendo lista vacía de excursiones.`);
                return res.json({ excursiones: [] }); 
            }
            sql = `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
                   FROM excursiones e 
                   JOIN usuarios u ON e.creada_por_usuario_id = u.id 
                   LEFT JOIN clases c ON e.para_clase_id = c.id`; // WHERE clause will be built below
            
            let whereClauses = ["(e.para_clase_id IS NULL OR e.para_clase_id = ?)"];
            params.push(req.user.claseId);

            // Get other class IDs from the same cycle
            const cicloClaseIds = await getTutorCicloClaseIds(req.user.claseId);
            console.log(`[GET /api/excursiones - TUTOR] Clase ID: ${req.user.claseId}, Clases del mismo ciclo: ${cicloClaseIds.join(', ')}`);

            if (cicloClaseIds && cicloClaseIds.length > 0) {
                // Filter out the tutor's own class ID from cicloClaseIds to avoid redundancy in SQL query, though SQL would handle it.
                const otherCicloClaseIds = cicloClaseIds.filter(id => id !== req.user.claseId);
                if (otherCicloClaseIds.length > 0) {
                    const placeholders = otherCicloClaseIds.map(() => '?').join(',');
                    whereClauses.push(`e.para_clase_id IN (${placeholders})`);
                    params.push(...otherCicloClaseIds);
                }
            }
            sql += ` WHERE ${whereClauses.join(' OR ')}`;

        } else if (req.user.rol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            sql = `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
                   FROM excursiones e 
                   JOIN usuarios u ON e.creada_por_usuario_id = u.id 
                   LEFT JOIN clases c ON e.para_clase_id = c.id 
                   WHERE e.para_clase_id IS NULL`; // Global excursions
            if (assignedClaseIds.length > 0) {
                const placeholders = assignedClaseIds.map(() => '?').join(',');
                sql += ` OR e.para_clase_id IN (${placeholders})`;
                params.push(...assignedClaseIds);
            }
        } else {
            console.warn(`  Usuario ${req.user.email} con rol ${req.user.rol} intentó acceder a excursiones. Acceso denegado.`);
            return res.status(403).json({ error: "Rol no autorizado para ver excursiones." });
        }
        
        sql += " ORDER BY e.fecha_excursion DESC, e.id DESC";
        const excursiones = await dbAllAsync(sql, params);
        console.log(`  Excursiones encontradas: ${excursiones.length} para rol ${req.user.rol} (Clase ID del tutor si aplica: ${req.user.claseId || 'N/A'})`);
        res.json({ excursiones });

    } catch (error) {
        console.error("  Error en GET /api/excursiones:", error.message);
        res.status(500).json({ error: "Error interno del servidor al obtener las excursiones." });
    }
});
console.log("Endpoint GET /api/excursiones definido.");

// GET /api/excursiones/:id - Obtener una excursión específica
app.get('/api/excursiones/:id', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.id);
    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }
    console.log(`  Ruta: GET /api/excursiones/${excursionId} para usuario ${req.user.email}`);

    const sql = `
        SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
        FROM excursiones e 
        JOIN usuarios u ON e.creada_por_usuario_id = u.id 
        LEFT JOIN clases c ON e.para_clase_id = c.id 
        WHERE e.id = ?
    `;
    try {
        const excursion = await dbGetAsync(sql, [excursionId]);
        if (!excursion) {
            return res.status(404).json({ error: "Excursión no encontrada." });
        }

        // RBAC
        if (req.user.rol === 'DIRECCION') {
            // Dirección tiene acceso
        } else if (req.user.rol === 'TUTOR') {
            if (excursion.para_clase_id !== null && excursion.para_clase_id !== req.user.claseId) {
                 // Si la excursión es para una clase específica, y no es la del tutor, denegar.
                return res.status(403).json({ error: "Tutores solo pueden ver excursiones globales o de su propia clase." });
            }
            if (excursion.para_clase_id !== null && !req.user.claseId) {
                // Si la excursión es para una clase específica, pero el tutor no tiene clase asignada.
                return res.status(403).json({ error: "Tutor no asignado a una clase no puede ver excursiones de clase." });
            }
        } else {
            // Otros roles no definidos no tienen acceso
            return res.status(403).json({ error: "Rol no autorizado." });
        }

        res.json(excursion);
    } catch (error) {
        console.error(`  Error en GET /api/excursiones/${excursionId}:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al obtener la excursión." });
    }
});
console.log("Endpoint GET /api/excursiones/:id definido.");

// PUT /api/excursiones/:id - Actualizar una excursión existente
app.put('/api/excursiones/:id', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.id);
    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }
    console.log(`  Ruta: PUT /api/excursiones/${excursionId} para usuario ${req.user.email}, Body:`, req.body);

    try {
        const excursionActual = await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [excursionId]);
        if (!excursionActual) {
            return res.status(404).json({ error: "Excursión no encontrada para actualizar." });
        }

        // RBAC para editar
        let puedeEditar = false;
        if (req.user.rol === 'DIRECCION') {
            puedeEditar = true;
        } else if (req.user.rol === 'TUTOR') {
            if (!req.user.claseId && excursionActual.para_clase_id !== null && excursionActual.creada_por_usuario_id !== req.user.id) {
                // Tutor sin clase no puede editar excursiones de clase que no creó él
                 return res.status(403).json({ error: "Tutor sin clase asignada no puede editar esta excursión específica de clase si no la creó." });
            }
            const cicloClaseIds = req.user.claseId ? await getTutorCicloClaseIds(req.user.claseId) : [];
            if (excursionActual.creada_por_usuario_id === req.user.id ||
                (excursionActual.para_clase_id === req.user.claseId && req.user.claseId) ||
                (excursionActual.para_clase_id !== null && cicloClaseIds && cicloClaseIds.includes(excursionActual.para_clase_id))) {
                puedeEditar = true;
            }
        } else if (req.user.rol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            if (excursionActual.creada_por_usuario_id === req.user.id ||
                excursionActual.para_clase_id === null ||
                (excursionActual.para_clase_id && assignedClaseIds.includes(excursionActual.para_clase_id))) {
                puedeEditar = true;
            }
        }
        if (!puedeEditar) {
            return res.status(403).json({ error: "No tiene permisos para modificar esta excursión." });
        }

        const processedBody = {};
        for (const key in req.body) {
            if (req.body.hasOwnProperty(key)) {
                let value = req.body[key];
                if (typeof value === 'string') {
                    value = value.trim();
                }
                processedBody[key] = value;
            }
        }

        const camposActualizables = [
            'nombre_excursion', 'fecha_excursion', 'lugar', 'hora_salida', 
            'hora_llegada', 'coste_excursion_alumno', 'vestimenta', 'transporte',
            'justificacion_texto', 'actividad_descripcion', 'notas_excursion', 'para_clase_id'
        ];
        let setClauses = [];
        let paramsForUpdate = []; 

        const stringFieldsThatMustNotBeEmptyWhenProvided = [
            'nombre_excursion', 'actividad_descripcion', 'lugar', 'fecha_excursion', 
            'hora_salida', 'hora_llegada', 'vestimenta', 'transporte', 'justificacion_texto'
        ];

        for (const campo of camposActualizables) {
            if (processedBody[campo] !== undefined) {
                let valueToUpdate = processedBody[campo];

                if (stringFieldsThatMustNotBeEmptyWhenProvided.includes(campo) && valueToUpdate === '') {
                    return res.status(400).json({ error: `El campo '${campo}' es obligatorio y no puede estar vacío si se proporciona para actualizar.` });
                }
                
                if (campo === 'vestimenta' && valueToUpdate !== '') { 
                    if (valueToUpdate !== 'Uniforme' && valueToUpdate !== 'Chándal') {
                        return res.status(400).json({ error: "El campo 'vestimenta' debe ser 'Uniforme' o 'Chándal' si se proporciona." });
                    }
                }
                if (campo === 'transporte' && valueToUpdate !== '') { 
                    if (valueToUpdate !== 'Autobús' && valueToUpdate !== 'Andando') {
                        return res.status(400).json({ error: "El campo 'transporte' debe ser 'Autobús' o 'Andando' si se proporciona." });
                    }
                }

                if (campo === 'fecha_excursion') {
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (valueToUpdate !== '' && !dateRegex.test(valueToUpdate)) return res.status(400).json({ error: "Formato de fecha_excursion inválido. Use YYYY-MM-DD." });
                }
                if (campo === 'hora_salida' || campo === 'hora_llegada') {
                    const timeRegex = /^\d{2}:\d{2}$/;
                    if (valueToUpdate !== '' && !timeRegex.test(valueToUpdate)) return res.status(400).json({ error: `Formato de ${campo} inválido. Use HH:MM.` });
                }
                if (campo === 'coste_excursion_alumno' && (typeof valueToUpdate !== 'number' || valueToUpdate < 0)) {
                     return res.status(400).json({ error: "coste_excursion_alumno debe ser un número no negativo." });
                }
                if (campo === 'para_clase_id') {
                    if (valueToUpdate === '') { 
                       return res.status(400).json({ error: "para_clase_id no puede ser una cadena vacía; use null si no aplica o un ID de clase."});
                    }
                    if (valueToUpdate !== null && isNaN(parseInt(valueToUpdate))) {
                       return res.status(400).json({ error: "para_clase_id debe ser un número (ID de clase) o null." });
                   }
                }

                if (req.user.rol === 'TUTOR' && campo === 'para_clase_id') {
                    const nuevoParaClaseIdNum = valueToUpdate === null ? null : parseInt(valueToUpdate);
                    
                    if (nuevoParaClaseIdNum === null) { // Intentando hacerla global
                        if (excursionActual.creada_por_usuario_id !== req.user.id) {
                            return res.status(403).json({ error: "Tutores solo pueden hacer global una excursión si la crearon ellos mismos." });
                        }
                        // Si la creó él, puede hacerla global, así que valueToUpdate (null) es válido.
                    } else { // Intentando asignar a una clase específica
                        if (!req.user.claseId) { // Tutor sin clase no puede asignar a ninguna clase
                            return res.status(403).json({ error: "Tutor sin clase asignada no puede asignar la excursión a una clase específica." });
                        }
                        const cicloClaseIds = await getTutorCicloClaseIds(req.user.claseId);
                        if (nuevoParaClaseIdNum !== req.user.claseId && !(cicloClaseIds && cicloClaseIds.includes(nuevoParaClaseIdNum))) {
                            return res.status(403).json({ error: "Tutores solo pueden asignar excursiones a su propia clase, a clases de su ciclo, o hacerlas globales (si las crearon)." });
                        }
                        // Si es su clase o una clase de su ciclo, valueToUpdate (ID de clase) es válido.
                    }
                }
                
                if (req.user.rol === 'DIRECCION' && campo === 'para_clase_id' && valueToUpdate !== null) {
                    const claseDestino = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [parseInt(valueToUpdate)]);
                    if (!claseDestino) {
                        return res.status(400).json({ error: `La clase de destino con ID ${valueToUpdate} no existe.` });
                    }
                } else if (req.user.rol === 'COORDINACION' && campo === 'para_clase_id' && valueToUpdate !== null) {
                    const idClaseNum = parseInt(valueToUpdate);
                     if (isNaN(idClaseNum)) { // Should have been caught by general validation, but good to double check
                        return res.status(400).json({ error: "ID de para_clase_id inválido para coordinador." });
                    }
                    const assignedClaseIds = await getCoordinadorClases(req.user.id);
                    if (!assignedClaseIds.includes(idClaseNum)) {
                         return res.status(403).json({ error: "Coordinadores solo pueden asignar excursiones a una de sus clases asignadas." });
                    }
                    // If valueToUpdate is null (making it global), it's allowed for COORDINACION if they can edit the excursion.
                }
                
                setClauses.push(`${campo} = ?`);
                if (campo === 'notas_excursion' && valueToUpdate === '') {
                    paramsForUpdate.push(null);
                } else {
                    paramsForUpdate.push(valueToUpdate);
                }
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ error: "No se proporcionaron campos para actualizar." });
        }

        const sqlUpdate = `UPDATE excursiones SET ${setClauses.join(", ")} WHERE id = ?`;
        paramsForUpdate.push(excursionId);

        await dbRunAsync(sqlUpdate, paramsForUpdate);
        
        const excursionActualizada = await dbGetAsync(
             `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
              FROM excursiones e 
              JOIN usuarios u ON e.creada_por_usuario_id = u.id 
              LEFT JOIN clases c ON e.para_clase_id = c.id 
              WHERE e.id = ?`, 
              [excursionId]
        );
        console.log(`  Excursión ID ${excursionId} actualizada.`);
        res.json(excursionActualizada);

    } catch (error) {
        console.error(`  Error en PUT /api/excursiones/${excursionId}:`, error.message);
        if (error.message.includes("FOREIGN KEY constraint failed") && error.message.includes("clases")) {
             return res.status(400).json({ error: "La clase especificada (para_clase_id) no existe." });
        }
        res.status(500).json({ error: "Error interno del servidor al actualizar la excursión." });
    }
});
console.log("Endpoint PUT /api/excursiones/:id definido.");

// DELETE /api/excursiones/:id - Eliminar una excursión
app.delete('/api/excursiones/:id', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.id);
    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }
    console.log(`  Ruta: DELETE /api/excursiones/${excursionId} para usuario ${req.user.email}`);

    try {
        const excursion = await dbGetAsync("SELECT id, creada_por_usuario_id, para_clase_id FROM excursiones WHERE id = ?", [excursionId]);
        if (!excursion) {
            return res.status(404).json({ error: "Excursión no encontrada para eliminar." });
        }

        // RBAC para eliminar
        let puedeEliminar = false;
        if (req.user.rol === 'DIRECCION') {
            puedeEliminar = true;
        } else if (req.user.rol === 'TUTOR') {
            // Tutor solo puede eliminar si la creó él
            if (excursion.creada_por_usuario_id === req.user.id) {
                puedeEliminar = true;
            }
        } else if (req.user.rol === 'COORDINACION') {
            // Coordinador solo puede eliminar si la creó él (as per instructions)
            if (excursion.creada_por_usuario_id === req.user.id) {
                puedeEliminar = true;
            }
        }
        if (!puedeEliminar) {
            return res.status(403).json({ error: "No tiene permisos para eliminar esta excursión." });
        }

        // Verificar si hay participaciones asociadas antes de eliminar
        // Aunque ON DELETE CASCADE está activo, es buena práctica informar.
        const participaciones = await dbGetAsync("SELECT COUNT(*) as count FROM participaciones_excursion WHERE excursion_id = ?", [excursionId]);
        if (participaciones.count > 0) {
            // Podrías optar por no permitir la eliminación o advertir.
            // Por ahora, procederemos con la eliminación debido a ON DELETE CASCADE.
            console.log(`  Excursión ID ${excursionId} tiene ${participaciones.count} participaciones. Serán eliminadas por CASCADE.`);
        }

        const result = await dbRunAsync("DELETE FROM excursiones WHERE id = ?", [excursionId]);
        if (result.changes === 0) {
            // Esto no debería ocurrir si la encontramos antes, pero por si acaso.
            return res.status(404).json({ error: "Excursión no encontrada durante el intento de eliminación." });
        }

        console.log(`  Excursión ID ${excursionId} eliminada.`);
        res.status(200).json({ message: "Excursión eliminada exitosamente." }); // O 204 No Content

    } catch (error) {
        console.error(`  Error en DELETE /api/excursiones/${excursionId}:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al eliminar la excursión." });
    }
});
console.log("Endpoint DELETE /api/excursiones/:id definido.");

// POST /api/excursiones/:id/duplicate - Duplicar una excursión
app.post('/api/excursiones/:id/duplicate', authenticateToken, async (req, res) => {
    const originalExcursionId = parseInt(req.params.id);
    const { target_clase_id } = req.body; // Puede ser undefined, null, o un ID de clase
    const duplicatorUserId = req.user.id;
    const duplicatorUserRol = req.user.rol;
    const duplicatorUserClaseId = req.user.claseId; // Puede ser null o undefined

    console.log(`  Ruta: POST /api/excursiones/${originalExcursionId}/duplicate, Usuario: ${req.user.email}, Body: { target_clase_id: ${target_clase_id} }`);

    if (isNaN(originalExcursionId)) {
        return res.status(400).json({ error: "ID de excursión original inválido." });
    }

    try {
        // 1. Fetch Original Excursion
        const originalExcursion = await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [originalExcursionId]);
        if (!originalExcursion) {
            return res.status(404).json({ error: "Excursión original no encontrada." });
        }

        // 2. Handle Permissions (RBAC) for Duplicating
        let canDuplicate = false;
        if (duplicatorUserRol === 'DIRECCION') {
            canDuplicate = true;
        } else if (duplicatorUserRol === 'TUTOR') {
            if (!duplicatorUserClaseId && originalExcursion.para_clase_id !== null) {
                 return res.status(403).json({ error: "Tutor sin clase asignada no puede duplicar una excursión que originalmente era para una clase específica." });
            }
            if (originalExcursion.para_clase_id === null) { // Global excursion
                canDuplicate = true;
            } else if (originalExcursion.para_clase_id === duplicatorUserClaseId) { // Excursion for tutor's own class
                canDuplicate = true;
            } else {
                // NUEVO: Permitir duplicar si la excursión original es de una clase de su ciclo
                const cicloClaseIds = duplicatorUserClaseId ? await getTutorCicloClaseIds(duplicatorUserClaseId) : [];
                if (cicloClaseIds && cicloClaseIds.includes(originalExcursion.para_clase_id)) {
                    canDuplicate = true;
                } else {
                    return res.status(403).json({ error: "Tutores no pueden duplicar excursiones destinadas a clases específicas fuera de su ciclo o si no tienen clase asignada." });
                }
            }
        } else if (duplicatorUserRol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(duplicatorUserId);
            if (originalExcursion.para_clase_id === null || assignedClaseIds.includes(originalExcursion.para_clase_id)) {
                canDuplicate = true;
            } else {
                 return res.status(403).json({ error: "Coordinadores solo pueden duplicar excursiones globales o de sus clases asignadas." });
            }
        }


        if (!canDuplicate) {
            return res.status(403).json({ error: "No tiene permisos para duplicar esta excursión." });
        }

        // 3. Prepare Data for the New Excursion - Determine finalParaClaseId
        let finalParaClaseId;

        if (target_clase_id !== undefined && target_clase_id !== null && String(target_clase_id).trim() !== '') {
            const idClaseNum = parseInt(target_clase_id);
            if (isNaN(idClaseNum)) {
                return res.status(400).json({ error: "target_clase_id proporcionado es inválido (no es un número)." });
            }

            if (duplicatorUserRol === 'DIRECCION') {
                const claseDestino = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [idClaseNum]);
                if (!claseDestino) {
                    return res.status(404).json({ error: `La clase de destino (target_clase_id ${idClaseNum}) no existe.` });
                }
                finalParaClaseId = idClaseNum;
            } else if (duplicatorUserRol === 'TUTOR') {
                if (!duplicatorUserClaseId) {
                     return res.status(403).json({ error: "Tutor sin clase asignada no puede asignar la excursión duplicada a una clase específica." });
                }
                if (!duplicatorUserClaseId) { // Should be caught by canDuplicate logic earlier, but defensive check
                     return res.status(403).json({ error: "Tutor sin clase asignada no puede asignar la excursión duplicada a una clase específica." });
                }
                const cicloClaseIds = await getTutorCicloClaseIds(duplicatorUserClaseId);
                if (idClaseNum === duplicatorUserClaseId || (cicloClaseIds && cicloClaseIds.includes(idClaseNum))) {
                    finalParaClaseId = idClaseNum;
                } else {
                    return res.status(403).json({ error: "Tutores solo pueden asignar la excursión duplicada a su propia clase o a clases de su mismo ciclo." });
                }
            }
        } else if (target_clase_id === null || (target_clase_id !== undefined && String(target_clase_id).trim() === '')) {
            // User explicitly wants to make it global
            finalParaClaseId = null;
        } else { // target_clase_id is undefined (not provided in body) - default logic
            if (duplicatorUserRol === 'DIRECCION') {
                finalParaClaseId = null; // Dirección duplica como global por defecto si no se especifica target
            } else if (duplicatorUserRol === 'TUTOR') {
                if (!duplicatorUserClaseId) {
                     // Si el tutor no tiene clase, y la excursión original era para una clase, debe especificar target_clase_id.
                     // Si la original era global, puede duplicarla como global.
                    if (originalExcursion.para_clase_id !== null) {
                         return res.status(400).json({ error: "Tutor sin clase asignada debe especificar target_clase_id (puede ser nulo para global) si la excursión original era para una clase." });
                    }
                    finalParaClaseId = null; // Default a global si el tutor no tiene clase y la original era global
                } else {
                    finalParaClaseId = duplicatorUserClaseId; // Default a la clase del tutor
                }
            } else if (duplicatorUserRol === 'COORDINACION') {
                 const assignedClaseIds = await getCoordinadorClases(duplicatorUserId);
                if (target_clase_id !== undefined && target_clase_id !== null && String(target_clase_id).trim() !== '') { // User specified a target
                    const idClaseNum = parseInt(target_clase_id);
                     if (isNaN(idClaseNum)) return res.status(400).json({ error: "target_clase_id (coordinador) inválido." });
                    if (!assignedClaseIds.includes(idClaseNum)) {
                        return res.status(403).json({ error: "Coordinadores solo pueden asignar la excursión duplicada a una de sus clases asignadas." });
                    }
                    finalParaClaseId = idClaseNum;
                } else if (target_clase_id === null || (target_clase_id !== undefined && String(target_clase_id).trim() === '')) { // User specified global
                    finalParaClaseId = null;
                } else { // target_clase_id is undefined (not provided) - Default logic for COORDINACION
                    if (originalExcursion.para_clase_id !== null && assignedClaseIds.includes(originalExcursion.para_clase_id)) {
                        finalParaClaseId = originalExcursion.para_clase_id; // Default to original's class if it was one of theirs
                    } else {
                        finalParaClaseId = null; // Default to global
                    }
                }
            }
        }
        
        // 4. Prepare Data for the New Excursion - Copy fields
        const nombreNuevaExcursion = originalExcursion.nombre_excursion;

        const nuevaExcursionData = {
            nombre_excursion: nombreNuevaExcursion,
            actividad_descripcion: originalExcursion.actividad_descripcion,
            lugar: originalExcursion.lugar,
            fecha_excursion: originalExcursion.fecha_excursion,
            hora_salida: originalExcursion.hora_salida,
            hora_llegada: originalExcursion.hora_llegada,
            coste_excursion_alumno: originalExcursion.coste_excursion_alumno,
            vestimenta: originalExcursion.vestimenta,
            transporte: originalExcursion.transporte,
            justificacion_texto: originalExcursion.justificacion_texto,
            notas_excursion: originalExcursion.notas_excursion,
            creada_por_usuario_id: duplicatorUserId,
            para_clase_id: finalParaClaseId
        };

        // 5. Insert the New Excursion
        const sqlInsert = `
            INSERT INTO excursiones (
                nombre_excursion, actividad_descripcion, lugar, fecha_excursion, hora_salida, hora_llegada,
                coste_excursion_alumno, vestimenta, transporte, justificacion_texto, notas_excursion,
                creada_por_usuario_id, para_clase_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const paramsInsert = [
            nuevaExcursionData.nombre_excursion, nuevaExcursionData.actividad_descripcion, nuevaExcursionData.lugar,
            nuevaExcursionData.fecha_excursion, nuevaExcursionData.hora_salida, nuevaExcursionData.hora_llegada,
            nuevaExcursionData.coste_excursion_alumno, nuevaExcursionData.vestimenta, nuevaExcursionData.transporte,
            nuevaExcursionData.justificacion_texto, nuevaExcursionData.notas_excursion,
            nuevaExcursionData.creada_por_usuario_id, nuevaExcursionData.para_clase_id
        ];

        const result = await dbRunAsync(sqlInsert, paramsInsert);
        const nuevaExcursionId = result.lastID;

        const excursionDuplicada = await dbGetAsync(
            `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
             FROM excursiones e 
             JOIN usuarios u ON e.creada_por_usuario_id = u.id 
             LEFT JOIN clases c ON e.para_clase_id = c.id 
             WHERE e.id = ?`,
            [nuevaExcursionId]
        );

        console.log(`  Excursión ID ${originalExcursionId} duplicada a nueva Excursión ID ${nuevaExcursionId} por Usuario ID: ${duplicatorUserId} para Clase ID: ${finalParaClaseId === null ? 'GLOBAL' : finalParaClaseId}`);
        res.status(201).json(excursionDuplicada);

    } catch (error) {
        console.error(`  Error en POST /api/excursiones/${originalExcursionId}/duplicate:`, error.message);
        if (error.message.includes("FOREIGN KEY constraint failed")) {
            if (error.message.includes("clases")) {
                 return res.status(400).json({ error: "La clase de destino especificada (target_clase_id) no existe o es inválida." });
            } else if (error.message.includes("usuarios")){
                 return res.status(500).json({ error: "Error interno: El usuario creador no parece existir."});
            }
        }
        res.status(500).json({ error: "Error interno del servidor al duplicar la excursión." });
    }
});
console.log("Endpoint POST /api/excursiones/:id/duplicate definido.");

// POST /api/excursiones/:id/share - Compartir una excursión con otro tutor
app.post('/api/excursiones/:id/share', authenticateToken, async (req, res) => {
    const originalExcursionId = parseInt(req.params.id);
    const sharerUserId = req.user.id;
    const { target_usuario_id } = req.body;

    console.log(`  Ruta: POST /api/excursiones/${originalExcursionId}/share, Usuario: ${req.user.email}, Body:`, req.body);

    // a. Validate original_excursion_id
    if (isNaN(originalExcursionId)) {
        return res.status(400).json({ error: "ID de excursión original inválido." });
    }

    // d. Validate target_usuario_id
    if (!target_usuario_id || isNaN(parseInt(target_usuario_id))) {
        return res.status(400).json({ error: "target_usuario_id es requerido y debe ser un número." });
    }
    const targetUsuarioIdNum = parseInt(target_usuario_id);

    if (targetUsuarioIdNum === sharerUserId) {
        return res.status(400).json({ error: "No puedes compartir una excursión contigo mismo." });
    }

    try {
        // b. Fetch the original excursion
        const originalExcursion = await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [originalExcursionId]);
        if (!originalExcursion) {
            return res.status(404).json({ error: "Excursión original no encontrada." });
        }

        // c. Perform permission check for accessing the original excursion
        let canViewOriginal = false;
        if (req.user.rol === 'DIRECCION') {
            canViewOriginal = true;
        } else if (req.user.rol === 'TUTOR') {
            if (originalExcursion.para_clase_id === null) { // Global excursion
                canViewOriginal = true;
            } else if (originalExcursion.para_clase_id === req.user.claseId) { // Excursion for tutor's own class
                 if (!req.user.claseId) { // Tutor must have a class to view a class-specific excursion for their class
                    return res.status(403).json({ error: "Tutor sin clase asignada no puede acceder a esta excursión específica de clase." });
                 }
                canViewOriginal = true;
            }
        } else if (req.user.rol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            if (originalExcursion.para_clase_id === null || assignedClaseIds.includes(originalExcursion.para_clase_id)) {
                canViewOriginal = true;
            }
        }
        if (!canViewOriginal) {
            return res.status(403).json({ error: "No tienes permisos para ver/compartir esta excursión." });
        }
        
        // d. Continue validation of target_usuario_id
        const targetUser = await dbGetAsync("SELECT id, rol FROM usuarios WHERE id = ?", [targetUsuarioIdNum]);
        if (!targetUser) {
            return res.status(404).json({ error: "Usuario destinatario no encontrado." });
        }
        if (targetUser.rol !== 'TUTOR') {
            return res.status(400).json({ error: "Solo se puede compartir con tutores." });
        }

        // e. Check for existing pending share
        const existingShare = await dbGetAsync(
            "SELECT id FROM shared_excursions WHERE original_excursion_id = ? AND shared_by_usuario_id = ? AND shared_with_usuario_id = ? AND status = 'pending'",
            [originalExcursionId, sharerUserId, targetUsuarioIdNum]
        );
        if (existingShare) {
            return res.status(409).json({ error: "Esta excursión ya ha sido compartida con este tutor y está pendiente." });
        }

        // f. Insert a new record into shared_excursions
        const sqlInsertShare = `
            INSERT INTO shared_excursions (original_excursion_id, shared_by_usuario_id, shared_with_usuario_id, status)
            VALUES (?, ?, ?, 'pending')
        `;
        const result = await dbRunAsync(sqlInsertShare, [originalExcursionId, sharerUserId, targetUsuarioIdNum]);
        const newShareId = result.lastID;

        // g. Fetch the newly created share record
        const newShareRecord = await dbGetAsync("SELECT * FROM shared_excursions WHERE id = ?", [newShareId]);

        console.log(`  Excursión ID ${originalExcursionId} compartida por Usuario ID ${sharerUserId} con Tutor ID ${targetUsuarioIdNum}. Share ID: ${newShareId}`);
        res.status(201).json(newShareRecord);

    } catch (error) {
        console.error(`  Error en POST /api/excursiones/${originalExcursionId}/share:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al compartir la excursión." });
    }
});
console.log("Endpoint POST /api/excursiones/:id/share definido.");

// GET /api/excursiones/shared/pending - Obtener excursiones pendientes de aceptar/rechazar
app.get('/api/excursiones/shared/pending', authenticateToken, async (req, res) => {
    console.log(`  Ruta: GET /api/excursiones/shared/pending, Usuario: ${req.user.email}`);

    if (req.user.rol !== 'TUTOR') {
        return res.status(403).json({ error: "Acceso denegado. Solo para tutores." });
    }

    try {
        const sql = `
            SELECT 
                se.id as share_id,
                se.original_excursion_id,
                se.shared_at,
                e.nombre_excursion,
                e.fecha_excursion,
                e.lugar,
                u.nombre_completo as nombre_compartido_por
            FROM shared_excursions se
            JOIN excursiones e ON se.original_excursion_id = e.id
            JOIN usuarios u ON se.shared_by_usuario_id = u.id
            WHERE se.shared_with_usuario_id = ? AND se.status = 'pending'
            ORDER BY se.shared_at DESC
        `;
        const pendingShares = await dbAllAsync(sql, [req.user.id]);
        
        res.json({ pending_shares: pendingShares });

    } catch (error) {
        console.error("  Error en GET /api/excursiones/shared/pending:", error.message);
        res.status(500).json({ error: "Error interno del servidor al obtener las excursiones compartidas pendientes." });
    }
});
console.log("Endpoint GET /api/excursiones/shared/pending definido.");

// POST /api/shared-excursions/:share_id/accept - Aceptar una excursión compartida
app.post('/api/shared-excursions/:share_id/accept', authenticateToken, async (req, res) => {
    const shareId = parseInt(req.params.share_id);
    const acceptingUserId = req.user.id;
    const acceptingUserClaseId = req.user.claseId;

    console.log(`  Ruta: POST /api/shared-excursiones/${shareId}/accept, Usuario: ${req.user.email}`);

    // a. Validate share_id
    if (isNaN(shareId)) {
        return res.status(400).json({ error: "ID de compartición inválido." });
    }

    // d. Accepting user must have an assigned class
    if (req.user.rol !== 'TUTOR' || !acceptingUserClaseId) {
        return res.status(400).json({ error: "Debes ser un tutor con una clase asignada para aceptar una excursión." });
    }

    try {
        // b. Fetch the shared_excursions record
        const shareRecord = await dbGetAsync("SELECT * FROM shared_excursions WHERE id = ?", [shareId]);
        if (!shareRecord) {
            return res.status(404).json({ error: "Invitación para compartir no encontrada." });
        }

        // c. Verify shared_with_usuario_id and status
        if (shareRecord.shared_with_usuario_id !== acceptingUserId) {
            return res.status(403).json({ error: "No estás autorizado para aceptar esta invitación." });
        }
        if (shareRecord.status !== 'pending') {
            return res.status(400).json({ error: `Esta invitación ya ha sido ${shareRecord.status}.` });
        }

        // e. Fetch the original excursion data
        const originalExcursion = await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [shareRecord.original_excursion_id]);
        if (!originalExcursion) {
            return res.status(404).json({ error: "La excursión original asociada a esta compartición ya no existe." });
        }

        // f. Create a new excursion (duplicate)
        const nuevaExcursionData = {
            nombre_excursion: originalExcursion.nombre_excursion, // Keep original name by default
            actividad_descripcion: originalExcursion.actividad_descripcion,
            lugar: originalExcursion.lugar,
            fecha_excursion: originalExcursion.fecha_excursion, // Keep original date by default
            hora_salida: originalExcursion.hora_salida,
            hora_llegada: originalExcursion.hora_llegada,
            coste_excursion_alumno: originalExcursion.coste_excursion_alumno,
            vestimenta: originalExcursion.vestimenta,
            transporte: originalExcursion.transporte,
            justificacion_texto: originalExcursion.justificacion_texto,
            notas_excursion: originalExcursion.notas_excursion,
            creada_por_usuario_id: acceptingUserId, // The accepting tutor is the creator of this new copy
            para_clase_id: acceptingUserClaseId    // Assign to accepting tutor's class
        };

        const sqlInsertExcursion = `
            INSERT INTO excursiones (
                nombre_excursion, actividad_descripcion, lugar, fecha_excursion, hora_salida, hora_llegada,
                coste_excursion_alumno, vestimenta, transporte, justificacion_texto, notas_excursion,
                creada_por_usuario_id, para_clase_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const paramsInsertExcursion = [
            nuevaExcursionData.nombre_excursion, nuevaExcursionData.actividad_descripcion, nuevaExcursionData.lugar,
            nuevaExcursionData.fecha_excursion, nuevaExcursionData.hora_salida, nuevaExcursionData.hora_llegada,
            nuevaExcursionData.coste_excursion_alumno, nuevaExcursionData.vestimenta, nuevaExcursionData.transporte,
            nuevaExcursionData.justificacion_texto, nuevaExcursionData.notas_excursion,
            nuevaExcursionData.creada_por_usuario_id, nuevaExcursionData.para_clase_id
        ];
        
        const resultInsertExcursion = await dbRunAsync(sqlInsertExcursion, paramsInsertExcursion);
        const newExcursionId = resultInsertExcursion.lastID;

        // g. Update the shared_excursions record
        const sqlUpdateShare = `
            UPDATE shared_excursions 
            SET status = 'accepted', processed_at = datetime('now'), new_excursion_id_on_acceptance = ?
            WHERE id = ?
        `;
        await dbRunAsync(sqlUpdateShare, [newExcursionId, shareId]);

        // h. Fetch the newly created excursion
        const acceptedExcursionDetails = await dbGetAsync(
            `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
             FROM excursiones e 
             JOIN usuarios u ON e.creada_por_usuario_id = u.id 
             LEFT JOIN clases c ON e.para_clase_id = c.id 
             WHERE e.id = ?`,
            [newExcursionId]
        );
        
        console.log(`  Compartición ID ${shareId} aceptada por Usuario ID ${acceptingUserId}. Nueva Excursión ID: ${newExcursionId}`);
        res.status(200).json(acceptedExcursionDetails);

    } catch (error) {
        console.error(`  Error en POST /api/shared-excursions/${shareId}/accept:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al aceptar la excursión compartida." });
    }
});
console.log("Endpoint POST /api/shared-excursions/:share_id/accept definido.");

// POST /api/shared-excursions/:share_id/decline - Rechazar una excursión compartida
app.post('/api/shared-excursions/:share_id/decline', authenticateToken, async (req, res) => {
    const shareId = parseInt(req.params.share_id);
    const decliningUserId = req.user.id;

    console.log(`  Ruta: POST /api/shared-excursiones/${shareId}/decline, Usuario: ${req.user.email}`);

    // a. Validate share_id
    if (isNaN(shareId)) {
        return res.status(400).json({ error: "ID de compartición inválido." });
    }

    // Ensure user is a TUTOR
    if (req.user.rol !== 'TUTOR') {
        return res.status(403).json({ error: "Acceso denegado. Solo para tutores." });
    }
    
    try {
        // b. Fetch the shared_excursions record
        const shareRecord = await dbGetAsync("SELECT * FROM shared_excursions WHERE id = ?", [shareId]);
        if (!shareRecord) {
            return res.status(404).json({ error: "Invitación para compartir no encontrada." });
        }

        // c. Verify shared_with_usuario_id and status
        if (shareRecord.shared_with_usuario_id !== decliningUserId) {
            return res.status(403).json({ error: "No estás autorizado para rechazar esta invitación." });
        }
        if (shareRecord.status !== 'pending') {
            return res.status(400).json({ error: `Esta invitación ya ha sido ${shareRecord.status}.` });
        }

        // d. Update the shared_excursions record
        const sqlUpdateShare = `
            UPDATE shared_excursions 
            SET status = 'declined', processed_at = datetime('now')
            WHERE id = ?
        `;
        await dbRunAsync(sqlUpdateShare, [shareId]);
        
        console.log(`  Compartición ID ${shareId} rechazada por Usuario ID ${decliningUserId}.`);
        res.status(200).json({ message: "Excursión compartida rechazada." });

    } catch (error) {
        console.error(`  Error en POST /api/shared-excursiones/${shareId}/decline:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al rechazar la excursión compartida." });
    }
});
console.log("Endpoint POST /api/shared-excursions/:share_id/decline definido.");

// --- Gestión de Participaciones ---

// GET /api/excursiones/:excursion_id/participaciones - Listar alumnos y su estado de participación para una excursión
app.get('/api/excursiones/:excursion_id/participaciones', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.excursion_id);
    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }
    console.log(`  Ruta: GET /api/excursiones/${excursionId}/participaciones, Usuario: ${req.user.email}, Query:`, req.query);

    try {
        const currentExcursion = await dbGetAsync("SELECT id, para_clase_id FROM excursiones WHERE id = ?", [excursionId]);
        if (!currentExcursion) {
            return res.status(404).json({ error: "Excursión no encontrada." });
        }

        // RBAC para acceder a la excursión
        if (req.user.rol === 'TUTOR') {
            if (currentExcursion.para_clase_id !== null && currentExcursion.para_clase_id !== req.user.claseId) {
                return res.status(403).json({ error: "Tutores solo pueden ver participaciones de excursiones globales o de su propia clase." });
            }
            if (currentExcursion.para_clase_id !== null && !req.user.claseId) { // Tutor sin clase asignada
                 return res.status(403).json({ error: "Tutor no asignado a una clase no puede ver participaciones de excursiones de clase." });
            }
        } else if (req.user.rol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            if (currentExcursion.para_clase_id !== null && !assignedClaseIds.includes(currentExcursion.para_clase_id)) {
                // Excursion is for a specific class, and it's not one of the coordinator's assigned classes
                return res.status(403).json({ error: "Coordinador no tiene acceso a participaciones de esta excursión específica de clase." });
            }
            // If excursion is global, access is allowed, but student fetching will be filtered later.
        }


        let baseAlumnosSql;
        const baseAlumnosParams = [];

        if (currentExcursion.para_clase_id !== null) { // Excursión específica de una clase
            // All roles (DIR, TUTOR, COORD) if they passed prior checks, see students from this specific class.
            baseAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                              FROM alumnos a JOIN clases c ON a.clase_id = c.id 
                              WHERE a.clase_id = ?`;
            baseAlumnosParams.push(currentExcursion.para_clase_id);
        } else { // Excursión global
            const viewClaseId = req.query.view_clase_id ? parseInt(req.query.view_clase_id) : null;

            if (req.user.rol === 'TUTOR') {
                if (!req.user.claseId) return res.json({ alumnosParticipaciones: [], resumen: {} }); // Tutor sin clase no ve alumnos
                baseAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                                  FROM alumnos a JOIN clases c ON a.clase_id = c.id 
                                  WHERE a.clase_id = ?`;
                baseAlumnosParams.push(req.user.claseId); // Tutor ve alumnos de su clase
            } else if (req.user.rol === 'DIRECCION') {
                if (viewClaseId) { // Dirección puede filtrar por clase
                    baseAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                                      FROM alumnos a JOIN clases c ON a.clase_id = c.id 
                                      WHERE a.clase_id = ?`;
                    baseAlumnosParams.push(viewClaseId);
                } else { // Dirección, sin filtro de clase, ve alumnos que ya participan
                     baseAlumnosSql = `SELECT DISTINCT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                                      FROM alumnos a 
                                      JOIN clases c ON a.clase_id = c.id 
                                      JOIN participaciones_excursion pe ON a.id = pe.alumno_id 
                                      WHERE pe.excursion_id = ?`;
                    baseAlumnosParams.push(excursionId);
                }
            } else if (req.user.rol === 'COORDINACION') {
                if (!viewClaseId) {
                    return res.status(400).json({ error: "Para excursiones globales, el coordinador debe especificar un view_clase_id." });
                }
                const assignedClaseIds = await getCoordinadorClases(req.user.id);
                if (!assignedClaseIds.includes(viewClaseId)) {
                    return res.status(403).json({ error: "Coordinador solo puede ver participaciones de sus clases asignadas para excursiones globales." });
                }
                baseAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                                  FROM alumnos a JOIN clases c ON a.clase_id = c.id 
                                  WHERE a.clase_id = ?`;
                baseAlumnosParams.push(viewClaseId);
            } else { 
                 return res.status(403).json({ error: "Rol no autorizado para esta vista de participaciones." });
            }
        }
        baseAlumnosSql += " ORDER BY c.nombre_clase ASC, a.apellidos_para_ordenar ASC, a.nombre_completo ASC";
        
        let alumnosBase = await dbAllAsync(baseAlumnosSql, baseAlumnosParams);

        // Special case for DIRECCION viewing global excursion without a specific class filter:
        // If no students are participating yet, show all students so participation can be added.
        if (req.user.rol === 'DIRECCION' && currentExcursion.para_clase_id === null && !req.query.view_clase_id && alumnosBase.length === 0) {
            const todosLosAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                                       FROM alumnos a JOIN clases c ON a.clase_id = c.id
                                       ORDER BY c.nombre_clase ASC, a.apellidos_para_ordenar ASC, a.nombre_completo ASC`;
            alumnosBase = await dbAllAsync(todosLosAlumnosSql, []); // Overwrite with all students
        }


        const alumnosParticipaciones = [];
        for (const alumno of alumnosBase) {
            const participacion = await dbGetAsync(
                `SELECT p.id as participacion_id, p.autorizacion_firmada, p.fecha_autorizacion, 
                        p.pago_realizado, p.cantidad_pagada, p.fecha_pago, p.notas_participacion 
                 FROM participaciones_excursion p 
                 WHERE p.alumno_id = ? AND p.excursion_id = ?`,
                [alumno.alumno_id, excursionId]
            );
            alumnosParticipaciones.push({
                ...alumno,
                participacion_id: participacion?.participacion_id || null,
                autorizacion_firmada: participacion?.autorizacion_firmada || 'No',
                fecha_autorizacion: participacion?.fecha_autorizacion || null,
                pago_realizado: participacion?.pago_realizado || 'No',
                cantidad_pagada: participacion?.cantidad_pagada || 0,
                fecha_pago: participacion?.fecha_pago || null,
                notas_participacion: participacion?.notas_participacion || null,
            });
        }
        
        // Calcular resumen
        const resumen = {
            totalAlumnos: alumnosParticipaciones.length,
            totalConAutorizacionFirmadaSi: alumnosParticipaciones.filter(p => p.autorizacion_firmada === 'Sí').length,
            totalConAutorizacionFirmadaNo: alumnosParticipaciones.filter(p => p.autorizacion_firmada === 'No').length,
            totalAlumnosPagadoGlobal: alumnosParticipaciones.filter(p => p.pago_realizado === 'Sí').length,
            totalConPagoRealizadoNo: alumnosParticipaciones.filter(p => p.pago_realizado === 'No').length,
            totalConPagoRealizadoParcial: alumnosParticipaciones.filter(p => p.pago_realizado === 'Parcial').length,
            sumaTotalCantidadPagadaGlobal: alumnosParticipaciones.reduce((sum, p) => sum + (parseFloat(p.cantidad_pagada) || 0), 0),
            resumenPorClase: {}
        };

        alumnosParticipaciones.forEach(p => {
            if (!resumen.resumenPorClase[p.clase_id]) {
                resumen.resumenPorClase[p.clase_id] = {
                    nombre_clase: p.nombre_clase,
                    alumnosEnClase: 0,
                    totalAlumnosPagadoEnClase: 0, 
                    sumaTotalCantidadPagadaEnClase: 0 
                };
            }
            resumen.resumenPorClase[p.clase_id].alumnosEnClase++;
            if (p.pago_realizado === 'Sí') {
                resumen.resumenPorClase[p.clase_id].totalAlumnosPagadoEnClase++;
            }
            resumen.resumenPorClase[p.clase_id].sumaTotalCantidadPagadaEnClase += (parseFloat(p.cantidad_pagada) || 0);
        });
        // Convertir el objeto a array para el frontend si se prefiere
        resumen.resumenPorClase = Object.values(resumen.resumenPorClase);


        res.json({ alumnosParticipaciones, resumen });

    } catch (error) {
        console.error(`  Error en GET /api/excursiones/${excursionId}/participaciones:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al obtener las participaciones." });
    }
});
console.log("Endpoint GET /api/excursiones/:excursion_id/participaciones definido.");


// POST /api/participaciones - Crear o actualizar una participación (UPSERT)
app.post('/api/participaciones', authenticateToken, async (req, res) => {
    console.log(`  Ruta: POST /api/participaciones, Usuario: ${req.user.email}, Body:`, req.body);
    const {
        excursion_id, alumno_id, autorizacion_firmada, fecha_autorizacion,
        pago_realizado, cantidad_pagada = 0, fecha_pago, notas_participacion
    } = req.body;

    // Validaciones básicas
    if (!excursion_id || !alumno_id) {
        return res.status(400).json({ error: "excursion_id y alumno_id son obligatorios." });
    }
    if (isNaN(parseInt(excursion_id)) || isNaN(parseInt(alumno_id))) {
        return res.status(400).json({ error: "excursion_id y alumno_id deben ser números." });
    }
    const validAutorizacion = ['Sí', 'No'];
    if (autorizacion_firmada !== undefined && !validAutorizacion.includes(autorizacion_firmada)) {
        return res.status(400).json({ error: "autorizacion_firmada debe ser 'Sí' o 'No'." });
    }
    const validPago = ['Sí', 'No', 'Parcial'];
    if (pago_realizado !== undefined && !validPago.includes(pago_realizado)) {
        return res.status(400).json({ error: "pago_realizado debe ser 'Sí', 'No', o 'Parcial'." });
    }
    if (cantidad_pagada !== undefined && (typeof cantidad_pagada !== 'number' || cantidad_pagada < 0)) {
        return res.status(400).json({ error: "cantidad_pagada debe ser un número no negativo." });
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (fecha_autorizacion && !dateRegex.test(fecha_autorizacion)) return res.status(400).json({ error: "Formato de fecha_autorizacion inválido. Use YYYY-MM-DD."});
    if (fecha_pago && !dateRegex.test(fecha_pago)) return res.status(400).json({ error: "Formato de fecha_pago inválido. Use YYYY-MM-DD."});


    try {
        const alumno = await dbGetAsync("SELECT id, clase_id FROM alumnos WHERE id = ?", [alumno_id]);
        if (!alumno) return res.status(404).json({ error: "Alumno no encontrado." });

        const excursion = await dbGetAsync("SELECT id, para_clase_id FROM excursiones WHERE id = ?", [excursion_id]);
        if (!excursion) return res.status(404).json({ error: "Excursión no encontrada." });

        // RBAC
        if (req.user.rol === 'TUTOR') {
            if (!req.user.claseId || alumno.clase_id !== req.user.claseId) {
                return res.status(403).json({ error: "Tutores solo pueden gestionar participaciones de alumnos de su propia clase." });
            }
            if (excursion.para_clase_id !== null && excursion.para_clase_id !== req.user.claseId) {
                return res.status(403).json({ error: "Tutores solo pueden gestionar participaciones para excursiones globales o de su propia clase." });
            }
        } else if (req.user.rol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            if (!assignedClaseIds.includes(alumno.clase_id)) {
                return res.status(403).json({ error: "Coordinadores solo pueden gestionar participaciones de alumnos de sus clases asignadas." });
            }
            if (excursion.para_clase_id !== null && !assignedClaseIds.includes(excursion.para_clase_id)) {
                 return res.status(403).json({ error: "Coordinadores solo pueden gestionar participaciones para excursiones globales o de sus clases asignadas." });
            }
        } else if (req.user.rol !== 'DIRECCION') {
            return res.status(403).json({ error: "Rol no autorizado para esta acción." });
        }

        // UPSERT
        const sqlUpsert = `
            INSERT INTO participaciones_excursion (
                alumno_id, excursion_id, autorizacion_firmada, fecha_autorizacion,
                pago_realizado, cantidad_pagada, fecha_pago, notas_participacion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(alumno_id, excursion_id) DO UPDATE SET
                autorizacion_firmada = excluded.autorizacion_firmada,
                fecha_autorizacion = excluded.fecha_autorizacion,
                pago_realizado = excluded.pago_realizado,
                cantidad_pagada = excluded.cantidad_pagada,
                fecha_pago = excluded.fecha_pago,
                notas_participacion = excluded.notas_participacion
            RETURNING id;`; // RETURNING id para obtener el ID de la fila afectada

        const paramsUpsert = [
            alumno_id, excursion_id,
            autorizacion_firmada === undefined ? 'No' : autorizacion_firmada, // Default si no se manda
            fecha_autorizacion || null,
            pago_realizado === undefined ? 'No' : pago_realizado, // Default si no se manda
            cantidad_pagada === undefined ? 0 : cantidad_pagada, // Default si no se manda
            fecha_pago || null,
            notas_participacion || null
        ];
        
        // dbRunAsync no soporta RETURNING directamente de la misma forma en sqlite3 node.
        // Haremos un get después del upsert.
        
        await dbRunAsync(sqlUpsert.replace("RETURNING id;", ""), paramsUpsert); // SQLite no devuelve el ID en upsert así.

        // Fetch the record to confirm and get its ID
        const participacionGuardada = await dbGetAsync(
            "SELECT * FROM participaciones_excursion WHERE alumno_id = ? AND excursion_id = ?",
            [alumno_id, excursion_id]
        );
        
        console.log(`  Participación guardada para Alumno ID ${alumno_id}, Excursión ID ${excursion_id}. ID de participación: ${participacionGuardada.id}`);
        res.status(200).json(participacionGuardada); // 200 OK para upsert es común.

    } catch (error) {
        console.error("  Error en POST /api/participaciones:", error.message);
         if (error.message.includes("UNIQUE constraint failed")) { // Esto es manejado por ON CONFLICT
            return res.status(500).json({ error: "Error de concurrencia o constraint no manejado por UPSERT." });
        } else if (error.message.includes("FOREIGN KEY constraint failed")) {
            // Esto puede ocurrir si alumno_id o excursion_id son válidos pero no existen, aunque lo chequeamos antes.
            return res.status(400).json({ error: "Error de clave foránea: el alumno o la excursión no existen." });
        }
        res.status(500).json({ error: "Error interno del servidor al guardar la participación." });
    }
});
console.log("Endpoint POST /api/participaciones definido.");


// --- Endpoint de Dashboard ---
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => {
    console.log("  Ruta: GET /api/dashboard/summary para:", req.user.email, "Rol:", req.user.rol);
    try {
        const dashboardData = {
            mensaje: "Resumen del dashboard"
        };

        // Common data for all roles
        const totalClasesRow = await dbGetAsync("SELECT COUNT(*) as count FROM clases");
        dashboardData.totalClases = totalClasesRow ? totalClasesRow.count : 0;

        if (req.user.rol === 'TUTOR') {
            dashboardData.infoSuClase = { numAlumnos: 0 };
            dashboardData.proximasExcursiones = [];
            dashboardData.resumenProximaExcursionSuClase = null;

            const tutorClaseId = req.user.claseId;

            if (tutorClaseId) {
                const numAlumnosRow = await dbGetAsync("SELECT COUNT(*) as count FROM alumnos WHERE clase_id = ?", [tutorClaseId]);
                dashboardData.infoSuClase.numAlumnos = numAlumnosRow ? numAlumnosRow.count : 0;

                const sqlProximasExcursionesTutor = `
                    SELECT id, nombre_excursion, fecha_excursion, para_clase_id 
                    FROM excursiones 
                    WHERE (para_clase_id IS NULL OR para_clase_id = ?) AND fecha_excursion >= date('now') 
                    ORDER BY fecha_excursion ASC`;
                dashboardData.proximasExcursiones = await dbAllAsync(sqlProximasExcursionesTutor, [tutorClaseId]);

                if (dashboardData.proximasExcursiones.length > 0) {
                    const proximaExcursionParaResumen = dashboardData.proximasExcursiones[0];
                    const excursionIdParaResumen = proximaExcursionParaResumen.id;

                    const totalInscritos = dashboardData.infoSuClase.numAlumnos;

                    const participaciones = await dbAllAsync(
                        "SELECT autorizacion_firmada, pago_realizado FROM participaciones_excursion WHERE excursion_id = ? AND alumno_id IN (SELECT id FROM alumnos WHERE clase_id = ?)",
                        [excursionIdParaResumen, tutorClaseId]
                    );

                    let autorizadosSi = 0;
                    let pagadoSi = 0;
                    let pagadoParcial = 0;
                    
                    participaciones.forEach(p => {
                        if (p.autorizacion_firmada === 'Sí') autorizadosSi++;
                        if (p.pago_realizado === 'Sí') pagadoSi++;
                        else if (p.pago_realizado === 'Parcial') pagadoParcial++;
                    });
                    
                    // Los "No" son el total menos los que han dicho "Sí" o "Parcial" (para pagos) o "Sí" (para autorizaciones)
                    // O más bien, los que tienen registro 'No' o no tienen registro.
                    // Para simplificar, contamos los que no son 'Sí' explícitamente.
                    // Total de alumnos en la clase - los que tienen 'Sí'
                    const autorizadosNo = totalInscritos - autorizadosSi;
                    // Total de alumnos en la clase - los que tienen 'Sí' o 'Parcial'
                    const pagadoNo = totalInscritos - (pagadoSi + pagadoParcial);


                    dashboardData.resumenProximaExcursionSuClase = {
                        nombreExcursion: proximaExcursionParaResumen.nombre_excursion,
                        fecha: proximaExcursionParaResumen.fecha_excursion,
                        excursionId: excursionIdParaResumen,
                        totalInscritos: totalInscritos,
                        autorizadosSi: autorizadosSi,
                        autorizadosNo: autorizadosNo, // Esto incluye los que no tienen registro.
                        pagadoSi: pagadoSi,
                        pagadoParcial: pagadoParcial,
                        pagadoNo: pagadoNo // Esto incluye los que no tienen registro.
                    };
                }
            }
        } else if (req.user.rol === 'DIRECCION') {
            const totalAlumnosRow = await dbGetAsync("SELECT COUNT(*) as count FROM alumnos");
            dashboardData.totalAlumnos = totalAlumnosRow ? totalAlumnosRow.count : 0;

            const totalExcursionesRow = await dbGetAsync("SELECT COUNT(*) as count FROM excursiones");
            dashboardData.totalExcursiones = totalExcursionesRow ? totalExcursionesRow.count : 0;

            const sqlProximasExcursionesDireccion = `
                SELECT id, nombre_excursion, fecha_excursion 
                FROM excursiones 
                WHERE para_clase_id IS NULL AND fecha_excursion >= date('now') 
                ORDER BY fecha_excursion ASC`;
            dashboardData.proximasExcursiones = await dbAllAsync(sqlProximasExcursionesDireccion);
        } else if (req.user.rol === 'COORDINACION') {
            dashboardData.mensaje = "Resumen del dashboard para Coordinador";
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            dashboardData.totalClasesCoordinadas = assignedClaseIds.length;
            dashboardData.clasesCoordinadasDetalles = [];
            dashboardData.proximasExcursionesCoordinador = [];

            if (assignedClaseIds.length > 0) {
                for (const claseId of assignedClaseIds) {
                    const claseInfo = await dbGetAsync("SELECT nombre_clase FROM clases WHERE id = ?", [claseId]);
                    const numAlumnosRow = await dbGetAsync("SELECT COUNT(*) as count FROM alumnos WHERE clase_id = ?", [claseId]);
                    dashboardData.clasesCoordinadasDetalles.push({
                        claseId: claseId,
                        nombreClase: claseInfo ? claseInfo.nombre_clase : 'Desconocida',
                        numAlumnos: numAlumnosRow ? numAlumnosRow.count : 0
                    });
                }

                let sqlProximasExcursionesCoord = `
                    SELECT e.id, e.nombre_excursion, e.fecha_excursion, e.para_clase_id, c.nombre_clase as nombre_clase_destino 
                    FROM excursiones e 
                    LEFT JOIN clases c ON e.para_clase_id = c.id 
                    WHERE e.fecha_excursion >= date('now') AND (e.para_clase_id IS NULL`;
                
                const placeholders = assignedClaseIds.map(() => '?').join(',');
                sqlProximasExcursionesCoord += ` OR e.para_clase_id IN (${placeholders})) ORDER BY e.fecha_excursion ASC`;
                
                const paramsForExcursions = [...assignedClaseIds]; // Spread to create a new array for params
                dashboardData.proximasExcursionesCoordinador = await dbAllAsync(sqlProximasExcursionesCoord, paramsForExcursions);
            }
            // If assignedClaseIds is empty, proximasExcursionesCoordinador will only fetch global ones
            else {
                 const sqlProximasExcursionesCoordGlobal = `
                    SELECT e.id, e.nombre_excursion, e.fecha_excursion, e.para_clase_id, c.nombre_clase as nombre_clase_destino 
                    FROM excursiones e 
                    LEFT JOIN clases c ON e.para_clase_id = c.id 
                    WHERE e.fecha_excursion >= date('now') AND e.para_clase_id IS NULL 
                    ORDER BY e.fecha_excursion ASC`;
                dashboardData.proximasExcursionesCoordinador = await dbAllAsync(sqlProximasExcursionesCoordGlobal);
            }
        } else if (req.user.rol === 'TESORERIA') {
            // Data for TESORERIA
            const totalExcursionesRow = await dbGetAsync("SELECT COUNT(*) as count FROM excursiones");
            dashboardData.totalExcursiones = totalExcursionesRow ? totalExcursionesRow.count : 0;

            const totalAlumnosConPagoRow = await dbGetAsync(
                `SELECT COUNT(DISTINCT alumno_id) as count 
                 FROM participaciones_excursion 
                 WHERE pago_realizado = 'Sí' OR pago_realizado = 'Parcial'`
            );
            dashboardData.totalAlumnosConPago = totalAlumnosConPagoRow ? totalAlumnosConPagoRow.count : 0;

            const sumaTotalPagadoRow = await dbGetAsync(
                `SELECT SUM(cantidad_pagada) as total 
                 FROM participaciones_excursion`
            );
            dashboardData.sumaTotalPagado = sumaTotalPagadoRow && sumaTotalPagadoRow.total !== null ? sumaTotalPagadoRow.total : 0;
            
        } else if (req.user.rol === 'COORDINACION') {
            dashboardData.mensaje = "Resumen del dashboard para Coordinador";
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            dashboardData.totalClasesCoordinadas = assignedClaseIds.length;
            dashboardData.clasesCoordinadasDetalles = [];
            dashboardData.proximasExcursionesCoordinador = [];

            if (assignedClaseIds.length > 0) {
                for (const claseId of assignedClaseIds) {
                    const claseInfo = await dbGetAsync("SELECT nombre_clase FROM clases WHERE id = ?", [claseId]);
                    const numAlumnosRow = await dbGetAsync("SELECT COUNT(*) as count FROM alumnos WHERE clase_id = ?", [claseId]);
                    dashboardData.clasesCoordinadasDetalles.push({
                        claseId: claseId,
                        nombreClase: claseInfo ? claseInfo.nombre_clase : 'Desconocida',
                        numAlumnos: numAlumnosRow ? numAlumnosRow.count : 0
                    });
                }

                let sqlProximasExcursionesCoord = `
                    SELECT e.id, e.nombre_excursion, e.fecha_excursion, e.para_clase_id, c.nombre_clase as nombre_clase_destino 
                    FROM excursiones e 
                    LEFT JOIN clases c ON e.para_clase_id = c.id 
                    WHERE e.fecha_excursion >= date('now') AND (e.para_clase_id IS NULL`;
                
                const placeholders = assignedClaseIds.map(() => '?').join(',');
                sqlProximasExcursionesCoord += ` OR e.para_clase_id IN (${placeholders})) ORDER BY e.fecha_excursion ASC`;
                
                const paramsForExcursions = [...assignedClaseIds];
                dashboardData.proximasExcursionesCoordinador = await dbAllAsync(sqlProximasExcursionesCoord, paramsForExcursions);
            }
            // If assignedClaseIds is empty, proximasExcursionesCoordinador will only fetch global ones
            else {
                 const sqlProximasExcursionesCoordGlobal = `
                    SELECT e.id, e.nombre_excursion, e.fecha_excursion, e.para_clase_id, c.nombre_clase as nombre_clase_destino 
                    FROM excursiones e 
                    LEFT JOIN clases c ON e.para_clase_id = c.id 
                    WHERE e.fecha_excursion >= date('now') AND e.para_clase_id IS NULL 
                    ORDER BY e.fecha_excursion ASC`;
                dashboardData.proximasExcursionesCoordinador = await dbAllAsync(sqlProximasExcursionesCoordGlobal);
            }


        } else {
            // Potentially handle other roles or return a more generic summary if needed
            // For now, just the base totalClases and message will be sent.
            console.warn(`  Rol no reconocido para resumen específico del dashboard: ${req.user.rol}`);
        }

        res.json(dashboardData);

    } catch (error) {
        console.error("  Error en GET /api/dashboard/summary:", error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al generar el resumen del dashboard.", detalles: error.message });
    }
});

// --- Rutas de Tesorería ---
console.log("Definiendo rutas de Tesorería...");

// GET /api/tesoreria/excursiones-pendientes
app.get('/api/tesoreria/excursiones-pendientes', authenticateToken, async (req, res) => {
    console.log("  Ruta: GET /api/tesoreria/excursiones-pendientes para:", req.user.email, "Rol:", req.user.rol);

    if (req.user.rol !== 'TESORERIA' && req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'Acceso no autorizado. Se requiere rol TESORERIA o DIRECCION.' });
    }

    try {
        const sql = `
            SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino
            FROM excursiones e
            JOIN usuarios u ON e.creada_por_usuario_id = u.id
            LEFT JOIN clases c ON e.para_clase_id = c.id
            WHERE e.fecha_excursion >= date('now')
            ORDER BY e.fecha_excursion ASC;
        `;
        const excursionesPendientes = await dbAllAsync(sql);
        res.json({ excursiones_pendientes: excursionesPendientes });
    } catch (error) {
        console.error("  Error en GET /api/tesoreria/excursiones-pendientes:", error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al obtener excursiones pendientes.", detalles: error.message });
    }
});
console.log("Endpoint GET /api/tesoreria/excursiones-pendientes definido.");

// GET /api/tesoreria/excursiones-pasadas
app.get('/api/tesoreria/excursiones-pasadas', authenticateToken, async (req, res) => {
    console.log("  Ruta: GET /api/tesoreria/excursiones-pasadas para:", req.user.email, "Rol:", req.user.rol);

    if (req.user.rol !== 'TESORERIA' && req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'Acceso no autorizado. Se requiere rol TESORERIA o DIRECCION.' });
    }

    try {
        const sqlExcursionesPasadas = `
            SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino
            FROM excursiones e
            JOIN usuarios u ON e.creada_por_usuario_id = u.id
            LEFT JOIN clases c ON e.para_clase_id = c.id
            WHERE e.fecha_excursion < date('now')
            ORDER BY e.fecha_excursion DESC;
        `;
        const excursionesPasadas = await dbAllAsync(sqlExcursionesPasadas);

        const augmentedExcursiones = [];
        for (const excursion of excursionesPasadas) {
            const sqlTotalAlumnos = `
                SELECT COUNT(DISTINCT alumno_id) as count 
                FROM participaciones_excursion 
                WHERE excursion_id = ? AND autorizacion_firmada = 'Sí'`;
            const totalAlumnosRow = await dbGetAsync(sqlTotalAlumnos, [excursion.id]);
            excursion.totalAlumnosParticipantes = totalAlumnosRow ? totalAlumnosRow.count : 0;

            const sqlTotalPagado = `
                SELECT SUM(cantidad_pagada) as total 
                FROM participaciones_excursion 
                WHERE excursion_id = ?`;
            const totalPagadoRow = await dbGetAsync(sqlTotalPagado, [excursion.id]);
            excursion.totalPagado = totalPagadoRow && totalPagadoRow.total !== null ? totalPagadoRow.total : 0;
            
            augmentedExcursiones.push(excursion);
        }

        res.json({ excursiones_pasadas: augmentedExcursiones });
    } catch (error) {
        console.error("  Error en GET /api/tesoreria/excursiones-pasadas:", error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al obtener excursiones pasadas.", detalles: error.message });
    }
});
console.log("Endpoint GET /api/tesoreria/excursiones-pasadas definido.");

// --- Ciclos & (No longer) Coordinator Cycle Assignment Routes ---
// Note: The related console log for coordinator assignment routes will be removed with the routes themselves.
// The "Definiendo rutas de gestión de Ciclos..." log remains as GET /api/ciclos is kept.
console.log("Definiendo rutas de gestión de Ciclos...");


// GET /api/ciclos - List all educational cycles
app.get('/api/ciclos', authenticateToken, async (req, res) => {
    console.log("  Ruta: GET /api/ciclos, Usuario:", req.user.email);
    try {
        const ciclos = await dbAllAsync("SELECT id, nombre_ciclo FROM ciclos ORDER BY id ASC");
        res.json({ ciclos });
    } catch (error) {
        console.error("  Error en GET /api/ciclos:", error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al obtener los ciclos.", detalles: error.message });
    }
});
console.log("Endpoint GET /api/ciclos definido.");

// The following coordinator-specific cycle assignment routes are now removed:
// - GET /api/coordinadores/:coordinador_id/ciclos
// - POST /api/coordinadores/:coordinador_id/ciclos
// - DELETE /api/coordinadores/:coordinador_id/ciclos/:ciclo_id


console.log("Paso 17: Todas las definiciones de rutas de API (o sus placeholders) completadas.");

// --- Conexión a la Base de Datos e Inicio del Servidor ---
const DB_FILE_PATH_FINAL = path.join(__dirname, "database.db");
console.log(`Paso 18: Intentando conectar a BD en: ${DB_FILE_PATH_FINAL} para iniciar servidor.`);

db = new sqlite3.Database(DB_FILE_PATH_FINAL, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error("Error FATAL al conectar con la base de datos (dentro del bloque final):", err.message);
        process.exit(1);
    }
    console.log('Paso 19: Conectado a la base de datos SQLite (database.db) (dentro del bloque final).');
    db.run("PRAGMA foreign_keys = ON;", (fkErr) => {
        if (fkErr) {
            console.error("Paso 20: Error habilitando claves foráneas en SQLite (dentro del bloque final):", fkErr.message);
        } else {
            console.log("Paso 20: Claves foráneas habilitadas en SQLite (dentro del bloque final).");
        }

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

console.log("Paso 23: Fin del script principal de server.js (antes de que el servidor esté completamente listo para escuchar o que los callbacks asíncronos terminen).");

process.on('SIGINT', () => {
    console.log('\nSIGINT. Cerrando BD y servidor...');
    if (db) {
        db.close(err => {
            if (err) console.error("Error cerrando BD:",err.message);
            else console.log('Conexión BD cerrada.');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
