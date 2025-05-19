// --- public/app.js (Revisado y Ordenado) ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Estado Global del Frontend ---
    let currentUser = null;
    let currentToken = null;

    // --- URLs y Selectores del DOM ---
    // Usamos la IP que me indicaste que te funcionó. Asegúrate de que es la correcta.
    const API_BASE_URL = `http://192.168.1.7:3000/api`; 

    // Autenticación y UI general de autenticación
    const loginSection = document.getElementById('login-section');
    const loginForm = document.getElementById('loginForm');
    const loginErrorP = document.getElementById('loginError');
    const authStatusDiv = document.getElementById('auth-status');
    const userInfoDisplay = document.getElementById('userInfoDisplay');
    const authButton = document.getElementById('auth_button');
    const signoutButton = document.getElementById('signout_button');

    // Navegación y Secciones Principales
    const mainNavSidebar = document.getElementById('main-nav-sidebar');
    const navLinks = document.querySelectorAll('#main-nav-sidebar a');
    const mainSections = document.querySelectorAll('.main-section');
    
    // Contenedores de contenido específico
    const dashboardSummaryContentDiv = document.getElementById('dashboard-summary-content');
    const clasesContentDiv = document.getElementById('clases-content');
    const alumnosContentDiv = document.getElementById('alumnos-content');
    const excursionesContentDiv = document.getElementById('excursiones-content');
    const participacionesContentDiv = document.getElementById('participaciones-content');
    const adminUsuariosContentDiv = document.getElementById('admin-usuarios-content');

    console.log("app.js cargado y DOMContentLoaded disparado.");
    if (!loginForm) console.error("Elemento loginForm NO encontrado.");


    // --- Funciones Auxiliares ---
    async function apiFetch(endpoint, method = 'GET', body = null, token = currentToken) {
        const url = `${API_BASE_URL}${endpoint}`; // Uso correcto de backticks
        console.log(`[apiFetch] Request: ${method} ${url}`);
        if (body && (method === 'POST' || method === 'PUT')) console.log("[apiFetch] Body:", body);

        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const options = { method, headers };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            console.log(`[apiFetch] Response Status: ${response.status} for ${method} ${url}`);

            if (response.status === 204) { console.log("[apiFetch] Respuesta 204 No Content."); return null; }
            
            const responseText = await response.text();
            let responseData;
            try {
                responseData = responseText ? JSON.parse(responseText) : {};
            } catch (e) {
                console.error(`[apiFetch] Failed to parse JSON from ${url}. Status: ${response.status}. Response text:`, responseText.substring(0, 200) + "...");
                if (response.ok) throw new Error("Respuesta del servidor no es JSON válido.");
                else throw new Error(`Error del servidor (HTTP ${response.status}). La respuesta no fue JSON.`);
            }
            
            if (!response.ok) {
                console.warn(`[apiFetch] Not OK response (${response.status}) from ${url}. Data:`, responseData);
                if (response.status === 401 || response.status === 403) {
                    handleLogout(); // Forzar logout
                    alert(responseData.error || "Sesión inválida o acceso denegado. Por favor, inicia sesión de nuevo.");
                }
                throw new Error(responseData.error || `Error HTTP ${response.status}`);
            }
            return responseData;
        } catch (error) {
            console.error(`[apiFetch] CATCH ALL for ${method} ${url}:`, error.message, error.name);
            if (!error.message.toLowerCase().includes("sesión inválida")) { // Evitar doble alert
                showGlobalError(error.message.includes("Failed to fetch") ? "No se pudo conectar con el servidor." : error.message);
            }
            throw error; 
        }
    }

    function showGlobalError(message) {
        console.error("ERROR APP:", message);
        alert(`Error en la aplicación: ${message}`);
    }

    // --- Autenticación ---
    function handleAuthClick() { navigateTo('login'); }
    if (authButton) authButton.onclick = handleAuthClick;

    function handleLogout() {
        console.log("Cerrando sesión...");
        currentUser = null; currentToken = null;
        localStorage.removeItem('authToken'); localStorage.removeItem('userInfo');
        updateUIAfterLogout();
        navigateTo('login');
    }
    if (signoutButton) signoutButton.onclick = handleLogout;

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (loginErrorP) loginErrorP.textContent = '';
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            console.log("Login form submitted. Email:", email);
            try {
                const data = await apiFetch('/auth/login', 'POST', { email, password }, null);
                if (data && data.token && data.user) {
                    console.log("Login API call successful, data received:", data);
                    handleLoginSuccess(data.user, data.token);
                } else { 
                    if (loginErrorP) loginErrorP.textContent = (data && data.error) || "Respuesta de login inesperada.";
                }
            } catch (error) { 
                console.error("Catch block en el listener de loginForm:", error.message);
                if (loginErrorP) loginErrorP.textContent = error.message.includes("Credenciales incorrectas") ? error.message : "Error al iniciar sesión.";
            }
        });
    }

    function handleLoginSuccess(user, token) {
        currentUser = user; currentToken = token;
        localStorage.setItem('authToken', token); localStorage.setItem('userInfo', JSON.stringify(user));
        updateUIAfterLogin();
        navigateTo('dashboard'); 
    }

    function updateUIAfterLogin() {
        if (loginSection) loginSection.style.display = 'none';
        if (authStatusDiv) authStatusDiv.style.display = 'flex';
        if (userInfoDisplay) userInfoDisplay.innerHTML = `Usuario: <strong>${currentUser.nombre_completo}</strong> (${currentUser.rol}${currentUser.claseNombre ? ` - ${currentUser.claseNombre}` : ''})`;
        if (authButton) authButton.style.display = 'none';
        if (signoutButton) signoutButton.style.display = 'inline-block';
        if (mainNavSidebar) mainNavSidebar.style.display = 'block';
        adaptarMenuSegunRol();
    }

    function updateUIAfterLogout() {
        if (loginSection) loginSection.style.display = 'block';
        if (loginForm) loginForm.reset();
        if (loginErrorP) loginErrorP.textContent = '';
        if (authStatusDiv) authStatusDiv.style.display = 'flex';
        if (userInfoDisplay) userInfoDisplay.textContent = 'Por favor, inicia sesión.';
        if (authButton) authButton.style.display = 'inline-block';
        if (signoutButton) signoutButton.style.display = 'none';
        if (mainNavSidebar) mainNavSidebar.style.display = 'none';
        mainSections.forEach(s => { if (s) s.style.display = 'none'; });
    }

    function adaptarMenuSegunRol() {
        if (!currentUser || !mainNavSidebar) return;
        const isAdmin = currentUser.rol === 'DIRECCION';
        const adminUsuariosLinkLi = mainNavSidebar.querySelector('a[data-section="admin-usuarios"]');
        if (adminUsuariosLinkLi) adminUsuariosLinkLi.parentElement.style.display = isAdmin ? 'list-item' : 'none';
    }

    function checkInitialLoginState() {
        const token = localStorage.getItem('authToken');
        const userStr = localStorage.getItem('userInfo');
        if (token && userStr) {
            try {
                const user = JSON.parse(userStr);
                apiFetch('/auth/me', 'GET', null, token)
                    .then(data => {
                        if (data && data.usuario) { handleLoginSuccess(data.usuario, token); }
                        else { handleLogout(); } // Token inválido o expirado según el backend
                    }).catch(() => handleLogout()); // Error en fetch /auth/me (ej. red), desloguear
            } catch (e) { console.error("Error parseando userInfo:", e); handleLogout(); }
        } else { updateUIAfterLogout(); navigateTo('login'); }
    }

    // --- Navegación ---
    function navigateTo(sectionName) {
        console.log("Navegando a:", sectionName);
        mainSections.forEach(s => { if(s) s.style.display = 'none';});
        navLinks.forEach(l => { if(l) l.classList.remove('active');});
        if (loginSection) loginSection.style.display = 'none';

        const activeSectionDiv = document.getElementById(`${sectionName}-section`);
        const activeLink = document.querySelector(`#main-nav-sidebar a[data-section="${sectionName}"]`);

        if (sectionName === 'login') {
            if (loginSection) loginSection.style.display = 'block';
        } else if (activeSectionDiv) {
            activeSectionDiv.style.display = 'block';
            if (activeLink) activeLink.classList.add('active');
            loadContentForSection(sectionName);
        } else {
            console.warn(`Div de sección '${sectionName}-section' no encontrado.`);
            const contentArea = document.querySelector('main.content-area');
            if (contentArea) contentArea.innerHTML = `<p>Error: La sección '${sectionName}' no está definida en el HTML.</p>`;
        }
    }
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('data-section');
            if (currentToken || section === 'login') navigateTo(section);
            else navigateTo('login');
        });
    });

    // --- Carga de Contenido para Secciones ---
    function loadContentForSection(sectionName) {
        if (sectionName === 'login') return;
        if (!currentToken) { navigateTo('login'); return; }
        console.log("Cargando contenido para:", sectionName);
        switch (sectionName) {
            case 'dashboard': loadDashboardData(); break;
            case 'clases': loadClases(); break;
            case 'alumnos': loadAlumnos(); break;
            case 'excursiones': loadExcursiones(); break;
            case 'participaciones': loadParticipaciones(); break;
            case 'admin-usuarios': if (currentUser && currentUser.rol === 'DIRECCION') loadAdminUsuarios(); break;
            default:
                const sectionDiv = document.getElementById(`${sectionName}-section`);
                if (sectionDiv) sectionDiv.innerHTML = `<p>Contenido para ${sectionName} pendiente de implementación.</p>`;
        }
    }

    // --- Dashboard ---
    async function loadDashboardData() {
        if (!dashboardSummaryContentDiv || !currentToken) return;
        dashboardSummaryContentDiv.innerHTML = "<p>Cargando resumen del dashboard...</p>";
        try {
            const data = await apiFetch('/dashboard/summary');
            let html = '<h4>Resumen General</h4>';
            if (currentUser.rol === 'DIRECCION') {
                html += `<ul>
                    <li>Total Clases: ${data.totalClases ?? 'N/D'}</li>
                    <li>Total Alumnos Global: ${data.totalAlumnos ?? 'N/D'}</li>
                    <li>Total Excursiones: ${data.totalExcursiones ?? 'N/D'}</li>
                </ul>`;
                if (data.proximasExcursiones && data.proximasExcursiones.length > 0) {
                    html += '<h5>Próximas Excursiones (Global):</h5><ul>';
                    data.proximasExcursiones.forEach(ex => html += `<li>${ex.nombre_excursion} (${ex.fecha_excursion || 'N/D'})</li>`);
                    html += '</ul>';
                } else { html += '<p>No hay próximas excursiones generales.</p>';}
            }
            if (currentUser.rol === 'TUTOR') {
                 html += `<ul>
                    <li>Tu Clase: ${currentUser.claseNombre || 'No asignada'}</li>
                    <li>Nº Alumnos en tu Clase: ${data.infoSuClase ? data.infoSuClase.numAlumnos : 'N/D'}</li>
                </ul>`;
                if (data.proximasExcursiones && data.proximasExcursiones.length > 0) {
                    html += '<h5>Próximas Excursiones (Tu Clase / Globales):</h5><ul>';
                    data.proximasExcursiones.forEach(ex => html += `<li>${ex.nombre_excursion} (${ex.fecha_excursion || 'N/D'}) ${ex.para_clase_id === currentUser.claseId ? '(Específica tuya)' : (ex.para_clase_id === null ? '(Global)' : '(Otra clase)')}</li>`);
                    html += '</ul>';
                } else { html += '<p>No hay próximas excursiones para tu clase o globales.</p>'; }

                if (data.resumenProximaExcursionSuClase) {
                    const resumen = data.resumenProximaExcursionSuClase;
                    html += `<h5>Resumen Próxima Excursión de tu Clase: ${resumen.nombreExcursion || 'N/A'} (${resumen.fecha || 'N/A'})</h5>
                             <ul>
                                <li>Inscritos: ${resumen.totalInscritos ?? 0}</li>
                                <li>Autorizaciones Sí: ${resumen.autorizadosSi ?? 0} | No: ${resumen.autorizadosNo ?? 0}</li>
                                <li>Pagos Sí: ${resumen.pagadoSi ?? 0} | Parcial: ${resumen.pagadoParcial ?? 0} | No: ${resumen.pagadoNo ?? 0}</li>
                             </ul>`;
                } else if (data.proximasExcursiones && data.proximasExcursiones.length > 0) {
                     html += `<p>Selecciona una excursión para ver el detalle de participación.</p>`;
                }
            }
            dashboardSummaryContentDiv.innerHTML = html;
        } catch (error) { dashboardSummaryContentDiv.innerHTML = `<p class="error-message">Error cargando datos del dashboard.</p>`; }
    }

    // --- Gestión de Clases ---
    async function loadClases() {
        if (!clasesContentDiv || !currentToken) return;
        clasesContentDiv.innerHTML = '<p>Cargando listado de clases...</p>';
        try {
            const data = await apiFetch('/clases');
            let html = '<h3>Listado de Clases</h3>';
            if (currentUser.rol === 'DIRECCION') {
                html += `<button id="btnShowFormNuevaClase" class="success" style="margin-bottom:15px;">+ Añadir Nueva Clase</button>`;
            }
            html += `
                <table>
                    <thead><tr><th>Nombre Clase</th><th>Tutor Asignado</th><th>Email Tutor</th><th>Acciones</th></tr></thead>
                    <tbody>`;
            if (data.clases && data.clases.length > 0) {
                data.clases.forEach(clase => {
                    html += `
                        <tr>
                            <td>${clase.nombre_clase}</td>
                            <td>${clase.nombre_tutor || '<em>No asignado</em>'}</td>
                            <td>${clase.email_tutor || '<em>N/A</em>'}</td>
                            <td>
                                <button class="view-alumnos-clase secondary" data-claseid="${clase.id}" data-nclase="${clase.nombre_clase}">Ver Alumnos</button>
                                ${currentUser.rol === 'DIRECCION' ? `
                                    <button class="edit-clase warning" data-id="${clase.id}" data-nombre="${clase.nombre_clase}" data-tutorid="${clase.tutor_id || ''}">Editar</button>
                                    <button class="delete-clase danger" data-id="${clase.id}" data-nombre="${clase.nombre_clase}">Eliminar</button>
                                ` : ''}
                            </td>
                        </tr>`;
                });
            } else {
                html += '<tr><td colspan="4">No hay clases registradas.</td></tr>';
            }
            html += '</tbody></table><div id="formClaseWrapper" style="margin-top:20px;"></div>';
            clasesContentDiv.innerHTML = html;
            
            if(document.getElementById('btnShowFormNuevaClase')) document.getElementById('btnShowFormNuevaClase').onclick = () => showFormClase();
            clasesContentDiv.querySelectorAll('.edit-clase').forEach(b => b.onclick = (e) => showFormClase(e.target.dataset.id, e.target.dataset.nombre, e.target.dataset.tutorid));
            clasesContentDiv.querySelectorAll('.delete-clase').forEach(b => b.onclick = (e) => deleteClase(e.target.dataset.id, e.target.dataset.nombre));
            clasesContentDiv.querySelectorAll('.view-alumnos-clase').forEach(b => b.onclick = (e) => {
                sessionStorage.setItem('filtroAlumnosClaseId', e.target.dataset.claseid);
                sessionStorage.setItem('filtroAlumnosNombreClase', e.target.dataset.nclase);
                navigateTo('alumnos');
            });
        } catch (error) { clasesContentDiv.innerHTML = `<p class="error-message">Error al cargar clases.</p>`; }
    }

    async function showFormClase(idClase = null, nombreExistente = '', tutorIdExistente = '') {
        if (currentUser.rol !== 'DIRECCION') return;
        const formWrapper = document.getElementById('formClaseWrapper');
        if (!formWrapper) return;
        const tituloForm = idClase ? 'Editar Clase' : 'Añadir Nueva Clase';
        let tutoresOptionsHtml = '<option value="">-- Sin Asignar --</option>';
        try {
            const dataUsuarios = await apiFetch('/usuarios');
            if (dataUsuarios.usuarios) {
                dataUsuarios.usuarios.filter(u => u.rol === 'TUTOR').forEach(tutor => {
                    tutoresOptionsHtml += `<option value="${tutor.id}" ${parseInt(tutorIdExistente) === tutor.id ? 'selected' : ''}>${tutor.nombre_completo}</option>`;
                });
            }
        } catch (e) { console.error("Error cargando tutores:", e); }

        formWrapper.innerHTML = `
            <h4>${tituloForm}</h4>
            <form id="claseFormDetalle">
                <input type="hidden" id="claseIdForm" value="${idClase || ''}">
                <div><label for="nombreClaseForm">Nombre Clase:</label><input type="text" id="nombreClaseForm" value="${nombreExistente}" required></div>
                <div><label for="tutorIdForm">Tutor:</label><select id="tutorIdForm">${tutoresOptionsHtml}</select></div>
                <div class="form-buttons">
                    <button type="submit" class="success">${idClase ? 'Actualizar' : 'Crear'}</button>
                    <button type="button" onclick="document.getElementById('formClaseWrapper').innerHTML='';">Cancelar</button>
                </div>
            </form>`;
        document.getElementById('claseFormDetalle').onsubmit = saveClase;
    }

    async function saveClase(event) {
        event.preventDefault();
        if (currentUser.rol !== 'DIRECCION') return;
        const id = document.getElementById('claseIdForm').value;
        const nombre_clase = document.getElementById('nombreClaseForm').value.trim();
        let tutor_id = document.getElementById('tutorIdForm').value;
        tutor_id = tutor_id ? parseInt(tutor_id) : null;
        if (!nombre_clase) { alert("Nombre de clase obligatorio."); return; }
        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/clases/${id}` : '/clases';
        try {
            await apiFetch(endpoint, method, { nombre_clase, tutor_id });
            document.getElementById('formClaseWrapper').innerHTML = ''; loadClases();
        } catch (error) { showGlobalError(`Error guardando clase: ${error.message}`); }
    }

    async function deleteClase(idClase, nombreClase) {
        if (currentUser.rol !== 'DIRECCION') return;
        if (confirm(`¿Eliminar clase "${nombreClase}" (ID ${idClase})? Se borrarán sus alumnos y participaciones.`)) {
            try { await apiFetch(`/clases/${idClase}`, 'DELETE'); loadClases(); }
            catch (error) { showGlobalError(`Error eliminando clase: ${error.message}`); }
        }
    }
    
    // --- Alumnos (Esqueleto - necesitas completar renderizado y formularios) ---
    async function loadAlumnos() {
        if (!alumnosContentDiv || !currentToken) return;
        alumnosContentDiv.innerHTML = "<p>Cargando alumnos...</p>";
        const filtroClaseId = sessionStorage.getItem('filtroAlumnosClaseId');
        const filtroNombreClase = sessionStorage.getItem('filtroAlumnosNombreClase');
        // No limpiar sessionStorage aquí para que el filtro persista si el usuario navega y vuelve
        
        let endpoint = '/alumnos';
        let queryParams = new URLSearchParams();

        if (currentUser.rol === 'TUTOR') {
            if (!currentUser.claseId) { alumnosContentDiv.innerHTML = "<p>No tienes una clase asignada para ver alumnos.</p>"; return; }
            queryParams.append('claseId', currentUser.claseId);
        } else if (currentUser.rol === 'DIRECCION' && filtroClaseId) {
            queryParams.append('claseId', filtroClaseId);
        }
        if (queryParams.toString()) endpoint += `?${queryParams.toString()}`;
        
        try {
            const data = await apiFetch(endpoint);
            let titulo = `Alumnos`;
            if (filtroNombreClase) titulo += ` de la clase: ${filtroNombreClase}`;
            else if (currentUser.rol === 'TUTOR' && currentUser.claseNombre) titulo += ` de tu clase: ${currentUser.claseNombre}`;
            
            let html = `<h3>${titulo}</h3>`;
            // TODO: Dirección - Añadir select para filtrar por clase si no hay filtroClaseId
            // TODO: Botón "+ Añadir Nuevo Alumno" (para Dirección, o para Tutor a su clase)
            html += `<table><thead><tr><th>Nombre Completo</th><th>Clase</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.alumnos && data.alumnos.length > 0) {
                data.alumnos.forEach(a => {
                    html += `<tr><td>${a.nombre_completo}</td><td>${a.nombre_clase}</td><td>
                                <button class="edit-alumno warning" data-id="${a.id}">Editar</button>
                                <button class="delete-alumno danger" data-id="${a.id}">Eliminar</button>
                             </td></tr>`;
                });
            } else { html += `<tr><td colspan="3">No hay alumnos para mostrar según el filtro actual.</td></tr>`; }
            html += `</tbody></table><div id="formAlumnoWrapper" style="margin-top:20px;"></div>`;
            alumnosContentDiv.innerHTML = html;
            // TODO: Añadir listeners para botones de editar/eliminar alumno y mostrar formulario
        } catch (e) { alumnosContentDiv.innerHTML = `<p class="error-message">Error cargando alumnos.</p>`;}
    }


    // --- Excursiones (Esqueleto) ---
    async function loadExcursiones() {
        if (!excursionesContentDiv || !currentToken) return;
        excursionesContentDiv.innerHTML = "<p>Cargando excursiones...</p>";
         try {
            const data = await apiFetch('/excursiones');
            let html = '<h3>Listado de Excursiones</h3>';
            // TODO: Botón "+ Añadir Nueva Excursión" (para Dirección y Tutores)
            html += `<table><thead><tr><th>Nombre</th><th>Fecha</th><th>Coste</th><th>Creador</th><th>Para Clase</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.excursiones && data.excursiones.length > 0) {
                data.excursiones.forEach(ex => {
                    html += `<tr><td>${ex.nombre_excursion}</td><td>${ex.fecha_excursion||'--'}</td><td>${(ex.coste_excursion_alumno||0).toFixed(2)}€</td><td>${ex.nombre_creador}</td><td>${ex.nombre_clase_especifica||'Global'}</td><td>
                                <button class="view-participantes secondary" data-excursionid="${ex.id}" data-nexcursion="${ex.nombre_excursion}">Participantes</button>
                                </td></tr>`;
                });
            } else { html += '<tr><td colspan="6">No hay excursiones.</td></tr>'; }
            html += `</tbody></table><div id="formExcursionWrapper"></div>`;
            excursionesContentDiv.innerHTML = html;
            excursionesContentDiv.querySelectorAll('.view-participantes').forEach(b => b.onclick=(e)=>{
                sessionStorage.setItem('filtroParticipantesExcursionId', e.target.dataset.excursionid);
                sessionStorage.setItem('filtroParticipantesNombreExcursion', e.target.dataset.nexcursion);
                navigateTo('participaciones');
            });
        } catch (e) { excursionesContentDiv.innerHTML = `<p class="error-message">Error cargando excursiones.</p>`;}
    }

    // --- Participaciones (Esqueleto) ---
    async function loadParticipaciones() {
        if (!participacionesContentDiv || !currentToken) return;
        const excursionId = sessionStorage.getItem('filtroParticipantesExcursionId');
        const nombreExcursion = sessionStorage.getItem('filtroParticipantesNombreExcursion');
        
        let html = `<h3>Participaciones: ${nombreExcursion || 'Selecciona una excursión'}</h3>`;
        // TODO: Para Dirección, añadir select de Clase para filtrar participaciones
        // Para Tutor, el backend ya filtra por su clase si se pasa excursionId

        if (!excursionId) {
            participacionesContentDiv.innerHTML = html + "<p>Por favor, selecciona una excursión desde la sección 'Excursiones' para ver sus participantes.</p>";
            return;
        }
        html += `<div id="participacionesTableContainer"><p>Cargando participaciones...</p></div>
                 <div id="formParticipacionWrapper" style="margin-top:20px;"></div>`;
        participacionesContentDiv.innerHTML = html;

        try {
            const data = await apiFetch(`/participaciones?excursionId=${excursionId}`); // Tutor ya está filtrado por clase en backend
            let tableHtml = '<table><thead><tr><th>Alumno</th><th>Clase</th><th>Autorización</th><th>Pago</th><th>Cantidad Pagada</th><th>Acciones</th></tr></thead><tbody>';
            if (data.participaciones && data.participaciones.length > 0) {
                data.participaciones.forEach(p => {
                    tableHtml += `<tr><td>${p.nombre_alumno}</td><td>${p.nombre_clase}</td>
                                 <td>${p.autorizacion_firmada}</td><td>${p.pago_realizado}</td><td>${(p.cantidad_pagada||0).toFixed(2)}€</td>
                                 <td><button class="edit-participacion warning" data-id="${p.id}">Editar</button></td></tr>`;
                });
            } else { tableHtml += `<tr><td colspan="6">No hay participaciones registradas para esta excursión ${currentUser.rol==='TUTOR'? 'en tu clase':''}.</td></tr>`; }
            tableHtml += '</tbody></table>';
            document.getElementById('participacionesTableContainer').innerHTML = tableHtml;
            // TODO: Botón para "Añadir Alumno a Excursión" (Tutor para su clase, Dirección para cualquiera)
            // TODO: Listeners para botones de editar participación -> mostrar un formulario de edición.
        } catch (e) { document.getElementById('participacionesTableContainer').innerHTML = `<p class="error-message">Error cargando participaciones.</p>`;}
    }
    
    // --- Admin Usuarios (Solo Dirección - Esqueleto) ---
    async function loadAdminUsuarios() {
        if (!adminUsuariosContentDiv || !currentUser || currentUser.rol !== 'DIRECCION') return;
        adminUsuariosContentDiv.innerHTML = "<p>Cargando usuarios...</p>";
        try {
            const data = await apiFetch('/usuarios');
            let html = '<h3>Gestión de Cuentas de Usuario</h3>';
            // TODO: Botón "+ Añadir Nuevo Usuario"
            html += `<table><thead><tr><th>Email</th><th>Nombre</th><th>Rol</th><th>Clase Asignada</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.usuarios && data.usuarios.length > 0) {
                // Necesitaríamos la lista de clases para mostrar el nombre de la clase asignada al tutor
                const clasesData = await apiFetch('/clases');
                const claseMap = new Map(clasesData.clases.map(c => [c.id, c.nombre_clase]));

                data.usuarios.forEach(u => {
                    let claseNombreAsignada = 'N/A';
                    if (u.rol === 'TUTOR') {
                        // Buscar la clase donde este usuario es tutor_id
                        const claseAsignadaAlTutor = clasesData.clases.find(c => c.tutor_id === u.id);
                        claseNombreAsignada = claseAsignadaAlTutor ? claseAsignadaAlTutor.nombre_clase : '<em>No asignada aún</em>';
                    }
                    html += `<tr><td>${u.email}</td><td>${u.nombre_completo}</td><td>${u.rol}</td><td>${claseNombreAsignada}</td>
                                 <td><button class="edit-usuario-admin warning" data-id="${u.id}">Editar</button> 
                                     <button class="delete-usuario-admin danger" data-id="${u.id}">Eliminar</button>
                                 </td></tr>`;
                });
            } else { html += `<tr><td colspan="5">No hay usuarios.</td></tr>`; }
            html += `</tbody></table><div id="formAdminUsuarioWrapper" style="margin-top:20px;"></div>`;
            adminUsuariosContentDiv.innerHTML = html;
            // TODO: Añadir listeners y funciones showFormAdminUsuario, saveAdminUsuario, deleteAdminUsuario
        } catch (e) { adminUsuariosContentDiv.innerHTML = `<p class="error-message">Error cargando usuarios.</p>`;}
    }

    // --- INICIALIZACIÓN DE LA APP ---
    checkInitialLoginState();
});
