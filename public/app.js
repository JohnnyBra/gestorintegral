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
 // Variable global para cachear la lista de clases, útil para varios selectores
    let listaDeClasesGlobal = []; 
    // --- Gestión de Clases --- (Renderizado y lógica de formularios completa)
  async function showFormClase(idClase = null, nombreExistente = '', tutorIdExistente = '') {
    console.log("Función showFormClase llamada con:", {idClase, nombreExistente, tutorIdExistente}); // NUEVO LOG
    const formClaseWrapper = document.getElementById('formClaseWrapper');
    if (!formClaseWrapper) {
        console.error("Elemento formClaseWrapper no encontrado.");
        return;
    }

    // Obtener lista de posibles tutores (usuarios con rol TUTOR)
    let tutoresDisponibles = [];
    try {
        const dataUsuarios = await apiFetch('/usuarios'); // Asume que este endpoint devuelve todos los usuarios
        if (dataUsuarios && dataUsuarios.usuarios) {
            tutoresDisponibles = dataUsuarios.usuarios.filter(u => u.rol === 'TUTOR');
        }
    } catch (error) {
        console.error("Error obteniendo lista de tutores:", error);
        // Continuar para mostrar el formulario, aunque sea sin tutores o con un mensaje.
    }

    let optionsTutoresHtml = '<option value="">-- Sin asignar --</option>';
    tutoresDisponibles.forEach(tutor => {
        // Solo incluir tutores que no tengan ya una clase asignada, O el tutor actualmente asignado a esta clase (si se está editando)
        const estaAsignadoAOtraClase = tutor.clase_asignada_id && tutor.clase_asignada_id !== idClase;
        const esTutorActual = tutor.id === parseInt(tutorIdExistente);

        if (!estaAsignadoAOtraClase || esTutorActual) {
            optionsTutoresHtml += `<option value="${tutor.id}" ${esTutorActual ? 'selected' : ''}>
                                      ${tutor.nombre_completo} (${tutor.email})
                                  </option>`;
        } else {
             // Opcional: mostrar tutores ya asignados pero deshabilitados o con un sufijo
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

    // Event Listeners para el formulario
    const formElement = document.getElementById('formGestionClase');
    if (formElement) {
        console.log("Asignando listener 'submit' al formulario formGestionClase:", formElement);
        
        // formElement.addEventListener('submit', saveClase); // LÍNEA ORIGINAL COMENTADA

        // NUEVO LISTENER SIMPLIFICADO PARA PRUEBA:
        formElement.addEventListener('submit', function(event) {
            console.log("Evento SUBMIT del formulario detectado. Evento:", event);
            event.preventDefault();
            console.log("event.preventDefault() llamado DENTRO del listener de prueba.");
            
            // Ahora llamamos a saveClase manualmente desde aquí, pasando el evento
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

async function saveClase(event) { // 'event' es el parámetro que recibe del listener
    console.log("saveClase INVOCADA. Evento:", event); // LOG 1: ¿Se llama la función?
    
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
        console.log("event.preventDefault() LLAMADO."); // LOG 2: ¿Se llama preventDefault?
    } else {
        console.error("El evento no es válido o no tiene preventDefault. Evento:", event); // LOG DE ERROR
        // Si ves esto, el formulario se enviará de forma tradicional y recargará.
        // Esto podría pasar si el listener no se adjuntó bien o el botón no es type="submit" dentro del form.
        // Pero tu log anterior "Asignando listener 'submit'..." sugiere que el listener SÍ se asigna.
    }

    const formClaseError = document.getElementById('formClaseError');
    if (formClaseError) formClaseError.textContent = '';

    const claseIdInput = document.getElementById('claseId');
    const nombreClaseInput = document.getElementById('nombreClase');
    const tutorClaseSelect = document.getElementById('tutorClase');

    if (!nombreClaseInput || !tutorClaseSelect || !claseIdInput) {
        if (formClaseError) formClaseError.textContent = 'Error: Elementos del formulario no encontrados.';
        console.error("Elementos del formulario no encontrados en saveClase."); // LOG
        return;
    }

    const idClase = claseIdInput.value;
    const nombre_clase = nombreClaseInput.value.trim().toUpperCase();
    const tutor_id = tutorClaseSelect.value ? parseInt(tutorClaseSelect.value) : null;

    console.log("Datos recogidos del formulario:", { idClase, nombre_clase, tutor_id }); // LOG 3: ¿Se recogen los datos?


    if (!nombre_clase) {
        if (formClaseError) formClaseError.textContent = 'El nombre de la clase es obligatorio.';
        console.warn("Nombre de la clase vacío."); // LOG
        return;
    }

    const claseData = { nombre_clase, tutor_id };
    let method = 'POST';
    let endpoint = '/clases';

    if (idClase) {
        method = 'PUT';
        endpoint = `/clases/${idClase}`;
    }

    console.log(`Intentando apiFetch: Method=${method}, Endpoint=${endpoint}, Data=`, claseData); // LOG 4

    try {
        const resultado = await apiFetch(endpoint, method, claseData); // La llamada a la API
        console.log("Respuesta de guardar clase (apiFetch):", resultado); // LOG 5

        const formClaseWrapper = document.getElementById('formClaseWrapper');
        if (formClaseWrapper) formClaseWrapper.innerHTML = '';
        
        loadClases(); // Recargar la tabla

        const dataClasesActualizadas = await apiFetch('/clases');
        listaDeClasesGlobal = dataClasesActualizadas.clases || [];
        if (document.getElementById('alumnos-section') && document.getElementById('alumnos-section').style.display === 'block' && document.getElementById('csvClaseDestino')) {
            poblarSelectorClaseDestinoCSV();
        }
    } catch (error) {
        console.error(`Error guardando clase (${method} ${endpoint}):`, error); // LOG DE ERROR
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
        const botonAnadirClase = document.getElementById('btnShowFormNuevaClase');
console.log("Intentando encontrar el botón '+ Añadir Nueva Clase':", botonAnadirClase); // NUEVO LOG

if(botonAnadirClase) {
    botonAnadirClase.onclick = () => {
        console.log("Botón '+ Añadir Nueva Clase' pulsado. Llamando a showFormClase..."); // NUEVO LOG
        showFormClase();
    };
} else {
    console.error("Botón '+ Añadir Nueva Clase' (btnShowFormNuevaClase) NO encontrado en el DOM."); // NUEVO LOG
}
    }
    async function saveClase(event) { /* ... (como te la di antes) ... */ }
    async function deleteClase(idClase, nombreClase) { /* ... (como te la di antes) ... */ }

    // --- Alumnos --- (Esqueleto para completar, similar a Clases)
    async function loadAlumnos(claseIdFiltro = null, nombreClaseFiltro = null) { /* ... (como te la di antes, es bastante completa) ... */ }
    async function showFormAlumno(idAlumno = null, listaTodasClases = null, nombreExistente = '', claseIdExistente = '') { /* ... (necesitas implementarla) ... */ }
    async function saveAlumno(event) { /* ... (necesitas implementarla) ... */ }
    async function deleteAlumno(idAlumno, nombreAlumno) { /* ... (necesitas implementarla) ... */ }

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
                // Si listaDeClasesGlobal está vacía, la cargamos.
                // Esta variable también se podría poblar/actualizar cuando se visita la sección "Gestionar Clases".
                if (listaDeClasesGlobal.length === 0) {
                    console.log("[poblarSelectorClaseDestinoCSV] listaDeClasesGlobal vacía, cargando clases del API...");
                    const dataClases = await apiFetch('/clases'); // Llama a GET /api/clases
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
        
        // Determinar el clase_id final para enviar al backend
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

    // --- Modificación de loadAlumnos() para incluir el formulario de importación ---
    async function loadAlumnos(claseIdFiltroExterno = null, nombreClaseFiltroExterno = null) {
        if (!alumnosContentDiv || !currentToken) return;
        alumnosContentDiv.innerHTML = "<p>Cargando alumnos...</p>";

        // HTML para el formulario de importación CSV (lo generamos siempre)
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
        
        // Lógica para el título y el endpoint de la lista de alumnos
        const filtroClaseIdActual = claseIdFiltroExterno || sessionStorage.getItem('filtroAlumnosClaseId');
        const filtroNombreClaseActual = nombreClaseFiltroExterno || sessionStorage.getItem('filtroAlumnosNombreClase');
        let endpoint = '/alumnos';
        let queryParams = new URLSearchParams();
        let tituloSeccionAlumnos = "Alumnos";

        if (currentUser.rol === 'TUTOR') {
            if (!currentUser.claseId) { 
                alumnosContentDiv.innerHTML = importCsvHtml + "<p>No tienes clase asignada para ver o importar alumnos.</p>"; 
                poblarSelectorClaseDestinoCSV(); // Poblar el select (estará deshabilitado y mostrará mensaje)
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
                        <button class="edit-alumno warning" data-id="${a.id}">Editar</button>
                        <button class="delete-alumno danger" data-id="${a.id}" data-nombre="${a.nombre_completo}">Eliminar</button>
                        </td></tr>`; 
                });
            } else { 
                htmlTablaAlumnos += `<tr><td colspan="3" style="text-align:center;">No hay alumnos para mostrar según el filtro actual.</td></tr>`; 
            }
            htmlTablaAlumnos += `</tbody></table><div id="formAlumnoWrapper" class="form-wrapper" style="margin-top:20px;"></div>`;
            
            alumnosContentDiv.innerHTML = importCsvHtml + htmlTablaAlumnos;

            // Poblar select de importación y añadir listener al formulario de importación
            poblarSelectorClaseDestinoCSV(); 
            const formImp = document.getElementById('formImportarAlumnosCSV');
            if(formImp) formImp.addEventListener('submit', handleImportAlumnosCSV);

            // Listeners para la tabla de alumnos y formulario de alumno individual
            if(document.getElementById('btnShowFormNuevoAlumno')) document.getElementById('btnShowFormNuevoAlumno').onclick = () => showFormAlumno();
            alumnosContentDiv.querySelectorAll('.edit-alumno').forEach(b=>b.onclick = async (e)=>{
                const alumnoId = e.target.dataset.id;
                try { 
                    const dataAlumnoUnico = await apiFetch(`/alumnos/${alumnoId}`); 
                    showFormAlumno(alumnoId, dataAlumnoUnico.alumno);
                } catch(err){showGlobalError("Error cargando alumno para editar.");}
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
