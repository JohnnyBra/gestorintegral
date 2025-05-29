const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const fs = require('fs'); 
const { PDFDocument, StandardFonts, rgb, PageSizes } = require('pdf-lib');
const fontkit = require('fontkit');

// console.log("Intentando configurar PdfPrinter.vfs (versión 3 de depuración)..."); // Original pdfmake log

// Removed pdfmake VFS setup and printer initialization

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "ESTE_SECRETO_DEBE_SER_CAMBIADO_EN_PRODUCCION_Y_EN_.ENV";

if (JWT_SECRET === "ESTE_SECRETO_DEBE_SER_CAMBIADO_EN_PRODUCCION_Y_EN_.ENV") {
    console.warn(" ADVERTENCIA CRÍTICA: Estás usando un JWT_SECRET por defecto. ¡DEBES CAMBIARLO!");
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

let db;

// Middleware de Autenticación JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ error: "Token no proporcionado." });

    jwt.verify(token, JWT_SECRET, (err, userPayload) => {
        if (err) {
            return res.status(403).json({ error: err.name === 'TokenExpiredError' ? "Token expirado." : "Token inválido." });
        }
        req.user = userPayload;
        next();
    });
}

// Helpers de Base de Datos con Promesas
function dbGetAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("La base de datos no está inicializada."));
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}
function dbRunAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("La base de datos no está inicializada."));
        db.run(sql, params, function(err) { (err ? reject(err) : resolve(this)); });
    });
}
function dbAllAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error("La base de datos no está inicializada."));
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

async function getTutorCicloClaseIds(tutorClaseId) {
    if (!db) {
        console.error("La base de datos no está inicializada al llamar a getTutorCicloClaseIds.");
        return [];
    }
    if (!tutorClaseId) {
        return [];
    }

    try {
        const claseInfo = await dbGetAsync("SELECT ciclo_id FROM clases WHERE id = ?", [tutorClaseId]);

        if (!claseInfo || claseInfo.ciclo_id === null || claseInfo.ciclo_id === undefined) {
            return [];
        }
        const cicloId = claseInfo.ciclo_id;

        const clasesDelCicloRows = await dbAllAsync("SELECT id FROM clases WHERE ciclo_id = ?", [cicloId]);
        
        if (!clasesDelCicloRows || clasesDelCicloRows.length === 0) {
            return [];
        }

        const cicloClaseIds = clasesDelCicloRows.map(row => row.id);
        return cicloClaseIds;

    } catch (error) {
        console.error(`Error en getTutorCicloClaseIds para tutorClaseId ${tutorClaseId}:`, error.message);
        return [];
    }
}

async function getExcursionScopeDetails(excursion, dbGetAsync) {
    let participating_scope_type = "Desconocido";
    let participating_scope_name = "N/A";

    if (!excursion || typeof excursion.creada_por_usuario_id === 'undefined') {
        return { participating_scope_type, participating_scope_name };
    }

    try {
        if (excursion.para_clase_id !== null && excursion.para_clase_id !== undefined) {
            participating_scope_type = "class";
            const claseInfo = await dbGetAsync(
                `SELECT c.nombre_clase, ci.nombre_ciclo 
                 FROM clases c 
                 LEFT JOIN ciclos ci ON c.ciclo_id = ci.id 
                 WHERE c.id = ?`,
                [excursion.para_clase_id]
            );
            if (claseInfo) {
                participating_scope_name = claseInfo.nombre_clase || "Clase Desconocida";
                if (claseInfo.nombre_ciclo) {
                    participating_scope_name += ` (${claseInfo.nombre_ciclo})`;
                }
            } else {
                participating_scope_name = "Clase Específica (Detalles no encontrados)";
            }
        } else { 
            const creator = await dbGetAsync("SELECT rol FROM usuarios WHERE id = ?", [excursion.creada_por_usuario_id]);
            if (creator) {
                switch (creator.rol) {
                    case 'DIRECCION':
                        participating_scope_type = "all";
                        participating_scope_name = "Todos los ciclos";
                        break;
                    case 'TESORERIA':
                        participating_scope_type = "all";
                        participating_scope_name = "Todos los ciclos (Tesorería)";
                        break;
                    case 'COORDINACION': 
                        participating_scope_type = "all";
                        participating_scope_name = "Global (Coordinación)";
                        break;
                    case 'TUTOR':
                        participating_scope_type = "cycle";
                        const tutorClase = await dbGetAsync("SELECT ciclo_id FROM clases WHERE tutor_id = ?", [excursion.creada_por_usuario_id]);
                        if (tutorClase && tutorClase.ciclo_id) {
                            const cicloTutor = await dbGetAsync("SELECT nombre_ciclo FROM ciclos WHERE id = ?", [tutorClase.ciclo_id]);
                            if (cicloTutor && cicloTutor.nombre_ciclo) {
                                participating_scope_name = `${cicloTutor.nombre_ciclo} (Todas las clases del ciclo)`;
                            } else {
                                participating_scope_name = "Ciclo del creador (Todas las clases del ciclo)";
                            }
                        } else {
                            participating_scope_name = "Ciclo del creador no encontrado (Todas las clases del ciclo)";
                        }
                        break;
                    default:
                        participating_scope_type = "unknown_rol";
                        participating_scope_name = `Global (Rol Creador: ${creator.rol})`;
                }
            } else {
                participating_scope_name = "Global (Creador no encontrado)";
            }
        }
    } catch (error) {
        console.error(`Error en getExcursionScopeDetails para excursion ID ${excursion.id}:`, error.message);
    }
    return { participating_scope_type, participating_scope_name };
}

// Helper function to draw tables with pdf-lib (re-adding)
async function drawTable(pdfDoc, page, startY, data, columns, fonts, sizes, columnWidths, rowHeight, headerStyle, cellStyle, xStart = 50) {
    let currentY = startY;
    const { width, height } = page.getSize(); // Get page width and height for page breaks
    const tableActualWidth = columnWidths.reduce((sum, w) => sum + w, 0);
    const tableEndX = xStart + tableActualWidth;

    page.drawLine({
        start: { x: xStart, y: currentY },
        end: { x: tableEndX, y: currentY },
        thickness: 0.7,
        color: headerStyle.color || rgb(0, 0, 0)
    });

    let currentX = xStart;
    columns.forEach((col, index) => {
        page.drawText(col.header, {
            x: currentX + 2,
            y: currentY - (rowHeight / 2) - (sizes.header / 3.5),
            font: headerStyle.font,
            size: headerStyle.size,
            color: headerStyle.color
        });
        currentX += columnWidths[index];
    });
    currentY -= rowHeight;
    page.drawLine({
        start: { x: xStart, y: currentY },
        end: { x: tableEndX, y: currentY },
        thickness: 0.5,
        color: headerStyle.color || rgb(0, 0, 0)
    });

    for (const row of data) { // Changed to for...of for potential async operations within loop if needed
        if (currentY - rowHeight < 40) { 
             page = pdfDoc.addPage(PageSizes.A4);
             currentY = height - 50; 
             // Re-draw headers on new page
             let newPageX = xStart;
             page.drawLine({ start: { x: xStart, y: currentY }, end: { x: tableEndX, y: currentY }, thickness: 0.7, color: headerStyle.color || rgb(0,0,0) });
             columns.forEach((col, index) => {
                page.drawText(col.header, { x: newPageX + 2, y: currentY - (rowHeight / 2) - (sizes.header / 3.5), font: headerStyle.font, size: headerStyle.size, color: headerStyle.color });
                newPageX += columnWidths[index];
             });
             currentY -= rowHeight;
             page.drawLine({ start: { x: xStart, y: currentY }, end: { x: tableEndX, y: currentY }, thickness: 0.5, color: headerStyle.color || rgb(0,0,0) });
        }

        currentX = xStart;
        columns.forEach((col, index) => {
            let text = String(row[col.key] !== null && row[col.key] !== undefined ? row[col.key] : '');
            if (col.key === 'cantidad_pagada' && typeof row[col.key] === 'number') {
                text = row[col.key].toFixed(2);
            }
            
            let textX = currentX;
            const cellPadding = 5;

            if (col.alignment === 'right') {
                const textWidth = cellStyle.font.widthOfTextAtSize(text, cellStyle.size);
                textX = currentX + columnWidths[index] - textWidth - cellPadding;
            } else {
                 textX = currentX + cellPadding;
            }

            page.drawText(text, {
                x: textX,
                y: currentY - (rowHeight / 2) - (sizes.cell / 3.5),
                font: cellStyle.font,
                size: cellStyle.size,
                color: cellStyle.color
            });
            currentX += columnWidths[index];
        });
        currentY -= rowHeight;
        page.drawLine({
            start: { x: xStart, y: currentY },
            end: { x: tableEndX, y: currentY },
            thickness: 0.2,
            color: rgb(0.7, 0.7, 0.7)
        });
    }
    return currentY;
}

// Helper function to draw label and value with basic wrapping for value (re-adding)
function drawFieldWithWrapping(page, x, y, label, value, fonts, styles, maxWidth, lineHeight) {
    page.drawText(label, { 
        x, 
        y, 
        font: styles.label.font, 
        size: styles.label.size, 
        color: styles.label.color 
    });
    y -= styles.label.size + 4; 

    const valueFont = styles.value.font;
    const valueSize = styles.value.size;
    const valueColor = styles.value.color;

    let words = String(value).split(' ');
    let currentLine = '';
    
    for (let word of words) {
        let testLine = currentLine + (currentLine ? ' ' : '') + word;
        let testWidth = valueFont.widthOfTextAtSize(testLine, valueSize);
        if (testWidth > maxWidth && currentLine) {
            page.drawText(currentLine, { x, y, font: valueFont, size: valueSize, color: valueColor });
            y -= lineHeight;
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) {
        page.drawText(currentLine, { x, y, font: valueFont, size: valueSize, color: valueColor });
        y -= lineHeight;
    }
    return y - 10; 
}

app.get('/api', (req, res) => {
    res.json({ message: "API del Gestor Escolar v5 - ¡Funcionando!" });
});

// Autenticación
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email y contraseña son requeridos." });
    try {
        const normalizedEmail = email.toLowerCase();
        const user = await dbGetAsync("SELECT * FROM usuarios WHERE email = ?", [normalizedEmail]);
        if (!user) return res.status(401).json({ error: "Credenciales incorrectas." });
        const passwordIsValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordIsValid) return res.status(401).json({ error: "Credenciales incorrectas." });
        
        let tokenPayload = { id: user.id, email: user.email, rol: user.rol, nombre_completo: user.nombre_completo };
        const expiresIn = '8h';

        if (user.rol === 'TUTOR') {
            const claseRow = await dbGetAsync("SELECT id, nombre_clase FROM clases WHERE tutor_id = ?", [user.id]);
            if (claseRow) {
                tokenPayload.claseId = claseRow.id;
                tokenPayload.claseNombre = claseRow.nombre_clase;
            } else { 
                // Consider logging this warning if it's important for system health monitoring
                // console.warn(`Tutor ${user.email} no tiene clase asignada.`); 
            }
        }
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
        res.json({ token, user: tokenPayload, expiresIn });
    } catch (error) {
        console.error("Error en /api/auth/login:", error.message);
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

// Nuevo endpoint para generar PDF de Listado de Asistencia y Justificantes
app.get('/api/excursiones/:excursion_id/participaciones/reporte_pagos', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.excursion_id);
    const viewClaseId = req.query.view_clase_id ? parseInt(req.query.view_clase_id) : null;
    const userRol = req.user.rol;
    const userId = req.user.id; // userId no se usa directamente para la lógica principal aquí, pero es bueno tenerlo
    const userClaseId = req.user.claseId; // ID de la clase del tutor

    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }
    if (viewClaseId && isNaN(viewClaseId)) {
        return res.status(400).json({ error: "view_clase_id inválido." });
    }

    try {
        const excursion = await dbGetAsync("SELECT id, nombre_excursion, fecha_excursion, para_clase_id, creada_por_usuario_id FROM excursiones WHERE id = ?", [excursionId]);
        if (!excursion) {
            return res.status(404).json({ error: "Excursión no encontrada." });
        }

        let alumnosData = [];
        let sqlAlumnosQuery;
        const paramsAlumnosQuery = [];

        // 1. Data Fetching and Processing: Determine Student Scope
        if (excursion.para_clase_id !== null) { // Excursion for a specific class or cycle
            // Fetch all students belonging to excursion.para_clase_id
            sqlAlumnosQuery = `
                SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, c.id as clase_id, c.nombre_clase, p.autorizacion_firmada
                FROM alumnos a
                JOIN clases c ON a.clase_id = c.id
                LEFT JOIN participaciones_excursion p ON a.id = p.alumno_id AND p.excursion_id = ?
                WHERE a.clase_id = ?
                ORDER BY c.nombre_clase, a.apellidos_para_ordenar, a.nombre_completo`;
            paramsAlumnosQuery.push(excursionId, excursion.para_clase_id);

            // Authorization for specific class/cycle excursions
            if (userRol === 'TUTOR') {
                if (!userClaseId) return res.status(403).json({ error: "Tutor no asignado a una clase." });
                const cicloClaseIds = await getTutorCicloClaseIds(userClaseId);
                if (excursion.para_clase_id !== userClaseId && !cicloClaseIds.includes(excursion.para_clase_id)) {
                    return res.status(403).json({ error: "Tutores solo pueden generar reportes para excursiones de su clase o su ciclo." });
                }
            }
            // DIRECCION and TESORERIA can always access specific class/cycle excursions
        } else { // Global excursion (excursion.para_clase_id is null)
            if (userRol === 'TUTOR') {
                if (!userClaseId) return res.status(403).json({ error: "Tutor no asignado a una clase." });
                // Fetch students only from userClaseId
                sqlAlumnosQuery = `
                    SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, c.id as clase_id, c.nombre_clase, p.autorizacion_firmada
                    FROM alumnos a
                    JOIN clases c ON a.clase_id = c.id
                    LEFT JOIN participaciones_excursion p ON a.id = p.alumno_id AND p.excursion_id = ?
                    WHERE a.clase_id = ?
                    ORDER BY c.nombre_clase, a.apellidos_para_ordenar, a.nombre_completo`;
                paramsAlumnosQuery.push(excursionId, userClaseId);
            } else if (userRol === 'DIRECCION' || userRol === 'TESORERIA') {
                if (viewClaseId) {
                    // Fetch students from that viewClaseId
                    sqlAlumnosQuery = `
                        SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, c.id as clase_id, c.nombre_clase, p.autorizacion_firmada
                        FROM alumnos a
                        JOIN clases c ON a.clase_id = c.id
                        LEFT JOIN participaciones_excursion p ON a.id = p.alumno_id AND p.excursion_id = ?
                        WHERE a.clase_id = ?
                        ORDER BY c.nombre_clase, a.apellidos_para_ordenar, a.nombre_completo`;
                    paramsAlumnosQuery.push(excursionId, viewClaseId);
                } else {
                    // Fetch students from ALL classes
                    sqlAlumnosQuery = `
                        SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, c.id as clase_id, c.nombre_clase, p.autorizacion_firmada
                        FROM alumnos a
                        JOIN clases c ON a.clase_id = c.id
                        LEFT JOIN participaciones_excursion p ON a.id = p.alumno_id AND p.excursion_id = ?
                        ORDER BY c.nombre_clase, a.apellidos_para_ordenar, a.nombre_completo`;
                    paramsAlumnosQuery.push(excursionId);
                }
            } else {
                return res.status(403).json({ error: "Rol no autorizado para generar este reporte." });
            }
        }
        
        alumnosData = await dbAllAsync(sqlAlumnosQuery, paramsAlumnosQuery);

        // Combine and Process Data
        const alumnosPorClase = {};
        let totalGeneralAlumnos = 0;
        let totalGeneralAsistentes = 0;

        alumnosData.forEach(ad => {
            if (!alumnosPorClase[ad.nombre_clase]) {
                alumnosPorClase[ad.nombre_clase] = {
                    nombre_clase: ad.nombre_clase,
                    alumnos: [],
                    totalEnClase: 0,
                    asistentesEnClase: 0
                };
            }
            const alumnoConEstado = {
                nombre_completo: ad.nombre_completo,
                autorizacion_firmada: ad.autorizacion_firmada || 'No' // Default to 'No' if no participation record
            };
            alumnosPorClase[ad.nombre_clase].alumnos.push(alumnoConEstado);
            alumnosPorClase[ad.nombre_clase].totalEnClase++;
            totalGeneralAlumnos++;
            if (alumnoConEstado.autorizacion_firmada === 'Sí') {
                alumnosPorClase[ad.nombre_clase].asistentesEnClase++;
                totalGeneralAsistentes++;
            }
        });

        const totalGeneralNoAsistentes = totalGeneralAlumnos - totalGeneralAsistentes;

        // 2. PDF Generation (pdf-lib)
        const pdfDocLib = await PDFDocument.create();
        pdfDocLib.registerFontkit(fontkit);

        const robotoRegularBuffer = fs.readFileSync(path.join(__dirname, 'public/assets/fonts/Roboto-Regular.ttf'));
        const robotoBoldBuffer = fs.readFileSync(path.join(__dirname, 'public/assets/fonts/Roboto-Bold.ttf'));
        
        const robotoFont = await pdfDocLib.embedFont(robotoRegularBuffer);
        const robotoBoldFont = await pdfDocLib.embedFont(robotoBoldBuffer);

        let page = pdfDocLib.addPage(PageSizes.A4);
        const { width, height } = page.getSize();

        const pdfStyles = {
            mainTitle: { font: robotoBoldFont, size: 16, color: rgb(0,0,0) },
            header: { font: robotoBoldFont, size: 14, color: rgb(0,0,0) },
            subheader: { font: robotoBoldFont, size: 12, color: rgb(0.1, 0.1, 0.1) },
            classHeader: { font: robotoBoldFont, size: 12, color: rgb(0.0, 0.0, 0.6) }, // Azul para nombres de clase
            tableHeader: { font: robotoBoldFont, size: 10, color: rgb(0,0,0) },
            tableCell: { font: robotoFont, size: 9, color: rgb(0.1, 0.1, 0.1) },
            summaryText: { font: robotoFont, size: 10, color: rgb(0,0,0) },
            boldSummaryText: { font: robotoBoldFont, size: 10, color: rgb(0,0,0) }
        };

        let currentY = height - 40;
        const xMargin = 40;
        const contentWidth = width - (2 * xMargin);
        const rowHeight = 18;

        const ensurePageSpace = (neededSpace, isNewSection = false) => {
            if (currentY - neededSpace < 40 || (isNewSection && currentY - neededSpace < 80)) { // More space for new section headers
                page = pdfDocLib.addPage(PageSizes.A4);
                currentY = height - 40;
                return true; // New page added
            }
            return false; // No new page
        };
        
        // Overall Title
        page.drawText('Listado de Asistencia y Justificantes', { x: xMargin, y: currentY, ...pdfStyles.mainTitle });
        currentY -= 20;
        page.drawText(`Excursión: ${excursion.nombre_excursion}`, { x: xMargin, y: currentY, ...pdfStyles.header });
        currentY -= 18;
        page.drawText(`Fecha: ${new Date(excursion.fecha_excursion).toLocaleDateString('es-ES')}`, { x: xMargin, y: currentY, ...pdfStyles.header });
        currentY -= 25;

        // Columns for the table of attending students
        const columnsAsistentes = [
            { header: 'Nombre Alumno Asistente', key: 'nombre_completo', alignment: 'left'}
        ];
        const columnWidthsAsistentes = [contentWidth]; // Single column takes full width

        // Loop by Class
        for (const nombreClase of Object.keys(alumnosPorClase).sort()) {
            const claseData = alumnosPorClase[nombreClase];
            const alumnosAsistentesEnClase = claseData.alumnos.filter(a => a.autorizacion_firmada === 'Sí');
            const noAsistentesEnClase = claseData.totalEnClase - claseData.asistentesEnClase;

            ensurePageSpace(rowHeight * 3, true); // Space for class header and summary
            
            // Class Header
            page.drawText(`Clase: ${claseData.nombre_clase}`, { x: xMargin, y: currentY, ...pdfStyles.classHeader });
            currentY -= 20;

            // Table of Attending Students
            if (alumnosAsistentesEnClase.length > 0) {
                ensurePageSpace(rowHeight * (alumnosAsistentesEnClase.length + 1));
                 currentY = await drawTable(pdfDocLib, page, currentY, alumnosAsistentesEnClase, columnsAsistentes, { normal: robotoFont, bold: robotoBoldFont }, { header: 10, cell: 9 }, columnWidthsAsistentes, rowHeight, pdfStyles.tableHeader, pdfStyles.tableCell, xMargin);
            } else {
                ensurePageSpace(rowHeight);
                page.drawText('No hay alumnos asistentes con justificante para esta clase.', { x: xMargin, y: currentY, ...pdfStyles.summaryText });
                currentY -= rowHeight;
            }
            currentY -= 5; // Small space before summary

            // Class Summary
            ensurePageSpace(rowHeight * 3);
            page.drawText(`Total Alumnos en Clase: ${claseData.totalEnClase}`, { x: xMargin, y: currentY, ...pdfStyles.summaryText });
            currentY -= 15;
            page.drawText(`Total Asistentes (con justificante): ${claseData.asistentesEnClase}`, { x: xMargin, y: currentY, ...pdfStyles.summaryText });
            currentY -= 15;
            page.drawText(`Total No Asistentes (sin justificante o no entregado): ${noAsistentesEnClase}`, { x: xMargin, y: currentY, ...pdfStyles.summaryText });
            currentY -= 25; // Space before next class or overall summary
        }

        // Overall Summary
        ensurePageSpace(rowHeight * 4, true);
        page.drawText('Resumen General de la Excursión', { x: xMargin, y: currentY, ...pdfStyles.header });
        currentY -= 20;
        page.drawText(`Total General Alumnos: ${totalGeneralAlumnos}`, { x: xMargin, y: currentY, ...pdfStyles.boldSummaryText });
        currentY -= 15;
        page.drawText(`Total General Asistentes (con justificante): ${totalGeneralAsistentes}`, { x: xMargin, y: currentY, ...pdfStyles.boldSummaryText });
        currentY -= 15;
        page.drawText(`Total General No Asistentes: ${totalGeneralNoAsistentes}`, { x: xMargin, y: currentY, ...pdfStyles.boldSummaryText });
        
        const pdfBytes = await pdfDocLib.save();
        res.contentType('application/pdf');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error(`Error en GET /api/excursiones/${excursionId}/participaciones/reporte_pagos (nuevo reporte asistencia):`, error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al generar el reporte de asistencia y justificantes." });
    }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ usuario: req.user });
});

// Gestión de Usuarios (Solo Dirección)
app.get('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') return res.status(403).json({ error: 'No autorizado.' });
    try {
        const usuarios = await dbAllAsync("SELECT u.id, u.email, u.nombre_completo, u.rol, c.id as clase_asignada_id, c.nombre_clase as clase_asignada_nombre FROM usuarios u LEFT JOIN clases c ON u.id = c.tutor_id ORDER BY u.nombre_completo");
        res.json({ usuarios });
    } catch (error) { res.status(500).json({ error: "Error obteniendo usuarios: " + error.message }); }
});

app.post('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado. Solo el rol DIRECCION puede crear usuarios.' });
    }

    const { email, nombre_completo, password, rol } = req.body;

    if (!email || !nombre_completo || !password || !rol) {
        return res.status(400).json({ error: "Email, nombre_completo, password y rol son requeridos." });
    }

    const allowedRolesToCreate = ['TUTOR', 'TESORERIA'];
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

        const result = await dbRunAsync(
            "INSERT INTO usuarios (email, nombre_completo, password_hash, rol) VALUES (?, ?, ?, ?)",
            [normalizedEmail, nombre_completo.trim(), password_hash, rol]
        );

        const nuevoUsuario = await dbGetAsync(
            "SELECT id, email, nombre_completo, rol FROM usuarios WHERE id = ?",
            [result.lastID]
        );
        
        res.status(201).json(nuevoUsuario);

    } catch (error) {
        console.error("Error en POST /api/usuarios:", error.message);
        if (error.message && error.message.includes("UNIQUE constraint failed: usuarios.email")) {
             return res.status(409).json({ error: "El email proporcionado ya está en uso (error de BD)." });
        }
        res.status(500).json({ error: "Error interno del servidor al crear el usuario." });
    }
});

app.put('/api/usuarios/:id', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado. Solo el rol DIRECCION puede modificar usuarios.' });
    }

    const userIdToUpdate = parseInt(req.params.id);
    if (isNaN(userIdToUpdate)) {
        return res.status(400).json({ error: "ID de usuario inválido." });
    }

    const { email, nombre_completo, rol: newRol } = req.body;

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
        
        const allowedRolesToUpdate = ['TUTOR', 'TESORERIA']; 
        if (!allowedRolesToUpdate.includes(userToUpdate.rol) && userToUpdate.rol !== null && userToUpdate.rol !== 'COORDINACION') {
             return res.status(403).json({ error: `Solo se pueden modificar usuarios con roles ${allowedRolesToUpdate.join(', ')} o COORDINACION (para cambiarlo a otro rol).` });
        }


        let updateFields = [];
        let updateParams = [];
        
        const newValues = { 
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
            newValues.email = normalizedEmail; 
        }

        if (trimmedNombre !== undefined && trimmedNombre !== userToUpdate.nombre_completo) {
            updateFields.push("nombre_completo = ?");
            updateParams.push(trimmedNombre);
            newValues.nombre_completo = trimmedNombre; 
        }

        if (newRol !== undefined && newRol !== userToUpdate.rol) {
            const validNewRoles = ['TUTOR', 'TESORERIA']; 
            if (!validNewRoles.includes(newRol)) {
                return res.status(400).json({ error: `Nuevo rol inválido. Roles permitidos para asignación: ${validNewRoles.join(', ')}.` });
            }
            if (userToUpdate.rol === 'TUTOR' && newRol !== 'TUTOR') {
                await dbRunAsync("UPDATE clases SET tutor_id = NULL WHERE tutor_id = ?", [userIdToUpdate]);
            }
            updateFields.push("rol = ?");
            updateParams.push(newRol);
            newValues.rol = newRol; 
        }


        if (updateFields.length > 0) {
            updateParams.push(userIdToUpdate);
            const sqlUpdate = `UPDATE usuarios SET ${updateFields.join(", ")} WHERE id = ?`;
            await dbRunAsync(sqlUpdate, updateParams);
        }
        
        const usuarioActualizadoParaRespuesta = {
            id: newValues.id,
            email: newValues.email,
            nombre_completo: newValues.nombre_completo,
            rol: newValues.rol
        };
        res.json(usuarioActualizadoParaRespuesta);

    } catch (error) {
        console.error(`Error en PUT /api/usuarios/${userIdToUpdate}:`, error.message);
        if (error.message.includes("UNIQUE constraint failed: usuarios.email")) {
             return res.status(409).json({ error: "El email proporcionado ya está en uso (error de BD)." });
        }
        res.status(500).json({ error: "Error interno del servidor al actualizar el usuario." });
    }
});

app.delete('/api/usuarios/:id', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado. Solo el rol DIRECCION puede eliminar usuarios.' });
    }

    const userIdToDelete = parseInt(req.params.id);
    if (isNaN(userIdToDelete)) {
        return res.status(400).json({ error: "ID de usuario inválido." });
    }
    
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

        res.status(200).json({ message: "Usuario eliminado exitosamente." }); 

    } catch (error) {
        console.error(`Error en DELETE /api/usuarios/${userIdToDelete}:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al eliminar el usuario." });
    }
});

app.get('/api/usuarios/tutores', authenticateToken, async (req, res) => {
    try {
        const tutores = await dbAllAsync("SELECT id, nombre_completo FROM usuarios WHERE rol = 'TUTOR' ORDER BY nombre_completo ASC");
        res.json({ tutores });
    } catch (error) {
        console.error("Error en GET /api/usuarios/tutores:", error.message);
        res.status(500).json({ error: "Error interno del servidor al obtener la lista de tutores." });
    }
});

// Gestión de Clases
app.get('/api/clases', authenticateToken, async (req, res) => {
    try {
        let sql = `SELECT c.id, c.nombre_clase, c.tutor_id, c.ciclo_id, u.nombre_completo as nombre_tutor, u.email as email_tutor
                   FROM clases c LEFT JOIN usuarios u ON c.tutor_id = u.id`;
        const params = [];
        sql += " ORDER BY c.nombre_clase ASC";
        const clases = await dbAllAsync(sql, params);
        res.json({ clases });
    } catch (error) { 
        console.error("Error en GET /api/clases:", error.message, error.stack);
        res.status(500).json({ error: "Error obteniendo clases: " + error.message });
    }
});

app.post('/api/clases', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado.' });
    }

    const { nombre_clase, tutor_id } = req.body;

    if (!nombre_clase || typeof nombre_clase !== 'string' || nombre_clase.trim() === '') {
        return res.status(400).json({ error: "El nombre de la clase es obligatorio y debe ser un texto." });
    }
    const nombreClaseNormalizado = nombre_clase.trim().toUpperCase();

    try {
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
            const claseDelTutor = await dbGetAsync("SELECT id, nombre_clase FROM clases WHERE tutor_id = ?", [idTutorNum]);
            if (claseDelTutor) {
                return res.status(409).json({ error: `El tutor seleccionado ya está asignado a la clase '${claseDelTutor.nombre_clase}'.` });
            }
            tutorValidoId = idTutorNum;
        }

        const result = await dbRunAsync("INSERT INTO clases (nombre_clase, tutor_id) VALUES (?, ?)", [nombreClaseNormalizado, tutorValidoId]);
        const nuevaClase = await dbGetAsync("SELECT c.id, c.nombre_clase, c.tutor_id, u.nombre_completo as nombre_tutor, u.email as email_tutor FROM clases c LEFT JOIN usuarios u ON c.tutor_id = u.id WHERE c.id = ?", [result.lastID]);
        
        res.status(201).json({ message: "Clase creada exitosamente", clase: nuevaClase });

    } catch (error) {
        console.error("Error en POST /api/clases:", error.message);
        if (error.message.includes("UNIQUE constraint failed: clases.nombre_clase")) { 
             return res.status(409).json({ error: `La clase '${nombreClaseNormalizado}' ya existe.` });
        }
        res.status(500).json({ error: "Error interno del servidor al crear la clase." });
    }
});

app.put('/api/clases/:id', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado.' });
    }

    const claseId = parseInt(req.params.id);
    const { nombre_clase, tutor_id } = req.body;

    if (isNaN(claseId)) {
        return res.status(400).json({ error: "ID de clase inválido." });
    }
    if (!nombre_clase || typeof nombre_clase !== 'string' || nombre_clase.trim() === '') {
        return res.status(400).json({ error: "El nombre de la clase es obligatorio." });
    }
    const nombreClaseNormalizado = nombre_clase.trim().toUpperCase();

    try {
        const claseActual = await dbGetAsync("SELECT id, tutor_id FROM clases WHERE id = ?", [claseId]);
        if (!claseActual) {
            return res.status(404).json({ error: "Clase no encontrada para editar." });
        }

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
            const claseDelTutor = await dbGetAsync("SELECT id, nombre_clase FROM clases WHERE tutor_id = ? AND id != ?", [idTutorNum, claseId]);
            if (claseDelTutor) {
                return res.status(409).json({ error: `El tutor seleccionado ya está asignado a la clase '${claseDelTutor.nombre_clase}'.` });
            }
            tutorValidoId = idTutorNum;
        }
        
        await dbRunAsync("UPDATE clases SET nombre_clase = ?, tutor_id = ? WHERE id = ?", [nombreClaseNormalizado, tutorValidoId, claseId]);
        
        const claseActualizada = await dbGetAsync("SELECT c.id, c.nombre_clase, c.tutor_id, u.nombre_completo as nombre_tutor, u.email as email_tutor FROM clases c LEFT JOIN usuarios u ON c.tutor_id = u.id WHERE c.id = ?", [claseId]);
        
        res.json({ message: "Clase actualizada exitosamente", clase: claseActualizada });

    } catch (error) {
        console.error(`Error en PUT /api/clases/${claseId}:`, error.message);
         if (error.message.includes("UNIQUE constraint failed: clases.nombre_clase")) { 
             return res.status(409).json({ error: `Ya existe otra clase con el nombre '${nombreClaseNormalizado}'.` });
        }
        res.status(500).json({ error: "Error interno del servidor al actualizar la clase." });
    }
});

app.delete('/api/clases/:id', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado.' });
    }
    const claseId = parseInt(req.params.id);

    if (isNaN(claseId)) {
        return res.status(400).json({ error: "ID de clase inválido." });
    }

    try {
        const alumnosEnClase = await dbGetAsync("SELECT COUNT(*) as count FROM alumnos WHERE clase_id = ?", [claseId]);
        if (alumnosEnClase.count > 0) {
            return res.status(409).json({ error: `No se puede eliminar la clase porque tiene ${alumnosEnClase.count} alumnos asignados. Elimine o reasigne los alumnos primero.`});
        }

        const result = await dbRunAsync("DELETE FROM clases WHERE id = ?", [claseId]);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Clase no encontrada para eliminar." });
        }
        res.status(200).json({ message: "Clase eliminada exitosamente." });
    } catch (error) {
        console.error(`Error en DELETE /api/clases/${claseId}:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al eliminar la clase." });
    }
});

// Gestión de Alumnos
app.get('/api/alumnos', authenticateToken, async (req, res) => {
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
        res.json({ alumnos });

    } catch (error) {
        console.error("Error en GET /api/alumnos:", error.message);
        res.status(500).json({ error: "Error obteniendo alumnos: " + error.message });
    }
});

app.post('/api/alumnos/importar_csv', authenticateToken, async (req, res) => {
    const { clase_id, csv_data } = req.body;
    
    if (!clase_id || !csv_data) {
        return res.status(400).json({ error: "Se requiere clase_id y csv_data." });
    }

    const idClaseNum = parseInt(clase_id);
    if (isNaN(idClaseNum)) {
        return res.status(400).json({ error: "clase_id inválido." });
    }

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

    try {
        const claseDb = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [idClaseNum]);
        if (!claseDb) {
            return res.status(404).json({ error: `La clase con ID ${idClaseNum} no existe.` });
        }
    } catch (e) {
        console.error("Error verificando la clase en POST /api/alumnos/importar_csv:", e.message);
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
                erroresEnLineas.push({ linea: i + 1, dato: contenidoCampo, error: "Formato incorrecto (se esperaba 'Apellidos, Nombre')" });
            }
            continue; 
        }

        if (nombre && apellidos) {
            const nombreCompletoFinal = `${nombre} ${apellidos}`; 
            const apellidosOrden = apellidos; 
            promesasDeInsercion.push(
                dbGetAsync("SELECT id FROM alumnos WHERE lower(nombre_completo) = lower(?) AND clase_id = ?", [nombreCompletoFinal.toLowerCase(), idClaseNum])
                .then(alumnoExistente => {
                    if (alumnoExistente) {
                        alumnosOmitidos++;
                    } else {
                        return dbRunAsync("INSERT INTO alumnos (nombre_completo, apellidos_para_ordenar, clase_id) VALUES (?, ?, ?)", [nombreCompletoFinal, apellidosOrden, idClaseNum])
                            .then(() => {
                                alumnosImportados++;
                            });
                    }
                })
                .catch(errIns => {
                    console.error(`Error procesando alumno ${nombreCompletoFinal} en importación CSV: ${errIns.message}`);
                    erroresEnLineas.push({ linea: i + 1, dato: contenidoCampo, error: errIns.message });
                })
            );
        } else {
            erroresEnLineas.push({ linea: i + 1, dato: contenidoCampo, error: "Nombre o apellidos vacíos tras procesar." });
        }
    }

    try {
        await Promise.all(promesasDeInsercion);
        res.json({
            message: "Proceso de importación CSV completado.",
            importados: alumnosImportados,
            omitidos_duplicados: alumnosOmitidos,
            lineas_con_error: erroresEnLineas.length,
            detalles_errores: erroresEnLineas
        });
    } catch (errorGeneral) {
        console.error("Error general durante el proceso de importación CSV:", errorGeneral);
        res.status(500).json({ error: "Error interno durante la importación masiva." });
    }
});

app.post('/api/alumnos', authenticateToken, async (req, res) => {
    const { nombre, apellidos, clase_id } = req.body;

   if (!nombre || !apellidos || !clase_id) { 
    return res.status(400).json({ error: "Nombre, apellidos y clase_id son requeridos." });
    }
    const idClaseNum = parseInt(clase_id);
    if (isNaN(idClaseNum)) {
        return res.status(400).json({ error: "clase_id inválido." });
    }
    const nombre_completo_a_guardar = `${nombre} ${apellidos}`;
    const apellidos_para_ordenar_a_guardar = apellidos;
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
        const claseDb = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [idClaseNum]);
        if (!claseDb) {
            return res.status(404).json({ error: `La clase con ID ${idClaseNum} no existe.` });
        }

        const alumnoExistente = await dbGetAsync("SELECT id FROM alumnos WHERE lower(nombre_completo) = lower(?) AND clase_id = ?", [nombre_completo_a_guardar.toLowerCase(), idClaseNum]);
        if (alumnoExistente) {
            return res.status(409).json({ error: `El alumno '${nombre_completo_a_guardar}' ya existe en la clase seleccionada.`});
        }

        const result = await dbRunAsync("INSERT INTO alumnos (nombre_completo, apellidos_para_ordenar, clase_id) VALUES (?, ?, ?)", [nombre_completo_a_guardar, apellidos_para_ordenar_a_guardar, idClaseNum]);
        const nuevoAlumno = await dbGetAsync("SELECT a.id, a.nombre_completo, a.clase_id, c.nombre_clase FROM alumnos a JOIN clases c ON a.clase_id = c.id WHERE a.id = ?", [result.lastID]);
        res.status(201).json({ message: "Alumno creado exitosamente", alumno: nuevoAlumno });
    } catch (error) {
        console.error("Error en POST /api/alumnos:", error.message);
        res.status(500).json({ error: "Error creando alumno: " + error.message });
    }
});

app.put('/api/alumnos/:id', authenticateToken, async (req, res) => {
    const alumnoId = parseInt(req.params.id);
    if (isNaN(alumnoId)) {
        return res.status(400).json({ error: "ID de alumno inválido." });
    }

    const { nombre, apellidos, clase_id: nueva_clase_id_str } = req.body;

    if (!nombre || !apellidos) { 
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

        if (!puedeEditar) { 
            return res.status(403).json({ error: "No tiene permisos para modificar este alumno o asignarlo a la clase especificada." });
        }
        
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
        res.json({ message: "Alumno actualizado exitosamente", alumno: alumnoActualizado });

    } catch (error) {
        console.error(`Error en PUT /api/alumnos/${alumnoId}:`, error.message);
        if (error.message.includes("UNIQUE constraint failed")) { 
             return res.status(409).json({ error: "Error de constraint: nombre de alumno duplicado en la clase." });
        }
        res.status(500).json({ error: "Error interno del servidor al actualizar el alumno." });
    }
});

app.delete('/api/alumnos/:id', authenticateToken, async (req, res) => {
    const alumnoId = parseInt(req.params.id);
    if (isNaN(alumnoId)) {
        return res.status(400).json({ error: "ID de alumno inválido." });
    }

    try {
        const alumno = await dbGetAsync("SELECT id, clase_id FROM alumnos WHERE id = ?", [alumnoId]);
        if (!alumno) {
            return res.status(404).json({ error: "Alumno no encontrado." });
        }

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
        
        const result = await dbRunAsync("DELETE FROM alumnos WHERE id = ?", [alumnoId]);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Alumno no encontrado para eliminar (posiblemente ya eliminado)." });
        }

        res.status(200).json({ message: "Alumno eliminado exitosamente." });

    } catch (error) {
        console.error(`Error en DELETE /api/alumnos/${alumnoId}:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al eliminar el alumno." });
    }
});

// Gestión de Excursiones
app.post('/api/excursiones', authenticateToken, async (req, res) => {
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
        coste_excursion_alumno = 0,
        numero_autobuses,
        coste_por_autobus,
        coste_entradas_individual,
        coste_actividad_global
    } = req.body;
    let { para_clase_id, notas_excursion: notas_excursion_raw } = req.body; 

    const creada_por_usuario_id = req.user.id;

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
        if (field.value === undefined || field.value === null || field.value === '') {
            return res.status(400).json({ error: `El campo '${field.name}' es obligatorio y no puede estar vacío.` });
        }
    }

    if (vestimenta !== 'Uniforme' && vestimenta !== 'Chándal') {
        return res.status(400).json({ error: "El campo 'vestimenta' debe ser 'Uniforme' o 'Chándal'." });
    }
    if (transporte !== 'Autobús' && transporte !== 'Andando') {
        return res.status(400).json({ error: "El campo 'transporte' debe ser 'Autobús' o 'Andando'." });
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fecha_excursion)) {
        return res.status(400).json({ error: "Formato de fecha_excursion inválido. Use YYYY-MM-DD." });
    }

    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(hora_salida) || !timeRegex.test(hora_llegada)) {
        return res.status(400).json({ error: "Formato de hora_salida o hora_llegada inválido. Use HH:MM." });
    }
    
    if (coste_excursion_alumno !== undefined && (typeof coste_excursion_alumno !== 'number' || coste_excursion_alumno < 0)) {
        return res.status(400).json({ error: "coste_excursion_alumno debe ser un número no negativo." });
    }

    const newNumericFields = {
        numero_autobuses,
        coste_por_autobus,
        coste_entradas_individual,
        coste_actividad_global
    };

    for (const [fieldName, fieldValue] of Object.entries(newNumericFields)) {
        if (fieldValue !== undefined && fieldValue !== null) { 
            if (typeof fieldValue !== 'number') {
                return res.status(400).json({ error: `El campo '${fieldName}' debe ser un número.` });
            }
            if ( (fieldName === 'numero_autobuses' && fieldValue < 0) || 
                 ( (fieldName === 'coste_por_autobus' || fieldName === 'coste_entradas_individual' || fieldName === 'coste_actividad_global') && fieldValue < 0) ) {
                 return res.status(400).json({ error: `El campo '${fieldName}' no puede ser negativo.` });
            }
            if (fieldName === 'numero_autobuses' && !Number.isInteger(fieldValue)) {
                return res.status(400).json({ error: `El campo '${fieldName}' debe ser un número entero.` });
            }
        }
    }
    
    let finalParaClaseId = null; 

    if (req.user.rol === 'TUTOR') {
        if (!req.user.claseId) {
            return res.status(403).json({ error: "Tutor no asignado a ninguna clase. No puede crear excursiones." });
        }

        if (para_clase_id === null) { 
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
        } else { 
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
                console.error("Error verificando clase en POST /api/excursiones:", dbError.message);
                return res.status(500).json({ error: "Error interno al verificar la clase de destino." });
            }
        } else {
            finalParaClaseId = null; 
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
            finalParaClaseId = null; 
        }
    } else {
        return res.status(403).json({ error: "Rol no autorizado para crear excursiones." });
    }

    const sqlInsert = `
        INSERT INTO excursiones (
            nombre_excursion, fecha_excursion, lugar, hora_salida, hora_llegada,
            coste_excursion_alumno, vestimenta, transporte, justificacion_texto,
            actividad_descripcion, notas_excursion, creada_por_usuario_id, para_clase_id,
            numero_autobuses, coste_por_autobus, coste_entradas_individual, coste_actividad_global
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const paramsInsert = [
        nombre_excursion, fecha_excursion, lugar, hora_salida, hora_llegada, 
        coste_excursion_alumno, vestimenta, transporte, justificacion_texto, 
        actividad_descripcion, notas_excursion ? notas_excursion : null, 
        creada_por_usuario_id, finalParaClaseId,
        newNumericFields.numero_autobuses !== undefined ? newNumericFields.numero_autobuses : null,
        newNumericFields.coste_por_autobus !== undefined ? newNumericFields.coste_por_autobus : null,
        newNumericFields.coste_entradas_individual !== undefined ? newNumericFields.coste_entradas_individual : null,
        newNumericFields.coste_actividad_global !== undefined ? newNumericFields.coste_actividad_global : null
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
        res.status(201).json(nuevaExcursion);
    } catch (error) {
        console.error("Error en POST /api/excursiones:", error.message);
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

app.get('/api/excursiones', authenticateToken, async (req, res) => {
    let sql;
    const params = [];

    try {
        if (req.user.rol === 'DIRECCION' || req.user.rol === 'TESORERIA') {
            sql = `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
                   FROM excursiones e 
                   JOIN usuarios u ON e.creada_por_usuario_id = u.id 
                   LEFT JOIN clases c ON e.para_clase_id = c.id`;
        } else if (req.user.rol === 'TUTOR') {
            if (!req.user.claseId) {
                return res.json({ excursiones: [] }); 
            }
            sql = `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
                   FROM excursiones e 
                   JOIN usuarios u ON e.creada_por_usuario_id = u.id 
                   LEFT JOIN clases c ON e.para_clase_id = c.id`; 
            
            let whereClauses = ["(e.para_clase_id IS NULL OR e.para_clase_id = ?)"];
            params.push(req.user.claseId);

            const cicloClaseIds = await getTutorCicloClaseIds(req.user.claseId);

            if (cicloClaseIds && cicloClaseIds.length > 0) {
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
                   WHERE e.para_clase_id IS NULL`; 
            if (assignedClaseIds.length > 0) {
                const placeholders = assignedClaseIds.map(() => '?').join(',');
                sql += ` OR e.para_clase_id IN (${placeholders})`;
                params.push(...assignedClaseIds);
            }
        } else {
            return res.status(403).json({ error: "Rol no autorizado para ver excursiones." });
        }
        
        sql += " ORDER BY e.fecha_excursion DESC, e.id DESC";
        let excursiones = await dbAllAsync(sql, params);

        if (excursiones && excursiones.length > 0) {
            excursiones = await Promise.all(excursiones.map(async (excursion) => {
                const scopeDetails = await getExcursionScopeDetails(excursion, dbGetAsync);
                return { ...excursion, ...scopeDetails };
            }));
        }
        
        res.json({ excursiones });

    } catch (error) {
        console.error("Error en GET /api/excursiones:", error.message);
        res.status(500).json({ error: "Error interno del servidor al obtener las excursiones." });
    }
});

app.get('/api/excursiones/:id', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.id);
    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }

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

        let canAccess = false;
        if (req.user.rol === 'DIRECCION' || req.user.rol === 'TESORERIA') { 
            canAccess = true;
        } else if (req.user.rol === 'TUTOR') {
            if (!req.user.claseId && excursion.para_clase_id !== null) {
                 return res.status(403).json({ error: "Tutor sin clase asignada no puede ver excursiones específicas de clase." });
            }
            if (excursion.para_clase_id === null || excursion.para_clase_id === req.user.claseId) {
                canAccess = true;
            } else {
                const cicloClaseIds = req.user.claseId ? await getTutorCicloClaseIds(req.user.claseId) : [];
                if (cicloClaseIds && cicloClaseIds.includes(excursion.para_clase_id)) {
                    canAccess = true;
                }
            }
        } else if (req.user.rol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            if (excursion.para_clase_id === null || (excursion.para_clase_id && assignedClaseIds.includes(excursion.para_clase_id))) {
                canAccess = true;
            }
        }

        if (!canAccess) {
            return res.status(403).json({ error: "No tiene permisos para ver esta excursión." });
        }

        const scopeDetails = await getExcursionScopeDetails(excursion, dbGetAsync);
        const excursionConScope = { ...excursion, ...scopeDetails };

        res.json(excursionConScope);
    } catch (error) {
        console.error(`Error en GET /api/excursiones/${excursionId}:`, error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al obtener la excursión." });
    }
});

app.put('/api/excursiones/:id', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.id);
    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }

    const financialFields = ['numero_autobuses', 'coste_por_autobus', 'coste_entradas_individual', 'coste_actividad_global'];
    const camposActualizablesBase = [ 
        'nombre_excursion', 'fecha_excursion', 'lugar', 'hora_salida', 
        'hora_llegada', 'coste_excursion_alumno', 'vestimenta', 'transporte',
        'justificacion_texto', 'actividad_descripcion', 'notas_excursion', 'para_clase_id',
        ...financialFields
    ];

    try {
        const excursionActual = await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [excursionId]);
        if (!excursionActual) {
            return res.status(404).json({ error: "Excursión no encontrada para actualizar." });
        }

        const receivedUpdatableFields = Object.keys(req.body).filter(key => camposActualizablesBase.includes(key));
        let isFinancialOnlyUpdate = false;
        if (receivedUpdatableFields.length > 0) { 
            isFinancialOnlyUpdate = receivedUpdatableFields.every(field => financialFields.includes(field));
        }

        let puedeEditar = false;
        if ((req.user.rol === 'DIRECCION' || req.user.rol === 'TESORERIA') && isFinancialOnlyUpdate) {
            puedeEditar = true;
        } else if (req.user.rol === 'DIRECCION') {
            puedeEditar = true; 
        } else if (req.user.rol === 'TUTOR') {
            if (!req.user.claseId && excursionActual.para_clase_id !== null && excursionActual.creada_por_usuario_id !== req.user.id) {
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

        let setClauses = [];
        let paramsForUpdate = []; 

        const stringFieldsThatMustNotBeEmptyWhenProvided = [
            'nombre_excursion', 'actividad_descripcion', 'lugar', 'fecha_excursion', 
            'hora_salida', 'hora_llegada', 'vestimenta', 'transporte', 'justificacion_texto'
        ];

        for (const campo of camposActualizablesBase) { 
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

                const newNumericFieldsValidation = {
                    numero_autobuses: { isInteger: true, allowNegative: false },
                    coste_por_autobus: { isInteger: false, allowNegative: false },
                    coste_entradas_individual: { isInteger: false, allowNegative: false },
                    coste_actividad_global: { isInteger: false, allowNegative: false }
                };

                if (newNumericFieldsValidation.hasOwnProperty(campo)) {
                    if (valueToUpdate !== null) { 
                        if (typeof valueToUpdate !== 'number') {
                            return res.status(400).json({ error: `El campo '${campo}' debe ser un número o null.` });
                        }
                        if (!newNumericFieldsValidation[campo].allowNegative && valueToUpdate < 0) {
                            return res.status(400).json({ error: `El campo '${campo}' no puede ser negativo.` });
                        }
                        if (newNumericFieldsValidation[campo].isInteger && !Number.isInteger(valueToUpdate)) {
                            return res.status(400).json({ error: `El campo '${campo}' debe ser un número entero.` });
                        }
                    }
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
                    
                    if (nuevoParaClaseIdNum === null) { 
                        if (excursionActual.creada_por_usuario_id !== req.user.id) {
                            return res.status(403).json({ error: "Tutores solo pueden hacer global una excursión si la crearon ellos mismos." });
                        }
                    } else { 
                        if (!req.user.claseId) { 
                            return res.status(403).json({ error: "Tutor sin clase asignada no puede asignar la excursión a una clase específica." });
                        }
                        const cicloClaseIds = await getTutorCicloClaseIds(req.user.claseId);
                        if (nuevoParaClaseIdNum !== req.user.claseId && !(cicloClaseIds && cicloClaseIds.includes(nuevoParaClaseIdNum))) {
                            return res.status(403).json({ error: "Tutores solo pueden asignar excursiones a su propia clase, a clases de su ciclo, o hacerlas globales (si las crearon)." });
                        }
                    }
                }
                
                if (req.user.rol === 'DIRECCION' && campo === 'para_clase_id' && valueToUpdate !== null) {
                    const claseDestino = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [parseInt(valueToUpdate)]);
                    if (!claseDestino) {
                        return res.status(400).json({ error: `La clase de destino con ID ${valueToUpdate} no existe.` });
                    }
                } else if (req.user.rol === 'COORDINACION' && campo === 'para_clase_id' && valueToUpdate !== null) {
                    const idClaseNum = parseInt(valueToUpdate);
                     if (isNaN(idClaseNum)) { 
                        return res.status(400).json({ error: "ID de para_clase_id inválido para coordinador." });
                    }
                    const assignedClaseIds = await getCoordinadorClases(req.user.id);
                    if (!assignedClaseIds.includes(idClaseNum)) {
                         return res.status(403).json({ error: "Coordinadores solo pueden asignar excursiones a una de sus clases asignadas." });
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
        res.json(excursionActualizada);

    } catch (error) {
        console.error(`Error en PUT /api/excursiones/${excursionId}:`, error.message);
        if (error.message.includes("FOREIGN KEY constraint failed") && error.message.includes("clases")) {
             return res.status(400).json({ error: "La clase especificada (para_clase_id) no existe." });
        }
        res.status(500).json({ error: "Error interno del servidor al actualizar la excursión." });
    }
});

// Nuevo endpoint para generar PDF de información general de la excursión
app.get('/api/excursiones/:excursion_id/info_pdf', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.excursion_id);
    const { id: userId, rol: userRol, claseId: userClaseId } = req.user;

    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }

    try {
        const robotoRegularBuffer = fs.readFileSync(path.join(__dirname, 'public/assets/fonts/Roboto-Regular.ttf'));
        const robotoBoldBuffer = fs.readFileSync(path.join(__dirname, 'public/assets/fonts/Roboto-Bold.ttf'));
        
        const excursion = await dbGetAsync(
            `SELECT nombre_excursion, actividad_descripcion, lugar, fecha_excursion, 
                    hora_salida, hora_llegada, vestimenta, transporte, 
                    justificacion_texto, coste_excursion_alumno, notas_excursion,
                    para_clase_id, creada_por_usuario_id 
             FROM excursiones 
             WHERE id = ?`,
            [excursionId]
        );

        if (!excursion) {
            return res.status(404).json({ error: "Excursión no encontrada." });
        }

        // Authorization Logic (similar to GET /api/excursiones/:id)
        let canAccess = false;
        if (userRol === 'DIRECCION' || userRol === 'TESORERIA') {
            canAccess = true;
        } else if (userRol === 'TUTOR') {
            if (!userClaseId && excursion.para_clase_id !== null) {
                // Tutor sin clase no puede ver excursiones específicas de clase (a menos que sea global)
            } else if (excursion.para_clase_id === null || excursion.para_clase_id === userClaseId) {
                canAccess = true;
            } else {
                const cicloClaseIds = userClaseId ? await getTutorCicloClaseIds(userClaseId) : [];
                if (cicloClaseIds && cicloClaseIds.includes(excursion.para_clase_id)) {
                    canAccess = true;
                }
            }
        } else if (userRol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(userId); // Assuming getCoordinadorClases is available
            if (excursion.para_clase_id === null || (excursion.para_clase_id && assignedClaseIds.includes(excursion.para_clase_id))) {
                canAccess = true;
            }
        }

        if (!canAccess) {
            return res.status(403).json({ error: "No tiene permisos para ver la información de esta excursión." });
        }

        // PDF Generation with pdf-lib
        const pdfDocLib = await PDFDocument.create();
        pdfDocLib.registerFontkit(fontkit); // Register fontkit
        
        const robotoFont = await pdfDocLib.embedFont(robotoRegularBuffer);
        const robotoBoldFont = await pdfDocLib.embedFont(robotoBoldBuffer);
        console.log("DEBUG info_pdf: Embedded robotoFont (from TTF):", typeof robotoFont, Object.keys(robotoFont || {}));
        console.log("DEBUG info_pdf: Embedded robotoBoldFont (from TTF):", typeof robotoBoldFont, Object.keys(robotoBoldFont || {}));
        
        const page = pdfDocLib.addPage(PageSizes.A4);
        const { width, height } = page.getSize();

        const styles = {
            mainTitle: { font: robotoBoldFont, size: 22, color: rgb(0,0,0) },
            fieldLabel: { font: robotoBoldFont, size: 12, color: rgb(0.2, 0.2, 0.2) },
            fieldValue: { font: robotoFont, size: 12, color: rgb(0.33, 0.33, 0.33) }
        };
        
        const xMargin = 50;
        const fieldMaxWidth = width - (2 * xMargin);
        const lineHeight = 15;
        let currentY = height - 50;

        const titleText = excursion.nombre_excursion;
        const titleWidth = styles.mainTitle.font.widthOfTextAtSize(titleText, styles.mainTitle.size);
        page.drawText(titleText, {
            x: (width - titleWidth) / 2,
            y: currentY,
            ...styles.mainTitle
        });
        currentY -= styles.mainTitle.size + 20;

        currentY = drawFieldWithWrapping(page, xMargin, currentY, 'Descripción de la Actividad:', excursion.actividad_descripcion || 'No especificada', { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, fieldMaxWidth, lineHeight);
        currentY = drawFieldWithWrapping(page, xMargin, currentY, 'Lugar:', excursion.lugar || 'No especificado', { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, fieldMaxWidth, lineHeight);
        currentY = drawFieldWithWrapping(page, xMargin, currentY, 'Fecha:', excursion.fecha_excursion ? new Date(excursion.fecha_excursion).toLocaleDateString('es-ES') : 'No especificada', { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, fieldMaxWidth, lineHeight);

        page.drawText('Hora de Salida:', { x: xMargin, y: currentY, ...styles.fieldLabel });
        page.drawText(excursion.hora_salida || 'No especificada', { x: xMargin, y: currentY - (styles.fieldLabel.size + 2), ...styles.fieldValue });
        
        const secondColumnX = xMargin + (fieldMaxWidth / 2) + 20;
        page.drawText('Hora de Llegada:', { x: secondColumnX, y: currentY, ...styles.fieldLabel });
        page.drawText(excursion.hora_llegada || 'No especificada', { x: secondColumnX, y: currentY - (styles.fieldLabel.size + 2), ...styles.fieldValue });
        currentY -= styles.fieldLabel.size + 2 + styles.fieldValue.size + 10;

        currentY = drawFieldWithWrapping(page, xMargin, currentY, 'Coste por Alumno:', `${(excursion.coste_excursion_alumno || 0).toFixed(2).replace('.', ',')} €`, { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, fieldMaxWidth, lineHeight);
        currentY = drawFieldWithWrapping(page, xMargin, currentY, 'Vestimenta Requerida:', excursion.vestimenta || 'No especificada', { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, fieldMaxWidth, lineHeight);
        currentY = drawFieldWithWrapping(page, xMargin, currentY, 'Medio de Transporte:', excursion.transporte || 'No especificado', { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, fieldMaxWidth, lineHeight);
        currentY = drawFieldWithWrapping(page, xMargin, currentY, 'Justificación Pedagógica:', excursion.justificacion_texto || 'No especificada', { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, fieldMaxWidth, lineHeight);

        if (excursion.notas_excursion && excursion.notas_excursion.trim() !== '') {
            currentY -= 10; 
            currentY = drawFieldWithWrapping(page, xMargin, currentY, 'Notas Adicionales:', excursion.notas_excursion, { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, fieldMaxWidth, lineHeight);
        }
        
        const pdfBytes = await pdfDocLib.save();
        res.contentType('application/pdf');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error(`Error en GET /api/excursiones/${excursionId}/info_pdf:`, error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al generar el PDF de información." });
    }
});


app.delete('/api/excursiones/:id', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.id);
    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }

    try {
        const excursion = await dbGetAsync("SELECT id, creada_por_usuario_id, para_clase_id FROM excursiones WHERE id = ?", [excursionId]);
        if (!excursion) {
            return res.status(404).json({ error: "Excursión no encontrada para eliminar." });
        }

        let puedeEliminar = false;
        if (req.user.rol === 'DIRECCION') {
            puedeEliminar = true;
        } else if (req.user.rol === 'TUTOR') {
            if (excursion.creada_por_usuario_id === req.user.id) {
                puedeEliminar = true;
            }
        } else if (req.user.rol === 'COORDINACION') {
            if (excursion.creada_por_usuario_id === req.user.id) {
                puedeEliminar = true;
            }
        }
        if (!puedeEliminar) {
            return res.status(403).json({ error: "No tiene permisos para eliminar esta excursión." });
        }

        const participaciones = await dbGetAsync("SELECT COUNT(*) as count FROM participaciones_excursion WHERE excursion_id = ?", [excursionId]);
        if (participaciones.count > 0) {
            // console.log(`  Excursión ID ${excursionId} tiene ${participaciones.count} participaciones. Serán eliminadas por CASCADE.`);
        }

        const result = await dbRunAsync("DELETE FROM excursiones WHERE id = ?", [excursionId]);
        if (result.changes === 0) {
            return res.status(404).json({ error: "Excursión no encontrada durante el intento de eliminación." });
        }

        res.status(200).json({ message: "Excursión eliminada exitosamente." });

    } catch (error) {
        console.error(`Error en DELETE /api/excursiones/${excursionId}:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al eliminar la excursión." });
    }
});

app.post('/api/excursiones/:id/duplicate', authenticateToken, async (req, res) => {
    const originalExcursionId = parseInt(req.params.id);
    const { target_clase_id } = req.body; 
    const duplicatorUserId = req.user.id;
    const duplicatorUserRol = req.user.rol;
    const duplicatorUserClaseId = req.user.claseId; 

    if (isNaN(originalExcursionId)) {
        return res.status(400).json({ error: "ID de excursión original inválido." });
    }

    try {
        const originalExcursion = await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [originalExcursionId]);
        if (!originalExcursion) {
            return res.status(404).json({ error: "Excursión original no encontrada." });
        }

        let canDuplicate = false;
        if (duplicatorUserRol === 'DIRECCION') {
            canDuplicate = true;
        } else if (duplicatorUserRol === 'TUTOR') {
            if (!duplicatorUserClaseId && originalExcursion.para_clase_id !== null) {
                 return res.status(403).json({ error: "Tutor sin clase asignada no puede duplicar una excursión que originalmente era para una clase específica." });
            }
            if (originalExcursion.para_clase_id === null) { 
                canDuplicate = true;
            } else if (originalExcursion.para_clase_id === duplicatorUserClaseId) { 
                canDuplicate = true;
            } else {
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
                if (!duplicatorUserClaseId) { 
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
            finalParaClaseId = null;
        } else { 
            if (duplicatorUserRol === 'DIRECCION') {
                finalParaClaseId = null; 
            } else if (duplicatorUserRol === 'TUTOR') {
                if (!duplicatorUserClaseId) {
                    if (originalExcursion.para_clase_id !== null) {
                         return res.status(400).json({ error: "Tutor sin clase asignada debe especificar target_clase_id (puede ser nulo para global) si la excursión original era para una clase." });
                    }
                    finalParaClaseId = null; 
                } else {
                    finalParaClaseId = duplicatorUserClaseId; 
                }
            } else if (duplicatorUserRol === 'COORDINACION') {
                 const assignedClaseIds = await getCoordinadorClases(duplicatorUserId);
                if (target_clase_id !== undefined && target_clase_id !== null && String(target_clase_id).trim() !== '') { 
                    const idClaseNum = parseInt(target_clase_id);
                     if (isNaN(idClaseNum)) return res.status(400).json({ error: "target_clase_id (coordinador) inválido." });
                    if (!assignedClaseIds.includes(idClaseNum)) {
                        return res.status(403).json({ error: "Coordinadores solo pueden asignar la excursión duplicada a una de sus clases asignadas." });
                    }
                    finalParaClaseId = idClaseNum;
                } else if (target_clase_id === null || (target_clase_id !== undefined && String(target_clase_id).trim() === '')) { 
                    finalParaClaseId = null;
                } else { 
                    if (originalExcursion.para_clase_id !== null && assignedClaseIds.includes(originalExcursion.para_clase_id)) {
                        finalParaClaseId = originalExcursion.para_clase_id; 
                    } else {
                        finalParaClaseId = null; 
                    }
                }
            }
        }
        
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

        res.status(201).json(excursionDuplicada);

    } catch (error) {
        console.error(`Error en POST /api/excursiones/${originalExcursionId}/duplicate:`, error.message);
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

app.post('/api/excursiones/:id/share', authenticateToken, async (req, res) => {
    const originalExcursionId = parseInt(req.params.id);
    const sharerUserId = req.user.id;
    const { target_usuario_id } = req.body;

    if (isNaN(originalExcursionId)) {
        return res.status(400).json({ error: "ID de excursión original inválido." });
    }

    if (!target_usuario_id || isNaN(parseInt(target_usuario_id))) {
        return res.status(400).json({ error: "target_usuario_id es requerido y debe ser un número." });
    }
    const targetUsuarioIdNum = parseInt(target_usuario_id);

    if (targetUsuarioIdNum === sharerUserId) {
        return res.status(400).json({ error: "No puedes compartir una excursión contigo mismo." });
    }

    try {
        const originalExcursion = await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [originalExcursionId]);
        if (!originalExcursion) {
            return res.status(404).json({ error: "Excursión original no encontrada." });
        }

        let canViewOriginal = false;
        if (req.user.rol === 'DIRECCION') {
            canViewOriginal = true;
        } else if (req.user.rol === 'TUTOR') {
            if (originalExcursion.para_clase_id === null) { 
                canViewOriginal = true;
            } else if (originalExcursion.para_clase_id === req.user.claseId) { 
                 if (!req.user.claseId) { 
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
        
        const targetUser = await dbGetAsync("SELECT id, rol FROM usuarios WHERE id = ?", [targetUsuarioIdNum]);
        if (!targetUser) {
            return res.status(404).json({ error: "Usuario destinatario no encontrado." });
        }
        if (targetUser.rol !== 'TUTOR') {
            return res.status(400).json({ error: "Solo se puede compartir con tutores." });
        }

        const existingShare = await dbGetAsync(
            "SELECT id FROM shared_excursions WHERE original_excursion_id = ? AND shared_by_usuario_id = ? AND shared_with_usuario_id = ? AND status = 'pending'",
            [originalExcursionId, sharerUserId, targetUsuarioIdNum]
        );
        if (existingShare) {
            return res.status(409).json({ error: "Esta excursión ya ha sido compartida con este tutor y está pendiente." });
        }

        const sqlInsertShare = `
            INSERT INTO shared_excursions (original_excursion_id, shared_by_usuario_id, shared_with_usuario_id, status)
            VALUES (?, ?, ?, 'pending')
        `;
        const result = await dbRunAsync(sqlInsertShare, [originalExcursionId, sharerUserId, targetUsuarioIdNum]);
        const newShareId = result.lastID;

        const newShareRecord = await dbGetAsync("SELECT * FROM shared_excursions WHERE id = ?", [newShareId]);

        res.status(201).json(newShareRecord);

    } catch (error) {
        console.error(`Error en POST /api/excursiones/${originalExcursionId}/share:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al compartir la excursión." });
    }
});

app.get('/api/excursiones/shared/pending', authenticateToken, async (req, res) => {
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
        console.error("Error en GET /api/excursiones/shared/pending:", error.message);
        res.status(500).json({ error: "Error interno del servidor al obtener las excursiones compartidas pendientes." });
    }
});

app.post('/api/shared-excursions/:share_id/accept', authenticateToken, async (req, res) => {
    const shareId = parseInt(req.params.share_id);
    const acceptingUserId = req.user.id;
    const acceptingUserClaseId = req.user.claseId;

    if (isNaN(shareId)) {
        return res.status(400).json({ error: "ID de compartición inválido." });
    }

    if (req.user.rol !== 'TUTOR' || !acceptingUserClaseId) {
        return res.status(400).json({ error: "Debes ser un tutor con una clase asignada para aceptar una excursión." });
    }

    try {
        const shareRecord = await dbGetAsync("SELECT * FROM shared_excursions WHERE id = ?", [shareId]);
        if (!shareRecord) {
            return res.status(404).json({ error: "Invitación para compartir no encontrada." });
        }

        if (shareRecord.shared_with_usuario_id !== acceptingUserId) {
            return res.status(403).json({ error: "No estás autorizado para aceptar esta invitación." });
        }
        if (shareRecord.status !== 'pending') {
            return res.status(400).json({ error: `Esta invitación ya ha sido ${shareRecord.status}.` });
        }

        const originalExcursion = await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [shareRecord.original_excursion_id]);
        if (!originalExcursion) {
            return res.status(404).json({ error: "La excursión original asociada a esta compartición ya no existe." });
        }

        const nuevaExcursionData = {
            nombre_excursion: originalExcursion.nombre_excursion, 
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
            creada_por_usuario_id: acceptingUserId, 
            para_clase_id: acceptingUserClaseId    
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

        const sqlUpdateShare = `
            UPDATE shared_excursions 
            SET status = 'accepted', processed_at = datetime('now'), new_excursion_id_on_acceptance = ?
            WHERE id = ?
        `;
        await dbRunAsync(sqlUpdateShare, [newExcursionId, shareId]);

        const acceptedExcursionDetails = await dbGetAsync(
            `SELECT e.*, u.nombre_completo as nombre_creador, c.nombre_clase as nombre_clase_destino 
             FROM excursiones e 
             JOIN usuarios u ON e.creada_por_usuario_id = u.id 
             LEFT JOIN clases c ON e.para_clase_id = c.id 
             WHERE e.id = ?`,
            [newExcursionId]
        );
        
        res.status(200).json(acceptedExcursionDetails);

    } catch (error) {
        console.error(`Error en POST /api/shared-excursiones/${shareId}/accept:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al aceptar la excursión compartida." });
    }
});

app.post('/api/shared-excursions/:share_id/decline', authenticateToken, async (req, res) => {
    const shareId = parseInt(req.params.share_id);
    const decliningUserId = req.user.id;

    if (isNaN(shareId)) {
        return res.status(400).json({ error: "ID de compartición inválido." });
    }

    if (req.user.rol !== 'TUTOR') {
        return res.status(403).json({ error: "Acceso denegado. Solo para tutores." });
    }
    
    try {
        const shareRecord = await dbGetAsync("SELECT * FROM shared_excursions WHERE id = ?", [shareId]);
        if (!shareRecord) {
            return res.status(404).json({ error: "Invitación para compartir no encontrada." });
        }

        if (shareRecord.shared_with_usuario_id !== decliningUserId) {
            return res.status(403).json({ error: "No estás autorizado para rechazar esta invitación." });
        }
        if (shareRecord.status !== 'pending') {
            return res.status(400).json({ error: `Esta invitación ya ha sido ${shareRecord.status}.` });
        }

        const sqlUpdateShare = `
            UPDATE shared_excursions 
            SET status = 'declined', processed_at = datetime('now')
            WHERE id = ?
        `;
        await dbRunAsync(sqlUpdateShare, [shareId]);
        
        res.status(200).json({ message: "Excursión compartida rechazada." });

    } catch (error) {
        console.error(`Error en POST /api/shared-excursiones/${shareId}/decline:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al rechazar la excursión compartida." });
    }
});

// Gestión de Participaciones
app.get('/api/excursiones/:excursion_id/participaciones', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.excursion_id);
    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }

    try {
        const currentExcursion = await dbGetAsync("SELECT id, para_clase_id FROM excursiones WHERE id = ?", [excursionId]);
        if (!currentExcursion) {
            return res.status(404).json({ error: "Excursión no encontrada." });
        }

        if (req.user.rol === 'TUTOR') {
            if (currentExcursion.para_clase_id !== null && currentExcursion.para_clase_id !== req.user.claseId) {
                return res.status(403).json({ error: "Tutores solo pueden ver participaciones de excursiones globales o de su propia clase." });
            }
            if (currentExcursion.para_clase_id !== null && !req.user.claseId) { 
                 return res.status(403).json({ error: "Tutor no asignado a una clase no puede ver participaciones de excursiones de clase." });
            }
        } else if (req.user.rol === 'COORDINACION') {
            const assignedClaseIds = await getCoordinadorClases(req.user.id);
            if (currentExcursion.para_clase_id !== null && !assignedClaseIds.includes(currentExcursion.para_clase_id)) {
                return res.status(403).json({ error: "Coordinador no tiene acceso a participaciones de esta excursión específica de clase." });
            }
        }


        let baseAlumnosSql;
        const baseAlumnosParams = [];

        if (currentExcursion.para_clase_id !== null) { 
            baseAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                              FROM alumnos a JOIN clases c ON a.clase_id = c.id 
                              WHERE a.clase_id = ?`;
            baseAlumnosParams.push(currentExcursion.para_clase_id);
        } else { 
            const viewClaseId = req.query.view_clase_id ? parseInt(req.query.view_clase_id) : null;

            if (req.user.rol === 'TUTOR') {
                if (!req.user.claseId) return res.json({ alumnosParticipaciones: [], resumen: {} }); 
                baseAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                                  FROM alumnos a JOIN clases c ON a.clase_id = c.id 
                                  WHERE a.clase_id = ?`;
                baseAlumnosParams.push(req.user.claseId); 
            } else if (req.user.rol === 'DIRECCION') {
                if (viewClaseId) { 
                    baseAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                                      FROM alumnos a JOIN clases c ON a.clase_id = c.id 
                                      WHERE a.clase_id = ?`;
                    baseAlumnosParams.push(viewClaseId);
                } else { 
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

        if (req.user.rol === 'DIRECCION' && currentExcursion.para_clase_id === null && !req.query.view_clase_id && alumnosBase.length === 0) {
            const todosLosAlumnosSql = `SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, a.clase_id, c.nombre_clase 
                                       FROM alumnos a JOIN clases c ON a.clase_id = c.id
                                       ORDER BY c.nombre_clase ASC, a.apellidos_para_ordenar ASC, a.nombre_completo ASC`;
            alumnosBase = await dbAllAsync(todosLosAlumnosSql, []); 
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
        resumen.resumenPorClase = Object.values(resumen.resumenPorClase);


        res.json({ alumnosParticipaciones, resumen });

    } catch (error) {
        console.error(`Error en GET /api/excursiones/${excursionId}/participaciones:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al obtener las participaciones." });
    }
});

app.post('/api/participaciones', authenticateToken, async (req, res) => {
    const {
        excursion_id, alumno_id, autorizacion_firmada, fecha_autorizacion,
        pago_realizado, cantidad_pagada = 0, fecha_pago, notas_participacion
    } = req.body;

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
            RETURNING id;`; 

        const paramsUpsert = [
            alumno_id, excursion_id,
            autorizacion_firmada === undefined ? 'No' : autorizacion_firmada, 
            fecha_autorizacion || null,
            pago_realizado === undefined ? 'No' : pago_realizado, 
            cantidad_pagada === undefined ? 0 : cantidad_pagada, 
            fecha_pago || null,
            notas_participacion || null
        ];
        
        await dbRunAsync(sqlUpsert.replace("RETURNING id;", ""), paramsUpsert); 

        const participacionGuardada = await dbGetAsync(
            "SELECT * FROM participaciones_excursion WHERE alumno_id = ? AND excursion_id = ?",
            [alumno_id, excursion_id]
        );
        
        res.status(200).json(participacionGuardada);

    } catch (error) {
        console.error("Error en POST /api/participaciones:", error.message);
         if (error.message.includes("UNIQUE constraint failed")) { 
            return res.status(500).json({ error: "Error de concurrencia o constraint no manejado por UPSERT." });
        } else if (error.message.includes("FOREIGN KEY constraint failed")) {
            return res.status(400).json({ error: "Error de clave foránea: el alumno o la excursión no existen." });
        }
        res.status(500).json({ error: "Error interno del servidor al guardar la participación." });
    }
});

// Eliminar Participación
app.delete('/api/participaciones/:participacion_id', authenticateToken, async (req, res) => {
    const participacionId = parseInt(req.params.participacion_id);
    const { id: userId, rol: userRol, claseId: userClaseId } = req.user;

    if (isNaN(participacionId)) {
        return res.status(400).json({ error: "ID de participación inválido." });
    }

    try {
        const participacion = await dbGetAsync(
            `SELECT p.*, a.clase_id as alumno_clase_id, e.para_clase_id as excursion_para_clase_id, e.creada_por_usuario_id as excursion_creada_por_id
             FROM participaciones_excursion p
             JOIN alumnos a ON p.alumno_id = a.id
             JOIN excursiones e ON p.excursion_id = e.id
             WHERE p.id = ?`,
            [participacionId]
        );

        if (!participacion) {
            return res.status(404).json({ error: "Participación no encontrada." });
        }

        let puedeEliminar = false;

        if (userRol === 'DIRECCION') {
            puedeEliminar = true;
        } else if (userRol === 'TUTOR') {
            if (!userClaseId) {
                return res.status(403).json({ error: "Tutor no asignado a una clase. No puede eliminar participaciones." });
            }
            if (participacion.alumno_clase_id === userClaseId) {
                if (participacion.excursion_para_clase_id === null || participacion.excursion_para_clase_id === userClaseId) {
                    puedeEliminar = true;
                } else {
                    const cicloClasesDelTutor = await getTutorCicloClaseIds(userClaseId);
                    if (cicloClasesDelTutor.includes(participacion.excursion_para_clase_id)) {
                        puedeEliminar = true;
                    }
                }
            }
        }
        // Tesorería no tiene permisos para eliminar según los requisitos.

        if (!puedeEliminar) {
            return res.status(403).json({ error: "No tiene permisos para eliminar esta participación." });
        }

        const result = await dbRunAsync("DELETE FROM participaciones_excursion WHERE id = ?", [participacionId]);

        if (result.changes === 0) {
            // Esto podría ocurrir si se eliminó justo después de la verificación de existencia.
            // Considerarlo un éxito o un 404 es una opción. Para simplicidad, se considera éxito.
            return res.status(200).json({ message: "Participación no encontrada o ya eliminada, ninguna acción realizada." });
        }

        res.status(200).json({ message: "Participación eliminada exitosamente." });

    } catch (error) {
        console.error(`Error en DELETE /api/participaciones/${participacionId}:`, error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al eliminar la participación." });
    }
});

// Endpoint de Dashboard
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => {
    try {
        const dashboardData = {
            mensaje: "Resumen del dashboard"
        };

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
                    
                    const autorizadosNo = totalInscritos - autorizadosSi;
                    const pagadoNo = totalInscritos - (pagadoSi + pagadoParcial);


                    dashboardData.resumenProximaExcursionSuClase = {
                        nombreExcursion: proximaExcursionParaResumen.nombre_excursion,
                        fecha: proximaExcursionParaResumen.fecha_excursion,
                        excursionId: excursionIdParaResumen,
                        totalInscritos: totalInscritos,
                        autorizadosSi: autorizadosSi,
                        autorizadosNo: autorizadosNo, 
                        pagadoSi: pagadoSi,
                        pagadoParcial: pagadoParcial,
                        pagadoNo: pagadoNo 
                    };
                }
            }
        } else if (req.user.rol === 'DIRECCION') {
            const totalAlumnosRow = await dbGetAsync("SELECT COUNT(*) as count FROM alumnos");
            dashboardData.totalAlumnos = totalAlumnosRow ? totalAlumnosRow.count : 0;

            const totalExcursionesRow = await dbGetAsync("SELECT COUNT(*) as count FROM excursiones");
            dashboardData.totalExcursiones = totalExcursionesRow ? totalExcursionesRow.count : 0;

            const sqlProximasExcursionesDireccion = `
                SELECT id, nombre_excursion, fecha_excursion, para_clase_id, creada_por_usuario_id
                FROM excursiones 
                WHERE para_clase_id IS NULL AND fecha_excursion >= date('now') 
                ORDER BY fecha_excursion ASC`;
            let proximasExcursionesDireccion = await dbAllAsync(sqlProximasExcursionesDireccion);

            if (proximasExcursionesDireccion && proximasExcursionesDireccion.length > 0) {
                proximasExcursionesDireccion = await Promise.all(proximasExcursionesDireccion.map(async (excursion) => {
                    const scopeDetails = await getExcursionScopeDetails(excursion, dbGetAsync);
                    return { ...excursion, ...scopeDetails };
                }));
            }
            dashboardData.proximasExcursiones = proximasExcursionesDireccion;

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
            // console.warn(`Rol no reconocido para resumen específico del dashboard: ${req.user.rol}`);
        }

        res.json(dashboardData);

    } catch (error) {
        console.error("Error en GET /api/dashboard/summary:", error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al generar el resumen del dashboard.", detalles: error.message });
    }
});

// Rutas de Tesorería
app.get('/api/tesoreria/ingresos-por-clase', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'TESORERIA' && req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'Acceso no autorizado. Se requiere rol TESORERIA o DIRECCION.' });
    }

    try {
        const clases = await dbAllAsync("SELECT id, nombre_clase FROM clases ORDER BY nombre_clase ASC");
        const resultado = [];

        for (const clase of clases) {
            const sqlIngresos = `
                SELECT SUM(p.cantidad_pagada) as total_ingresos
                FROM participaciones_excursion p
                JOIN alumnos a ON p.alumno_id = a.id
                WHERE a.clase_id = ?
            `;
            const ingresosRow = await dbGetAsync(sqlIngresos, [clase.id]);
            
            resultado.push({
                clase_id: clase.id,
                nombre_clase: clase.nombre_clase,
                total_ingresos_clase: ingresosRow && ingresosRow.total_ingresos !== null ? ingresosRow.total_ingresos : 0
            });
        }

        res.json({ ingresos_por_clase: resultado });

    } catch (error) {
        console.error("Error en GET /api/tesoreria/ingresos-por-clase:", error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al calcular ingresos por clase.", detalles: error.message });
    }
});

app.get('/api/tesoreria/excursion-financial-details/:excursion_id', authenticateToken, async (req, res) => {
    const excursionId = parseInt(req.params.excursion_id);

    if (req.user.rol !== 'TESORERIA' && req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'Acceso no autorizado. Se requiere rol TESORERIA o DIRECCION.' });
    }

    if (isNaN(excursionId)) {
        return res.status(400).json({ error: "ID de excursión inválido." });
    }

    try {
        const excursion = await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [excursionId]);
        if (!excursion) {
            return res.status(404).json({ error: "Excursión no encontrada." });
        }

        const recaudadoRow = await dbGetAsync(
            "SELECT SUM(cantidad_pagada) as total FROM participaciones_excursion WHERE excursion_id = ?",
            [excursionId]
        );
        excursion.total_dinero_recaudado = recaudadoRow && recaudadoRow.total !== null ? recaudadoRow.total : 0;

        const asistentesRow = await dbGetAsync(
            "SELECT COUNT(DISTINCT alumno_id) as count FROM participaciones_excursion WHERE excursion_id = ? AND autorizacion_firmada = 'Sí'",
            [excursionId]
        );
        excursion.numero_alumnos_asistentes = asistentesRow ? asistentesRow.count : 0;

        excursion.coste_total_autobuses = (excursion.numero_autobuses || 0) * (excursion.coste_por_autobus || 0);
        excursion.coste_total_participacion_entradas = (excursion.coste_entradas_individual || 0) * excursion.numero_alumnos_asistentes;
        excursion.coste_total_actividad_global = excursion.coste_actividad_global || 0;
        
        const totalCostes = excursion.coste_total_autobuses + excursion.coste_total_participacion_entradas + excursion.coste_total_actividad_global;
        excursion.balance_excursion = excursion.total_dinero_recaudado - totalCostes;

        res.json(excursion);

    } catch (error) {
        console.error(`Error en GET /api/tesoreria/excursion-financial-details/${excursionId}:`, error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al obtener detalles financieros de la excursión.", detalles: error.message });
    }
});

async function getFinancialDetailsForExcursion(excursionId, existingExcursionData = null) {
    const excursion = existingExcursionData || await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [excursionId]);
    if (!excursion) {
        throw new Error(`Excursion with ID ${excursionId} not found for financial calculation.`);
    }

    const recaudadoRow = await dbGetAsync(
        "SELECT SUM(cantidad_pagada) as total FROM participaciones_excursion WHERE excursion_id = ?",
        [excursionId]
    );
    const total_dinero_recaudado = recaudadoRow && recaudadoRow.total !== null ? recaudadoRow.total : 0;

    const asistentesRow = await dbGetAsync(
        "SELECT COUNT(DISTINCT alumno_id) as count FROM participaciones_excursion WHERE excursion_id = ? AND autorizacion_firmada = 'Sí'",
        [excursionId]
    );
    const numero_alumnos_asistentes = asistentesRow ? asistentesRow.count : 0;

    const coste_total_autobuses = (excursion.numero_autobuses || 0) * (excursion.coste_por_autobus || 0);
    const coste_total_participacion_entradas = (excursion.coste_entradas_individual || 0) * numero_alumnos_asistentes;
    const coste_total_actividad_global = excursion.coste_actividad_global || 0;
    
    const totalCostes = coste_total_autobuses + coste_total_participacion_entradas + coste_total_actividad_global;
    const balance_excursion = total_dinero_recaudado - totalCostes;

    return {
        total_dinero_recaudado,
        numero_alumnos_asistentes,
        coste_total_autobuses,
        coste_total_participacion_entradas,
        coste_total_actividad_global,
        balance_excursion
    };
}

app.get('/api/tesoreria/excursiones-pendientes', authenticateToken, async (req, res) => {
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
        let excursionesPendientes = await dbAllAsync(sql);

        if (excursionesPendientes && excursionesPendientes.length > 0) {
            excursionesPendientes = await Promise.all(excursionesPendientes.map(async (excursion) => {
                const scopeDetails = await getExcursionScopeDetails(excursion, dbGetAsync);
                return { ...excursion, ...scopeDetails };
            }));
        }

        res.json({ excursiones_pendientes: excursionesPendientes });
    } catch (error) {
        console.error("Error en GET /api/tesoreria/excursiones-pendientes:", error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al obtener excursiones pendientes.", detalles: error.message });
    }
});

app.get('/api/tesoreria/excursiones-pasadas', authenticateToken, async (req, res) => {
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
        for (let excursion of excursionesPasadas) { 
            const financialDetails = await getFinancialDetailsForExcursion(excursion.id, excursion);
            const scopeDetails = await getExcursionScopeDetails(excursion, dbGetAsync); 
            augmentedExcursiones.push({
                ...excursion, 
                ...scopeDetails, 
                ...financialDetails 
            });
        }

        res.json({ excursiones_pasadas: augmentedExcursiones });
    } catch (error) {
        console.error("Error en GET /api/tesoreria/excursiones-pasadas:", error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al obtener excursiones pasadas.", detalles: error.message });
    }
});

// Gestión de Ciclos
app.get('/api/ciclos', authenticateToken, async (req, res) => {
    try {
        const ciclos = await dbAllAsync("SELECT id, nombre_ciclo FROM ciclos ORDER BY id ASC");
        res.json({ ciclos });
    } catch (error) {
        console.error("Error en GET /api/ciclos:", error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al obtener los ciclos.", detalles: error.message });
    }
});

// Nuevo endpoint para Informe General de Secretaría en PDF
app.get('/api/secretaria/informe_general_pdf', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION' && req.user.rol !== 'TESORERIA') {
        return res.status(403).json({ error: 'Acceso no autorizado. Se requiere rol DIRECCION o TESORERIA.' });
    }

    try {
        const pdfDocLib = await PDFDocument.create();
        pdfDocLib.registerFontkit(fontkit);

        const robotoRegularBuffer = fs.readFileSync(path.join(__dirname, 'public/assets/fonts/Roboto-Regular.ttf'));
        const robotoBoldBuffer = fs.readFileSync(path.join(__dirname, 'public/assets/fonts/Roboto-Bold.ttf'));
        
        const robotoFont = await pdfDocLib.embedFont(robotoRegularBuffer);
        const robotoBoldFont = await pdfDocLib.embedFont(robotoBoldBuffer);

        let page = pdfDocLib.addPage(PageSizes.A4);
        const { width, height } = page.getSize();
        let currentY = height - 40;
        const xMargin = 40;
        const contentWidth = width - (2 * xMargin);
        const rowHeight = 18;

        const pdfStyles = {
            mainTitle: { font: robotoBoldFont, size: 18, color: rgb(0,0,0) },
            sectionTitle: { font: robotoBoldFont, size: 14, color: rgb(0.1, 0.1, 0.1) },
            tableHeader: { font: robotoBoldFont, size: 10, color: rgb(0,0,0) },
            tableCell: { font: robotoFont, size: 9, color: rgb(0.1, 0.1, 0.1) },
            text: { font: robotoFont, size: 10, color: rgb(0,0,0) }
        };
        
        const ensurePageSpace = (neededSpace, isNewSection = false) => {
            if (currentY - neededSpace < 40 || (isNewSection && currentY - neededSpace < 80) ) {
                page = pdfDocLib.addPage(PageSizes.A4);
                currentY = height - 40;
                return true; 
            }
            return false; 
        };

        // PDF Title
        page.drawText('Informe General de Secretaría', { x: xMargin, y: currentY, ...pdfStyles.mainTitle });
        currentY -= (pdfStyles.mainTitle.size + 20);

        // Section 1: Resumen Financiero de Excursiones
        ensurePageSpace(pdfStyles.sectionTitle.size + rowHeight * 2, true);
        page.drawText('Resumen Financiero de Excursiones', { x: xMargin, y: currentY, ...pdfStyles.sectionTitle });
        currentY -= (pdfStyles.sectionTitle.size + 10);

        const excursionesDb = await dbAllAsync("SELECT * FROM excursiones ORDER BY fecha_excursion DESC");
        const excursionFinancialData = [];
        for (const excursion of excursionesDb) {
            const financialDetails = await getFinancialDetailsForExcursion(excursion.id, excursion);
            const totalCostes = financialDetails.coste_total_autobuses + 
                                financialDetails.coste_total_participacion_entradas + 
                                financialDetails.coste_total_actividad_global;
            excursionFinancialData.push({
                nombre_excursion: excursion.nombre_excursion,
                fecha_excursion: new Date(excursion.fecha_excursion).toLocaleDateString('es-ES'),
                total_recaudado: financialDetails.total_dinero_recaudado.toFixed(2),
                costes_totales: totalCostes.toFixed(2),
                balance: financialDetails.balance_excursion.toFixed(2)
            });
        }

        const columnsExcursiones = [
            { header: 'Excursión', key: 'nombre_excursion', alignment: 'left'},
            { header: 'Fecha', key: 'fecha_excursion', alignment: 'left'},
            { header: 'Recaudado (€)', key: 'total_recaudado', alignment: 'right'},
            { header: 'Costes (€)', key: 'costes_totales', alignment: 'right'},
            { header: 'Balance (€)', key: 'balance', alignment: 'right'}
        ];
        const columnWidthsExcursiones = [175, 70, 90, 90, 90]; // Sum: 515, to fit contentWidth 515

        if (excursionFinancialData.length > 0) {
            ensurePageSpace(rowHeight * (excursionFinancialData.length +1));
            currentY = await drawTable(pdfDocLib, page, currentY, excursionFinancialData, columnsExcursiones, 
                                       { normal: robotoFont, bold: robotoBoldFont }, { header: 10, cell: 9 }, 
                                       columnWidthsExcursiones, rowHeight, pdfStyles.tableHeader, pdfStyles.tableCell, xMargin);
        } else {
            ensurePageSpace(rowHeight);
            page.drawText('No hay datos financieros de excursiones disponibles.', { x: xMargin, y: currentY, ...pdfStyles.text });
            currentY -= rowHeight;
        }
        currentY -= 20; // Space after section

        // Section 2: Listado de Tutores
        ensurePageSpace(pdfStyles.sectionTitle.size + rowHeight * 2, true);
        page.drawText('Listado de Tutores', { x: xMargin, y: currentY, ...pdfStyles.sectionTitle });
        currentY -= (pdfStyles.sectionTitle.size + 10);
        
        const tutoresDb = await dbAllAsync("SELECT id, nombre_completo, email FROM usuarios WHERE rol = 'TUTOR' ORDER BY nombre_completo ASC");
        const clasesDb = await dbAllAsync("SELECT id, nombre_clase, tutor_id FROM clases");
        const clasesMap = clasesDb.reduce((map, clase) => {
            if (clase.tutor_id) map[clase.tutor_id] = clase.nombre_clase;
            return map;
        }, {});

        const tutorListData = tutoresDb.map(tutor => ({
            nombre_tutor: tutor.nombre_completo,
            email_tutor: tutor.email,
            clase_asignada: clasesMap[tutor.id] || 'No asignada'
        }));

        const columnsTutores = [
            { header: 'Nombre Tutor', key: 'nombre_tutor', alignment: 'left'},
            { header: 'Email', key: 'email_tutor', alignment: 'left'},
            { header: 'Clase Asignada', key: 'clase_asignada', alignment: 'left'}
        ];
        const columnWidthsTutores = [195, 200, 120]; // Sum: 515, to fit contentWidth 515

        if (tutorListData.length > 0) {
            ensurePageSpace(rowHeight * (tutorListData.length +1));
            currentY = await drawTable(pdfDocLib, page, currentY, tutorListData, columnsTutores,
                                   { normal: robotoFont, bold: robotoBoldFont }, { header: 10, cell: 9 },
                                   columnWidthsTutores, rowHeight, pdfStyles.tableHeader, pdfStyles.tableCell, xMargin);
        } else {
            ensurePageSpace(rowHeight);
            page.drawText('No hay tutores registrados.', { x: xMargin, y: currentY, ...pdfStyles.text });
            currentY -= rowHeight;
        }

        const pdfBytes = await pdfDocLib.save();
        res.contentType('application/pdf');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error("Error en GET /api/secretaria/informe_general_pdf:", error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al generar el informe general PDF.", detalles: error.message });
    }
});


// Conexión a la Base de Datos e Inicio del Servidor
const DB_FILE_PATH_FINAL = path.join(__dirname, "database.db");

db = new sqlite3.Database(DB_FILE_PATH_FINAL, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error("Error FATAL al conectar con la base de datos:", err.message);
        process.exit(1);
    }
    console.log('Conectado a la base de datos SQLite (database.db).');
    db.run("PRAGMA foreign_keys = ON;", (fkErr) => {
        if (fkErr) {
            console.error("Error habilitando claves foráneas en SQLite:", fkErr.message);
        } else {
            console.log("Claves foráneas habilitadas en SQLite.");
        }

        app.listen(PORT, () => {
            console.log("====================================================");
            console.log(`      Servidor backend CORRIENDO en http://localhost:${PORT}`);
            console.log(`      Endpoints API disponibles en http://localhost:${PORT}/api`);
            console.log("      Para detener el servidor: Ctrl+C");
            console.log("====================================================");
        });
    });
});

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
