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
// ... RESTO DE CRUD PARA USUARIOS (POST, PUT, DELETE) ...

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
        const alumnoExistente = await dbGetAsync("SELECT id FROM alumnos WHERE lower(nombre_completo) = lower(?) AND clase_id = ?", [nombre_completo.toLowerCase(), idClaseNum]);
        if (alumnoExistente) {
            return res.status(409).json({ error: `El alumno '${nombre_completo}' ya existe en la clase seleccionada.`});
        }

        const result = await dbRunAsync("INSERT INTO alumnos (nombre_completo, clase_id) VALUES (?, ?)", [nombre_completo, idClaseNum]);
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
// (Pega aquí tus endpoints CRUD COMPLETOS para /api/excursiones. Asegúrate de que usen dbGetAsync, dbRunAsync, dbAllAsync y la lógica de roles)
// ...

// --- Gestión de Participaciones ---
// (Pega aquí tus endpoints CRUD COMPLETOS para /api/participaciones. Asegúrate de que usen dbGetAsync, dbRunAsync, dbAllAsync y la lógica de roles)
// ...

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
