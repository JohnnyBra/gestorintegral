const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
require('dotenv').config();
const JSZip = require('jszip');
const multer = require('multer');
const Papa = require('papaparse');
const axios = require('axios'); // Added axios
const chardet = require('chardet');
const iconvLite = require('iconv-lite');

const fs = require('fs'); 
const { PDFDocument, StandardFonts, rgb, PageSizes } = require('pdf-lib');
const fontkit = require('fontkit');

// console.log("Intentando configurar PdfPrinter.vfs (versión 3 de depuración)..."); // Original pdfmake log

// Removed pdfmake VFS setup and printer initialization

const app = express();
app.use(morgan('dev'));
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

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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
    let participating_scope_name = "N/A"; // Initial default

    // If excursion object is problematic or creada_por_usuario_id is missing (null or undefined)
    if (!excursion) {
        participating_scope_name = "Alcance Indeterminado (Datos excursión ausentes)";
        return { participating_scope_type, participating_scope_name };
    }
    if (excursion.creada_por_usuario_id === null || typeof excursion.creada_por_usuario_id === 'undefined') {
        participating_scope_name = "Alcance Indeterminado (ID creador ausente)";
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
            // Global excursion (para_clase_id is null)
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
                        participating_scope_type = "cycle"; // Default assumption
                        const tutorCycleInfo = await dbGetAsync(
                            `SELECT ci.nombre_ciclo
                             FROM usuarios u
                             JOIN clases cl ON u.id = cl.tutor_id
                             JOIN ciclos ci ON cl.ciclo_id = ci.id
                             WHERE u.id = ?
                             LIMIT 1`,
                             [excursion.creada_por_usuario_id]
                        );

                        if (tutorCycleInfo && tutorCycleInfo.nombre_ciclo) {
                            participating_scope_name = `${tutorCycleInfo.nombre_ciclo} (Ciclo del Tutor)`;
                        } else {
                            // If specific cycle name isn't found, but we know it's a Tutor.
                            participating_scope_name = "Global (Creada por Tutor)";
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
        // If an error occurs, and participating_scope_name is still "N/A", set a generic error scope.
        if (participating_scope_name === "N/A") {
            participating_scope_name = "Error al determinar alcance";
        }
    }

    // Final safety net: if, after all logic, it's still "N/A", but we had a valid excursion object and creator ID, set a generic default.
    // This should ideally not be reached if the logic above is comprehensive.
    if (participating_scope_name === "N/A" && excursion.creada_por_usuario_id) {
        participating_scope_name = "Alcance General (Error Lógico)";
    }

    return { participating_scope_type, participating_scope_name };
}

// Helper function to convert records to CSV
async function recordsToCsv(records, columns) {
    if (!records) return ''; // Handle null or undefined records input

    const escapeCsvValue = (value) => {
        if (value === null || value === undefined) {
            return '';
        }
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    };

    let csvString = columns.join(',') + '\n';

    if (records.length === 0) {
        return csvString; // Return only header if no records
    }

    records.forEach(record => {
        const line = columns.map(col => escapeCsvValue(record[col])).join(',');
        csvString += line + '\n';
    });

    return csvString;
}

// Helper function to draw tables with pdf-lib (re-adding)
async function drawTable(pdfDoc, page, startY, data, columns, fonts, sizes, columnWidths, rowHeight, headerStyle, cellStyle, xStart = 50, logoDetails = null, pageSetup = null) {
    let currentY = startY;
    // const { width, height } = page.getSize(); // Use pageSetup.height if available
    const pageHeight = pageSetup ? pageSetup.height : page.getSize().height;
    const yPageMargin = pageSetup ? pageSetup.yMargin : 40; // Default if not provided
    const pageBottomMargin = pageSetup ? pageSetup.bottomMargin : 40; // Default if not provided
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
        if (currentY - rowHeight < pageBottomMargin) { 
             page = pdfDoc.addPage(PageSizes.A4);
             const { width: newPageWidth } = page.getSize(); // Get width from new page
             const pageHeight = pageSetup ? pageSetup.height : page.getSize().height; // Already here
             const yPageMargin = pageSetup ? pageSetup.yMargin : 40; // Already here

             if (logoDetails && logoDetails.image) {
                page.drawImage(logoDetails.image, {
                    x: newPageWidth - (pageSetup && pageSetup.xMargin ? pageSetup.xMargin : 40) - logoDetails.dims.width, // Adjusted for new page width
                    y: logoDetails.yTop,
                    width: logoDetails.dims.width,
                    height: logoDetails.dims.height,
                });
                currentY = pageHeight - yPageMargin - logoDetails.dims.height - logoDetails.paddingBelow;
             } else {
                currentY = pageHeight - yPageMargin; 
             }
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
    return { currentY, page }; // Return both updated Y and potentially updated page object
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
                SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, c.id as clase_id, c.nombre_clase, p.autorizacion_firmada, p.asistencia
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
                    SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, c.id as clase_id, c.nombre_clase, p.autorizacion_firmada, p.asistencia
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
                        SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, c.id as clase_id, c.nombre_clase, p.autorizacion_firmada, p.asistencia
                        FROM alumnos a
                        JOIN clases c ON a.clase_id = c.id
                        LEFT JOIN participaciones_excursion p ON a.id = p.alumno_id AND p.excursion_id = ?
                        WHERE a.clase_id = ?
                        ORDER BY c.nombre_clase, a.apellidos_para_ordenar, a.nombre_completo`;
                    paramsAlumnosQuery.push(excursionId, viewClaseId);
                } else {
                    // Fetch students from ALL classes
                    sqlAlumnosQuery = `
                        SELECT a.id as alumno_id, a.nombre_completo, a.apellidos_para_ordenar, c.id as clase_id, c.nombre_clase, p.autorizacion_firmada, p.asistencia
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
        let totalGeneralAutorizados = 0; // Renamed from totalGeneralAsistentes
        let totalGeneralPresentes = 0;


        alumnosData.forEach(ad => {
            if (!alumnosPorClase[ad.nombre_clase]) {
                alumnosPorClase[ad.nombre_clase] = {
                    nombre_clase: ad.nombre_clase,
                    alumnos: [],
                    totalEnClase: 0,
                    autorizadosEnClase: 0, // Renamed
                    presentesEnClase: 0    // Added
                };
            }
            const alumnoConEstado = {
                nombre_completo: ad.nombre_completo,
                autorizacion_firmada: ad.autorizacion_firmada || 'No', // Default to 'No' if no participation record
                asistencia: ad.asistencia || 'Pendiente' // Added
            };
            alumnosPorClase[ad.nombre_clase].alumnos.push(alumnoConEstado);
            alumnosPorClase[ad.nombre_clase].totalEnClase++;
            totalGeneralAlumnos++;
            if (alumnoConEstado.autorizacion_firmada === 'Sí') {
                alumnosPorClase[ad.nombre_clase].autorizadosEnClase++;
                totalGeneralAutorizados++;
            }
            if (alumnoConEstado.asistencia === 'Sí') { // New count
                alumnosPorClase[ad.nombre_clase].presentesEnClase++;
                totalGeneralPresentes++;
            }
        });

        const totalGeneralNoAutorizados = totalGeneralAlumnos - totalGeneralAutorizados; // Renamed
        const totalGeneralAusentes = totalGeneralAlumnos - totalGeneralPresentes; // Added

        // 2. PDF Generation (pdf-lib)
        const pdfDocLib = await PDFDocument.create();
        pdfDocLib.registerFontkit(fontkit);

        const robotoRegularBuffer = fs.readFileSync(path.join(__dirname, 'public/assets/fonts/Roboto-Regular.ttf'));
        const robotoBoldBuffer = fs.readFileSync(path.join(__dirname, 'public/assets/fonts/Roboto-Bold.ttf'));
        
        const robotoFont = await pdfDocLib.embedFont(robotoRegularBuffer);
        const robotoBoldFont = await pdfDocLib.embedFont(robotoBoldBuffer);

        // Load logo
        const logoPath = path.join(__dirname, 'public', 'folder', 'logo.jpg');
        let logoImage, logoDims;
        try {
            const logoBuffer = fs.readFileSync(logoPath);
            logoImage = await pdfDocLib.embedJpg(logoBuffer);
            const logoScale = 50 / logoImage.width; // Aim for 50 points width
            logoDims = { width: logoImage.width * logoScale, height: logoImage.height * logoScale };
        } catch (logoError) {
            console.error("Error cargando logo:", logoError.message);
            // No se detiene la generación del PDF, simplemente no habrá logo.
            logoImage = null;
            logoDims = { width: 0, height: 0 };
        }
        
        let page = pdfDocLib.addPage(PageSizes.A4);
        const { width, height } = page.getSize();
        const yPageMargin = 40; // Standard top/bottom margin for the page
        const xMargin = 40;     // Standard left/right margin for content

        // Draw logo on first page
        if (logoImage) {
            page.drawImage(logoImage, {
                x: width - xMargin - logoDims.width,
                y: height - yPageMargin - logoDims.height,
                width: logoDims.width,
                height: logoDims.height,
            });
        }

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
        
        // Initial currentY, adjusted for logo
        let currentY = height - yPageMargin - (logoImage ? logoDims.height : 0) - (logoImage ? 15 : 0); // 15 padding below logo
        const contentWidth = width - (2 * xMargin);
        const rowHeight = 18;
        const pageBottomMargin = 40; // Already defined, ensure it's used in pageSetup

        const pageSetup = { // Define pageSetup here
            width: width,
            height: height,
            xMargin: xMargin,
            yMargin: yPageMargin,
            bottomMargin: pageBottomMargin
        };

        const logoObject = { image: logoImage, dims: logoDims, x: width - xMargin - logoDims.width, yTop: height - yPageMargin - logoDims.height, paddingBelow: 15 };

        const ensurePageSpace = (currentYVal, currentPage, neededSpace, isNewSection = false) => { // Added currentPage
            let localCurrentY = currentYVal;
            let pageToUse = currentPage; // Use passed page

            if (localCurrentY - neededSpace < pageBottomMargin || (isNewSection && localCurrentY - neededSpace < (pageBottomMargin + 40))) { // More space for new section headers
                pageToUse = pdfDocLib.addPage(PageSizes.A4); // Assign to new variable
                const { width: newPageWidthEnsure } = pageToUse.getSize(); // Get width of the new page for ensurePageSpace
                if (logoObject.image) {
                    pageToUse.drawImage(logoObject.image, {
                        x: newPageWidthEnsure - xMargin - logoObject.dims.width, // Use new page's width and xMargin
                        y: logoObject.yTop,
                        width: logoObject.dims.width,
                        height: logoObject.dims.height,
                    });
                }
                localCurrentY = height - yPageMargin - (logoObject.image ? logoObject.dims.height : 0) - (logoObject.image ? logoObject.paddingBelow : 0);
            }
            return { newY: localCurrentY, newPage: pageToUse }; // Return new state
        };
        
        let pageState = ensurePageSpace(currentY, page, pdfStyles.mainTitle.size + pdfStyles.header.size * 2 + 40); // Estimate space for titles
        currentY = pageState.newY;
        page = pageState.newPage;

        // Overall Title
        page.drawText('Listado de Asistencia y Justificantes', { x: xMargin, y: currentY, ...pdfStyles.mainTitle });
        currentY -= 20;
        page.drawText(`Excursión: ${excursion.nombre_excursion}`, { x: xMargin, y: currentY, ...pdfStyles.header });
        currentY -= 18;
        page.drawText(`Fecha: ${new Date(excursion.fecha_excursion).toLocaleDateString('es-ES')}`, { x: xMargin, y: currentY, ...pdfStyles.header });
        currentY -= 25;

        // Columns for the table
        const columnsParticipacion = [
            { header: 'Nombre Alumno', key: 'nombre_completo', alignment: 'left'},
            { header: 'Autorización', key: 'autorizacion_firmada', alignment: 'left'},
            { header: 'Asistencia Real', key: 'asistencia', alignment: 'left'}
        ];
        const columnWidthsParticipacion = [contentWidth * 0.6, contentWidth * 0.2, contentWidth * 0.2];

        // Loop by Class
        const sortedNombresClase = Object.keys(alumnosPorClase).sort();
        for (const nombreClase of sortedNombresClase) {
            const claseData = alumnosPorClase[nombreClase];
            
            pageState = ensurePageSpace(currentY, page, pdfStyles.classHeader.size + 25, true);
            currentY = pageState.newY;
            page = pageState.newPage;

            page.drawText(`Clase: ${claseData.nombre_clase}`, { x: xMargin, y: currentY, ...pdfStyles.classHeader });
            currentY -= (pdfStyles.classHeader.size + 10);

            if (claseData.alumnos.length > 0) {
                const tableDrawResult = await drawTable(
                    pdfDocLib,
                    page,
                    currentY,
                    claseData.alumnos,
                    columnsParticipacion,
                    { normal: robotoFont, bold: robotoBoldFont },
                    { header: 10, cell: 9 },
                    columnWidthsParticipacion,
                    rowHeight,
                    pdfStyles.tableHeader,
                    pdfStyles.tableCell,
                    xMargin,
                    logoObject,
                    pageSetup
                );
                currentY = tableDrawResult.currentY;
                page = tableDrawResult.page;
            } else {
                pageState = ensurePageSpace(currentY, page, rowHeight);
                currentY = pageState.newY;
                page = pageState.newPage;
                page.drawText('No hay alumnos registrados para esta excursión en esta clase.', { x: xMargin, y: currentY, ...pdfStyles.summaryText });
                currentY -= rowHeight;
            }
            currentY -= 10;

            // Per-Class Summary
            pageState = ensurePageSpace(currentY, page, pdfStyles.subheader.size + (rowHeight * 4) + 10 );
            currentY = pageState.newY;
            page = pageState.newPage;
            page.drawText(`Resumen para Clase ${claseData.nombre_clase}:`, { x: xMargin, y: currentY, ...pdfStyles.subheader });
            currentY -= 18;
            page.drawText(`- Total Alumnos en Clase: ${claseData.totalEnClase}`, { x: xMargin + 10, y: currentY, ...pdfStyles.summaryText });
            currentY -= 15;
            page.drawText(`- Total Autorizados (justificante 'Sí'): ${claseData.autorizadosEnClase}`, { x: xMargin + 10, y: currentY, ...pdfStyles.summaryText });
            currentY -= 15;
            page.drawText(`- Total Presentes (Asistencia 'Sí'): ${claseData.presentesEnClase}`, { x: xMargin + 10, y: currentY, ...pdfStyles.summaryText });
            currentY -= 15;
            const ausentesEnClase = claseData.totalEnClase - claseData.presentesEnClase;
            page.drawText(`- Total Ausentes (Asistencia 'No' o 'Pendiente'): ${ausentesEnClase}`, { x: xMargin + 10, y: currentY, ...pdfStyles.summaryText });
            currentY -= 25;
        }

        // Overall Summary (after loop)
        pageState = ensurePageSpace(currentY, page, pdfStyles.header.size + (rowHeight * 4) + 20, true);
        currentY = pageState.newY;
        page = pageState.newPage;

        page.drawText('Resumen General de la Excursión', { x: xMargin, y: currentY, ...pdfStyles.header });
        currentY -= 20;
        page.drawText(`Total General Alumnos: ${totalGeneralAlumnos}`, { x: xMargin, y: currentY, ...pdfStyles.boldSummaryText });
        currentY -= 15;
        page.drawText(`Total General Autorizados (justificante 'Sí'): ${totalGeneralAutorizados}`, { x: xMargin, y: currentY, ...pdfStyles.boldSummaryText });
        currentY -= 15;
        page.drawText(`Total General Presentes (asistencia 'Sí'): ${totalGeneralPresentes}`, { x: xMargin, y: currentY, ...pdfStyles.boldSummaryText });
        currentY -= 15;
        page.drawText(`Total General Ausentes: ${totalGeneralAusentes}`, { x: xMargin, y: currentY, ...pdfStyles.boldSummaryText });
        
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

app.put('/api/auth/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "La contraseña actual y la nueva contraseña son requeridas." });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres." });
    }

    try {
        const user = await dbGetAsync("SELECT password_hash FROM usuarios WHERE id = ?", [userId]);
        if (!user) {
            // Should not happen if token is valid and user exists
            return res.status(404).json({ error: "Usuario no encontrado." });
        }

        const passwordIsValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!passwordIsValid) {
            return res.status(401).json({ error: "La contraseña actual es incorrecta." });
        }

        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        await dbRunAsync("UPDATE usuarios SET password_hash = ? WHERE id = ?", [newPasswordHash, userId]);

        res.status(200).json({ message: "Contraseña actualizada correctamente." });

    } catch (error) {
        console.error(`Error en PUT /api/auth/change-password para usuario ID ${userId}:`, error.message);
        res.status(500).json({ error: "Error interno del servidor al cambiar la contraseña." });
    }
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

    const { email, nombre_completo, rol: newRol, newPassword } = req.body; // Added newPassword

    if (email === undefined && nombre_completo === undefined && newRol === undefined && newPassword === undefined) {
        return res.status(400).json({ error: "Debe proporcionar al menos un campo para actualizar (email, nombre_completo, rol o newPassword)." });
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
             // Allow DIRECCION to change their own email/name if other fields are also being updated, but not password via this route.
            if (newPassword) {
                return res.status(403).json({ error: "No se puede cambiar la contraseña de un usuario con rol DIRECCION o la propia contraseña mediante esta vía. Use la opción 'Cambiar Contraseña' dedicada." });
            }
            // If only email/name/rol for self/other admin, and it's not password, it's an error if those fields are not allowed to be changed by this logic path
            if (userToUpdate.rol === 'DIRECCION' && (newRol || email || nombre_completo) ) {
                 return res.status(403).json({ error: "Los datos de usuarios con rol DIRECCION no se pueden modificar aquí." });
            }
             if (userToUpdate.id === req.user.id && (newRol || email || nombre_completo) ){ // Check if they are trying to change their own non-password details
                 return res.status(403).json({ error: "No puedes modificar tus propios datos (email, nombre, rol) aquí. Contacta a otro administrador." });
             }
        }
        
        // Password change logic for admin changing other non-DIRECCION user's password
        if (newPassword) {
            if (req.user.rol !== 'DIRECCION') {
                return res.status(403).json({ error: "No autorizado para cambiar contraseñas de otros usuarios." });
            }
            if (userToUpdate.id === req.user.id) { // Should be caught above, but as a safeguard
                return res.status(403).json({ error: "Utilice la opción 'Cambiar Contraseña' para su propia cuenta." });
            }
            if (userToUpdate.rol === 'DIRECCION') { // Should be caught above, but as a safeguard
                return res.status(403).json({ error: "No se puede cambiar la contraseña de otro usuario con rol DIRECCION." });
            }
            if (newPassword.length < 8) {
                return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres." });
            }
        }

        const allowedRolesToUpdate = ['TUTOR', 'TESORERIA'];
        if (newRol !== undefined && !allowedRolesToUpdate.includes(newRol) && userToUpdate.rol !== 'COORDINACION') { // If newRol is provided and it's not one of these (and user is not COORD)
             return res.status(400).json({ error: `Rol inválido. Roles permitidos para asignación: ${allowedRolesToUpdate.join(', ')}.` });
        }
        // If userToUpdate.rol is COORDINACION, they can be changed to TUTOR or TESORERIA.
        // If userToUpdate.rol is TUTOR or TESORERIA, they can be changed to another role in allowedRolesToUpdate.
        // This check is now more focused on the validity of the newRol if provided.

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

        if (newPassword && req.user.rol === 'DIRECCION' && userToUpdate.rol !== 'DIRECCION' && userToUpdate.id !== req.user.id) {
            const saltRounds = 10;
            const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
            updateFields.push("password_hash = ?");
            updateParams.push(newPasswordHash);
            // No need to add to newValues as we don't return the hash
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

app.post('/api/alumnos/importar_csv', authenticateToken, upload.single('csvFile'), async (req, res) => {
    const { clase_id } = req.body; // clase_id from FormData
    
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "No se ha subido ningún archivo CSV (csvFile)." });
    }
    if (!clase_id) {
        return res.status(400).json({ error: "Se requiere clase_id." });
    }

    const idClaseNum = parseInt(clase_id);
    if (isNaN(idClaseNum)) {
        return res.status(400).json({ error: "clase_id inválido." });
    }

    // Authorization checks
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

    let csvString;
    const fileBuffer = req.file.buffer;
    try {
        const detectedEncoding = chardet.detect(fileBuffer);
        console.log(`[CSV Import] Detected encoding: ${detectedEncoding}`);
        if (detectedEncoding && !detectedEncoding.toLowerCase().startsWith('utf-8') && iconvLite.encodingExists(detectedEncoding)) {
            csvString = iconvLite.decode(fileBuffer, detectedEncoding);
            console.log(`[CSV Import] Decoded from ${detectedEncoding} to UTF-8 string.`);
        } else {
            csvString = fileBuffer.toString('utf8'); // Fallback to UTF-8
             if (!detectedEncoding || detectedEncoding.toLowerCase().startsWith('utf-8')) {
                console.log("[CSV Import] Decoded as UTF-8 (either detected or fallback).");
            } else {
                console.warn(`[CSV Import] Fallback to UTF-8 decoding, but chardet detected ${detectedEncoding} which iconv-lite might not support or was deemed unreliable.`);
            }
        }
    } catch (encError) {
        console.error("[CSV Import] Error during encoding detection/conversion:", encError);
        return res.status(400).json({ error: "Error al procesar la codificación del archivo CSV. Asegúrese de que sea UTF-8 o un formato ANSI común." });
    }

    let alumnosImportados = 0;
    let alumnosOmitidos = 0;
    let erroresEnLineas = [];
    const promesasDeInsercion = [];

    function limpiarComillasEnvolventes(textoStr) {
        let texto = String(textoStr).trim();
        // PapaParse should handle this, but keeping it as per original instruction for now.
        if (texto.length >= 2 && texto.startsWith('"') && texto.endsWith('"')) {
            texto = texto.substring(1, texto.length - 1).replace(/""/g, '"');
        }
        return texto;
    }

    try {
        const parseResult = Papa.parse(csvString, { skipEmptyLines: true });
        const lineas = parseResult.data;

        for (let i = 0; i < lineas.length; i++) {
            const rowArray = lineas[i];
            if (rowArray.length === 0 || (rowArray.length === 1 && String(rowArray[0]).trim() === '')) {
                continue; // Skip truly empty or effectively empty lines
            }

            // Header check
            if (i === 0 && rowArray.length > 0 &&
                (String(rowArray[0]).toLowerCase().includes('alumno') ||
                 String(rowArray[0]).toLowerCase().includes('apellido') ||
                 String(rowArray[0]).toLowerCase().includes('apellidos')
                )
            ) {
                console.log("[CSV Import] Header row detected and skipped:", rowArray.join(','));
                continue; // Skip header row
            }

            let apellidos = "";
            let nombre = "";

            if (rowArray.length === 1) { // Single column format: "Apellidos, Nombre"
                const singleField = String(rowArray[0]).trim();
                const indiceUltimaComa = singleField.lastIndexOf(',');
                if (indiceUltimaComa > 0 && indiceUltimaComa < singleField.length - 1) {
                    apellidos = limpiarComillasEnvolventes(singleField.substring(0, indiceUltimaComa));
                    nombre = limpiarComillasEnvolventes(singleField.substring(indiceUltimaComa + 1));
                } else {
                    erroresEnLineas.push({ linea: i + 1, dato: singleField, error: "Formato incorrecto (se esperaba 'Apellidos, Nombre' en una columna)" });
                    continue;
                }
            } else if (rowArray.length >= 2) { // Two column format: Apellidos, Nombre
                apellidos = limpiarComillasEnvolventes(rowArray[0]);
                nombre = limpiarComillasEnvolventes(rowArray[1]);
            } else {
                erroresEnLineas.push({ linea: i + 1, dato: rowArray.join(','), error: "Formato de línea no reconocido (ni una ni dos columnas con datos)" });
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
                        erroresEnLineas.push({ linea: i + 1, dato: rowArray.join(','), error: errIns.message });
                    })
                );
            } else {
                erroresEnLineas.push({ linea: i + 1, dato: rowArray.join(','), error: "Nombre o apellidos vacíos tras procesar." });
            }
        }

        await Promise.all(promesasDeInsercion);
        res.json({
            message: "Proceso de importación CSV completado.",
            importados: alumnosImportados,
            omitidos_duplicados: alumnosOmitidos,
            lineas_con_error: erroresEnLineas.length,
            detalles_errores: erroresEnLineas
        });

    } catch (parseError) {
        console.error("[CSV Import] Error parsing CSV string with PapaParse:", parseError);
        res.status(400).json({ error: "Error al parsear el contenido del archivo CSV.", detalles: parseError.message });
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

        // Contar participantes con autorización firmada
        const authCountSql = "SELECT COUNT(*) as count_autorizados FROM participaciones_excursion WHERE excursion_id = ? AND autorizacion_firmada = 'Sí'";
        const authCountResult = await dbGetAsync(authCountSql, [excursionId]);
        excursion.count_autorizados = authCountResult ? authCountResult.count_autorizados : 0;

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
        // Estas rutas ya son relativas a la raíz del proyecto donde se ejecuta server.js
        // No necesitan __dirname si las fuentes están en public/assets/fonts relativo a la raíz
        const robotoRegularBuffer = fs.readFileSync('./public/assets/fonts/Roboto-Regular.ttf');
        const robotoBoldBuffer = fs.readFileSync('./public/assets/fonts/Roboto-Bold.ttf');
        
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
        pdfDocLib.registerFontkit(fontkit); 
        
        const robotoFont = await pdfDocLib.embedFont(robotoRegularBuffer);
        const robotoBoldFont = await pdfDocLib.embedFont(robotoBoldBuffer);

        // Load logo - la ruta ya es relativa al proyecto
        const logoPath = './public/folder/logo.jpg';
        let logoImage, logoDims, logoHeightOnPage = 0;
        try {
            const logoBuffer = fs.readFileSync(logoPath);
            logoImage = await pdfDocLib.embedJpg(logoBuffer);
            // Escalar el logo para que tenga una altura de, por ejemplo, 50 puntos.
            // O un ancho, según preferencia. Aquí usamos ancho 60 para consistencia con otros PDFs.
            const scaleFactor = 60 / logoImage.width; 
            logoDims = { width: logoImage.width * scaleFactor, height: logoImage.height * scaleFactor };
            logoHeightOnPage = logoDims.height;
        } catch (logoError) {
            console.error("Error cargando logo para Info PDF:", logoError.message);
            logoImage = null; // Continuar sin logo si falla
            logoDims = { width: 0, height: 0 };
        }
        
        let page = pdfDocLib.addPage(PageSizes.A4); // Declarar con let para reasignación
        const { width, height } = page.getSize();
        const xMargin = 50; 
        const yPageMargin = 50; 
        const paddingBelowLogo = 15; // Espacio entre el logo y el contenido
        const pageBottomMargin = 50; // Margen inferior de la página

        // Dibujar logo en la primera página (y en nuevas páginas si es necesario)
        if (logoImage) {
            page.drawImage(logoImage, {
                x: width - xMargin - logoDims.width,
                y: height - yPageMargin - logoDims.height,
                width: logoDims.width,
                height: logoDims.height,
            });
        }
        // Ajustar currentY inicial para estar debajo del logo
        let currentY = height - yPageMargin - logoHeightOnPage - (logoImage ? paddingBelowLogo : 0);


        const styles = {
            mainTitle: { font: robotoBoldFont, size: 22, color: rgb(0,0,0) },
            fieldLabel: { font: robotoBoldFont, size: 12, color: rgb(0.2, 0.2, 0.2) },
            fieldValue: { font: robotoFont, size: 12, color: rgb(0.33, 0.33, 0.33) }
        };
        
        const fieldMaxWidth = width - (2 * xMargin);
        const baseLineHeight = 15; // Línea base para texto normal, etiquetas pueden ser más.

        // Helper para gestionar saltos de página y redibujar logo
        const ensurePageSpaceAndDrawLogoIfNeeded = (neededHeight) => {
            if (currentY - neededHeight < pageBottomMargin) {
                page = pdfDocLib.addPage(PageSizes.A4);
                currentY = height - yPageMargin; // Reiniciar Y para la nueva página
                if (logoImage) {
                    page.drawImage(logoImage, {
                        x: width - xMargin - logoDims.width,
                        y: height - yPageMargin - logoDims.height,
                        width: logoDims.width,
                        height: logoDims.height,
                    });
                    currentY -= (logoDims.height + paddingBelowLogo);
                }
            }
        };
        
        // Dibujar Título
        ensurePageSpaceAndDrawLogoIfNeeded(styles.mainTitle.size + 20);
        const titleText = excursion.nombre_excursion;
        const titleWidth = styles.mainTitle.font.widthOfTextAtSize(titleText, styles.mainTitle.size);
        const titleX = titleWidth > fieldMaxWidth ? xMargin : (width - titleWidth) / 2;
        page.drawText(titleText, { x: titleX, y: currentY, ...styles.mainTitle });
        currentY -= (styles.mainTitle.size + 20);


        // Helper modificado para drawFieldWithWrapping que maneje saltos de página y logo
        async function drawFieldWithWrappingInternal(label, value, fonts, fieldStyles, yPos, maxWidth, lineHeight) {
            let localY = yPos;
            const labelText = label;
            const valueText = String(value !== null && value !== undefined ? value : 'No especificado');
            const labelHeight = fieldStyles.label.size + 4; // Etiqueta + pequeño margen inferior

            ensurePageSpaceAndDrawLogoIfNeeded(labelHeight); // Espacio para la etiqueta
            page.drawText(labelText, { 
                x: xMargin, 
                y: localY, 
                font: fieldStyles.label.font, 
                size: fieldStyles.label.size, 
                color: fieldStyles.label.color 
            });
            localY -= labelHeight;

            const valueFont = fieldStyles.value.font;
            const valueSize = fieldStyles.value.size;
            const valueColor = fieldStyles.value.color;
            let words = valueText.split(' ');
            let currentLine = '';
            
            for (let word of words) {
                let testLine = currentLine + (currentLine ? ' ' : '') + word;
                let testWidth = valueFont.widthOfTextAtSize(testLine, valueSize);

                if (testWidth > maxWidth && currentLine) { // La línea actual más la palabra excede el ancho
                    ensurePageSpaceAndDrawLogoIfNeeded(lineHeight);
                    page.drawText(currentLine, { x: xMargin, y: localY, font: valueFont, size: valueSize, color: valueColor });
                    localY -= lineHeight;
                    currentLine = word; // La palabra actual inicia la nueva línea
                } else {
                    currentLine = testLine;
                }
            }
            // Dibujar la última línea o la única línea
            if (currentLine) {
                ensurePageSpaceAndDrawLogoIfNeeded(lineHeight);
                page.drawText(currentLine, { x: xMargin, y: localY, font: valueFont, size: valueSize, color: valueColor });
                localY -= lineHeight;
            }
            return localY - 10; // Espacio adicional después del campo completo
        }

        // Usar el helper interno
        currentY = await drawFieldWithWrappingInternal('Descripción de la Actividad:', excursion.actividad_descripcion, { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, currentY, fieldMaxWidth, baseLineHeight);
        currentY = await drawFieldWithWrappingInternal('Lugar:', excursion.lugar, { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, currentY, fieldMaxWidth, baseLineHeight);
        currentY = await drawFieldWithWrappingInternal('Fecha:', excursion.fecha_excursion ? new Date(excursion.fecha_excursion).toLocaleDateString('es-ES') : 'No especificada', { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, currentY, fieldMaxWidth, baseLineHeight);

        // Campos en dos columnas (Hora Salida y Llegada)
        ensurePageSpaceAndDrawLogoIfNeeded(styles.fieldLabel.size + styles.fieldValue.size + 10);
        page.drawText('Hora de Salida:', { x: xMargin, y: currentY, ...styles.fieldLabel });
        page.drawText(excursion.hora_salida || 'No especificada', { x: xMargin, y: currentY - (styles.fieldLabel.size + 2), ...styles.fieldValue });
        
        const secondColumnX = xMargin + (fieldMaxWidth / 2) + 10; // Ajustar X para segunda columna
        page.drawText('Hora de Llegada:', { x: secondColumnX, y: currentY, ...styles.fieldLabel });
        page.drawText(excursion.hora_llegada || 'No especificada', { x: secondColumnX, y: currentY - (styles.fieldLabel.size + 2), ...styles.fieldValue });
        currentY -= (styles.fieldLabel.size + 2 + styles.fieldValue.size + 10); // Mayor espacio después de línea de dos columnas

        currentY = await drawFieldWithWrappingInternal('Coste por Alumno:', `${(excursion.coste_excursion_alumno || 0).toFixed(2).replace('.', ',')} €`, { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, currentY, fieldMaxWidth, baseLineHeight);
        currentY = await drawFieldWithWrappingInternal('Vestimenta Requerida:', excursion.vestimenta, { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, currentY, fieldMaxWidth, baseLineHeight);
        currentY = await drawFieldWithWrappingInternal('Medio de Transporte:', excursion.transporte, { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, currentY, fieldMaxWidth, baseLineHeight);
        currentY = await drawFieldWithWrappingInternal('Justificación Pedagógica:', excursion.justificacion_texto, { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, currentY, fieldMaxWidth, baseLineHeight);

        if (excursion.notas_excursion && excursion.notas_excursion.trim() !== '') {
            currentY -= 5; // Reducir un poco el espacio antes de notas si hay
            currentY = await drawFieldWithWrappingInternal('Notas Adicionales:', excursion.notas_excursion, { normal: robotoFont, bold: robotoBoldFont }, {label: styles.fieldLabel, value: styles.fieldValue}, currentY, fieldMaxWidth, baseLineHeight);
        }
        
        const pdfBytes = await pdfDocLib.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Info_Excursion_${excursion.nombre_excursion.replace(/\s+/g, '_')}.pdf`);
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
                        p.pago_realizado, p.cantidad_pagada, p.fecha_pago, p.notas_participacion, p.asistencia
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
                asistencia: participacion?.asistencia || 'Pendiente',
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
        pago_realizado, cantidad_pagada = 0, fecha_pago, notas_participacion, asistencia
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

    const validAsistencia = ['Sí', 'No', 'Pendiente'];
    if (asistencia !== undefined && !validAsistencia.includes(asistencia)) {
        return res.status(400).json({ error: "asistencia debe ser 'Sí', 'No', o 'Pendiente'." });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (fecha_autorizacion && !dateRegex.test(fecha_autorizacion)) return res.status(400).json({ error: "Formato de fecha_autorizacion inválido. Use YYYY-MM-DD."});
    if (fecha_pago && !dateRegex.test(fecha_pago)) return res.status(400).json({ error: "Formato de fecha_pago inválido. Use YYYY-MM-DD."});

    // Inside POST /api/participaciones, before the main try block for upsert
    if (req.body.asistencia !== undefined) {
        const excursionDetails = await dbGetAsync("SELECT fecha_excursion FROM excursiones WHERE id = ?", [excursion_id]);
        if (!excursionDetails) {
            return res.status(404).json({ error: "Excursión no encontrada para validar fecha de asistencia." });
        }

        const fechaExcursion = new Date(excursionDetails.fecha_excursion);
        const hoy = new Date();
        // Ajustar 'hoy' para que solo compare fechas, ignorando la hora.
        hoy.setHours(0, 0, 0, 0);
        // Lo mismo para fechaExcursion si viene con hora (aunque BBDD suele guardar solo fecha YYYY-MM-DD)
        fechaExcursion.setHours(0,0,0,0);


        if (hoy < fechaExcursion) {
            // Need to check if asistencia is actually changing for an existing record
            const existingParticipacion = await dbGetAsync(
                "SELECT asistencia FROM participaciones_excursion WHERE alumno_id = ? AND excursion_id = ?",
                [alumno_id, excursion_id]
            );
            if (existingParticipacion && existingParticipacion.asistencia !== req.body.asistencia) {
                return res.status(403).json({ error: "La asistencia solo se puede modificar el día de la excursión o después." });
            }
            // If it's a new record, and asistencia is being set (even to 'Pendiente' explicitly by client)
            // before excursion date, this check might be too restrictive.
            // The requirement is "modificar", so this mainly applies to changes from 'Pendiente' to 'Sí'/'No'
            // or between 'Sí' and 'No'.
            // If it's a new record being created, and an 'asistencia' value is provided, this check applies.
            // If 'asistencia' is not provided in req.body for a new record, it defaults to 'Pendiente' and this check is skipped.
            if (!existingParticipacion && req.body.asistencia !== 'Pendiente') {
                 return res.status(403).json({ error: "La asistencia solo se puede registrar como 'Sí' o 'No' el día de la excursión o después." });
            }
        }
    }

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
                pago_realizado, cantidad_pagada, fecha_pago, notas_participacion, asistencia
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(alumno_id, excursion_id) DO UPDATE SET
                autorizacion_firmada = excluded.autorizacion_firmada,
                fecha_autorizacion = excluded.fecha_autorizacion,
                pago_realizado = excluded.pago_realizado,
                cantidad_pagada = excluded.cantidad_pagada,
                fecha_pago = excluded.fecha_pago,
                notas_participacion = excluded.notas_participacion,
                asistencia = excluded.asistencia
            RETURNING id;`; 

        const paramsUpsert = [
            alumno_id, excursion_id,
            autorizacion_firmada === undefined ? 'No' : autorizacion_firmada, 
            fecha_autorizacion || null,
            pago_realizado === undefined ? 'No' : pago_realizado, 
            cantidad_pagada === undefined ? 0 : cantidad_pagada, 
            fecha_pago || null,
            notas_participacion || null,
            asistencia === undefined ? 'Pendiente' : asistencia
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

        // Update the participation record to reset its fields
        const updateSql = `
            UPDATE participaciones_excursion
            SET
                autorizacion_firmada = 'No',
                fecha_autorizacion = NULL,
                pago_realizado = 'No',
                cantidad_pagada = 0,
                fecha_pago = NULL,
                notas_participacion = NULL,
                asistencia = 'Pendiente'
            WHERE id = ?
        `;
        const updateResult = await dbRunAsync(updateSql, [participacionId]);

        if (updateResult.changes === 0) {
            // This means the participationId did not exist, or no rows were changed.
            return res.status(404).json({ message: "Participación no encontrada o ningún cambio realizado." });
        }

        // Fetch the updated record to return it
        const updatedParticipacion = await dbGetAsync("SELECT * FROM participaciones_excursion WHERE id = ?", [participacionId]);

        res.status(200).json({ message: "Participación reseteada exitosamente.", participacion: updatedParticipacion });

    } catch (error) {
        console.error(`Error en RESET (antes DELETE) /api/participaciones/${participacionId}:`, error.message, error.stack);
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

// API Endpoint for Data Export (Direccion ROL only)
app.get('/api/direccion/export/all-data', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado.' });
    }

    try {
        const zip = new JSZip();

        // Define tables and columns to export
        const tablesToExport = [
            { name: 'usuarios', columns: ['id', 'email', 'nombre_completo', 'password_hash', 'rol'] },
            { name: 'ciclos', columns: ['id', 'nombre_ciclo'] },
            { name: 'clases', columns: ['id', 'nombre_clase', 'tutor_id', 'ciclo_id'] },
            { name: 'alumnos', columns: ['id', 'nombre_completo', 'apellidos_para_ordenar', 'clase_id'] },
            { 
                name: 'excursiones', 
                columns: [
                    'id', 'nombre_excursion', 'fecha_excursion', 'lugar', 'hora_salida', 'hora_llegada', 
                    'coste_excursion_alumno', 'vestimenta', 'transporte', 'justificacion_texto', 
                    'actividad_descripcion', 'notas_excursion', 'numero_autobuses', 'coste_por_autobus', 
                    'coste_entradas_individual', 'coste_actividad_global', 'creada_por_usuario_id', 'para_clase_id'
                ] 
            },
            { 
                name: 'participaciones_excursion', 
                columns: [
                    'id', 'alumno_id', 'excursion_id', 'autorizacion_firmada', 'fecha_autorizacion', 
                    'pago_realizado', 'cantidad_pagada', 'fecha_pago', 'notas_participacion'
                ] 
            },
            {
                name: 'shared_excursions',
                columns: [
                    'id', 'original_excursion_id', 'shared_by_usuario_id', 'shared_with_usuario_id', 
                    'status', 'shared_at', 'processed_at', 'new_excursion_id_on_acceptance'
                ]
            }
        ];

        for (const table of tablesToExport) {
            const records = await dbAllAsync(`SELECT ${table.columns.join(', ')} FROM ${table.name}`);
            const csvString = await recordsToCsv(records, table.columns);
            zip.file(`${table.name}.csv`, csvString);
        }

        const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, "");
        const filename = `export_gestion_escolar_${timestamp}.zip`;

        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(zipBuffer);

    } catch (error) {
        console.error("Error en /api/direccion/export/all-data:", error.message, error.stack);
        res.status(500).json({ error: "Error interno al generar la exportación.", detalles: error.message });
    }
});

const tableOrder = ['usuarios', 'ciclos', 'clases', 'alumnos', 'excursiones', 'participaciones_excursion', 'shared_excursions'];

app.post('/api/direccion/import/all-data', authenticateToken, upload.single('importFile'), async (req, res) => {
    if (req.user.rol !== 'DIRECCION') {
        return res.status(403).json({ error: 'No autorizado.' });
    }

    const importSummary = [];
    let fileBuffer;
    let sourceDescription;

    if (req.file) {
        // Validate file type and extension for uploaded file
        if (req.file.mimetype !== 'application/zip' && req.file.mimetype !== 'application/x-zip-compressed') {
            return res.status(400).json({ error: 'Invalid file type for upload. Only ZIP files are allowed.' });
        }
        if (!req.file.originalname.toLowerCase().endsWith('.zip')) {
            return res.status(400).json({ error: 'Invalid file extension for upload. Only .zip files are allowed.' });
        }
        fileBuffer = req.file.buffer;
        sourceDescription = `Uploaded file: ${req.file.originalname}, Size: ${req.file.size}`;
        console.log(sourceDescription);

    } else if (req.body.file_url) {
        const fileUrl = req.body.file_url;
        sourceDescription = `File from URL: ${fileUrl}`;
        console.log(sourceDescription);

        // Validate URL format
        if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
            return res.status(400).json({ error: 'Invalid file_url format. Must be http or https.' });
        }

        try {
            const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            // Optional: Check Content-Type header if available and strict
            // const contentType = response.headers['content-type'];
            // if (contentType && !contentType.includes('application/zip') && !contentType.includes('application/x-zip-compressed')) {
            //     return res.status(400).json({ error: 'Downloaded file content-type is not ZIP.' });
            // }
            fileBuffer = response.data;
        } catch (error) {
            console.error(`Error downloading file from URL ${fileUrl}:`, error.message);
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                return res.status(error.response.status).json({
                    error: `HTTP error downloading file: ${error.response.status} ${error.response.statusText}`,
                    url: fileUrl
                });
            } else if (error.request) {
                // The request was made but no response was received
                return res.status(500).json({ error: 'Network error: No response received from file URL.', url: fileUrl });
            } else {
                // Something happened in setting up the request that triggered an Error
                return res.status(500).json({ error: `Error downloading file: ${error.message}`, url: fileUrl });
            }
        }
    } else {
        return res.status(400).json({ error: 'No importFile uploaded and no file_url provided.' });
    }

    if (!fileBuffer) { // Should be caught by earlier checks, but as a safeguard
        return res.status(500).json({ error: 'File buffer is not available for processing.' });
    }

    try {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(fileBuffer);

        // Validate presence of expected CSV files
        const expectedCsvFiles = ['usuarios.csv', 'ciclos.csv', 'clases.csv', 'alumnos.csv', 'excursiones.csv', 'participaciones_excursion.csv', 'shared_excursions.csv'];
        const actualFilenames = Object.keys(loadedZip.files);
        const missingFiles = expectedCsvFiles.filter(f => !actualFilenames.includes(f));

        if (missingFiles.length > 0) {
            return res.status(400).json({ error: 'Missing required CSV files in ZIP.', missing_files: missingFiles });
        }

        for (const tableName of tableOrder) {
            const fileName = `${tableName}.csv`;
            const tableSummary = {
                tableName,
                processedRows: 0,
                insertedRows: 0,
                skippedExisting: 0,
                skippedFK: 0,
                errors: []
            };

            if (!loadedZip.files[fileName]) {
                console.log(`File ${fileName} not found in ZIP. Skipping.`);
                tableSummary.errors.push({ type: 'FILE_NOT_FOUND', message: `File ${fileName} not found in ZIP.` });
                importSummary.push(tableSummary);
                continue;
            }

            try {
                const csvString = await loadedZip.file(fileName).async('string');
                const parsedData = Papa.parse(csvString, { header: true, skipEmptyLines: true });

                if (!parsedData.data || parsedData.data.length === 0) {
                    console.log(`No data found in ${fileName}. Skipping.`);
                    tableSummary.errors.push({ type: 'EMPTY_FILE', message: `No data found in ${fileName}.` });
                    importSummary.push(tableSummary);
                    continue;
                }

                await dbRunAsync('BEGIN TRANSACTION;');
                console.log(`Starting processing for table: ${tableName}`);

                let fileFailed = false;
                for (const row of parsedData.data) {
                    tableSummary.processedRows++;
                    try {
                        if (tableName === 'clases') {
                            console.log(`[CLASES ROW ENTRY] Processing CSV row for class name (raw): "${row.nombre_clase}", Raw tutor_id: "${row.tutor_id}"`);
                            if (row.nombre_clase === 'PRIMARIA 3B') {
                                console.log("<<<<< FOUND PRIMARIA 3B ROW IN CSV PARSED DATA >>>>>");
                                // --- Start of new detailed logging for PRIMARIA 3B ---
                                const tutor_id_raw_primaria3b = row.tutor_id?.trim();
                                console.log(`[PRIMARIA 3B TRACE] tutor_id_raw_primaria3b: "${tutor_id_raw_primaria3b}"`);

                                if (tutor_id_raw_primaria3b && tutor_id_raw_primaria3b !== '') {
                                    const parsed_tutor_id_primaria3b = parseInt(tutor_id_raw_primaria3b);
                                    console.log(`[PRIMARIA 3B TRACE] parsed_tutor_id_primaria3b: ${parsed_tutor_id_primaria3b}`);

                                    const is_nan_check_primaria3b = isNaN(parsed_tutor_id_primaria3b);
                                    console.log(`[PRIMARIA 3B TRACE] isNaN(parsed_tutor_id_primaria3b): ${is_nan_check_primaria3b}`);

                                    if (!is_nan_check_primaria3b) {
                                        try {
                                            const tutor_exists_primaria3b = await dbGetAsync("SELECT id, email, rol FROM usuarios WHERE id = ?", [parsed_tutor_id_primaria3b]);
                                            console.log(`[PRIMARIA 3B TRACE] tutor_exists_primaria3b check result: ${tutor_exists_primaria3b ? JSON.stringify(tutor_exists_primaria3b) : 'NOT FOUND'}`);
                                        } catch (dbError) {
                                            console.error(`[PRIMARIA 3B TRACE] Error during dbGetAsync for tutorExists: ${dbError.message}`);
                                        }
                                    }
                                } else {
                                    console.log(`[PRIMARIA 3B TRACE] tutor_id_raw_primaria3b is empty or null. Will result in tutor_id = null.`);
                                }
                                // --- End of new detailed logging for PRIMARIA 3B ---
                            }
                        }
                        if (tableName === 'usuarios') {
                            const email = row.email?.trim();
                            const nombre_completo = row.nombre_completo?.trim();
                            const password_raw = row.password || row.password_hash; // CSV might have 'password' or 'password_hash'
                            const rol = row.rol?.trim();

                            if (!email || !nombre_completo || !password_raw || !rol) {
                                tableSummary.errors.push({ rowIdentifier: email || `Row ${tableSummary.processedRows}`, error: 'Missing required fields (email, nombre_completo, password, rol).' });
                                continue;
                            }
                            
                            const existingUser = await dbGetAsync("SELECT id FROM usuarios WHERE email = ?", [email]);
                            if (existingUser) {
                                tableSummary.skippedExisting++;
                                tableSummary.errors.push({ rowIdentifier: email, error: 'User with this email already exists.' });
                                continue;
                            }

                            let final_password_hash_for_insert;
                            const password_hash_from_csv = row.password_hash?.trim();
                            const plain_password_from_csv = row.password?.trim();

                            if (password_hash_from_csv) {
                                console.log(`[IMPORT USUARIOS] Using existing hash from password_hash field for user: ${email}`);
                                final_password_hash_for_insert = password_hash_from_csv;
                            } else if (plain_password_from_csv) {
                                console.log(`[IMPORT USUARIOS] Hashing plain password from password field for user: ${email}`);
                                final_password_hash_for_insert = await bcrypt.hash(plain_password_from_csv, 10);
                            } else {
                                console.log(`[IMPORT USUARIOS] Error for user ${email}: Password data (password_hash or password) missing or empty in CSV. Skipping user.`);
                                tableSummary.errors.push({ rowIdentifier: email || `Row ${tableSummary.processedRows}`, error: 'Password data missing or empty in CSV for new user.' });
                                continue; // Skip this user row
                            }
                            
                            const insertSql = "INSERT INTO usuarios (email, nombre_completo, password_hash, rol) VALUES (?, ?, ?, ?)";
                            await dbRunAsync(insertSql, [email, nombre_completo, final_password_hash_for_insert, rol]);
                            tableSummary.insertedRows++;
                        } else if (tableName === 'ciclos') {
                            const nombre_ciclo = row.nombre_ciclo?.trim();
                            if (!nombre_ciclo) {
                                tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: 'Missing required field (nombre_ciclo).' });
                                continue;
                            }
                            const existingCiclo = await dbGetAsync("SELECT id FROM ciclos WHERE nombre_ciclo = ?", [nombre_ciclo]);
                            if (existingCiclo) {
                                tableSummary.skippedExisting++;
                                tableSummary.errors.push({ rowIdentifier: nombre_ciclo, error: 'Ciclo with this name already exists.' });
                                continue;
                            }
                            const insertSql = "INSERT INTO ciclos (nombre_ciclo) VALUES (?)";
                            await dbRunAsync(insertSql, [nombre_ciclo]);
                            tableSummary.insertedRows++;
                        } else if (tableName === 'clases') {
                            const nombre_clase = row.nombre_clase?.trim();
                            const tutor_id_raw = row.tutor_id?.trim();
                            const ciclo_id_raw = row.ciclo_id?.trim();

                            if (!nombre_clase) {
                                tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: 'Missing required field (nombre_clase).' });
                                continue;
                            }

                            // Removed existingClase check for UPSERT logic.

                            let tutor_id = null;
                            if (tutor_id_raw && tutor_id_raw !== '') {
                                tutor_id = parseInt(tutor_id_raw);
                                if (isNaN(tutor_id)) {
                                    tableSummary.errors.push({ rowIdentifier: nombre_clase, error: 'Invalid tutor_id format.' });
                                    tableSummary.skippedFK++;
                                    continue;
                                }
                                const tutorExists = await dbGetAsync("SELECT id FROM usuarios WHERE id = ?", [tutor_id]);
                                if (!tutorExists) {
                                    tableSummary.skippedFK++;
                                    tableSummary.errors.push({ rowIdentifier: nombre_clase, error: `Foreign key violation: tutor_id ${tutor_id} not found.`});
                                    continue;
                                }
                            }
                            
                            let ciclo_id = null;
                            if (ciclo_id_raw && ciclo_id_raw !== '') {
                                ciclo_id = parseInt(ciclo_id_raw);
                                if (isNaN(ciclo_id)) {
                                    tableSummary.errors.push({ rowIdentifier: nombre_clase, error: 'Invalid ciclo_id format.' });
                                    tableSummary.skippedFK++;
                                    continue;
                                }
                                const cicloExists = await dbGetAsync("SELECT id FROM ciclos WHERE id = ?", [ciclo_id]);
                                if (!cicloExists) {
                                    tableSummary.skippedFK++;
                                    tableSummary.errors.push({ rowIdentifier: nombre_clase, error: `Foreign key violation: ciclo_id ${ciclo_id} not found.`});
                                    continue;
                                }
                            }
                            // The [CLASES INSERT PREP] log (if any specific one was here) is handled by the [CLASES ROW ENTRY] and PRIMARIA 3B trace logs.
                            // The main [CLASES ROW ENTRY] log is already present earlier.
                            // For "PRIMARIA 3B", specific detailed logs are also present earlier.

                            const upsertSql = `
                                INSERT INTO clases (nombre_clase, tutor_id, ciclo_id)
                                VALUES (?, ?, ?)
                                ON CONFLICT(nombre_clase) DO UPDATE SET
                                    tutor_id = excluded.tutor_id,
                                    ciclo_id = excluded.ciclo_id;
                            `;
                            await dbRunAsync(upsertSql, [nombre_clase, tutor_id, ciclo_id]);

                            if (nombre_clase === "PRIMARIA 3B") {
                                try {
                                    const upsertedClaseRowPrimaria3B = await dbGetAsync("SELECT id, nombre_clase, tutor_id, ciclo_id FROM clases WHERE nombre_clase = ?", ["PRIMARIA 3B"]);
                                    console.log(`[PRIMARIA 3B POST-UPSERT CHECK] Re-read from DB: ${upsertedClaseRowPrimaria3B ? `Found - tutor_id: ${upsertedClaseRowPrimaria3B.tutor_id}, ciclo_id: ${upsertedClaseRowPrimaria3B.ciclo_id}` : 'NOT FOUND after upsert attempt'}`);
                                } catch (readbackError) {
                                    console.error(`[PRIMARIA 3B POST-UPSERT CHECK] Error reading back class "PRIMARIA 3B": ${readbackError.message}`);
                                }
                            }
                            tableSummary.insertedRows++; // Counts both inserts and updates for simplicity here
                        } else if (tableName === 'alumnos') {
                            const nombre_completo = row.nombre_completo?.trim();
                            const apellidos_para_ordenar = row.apellidos_para_ordenar?.trim() || nombre_completo?.split(' ').slice(1).join(' ') || ''; // Basic fallback for ordering
                            const clase_id_raw = row.clase_id?.trim();

                            if (!nombre_completo || !clase_id_raw) {
                                tableSummary.errors.push({ rowIdentifier: nombre_completo || `Row ${tableSummary.processedRows}`, error: 'Missing required fields (nombre_completo, clase_id).' });
                                continue;
                            }

                            const clase_id = parseInt(clase_id_raw);
                            if (isNaN(clase_id)) {
                                tableSummary.errors.push({ rowIdentifier: nombre_completo, error: 'Invalid clase_id format.' });
                                tableSummary.skippedFK++; // Technically a format error but impacts FK
                                continue;
                            }

                            const claseExists = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [clase_id]);
                            if (!claseExists) {
                                tableSummary.skippedFK++;
                                tableSummary.errors.push({ rowIdentifier: nombre_completo, error: `Foreign key violation: clase_id ${clase_id} not found.`});
                                continue;
                            }
                            
                            const existingAlumno = await dbGetAsync("SELECT id FROM alumnos WHERE nombre_completo = ? AND clase_id = ?", [nombre_completo, clase_id]);
                            if (existingAlumno) {
                                tableSummary.skippedExisting++;
                                tableSummary.errors.push({ rowIdentifier: nombre_completo, error: `Alumno with name ${nombre_completo} already exists in clase_id ${clase_id}.` });
                                continue;
                            }

                            const insertSql = "INSERT INTO alumnos (nombre_completo, apellidos_para_ordenar, clase_id) VALUES (?, ?, ?)";
                            await dbRunAsync(insertSql, [nombre_completo, apellidos_para_ordenar, clase_id]);
                            tableSummary.insertedRows++;
                        } else if (tableName === 'excursiones') {
                            // Data extraction and cleaning
                            const nombre_excursion = row.nombre_excursion?.trim();
                            const fecha_excursion_raw = row.fecha_excursion?.trim();
                            const lugar = row.lugar?.trim();
                            const hora_salida = row.hora_salida?.trim();
                            const hora_llegada = row.hora_llegada?.trim();
                            const coste_excursion_alumno_raw = row.coste_excursion_alumno?.trim();
                            const vestimenta = row.vestimenta?.trim();
                            const transporte = row.transporte?.trim();
                            const justificacion_texto = row.justificacion_texto?.trim();
                            const actividad_descripcion = row.actividad_descripcion?.trim();
                            const notas_excursion = row.notas_excursion?.trim() || null;
                            const numero_autobuses_raw = row.numero_autobuses?.trim();
                            const coste_por_autobus_raw = row.coste_por_autobus?.trim();
                            const coste_entradas_individual_raw = row.coste_entradas_individual?.trim();
                            const coste_actividad_global_raw = row.coste_actividad_global?.trim();
                            const creada_por_usuario_id_raw = row.creada_por_usuario_id?.trim();
                            const para_clase_id_raw = row.para_clase_id?.trim();

                            // Basic validation for required fields
                            if (!nombre_excursion || !fecha_excursion_raw || !lugar || !hora_salida || !hora_llegada || !creada_por_usuario_id_raw) {
                                tableSummary.errors.push({ rowIdentifier: nombre_excursion || `Row ${tableSummary.processedRows}`, error: 'Missing required fields for excursiones (e.g., nombre_excursion, fecha_excursion, lugar, hora_salida, hora_llegada, creada_por_usuario_id).' });
                                continue;
                            }

                            // Type conversions and FK checks
                            const fecha_excursion = fecha_excursion_raw; // Assuming YYYY-MM-DD string from CSV is fine for SQLite
                            const coste_excursion_alumno = (coste_excursion_alumno_raw && coste_excursion_alumno_raw !== '') ? parseFloat(coste_excursion_alumno_raw) : 0;
                            const numero_autobuses = (numero_autobuses_raw && numero_autobuses_raw !== '') ? parseInt(numero_autobuses_raw) : null;
                            const coste_por_autobus = (coste_por_autobus_raw && coste_por_autobus_raw !== '') ? parseFloat(coste_por_autobus_raw) : null;
                            const coste_entradas_individual = (coste_entradas_individual_raw && coste_entradas_individual_raw !== '') ? parseFloat(coste_entradas_individual_raw) : null;
                            const coste_actividad_global = (coste_actividad_global_raw && coste_actividad_global_raw !== '') ? parseFloat(coste_actividad_global_raw) : null;
                            
                            const creada_por_usuario_id = parseInt(creada_por_usuario_id_raw);
                            if (isNaN(creada_por_usuario_id)) {
                                tableSummary.errors.push({ rowIdentifier: nombre_excursion, error: 'Invalid creada_por_usuario_id format.' });
                                tableSummary.skippedFK++;
                                continue;
                            }
                            const creadorExists = await dbGetAsync("SELECT id FROM usuarios WHERE id = ?", [creada_por_usuario_id]);
                            if (!creadorExists) {
                                tableSummary.skippedFK++;
                                tableSummary.errors.push({ rowIdentifier: nombre_excursion, error: `Foreign key violation: creada_por_usuario_id ${creada_por_usuario_id} not found.`});
                                continue;
                            }

                            let para_clase_id = null;
                            if (para_clase_id_raw && para_clase_id_raw !== '') {
                                para_clase_id = parseInt(para_clase_id_raw);
                                if (isNaN(para_clase_id)) {
                                    tableSummary.errors.push({ rowIdentifier: nombre_excursion, error: 'Invalid para_clase_id format.' });
                                    tableSummary.skippedFK++;
                                    continue;
                                }
                                const claseDestinoExists = await dbGetAsync("SELECT id FROM clases WHERE id = ?", [para_clase_id]);
                                if (!claseDestinoExists) {
                                    tableSummary.skippedFK++;
                                    tableSummary.errors.push({ rowIdentifier: nombre_excursion, error: `Foreign key violation: para_clase_id ${para_clase_id} not found.`});
                                    continue;
                                }
                            }
                            
                            // Constructing SQL
                            const cols = [
                                'nombre_excursion', 'fecha_excursion', 'lugar', 'hora_salida', 'hora_llegada',
                                'coste_excursion_alumno', 'vestimenta', 'transporte', 'justificacion_texto',
                                'actividad_descripcion', 'notas_excursion', 'numero_autobuses', 'coste_por_autobus',
                                'coste_entradas_individual', 'coste_actividad_global', 'creada_por_usuario_id', 'para_clase_id'
                            ];
                            const params = [
                                nombre_excursion, fecha_excursion, lugar, hora_salida, hora_llegada,
                                coste_excursion_alumno, vestimenta, transporte, justificacion_texto,
                                actividad_descripcion, notas_excursion, numero_autobuses, coste_por_autobus,
                                coste_entradas_individual, coste_actividad_global, creada_por_usuario_id, para_clase_id
                            ];
                            const placeholders = cols.map(() => '?').join(',');
                            const insertSql = `INSERT INTO excursiones (${cols.join(',')}) VALUES (${placeholders})`;
                            
                            await dbRunAsync(insertSql, params);
                            tableSummary.insertedRows++;
                        } else if (tableName === 'participaciones_excursion') {
                            const alumno_id_raw = row.alumno_id?.trim();
                            const excursion_id_raw = row.excursion_id?.trim();
                            const autorizacion_firmada = row.autorizacion_firmada?.trim() || 'No';
                            const fecha_autorizacion_raw = row.fecha_autorizacion?.trim();
                            const pago_realizado = row.pago_realizado?.trim() || 'No';
                            const cantidad_pagada_raw = row.cantidad_pagada?.trim();
                            const fecha_pago_raw = row.fecha_pago?.trim();
                            const notas_participacion = row.notas_participacion?.trim() || null;

                            if (!alumno_id_raw || !excursion_id_raw) {
                                tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: 'Missing required fields (alumno_id, excursion_id).' });
                                continue;
                            }

                            const alumno_id = parseInt(alumno_id_raw);
                            const excursion_id = parseInt(excursion_id_raw);
                            const cantidad_pagada = (cantidad_pagada_raw && cantidad_pagada_raw !== '') ? parseFloat(cantidad_pagada_raw) : 0;
                            const fecha_autorizacion = (fecha_autorizacion_raw && fecha_autorizacion_raw !== '') ? fecha_autorizacion_raw : null;
                            const fecha_pago = (fecha_pago_raw && fecha_pago_raw !== '') ? fecha_pago_raw : null;

                            if (isNaN(alumno_id) || isNaN(excursion_id)) {
                                tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: 'Invalid alumno_id or excursion_id format.' });
                                tableSummary.skippedFK++;
                                continue;
                            }

                            const alumnoExists = await dbGetAsync("SELECT id FROM alumnos WHERE id = ?", [alumno_id]);
                            if (!alumnoExists) {
                                tableSummary.skippedFK++;
                                tableSummary.errors.push({ rowIdentifier: `Alumno ${alumno_id} / Excursion ${excursion_id}`, error: `Foreign key violation: alumno_id ${alumno_id} not found.`});
                                continue;
                            }
                            const excursionExists = await dbGetAsync("SELECT id FROM excursiones WHERE id = ?", [excursion_id]);
                            if (!excursionExists) {
                                tableSummary.skippedFK++;
                                tableSummary.errors.push({ rowIdentifier: `Alumno ${alumno_id} / Excursion ${excursion_id}`, error: `Foreign key violation: excursion_id ${excursion_id} not found.`});
                                continue;
                            }

                            const existingParticipation = await dbGetAsync("SELECT id FROM participaciones_excursion WHERE alumno_id = ? AND excursion_id = ?", [alumno_id, excursion_id]);
                            if (existingParticipation) {
                                tableSummary.skippedExisting++;
                                tableSummary.errors.push({ rowIdentifier: `Alumno ${alumno_id} / Excursion ${excursion_id}`, error: 'Participation record already exists.' });
                                continue;
                            }
                            
                            const cols = [
                                'alumno_id', 'excursion_id', 'autorizacion_firmada', 'fecha_autorizacion',
                                'pago_realizado', 'cantidad_pagada', 'fecha_pago', 'notas_participacion'
                            ];
                            const params = [
                                alumno_id, excursion_id, autorizacion_firmada, fecha_autorizacion,
                                pago_realizado, cantidad_pagada, fecha_pago, notas_participacion
                            ];
                            const placeholders = cols.map(() => '?').join(',');
                            const insertSql = `INSERT INTO participaciones_excursion (${cols.join(',')}) VALUES (${placeholders})`;

                            await dbRunAsync(insertSql, params);
                            tableSummary.insertedRows++;
                        } else if (tableName === 'shared_excursions') {
                            const original_excursion_id_raw = row.original_excursion_id?.trim();
                            const shared_by_usuario_id_raw = row.shared_by_usuario_id?.trim();
                            const shared_with_usuario_id_raw = row.shared_with_usuario_id?.trim();
                            const status = row.status?.trim() || 'pending';
                            const shared_at_raw = row.shared_at?.trim(); // Assuming ISO 8601 or YYYY-MM-DD HH:MM:SS
                            const processed_at_raw = row.processed_at?.trim();
                            const new_excursion_id_on_acceptance_raw = row.new_excursion_id_on_acceptance?.trim();

                            if (!original_excursion_id_raw || !shared_by_usuario_id_raw || !shared_with_usuario_id_raw) {
                                tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: 'Missing required fields (original_excursion_id, shared_by_usuario_id, shared_with_usuario_id).' });
                                continue;
                            }

                            const original_excursion_id = parseInt(original_excursion_id_raw);
                            const shared_by_usuario_id = parseInt(shared_by_usuario_id_raw);
                            const shared_with_usuario_id = parseInt(shared_with_usuario_id_raw);
                            const shared_at = (shared_at_raw && shared_at_raw !== '') ? shared_at_raw : new Date().toISOString();
                            const processed_at = (processed_at_raw && processed_at_raw !== '') ? processed_at_raw : null;
                            
                            let new_excursion_id_on_acceptance = null;
                            if (new_excursion_id_on_acceptance_raw && new_excursion_id_on_acceptance_raw !== '') {
                                new_excursion_id_on_acceptance = parseInt(new_excursion_id_on_acceptance_raw);
                                if (isNaN(new_excursion_id_on_acceptance)) {
                                     tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: 'Invalid new_excursion_id_on_acceptance format.' });
                                     tableSummary.skippedFK++;
                                     continue;
                                }
                            }

                            if (isNaN(original_excursion_id) || isNaN(shared_by_usuario_id) || isNaN(shared_with_usuario_id)) {
                                tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: 'Invalid ID format for one of the required IDs.' });
                                tableSummary.skippedFK++;
                                continue;
                            }

                            // FK Checks
                            const originalExcursionExists = await dbGetAsync("SELECT id FROM excursiones WHERE id = ?", [original_excursion_id]);
                            if (!originalExcursionExists) {
                                tableSummary.skippedFK++;
                                tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: `FK violation: original_excursion_id ${original_excursion_id} not found.`});
                                continue;
                            }
                            const sharedByUserExists = await dbGetAsync("SELECT id FROM usuarios WHERE id = ?", [shared_by_usuario_id]);
                            if (!sharedByUserExists) {
                                tableSummary.skippedFK++;
                                tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: `FK violation: shared_by_usuario_id ${shared_by_usuario_id} not found.`});
                                continue;
                            }
                            const sharedWithUserExists = await dbGetAsync("SELECT id FROM usuarios WHERE id = ?", [shared_with_usuario_id]);
                            if (!sharedWithUserExists) {
                                tableSummary.skippedFK++;
                                tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: `FK violation: shared_with_usuario_id ${shared_with_usuario_id} not found.`});
                                continue;
                            }
                            if (new_excursion_id_on_acceptance !== null) {
                                const newExcursionExists = await dbGetAsync("SELECT id FROM excursiones WHERE id = ?", [new_excursion_id_on_acceptance]);
                                if (!newExcursionExists) {
                                    tableSummary.skippedFK++;
                                    tableSummary.errors.push({ rowIdentifier: `Row ${tableSummary.processedRows}`, error: `FK violation: new_excursion_id_on_acceptance ${new_excursion_id_on_acceptance} not found.`});
                                    continue;
                                }
                            }
                            
                            // Optional: Add a check for existing identical share if desired, though not strictly required by schema if IDs are new.
                            // For simplicity, we'll assume new inserts are intended if no ID collision.

                            const cols = [
                                'original_excursion_id', 'shared_by_usuario_id', 'shared_with_usuario_id', 
                                'status', 'shared_at', 'processed_at', 'new_excursion_id_on_acceptance'
                            ];
                            const params = [
                                original_excursion_id, shared_by_usuario_id, shared_with_usuario_id,
                                status, shared_at, processed_at, new_excursion_id_on_acceptance
                            ];
                            const placeholders = cols.map(() => '?').join(',');
                            const insertSql = `INSERT INTO shared_excursions (${cols.join(',')}) VALUES (${placeholders})`;

                            await dbRunAsync(insertSql, params);
                            tableSummary.insertedRows++;
                        }
                        // All table processing logic should be complete now.

                    } catch (rowError) {
                        console.error(`Error processing row for ${tableName}:`, rowError.message, row);
                        tableSummary.errors.push({ rowIdentifier: row.id || `Row ${tableSummary.processedRows}`, error: rowError.message });
                        // If a single row fails, we might decide to rollback the whole file or continue
                        // For now, let's mark file as failed and break to rollback this file's transaction
                        fileFailed = true;
                        break; 
                    }
                }
                
                if (fileFailed) {
                    await dbRunAsync('ROLLBACK;');
                    console.log(`[DB IMPORT STATUS] Rolled back table: ${tableName} due to critical row processing error during its import.`);
                } else if (tableSummary.errors.length > 0 && tableSummary.insertedRows < (tableSummary.processedRows - tableSummary.skippedExisting - tableSummary.skippedFK)) {
                    await dbRunAsync('COMMIT;');
                    console.log(`[DB IMPORT STATUS] Committed table: ${tableName} with some non-critical errors or skips. Please review import summary.`);
                }
                 else if (tableSummary.processedRows > 0) {
                    await dbRunAsync('COMMIT;');
                    console.log(`[DB IMPORT STATUS] Successfully processed and committed table: ${tableName}`);
                } else {
                    await dbRunAsync('ROLLBACK;');
                    console.log(`[DB IMPORT STATUS] No data processed for table: ${tableName}, transaction effectively rolled back or not started.`);
                }


            } catch (fileProcessingError) {
                console.error(`Error processing file ${fileName}:`, fileProcessingError.message);
                tableSummary.errors.push({ type: 'FILE_PROCESSING_ERROR', message: fileProcessingError.message });
                await dbRunAsync('ROLLBACK;'); // Rollback if file parsing or initial transaction setup fails
            }
            importSummary.push(tableSummary);
        }
        
        res.status(200).json({ message: 'Import process completed.', summary: importSummary });

    } catch (zipError) {
        console.error("Error processing ZIP file:", zipError.message);
        return res.status(400).json({ error: 'Invalid ZIP file.', details: zipError.message });
    }
});

// Rutas de Tesorería

// Nuevo endpoint para generar PDF de reporte detallado de excursión (Tesorería)
app.get('/api/tesoreria/excursiones/:excursion_id/reporte_detallado_pdf', authenticateToken, async (req, res) => {
    try {
        const excursion_id = parseInt(req.params.excursion_id);

        if (isNaN(excursion_id)) {
            return res.status(400).json({ error: "ID de excursión inválido." });
        }

        if (req.user.rol !== 'TESORERIA' && req.user.rol !== 'DIRECCION') {
            return res.status(403).json({ error: 'Acceso no autorizado. Se requiere rol TESORERIA o DIRECCION.' });
        }

        // Fetch Excursion Details
        const excursionDetails = await dbGetAsync("SELECT * FROM excursiones WHERE id = ?", [excursion_id]);
        if (!excursionDetails) {
            return res.status(404).json({ error: "Excursión no encontrada." });
        }

        // Fetch Overall Financial Summary
        const financialSummary = await getFinancialDetailsForExcursion(excursion_id, excursionDetails);

        // Fetch Student Participation Data
        const participacionesSql = `
            SELECT
                a.nombre_completo AS alumno_nombre,
                c.nombre_clase,
                pe.cantidad_pagada,
                pe.pago_realizado,
                pe.autorizacion_firmada,
                pe.asistencia
            FROM participaciones_excursion pe
            JOIN alumnos a ON pe.alumno_id = a.id
            JOIN clases c ON a.clase_id = c.id
            WHERE pe.excursion_id = ?
            ORDER BY c.nombre_clase, a.apellidos_para_ordenar, a.nombre_completo;
        `;
        const participacionesData = await dbAllAsync(participacionesSql, [excursion_id]);

        // Group participation data by class
        const participacionesAgrupadasPorClase = participacionesData.reduce((acc, participacion) => {
            const claseNombre = participacion.nombre_clase;
            if (!acc[claseNombre]) {
                acc[claseNombre] = [];
            }
            acc[claseNombre].push(participacion);
            return acc;
        }, {});

        const pdfDocLib = await PDFDocument.create();
        pdfDocLib.registerFontkit(fontkit);

        const robotoRegularBuffer = fs.readFileSync(path.join(__dirname, 'public/assets/fonts/Roboto-Regular.ttf'));
        const robotoBoldBuffer = fs.readFileSync(path.join(__dirname, 'public/assets/fonts/Roboto-Bold.ttf'));

        const robotoFont = await pdfDocLib.embedFont(robotoRegularBuffer);
        const robotoBoldFont = await pdfDocLib.embedFont(robotoBoldBuffer);

        const logoPath = path.join(__dirname, 'public', 'folder', 'logo.jpg');
        let logoImage, logoDims;
        try {
            const logoBuffer = fs.readFileSync(logoPath);
            logoImage = await pdfDocLib.embedJpg(logoBuffer);
            if (!logoImage || logoImage.width === 0) {
                logoDims = { width: 0, height: 0 };
            } else {
                const logoScale = 50 / logoImage.width;
                logoDims = { width: logoImage.width * logoScale, height: logoImage.height * logoScale };
                if (isNaN(logoDims.width)) logoDims.width = 0;
                if (isNaN(logoDims.height)) logoDims.height = 0;
            }
        } catch (logoError) {
            console.error("Error cargando logo para Reporte Detallado Tesorería:", logoError.message);
            logoImage = null;
            logoDims = { width: 0, height: 0 };
        }

        let page = pdfDocLib.addPage([PageSizes.A4[1], PageSizes.A4[0]]); // LANDSCAPE
        let { width, height } = page.getSize(); // Get dimensions for landscape
        const yPageMargin = 40;
        const xMargin = 40;
        const pageBottomMargin = 40;
        let contentWidth = width - (2 * xMargin); // Recalculate for landscape
        const rowHeight = 18; // Consistent row height
        const fieldMaxWidth = contentWidth; // For drawFieldWithWrapping

        const pdfStyles = {
            mainTitle: { font: robotoBoldFont, size: 18, color: rgb(0,0,0) },
            sectionTitle: { font: robotoBoldFont, size: 14, color: rgb(0.1, 0.1, 0.1) },
            fieldLabel: { font: robotoBoldFont, size: 10, color: rgb(0.2, 0.2, 0.2) },
            fieldValue: { font: robotoFont, size: 10, color: rgb(0.33, 0.33, 0.33) },
            tableHeader: { font: robotoBoldFont, size: 10, color: rgb(0,0,0) },
            tableCell: { font: robotoFont, size: 9, color: rgb(0.1, 0.1, 0.1) },
            text: { font: robotoFont, size: 10, color: rgb(0,0,0) }
        };

        const logoObject = { image: logoImage, dims: logoDims, x: width - xMargin - logoDims.width, yTop: height - yPageMargin - logoDims.height, paddingBelow: 15 };
        const pageSetup = { width, height, xMargin, yMargin: yPageMargin, bottomMargin: pageBottomMargin };

        let currentY = height - yPageMargin - (logoImage ? logoDims.height : 0) - (logoImage ? 15 : 0);

        const _ensurePageSpace = (currentYVal, neededSpace, isNewSection = false) => {
            let localCurrentY = currentYVal;
            if (localCurrentY - neededSpace < pageSetup.bottomMargin || (isNewSection && localCurrentY - neededSpace < (pageSetup.bottomMargin + 40))) {
                page = pdfDocLib.addPage([PageSizes.A4[1], PageSizes.A4[0]]); // New page in Landscape
                width = page.getSize().width; // Update width for new page
                height = page.getSize().height; // Update height for new page
                contentWidth = width - (2 * xMargin); // Update contentWidth for new page

                if (logoObject.image) {
                    page.drawImage(logoObject.image, {
                        x: width - xMargin - logoObject.dims.width, // Use new landscape width
                        y: height - yPageMargin - logoObject.dims.height, // Use new landscape height
                        width: logoObject.dims.width,
                        height: logoObject.dims.height,
                    });
                }
                localCurrentY = height - yPageMargin - (logoObject.image ? logoObject.dims.height : 0) - (logoObject.image ? logoObject.paddingBelow : 0);
            }
            return localCurrentY;
        };

        currentY = _ensurePageSpace(currentY, pdfStyles.mainTitle.size + pdfStyles.sectionTitle.size + 20, true);

        page.drawText('Informe Detallado de Excursión (Tesorería)', { x: xMargin, y: currentY, ...pdfStyles.mainTitle });
        currentY -= (pdfStyles.mainTitle.size + 10);
        page.drawText(`Excursión: ${excursionDetails.nombre_excursion}`, { x: xMargin, y: currentY, ...pdfStyles.sectionTitle });
        currentY -= (pdfStyles.sectionTitle.size + 5);
        page.drawText(`Fecha: ${new Date(excursionDetails.fecha_excursion).toLocaleDateString('es-ES')}`, { x: xMargin, y: currentY, ...pdfStyles.sectionTitle });
        currentY -= (pdfStyles.sectionTitle.size + 20);

        // Overall Financial Summary Section
        currentY = _ensurePageSpace(currentY, (pdfStyles.fieldLabel.size + 5) * 6, true);
        page.drawText(`Total Dinero Recaudado: ${financialSummary.total_dinero_recaudado.toFixed(2)}€`, { x: xMargin, y: currentY, ...pdfStyles.fieldValue });
        currentY -= (pdfStyles.fieldValue.size + 5);

        const totalAlumnosQueHanPagado = participacionesData.filter(p => p.pago_realizado === 'Sí' || p.pago_realizado === 'Parcial').length;
        page.drawText(`Total Alumnos que Han Pagado: ${totalAlumnosQueHanPagado}`, { x: xMargin, y: currentY, ...pdfStyles.fieldValue });
        currentY -= (pdfStyles.fieldValue.size + 5);

        page.drawText(`Coste Total Autobuses: ${financialSummary.coste_total_autobuses.toFixed(2)}€`, { x: xMargin, y: currentY, ...pdfStyles.fieldValue });
        currentY -= (pdfStyles.fieldValue.size + 5);
        page.drawText(`Coste Total Entradas (asistentes): ${financialSummary.coste_total_participacion_entradas.toFixed(2)}€`, { x: xMargin, y: currentY, ...pdfStyles.fieldValue });
        currentY -= (pdfStyles.fieldValue.size + 5);
        page.drawText(`Coste Actividad Global: ${financialSummary.coste_total_actividad_global.toFixed(2)}€`, { x: xMargin, y: currentY, ...pdfStyles.fieldValue });
        currentY -= (pdfStyles.fieldValue.size + 5);
        page.drawText(`Balance Final Excursión: ${financialSummary.balance_excursion.toFixed(2)}€`, { x: xMargin, y: currentY, ...pdfStyles.fieldValue });
        currentY -= (pdfStyles.fieldValue.size + 20);

        // Details per Class
        for (const nombreClase of Object.keys(participacionesAgrupadasPorClase).sort()) {
            const alumnosEnClase = participacionesAgrupadasPorClase[nombreClase];
            currentY = _ensurePageSpace(currentY, pdfStyles.sectionTitle.size + (pdfStyles.fieldValue.size + 5) * 2 + rowHeight, true);

            page.drawText(`Clase: ${nombreClase}`, { x: xMargin, y: currentY, ...pdfStyles.sectionTitle });
            currentY -= (pdfStyles.sectionTitle.size + 10);

            const dineroTotalClase = alumnosEnClase.reduce((sum, p) => sum + p.cantidad_pagada, 0);
            page.drawText(`Dinero total aportado por esta clase: ${dineroTotalClase.toFixed(2)}€`, { x: xMargin, y: currentY, ...pdfStyles.fieldValue });
            currentY -= (pdfStyles.fieldValue.size + 5);

            const ninosPagadoClase = alumnosEnClase.filter(p => p.pago_realizado === 'Sí' || p.pago_realizado === 'Parcial').length;
            page.drawText(`Número de niños de esta clase que han pagado: ${ninosPagadoClase}`, { x: xMargin, y: currentY, ...pdfStyles.fieldValue });
            currentY -= (pdfStyles.fieldValue.size + 10);

            const columnsAlumnosClase = [
                { header: 'Nombre Alumno', key: 'alumno_nombre', alignment: 'left' },
                { header: 'Pagado (€)', key: 'cantidad_pagada_str', alignment: 'right' },
                { header: 'Estado Pago', key: 'pago_realizado', alignment: 'left' }
            ];
            // Adjusted for landscape: Nombre: 400, Pagado: 180, Estado: 180 (approx sum 760 for contentWidth ~760)
            const columnWidthsAlumnosClase = [400, 180, 180];

            const alumnosDataParaTabla = alumnosEnClase.map(p => ({
                ...p,
                cantidad_pagada_str: p.cantidad_pagada.toFixed(2)
            }));

            if (alumnosDataParaTabla.length > 0) {
                currentY = _ensurePageSpace(currentY, rowHeight * (alumnosDataParaTabla.length + 1));
                const tableResult = await drawTable(
                    pdfDocLib, page, currentY, alumnosDataParaTabla, columnsAlumnosClase,
                    { normal: robotoFont, bold: robotoBoldFont }, { header: 10, cell: 9 },
                    columnWidthsAlumnosClase, rowHeight, pdfStyles.tableHeader, pdfStyles.tableCell,
                    xMargin, logoObject, pageSetup
                );
                currentY = tableResult.currentY;
                page = tableResult.page;
            } else {
                page.drawText('No hay datos de participación para esta clase.', { x: xMargin, y: currentY, ...pdfStyles.text });
                currentY -= rowHeight;
            }
            currentY -= 20; // Space before next class
        }

        const pdfBytes = await pdfDocLib.save();
        res.contentType('application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Reporte_Tesoreria_Excursion_${excursion_id}.pdf`);
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error(`Error en GET /api/tesoreria/excursiones/${req.params.excursion_id}/reporte_detallado_pdf:`, error.message, error.stack);
        res.status(500).json({ error: "Error interno del servidor al intentar generar el reporte detallado.", detalles: error.message });
    }
});

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
            "SELECT COUNT(DISTINCT alumno_id) as count FROM participaciones_excursion WHERE excursion_id = ? AND asistencia = 'Sí'",
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
        "SELECT COUNT(DISTINCT alumno_id) as count FROM participaciones_excursion WHERE excursion_id = ? AND asistencia = 'Sí'",
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

        // Load logo
        const logoPath = path.join(__dirname, 'public', 'folder', 'logo.jpg');
        let logoImage, logoDims;
        try {
            const logoBuffer = fs.readFileSync(logoPath);
            logoImage = await pdfDocLib.embedJpg(logoBuffer); // Existing line

            // ---- START MODIFICATION ----
            if (!logoImage || logoImage.width === 0) { // Check if logoImage is valid and width is not zero
                console.warn("Logo image width is 0 or logoImage is invalid. Using default 0x0 dimensions for logo.");
                logoDims = { width: 0, height: 0 };
            } else {
                const logoScale = 50 / logoImage.width;
                logoDims = {
                    width: logoImage.width * logoScale,
                    height: logoImage.height * logoScale
                };
                // Safeguard against NaN values if calculations produce them (e.g. 0 * Infinity)
                if (isNaN(logoDims.width)) {
                    console.warn(`Calculated logoDims.width was NaN. Resetting to 0. logoImage.width: ${logoImage.width}, logoScale: ${logoScale}`);
                    logoDims.width = 0;
                }
                if (isNaN(logoDims.height)) {
                    console.warn(`Calculated logoDims.height was NaN. Resetting to 0. logoImage.height: ${logoImage.height}, logoScale: ${logoScale}`);
                    logoDims.height = 0;
                }
            }
            // ---- END MODIFICATION ----

        } catch (logoError) {
            console.error("Error cargando logo para Informe General:", logoError.message);
            logoImage = null;
            logoDims = { width: 0, height: 0 }; // Existing line
        }

        // Set Landscape Orientation
        let page = pdfDocLib.addPage([PageSizes.A4[1], PageSizes.A4[0]]);
        let { width, height } = page.getSize(); // Get dimensions for landscape
        const yPageMargin = 40; 
        const xMargin = 40;
        const pageBottomMargin = 40;

        // Update contentWidth based on new landscape width
        const contentWidth = width - (2 * xMargin);

        // Draw logo on first page
        if (logoImage) {
            page.drawImage(logoImage, {
                x: width - xMargin - logoDims.width, // Use landscape width
                y: height - yPageMargin - logoDims.height, // Use landscape height
                width: logoDims.width,
                height: logoDims.height,
            });
        }
        
        let currentY = height - yPageMargin - (logoImage ? logoDims.height : 0) - (logoImage ? 15 : 0); // Use landscape height
        const rowHeight = 18;

        const pdfStyles = {
            mainTitle: { font: robotoBoldFont, size: 18, color: rgb(0,0,0) },
            sectionTitle: { font: robotoBoldFont, size: 14, color: rgb(0.1, 0.1, 0.1) },
            tableHeader: { font: robotoBoldFont, size: 10, color: rgb(0,0,0) },
            tableCell: { font: robotoFont, size: 9, color: rgb(0.1, 0.1, 0.1) },
            text: { font: robotoFont, size: 10, color: rgb(0,0,0) }
        };
        
        const logoObject = { image: logoImage, dims: logoDims, x: width - xMargin - logoDims.width, yTop: height - yPageMargin - logoDims.height, paddingBelow: 15 };
        const pageSetup = { height, yMargin: yPageMargin, bottomMargin: pageBottomMargin, xMargin: xMargin };


        const ensurePageSpace = (currentYVal, neededSpace, isNewSection = false) => {
            let localCurrentY = currentYVal;
            if (localCurrentY - neededSpace < pageSetup.bottomMargin || (isNewSection && localCurrentY - neededSpace < (pageSetup.bottomMargin + 40))) {
                page = pdfDocLib.addPage(PageSizes.A4);
                if (logoObject.image) {
                    page.drawImage(logoObject.image, {
                        x: width - xMargin - logoObject.dims.width,
                        y: logoObject.yTop,
                        width: logoObject.dims.width,
                        height: logoObject.dims.height,
                    });
                }
                localCurrentY = pageSetup.height - pageSetup.yMargin - (logoObject.image ? logoObject.dims.height : 0) - (logoObject.image ? logoObject.paddingBelow : 0);
            }
            return localCurrentY;
        };
        
        currentY = ensurePageSpace(currentY, pdfStyles.mainTitle.size + pdfStyles.sectionTitle.size + 20, true);

        // PDF Title
        page.drawText('Informe General de Tesorería', { x: xMargin, y: currentY, ...pdfStyles.mainTitle });
        currentY -= (pdfStyles.mainTitle.size + 20);

        // Section 1: Resumen Financiero de Excursiones
        currentY = ensurePageSpace(currentY, pdfStyles.sectionTitle.size + rowHeight * 2, true);
        page.drawText('Resumen Financiero de Excursiones', { x: xMargin, y: currentY, ...pdfStyles.sectionTitle });
        currentY -= (pdfStyles.sectionTitle.size + 10);

        const excursionesDb = await dbAllAsync("SELECT * FROM excursiones ORDER BY fecha_excursion DESC");
        const excursionFinancialData = [];
        const participatingClassIds = new Set(); // Initialize Set for class IDs

        for (const excursion of excursionesDb) {
            const financialDetails = await getFinancialDetailsForExcursion(excursion.id, excursion);
            const totalCostes = financialDetails.coste_total_autobuses + 
                                financialDetails.coste_total_participacion_entradas + 
                                financialDetails.coste_total_actividad_global;

            // Get money contributed by each class
            const aportesPorClaseSql = `
                SELECT
                    c.id as clase_id,
                    c.nombre_clase,
                    SUM(pe.cantidad_pagada) as total_aportado_clase
                FROM participaciones_excursion pe
                JOIN alumnos a ON pe.alumno_id = a.id
                JOIN clases c ON a.clase_id = c.id
                WHERE pe.excursion_id = ?
                GROUP BY c.id, c.nombre_clase
                ORDER BY c.nombre_clase;
            `;
            const aportesData = await dbAllAsync(aportesPorClaseSql, [excursion.id]);
            excursion.aportes_por_clase = aportesData;

            if (excursion.aportes_por_clase && excursion.aportes_por_clase.length > 0) {
                excursion.aportes_por_clase.forEach(aporte => {
                    if (aporte.clase_id) {
                        participatingClassIds.add(aporte.clase_id);
                    }
                });
            }

            if (excursion.para_clase_id) {
                participatingClassIds.add(excursion.para_clase_id);
            }

            // Get number of children who paid
            const ninosPagadoSql = `
                SELECT
                    COUNT(DISTINCT pe.alumno_id) as total_ninos_pagado
                FROM participaciones_excursion pe
                WHERE pe.excursion_id = ? AND (pe.pago_realizado = 'Sí' OR pe.pago_realizado = 'Parcial');
            `;
            const ninosPagadoResult = await dbGetAsync(ninosPagadoSql, [excursion.id]);
            excursion.ninos_han_pagado = ninosPagadoResult ? ninosPagadoResult.total_ninos_pagado : 0;

            let aportes_clase_str = "N/A";
            if (excursion.aportes_por_clase && excursion.aportes_por_clase.length > 0) {
                aportes_clase_str = excursion.aportes_por_clase
                    .map(aporte => `${aporte.nombre_clase}: ${aporte.total_aportado_clase.toFixed(2)}€`)
                    .join(', ');
            }

            excursionFinancialData.push({
                nombre_excursion: excursion.nombre_excursion,
                fecha_excursion: new Date(excursion.fecha_excursion).toLocaleDateString('es-ES'),
                total_recaudado: financialDetails.total_dinero_recaudado.toFixed(2),
                costes_totales: totalCostes.toFixed(2),
                balance: financialDetails.balance_excursion.toFixed(2),
                aportes_clase_str: aportes_clase_str,
                ninos_han_pagado: excursion.ninos_han_pagado
            });
        }

        const columnsExcursiones = [
            { header: 'Excursión', key: 'nombre_excursion', alignment: 'left'},
            { header: 'Fecha', key: 'fecha_excursion', alignment: 'left'},
            { header: 'Recaudado (€)', key: 'total_recaudado', alignment: 'right'},
            { header: 'Costes (€)', key: 'costes_totales', alignment: 'right'},
            { header: 'Balance (€)', key: 'balance', alignment: 'right'},
            { header: 'Aportes por Clase', key: 'aportes_clase_str', alignment: 'left'},
            { header: 'Alumnos Pagados', key: 'ninos_han_pagado', alignment: 'right'} // Updated Header
        ];
        // Original portrait widths: [120, 60, 70, 70, 70, 100, 25]; Sum = 515
        // New landscape widths for contentWidth approx 761.89:
        // Excursion: 200, Fecha: 70, Recaudado: 90, Costes: 90, Balance: 90, Aportes: 150, Alumnos Pagados: 70
        // Sum = 200 + 70 + 90 + 90 + 90 + 150 + 70 = 760
        const columnWidthsExcursiones = [200, 70, 90, 90, 90, 150, 70];


        if (excursionFinancialData.length > 0) {
            currentY = ensurePageSpace(currentY, rowHeight * (excursionFinancialData.length +1));
            const tableResultExcursiones = await drawTable(
                pdfDocLib,
                page,
                currentY,
                excursionFinancialData,
                columnsExcursiones,
                { normal: robotoFont, bold: robotoBoldFont }, // Ensure robotoFont is used, not pdfStyles.tableCell.font etc directly here
                { header: 10, cell: 9 },
                columnWidthsExcursiones,
                rowHeight,
                pdfStyles.tableHeader,
                pdfStyles.tableCell,
                xMargin,
                logoObject,
                pageSetup
            );
            currentY = tableResultExcursiones.currentY;
            page = tableResultExcursiones.page;
        } else {
            currentY = ensurePageSpace(currentY, rowHeight);
            page.drawText('No hay datos financieros de excursiones disponibles.', { x: xMargin, y: currentY, ...pdfStyles.text });
            currentY -= rowHeight;
        }
        currentY -= 20; // Space after section

        // Section 2: Listado de Tutores
        currentY = ensurePageSpace(currentY, pdfStyles.sectionTitle.size + rowHeight * 2, true);
        page.drawText('Listado de Tutores', { x: xMargin, y: currentY, ...pdfStyles.sectionTitle });
        currentY -= (pdfStyles.sectionTitle.size + 10);
        
        const classIdsArray = Array.from(participatingClassIds);
        // console.log("Participating Class IDs for Tutor List:", classIdsArray); // Temporary log to be removed

        let tutoresDb = [];
        if (classIdsArray.length > 0) {
            const placeholders = classIdsArray.map(() => '?').join(',');
            const sqlTutores = `
                SELECT DISTINCT u.id, u.nombre_completo, u.email
                FROM usuarios u
                JOIN clases c ON u.id = c.tutor_id
                WHERE c.id IN (${placeholders}) AND u.rol = 'TUTOR'
                ORDER BY u.nombre_completo ASC;
            `;
            tutoresDb = await dbAllAsync(sqlTutores, classIdsArray);
        }

        const clasesDb = await dbAllAsync("SELECT id, nombre_clase, tutor_id FROM clases"); // Still needed for clasesMap
        const clasesMap = clasesDb.reduce((map, clase) => {
            if (clase.tutor_id) map[clase.tutor_id] = clase.nombre_clase; // This will associate tutor_id with nombre_clase
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
            currentY = ensurePageSpace(currentY, rowHeight * (tutorListData.length +1));
            const tableResultTutores = await drawTable(
                pdfDocLib,
                page,
                currentY,
                tutorListData,
                columnsTutores,
                { normal: robotoFont, bold: robotoBoldFont }, // Ensure robotoFont is used
                { header: 10, cell: 9 },
                columnWidthsTutores,
                rowHeight,
                pdfStyles.tableHeader,
                pdfStyles.tableCell,
                xMargin,
                logoObject,
                pageSetup
            );
            currentY = tableResultTutores.currentY;
            page = tableResultTutores.page;
        } else {
            currentY = ensurePageSpace(currentY, rowHeight);
            page.drawText('No hay tutores de clases participantes para mostrar.', { x: xMargin, y: currentY, ...pdfStyles.text });
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
