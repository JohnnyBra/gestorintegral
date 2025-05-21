// --- public/app.js (Revisado y Mejorado a partir de tu versión) ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Estado Global del Frontend ---
    let currentUser = null;
    let currentToken = null;

    // --- URLs y Selectores del DOM ---
    const API_BASE_URL = `http://192.168.1.7:3000/api`; // Tu IP específica

    const loginSection = document.getElementById('login-section');
    const loginForm = document.getElementById('loginForm');
    const loginErrorP = document.getElementById('loginError');
    const authStatusDiv = document.getElementById('auth-status');
    const userInfoDisplay = document.getElementById('userInfoDisplay');
    const authButton = document.getElementById('auth_button');
    const signoutButton = document.getElementById('signout_button');

    const mainNavSidebar = document.getElementById('main-nav-sidebar');
    const navLinks = document.querySelectorAll('#main-nav-sidebar a');
    const mainSections = document.querySelectorAll('.main-section');
    
    const dashboardSummaryContentDiv = document.getElementById('dashboard-summary-content');
    const clasesContentDiv = document.getElementById('clases-content');
    const alumnosContentDiv = document.getElementById('alumnos-content');
    const excursionesContentDiv = document.getElementById('excursiones-content');
    const participacionesContentDiv = document.getElementById('participaciones-content');
    const adminUsuariosContentDiv = document.getElementById('admin-usuarios-content');

    console.log("app.js cargado y DOMContentLoaded disparado. API_BASE_URL:", API_BASE_URL);
    if (!loginForm) console.error("Elemento loginForm NO encontrado.");


    // --- Funciones Auxiliares ---
    async function apiFetch(endpoint, method = 'GET', body = null, token = currentToken) {
        const url = `${API_BASE_URL}${endpoint}`;
        console.log(`[apiFetch] INICIO: ${method} ${url}`); // Log con URL correcta

        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const options = { method, headers };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
            console.log("[apiFetch] Body (stringified):", options.body);
        } else if (body) {
            console.warn(`[apiFetch] Se proporcionó body para un método ${method} que no lo usa.`);
        }
        console.log("[apiFetch] Opciones completas para fetch:", options);

        try {
            console.log(`[apiFetch] Intentando fetch a: ${url}`);
            const response = await fetch(url, options);
            console.log(`[apiFetch] Fetch realizado a ${url}. Status: ${response.status} ${response.statusText}`);

            if (response.status === 204) {
                console.log("[apiFetch] Respuesta 204 No Content. Retornando null.");
                return null; 
            }
            
            const responseText = await response.text();
            console.log(`[apiFetch] ResponseText (primeros 500 chars): ${responseText.substring(0, 500)}`);

            let responseData;
            try {
                responseData = responseText ? JSON.parse(responseText) : {};
            } catch (e) {
                console.error(`[apiFetch] Error parseando respuesta JSON de ${url}. Status: ${response.status}. Error de parseo: ${e.message}`);
                if (response.ok) {
                    throw new Error("Respuesta del servidor no es JSON válido a pesar de un estado OK.");
                } else {
                    throw new Error(`Error HTTP ${response.status} (${response.statusText}). El servidor devolvió una respuesta no JSON (probablemente HTML de error).`);
                }
            }
            
            if (!response.ok) {
                console.warn(`[apiFetch] Respuesta no OK (${response.status}) desde ${url}. Error en JSON:`, responseData.error || "No hay campo 'error' en JSON");
                if (response.status === 401 || response.status === 403) {
                    if (typeof handleLogout === "function") handleLogout(); 
                    else console.error("handleLogout no está definida para apiFetch en error 401/403");
                    alert(responseData.error || "Sesión inválida o acceso denegado. Por favor, inicia sesión de nuevo.");
                }
                throw new Error(responseData.error || `Error HTTP ${response.status}`);
            }
            console.log("[apiFetch] Retornando responseData:", responseData);
            return responseData;
        } catch (error) {
            console.error(`[apiFetch] CATCH BLOCK GENERAL (${method} ${url}):`, error.message, error.name);
            if (error.message.toLowerCase().includes("failed to fetch")) {
                showGlobalError("No se pudo conectar con el servidor (Failed to fetch). Verifica que el backend esté corriendo y accesible en la red.");
            } else if (!error.message.toLowerCase().includes("sesión inválida") && 
                       !error.message.toLowerCase().includes("token no proporcionado") &&
                       !error.message.toLowerCase().includes("token expirado") &&
                       !error.message.toLowerCase().includes("token inválido")
                      ) {
                 showGlobalError(error.message);
            }
            throw error; 
        }
    }

    function showGlobalError(message) {
        console.error("ERROR APP:", message);
        if (loginErrorP && loginSection && loginSection.style.display === 'block') { // Mostrar en el form de login si está visible
            loginErrorP.textContent = message;
        } else {
            alert(`Error en la aplicación: ${message}`); // Alert como fallback
        }
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
            const emailInput = document.getElementById('email');
            const passwordInput = document.getElementById('password');
            if (!emailInput || !passwordInput) { console.error("Inputs de login no encontrados."); return; }
            const email = emailInput.value;
            const password = passwordInput.value;
            console.log("Login form submitted. Email:", email); // Tu línea 109
             // Deshabilitar el botón de submit para evitar múltiples clics
            const submitButton = loginForm.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;

            try {
                // La función apiFetch ahora tiene más logs internos
                const data = await apiFetch('/auth/login', 'POST', { email, password }, null);
                console.log("Respuesta de /auth/login en el listener del form:", data);

                if (data && data.token && data.user) {
                    handleLoginSuccess(data.user, data.token);
                } else { 
                    const errorMsg = (data && data.error) || "Respuesta de login inesperada del servidor.";
                    console.warn("Login no exitoso o datos inesperados:", errorMsg);
                    if (loginErrorP) loginErrorP.textContent = errorMsg;
                }
            } catch (error) { 
                console.error("Catch en listener de loginForm:", error.message);
                // apiFetch ya llama a showGlobalError, que podría poner el mensaje en loginErrorP o alert.
                // Si loginErrorP está vacío, ponemos un mensaje genérico.
                if (loginErrorP && !loginErrorP.textContent) {
                    loginErrorP.textContent = error.message.includes("Credenciales incorrectas") ? error.message : "Error al intentar iniciar sesión.";
                }
            } finally {
                if (submitButton) submitButton.disabled = false; // Volver a habilitar
            }
        });
    }

    function handleLoginSuccess(user, token) {
        console.log("Login exitoso para:", user.email);
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
        // Puedes añadir más adaptaciones de menú aquí si es necesario
    }

    function checkInitialLoginState() {
        console.log("Ejecutando checkInitialLoginState..."); // Tu línea 33
        const token = localStorage.getItem('authToken');
        const userStr = localStorage.getItem('userInfo');
        if (token && userStr) {
            console.log("Token y userInfo encontrados en localStorage.");
            try {
                const user = JSON.parse(userStr);
                // Validar token con el backend para asegurar que no ha expirado o sido revocado
                apiFetch('/auth/me', 'GET', null, token)
                    .then(data => {
                        if (data && data.usuario) {
                            console.log("Token validado con /auth/me, usuario:", data.usuario.email);
                            handleLoginSuccess(data.usuario, token); // Usar el usuario del token validado
                        } else { 
                            console.warn("/auth/me no devolvió usuario o data fue null, cerrando sesión.");
                            handleLogout(); 
                        }
                    }).catch((error) => { // Error en el fetch a /auth/me (ej. token expirado, red)
                        console.warn("Error validando token con /auth/me, cerrando sesión. Error:", error.message);
                        handleLogout();
                    });
            } catch (e) { console.error("Error parseando userInfo de localStorage:", e); handleLogout(); }
        } else {
            console.log("No hay token/userInfo en localStorage. Mostrando UI de logout y navegando a login.");
            updateUIAfterLogout();
            navigateTo('login'); // Tu línea 178 (el número puede variar según tus logs)
        }
    }

    // --- Navegación ---
    function navigateTo(sectionName) {
        console.log("Navegando a sección:", sectionName);
        mainSections.forEach(s => { if(s) s.style.display = 'none';});
        navLinks.forEach(l => { if(l) l.classList.remove('active');});
        if (loginSection) loginSection.style.display = 'none';

        const activeSectionDiv = document.getElementById(`${sectionName}-section`);
        const activeLink = document.querySelector(`#main-nav-sidebar a[data-section="${sectionName}"]`);

        if (sectionName === 'login') {
            if (loginSection) loginSection.style.display = 'block';
            // No llamar a loadContentForSection para 'login'
        } else if (activeSectionDiv) {
            activeSectionDiv.style.display = 'block';
            if (activeLink) activeLink.classList.add('active'); // Estilo para el link activo
            loadContentForSection(sectionName);
        } else {
            console.warn(`Div de sección '${sectionName}-section' no encontrado en navigateTo.`);
            const contentArea = document.querySelector('main.content-area');
            if (contentArea) contentArea.innerHTML = `<p>Error: La sección '${sectionName}' no está definida en el HTML.</p>`;
        }
    }
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            if (currentToken || section === 'login') navigateTo(section); // Permitir ir a login si no hay token
            else {
                console.log("Intento de navegación sin token a sección protegida:", section);
                navigateTo('login'); // Forzar login si no hay token e intenta ir a otra parte
            }
        });
    });

    // --- Carga de Contenido para Secciones ---
    function loadContentForSection(sectionName) {
        if (sectionName === 'login') return; // El contenido de login es estático
        if (!currentToken) { navigateTo('login'); return; }
        console.log("Cargando contenido dinámico para:", sectionName);
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
                else console.warn(`Div para la sección por defecto '${sectionName}-section' no encontrado.`);
        }
    }

    // --- Dashboard --- (Como lo tenías, asegúrate que usa `currentUser` para el rol)
 async function loadDashboardData() {
    if (!dashboardSummaryContentDiv) {
        console.error("Elemento dashboardSummaryContentDiv no encontrado.");
        return;
    }
    if (!currentToken) {
        console.warn("loadDashboardData: No hay token, no se puede cargar.");
        // Opcional: podrías llamar a handleLogout() aquí si no debería pasar
        dashboardSummaryContentDiv.innerHTML = '<p class="error-message">Error de sesión. Por favor, inicia sesión de nuevo.</p>';
        return;
    }

    dashboardSummaryContentDiv.innerHTML = "<p>Cargando resumen del dashboard...</p>"; // Mensaje de carga
    console.log("[loadDashboardData] Iniciando carga de datos del dashboard...");

    try {
        const data = await apiFetch('/dashboard/summary'); // Llama a GET /api/dashboard/summary
        console.log("[loadDashboardData] Datos recibidos del backend:", data);

        if (!data) {
            console.warn("[loadDashboardData] No se recibieron datos (null o undefined) del backend.");
            dashboardSummaryContentDiv.innerHTML = `<p class="error-message">No se pudo obtener el resumen del dashboard del servidor.</p>`;
            return;
        }

        let html = '<h4>Resumen General</h4>';
        // Renderizar datos de Dirección
        if (currentUser && currentUser.rol === 'DIRECCION') {
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
        // Renderizar datos de Tutor
        if (currentUser && currentUser.rol === 'TUTOR') {
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
                const r = data.resumenProximaExcursionSuClase;
                html += `<h5>Resumen Próxima Excursión (${r.nombreExcursion||'N/A'} - ${r.fecha||'N/A'}):</h5>
                         <ul>
                            <li>Inscritos: ${r.totalInscritos ?? 0}</li>
                            <li>Autoriz. Sí: ${r.autorizadosSi ?? 0} | No: ${r.autorizadosNo ?? 0}</li>
                            <li>Pagos Sí: ${r.pagadoSi ?? 0} | Parcial: ${r.pagadoParcial ?? 0} | No: ${r.pagadoNo ?? 0}</li>
                         </ul>`;
            } else if (data.proximasExcursiones && data.proximasExcursiones.length > 0) { 
                 html += `<p>Aún no hay datos de participación para la excursión más próxima de tu clase.</p>`;
            } else {
                // No hay próximas excursiones para el tutor, no se muestra nada más de resumen.
            }
        }
        console.log("[loadDashboardData] HTML generado para el dashboard:", html.substring(0, 200) + "..."); // Loguear una parte del HTML
        dashboardSummaryContentDiv.innerHTML = html;
    } catch (error) {
        console.error("[loadDashboardData] Error capturado al cargar datos del dashboard:", error.message);
        dashboardSummaryContentDiv.innerHTML = `<p class="error-message">Error al cargar los datos del dashboard: ${error.message}</p>`;
    }
}
    // --- Gestión de Clases --- (Renderizado y lógica de formularios completa)
    async function loadClases() {
        if (!clasesContentDiv || !currentToken) return;
        clasesContentDiv.innerHTML = '<p>Cargando clases...</p>';
        try {
            const data = await apiFetch('/clases');
            let html = '<h3>Listado de Clases</h3>';
            if (currentUser.rol === 'DIRECCION') html += `<button id="btnShowFormNuevaClase" class="success" style="margin-bottom:15px;">+ Añadir Nueva Clase</button>`;
            html += `<table class="tabla-datos"><thead><tr><th>Nombre Clase</th><th>Tutor Asignado</th><th>Email Tutor</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.clases && data.clases.length > 0) {
                data.clases.forEach(clase => {
                    html += `<tr data-clase-id="${clase.id}"><td>${clase.nombre_clase}</td><td>${clase.nombre_tutor || '<em>No asignado</em>'}</td><td>${clase.email_tutor || '<em>N/A</em>'}</td><td class="actions-cell">
                        <button class="view-alumnos-clase secondary" data-claseid="${clase.id}" data-nclase="${clase.nombre_clase}">Ver Alumnos</button>
                        ${currentUser.rol === 'DIRECCION' ? `<button class="edit-clase warning" data-id="${clase.id}" data-nombre="${clase.nombre_clase}" data-tutorid="${clase.tutor_id || ''}">Editar</button> <button class="delete-clase danger" data-id="${clase.id}" data-nombre="${clase.nombre_clase}">Eliminar</button>` : ''}
                        </td></tr>`;});
            } else html += '<tr><td colspan="4" style="text-align:center;">No hay clases registradas.</td></tr>';
            html += '</tbody></table><div id="formClaseWrapper" class="form-wrapper" style="margin-top:20px;"></div>';
            clasesContentDiv.innerHTML = html;
            if(document.getElementById('btnShowFormNuevaClase')) document.getElementById('btnShowFormNuevaClase').onclick = () => showFormClase();
            clasesContentDiv.querySelectorAll('.edit-clase').forEach(b => b.onclick=(e)=>showFormClase(e.target.dataset.id, e.target.dataset.nombre, e.target.dataset.tutorid));
            clasesContentDiv.querySelectorAll('.delete-clase').forEach(b => b.onclick=(e)=>deleteClase(e.target.dataset.id, e.target.dataset.nombre));
            clasesContentDiv.querySelectorAll('.view-alumnos-clase').forEach(b => b.onclick=(e)=>{ sessionStorage.setItem('filtroAlumnosClaseId',e.target.dataset.claseid); sessionStorage.setItem('filtroAlumnosNombreClase',e.target.dataset.nclase); navigateTo('alumnos'); });
        } catch (error) { clasesContentDiv.innerHTML = `<p class="error-message">Error al cargar clases: ${error.message}</p>`; }
    }
    async function showFormClase(idClase = null, nombreExistente = '', tutorIdExistente = '') { /* ... (como te la di antes, es bastante completa) ... */ }
    async function saveClase(event) { /* ... (como te la di antes) ... */ }
    async function deleteClase(idClase, nombreClase) { /* ... (como te la di antes) ... */ }

    // --- Alumnos --- (Esqueleto para completar, similar a Clases)
    async function loadAlumnos(claseIdFiltro = null, nombreClaseFiltro = null) { /* ... (como te la di antes, es bastante completa) ... */ }
    async function showFormAlumno(idAlumno = null, listaTodasClases = null, nombreExistente = '', claseIdExistente = '') { /* ... (necesitas implementarla) ... */ }
    async function saveAlumno(event) { /* ... (necesitas implementarla) ... */ }
    async function deleteAlumno(idAlumno, nombreAlumno) { /* ... (necesitas implementarla) ... */ }

    // --- Excursiones --- (Esqueleto para completar)
    async function loadExcursiones() { if (!excursionesContentDiv) return; excursionesContentDiv.innerHTML = "<p>Cargando excursiones...</p>"; /* ... Fetch y render tabla ... */ }
    // showFormExcursion, saveExcursion, deleteExcursion

    // --- Participaciones --- (Esqueleto para completar)
    async function loadParticipaciones() { if (!participacionesContentDiv) return; participacionesContentDiv.innerHTML = "<p>Cargando participaciones...</p>"; /* ... Fetch con filtros y render tabla ... */ }
    // showFormParticipacion (para editar una), saveParticipacion

    // --- Admin Usuarios (Solo Dirección - Esqueleto) ---
    async function loadAdminUsuarios() { if (!adminUsuariosContentDiv || !currentUser || currentUser.rol !== 'DIRECCION') return; adminUsuariosContentDiv.innerHTML = "<p>Cargando usuarios...</p>"; /* ... Fetch /api/usuarios y render tabla ... */ }
    // showFormAdminUsuario, saveAdminUsuario, deleteAdminUsuario


    // --- INICIALIZACIÓN DE LA APP ---
    checkInitialLoginState();
}); // Fin de DOMContentLoaded

    // --- Gestión de Clases ---
    async function loadClases() { /* ... (código completo que te di para loadClases) ... */ }
    async function showFormClase(idClase = null, nombreExistente = '', tutorIdExistente = '') { /* ... (código completo que te di) ... */ }
    async function saveClase(event) { /* ... (código completo que te di) ... */ }
    async function deleteClase(idClase, nombreClase) { /* ... (código completo que te di) ... */ }

    // --- Gestión de Alumnos ---
    async function loadAlumnos() {
        if (!alumnosContentDiv || !currentToken) return;
        alumnosContentDiv.innerHTML = "<p>Cargando alumnos...</p>";
        const filtroClaseId = sessionStorage.getItem('filtroAlumnosClaseId');
        const filtroNombreClase = sessionStorage.getItem('filtroAlumnosNombreClase');
        
        let endpoint = '/alumnos';
        let queryParams = new URLSearchParams();
        let titulo = "Alumnos";

        if (currentUser.rol === 'TUTOR') {
            if (!currentUser.claseId) { alumnosContentDiv.innerHTML = "<p>No tienes clase asignada para ver alumnos.</p>"; return; }
            queryParams.append('claseId', currentUser.claseId);
            titulo += ` de tu clase: ${currentUser.claseNombre}`;
        } else if (currentUser.rol === 'DIRECCION') {
            if (filtroClaseId) {
                queryParams.append('claseId', filtroClaseId);
                titulo += ` de la clase: ${filtroNombreClase}`;
            } else { titulo += ` (Todas las Clases)`; }
        }
        if (queryParams.toString()) endpoint += `?${queryParams.toString()}`;
        
        try {
            const data = await apiFetch(endpoint);
            const dataClases = (currentUser.rol === 'DIRECCION') ? await apiFetch('/clases') : null;
            listaDeClasesGlobal = dataClases ? dataClases.clases : []; // Cachear para el form
            
            let html = `<h3>${titulo}</h3>`;
            if (currentUser.rol === 'DIRECCION' && !filtroClaseId) {
                html += `<div style="margin-bottom:15px;">Filtrar por clase: <select id="selectFiltroClaseAlumnos"><option value="">Todas</option>`;
                listaDeClasesGlobal.forEach(cl => html += `<option value="${cl.id}">${cl.nombre_clase}</option>`);
                html += `</select></div>`;
            } else if (filtroClaseId && currentUser.rol === 'DIRECCION') {
                 html += `<button onclick="sessionStorage.removeItem('filtroAlumnosClaseId'); sessionStorage.removeItem('filtroAlumnosNombreClase'); loadAlumnos();" class="secondary" style="margin-bottom:15px;">Mostrar Todos</button>`;
            }

            if (currentUser.rol === 'DIRECCION' || (currentUser.rol === 'TUTOR' && currentUser.claseId)) {
                html += `<button id="btnShowFormNuevoAlumno" class="success" style="margin-bottom:15px;">+ Añadir Alumno ${currentUser.rol === 'TUTOR' ? 'a mi clase' : ''}</button>`;
            }
            html += `<table class="tabla-datos"><thead><tr><th>Nombre Completo</th><th>Clase</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.alumnos && data.alumnos.length > 0) {
                data.alumnos.forEach(a => { html += `<tr data-alumno-id="${a.id}"><td>${a.nombre_completo}</td><td>${a.nombre_clase}</td><td>
                    <button class="edit-alumno warning" data-id="${a.id}">Editar</button>
                    <button class="delete-alumno danger" data-id="${a.id}" data-nombre="${a.nombre_completo}">Eliminar</button>
                    </td></tr>`; });
            } else { html += `<tr><td colspan="3" style="text-align:center;">No hay alumnos.</td></tr>`; }
            html += `</tbody></table><div id="formAlumnoWrapper" class="form-wrapper" style="margin-top:20px;"></div>`;
            alumnosContentDiv.innerHTML = html;

            if(document.getElementById('btnShowFormNuevoAlumno')) document.getElementById('btnShowFormNuevoAlumno').onclick = () => showFormAlumno();
            alumnosContentDiv.querySelectorAll('.edit-alumno').forEach(b => b.onclick = async (e) => {
                const alumnoId = e.target.dataset.id;
                try { const dataAlumno = await apiFetch(`/alumnos/${alumnoId}`); showFormAlumno(alumnoId, dataAlumno.alumno);} // Pasar alumnoData
                catch(err){showGlobalError("Error cargando alumno para editar.");}
            });
            alumnosContentDiv.querySelectorAll('.delete-alumno').forEach(b => b.onclick = (e) => deleteAlumno(e.target.dataset.id, e.target.dataset.nombre));
            
            if (document.getElementById('selectFiltroClaseAlumnos')) {
                const selectFiltro = document.getElementById('selectFiltroClaseAlumnos');
                if (sessionStorage.getItem('filtroAlumnosClaseId')) selectFiltro.value = sessionStorage.getItem('filtroAlumnosClaseId');
                selectFiltro.onchange = (e) => {
                    if (e.target.value) {
                        sessionStorage.setItem('filtroAlumnosClaseId', e.target.value);
                        sessionStorage.setItem('filtroAlumnosNombreClase', e.target.options[e.target.selectedIndex].text);
                    } else { sessionStorage.removeItem('filtroAlumnosClaseId'); sessionStorage.removeItem('filtroAlumnosNombreClase');}
                    loadAlumnos();
                };
            }
        } catch (e) { alumnosContentDiv.innerHTML = `<p class="error-message">Error cargando alumnos: ${e.message}</p>`;}
    }
    async function showFormAlumno(idAlumno = null, alumnoData = null) {
        const formWrapper = document.getElementById('formAlumnoWrapper'); if (!formWrapper) return;
        const editando = idAlumno && alumnoData;
        const titulo = editando ? 'Editar Alumno' : 'Añadir Nuevo Alumno';
        const nombreExistente = editando ? alumnoData.nombre_completo : '';
        const claseIdExistente = editando ? alumnoData.clase_id : (currentUser.rol === 'TUTOR' ? currentUser.claseId : '');
        
        let clasesOptHtml = '';
        if (currentUser.rol === 'DIRECCION') {
            // Reusar listaDeClasesGlobal si ya está cargada, o cargarla
            if (listaDeClasesGlobal.length === 0) { try {const d=await apiFetch('/clases'); listaDeClasesGlobal=d.clases;}catch(e){console.error(e);}}
            listaDeClasesGlobal.forEach(cl => clasesOptHtml += `<option value="${cl.id}" ${claseIdExistente === cl.id ? 'selected' : ''}>${cl.nombre_clase}</option>`);
        }

        formWrapper.innerHTML = `<h4>${titulo}</h4>
            <form id="alumnoFormDetalle" style="border:1px solid #ddd; padding:15px; border-radius:5px;">
                <input type="hidden" id="alumnoIdForm" value="${idAlumno||''}"/>
                <div><label>Nombre Completo:</label><input type="text" id="nombreAlumnoForm" value="${nombreExistente}" required/></div>
                ${currentUser.rol==='DIRECCION' ? `<div><label>Clase:</label><select id="claseIdAlumnoForm" required>${clasesOptHtml}</select></div>` 
                                               : `<input type="hidden" id="claseIdAlumnoForm" value="${currentUser.claseId || ''}"> <p>Clase: ${currentUser.claseNombre || 'Error: Tutor sin clase'}</p>`}
                <div class="form-buttons"><button type="submit" class="success">${editando?'Actualizar':'Crear'}</button><button type="button" onclick="document.getElementById('formAlumnoWrapper').innerHTML='';document.getElementById('formAlumnoWrapper').style.display='none';">Cancelar</button></div>
            </form>`;
        formWrapper.style.display='block'; document.getElementById('alumnoFormDetalle').onsubmit = saveAlumno;
    }
    async function saveAlumno(event) {
        event.preventDefault();
        const id = document.getElementById('alumnoIdForm').value;
        const nombre_completo = document.getElementById('nombreAlumnoForm').value.trim();
        const claseIdInput = document.getElementById('claseIdAlumnoForm'); // Existe para ambos roles
        if (!claseIdInput) { showGlobalError("Error: No se encontró el campo de clase."); return; }
        const clase_id = parseInt(claseIdInput.value);

        if (!nombre_completo || !clase_id) { alert("Nombre y clase son obligatorios."); return; }
        const method=id?'PUT':'POST', endpoint=id?`/alumnos/${id}`:'/alumnos';
        try { await apiFetch(endpoint, method, {nombre_completo, clase_id}); document.getElementById('formAlumnoWrapper').innerHTML=''; loadAlumnos(); }
        catch (error) { showGlobalError(`Error guardando alumno: ${error.message}`); }
    }
    async function deleteAlumno(idAlumno, nombreAlumno) {
        if (confirm(`¿Eliminar alumno "${nombreAlumno||`ID ${idAlumno}`}"?`)) {
            try { await apiFetch(`/alumnos/${idAlumno}`, 'DELETE'); loadAlumnos(); }
            catch (error) { showGlobalError(`Error eliminando alumno: ${error.message}`); }
        }
    }

    // --- Excursiones ---
    async function loadExcursiones() {
        if (!excursionesContentDiv || !currentToken) return;
        excursionesContentDiv.innerHTML = "<p>Cargando excursiones...</p>";
        try {
            const data = await apiFetch('/excursiones');
            listaDeExcursionesGlobal = data.excursiones || []; // Cachear
            let html = `<h3>Listado de Excursiones</h3>`;
            if (currentUser.rol === 'DIRECCION' || currentUser.rol === 'TUTOR') {
                html += `<button id="btnShowFormNuevaExcursion" class="success" style="margin-bottom:15px;">+ Añadir Nueva Excursión</button>`;
            }
            html += `<table class="tabla-datos"><thead><tr><th>Nombre</th><th>Fecha</th><th>Coste (€)</th><th>Creador</th><th>Para Clase</th><th>Acciones</th></tr></thead><tbody>`;
            if (listaDeExcursionesGlobal.length > 0) {
                listaDeExcursionesGlobal.forEach(ex => {
                    html += `<tr data-excursion-id="${ex.id}"><td>${ex.nombre_excursion}</td><td>${ex.fecha_excursion||'--'}</td><td>${(ex.coste_excursion_alumno||0).toFixed(2)}</td><td>${ex.nombre_creador}</td><td>${ex.nombre_clase_especifica||'Global'}</td><td>
                        <button class="view-participantes secondary" data-excursionid="${ex.id}" data-nexcursion="${ex.nombre_excursion}">Participantes</button>
                        ${ (currentUser.rol==='DIRECCION' || (currentUser.rol==='TUTOR' && ex.creada_por_usuario_id === currentUser.id)) ? 
                           `<button class="edit-excursion warning" data-id="${ex.id}">Editar</button> <button class="delete-excursion danger" data-id="${ex.id}" data-nombre="${ex.nombre_excursion}">Eliminar</button>` : ''}
                        </td></tr>`;
                });
            } else { html += `<tr><td colspan="6" style="text-align:center;">No hay excursiones.</td></tr>`; }
            html += `</tbody></table><div id="formExcursionWrapper" class="form-wrapper" style="margin-top:20px;"></div>`;
            excursionesContentDiv.innerHTML = html;

            if(document.getElementById('btnShowFormNuevaExcursion')) document.getElementById('btnShowFormNuevaExcursion').onclick = () => showFormExcursion();
            excursionesContentDiv.querySelectorAll('.edit-excursion').forEach(b=>b.onclick= async (e)=>{ const id = e.target.dataset.id; try{const d=await apiFetch(`/excursiones/${id}`); showFormExcursion(id, d.excursion);}catch(er){showGlobalError("Error cargando excursión.");}});
            excursionesContentDiv.querySelectorAll('.delete-excursion').forEach(b=>b.onclick=(e)=>deleteExcursion(e.target.dataset.id, e.target.dataset.nombre));
            excursionesContentDiv.querySelectorAll('.view-participantes').forEach(b=>b.onclick=(e)=>{ sessionStorage.setItem('filtroParticipantesExcursionId',e.target.dataset.excursionid); sessionStorage.setItem('filtroParticipantesNombreExcursion',e.target.dataset.nexcursion); navigateTo('participaciones');});
        } catch (e) { excursionesContentDiv.innerHTML = `<p class="error-message">Error cargando excursiones.</p>`;}
    }
    async function showFormExcursion(idExcursion = null, excursionData = null) {
        const formWrapper = document.getElementById('formExcursionWrapper'); if (!formWrapper) return;
        const editando = idExcursion && excursionData;
        const titulo = editando ? 'Editar Excursión' : 'Nueva Excursión';
        let ed = editando ? excursionData : { nombre_excursion:'', fecha_excursion:'', coste_excursion_alumno:0, vestimenta:'', transporte:'', notas_excursion:'', para_clase_id: null};

        let clasesOptHtml = '<option value="">-- Global (para todas las clases) --</option>';
        // Solo Dirección puede asignar a una clase específica o hacerla global. Tutor crea para su clase.
        if (currentUser.rol === 'DIRECCION') {
            if (listaDeClasesGlobal.length === 0) { try {const d=await apiFetch('/clases'); listaDeClasesGlobal=d.clases;}catch(e){console.error(e);}}
            listaDeClasesGlobal.forEach(cl => clasesOptHtml += `<option value="${cl.id}" ${ed.para_clase_id === cl.id ? 'selected':''}>${cl.nombre_clase}</option>`);
        }

        formWrapper.innerHTML = `<h4>${titulo}</h4>
            <form id="excursionFormDetalle" style="border:1px solid #ddd; padding:15px; border-radius:5px;">
                <input type="hidden" id="excursionIdForm" value="${idExcursion||''}"/>
                <div><label>Nombre Excursión:</label><input type="text" id="nombreExcursionForm" value="${ed.nombre_excursion}" required/></div>
                <div><label>Fecha:</label><input type="date" id="fechaExcursionForm" value="${ed.fecha_excursion || ''}"/></div>
                <div><label>Coste por Alumno (€):</label><input type="number" id="costeExcursionAlumnoForm" value="${ed.coste_excursion_alumno||0}" step="0.01" min="0"/></div>
                <div><label>Vestimenta:</label><input type="text" id="vestimentaExcursionForm" value="${ed.vestimenta||''}"/></div>
                <div><label>Transporte:</label><input type="text" id="transporteExcursionForm" value="${ed.transporte||''}"/></div>
                <div class="full-width-field"><label>Notas:</label><textarea id="notasExcursionForm">${ed.notas_excursion||''}</textarea></div>
                ${currentUser.rol==='DIRECCION' ? `<div><label>Específica para Clase (opcional):</label><select id="paraClaseIdExcursionForm">${clasesOptHtml}</select></div>` : ''}
                <div class="form-buttons"><button type="submit" class="success">${editando?'Actualizar':'Crear'}</button><button type="button" onclick="document.getElementById('formExcursionWrapper').innerHTML='';document.getElementById('formExcursionWrapper').style.display='none';">Cancelar</button></div>
            </form>`;
        formWrapper.style.display='block'; document.getElementById('excursionFormDetalle').onsubmit = saveExcursion;
    }
    async function saveExcursion(event) {
        event.preventDefault();
        const id = document.getElementById('excursionIdForm').value;
        const body = {
            nombre_excursion: document.getElementById('nombreExcursionForm').value.trim(),
            fecha_excursion: document.getElementById('fechaExcursionForm').value || null,
            coste_excursion_alumno: parseFloat(document.getElementById('costeExcursionAlumnoForm').value) || 0,
            vestimenta: document.getElementById('vestimentaExcursionForm').value.trim() || null,
            transporte: document.getElementById('transporteExcursionForm').value.trim() || null,
            notas_excursion: document.getElementById('notasExcursionForm').value.trim() || null,
        };
        if (!body.nombre_excursion) { alert("Nombre de excursión obligatorio."); return; }
        if (currentUser.rol === 'DIRECCION') {
            const paraClaseIdSelect = document.getElementById('paraClaseIdExcursionForm');
            if (paraClaseIdSelect && paraClaseIdSelect.value) body.para_clase_id_opcional = parseInt(paraClaseIdSelect.value);
            else body.para_clase_id_opcional = null; // Global si no se selecciona clase
        } // Tutor crea para su clase (backend lo asigna desde token)
        
        const method=id?'PUT':'POST', endpoint=id?`/excursiones/${id}`:'/excursiones';
        try { await apiFetch(endpoint, method, body); document.getElementById('formExcursionWrapper').innerHTML=''; loadExcursiones(); }
        catch (error) { showGlobalError(`Error guardando excursión: ${error.message}`); }
    }
    async function deleteExcursion(idExcursion, nombreExcursion) {
        if (confirm(`¿Eliminar excursión "${nombreExcursion||`ID ${idExcursion}`}"? Se borrarán todas sus participaciones.`)) {
            try { await apiFetch(`/excursiones/${idExcursion}`, 'DELETE'); loadExcursiones(); }
            catch (error) { showGlobalError(`Error eliminando excursión: ${error.message}`); }
        }
    }

    // --- Participaciones ---
    let alumnosParaParticipaciones = []; // Cache de alumnos de la clase seleccionada para participaciones
    async function loadParticipacionesViewSetup() { // Renombrado para diferenciar de la carga de datos
        if (!participacionesContentDiv || !currentToken) return;
        const excursionId = sessionStorage.getItem('filtroParticipantesExcursionId');
        const nombreExcursion = sessionStorage.getItem('filtroParticipantesNombreExcursion');
        
        let html = `<h3>Participaciones: ${nombreExcursion || '<em>Selecciona una excursión primero</em>'}</h3>`;
        // Selectores para Excursión y Clase (si es Dirección)
        html += `<div class="filter-controls" style="justify-content:flex-start; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));">
                    <div><label for="selectExcursionParticipaciones">Excursión:</label><select id="selectExcursionParticipaciones"><option value="">-- Elige Excursión --</option></select></div>`;
        if (currentUser.rol === 'DIRECCION') {
            html += `<div><label for="selectClaseParticipaciones">Clase:</label><select id="selectClaseParticipaciones"><option value="">-- Todas (de la excursión) --</option></select></div>`;
        }
        html += `</div><button id="btnCargarParticipaciones" class="primary" style="margin-bottom:15px;">Ver/Refrescar Participantes</button>`;
        html += `<div id="participacionesTableContainer"></div><div id="formParticipacionWrapper" class="form-wrapper"></div>`;
        participacionesContentDiv.innerHTML = html;

        // Poblar selectores
        const selectExcursion = document.getElementById('selectExcursionParticipaciones');
        const selectClase = document.getElementById('selectClaseParticipaciones');

        try { // Poblar excursiones
            if (listaDeExcursionesGlobal.length === 0) { // Cargar si no está cacheada
                 const dataEx = await apiFetch('/excursiones'); listaDeExcursionesGlobal = dataEx.excursiones;
            }
            listaDeExcursionesGlobal.forEach(ex => selectExcursion.add(new Option(`${ex.nombre_excursion} (${ex.fecha_excursion || 'N/D'})`, ex.id)));
            if (excursionId) selectExcursion.value = excursionId; // Mantener filtro si existe
        } catch(e) { console.error("Error cargando excursiones para filtro:", e); }

        if (currentUser.rol === 'DIRECCION' && selectClase) { // Poblar clases para Dirección
            if (listaDeClasesGlobal.length === 0) { try {const dC=await apiFetch('/clases'); listaDeClasesGlobal=dC.clases;}catch(e){console.error(e);}}
            listaDeClasesGlobal.forEach(cl => selectClase.add(new Option(cl.nombre_clase, cl.id)));
        } else if (selectClase) {
            selectClase.style.display = 'none'; // Ocultar select de clase para tutor
            selectClase.previousElementSibling.style.display = 'none'; // Ocultar label de clase para tutor
        }
        document.getElementById('btnCargarParticipaciones').onclick = loadParticipacionesData;
        if (excursionId) loadParticipacionesData(); // Cargar datos si ya hay una excursión seleccionada
    }
    async function loadParticipacionesData() {
        const tableContainer = document.getElementById('participacionesTableContainer');
        const formWrapper = document.getElementById('formParticipacionWrapper');
        if (!tableContainer || !formWrapper) return;
        tableContainer.innerHTML = "<p>Cargando participaciones...</p>"; formWrapper.innerHTML = "";

        const excursionId = document.getElementById('selectExcursionParticipaciones').value;
        if (!excursionId) { tableContainer.innerHTML = "<p>Por favor, selecciona una excursión.</p>"; return; }
        
        let claseIdQuery = "";
        if (currentUser.rol === 'DIRECCION') {
            const claseIdSelected = document.getElementById('selectClaseParticipaciones').value;
            if (claseIdSelected) claseIdQuery = `&claseId=${claseIdSelected}`;
        } // Para tutor, el backend ya filtra por su claseId del token

        try {
            const data = await apiFetch(`/participaciones?excursionId=${excursionId}${claseIdQuery}`);
            // Cargar alumnos de la clase relevante para añadir nuevos participantes
            let claseIdParaAlumnos = currentUser.rol === 'TUTOR' ? currentUser.claseId : (document.getElementById('selectClaseParticipaciones')?.value || null);
            if(claseIdParaAlumnos) {
                const dataAlumnosClase = await apiFetch(`/alumnos?claseId=${claseIdParaAlumnos}`);
                alumnosParaParticipaciones = dataAlumnosClase.alumnos || [];
            } else if (currentUser.rol === 'DIRECCION' && !claseIdParaAlumnos){
                // Si Dirección no ha filtrado por clase, y queremos añadir participantes, necesitamos que seleccione una clase.
                // O el botón de añadir se deshabilita hasta que se seleccione una clase.
                alumnosParaParticipaciones = []; // O cargar todos y filtrar en el select de añadir.
                console.warn("Dirección: para añadir participantes, primero filtra por una clase específica.")
            }


            let html = `<button id="btnShowFormNuevaParticipacion" class="success" style="margin-bottom:10px;">+ Inscribir Alumno</button>
                        <table class="tabla-datos"><thead><tr><th>Alumno</th><th>Clase</th><th>Autorización</th><th>Pago</th><th>Cant.Pagada (€)</th><th>Notas</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.participaciones && data.participaciones.length > 0) {
                data.participaciones.forEach(p => {
                    html += `<tr data-participacion-id="${p.id}"><td>${p.nombre_alumno}</td><td>${p.nombre_clase}</td>
                             <td>${p.autorizacion_firmada}</td><td>${p.pago_realizado}</td><td>${(p.cantidad_pagada||0).toFixed(2)}</td>
                             <td>${(p.notas_participacion||'').substring(0,20)}</td>
                             <td><button class="edit-participacion warning" data-id="${p.id}">Editar</button>
                                 <button class="delete-participacion danger" data-id="${p.id}">Quitar</button>
                             </td></tr>`;
                });
            } else { html += `<tr><td colspan="7" style="text-align:center;">No hay alumnos inscritos en esta excursión ${currentUser.rol==='TUTOR'?'de tu clase':''}.</td></tr>`; }
            html += '</tbody></table>';
            tableContainer.innerHTML = html;

            if(document.getElementById('btnShowFormNuevaParticipacion')) document.getElementById('btnShowFormNuevaParticipacion').onclick = () => showFormParticipacion(null, excursionId);
            tableContainer.querySelectorAll('.edit-participacion').forEach(b=>b.onclick = async (e)=>{ const id = e.target.dataset.id; try{ const d=await apiFetch(`/participaciones/${id}`); showFormParticipacion(id, excursionId, d.participacion); }catch(er){showGlobalError("Error cargando participación.");}});
            tableContainer.querySelectorAll('.delete-participacion').forEach(b=>b.onclick = (e)=>deleteParticipacion(e.target.dataset.id));

        } catch (e) { tableContainer.innerHTML = `<p class="error-message">Error cargando participaciones: ${e.message}</p>`;}
    }
    async function showFormParticipacion(idParticipacion = null, excursionId, participacionData = null) {
        const formWrapper = document.getElementById('formParticipacionWrapper'); if (!formWrapper) return;
        const editando = idParticipacion && participacionData;
        const titulo = editando ? 'Editar Participación' : 'Inscribir Alumno a Excursión';
        let pd = editando ? participacionData : { alumno_id: '', autorizacion_firmada: 'No', pago_realizado:'No', cantidad_pagada:0, fecha_autorizacion:'', fecha_pago:'', notas_participacion:''};
        
        // Obtener el coste de la excursión para el auto-relleno
        let costeExcursionActual = 0;
        try {
            const dataExcursion = await apiFetch(`/excursiones/${excursionId}`);
            if (dataExcursion.excursion) costeExcursionActual = dataExcursion.excursion.coste_excursion_alumno || 0;
        } catch(e){ console.error("Error obteniendo coste excursión para form:", e); }


        let alumnosOptionsHtml = '<option value="">-- Selecciona Alumno --</option>';
        // Usar la lista 'alumnosParaParticipaciones' que se cargó en loadParticipacionesData
        // Filtrar para no mostrar alumnos que ya están en esta excursión (si no estamos editando)
        const participantesActualesIds = editando ? [] : (await apiFetch(`/participaciones?excursionId=${excursionId}`)).participaciones.map(p => p.alumno_id);

        alumnosParaParticipaciones.forEach(alumno => {
            if (editando && alumno.id === pd.alumno_id) { // Si editamos, seleccionamos el alumno
                 alumnosOptionsHtml += `<option value="${alumno.id}" selected>${alumno.nombre_completo}</option>`;
            } else if (!participantesActualesIds.includes(alumno.id)) { // Si creamos, solo mostrar no inscritos
                 alumnosOptionsHtml += `<option value="${alumno.id}">${alumno.nombre_completo}</option>`;
            }
        });


        formWrapper.innerHTML = `<h4>${titulo}</h4>
            <form id="participacionFormDetalle" style="border:1px solid #ddd; padding:15px; border-radius:5px;">
                <input type="hidden" id="participacionIdForm" value="${idParticipacion||''}"/>
                <input type="hidden" id="excursionIdParticipacionForm" value="${excursionId}"/>
                <div><label>Alumno:</label><select id="alumnoIdParticipacionForm" ${editando?'disabled':'required'}>${alumnosOptionsHtml}</select></div>
                <div><label>Autorización Firmada:</label><select id="authFirmadaForm"><option value="No" ${pd.autorizacion_firmada==='No'?'selected':''}>No</option><option value="Sí" ${pd.autorizacion_firmada==='Sí'?'selected':''}>Sí</option></select></div>
                <div><label>Fecha Autorización:</label><input type="date" id="fechaAuthForm" value="${pd.fecha_autorizacion||''}"/></div>
                <div><label>Pago Realizado:</label><select id="pagoRealizadoForm">
                    <option value="No" ${pd.pago_realizado==='No'?'selected':''}>No</option>
                    <option value="Parcial" ${pd.pago_realizado==='Parcial'?'selected':''}>Parcial</option>
                    <option value="Sí" ${pd.pago_realizado==='Sí'?'selected':''}>Sí</option>
                </select></div>
                <div><label>Cantidad Pagada (€):</label><input type="number" id="cantidadPagadaForm" value="${pd.cantidad_pagada||0}" step="0.01" min="0"/></div>
                <div><label>Fecha Pago:</label><input type="date" id="fechaPagoForm" value="${pd.fecha_pago||''}"/></div>
                <div class="full-width-field"><label>Notas Participación:</label><textarea id="notasParticipacionForm">${pd.notas_participacion||''}</textarea></div>
                <div class="form-buttons"><button type="submit" class="success">${editando?'Actualizar':'Inscribir'}</button><button type="button" onclick="document.getElementById('formParticipacionWrapper').innerHTML='';document.getElementById('formParticipacionWrapper').style.display='none';">Cancelar</button></div>
            </form>`;
        formWrapper.style.display='block';

        // Listener para auto-rellenar cantidad si Pago = Sí
        const pagoSelect = document.getElementById('pagoRealizadoForm');
        const cantidadInput = document.getElementById('cantidadPagadaForm');
        if (pagoSelect && cantidadInput) {
            pagoSelect.onchange = () => {
                if (pagoSelect.value === 'Sí') cantidadInput.value = costeExcursionActual.toFixed(2);
                else if (pagoSelect.value === 'No') cantidadInput.value = '0.00';
            };
        }
        document.getElementById('participacionFormDetalle').onsubmit = saveParticipacion;
    }
    async function saveParticipacion(event) {
        event.preventDefault();
        const id = document.getElementById('participacionIdForm').value;
        const body = {
            alumno_id: parseInt(document.getElementById('alumnoIdParticipacionForm').value),
            excursion_id: parseInt(document.getElementById('excursionIdParticipacionForm').value),
            autorizacion_firmada: document.getElementById('authFirmadaForm').value,
            fecha_autorizacion: document.getElementById('fechaAuthForm').value || null,
            pago_realizado: document.getElementById('pagoRealizadoForm').value,
            cantidad_pagada: parseFloat(document.getElementById('cantidadPagadaForm').value) || 0,
            fecha_pago: document.getElementById('fechaPagoForm').value || null,
            notas_participacion: document.getElementById('notasParticipacionForm').value.trim() || null,
        };
        if (!body.alumno_id || !body.excursion_id) { alert("Alumno y excursión son obligatorios."); return; }
        const method=id?'PUT':'POST', endpoint=id?`/participaciones/${id}`:'/participaciones';
        try { await apiFetch(endpoint, method, body); document.getElementById('formParticipacionWrapper').innerHTML=''; loadParticipacionesData(); } // Recargar datos de la tabla
        catch (error) { showGlobalError(`Error guardando participación: ${error.message}`); }
    }
    async function deleteParticipacion(idParticipacion) {
        if (confirm(`¿Quitar esta participación (ID ${idParticipacion})?`)) {
            try { await apiFetch(`/participaciones/${idParticipacion}`, 'DELETE'); loadParticipacionesData(); }
            catch (error) { showGlobalError(`Error quitando participación: ${error.message}`); }
        }
    }


    // --- Admin Usuarios (Solo Dirección) ---
    async function loadAdminUsuarios() { /* ... (código que te di antes, con tabla, botones y llamada a showFormAdminUsuario) ... */ }
    async function showFormAdminUsuario(idUsuario = null, userData = null) { /* ... (código que te di antes, con carga de clases para asignar tutor) ... */ }
    async function saveAdminUsuario(event) { /* ... (código que te di antes) ... */ }
    async function deleteAdminUsuario(idUsuario, nombreUsuario) { /* ... (código que te di antes) ... */ }

    // --- INICIALIZACIÓN DE LA APP ---
    checkInitialLoginState();
}); // Fin de DOMContentLoaded
