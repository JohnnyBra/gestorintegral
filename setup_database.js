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
    rol TEXT NOT NULL CHECK(rol IN ('DIRECCION', 'TUTOR', 'TESORERIA', 'COORDINACION'))
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
    lugar TEXT,
    hora_salida TEXT,
    hora_llegada TEXT,
    coste_excursion_alumno REAL DEFAULT 0,
    vestimenta TEXT,
    transporte TEXT,
    justificacion_texto TEXT,
    actividad_descripcion TEXT NOT NULL,
    notas_excursion TEXT,
    creada_por_usuario_id INTEGER NOT NULL, 
    para_clase_id INTEGER, 
    FOREIGN KEY (creada_por_usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (para_clase_id) REFERENCES clases(id) ON DELETE SET NULL 
        ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS shared_excursions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_excursion_id INTEGER,
    shared_by_usuario_id INTEGER,
    shared_with_usuario_id INTEGER,
    status TEXT CHECK(status IN ('pending', 'accepted', 'declined')) NOT NULL DEFAULT 'pending',
    shared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULLABLE,
    new_excursion_id_on_acceptance INTEGER NULLABLE,
    FOREIGN KEY (original_excursion_id) REFERENCES excursiones(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by_usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_with_usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (new_excursion_id_on_acceptance) REFERENCES excursiones(id) ON DELETE SET NULL
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

CREATE TABLE IF NOT EXISTS coordinador_clases (
    coordinador_id INTEGER NOT NULL,
    clase_id INTEGER NOT NULL,
    FOREIGN KEY (coordinador_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (clase_id) REFERENCES clases(id) ON DELETE CASCADE,
    PRIMARY KEY (coordinador_id, clase_id)
);

CREATE TABLE IF NOT EXISTS ciclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_ciclo TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS ciclo_clases_definicion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ciclo_id INTEGER NOT NULL,
    nombre_patron_clase TEXT NOT NULL,
    FOREIGN KEY (ciclo_id) REFERENCES ciclos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usuario_ciclos_coordinador (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coordinador_usuario_id INTEGER NOT NULL,
    ciclo_id INTEGER NOT NULL,
    FOREIGN KEY (coordinador_usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (ciclo_id) REFERENCES ciclos(id) ON DELETE CASCADE,
    UNIQUE (coordinador_usuario_id, ciclo_id)
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
        await insertUsuario(emailDireccion, nombreDireccion, passwordDireccion, "DIRECCION");

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

        // 4. Insertar Ciclos
        const ciclosData = ['Infantil', 'Primer ciclo', 'Segundo ciclo', 'Tercer ciclo'];
        const cicloIds = {};
        for (const nombreCiclo of ciclosData) {
            const cicloId = await insertCiclo(nombreCiclo);
            cicloIds[nombreCiclo] = cicloId;
        }

        // 5. Insertar Definiciones de Clases para Ciclos
        // Asegúrate que los IDs corresponden a los insertados o consultados arriba
        if (cicloIds['Infantil']) await insertCicloClaseDefinicion(cicloIds['Infantil'], 'INFANTIL%');
        if (cicloIds['Primer ciclo']) {
            await insertCicloClaseDefinicion(cicloIds['Primer ciclo'], 'PRIMARIA 1%'); // Corregido para incluir %
            await insertCicloClaseDefinicion(cicloIds['Primer ciclo'], 'PRIMARIA 2%'); // Corregido para incluir %
        }
        if (cicloIds['Segundo ciclo']) {
            await insertCicloClaseDefinicion(cicloIds['Segundo ciclo'], 'PRIMARIA 3%'); // Corregido para incluir %
            await insertCicloClaseDefinicion(cicloIds['Segundo ciclo'], 'PRIMARIA 4%'); // Corregido para incluir %
        }
        if (cicloIds['Tercer ciclo']) {
            await insertCicloClaseDefinicion(cicloIds['Tercer ciclo'], 'PRIMARIA 5%'); // Corregido para incluir %
            await insertCicloClaseDefinicion(cicloIds['Tercer ciclo'], 'PRIMARIA 6%'); // Corregido para incluir %
        }


    } catch (error) {
        console.error("Error durante la inserción de datos iniciales:", error.message);
    }
}

const insertCiclo = (nombreCiclo) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT id FROM ciclos WHERE lower(nombre_ciclo) = lower(?)", [nombreCiclo.toLowerCase()], (err, row) => {
            if (err) return reject(new Error(`Error consultando ciclo ${nombreCiclo}: ${err.message}`));
            if (row) {
                console.log(`Ciclo ${nombreCiclo} ya existe con ID: ${row.id}.`);
                resolve(row.id);
            } else {
                db.run(`INSERT INTO ciclos (nombre_ciclo) VALUES (?)`, [nombreCiclo], function (errInsert) {
                    if (errInsert) return reject(new Error(`Error insertando ciclo ${nombreCiclo}: ${errInsert.message}`));
                    console.log(`Ciclo '${nombreCiclo}' creado con ID: ${this.lastID}`);
                    resolve(this.lastID);
                });
            }
        });
    });
};

const insertCicloClaseDefinicion = (cicloId, nombrePatron) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT id FROM ciclo_clases_definicion WHERE ciclo_id = ? AND lower(nombre_patron_clase) = lower(?)", 
               [cicloId, nombrePatron.toLowerCase()], (err, row) => {
            if (err) return reject(new Error(`Error consultando definicion ${nombrePatron} para ciclo ${cicloId}: ${err.message}`));
            if (row) {
                console.log(`Definicion ${nombrePatron} para ciclo ${cicloId} ya existe.`);
                resolve(row.id);
            } else {
                db.run(`INSERT INTO ciclo_clases_definicion (ciclo_id, nombre_patron_clase) VALUES (?, ?)`, 
                       [cicloId, nombrePatron], function (errInsert) {
                    if (errInsert) return reject(new Error(`Error insertando definicion ${nombrePatron} para ciclo ${cicloId}: ${errInsert.message}`));
                    console.log(`Definicion '${nombrePatron}' para ciclo ID ${cicloId} creada con ID: ${this.lastID}`);
                    resolve(this.lastID);
                });
            }
        });
    });
};

function cerrarDB() {
    db.close((err) => {
        if (err) console.error("Error cerrando la BD:", err.message);
        else console.log('Conexión a la base de datos cerrada.');
    });
}
