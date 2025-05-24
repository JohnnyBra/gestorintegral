/ --- server.js (CORREGIDO) ---
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
console.log(" Paso 5: Helpers de BD con Promesas definidos.");

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

// POST /api/usuarios - Crear un nuevo usuario (solo para TUTOR)
app.post('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado. Solo el rol DIRECCION puede crear usuarios.' });
    }

    const { email, nombre_completo, password, rol } = req.body;
    console.log("  Ruta: POST /api/usuarios, Body:", req.body);

    if (!email || !nombre_completo || !password || !rol) {
        return res.status(400).json({ error: "Email, nombre_completo, password y rol son requeridos." });
    }

    if (rol !== 'TUTOR') {
        return res.status(400).json({ error: "Solo se pueden crear usuarios con rol TUTOR." });
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

        const result = await dbRunAsync(
            "INSERT INTO usuarios (email, nombre_completo, password_hash, rol) VALUES (?, ?, ?, ?)",
            [normalizedEmail, nombre_completo.trim(), password_hash, rol]
        );

        const nuevoUsuario = await dbGetAsync(
            "SELECT id, email, nombre_completo, rol FROM usuarios WHERE id = ?",
            [result.lastID]
        );
        
        console.log(`  Usuario TUTOR creado con ID: ${result.lastID}, Email: ${normalizedEmail}`);
        res.status(201).json(nuevoUsuario);

    } catch (error) {
        console.error("  Error en POST /api/usuarios:", error.message);
        if (error.message.includes("UNIQUE constraint failed: usuarios.email")) {
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

    const { email, nombre_completo } = req.body;
    console.log(`  Ruta: PUT /api/usuarios/${userIdToUpdate}, Body:`, req.body);

    if (email === undefined && nombre_completo === undefined) {
        return res.status(400).json({ error: "Debe proporcionar al menos un campo para actualizar (email o nombre_completo)." });
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

        if (userToUpdate.rol === 'DIRECCION') {
            return res.status(403).json({ error: "No se puede modificar un usuario con rol DIRECCION mediante esta vía." });
        }
        
        if (userToUpdate.rol !== 'TUTOR') {
            return res.status(403).json({ error: "Solo se pueden modificar usuarios con rol TUTOR mediante esta vía." });
        }

        let updateFields = [];
        let updateParams = [];
        
        const newValues = {
            email: userToUpdate.email, 
            nombre_completo: userToUpdate.nombre_completo
        };

        if (normalizedEmail !== undefined && normalizedEmail !== userToUpdate.email) {
            const existingUserWithNewEmail = await dbGetAsync("SELECT id FROM usuarios WHERE email = ? AND id != ?", [normalizedEmail, userIdToUpdate]);
            if (existingUserWithNewEmail) {
                return res.status(409).json({ error: "El email proporcionado ya está en uso por otro usuario." });
            }
            updateFields.push("email = ?");
            updateParams.push(normalizedEmail);
            newValues.email = normalizedEmail;
        }

        if (trimmedNombre !== undefined && trimmedNombre !== userToUpdate.nombre_completo) {
            updateFields.push("nombre_completo = ?");
            updateParams.push(trimmedNombre);
            newValues.nombre_completo = trimmedNombre;
        }

        if (updateFields.length > 0) {
            updateParams.push(userIdToUpdate);
            const sqlUpdate = `UPDATE usuarios SET ${updateFields.join(", ")} WHERE id = ?`;
            await dbRunAsync(sqlUpdate, updateParams);
            console.log(`  Usuario ID ${userIdToUpdate} actualizado. Campos: ${updateFields.join(", ")}`);
        } else {
            console.log(`  Usuario ID ${userIdToUpdate} no requirió actualización, datos idénticos o no proporcionados para cambio.`);
        }
        
        res.json({ 
            id: userToUpdate.id, 
            email: newValues.email, 
            nombre_completo: newValues.nombre_completo, 
            rol: userToUpdate.rol 
        });

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

// --- Gestión de Clases ---
app.get('/api/clases', authenticateToken, async (req, res) => {
    try {
        const clases = await dbAllAsync(`SELECT c.id, c.nombre_clase, c.tutor_id, u.nombre_completo as nombre_tutor, u.email as email_tutor
                                        FROM clases c LEFT JOIN usuarios u ON c.tutor_id = u.id ORDER BY c.nombre_clase ASC`);
        res.json({ clases });
    } catch (error) { res.status(500).json({ error: "Error obteniendo clases: " + error.message });}
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
    const userId = req.user.id; // ID del usuario que hace la petición (tutor)
    const userClaseId = req.user.claseId; // ID de la clase del tutor (si es tutor)

    let sql = `SELECT a.id, a.nombre_completo, a.clase_id, c.nombre_clase 
               FROM alumnos a 
               JOIN clases c ON a.clase_id = c.id`;
    const params = [];

    try {
        if (userRol === 'TUTOR') {
            if (!userClaseId) {
                console.warn(`  Tutor ${req.user.email} (ID: ${userId}) no tiene clase asignada. Devolviendo lista vacía de alumnos.`);
                return res.json({ alumnos: [] });
            }
            sql += " WHERE a.clase_id = ?";
            params.push(userClaseId);
        } else if (userRol === 'DIRECCION') {
            if (claseId) {
                sql += " WHERE a.clase_id = ?";
                params.push(claseId);
            }
        } else {
            // Otros roles no deberían tener acceso general, a menos que se defina específicamente
            return res.status(403).json({ error: "Acceso no autorizado a la lista de alumnos." });
        }

            sql += " ORDER BY c.nombre_clase ASC, a.apellidos_para_ordenar ASC, a.nombre_completo ASC"; 
        
        const alumnos = await dbAllAsync(sql, params);
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

// ... (PUT /api/alumnos/:id y DELETE /api/alumnos/:id PENDIENTES) ...


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
            return res.status(403).json({ error: "Tutor no asignado a ninguna clase. No puede crear excursiones." });
        }
        // Si para_clase_id se envía en el body para un tutor, DEBE coincidir con su clase.
        if (para_clase_id !== undefined && para_clase_id !== null && parseInt(para_clase_id) !== req.user.claseId) {
            return res.status(403).json({ error: "Tutores solo pueden crear excursiones para su propia clase." });
        }
        finalParaClaseId = req.user.claseId; // Tutor siempre crea para su clase.
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
        if (req.user.rol === 'DIRECCION') {
            sql = `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
                   FROM excursiones e 
                   JOIN usuarios u ON e.creada_por_usuario_id = u.id 
                   LEFT JOIN clases c ON e.para_clase_id = c.id 
                   ORDER BY e.fecha_excursion DESC, e.id DESC`;
        } else if (req.user.rol === 'TUTOR') {
            if (!req.user.claseId) {
                console.warn(`  Tutor ${req.user.email} (ID: ${req.user.id}) no tiene claseId en el token o asignada. Devolviendo lista vacía de excursiones.`);
                return res.json({ excursiones: [] }); 
            }
            sql = `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
                   FROM excursiones e 
                   JOIN usuarios u ON e.creada_por_usuario_id = u.id 
                   LEFT JOIN clases c ON e.para_clase_id = c.id 
                   WHERE e.para_clase_id IS NULL OR e.para_clase_id = ? 
                   ORDER BY e.fecha_excursion DESC, e.id DESC`;
            params.push(req.user.claseId);
        } else {
            console.warn(`  Usuario ${req.user.email} con rol ${req.user.rol} intentó acceder a excursiones. Acceso denegado.`);
            return res.status(403).json({ error: "Rol no autorizado para ver excursiones." });
        }
        
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
            if (excursionActual.creada_por_usuario_id === req.user.id || 
                (excursionActual.para_clase_id === req.user.claseId && req.user.claseId)) {
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
                    const nuevoParaClaseId = valueToUpdate === null ? null : parseInt(valueToUpdate);
                    if (nuevoParaClaseId !== req.user.claseId && nuevoParaClaseId !== null) { 
                         if(excursionActual.creada_por_usuario_id !== req.user.id){
                            return res.status(403).json({ error: "Tutores solo pueden asignar excursiones a su propia clase o hacerlas globales si las crearon." });
                         }
                    }
                     if (nuevoParaClaseId !== null && !req.user.claseId) {
                         return res.status(403).json({ error: "Tutor no puede asignar excursión a una clase si no tiene clase asignada." });
                     }
                }
                if (req.user.rol === 'DIRECCION' && campo === 'para_clase_id' && valueToUpdate !== null) {
                    const claseDestino = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [parseInt(valueToUpdate)]);
                    if (!claseDestino) {
                        return res.status(400).json({ error: `La clase de destino con ID ${valueToUpdate} no existe.` });
                    }
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
                return res.status(403).json({ error: "Tutores no pueden duplicar excursiones destinadas a otras clases específicas." });
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
                if (idClaseNum !== duplicatorUserClaseId) {
                    return res.status(403).json({ error: "Tutores solo pueden asignar la excursión duplicada a su propia clase." });
                }
                finalParaClaseId = idClaseNum;
            }
        } else if (target_clase_id === null || (target_clase_id !== undefined && String(target_clase_id).trim() === '')) { 
            finalParaClaseId = null;
        } else { // target_clase_id is undefined (not provided in body)
            if (duplicatorUserRol === 'DIRECCION') {
                finalParaClaseId = null; 
            } else if (duplicatorUserRol === 'TUTOR') {
                if (!duplicatorUserClaseId) {
                    if (originalExcursion.para_clase_id !== null) { // Tutor sin clase intentando duplicar una de clase sin especificar target
                         return res.status(400).json({ error: "Tutor sin clase asignada debe especificar target_clase_id (nulo para global) si la excursión original era para una clase." });
                    }
                    finalParaClaseId = null; // Tutor sin clase, duplica global a global
                } else {
                    finalParaClaseId = duplicatorUserClaseId; // Defaults to tutor's own class
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
            if (currentExcursion.para_clase_id !== null && !req.user.claseId) {
                 return res.status(403).json({ error: "Tutor no asignado a una clase no puede ver participaciones de excursiones de clase." });
            }
        }

        let baseAlumnosSql;
        const baseAlumnosParams = [];

        if (currentExcursion.para_clase_id !== null) { // Excursión específica de una clase
            baseAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.clase_id, c.nombre_clase 
                              FROM alumnos a JOIN clases c ON a.clase_id = c.id 
                              WHERE a.clase_id = ?`;
            baseAlumnosParams.push(currentExcursion.para_clase_id);
        } else { // Excursión global
            if (req.user.rol === 'TUTOR') {
                if (!req.user.claseId) return res.json({ alumnosParticipaciones: [], resumen: {} }); // Tutor sin clase no ve alumnos
                baseAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.clase_id, c.nombre_clase 
                                  FROM alumnos a JOIN clases c ON a.clase_id = c.id 
                                  WHERE a.clase_id = ?`;
                baseAlumnosParams.push(req.user.claseId);
            } else if (req.user.rol === 'DIRECCION') {
                const viewClaseId = req.query.view_clase_id ? parseInt(req.query.view_clase_id) : null;
                if (viewClaseId) {
                    baseAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.clase_id, c.nombre_clase 
                                      FROM alumnos a JOIN clases c ON a.clase_id = c.id 
                                      WHERE a.clase_id = ?`;
                    baseAlumnosParams.push(viewClaseId);
                } else {
                     baseAlumnosSql = `SELECT DISTINCT a.id as alumno_id, a.nombre_completo, a.clase_id, c.nombre_clase 
                                      FROM alumnos a 
                                      JOIN clases c ON a.clase_id = c.id 
                                      JOIN participaciones_excursion pe ON a.id = pe.alumno_id 
                                      WHERE pe.excursion_id = ?`;
                    baseAlumnosParams.push(excursionId);
                }
            } else { 
                 return res.status(403).json({ error: "Rol no autorizado." });
            }
        }
        baseAlumnosSql += " ORDER BY c.nombre_clase ASC, a.apellidos_para_ordenar ASC, a.nombre_completo ASC";
        
        const alumnosBase = await dbAllAsync(baseAlumnosSql, baseAlumnosParams);

        if (alumnosBase.length === 0 && currentExcursion.para_clase_id === null && req.user.rol === 'DIRECCION' && !req.query.view_clase_id) {
            const todosLosAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.clase_id, c.nombre_clase 
                                       FROM alumnos a JOIN clases c ON a.clase_id = c.id
                                       ORDER BY c.nombre_clase ASC, a.apellidos_para_ordenar ASC, a.nombre_completo ASC`;
            const todosLosAlumnos = await dbAllAsync(todosLosAlumnosSql, []);
            alumnosBase.push(...todosLosAlumnos);
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
    console.log("  Ruta: GET /api/dashboard/summary para:", req.user.email);
    try {
        const totalClases = (await dbGetAsync("SELECT COUNT(*) as count FROM clases")).count;
        // Aquí deberías expandir para obtener más datos como en tu app.js
        // Por ahora, solo devolvemos totalClases para que el log original no falle.
        res.json({ mensaje: "Resumen del dashboard", totalClases /* , otros datos... */ });
    } catch (error) { res.status(500).json({error: "Error en dashboard: " + error.message});}
});

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
