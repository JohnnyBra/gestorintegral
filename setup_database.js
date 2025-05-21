// --- setup_database.js (CORREGIDO) ---
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path'); // LÍNEA CORREGIDA AQUÍ

// Nombre del archivo de la base de datos
const DBSOURCE = path.join(__dirname, "database.db"); // Crea database.db en la misma carpeta que este script

// Conectar a la base de datos (se creará si no existe)
const db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
        // No se pudo abrir la base de datos
        console.error(err.message);
        throw err;
    } else {
        console.log('Conectado a la base de datos SQLite.');
        // Habilitar claves foráneas
        db.run("PRAGMA foreign_keys = ON;", (fkErr) => {
            if (fkErr) {
                console.error("Error habilitando claves foráneas:", fkErr.message);
            } else {
                console.log("Claves foráneas habilitadas en SQLite.");
            }
        });
        crearTablas();
    }
});

// SQL para crear las tablas
const sqlCrearTablas = `
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    nombre_completo TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('DIRECCION', 'TUTOR'))
);

CREATE TABLE IF NOT EXISTS clases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_clase TEXT UNIQUE NOT NULL,
    tutor_id INTEGER, -- ID del usuario que es tutor
    FOREIGN KEY (tutor_id) REFERENCES usuarios(id) ON DELETE SET NULL 
        ON UPDATE CASCADE -- Si el ID del usuario tutor cambia, se actualiza aquí
);

CREATE TABLE IF NOT EXISTS alumnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_completo TEXT NOT NULL,
    apellidos_para_ordenar TEXT,
    clase_id INTEGER NOT NULL,
    FOREIGN KEY (clase_id) REFERENCES clases(id) ON DELETE CASCADE,
    UNIQUE (nombre_completo, clase_id)
);

CREATE TABLE IF NOT EXISTS excursiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_excursion TEXT NOT NULL,
    fecha_excursion TEXT,
    coste_excursion_alumno REAL DEFAULT 0,
    vestimenta TEXT,
    transporte TEXT,
    notas_excursion TEXT,
    creada_por_usuario_id INTEGER NOT NULL, 
    para_clase_id INTEGER, 
    FOREIGN KEY (creada_por_usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (para_clase_id) REFERENCES clases(id) ON DELETE SET NULL 
        ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS participaciones_excursion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_id INTEGER NOT NULL,
    excursion_id INTEGER NOT NULL,
    autorizacion_firmada TEXT DEFAULT 'No' CHECK(autorizacion_firmada IN ('Sí', 'No')),
    fecha_autorizacion TEXT,
    pago_realizado TEXT DEFAULT 'No' CHECK(pago_realizado IN ('Sí', 'No', 'Parcial')),
    cantidad_pagada REAL DEFAULT 0,
    fecha_pago TEXT,
    notas_participacion TEXT,
    FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE CASCADE,
    FOREIGN KEY (excursion_id) REFERENCES excursiones(id) ON DELETE CASCADE,
    UNIQUE (alumno_id, excursion_id)
);
`;

function crearTablas() {
    db.exec(sqlCrearTablas, async (err) => {
        if (err) {
            console.error("Error al crear tablas:", err.message);
        } else {
            console.log("Tablas creadas o ya existentes.");
            await insertarDatosIniciales(); 
        }
        cerrarDB(); 
    });
}

async function insertarDatosIniciales() {
    console.log("Insertando datos iniciales si no existen...");

    const insertUsuario = (email, nombre, pass, rol) => {
        return new Promise((resolve, reject) => {
            db.get("SELECT id FROM usuarios WHERE email = ?", [email.toLowerCase()], async (err, row) => {
                if (err) return reject(new Error(`Error consultando usuario ${email}: ${err.message}`));
                if (row) {
                    console.log(`Usuario ${email} ya existe con ID: ${row.id}.`);
                    return resolve(row.id);
                }
                try {
                    const salt = await bcrypt.genSalt(10);
                    const passwordHash = await bcrypt.hash(pass, salt);
                    db.run(`INSERT INTO usuarios (email, nombre_completo, password_hash, rol) VALUES (?, ?, ?, ?)`,
                        [email.toLowerCase(), nombre, passwordHash, rol], function (errInsert) {
                            if (errInsert) return reject(new Error(`Error insertando usuario ${email}: ${errInsert.message}`));
                            console.log(`Usuario ${rol} '${nombre}' creado con email ${email} e ID: ${this.lastID}`);
                            resolve(this.lastID);
                        }
                    );
                } catch (hashErr) {
                    return reject(new Error(`Error generando hash para ${email}: ${hashErr.message}`));
                }
            });
        });
    };

    const insertClase = (nombreClase, tutorId) => {
        return new Promise((resolve, reject) => {
            db.get("SELECT id, tutor_id FROM clases WHERE lower(nombre_clase) = lower(?)", [nombreClase.toLowerCase()], (err, row) => {
                if (err) return reject(new Error(`Error consultando clase ${nombreClase}: ${err.message}`));
                if (row) {
                    console.log(`Clase ${nombreClase} ya existe con ID: ${row.id}.`);
                    if (tutorId !== undefined && row.tutor_id !== tutorId) {
                        db.run("UPDATE clases SET tutor_id = ? WHERE id = ?", [tutorId, row.id], function(errUpdate) {
                            if (errUpdate) console.error(`Error actualizando tutor para clase ${nombreClase}: ${errUpdate.message}`);
                            else console.log(`Clase ${nombreClase} actualizada con tutor ID ${tutorId}.`);
                            resolve(row.id);
                        });
                    } else {
                        resolve(row.id);
                    }
                } else {
                     db.run(`INSERT INTO clases (nombre_clase, tutor_id) VALUES (?, ?)`,
                        [nombreClase.toUpperCase(), tutorId], function (errInsert) {
                            if (errInsert) return reject(new Error(`Error insertando clase ${nombreClase}: ${errInsert.message}`));
                            console.log(`Clase '${nombreClase}' creada con ID: ${this.lastID} y tutor ID: ${tutorId}`);
                            resolve(this.lastID);
                        }
                    );
                }
            });
        });
    };

    try {
        // 1. Crear usuario Dirección (MODIFICA ESTOS VALORES)
        const emailDireccion = "jefatura@colegiolahispanidad.es"; // Cambia esto
        const nombreDireccion = "Dirección del Centro"; // Cambia esto
        const passwordDireccion = "Hispanidad1973@"; // ¡CAMBIA ESTO por una contraseña segura!
        const idDireccion = await insertUsuario(emailDireccion, nombreDireccion, passwordDireccion, "DIRECCION");

        // 2. Crear usuario Tutor de Ejemplo (MODIFICA ESTOS VALORES)
        const emailTutor = "palomino@colegiolahispanidad.es"; // Cambia esto
        const nombreTutor = "Profe de Ejemplo";       // Cambia esto
        const passwordTutor = "password";   // ¡CAMBIA ESTO por una contraseña segura!
        const idTutorEjemplo = await insertUsuario(emailTutor, nombreTutor, passwordTutor, "TUTOR");

        // 3. Crear Clase de Ejemplo y asignarla al Tutor de Ejemplo
        if (idTutorEjemplo) { 
            await insertClase("1A PRIMARIA", idTutorEjemplo); 
        }
        await insertClase("INFANTIL 4B", null); 

    } catch (error) {
        console.error("Error durante la inserción de datos iniciales:", error.message);
    }
}

function cerrarDB() {
    db.close((err) => {
        if (err) console.error("Error cerrando la BD:", err.message);
        else console.log('Conexión a la base de datos cerrada.');
    });
}
