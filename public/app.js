/ --- public/app.js (Revisado y Mejorado a partir de tu versión) ---
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
    const formAdminUsuarioWrapper = document.getElementById('formAdminUsuarioWrapper');


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

    function showGlobalError(message, targetDiv = null) {
        console.error("ERROR APP:", message);
        if (targetDiv) {
            targetDiv.innerHTML = `<p class="error-message">${message}</p>`;
        } else if (loginErrorP && loginSection && loginSection.style.display === 'block') { // Mostrar en el form de login si está visible
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
            console.log("Login form submitted. Email:", email); 
            const submitButton = loginForm.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;

            try {
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
                if (loginErrorP && !loginErrorP.textContent) {
                    loginErrorP.textContent = error.message.includes("Credenciales incorrectas") ? error.message : "Error al intentar iniciar sesión.";
                }
            } finally {
                if (submitButton) submitButton.disabled = false; 
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
    }

    function checkInitialLoginState() {
        console.log("Ejecutando checkInitialLoginState...");
        const token = localStorage.getItem('authToken');
        const userStr = localStorage.getItem('userInfo');
        if (token && userStr) {
            console.log("Token y userInfo encontrados en localStorage.");
            try {
                const user = JSON.parse(userStr);
                apiFetch('/auth/me', 'GET', null, token)
                    .then(data => {
                        if (data && data.usuario) {
                            console.log("Token validado con /auth/me, usuario:", data.usuario.email);
                            handleLoginSuccess(data.usuario, token); 
                        } else { 
                            console.warn("/auth/me no devolvió usuario o data fue null, cerrando sesión.");
                            handleLogout(); 
                        }
                    }).catch((error) => { 
                        console.warn("Error validando token con /auth/me, cerrando sesión. Error:", error.message);
                        handleLogout();
                    });
            } catch (e) { console.error("Error parseando userInfo de localStorage:", e); handleLogout(); }
        } else {
            console.log("No hay token/userInfo en localStorage. Mostrando UI de logout y navegando a login.");
            updateUIAfterLogout();
            navigateTo('login'); 
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
        } else if (activeSectionDiv) {
            activeSectionDiv.style.display = 'block';
            if (activeLink) activeLink.classList.add('active'); 
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
            if (currentToken || section === 'login') navigateTo(section); 
            else {
                console.log("Intento de navegación sin token a sección protegida:", section);
                navigateTo('login'); 
            }
        });
    });

    // --- Carga de Contenido para Secciones ---
    function loadContentForSection(sectionName) {
        if (sectionName === 'login') return; 
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

    // --- Dashboard ---
 async function loadDashboardData() {
    if (!dashboardSummaryContentDiv) {
        console.error("Elemento dashboardSummaryContentDiv no encontrado.");
        return;
    }
    if (!currentToken) {
        console.warn("loadDashboardData: No hay token, no se puede cargar.");
        dashboardSummaryContentDiv.innerHTML = '<p class="error-message">Error de sesión. Por favor, inicia sesión de nuevo.</p>';
        return;
    }

    dashboardSummaryContentDiv.innerHTML = "<p>Cargando resumen del dashboard...</p>"; 
    console.log("[loadDashboardData] Iniciando carga de datos del dashboard...");

    try {
        const data = await apiFetch('/dashboard/summary'); 
        console.log("[loadDashboardData] Datos recibidos del backend:", data);

        if (!data) {
            console.warn("[loadDashboardData] No se recibieron datos (null o undefined) del backend.");
            dashboardSummaryContentDiv.innerHTML = `<p class="error-message">No se pudo obtener el resumen del dashboard del servidor.</p>`;
            return;
        }

        let html = '<h4>Resumen General</h4>';
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
            }
        }
        console.log("[loadDashboardData] HTML generado para el dashboard:", html.substring(0, 200) + "..."); 
        dashboardSummaryContentDiv.innerHTML = html;
    } catch (error) {
        console.error("[loadDashboardData] Error capturado al cargar datos del dashboard:", error.message);
        dashboardSummaryContentDiv.innerHTML = `<p class="error-message">Error al cargar los datos del dashboard: ${error.message}</p>`;
    }
}
    let listaDeClasesGlobal = []; 
    // --- Gestión de Clases --- 
  async function showFormClase(idClase = null, nombreExistente = '', tutorIdExistente = '') {
    console.log("Función showFormClase llamada con:", {idClase, nombreExistente, tutorIdExistente}); 
    const formClaseWrapper = document.getElementById('formClaseWrapper');
    if (!formClaseWrapper) {
        console.error("Elemento formClaseWrapper no encontrado.");
        return;
    }

    let tutoresDisponibles = [];
    try {
        const dataUsuarios = await apiFetch('/usuarios'); 
        if (dataUsuarios && dataUsuarios.usuarios) {
            tutoresDisponibles = dataUsuarios.usuarios.filter(u => u.rol === 'TUTOR');
        }
    } catch (error) {
        console.error("Error obteniendo lista de tutores:", error);
    }

    let optionsTutoresHtml = '<option value="">-- Sin asignar --</option>';
    tutoresDisponibles.forEach(tutor => {
        const estaAsignadoAOtraClase = tutor.clase_asignada_id && tutor.clase_asignada_id !== idClase;
        const esTutorActual = tutor.id === parseInt(tutorIdExistente);

        if (!estaAsignadoAOtraClase || esTutorActual) {
            optionsTutoresHtml += `<option value="${tutor.id}" ${esTutorActual ? 'selected' : ''}>
                                      ${tutor.nombre_completo} (${tutor.email})
                                  </option>`;
        } else {
            optionsTutoresHtml += `<option value="${tutor.id}" disabled>
                                      ${tutor.nombre_completo} (Asignado a: ${tutor.clase_asignada_nombre || 'otra clase'})
                                   </option>`;
        }
    });

    const formHtml = `
        <div class="form-container" style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin-top: 15px; border: 1px solid #e0e0e0;">
            <h3>${idClase ? 'Editar Clase' : 'Añadir Nueva Clase'}</h3>
            <form id="formGestionClase">
                <input type="hidden" id="claseId" name="claseId" value="${idClase || ''}">
                <div>
                    <label for="nombreClase">Nombre de la Clase:</label>
                    <input type="text" id="nombreClase" name="nombreClase" value="${nombreExistente}" required>
                </div>
                <div>
                    <label for="tutorClase">Tutor Asignado:</label>
                    <select id="tutorClase" name="tutorClase">
                        ${optionsTutoresHtml}
                    </select>
                </div>
                <div class="form-buttons">
                    <button type="submit" class="success">${idClase ? 'Guardar Cambios' : 'Crear Clase'}</button>
                    <button type="button" id="btnCancelarFormClase" class="secondary">Cancelar</button>
                </div>
                <p id="formClaseError" class="error-message"></p>
            </form>
        </div>
    `;
    formClaseWrapper.innerHTML = formHtml;

    const formElement = document.getElementById('formGestionClase');
    if (formElement) {
        console.log("Asignando listener 'submit' al formulario formGestionClase:", formElement);
        formElement.addEventListener('submit', function(event) {
            console.log("Evento SUBMIT del formulario detectado. Evento:", event);
            event.preventDefault();
            console.log("event.preventDefault() llamado DENTRO del listener de prueba.");
            saveClase(event); 
        });
    } else {
        console.error("Elemento de formulario formGestionClase NO encontrado para asignar listener.");
    }
    const btnCancelar = document.getElementById('btnCancelarFormClase');
    if (btnCancelar) {
        btnCancelar.onclick = () => { formClaseWrapper.innerHTML = ''; }; 
    }
}

async function saveClase(event) {
    console.log("saveClase INVOCADA. Evento:", event); 
    const formClaseError = document.getElementById('formClaseError');
    if (formClaseError) formClaseError.textContent = '';

    const claseIdInput = document.getElementById('claseId');
    const nombreClaseInput = document.getElementById('nombreClase');
    const tutorClaseSelect = document.getElementById('tutorClase');

    if (!nombreClaseInput || !tutorClaseSelect || !claseIdInput) {
        if (formClaseError) formClaseError.textContent = 'Error: Elementos del formulario no encontrados.';
        console.error("Elementos del formulario no encontrados en saveClase.");
        return; 
    }

    const idClase = claseIdInput.value;
    const nombre_clase = nombreClaseInput.value.trim().toUpperCase();
    const tutor_id = tutorClaseSelect.value ? parseInt(tutorClaseSelect.value) : null;

    console.log("Datos recogidos del formulario:", { idClase, nombre_clase, tutor_id }); 

    if (!nombre_clase) {
        if (formClaseError) formClaseError.textContent = 'El nombre de la clase es obligatorio.';
        console.warn("Nombre de la clase vacío.");
        return; 
    }

    const claseData = { nombre_clase, tutor_id };
    let method = 'POST';
    let endpoint = '/clases';

    if (idClase) {
        method = 'PUT';
        endpoint = `/clases/${idClase}`;
    }

    console.log(`Intentando apiFetch: Method=${method}, Endpoint=${endpoint}, Data=`, claseData); 

    try {
        const resultado = await apiFetch(endpoint, method, claseData);
        console.log("Respuesta de guardar clase (apiFetch):", resultado); 

        const formClaseWrapper = document.getElementById('formClaseWrapper');
        if (formClaseWrapper) formClaseWrapper.innerHTML = '';

        loadClases(); 

        const dataClasesActualizadas = await apiFetch('/clases');
        listaDeClasesGlobal = dataClasesActualizadas.clases || [];
        if (document.getElementById('alumnos-section') && document.getElementById('alumnos-section').style.display === 'block' && document.getElementById('csvClaseDestino')) {
            poblarSelectorClaseDestinoCSV();
        }
    } catch (error) {
        console.error(`Error guardando clase (${method} ${endpoint}):`, error);
        if (formClaseError) formClaseError.textContent = error.message || 'Error desconocido al guardar la clase.';
    }
}
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
    
    async function deleteClase(idClase, nombreClase) {
        if (!confirm(`¿Estás seguro de que quieres eliminar la clase "${nombreClase}"? Esta acción podría afectar a alumnos y otros datos asociados.`)) {
            return;
        }
        try {
            await apiFetch(`/clases/${idClase}`, 'DELETE');
            alert("Clase eliminada correctamente.");
            loadClases(); // Recargar la lista de clases
            // Actualizar la lista global de clases por si se usa en otros selectores
            const dataClasesActualizadas = await apiFetch('/clases');
            listaDeClasesGlobal = dataClasesActualizadas.clases || [];
            // Si el selector de importación CSV está visible, actualizarlo
            if (document.getElementById('alumnos-section') && document.getElementById('alumnos-section').style.display === 'block' && document.getElementById('csvClaseDestino')) {
                 poblarSelectorClaseDestinoCSV();
            }
        } catch (error) {
            console.error(`Error eliminando clase ${idClase}:`, error);
            showGlobalError(error.message || "Error al eliminar la clase.");
        }
    }

    // --- Alumnos --- 
    async function loadAlumnos(claseIdFiltroExterno = null, nombreClaseFiltroExterno = null) { /* ... (como te la di antes, es bastante completa) ... */ }
    async function showFormAlumno(idAlumno = null, alumnoData = null, listaTodasClases = null) {
        const formAlumnoWrapper = document.getElementById('formAlumnoWrapper');
        if (!formAlumnoWrapper) {
            console.error("Elemento formAlumnoWrapper no encontrado.");
            return;
        }

        const nombreExistente = alumnoData ? alumnoData.nombre_completo : '';
        const claseIdExistente = alumnoData ? alumnoData.clase_id : '';
        const apellidosExistente = alumnoData && alumnoData.nombre_completo ? alumnoData.nombre_completo.split(' ').slice(1).join(' ') : '';
        const soloNombreExistente = alumnoData && alumnoData.nombre_completo ? alumnoData.nombre_completo.split(' ')[0] : '';


        let opcionesClasesHtml = '';
        if (currentUser.rol === 'TUTOR') {
            if (currentUser.claseId && currentUser.claseNombre) {
                opcionesClasesHtml = `<option value="${currentUser.claseId}" selected>${currentUser.claseNombre} (Tu clase)</option>`;
            } else {
                opcionesClasesHtml = `<option value="" disabled selected>No tienes clase asignada</option>`;
            }
        } else if (currentUser.rol === 'DIRECCION') {
            if (listaDeClasesGlobal.length === 0) { // Cargar si no está cacheada
                try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) {
                    console.error("Error cargando lista de clases para formAlumno:", error);
                    opcionesClasesHtml = `<option value="">Error cargando clases</option>`;
                }
            }
            opcionesClasesHtml = '<option value="">-- Selecciona una clase --</option>';
            listaDeClasesGlobal.forEach(clase => {
                opcionesClasesHtml += `<option value="${clase.id}" ${clase.id === claseIdExistente ? 'selected' : ''}>${clase.nombre_clase}</option>`;
            });
        }


        const formHtml = `
            <div class="form-container" style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin-top: 15px; border: 1px solid #e0e0e0;">
                <h3>${idAlumno ? 'Editar Alumno' : 'Añadir Nuevo Alumno'}</h3>
                <form id="formGestionAlumno">
                    <input type="hidden" id="alumnoId" name="alumnoId" value="${idAlumno || ''}">
                    <div>
                        <label for="nombreAlumno">Nombre del Alumno:</label>
                        <input type="text" id="nombreAlumno" name="nombreAlumno" value="${soloNombreExistente}" required placeholder="Ej: Juan">
                    </div>
                    <div>
                        <label for="apellidosAlumno">Apellidos del Alumno:</label>
                        <input type="text" id="apellidosAlumno" name="apellidosAlumno" value="${apellidosExistente}" required placeholder="Ej: Pérez Gómez">
                    </div>
                    <div>
                        <label for="claseAlumno">Clase del Alumno:</label>
                        <select id="claseAlumno" name="claseAlumno" ${currentUser.rol === 'TUTOR' ? 'disabled' : ''} required>
                            ${opcionesClasesHtml}
                        </select>
                    </div>
                    <div class="form-buttons">
                        <button type="submit" class="success">${idAlumno ? 'Guardar Cambios' : 'Crear Alumno'}</button>
                        <button type="button" id="btnCancelarFormAlumno" class="secondary">Cancelar</button>
                    </div>
                    <p id="formAlumnoError" class="error-message"></p>
                </form>
            </div>
        `;
        formAlumnoWrapper.innerHTML = formHtml;

        document.getElementById('formGestionAlumno').addEventListener('submit', saveAlumno);
        document.getElementById('btnCancelarFormAlumno').onclick = () => { formAlumnoWrapper.innerHTML = ''; };
    }
    async function saveAlumno(event) {
        event.preventDefault();
        const formAlumnoError = document.getElementById('formAlumnoError');
        if (formAlumnoError) formAlumnoError.textContent = '';

        const alumnoId = document.getElementById('alumnoId').value;
        const nombre = document.getElementById('nombreAlumno').value.trim();
        const apellidos = document.getElementById('apellidosAlumno').value.trim();
        const clase_id = document.getElementById('claseAlumno').value;

        if (!nombre || !apellidos || !clase_id) {
            if (formAlumnoError) formAlumnoError.textContent = 'Nombre, apellidos y clase son obligatorios.';
            return;
        }
        
        const alumnoData = {
            nombre: nombre, // El backend espera "nombre" y "apellidos" separados
            apellidos: apellidos,
            clase_id: parseInt(clase_id)
        };

        let method = 'POST';
        let endpoint = '/alumnos';
        if (alumnoId) {
            method = 'PUT';
            endpoint = `/alumnos/${alumnoId}`;
        }

        try {
            await apiFetch(endpoint, method, alumnoData);
            document.getElementById('formAlumnoWrapper').innerHTML = ''; // Limpiar formulario
            loadAlumnos(sessionStorage.getItem('filtroAlumnosClaseId'), sessionStorage.getItem('filtroAlumnosNombreClase')); // Recargar lista
        } catch (error) {
            if (formAlumnoError) formAlumnoError.textContent = error.message || 'Error guardando alumno.';
        }
    }
    async function deleteAlumno(idAlumno, nombreAlumno) {
        if (!confirm(`¿Estás seguro de que quieres eliminar al alumno "${nombreAlumno}"?`)) return;
        try {
            await apiFetch(`/alumnos/${idAlumno}`, 'DELETE');
            alert("Alumno eliminado correctamente.");
            loadAlumnos(sessionStorage.getItem('filtroAlumnosClaseId'), sessionStorage.getItem('filtroAlumnosNombreClase'));
        } catch (error) {
            showGlobalError(error.message || "Error al eliminar el alumno.");
        }
    }

    // --- Funciones Específicas para la Importación CSV de Alumnos ---

    async function poblarSelectorClaseDestinoCSV(selectElementId = 'csvClaseDestino') {
        const selectClase = document.getElementById(selectElementId);
        if (!selectClase) {
            console.error(`Elemento select con id '${selectElementId}' NO encontrado para importación CSV.`);
            return;
        }

        selectClase.innerHTML = '<option value="">Cargando clases...</option>';
        try {
            if (currentUser.rol === 'TUTOR') {
                if (currentUser.claseId && currentUser.claseNombre) {
                    selectClase.innerHTML = `<option value="${currentUser.claseId}" selected>${currentUser.claseNombre} (Tu clase asignada)</option>`;
                    selectClase.disabled = true;
                } else {
                    selectClase.innerHTML = '<option value="" disabled selected>No tienes una clase asignada</option>';
                    selectClase.disabled = true;
                }
            } else if (currentUser.rol === 'DIRECCION') {
                if (listaDeClasesGlobal.length === 0) {
                    console.log("[poblarSelectorClaseDestinoCSV] listaDeClasesGlobal vacía, cargando clases del API...");
                    const dataClases = await apiFetch('/clases'); 
                    listaDeClasesGlobal = dataClases.clases || [];
                }
                
                let optionsHtml = '<option value="">-- Selecciona una clase de destino --</option>';
                if (listaDeClasesGlobal.length > 0) {
                    listaDeClasesGlobal.forEach(clase => {
                        optionsHtml += `<option value="${clase.id}">${clase.nombre_clase}</option>`;
                    });
                } else {
                    optionsHtml = '<option value="" disabled>No hay clases creadas para seleccionar</option>';
                }
                selectClase.innerHTML = optionsHtml;
                selectClase.disabled = false;
            } else {
                selectClase.innerHTML = '<option value="" disabled>Rol no permitido para importar</option>';
                selectClase.disabled = true;
            }
        } catch (error) {
            console.error("Error poblando selector de clase para importación CSV:", error);
            if (selectClase) selectClase.innerHTML = '<option value="">Error al cargar clases</option>';
        }
    }

    async function handleImportAlumnosCSV(event) {
        event.preventDefault();
        const statusDiv = document.getElementById('importAlumnosStatus');
        if (!statusDiv) {
            showGlobalError("Error interno: No se pudo mostrar el estado de la importación.");
            return;
        }
        statusDiv.innerHTML = '<p><em>Procesando importación, por favor espera...</em></p>';

        const claseIdSelect = document.getElementById('csvClaseDestino');
        const fileInput = document.getElementById('csvFileAlumnos');

        if (!claseIdSelect || !fileInput || !fileInput.files || fileInput.files.length === 0) {
            statusDiv.innerHTML = '<p class="error-message">Por favor, selecciona una clase de destino y un archivo CSV.</p>';
            return;
        }

        const clase_id_seleccionada = claseIdSelect.value;
        let clase_id_para_api;
        if (currentUser.rol === 'TUTOR') {
            if (!currentUser.claseId) {
                statusDiv.innerHTML = '<p class="error-message">Tutor: No tienes una clase asignada para la importación.</p>';
                return;
            }
            clase_id_para_api = currentUser.claseId;
        } else if (currentUser.rol === 'DIRECCION') {
            if (!clase_id_seleccionada) {
                statusDiv.innerHTML = '<p class="error-message">Dirección: Por favor, selecciona una clase de destino.</p>';
                return;
            }
            clase_id_para_api = clase_id_seleccionada;
        } else {
            statusDiv.innerHTML = '<p class="error-message">Rol no autorizado para importar.</p>';
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = async function(e) {
            const csv_data = e.target.result;
            try {
                const resultado = await apiFetch('/alumnos/importar_csv', 'POST', { clase_id: clase_id_para_api, csv_data });
                
                let mensaje = `<p><strong>Resultado de la Importación:</strong></p>
                               <p>${resultado.message || 'Proceso completado.'}</p><ul>`;
                if (resultado.importados !== undefined) mensaje += `<li>Alumnos nuevos importados: ${resultado.importados}</li>`;
                if (resultado.omitidos_duplicados !== undefined) mensaje += `<li>Alumnos omitidos (ya existían en la clase): ${resultado.omitidos_duplicados}</li>`;
                if (resultado.lineas_con_error > 0) {
                    mensaje += `<li style="color:red;">Líneas con error en el archivo CSV: ${resultado.lineas_con_error}</li>`;
                    if (resultado.detalles_errores && resultado.detalles_errores.length > 0) {
                        mensaje += `<li>Primeros errores detallados (revisa la consola del backend para más):<ul>`;
                        resultado.detalles_errores.slice(0, 5).forEach(err => {
                            mensaje += `<li style="font-size:0.8em; color:darkred;"> - L${err.linea}: ${err.error} (Dato: ${String(err.dato || '').substring(0,30)})</li>`;
                        });
                        mensaje += `</ul></li>`;
                    }
                }
                mensaje += `</ul>`;
                statusDiv.innerHTML = mensaje;
                
                loadAlumnos(sessionStorage.getItem('filtroAlumnosClaseId'), sessionStorage.getItem('filtroAlumnosNombreClase')); 
            } catch (error) {
                statusDiv.innerHTML = `<p class="error-message">Error durante la importación: ${error.message}</p>`;
            } finally {
                if (fileInput) fileInput.value = ""; 
            }
        };
        reader.onerror = function() {
            statusDiv.innerHTML = '<p class="error-message">Error al leer el archivo CSV.</p>';
        };
        reader.readAsText(file, "UTF-8");
    }

    async function loadAlumnos(claseIdFiltroExterno = null, nombreClaseFiltroExterno = null) {
        if (!alumnosContentDiv || !currentToken) return;
        alumnosContentDiv.innerHTML = "<p>Cargando alumnos...</p>";

        const importCsvHtml = `
            <div id="import-alumnos-csv-container" style="padding: 15px; border: 1px solid #eee; margin-bottom: 20px; background-color: #f9f9f9; border-radius: 5px;">
                <h4>Importar Alumnos desde CSV</h4>
                <form id="formImportarAlumnosCSV">
                    <div>
                        <label for="csvClaseDestino">Clase de Destino:</label>
                        <select id="csvClaseDestino" required></select> </div>
                    <div>
                        <label for="csvFileAlumnos">Archivo CSV (Formato: "Apellidos, Nombre", UTF-8):</label>
                        <input type="file" id="csvFileAlumnos" accept=".csv" required>
                    </div>
                    <div class="form-buttons" style="justify-content: flex-start; margin-top:10px;">
                        <button type="submit" class="success">Importar Alumnos del CSV</button>
                    </div>
                </form>
                <div id="importAlumnosStatus" style="margin-top:10px;"></div>
            </div>
            <hr style="margin: 20px 0;">`;
        
        const filtroClaseIdActual = claseIdFiltroExterno || sessionStorage.getItem('filtroAlumnosClaseId');
        const filtroNombreClaseActual = nombreClaseFiltroExterno || sessionStorage.getItem('filtroAlumnosNombreClase');
        let endpoint = '/alumnos';
        let queryParams = new URLSearchParams();
        let tituloSeccionAlumnos = "Alumnos";

        if (currentUser.rol === 'TUTOR') {
            if (!currentUser.claseId) { 
                alumnosContentDiv.innerHTML = importCsvHtml + "<p>No tienes clase asignada para ver o importar alumnos.</p>"; 
                poblarSelectorClaseDestinoCSV(); 
                const formImp = document.getElementById('formImportarAlumnosCSV');
                if(formImp) formImp.addEventListener('submit', handleImportAlumnosCSV);
                return; 
            }
            queryParams.append('claseId', currentUser.claseId);
            tituloSeccionAlumnos += ` de tu clase: ${currentUser.claseNombre}`;
        } else if (currentUser.rol === 'DIRECCION') {
            if (filtroClaseIdActual) {
                queryParams.append('claseId', filtroClaseIdActual);
                tituloSeccionAlumnos += ` de la clase: ${filtroNombreClaseActual}`;
            } else {
                tituloSeccionAlumnos += ` (Todas las Clases)`;
            }
        }
        if (queryParams.toString()) {
            endpoint += `?${queryParams.toString()}`;
        }
        
        try {
            const dataAlumnos = await apiFetch(endpoint);
            let dataClasesParaFiltro = null;
            if (currentUser.rol === 'DIRECCION' && listaDeClasesGlobal.length === 0) {
                dataClasesParaFiltro = await apiFetch('/clases');
                listaDeClasesGlobal = dataClasesParaFiltro ? dataClasesParaFiltro.clases : [];
            }
            
            let htmlTablaAlumnos = `<h3 style="margin-top:0;">${tituloSeccionAlumnos}</h3>`;
            if (currentUser.rol === 'DIRECCION' && !filtroClaseIdActual) {
                htmlTablaAlumnos += `<div style="margin-bottom:15px;">Filtrar por clase: <select id="selectFiltroClaseAlumnos"><option value="">-- Todas las clases --</option>`;
                listaDeClasesGlobal.forEach(cl => htmlTablaAlumnos += `<option value="${cl.id}">${cl.nombre_clase}</option>`);
                htmlTablaAlumnos += `</select></div>`;
            } else if (filtroClaseIdActual && currentUser.rol === 'DIRECCION') {
                 htmlTablaAlumnos += `<button onclick="sessionStorage.removeItem('filtroAlumnosClaseId'); sessionStorage.removeItem('filtroAlumnosNombreClase'); loadAlumnos();" class="secondary" style="margin-bottom:15px;">Mostrar Todos los Alumnos</button>`;
            }
            if (currentUser.rol === 'DIRECCION' || (currentUser.rol === 'TUTOR' && currentUser.claseId)) {
                htmlTablaAlumnos += `<button id="btnShowFormNuevoAlumno" class="success" style="margin-bottom:15px;">+ Añadir Alumno Manualmente ${currentUser.rol === 'TUTOR' ? 'a mi clase' : ''}</button>`;
            }
            htmlTablaAlumnos += `<table class="tabla-datos"><thead><tr><th>Nombre Completo</th><th>Clase</th><th>Acciones</th></tr></thead><tbody>`;
            if (dataAlumnos.alumnos && dataAlumnos.alumnos.length > 0) {
                dataAlumnos.alumnos.forEach(a => { 
                    htmlTablaAlumnos += `<tr data-alumno-id="${a.id}"><td>${a.nombre_completo}</td><td>${a.nombre_clase}</td><td>
                        <button class="edit-alumno warning" data-id="${a.id}" data-nombre="${a.nombre_completo}" data-claseid="${a.clase_id}">Editar</button>
                        <button class="delete-alumno danger" data-id="${a.id}" data-nombre="${a.nombre_completo}">Eliminar</button>
                        </td></tr>`; 
                });
            } else { 
                htmlTablaAlumnos += `<tr><td colspan="3" style="text-align:center;">No hay alumnos para mostrar según el filtro actual.</td></tr>`; 
            }
            htmlTablaAlumnos += `</tbody></table><div id="formAlumnoWrapper" class="form-wrapper" style="margin-top:20px;"></div>`;
            
            alumnosContentDiv.innerHTML = importCsvHtml + htmlTablaAlumnos;

            poblarSelectorClaseDestinoCSV(); 
            const formImp = document.getElementById('formImportarAlumnosCSV');
            if(formImp) formImp.addEventListener('submit', handleImportAlumnosCSV);

            if(document.getElementById('btnShowFormNuevoAlumno')) document.getElementById('btnShowFormNuevoAlumno').onclick = () => showFormAlumno();
            
            alumnosContentDiv.querySelectorAll('.edit-alumno').forEach(b => b.onclick = async (e) => {
                const alumnoId = e.target.dataset.id;
                const alumnoParaEditar = dataAlumnos.alumnos.find(a => a.id == alumnoId);
                showFormAlumno(alumnoId, alumnoParaEditar); 
            });

            alumnosContentDiv.querySelectorAll('.delete-alumno').forEach(b=>b.onclick=(e)=>deleteAlumno(e.target.dataset.id, e.target.dataset.nombre));
            
            if (document.getElementById('selectFiltroClaseAlumnos')) {
                const selectFiltro = document.getElementById('selectFiltroClaseAlumnos');
                 if (sessionStorage.getItem('filtroAlumnosClaseId')) {
                    selectFiltro.value = sessionStorage.getItem('filtroAlumnosClaseId');
                }
                selectFiltro.onchange = (e) => {
                    if (e.target.value) {
                        sessionStorage.setItem('filtroAlumnosClaseId', e.target.value);
                        sessionStorage.setItem('filtroAlumnosNombreClase', e.target.options[e.target.selectedIndex].text);
                    } else {
                        sessionStorage.removeItem('filtroAlumnosClaseId');
                        sessionStorage.removeItem('filtroAlumnosNombreClase');
                    }
                    loadAlumnos();
                };
            }
        } catch (e) { 
            alumnosContentDiv.innerHTML = importCsvHtml + `<p class="error-message">Error cargando lista de alumnos: ${e.message}</p>`;
            poblarSelectorClaseDestinoCSV();
            const formImp = document.getElementById('formImportarAlumnosCSV');
            if(formImp) formImp.addEventListener('submit', handleImportAlumnosCSV);
        }
    }

    // --- Excursiones --- 
    async function showFormExcursion(idExcursion = null, excursionData = {}) {
        const formExcursionWrapper = document.getElementById('formExcursionWrapper');
        if (!formExcursionWrapper) { console.error("formExcursionWrapper no encontrado"); return; }

        let opcionesClasesHtml = '<option value="">-- Global (para todas las clases) --</option>';
        if (currentUser.rol === 'DIRECCION') {
             if (listaDeClasesGlobal.length === 0) { // Cargar si no está cacheada
                try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) {
                    console.error("Error cargando lista de clases para formExcursion:", error);
                }
            }
            listaDeClasesGlobal.forEach(clase => {
                opcionesClasesHtml += `<option value="${clase.id}" ${excursionData.para_clase_id === clase.id ? 'selected' : ''}>${clase.nombre_clase}</option>`;
            });
        } else if (currentUser.rol === 'TUTOR') {
            if (currentUser.claseId && currentUser.claseNombre) {
                opcionesClasesHtml = `<option value="${currentUser.claseId}" selected>${currentUser.claseNombre} (Tu clase)</option>`;
            } else {
                opcionesClasesHtml = `<option value="" disabled selected>No tienes clase asignada (no puedes crear excursiones específicas)</option>`;
            }
        }
        
        const formHtml = `
            <div class="form-container">
                <h3>${idExcursion ? 'Editar Excursión' : 'Crear Nueva Excursión'}</h3>
                <form id="formGestionExcursion">
                    <input type="hidden" id="excursionId" value="${idExcursion || ''}">
                    <div><label for="nombreExcursion">Nombre Excursión:</label><input type="text" id="nombreExcursion" value="${excursionData.nombre_excursion || ''}" required></div>
                    <div><label for="actividadExcursion">Actividad (Descripción):</label><textarea id="actividadExcursion" required>${excursionData.actividad_descripcion || ''}</textarea></div>
                    <div><label for="lugarExcursion">Lugar:</label><input type="text" id="lugarExcursion" value="${excursionData.lugar || ''}" required></div>
                    <div><label for="fechaExcursion">Fecha (YYYY-MM-DD):</label><input type="date" id="fechaExcursion" value="${excursionData.fecha_excursion || ''}" required></div>
                    <div><label for="horaSalidaExcursion">Hora Salida (HH:MM):</label><input type="time" id="horaSalidaExcursion" value="${excursionData.hora_salida || ''}" required></div>
                    <div><label for="horaLlegadaExcursion">Hora Llegada (HH:MM):</label><input type="time" id="horaLlegadaExcursion" value="${excursionData.hora_llegada || ''}" required></div>
                    <div><label for="costeExcursion">Coste por Alumno (€):</label><input type="number" id="costeExcursion" value="${excursionData.coste_excursion_alumno || 0}" min="0" step="0.01"></div>
                    
                    <div>
                        <label for="vestimentaExcursion">Vestimenta:</label>
                        <select id="vestimentaExcursion" name="vestimentaExcursion" required>
                            <option value="">-- Selecciona --</option>
                            <option value="Uniforme" ${excursionData.vestimenta === 'Uniforme' ? 'selected' : ''}>Uniforme</option>
                            <option value="Chándal" ${excursionData.vestimenta === 'Chándal' ? 'selected' : ''}>Chándal</option>
                        </select>
                    </div>
                    <div>
                        <label for="transporteExcursion">Transporte:</label>
                        <select id="transporteExcursion" name="transporteExcursion" required>
                            <option value="">-- Selecciona --</option>
                            <option value="Autobús" ${excursionData.transporte === 'Autobús' ? 'selected' : ''}>Autobús</option>
                            <option value="Andando" ${excursionData.transporte === 'Andando' ? 'selected' : ''}>Andando</option>
                        </select>
                    </div>

                    <div><label for="justificacionExcursion">Justificación (Pedagógica):</label><textarea id="justificacionExcursion" required>${excursionData.justificacion_texto || ''}</textarea></div>
                    <div><label for="notasExcursion">Notas Adicionales:</label><textarea id="notasExcursion">${excursionData.notas_excursion || ''}</textarea></div>
                    
                    ${currentUser.rol === 'DIRECCION' ? `
                    <div>
                        <label for="paraClaseIdExcursion">Asignar a Clase Específica (opcional):</label>
                        <select id="paraClaseIdExcursion" name="paraClaseIdExcursion">
                            ${opcionesClasesHtml}
                        </select>
                    </div>` : ''}
                    ${currentUser.rol === 'TUTOR' && currentUser.claseId ? `
                    <input type="hidden" id="paraClaseIdExcursion" value="${currentUser.claseId}">
                    <p><em>Esta excursión se creará para tu clase: ${currentUser.claseNombre}.</em></p>` : ''}
                     ${currentUser.rol === 'TUTOR' && !currentUser.claseId ? `
                    <p class="error-message"><em>No tienes una clase asignada. No puedes crear excursiones.</em></p>` : ''}


                    <div class="form-buttons">
                        <button type="submit" class="success" ${currentUser.rol === 'TUTOR' && !currentUser.claseId ? 'disabled' : ''}>${idExcursion ? 'Guardar Cambios' : 'Crear Excursión'}</button>
                        <button type="button" id="btnCancelarFormExcursion" class="secondary">Cancelar</button>
                    </div>
                    <p id="formExcursionError" class="error-message"></p>
                </form>
            </div>
        `;
        formExcursionWrapper.innerHTML = formHtml;
        formExcursionWrapper.style.display = 'block';
        document.getElementById('formGestionExcursion').addEventListener('submit', saveExcursion);
        document.getElementById('btnCancelarFormExcursion').onclick = () => { formExcursionWrapper.innerHTML = ''; formExcursionWrapper.style.display = 'none'; };
    }

    async function saveExcursion(event) {
        event.preventDefault();
        const errorP = document.getElementById('formExcursionError');
        if(errorP) errorP.textContent = '';

        const excursionId = document.getElementById('excursionId').value;
        const paraClaseIdSelect = document.getElementById('paraClaseIdExcursion');

        const excursionData = {
            nombre_excursion: document.getElementById('nombreExcursion').value,
            actividad_descripcion: document.getElementById('actividadExcursion').value,
            lugar: document.getElementById('lugarExcursion').value,
            fecha_excursion: document.getElementById('fechaExcursion').value,
            hora_salida: document.getElementById('horaSalidaExcursion').value,
            hora_llegada: document.getElementById('horaLlegadaExcursion').value,
            coste_excursion_alumno: parseFloat(document.getElementById('costeExcursion').value) || 0,
            vestimenta: document.getElementById('vestimentaExcursion').value,
            transporte: document.getElementById('transporteExcursion').value,
            justificacion_texto: document.getElementById('justificacionExcursion').value,
            notas_excursion: document.getElementById('notasExcursion').value,
            para_clase_id: paraClaseIdSelect ? (paraClaseIdSelect.value || null) : (currentUser.rol === 'TUTOR' ? currentUser.claseId : null)
        };
        
        if (excursionData.para_clase_id === "") excursionData.para_clase_id = null;


        let method = 'POST';
        let endpoint = '/excursiones';
        if (excursionId) {
            method = 'PUT';
            endpoint = `/excursiones/${excursionId}`;
        }
        
        const submitButton = event.target.querySelector('button[type="submit"]');
        try {
            if(submitButton) submitButton.disabled = true;
            await apiFetch(endpoint, method, excursionData);
            document.getElementById('formExcursionWrapper').innerHTML = ''; // Limpiar form
            loadExcursiones(); 
        } catch (error) {
            if(errorP) errorP.textContent = error.message || 'Error guardando excursión.';
        } finally {
            if(submitButton) submitButton.disabled = false;
        }
    }
    
    async function loadExcursiones() {
        if (!excursionesContentDiv || !currentToken) return;
        excursionesContentDiv.innerHTML = "<p>Cargando excursiones...</p>";
        const formExcursionWrapper = document.createElement('div');
        formExcursionWrapper.id = 'formExcursionWrapper';
        formExcursionWrapper.classList.add('form-wrapper');
        formExcursionWrapper.style.marginBottom = '20px';


        try {
            const data = await apiFetch('/excursiones');
            let html = '<h3>Listado de Excursiones</h3>';
             if (currentUser.rol === 'DIRECCION' || (currentUser.rol === 'TUTOR' && currentUser.claseId) ){
                html += `<button id="btnShowFormNuevaExcursion" class="success" style="margin-bottom:15px;">+ Crear Nueva Excursión</button>`;
            }
            
            html += `<table class="tabla-datos"><thead><tr><th>Nombre</th><th>Fecha</th><th>Lugar</th><th>Clase Destino</th><th>Creador</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.excursiones && data.excursiones.length > 0) {
                data.excursiones.forEach(ex => {
                    html += `<tr data-excursion-id="${ex.id}">
                        <td>${ex.nombre_excursion}</td>
                        <td>${ex.fecha_excursion}</td>
                        <td>${ex.lugar}</td>
                        <td>${ex.nombre_clase_destino || '<em>Global</em>'}</td>
                        <td>${ex.nombre_creador}</td>
                        <td class="actions-cell">
                            <button class="view-participaciones secondary" data-excursionid="${ex.id}" data-excursionnombre="${ex.nombre_excursion}">Ver Participaciones</button>
                            ${ (currentUser.rol === 'DIRECCION' || (currentUser.rol === 'TUTOR' && ex.creada_por_usuario_id === currentUser.id) || (currentUser.rol === 'TUTOR' && ex.para_clase_id === currentUser.claseId) ) ? 
                                `<button class="edit-excursion warning" data-id="${ex.id}">Editar</button> 
                                 <button class="delete-excursion danger" data-id="${ex.id}" data-nombre="${ex.nombre_excursion}">Eliminar</button>` : ''}
                        </td>
                    </tr>`;
                });
            } else {
                html += '<tr><td colspan="6" style="text-align:center;">No hay excursiones registradas.</td></tr>';
            }
            html += '</tbody></table>';
            
            excursionesContentDiv.innerHTML = html;
            excursionesContentDiv.insertBefore(formExcursionWrapper, excursionesContentDiv.firstChild);


            if(document.getElementById('btnShowFormNuevaExcursion')) {
                document.getElementById('btnShowFormNuevaExcursion').onclick = () => showFormExcursion();
            }
            excursionesContentDiv.querySelectorAll('.edit-excursion').forEach(b => b.onclick = async (e) => {
                const excursionId = e.target.dataset.id;
                try {
                    const excursionData = await apiFetch(`/excursiones/${excursionId}`);
                    showFormExcursion(excursionId, excursionData);
                } catch (error) {
                    showGlobalError("Error al cargar datos de la excursión para editar: " + error.message, formExcursionWrapper);
                }
            });
            excursionesContentDiv.querySelectorAll('.delete-excursion').forEach(b => b.onclick=(e)=>deleteExcursion(e.target.dataset.id, e.target.dataset.nombre));
            excursionesContentDiv.querySelectorAll('.view-participaciones').forEach(b => b.onclick=(e)=>{ 
                sessionStorage.setItem('filtroParticipacionesExcursionId',e.target.dataset.excursionid); 
                sessionStorage.setItem('filtroParticipacionesNombreExcursion',e.target.dataset.excursionnombre); 
                navigateTo('participaciones'); 
            });

        } catch (error) {
            showGlobalError(`Error al cargar excursiones: ${error.message}`, excursionesContentDiv);
             excursionesContentDiv.insertBefore(formExcursionWrapper, excursionesContentDiv.firstChild);
             if(document.getElementById('btnShowFormNuevaExcursion')) {
                document.getElementById('btnShowFormNuevaExcursion').onclick = () => showFormExcursion();
            }
        }
    }
    async function deleteExcursion(idExcursion, nombreExcursion){
        if(!confirm(`¿Seguro que quieres eliminar la excursión "${nombreExcursion}"? Se borrarán también todas las participaciones asociadas.`)) return;
        try {
            await apiFetch(`/excursiones/${idExcursion}`, 'DELETE');
            alert("Excursión eliminada.");
            loadExcursiones();
        } catch(error){
            showGlobalError(error.message, document.getElementById('formExcursionWrapper'));
        }
    }
    
    // --- Participaciones --- 
    async function loadParticipaciones(excursionIdFiltroExterno = null, nombreExcursionFiltroExterno = null) {
        if (!participacionesContentDiv) return;
        participacionesContentDiv.innerHTML = "<p>Cargando participaciones...</p>";
    
        const excursionIdActual = excursionIdFiltroExterno || sessionStorage.getItem('filtroParticipacionesExcursionId');
        const nombreExcursionActual = nombreExcursionFiltroExterno || sessionStorage.getItem('filtroParticipacionesNombreExcursion');
    
        let selectExcursionesHtml = '<option value="">-- Selecciona una excursión --</option>';
        let todasLasExcursiones = [];
        try {
            const dataExcursiones = await apiFetch('/excursiones');
            todasLasExcursiones = dataExcursiones.excursiones || [];
            todasLasExcursiones.forEach(ex => {
                selectExcursionesHtml += `<option value="${ex.id}" ${excursionIdActual == ex.id ? 'selected' : ''}>${ex.nombre_excursion} (${ex.fecha_excursion})</option>`;
            });
        } catch (error) {
            console.error("Error cargando lista de excursiones para filtro de participaciones:", error);
            selectExcursionesHtml = '<option value="">Error al cargar excursiones</option>';
        }
    
        let filtroClaseHtml = '';
        if (currentUser.rol === 'DIRECCION') {
            filtroClaseHtml = `
                <label for="selectFiltroClaseParticipaciones">Filtrar por Clase (solo para excursiones globales):</label>
                <select id="selectFiltroClaseParticipaciones">
                    <option value="">-- Todas las clases --</option>`;
            if (listaDeClasesGlobal.length === 0) {
                 try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) { console.error("Error cargando clases para filtro de participaciones", error); }
            }
            listaDeClasesGlobal.forEach(clase => {
                filtroClaseHtml += `<option value="${clase.id}">${clase.nombre_clase}</option>`;
            });
            filtroClaseHtml += `</select>`;
        }
    
        let html = `
            <h3>Gestión de Participación en Excursiones</h3>
            <div class="filtros-participaciones">
                <label for="selectExcursionParticipaciones">Selecciona Excursión:</label>
                <select id="selectExcursionParticipaciones">${selectExcursionesHtml}</select>
                ${filtroClaseHtml}
            </div>
            <div id="resumenParticipacionesContainer" style="margin-top: 20px; padding: 15px; background-color: #eef; border-radius: 5px;"></div>
            <div id="tablaParticipacionesContainer"></div>`;
        participacionesContentDiv.innerHTML = html;
    
        const selectExcursion = document.getElementById('selectExcursionParticipaciones');
        if (selectExcursion) {
            selectExcursion.onchange = (e) => {
                const selectedExId = e.target.value;
                const selectedExNombre = e.target.options[e.target.selectedIndex].text;
                sessionStorage.setItem('filtroParticipacionesExcursionId', selectedExId);
                sessionStorage.setItem('filtroParticipacionesNombreExcursion', selectedExNombre);
                if (selectedExId) {
                    renderTablaParticipaciones(selectedExId, selectedExNombre);
                } else {
                    document.getElementById('tablaParticipacionesContainer').innerHTML = '<p>Por favor, selecciona una excursión para ver las participaciones.</p>';
                    document.getElementById('resumenParticipacionesContainer').innerHTML = '';
                }
            };
        }
    
        if (document.getElementById('selectFiltroClaseParticipaciones')) {
            document.getElementById('selectFiltroClaseParticipaciones').onchange = () => {
                if (excursionIdActual) renderTablaParticipaciones(excursionIdActual, nombreExcursionActual);
            };
        }
    
        if (excursionIdActual) {
            renderTablaParticipaciones(excursionIdActual, nombreExcursionActual);
        } else {
            document.getElementById('tablaParticipacionesContainer').innerHTML = '<p>Por favor, selecciona una excursión para ver las participaciones.</p>';
            document.getElementById('resumenParticipacionesContainer').innerHTML = '';
        }
    }
    
    async function renderTablaParticipaciones(excursionId, excursionNombre) {
        const container = document.getElementById('tablaParticipacionesContainer');
        const resumenContainer = document.getElementById('resumenParticipacionesContainer');
        if (!container || !resumenContainer) return;
    
        container.innerHTML = `<p>Cargando participaciones para "${excursionNombre}"...</p>`;
        resumenContainer.innerHTML = ''; 
    
        let endpoint = `/excursiones/${excursionId}/participaciones`;
        const filtroClaseSelect = document.getElementById('selectFiltroClaseParticipaciones');
        let viewClaseId = null;
        if (currentUser.rol === 'DIRECCION' && filtroClaseSelect && filtroClaseSelect.value) {
            viewClaseId = filtroClaseSelect.value;
            endpoint += `?view_clase_id=${viewClaseId}`;
        }
    
        try {
            const data = await apiFetch(endpoint);
            if (!data || !data.alumnosParticipaciones) {
                container.innerHTML = `<p class="error-message">No se pudieron cargar los datos de participación.</p>`;
                return;
            }

            const r = data.resumen;
            let resumenHtml = `<h4>Resumen de Participación: "${excursionNombre}"</h4>
                <div class="resumen-grid">
                    <div><strong>Total Alumnos Listados:</strong> ${r.totalAlumnos}</div>
                    <div><strong>Autorización Firmada:</strong> Sí: ${r.totalConAutorizacionFirmadaSi} | No: ${r.totalConAutorizacionFirmadaNo}</div>
                    <div><strong>Estado Pago (Global):</strong> Pagado: ${r.totalAlumnosPagadoGlobal} | Parcial: ${r.totalConPagoRealizadoParcial} | No Pagado: ${r.totalConPagoRealizadoNo}</div>
                    <div><strong>Total Recaudado (Global):</strong> ${r.sumaTotalCantidadPagadaGlobal.toFixed(2)} €</div>
                </div>`;
            if (r.resumenPorClase && r.resumenPorClase.length > 0) {
                resumenHtml += `<h5>Detalle por Clase:</h5><table class="tabla-datos tabla-resumen-clase">
                                <thead><tr><th>Clase</th><th>Nº Alumnos</th><th>Total Pagado Sí</th><th>Recaudado (€)</th></tr></thead><tbody>`;
                r.resumenPorClase.forEach(rc => {
                    resumenHtml += `<tr><td>${rc.nombre_clase}</td><td>${rc.alumnosEnClase}</td><td>${rc.totalAlumnosPagadoEnClase}</td><td>${rc.sumaTotalCantidadPagadaEnClase.toFixed(2)}</td></tr>`;
                });
                resumenHtml += `</tbody></table>`;
            }
            resumenContainer.innerHTML = resumenHtml;
    
            let html = `<h4>Participantes para: ${excursionNombre}</h4>
                        <p style="font-size:0.9em; color: #555;">(Total alumnos listados: ${data.alumnosParticipaciones.length})</p>
                        <table class="tabla-datos tabla-participaciones">
                            <thead>
                                <tr>
                                    <th>Alumno</th>
                                    <th>Clase</th>
                                    <th>Autorización</th>
                                    <th>Fecha Autoriz.</th>
                                    <th>Pago</th>
                                    <th>Cantidad Pagada (€)</th>
                                    <th>Fecha Pago</th>
                                    <th>Notas</th>
                                    <th class="status-column">Estado</th> 
                                </tr>
                            </thead>
                            <tbody>`;
            
            if (data.alumnosParticipaciones.length > 0) {
                data.alumnosParticipaciones.forEach(ap => {
                    const esCampoDeshabilitado = ap.autorizacion_firmada === 'Sí' && ap.fecha_autorizacion;
                    html += `<tr data-participacion-id="${ap.participacion_id || ''}" data-alumno-id="${ap.alumno_id}">
                                <td>${ap.nombre_completo}</td>
                                <td>${ap.nombre_clase}</td>
                                <td><select class="participacion-field-edit" data-field="autorizacion_firmada" data-alumnoid="${ap.alumno_id}" ${esCampoDeshabilitado ? 'disabled' : ''}>
                                    <option value="No" ${ap.autorizacion_firmada === 'No' ? 'selected' : ''}>No</option>
                                    <option value="Sí" ${ap.autorizacion_firmada === 'Sí' ? 'selected' : ''}>Sí</option>
                                </select></td>
                                <td><input type="date" class="participacion-field-edit" data-field="fecha_autorizacion" data-alumnoid="${ap.alumno_id}" value="${ap.fecha_autorizacion || ''}" ${esCampoDeshabilitado ? 'disabled' : ''}></td>
                                <td><select class="participacion-field-edit" data-field="pago_realizado" data-alumnoid="${ap.alumno_id}">
                                    <option value="No" ${ap.pago_realizado === 'No' ? 'selected' : ''}>No</option>
                                    <option value="Parcial" ${ap.pago_realizado === 'Parcial' ? 'selected' : ''}>Parcial</option>
                                    <option value="Sí" ${ap.pago_realizado === 'Sí' ? 'selected' : ''}>Sí</option>
                                </select></td>
                                <td><input type="number" step="0.01" class="participacion-field-edit" data-field="cantidad_pagada" data-alumnoid="${ap.alumno_id}" value="${ap.cantidad_pagada || 0}" min="0" style="width:70px;"></td>
                                <td><input type="date" class="participacion-field-edit" data-field="fecha_pago" data-alumnoid="${ap.alumno_id}" value="${ap.fecha_pago || ''}"></td>
                                <td><textarea class="participacion-field-edit" data-field="notas_participacion" data-alumnoid="${ap.alumno_id}" rows="1" style="width:150px; min-height:2em;">${ap.notas_participacion || ''}</textarea></td>
                                <td class="status-message-cell"></td>
                             </tr>`;
                });
            } else {
                html += `<tr><td colspan="9" style="text-align:center;">No hay alumnos para mostrar para esta excursión ${filtroClaseSelect && filtroClaseSelect.value ? 'en la clase seleccionada' : '' }.</td></tr>`;
            }
            html += `</tbody></table>`;
            container.innerHTML = html;
                
            container.querySelectorAll('.participacion-field-edit').forEach(input => {
                const eventType = (input.tagName === 'SELECT' || input.type === 'date') ? 'change' : 'blur';
                input.addEventListener(eventType, (e) => saveParticipacionOnFieldChange(e.target, excursionId));
            });
    
        } catch (error) {
            container.innerHTML = `<p class="error-message">Error al cargar participaciones: ${error.message}</p>`;
            resumenContainer.innerHTML = '';
        }
    }

    async function saveParticipacionOnFieldChange(changedElement, excursionId) {
        const trElement = changedElement.closest('tr');
        const alumnoId = trElement.dataset.alumnoId;
        const statusCell = trElement.querySelector('.status-message-cell');
        if(statusCell) statusCell.textContent = '';
    
        const participacionData = {
            excursion_id: parseInt(excursionId),
            alumno_id: parseInt(alumnoId),
            autorizacion_firmada: trElement.querySelector('[data-field="autorizacion_firmada"]').value,
            fecha_autorizacion: trElement.querySelector('[data-field="fecha_autorizacion"]').value || null,
            pago_realizado: trElement.querySelector('[data-field="pago_realizado"]').value,
            cantidad_pagada: parseFloat(trElement.querySelector('[data-field="cantidad_pagada"]').value) || 0,
            fecha_pago: trElement.querySelector('[data-field="fecha_pago"]').value || null,
            notas_participacion: trElement.querySelector('[data-field="notas_participacion"]').value.trim() || null
        };
    
        if (participacionData.autorizacion_firmada === 'Sí' && !participacionData.fecha_autorizacion) {
            showTemporaryStatusInCell(statusCell, "Fecha autorización requerida.", true);
            return;
        }
        if ((participacionData.pago_realizado === 'Sí' || participacionData.pago_realizado === 'Parcial') && !participacionData.fecha_pago) {
             showTemporaryStatusInCell(statusCell, "Fecha de pago requerida.", true);
            return;
        }
         if (participacionData.pago_realizado === 'Parcial' && participacionData.cantidad_pagada <= 0) {
            showTemporaryStatusInCell(statusCell, "Pago parcial > 0€.", true);
            return;
        }

        const originalBackgroundColor = changedElement.style.backgroundColor;
        changedElement.style.backgroundColor = "#fff9c4"; 
    
        try {
            const resultado = await apiFetch('/participaciones', 'POST', participacionData);
            trElement.dataset.participacionId = resultado.id; 

            const autorizacionSelect = trElement.querySelector('[data-field="autorizacion_firmada"]');
            const fechaAutorizacionInput = trElement.querySelector('[data-field="fecha_autorizacion"]');
            if (resultado.autorizacion_firmada === 'Sí' && resultado.fecha_autorizacion) {
                if(autorizacionSelect) autorizacionSelect.disabled = true;
                if(fechaAutorizacionInput) fechaAutorizacionInput.disabled = true;
            } else {
                if(autorizacionSelect) autorizacionSelect.disabled = false;
                if(fechaAutorizacionInput) fechaAutorizacionInput.disabled = false;
            }
            
            changedElement.style.backgroundColor = "#c8e6c9"; 
            showTemporaryStatusInCell(statusCell, "Guardado!", false, 2000);
            setTimeout(() => { changedElement.style.backgroundColor = originalBackgroundColor; }, 2000);
    
            const currentExcursionId = sessionStorage.getItem('filtroParticipacionesExcursionId');
            const currentExcursionNombre = sessionStorage.getItem('filtroParticipacionesNombreExcursion');
            if (currentExcursionId && currentExcursionNombre) {
                updateParticipacionesSummary(currentExcursionId, currentExcursionNombre);
            }
    
        } catch (error) {
            console.error("Error guardando participación:", error);
            changedElement.style.backgroundColor = "#ffcdd2"; 
            showTemporaryStatusInCell(statusCell, error.message || "Error", true, 5000);
            setTimeout(() => { changedElement.style.backgroundColor = originalBackgroundColor; }, 3000);
        }
    }
    
    async function updateParticipacionesSummary(excursionId, excursionNombre) {
        const resumenContainer = document.getElementById('resumenParticipacionesContainer');
        if (!resumenContainer) return;
    
        let endpoint = `/excursiones/${excursionId}/participaciones`;
        const filtroClaseSelect = document.getElementById('selectFiltroClaseParticipaciones');
        if (currentUser.rol === 'DIRECCION' && filtroClaseSelect && filtroClaseSelect.value) {
            endpoint += `?view_clase_id=${filtroClaseSelect.value}`;
        }
    
        try {
            const data = await apiFetch(endpoint); 
            if (data && data.resumen) {
                const r = data.resumen;
                let resumenHtml = `<h4>Resumen de Participación: "${excursionNombre}"</h4>
                    <div class="resumen-grid">
                        <div><strong>Total Alumnos Listados:</strong> ${r.totalAlumnos}</div>
                        <div><strong>Autorización Firmada:</strong> Sí: ${r.totalConAutorizacionFirmadaSi} | No: ${r.totalConAutorizacionFirmadaNo}</div>
                        <div><strong>Estado Pago (Global):</strong> Pagado: ${r.totalAlumnosPagadoGlobal} | Parcial: ${r.totalConPagoRealizadoParcial} | No Pagado: ${r.totalConPagoRealizadoNo}</div>
                        <div><strong>Total Recaudado (Global):</strong> ${r.sumaTotalCantidadPagadaGlobal.toFixed(2)} €</div>
                    </div>`;
                if (r.resumenPorClase && r.resumenPorClase.length > 0) {
                    resumenHtml += `<h5>Detalle por Clase:</h5><table class="tabla-datos tabla-resumen-clase">
                                    <thead><tr><th>Clase</th><th>Nº Alumnos</th><th>Total Pagado Sí</th><th>Recaudado (€)</th></tr></thead><tbody>`; 
                    r.resumenPorClase.forEach(rc => {
                        resumenHtml += `<tr><td>${rc.nombre_clase}</td><td>${rc.alumnosEnClase}</td><td>${rc.totalAlumnosPagadoEnClase}</td><td>${rc.sumaTotalCantidadPagadaEnClase.toFixed(2)}</td></tr>`;
                    });
                    resumenHtml += `</tbody></table>`;
                }
                resumenContainer.innerHTML = resumenHtml;
            }
        } catch (error) {
            console.error("Error actualizando resumen de participaciones:", error);
            if (resumenContainer) resumenContainer.innerHTML = `<p class="error-message">Error actualizando resumen: ${error.message}</p>`;
        }
    }

    function showTemporaryStatusInCell(cellElement, message, isError, duration = 3000) {
        if (!cellElement) return;
        cellElement.textContent = message;
        cellElement.style.color = isError ? 'red' : 'green';
        cellElement.style.fontSize = '0.8em';
        setTimeout(() => {
            cellElement.textContent = '';
        }, duration);
    }
    

    // --- Admin Usuarios (Solo Dirección) ---
    async function loadAdminUsuarios() {
        if (!adminUsuariosContentDiv || !currentUser || currentUser.rol !== 'DIRECCION') {
                   if (adminUsuariosContentDiv) adminUsuariosContentDiv.innerHTML = "<p class='error-message'>Acceso denegado.</p>";
            return;
        }
        adminUsuariosContentDiv.innerHTML = "<p>Cargando usuarios...</p>";
        if (formAdminUsuarioWrapper) formAdminUsuarioWrapper.innerHTML = ''; 

        try {
            const data = await apiFetch('/usuarios');
            let html = '<h3>Listado de Usuarios del Sistema</h3>';
            html += `<button id="btnShowFormNuevoUsuarioTutor" class="success" style="margin-bottom:15px;">+ Crear Nuevo Usuario Tutor</button>`;
            
            html += `<table class="tabla-datos">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Email</th>
                                <th>Nombre Completo</th>
                                <th>Rol</th>
                                <th>Clase Asignada (Tutor)</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>`;
            
            if (data.usuarios && data.usuarios.length > 0) {
                data.usuarios.forEach(usuario => {
                    html += `<tr data-user-id="${usuario.id}">
                                <td>${usuario.id}</td>
                                <td>${usuario.email}</td>
                                <td>${usuario.nombre_completo}</td>
                                <td>${usuario.rol}</td>
                                <td>${usuario.rol === 'TUTOR' ? (usuario.clase_asignada_nombre || '<em>No asignada</em>') : 'N/A'}</td>
                                <td class="actions-cell">
                                    ${usuario.rol !== 'DIRECCION' ? `
                                    <button class="edit-usuario warning" data-id="${usuario.id}" data-email="${usuario.email}" data-nombre="${usuario.nombre_completo}">Editar</button> 
                                    <button class="delete-usuario danger" data-id="${usuario.id}" data-nombre="${usuario.nombre_completo}">Eliminar</button>
                                    ` : '<em>(Admin no editable/eliminable aquí)</em>'}
                                </td>
                             </tr>`;
                });
            } else {
                html += '<tr><td colspan="6" style="text-align:center;">No hay usuarios registrados.</td></tr>';
            }
            html += '</tbody></table>';
            adminUsuariosContentDiv.innerHTML = html; 
            console.log('Elemento btnShowFormNuevoUsuarioTutor después de innerHTML:', document.getElementById('btnShowFormNuevoUsuarioTutor'));

            const btnShowForm = document.getElementById('btnShowFormNuevoUsuarioTutor');
            if (btnShowForm) {
                console.log('Añadiendo listener a btnShowFormNuevoUsuarioTutor');
                btnShowForm.addEventListener('click', () => { 
                    console.log('Clic en btnShowFormNuevoUsuarioTutor detectado'); 
                    showFormAdminUsuario(null, null); 
                });
            }
            
            adminUsuariosContentDiv.querySelectorAll('.edit-usuario').forEach(b => {
                console.log('Añadiendo listener a botón editar:', b);
                b.onclick = (e) => {
                    console.log('Clic en botón editar detectado', e.target);
                    const userId = e.target.dataset.id;
                    const userEmail = e.target.dataset.email;
                    const userNombre = e.target.dataset.nombre;
                    showFormAdminUsuario(userId, { email: userEmail, nombre_completo: userNombre });
                };
            });
            adminUsuariosContentDiv.querySelectorAll('.delete-usuario').forEach(b => {
                b.onclick = (e) => deleteAdminUsuario(e.target.dataset.id, e.target.dataset.nombre);
            });

        } catch (error) {
            showGlobalError(`Error al cargar usuarios: ${error.message}`, adminUsuariosContentDiv);
        }
    }

    function showFormAdminUsuario(userId = null, initialUserData = null) {
        console.log('showFormAdminUsuario llamada con:', { userId, initialUserData });
        console.log('formAdminUsuarioWrapper al inicio de showFormAdminUsuario:', document.getElementById('formAdminUsuarioWrapper'));
        if (!formAdminUsuarioWrapper) {
            console.error("Elemento formAdminUsuarioWrapper no encontrado.");
            return;
        }
        
        const isEditMode = userId && initialUserData;
        const formTitle = isEditMode ? "Editar Usuario Tutor" : "Crear Nuevo Usuario Tutor";
        const submitButtonText = isEditMode ? "Guardar Cambios" : "Crear Usuario";

        let formHtml = `
            <div class="form-container" style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <h4>${formTitle}</h4>
                <form id="formGestionUsuarioTutor">
                    ${isEditMode ? `<input type="hidden" id="editUserId" value="${userId}">` : ''}
                    <div>
                        <label for="adminUserEmail">Email:</label>
                        <input type="email" id="adminUserEmail" value="${isEditMode ? initialUserData.email : ''}" required>
                    </div>
                    <div>
                        <label for="adminUserNombreCompleto">Nombre Completo:</label>
                        <input type="text" id="adminUserNombreCompleto" value="${isEditMode ? initialUserData.nombre_completo : ''}" required>
                    </div>
        `;

        if (!isEditMode) { // Solo mostrar campo de contraseña en modo creación
            formHtml += `
                    <div>
                        <label for="adminUserPassword">Contraseña:</label>
                        <input type="password" id="adminUserPassword" required minlength="8">
                    </div>
                    <input type="hidden" id="adminUserRol" value="TUTOR"> 
            `;
        }

        formHtml += `
                    <div class="form-buttons" style="margin-top: 15px;">
                        <button type="submit" class="success">${submitButtonText}</button>
                        <button type="button" id="btnCancelarGestionUsuario" class="secondary">Cancelar</button>
                    </div>
                    <p id="formAdminUsuarioError" class="error-message" style="margin-top:10px;"></p>
                </form>
            </div>
        `;
        formAdminUsuarioWrapper.innerHTML = formHtml;
        formAdminUsuarioWrapper.style.display = 'block';

        const formElement = document.getElementById('formGestionUsuarioTutor');
        if (formElement) {
            formElement.addEventListener('submit', saveAdminUsuario);
        }
        const btnCancelar = document.getElementById('btnCancelarGestionUsuario');
        if (btnCancelar) {
            btnCancelar.onclick = () => {
                formAdminUsuarioWrapper.innerHTML = ''; 
                formAdminUsuarioWrapper.style.display = 'none';
            };
        }
    }

    async function saveAdminUsuario(event) {
        event.preventDefault();
        const errorP = document.getElementById('formAdminUsuarioError');
        if (errorP) errorP.textContent = '';

        const editUserIdInput = document.getElementById('editUserId');
        const isEditMode = editUserIdInput && editUserIdInput.value;

        const email = document.getElementById('adminUserEmail').value.trim();
        const nombre_completo = document.getElementById('adminUserNombreCompleto').value.trim();
        
        let userData = { email, nombre_completo };
        let method = 'POST';
        let endpoint = '/usuarios';

        if (isEditMode) {
            method = 'PUT';
            endpoint = `/usuarios/${editUserIdInput.value}`;
            // Password no se envía en modo edición según los requisitos
        } else {
            const password = document.getElementById('adminUserPassword').value;
            const rol = document.getElementById('adminUserRol').value; // Siempre TUTOR desde el form actual
            if (!password) {
                if (errorP) errorP.textContent = "La contraseña es requerida para crear un nuevo usuario.";
                return;
            }
            if (password.length < 8) {
                if (errorP) errorP.textContent = "La contraseña debe tener al menos 8 caracteres.";
                return;
            }
            userData.password = password;
            userData.rol = rol;
        }

        if (!email || !nombre_completo) {
            if (errorP) errorP.textContent = "Email y Nombre Completo son requeridos.";
            return;
        }
        
        const submitButton = event.target.querySelector('button[type="submit"]');
        try {
            if (submitButton) submitButton.disabled = true;

            await apiFetch(endpoint, method, userData);
            
            if (formAdminUsuarioWrapper) {
                 formAdminUsuarioWrapper.innerHTML = `<p class="success-message" style="padding:10px; background-color: #e8f5e9; border: 1px solid #4caf50; border-radius:4px;">Usuario ${isEditMode ? 'actualizado' : 'creado'} exitosamente.</p>`;
                 setTimeout(() => {
                    formAdminUsuarioWrapper.innerHTML = ''; 
                    formAdminUsuarioWrapper.style.display = 'none'; 
                 }, 3000);
            }
            loadAdminUsuarios(); 
        } catch (error) {
            console.error(`Error ${isEditMode ? 'actualizando' : 'guardando nuevo'} usuario:`, error);
            if (errorP) errorP.textContent = error.message || `Error desconocido al ${isEditMode ? 'actualizar' : 'crear'} el usuario.`;
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }

    async function deleteAdminUsuario(userId, userName) {
        if (!confirm(`¿Estás seguro de que quieres eliminar al usuario "${userName}" (ID: ${userId})? Esta acción no se puede deshacer.`)) {
            return;
        }
        console.log(`Intentando eliminar usuario ID: ${userId}, Nombre: ${userName}`);
        try {
            await apiFetch(`/usuarios/${userId}`, 'DELETE');
            alert(`Usuario "${userName}" (ID: ${userId}) eliminado correctamente.`);
            loadAdminUsuarios(); // Recargar la lista de usuarios
        } catch (error) {
            console.error(`Error eliminando usuario ${userId}:`, error);
            showGlobalError(`Error al eliminar usuario: ${error.message || 'Error desconocido.'}`);
        }
    }

    // --- INICIALIZACIÓN DE LA APP ---
    checkInitialLoginState();
}); // Fin de DOMContentLoaded
