// --- server.js (Enfoque en Arranque Estable y Completitud) ---
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
// (Pega aquí tus endpoints CRUD COMPLETOS para /api/usuarios que te di antes. Asegúrate de que usen dbGetAsync, dbRunAsync, dbAllAsync)
// Ejemplo para GET (asegúrate de que los demás (POST, PUT, DELETE) estén también):
app.get('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    try {
        const usuarios = await dbAllAsync("SELECT u.id, u.email, u.nombre_completo, u.rol, c.id as clase_asignada_id, c.nombre_clase as clase_asignada_nombre FROM usuarios u LEFT JOIN clases c ON u.id = c.tutor_id ORDER BY u.nombre_completo");
        res.json({ usuarios });
    } catch (error) { res.status(500).json({ error: "Error obteniendo usuarios: " + error.message }); }
});
// ... RESTO DE CRUD PARA USUARIOS ...

// --- Gestión de Clases ---
// (Pega aquí tus endpoints CRUD COMPLETOS para /api/clases. Asegúrate de que usen dbGetAsync, dbRunAsync, dbAllAsync)
// Ejemplo para GET:
app.get('/api/clases', authenticateToken, async (req, res) => {
    try {
        const clases = await dbAllAsync(`SELECT c.id, c.nombre_clase, c.tutor_id, u.nombre_completo as nombre_tutor, u.email as email_tutor
                                        FROM clases c LEFT JOIN usuarios u ON c.tutor_id = u.id ORDER BY c.nombre_clase ASC`);
        res.json({ clases });
    } catch (error) { res.status(500).json({ error: "Error obteniendo clases: " + error.message });}
});
// ... RESTO DE CRUD PARA CLASES ...

// --- Gestión de Alumnos ---
// (Pega aquí tus endpoints CRUD COMPLETOS para /api/alumnos. Asegúrate de que usen dbGetAsync, dbRunAsync, dbAllAsync y la lógica de roles)
// --- En server.js, dentro de las rutas de API ---

// ... (tus otros endpoints para alumnos) ...

// POST /api/alumnos/importar_csv - Importar alumnos desde un CSV a una clase
app.post('/api/alumnos/importar_csv', authenticateToken, async (req, res) => {
    const { clase_id, csv_data } = req.body; // Esperamos el ID de la clase y el contenido del CSV como string
    
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
        const claseDb = await dbGetAsyncP("SELECT id FROM clases WHERE id = ?", [idClaseNum]);
        if (!claseDb) {
            return res.status(404).json({ error: `La clase con ID ${idClaseNum} no existe.` });
        }
    } catch (e) {
        return res.status(500).json({ error: "Error verificando la clase: " + e.message });
    }

    const lineas = csv_data.split(/\r\n|\n/);
    let alumnosImportados = 0;
    let alumnosOmitidos = 0;
    let erroresEnLineas = [];
    const promesasDeInsercion = [];

    // Función para limpiar comillas envolventes (la que ya tienes)
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

        // 1. Limpiar comillas envolventes de TODA la línea si el formato es así
        let contenidoCampo = limpiarComillasEnvolventes(lineaParaProcesar);

        // 2. Ignorar cabecera (ej. "Alumno" o "Apellidos, Nombre")
        if (i === 0 && (contenidoCampo.toLowerCase().includes('alumno') || contenidoCampo.toLowerCase().includes('apellido'))) {
            console.log("Cabecera CSV omitida en importación:", lineaOriginal);
            continue; 
        }

        // 3. Dividir el contenido del campo interno "Apellidos, Nombre"
        let apellidos = "";
        let nombre = "";
        const indiceUltimaComa = contenidoCampo.lastIndexOf(',');
        
        if (indiceUltimaComa > 0 && indiceUltimaComa < contenidoCampo.length - 1) {
            apellidos = contenidoCampo.substring(0, indiceUltimaComa).trim();
            nombre = contenidoCampo.substring(indiceUltimaComa + 1).trim();
        } else {
            // Si no sigue el patrón, se marca como error de formato para esa línea
            if (contenidoCampo) { // Solo si hay contenido después de quitar comillas
                console.warn(`Línea ${i + 1} en CSV no sigue el formato "Apellidos, Nombre": "${contenidoCampo}"`);
                erroresEnLineas.push({ linea: i + 1, dato: contenidoCampo, error: "Formato incorrecto (se esperaba 'Apellidos, Nombre')" });
            }
            continue; 
        }

        if (nombre && apellidos) {
            const nombreCompletoFinal = `${nombre} ${apellidos}`; // Formato: Nombre Apellidos
            
            // Añadir a la lista de promesas para inserción
            promesasDeInsercion.push(
                dbGetAsyncP("SELECT id FROM alumnos WHERE lower(nombre_completo) = lower(?) AND clase_id = ?", [nombreCompletoFinal.toLowerCase(), idClaseNum])
                .then(alumnoExistente => {
                    if (alumnoExistente) {
                        alumnosOmitidos++;
                        console.log(`Alumno omitido (duplicado): ${nombreCompletoFinal} en clase ID ${idClaseNum}`);
                    } else {
                        return dbRunAsyncP("INSERT INTO alumnos (nombre_completo, clase_id) VALUES (?, ?)", [nombreCompletoFinal, idClaseNum])
                            .then(() => {
                                alumnosImportados++;
                                console.log(`Alumno importado: ${nombreCompletoFinal} a clase ID ${idClaseNum}`);
                            });
                    }
                })
                .catch(errIns => {
                    console.error(`Error procesando alumno ${nombreCompletoFinal}: ${errIns.message}`);
                    erroresEnLineas.push({ linea: i + 1, dato: contenidoCampo, error: errIns.message });
                })
            );
        } else {
            erroresEnLineas.push({ linea: i + 1, dato: contenidoCampo, error: "Nombre o apellidos vacíos tras procesar." });
        }
    }

    try {
        await Promise.all(promesasDeInsercion); // Esperar a que todas las inserciones (o verificaciones) terminen
        res.json({
            message: "Proceso de importación CSV completado.",
            importados: alumnosImportados,
            omitidos_duplicados: alumnosOmitidos,
            lineas_con_error: erroresEnLineas.length,
            detalles_errores: erroresEnLineas
        });
    } catch (errorGeneral) {
        // Este catch es por si Promise.all falla por alguna razón no capturada antes
        console.error("Error general durante el proceso de importación CSV:", errorGeneral);
        res.status(500).json({ error: "Error interno durante la importación masiva." });
    }
});
console.log("Endpoint POST /api/alumnos/importar_csv definido.");
// --- Gestión de Excursiones ---
// (Pega aquí tus endpoints CRUD COMPLETOS para /api/excursiones. Asegúrate de que usen dbGetAsync, dbRunAsync, dbAllAsync y la lógica de roles)
// ...

// --- Gestión de Participaciones ---
// (Pega aquí tus endpoints CRUD COMPLETOS para /api/participaciones. Asegúrate de que usen dbGetAsync, dbRunAsync, dbAllAsync y la lógica de roles)
// ...

// --- Endpoint de Dashboard ---
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => {
    console.log("  Ruta: GET /api/dashboard/summary para:", req.user.email);
    // ... (Pega aquí tu lógica completa del endpoint de Dashboard usando await dbGetAsyncP y dbAllAsyncP)
    // Ejemplo simplificado:
    try {
        const totalClases = (await dbGetAsync("SELECT COUNT(*) as count FROM clases")).count;
        res.json({ mensaje: "Resumen del dashboard", totalClases });
    } catch (error) { res.status(500).json({error: "Error en dashboard: " + error.message});}
});

console.log("Paso 17: Todas las definiciones de rutas de API (o sus placeholders) completadas.");

// --- Conexión a la Base de Datos e Inicio del Servidor ---
const DB_FILE_PATH_FINAL = path.join(__dirname, "database.db"); // Usar un nombre diferente para no confundir con el DBSOURCE global
console.log(`Paso 18: Intentando conectar a BD en: ${DB_FILE_PATH_FINAL} para iniciar servidor.`);

db = new sqlite3.Database(DB_FILE_PATH_FINAL, sqlite3.OPEN_READWRITE, (err) => { // Abrir en modo lectura/escritura
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
