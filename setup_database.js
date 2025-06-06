const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const DBSOURCE = path.join(__dirname, "database.db"); 

const db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Conectado a la base de datos SQLite.');
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

const sqlCrearTablas = `
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    nombre_completo TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('DIRECCION', 'TUTOR', 'TESORERIA'))
);

CREATE TABLE IF NOT EXISTS clases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_clase TEXT UNIQUE NOT NULL,
    tutor_id INTEGER, -- ID del usuario que es tutor
    ciclo_id INTEGER,
    FOREIGN KEY (tutor_id) REFERENCES usuarios(id) ON DELETE SET NULL 
        ON UPDATE CASCADE, -- Si el ID del usuario tutor cambia, se actualiza aquí
    FOREIGN KEY (ciclo_id) REFERENCES ciclos(id) ON DELETE SET NULL ON UPDATE CASCADE
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
    numero_autobuses INTEGER,
    coste_por_autobus REAL,
    coste_entradas_individual REAL,
    coste_actividad_global REAL,
    creada_por_usuario_id INTEGER NOT NULL, 
    para_clase_id INTEGER,
    para_ciclo_id INTEGER, -- New column
    FOREIGN KEY (creada_por_usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (para_clase_id) REFERENCES clases(id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (para_ciclo_id) REFERENCES ciclos(id) ON DELETE SET NULL ON UPDATE CASCADE -- New FK
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
    asistencia TEXT DEFAULT 'Pendiente' CHECK(asistencia IN ('Sí', 'No', 'Pendiente')),
    notas_participacion TEXT,
    FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE CASCADE,
    FOREIGN KEY (excursion_id) REFERENCES excursiones(id) ON DELETE CASCADE,
    UNIQUE (alumno_id, excursion_id)
);

CREATE TABLE IF NOT EXISTS ciclos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_ciclo TEXT UNIQUE NOT NULL
);

`;

// Las tablas coordinador_clases, ciclo_clases_definicion, y usuario_ciclos_coordinador han sido eliminadas.

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
    console.log("Insertando datos iniciales (si no existen)...");

    const insertUsuario = (email, nombre, pass, rol) => {
        return new Promise((resolve, reject) => {
            db.get("SELECT id FROM usuarios WHERE email = ?", [email.toLowerCase()], async (err, row) => {
                if (err) return reject(new Error(`Error consultando usuario ${email}: ${err.message}`));
                if (row) {
                    // console.log(`Usuario ${email} ya existe con ID: ${row.id}.`); // Removed: too verbose
                    return resolve(row.id);
                }
                try {
                    const salt = await bcrypt.genSalt(10);
                    const passwordHash = await bcrypt.hash(pass, salt);
                    db.run(`INSERT INTO usuarios (email, nombre_completo, password_hash, rol) VALUES (?, ?, ?, ?)`,
                        [email.toLowerCase(), nombre, passwordHash, rol], function (errInsert) {
                            if (errInsert) return reject(new Error(`Error insertando usuario ${email}: ${errInsert.message}`));
                            console.log(`Usuario ${rol} '${nombre}' creado con email ${email}.`);
                            resolve(this.lastID);
                        }
                    );
                } catch (hashErr) {
                    return reject(new Error(`Error generando hash para ${email}: ${hashErr.message}`));
                }
            });
        });
    };

    const insertClase = (nombreClase, tutorId, cicloId) => {
        return new Promise((resolve, reject) => {
            db.get("SELECT id, tutor_id, ciclo_id FROM clases WHERE lower(nombre_clase) = lower(?)", [nombreClase.toLowerCase()], (err, row) => {
                if (err) return reject(new Error(`Error consultando clase ${nombreClase}: ${err.message}`));
                if (row) {
                    // console.log(`Clase ${nombreClase} ya existe con ID: ${row.id}.`); // Removed: too verbose
                    let updates = [];
                    let params = [];
                    if (tutorId !== undefined && row.tutor_id !== tutorId) {
                        updates.push("tutor_id = ?");
                        params.push(tutorId);
                    }
                    if (cicloId !== undefined && row.ciclo_id !== cicloId) {
                        updates.push("ciclo_id = ?");
                        params.push(cicloId);
                    }

                    if (updates.length > 0) {
                        params.push(row.id); 
                        db.run(`UPDATE clases SET ${updates.join(", ")} WHERE id = ?`, params, function(errUpdate) {
                            if (errUpdate) console.error(`Error actualizando clase ${nombreClase}: ${errUpdate.message}`);
                            // else console.log(`Clase ${nombreClase} actualizada.`); // Removed: too verbose
                            resolve(row.id);
                        });
                    } else {
                        resolve(row.id);
                    }
                } else {
                     db.run(`INSERT INTO clases (nombre_clase, tutor_id, ciclo_id) VALUES (?, ?, ?)`,
                        [nombreClase.toUpperCase(), tutorId, cicloId], function (errInsert) {
                            if (errInsert) return reject(new Error(`Error insertando clase ${nombreClase}: ${errInsert.message}`));
                            console.log(`Clase '${nombreClase}' creada.`);
                            resolve(this.lastID);
                        }
                    );
                }
            });
        });
    };

    try {
        const emailDireccion = "jefatura@colegiolahispanidad.es"; 
        const nombreDireccion = "Dirección del Centro"; 
        const passwordDireccion = "Hispanidad1973@"; // ¡CAMBIA ESTO por una contraseña segura!
        await insertUsuario(emailDireccion, nombreDireccion, passwordDireccion, "DIRECCION");

        const emailTutor = "palomino@colegiolahispanidad.es"; 
        const nombreTutor = "Profe de Ejemplo";       
        const passwordTutor = "password";   // ¡CAMBIA ESTO por una contraseña segura!
        const idTutorEjemplo = await insertUsuario(emailTutor, nombreTutor, passwordTutor, "TUTOR");

        const ciclosData = ['Infantil', 'Primer ciclo', 'Segundo ciclo', 'Tercer ciclo'];
        const cicloIds = {}; 
        for (const nombreCiclo of ciclosData) {
            const cicloId = await insertCiclo(nombreCiclo); 
            cicloIds[nombreCiclo] = cicloId;
        }
        
        if (idTutorEjemplo) { 
            await insertClase("1A PRIMARIA", idTutorEjemplo, cicloIds['Primer ciclo']); 
        } else {
            console.log("Tutor de ejemplo no encontrado, insertando 1A PRIMARIA sin tutor pero con ciclo.");
            await insertClase("1A PRIMARIA", null, cicloIds['Primer ciclo']);
        }
        
        await insertClase("INFANTIL 3A", null, cicloIds['Infantil']);
        await insertClase("INFANTIL 3B", null, cicloIds['Infantil']);
        await insertClase("INFANTIL 4A", null, cicloIds['Infantil']);
        await insertClase("INFANTIL 4B", null, cicloIds['Infantil']); 
        await insertClase("INFANTIL 5A", null, cicloIds['Infantil']);
        await insertClase("INFANTIL 5B", null, cicloIds['Infantil']);

        await insertClase("PRIMARIA 1B", null, cicloIds['Primer ciclo']);
        await insertClase("PRIMARIA 2A", null, cicloIds['Primer ciclo']);
        await insertClase("PRIMARIA 2B", null, cicloIds['Primer ciclo']);

        await insertClase("PRIMARIA 3A", null, cicloIds['Segundo ciclo']);
        await insertClase("PRIMARIA 3B", null, cicloIds['Segundo ciclo']);
        await insertClase("PRIMARIA 4A", null, cicloIds['Segundo ciclo']);
        await insertClase("PRIMARIA 4B", null, cicloIds['Segundo ciclo']);
        
        await insertClase("PRIMARIA 5A", null, cicloIds['Tercer ciclo']);
        await insertClase("PRIMARIA 5B", null, cicloIds['Tercer ciclo']);
        await insertClase("PRIMARIA 6A", null, cicloIds['Tercer ciclo']);
        await insertClase("PRIMARIA 6B", null, cicloIds['Tercer ciclo']);

    } catch (error) {
        console.error("Error durante la inserción de datos iniciales:", error.message);
    }
}

const insertCiclo = (nombreCiclo) => {
    return new Promise((resolve, reject) => {
        db.get("SELECT id FROM ciclos WHERE lower(nombre_ciclo) = lower(?)", [nombreCiclo.toLowerCase()], (err, row) => {
            if (err) return reject(new Error(`Error consultando ciclo ${nombreCiclo}: ${err.message}`));
            if (row) {
                // console.log(`Ciclo ${nombreCiclo} ya existe con ID: ${row.id}.`); // Removed: too verbose
                resolve(row.id);
            } else {
                db.run(`INSERT INTO ciclos (nombre_ciclo) VALUES (?)`, [nombreCiclo], function (errInsert) {
                    if (errInsert) return reject(new Error(`Error insertando ciclo ${nombreCiclo}: ${errInsert.message}`));
                    console.log(`Ciclo '${nombreCiclo}' creado.`);
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
