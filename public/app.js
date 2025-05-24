// --- public/app.js (Revisado y Mejorado a partir de tu versión) ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Estado Global del Frontend ---
    let currentCalendarYear = new Date().getFullYear();
    let currentCalendarMonth = new Date().getMonth(); // 0-indexed (0 for January, 11 for December)
    // window.dashboardExcursions is now the primary store for excursions fetched for the calendar
    // let dashboardExcursions = []; // This local one can be removed or kept for other dashboard specific uses if any.
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

    // --- Modal Element Variables ---
    const excursionDetailModal = document.getElementById('excursion-detail-modal');
    const modalExcursionTitle = document.getElementById('modal-excursion-title');
    const modalExcursionDate = document.getElementById('modal-excursion-date');
    const modalExcursionPlace = document.getElementById('modal-excursion-place');
    const modalExcursionDescription = document.getElementById('modal-excursion-description');
    const modalExcursionHoraSalida = document.getElementById('modal-excursion-hora-salida');
    const modalExcursionHoraLlegada = document.getElementById('modal-excursion-hora-llegada');
    const modalExcursionCoste = document.getElementById('modal-excursion-coste');
    const modalExcursionVestimenta = document.getElementById('modal-excursion-vestimenta');
    const modalExcursionTransporte = document.getElementById('modal-excursion-transporte');
    const modalExcursionJustificacion = document.getElementById('modal-excursion-justificacion');
    const modalExcursionNotas = document.getElementById('modal-excursion-notas');
    const modalCloseButton = document.getElementById('modal-close-button');

    console.log("app.js cargado y DOMContentLoaded disparado. API_BASE_URL:", API_BASE_URL);
    if (!loginForm) console.error("Elemento loginForm NO encontrado.");
    if (!excursionDetailModal) console.error("Elemento excursionDetailModal NO encontrado.");


    // --- Funciones Auxiliares ---
    async function apiFetch(endpoint, method = 'GET', body = null, token = currentToken) {
        const url = `${API_BASE_URL}${endpoint}`;
        console.log(`[apiFetch] INICIO: ${method} ${url}`);

        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const options = { method, headers };
        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }
        
        try {
            const response = await fetch(url, options);
            if (response.status === 204) return null; 
            
            const responseText = await response.text();
            let responseData;
            try {
                responseData = responseText ? JSON.parse(responseText) : {};
            } catch (e) {
                console.error(`[apiFetch] Error parseando respuesta JSON de ${url}. Status: ${response.status}. Error: ${e.message}. ResponseText: ${responseText.substring(0,200)}`);
                throw new Error(`Error HTTP ${response.status} (${response.statusText}). Respuesta no JSON.`);
            }
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    if (typeof handleLogout === "function") handleLogout(); 
                    alert(responseData.error || "Sesión inválida o acceso denegado. Por favor, inicia sesión de nuevo.");
                }
                throw new Error(responseData.error || `Error HTTP ${response.status}`);
            }
            return responseData;
        } catch (error) {
            console.error(`[apiFetch] CATCH GENERAL (${method} ${url}):`, error.message);
            if (error.message.toLowerCase().includes("failed to fetch")) {
                showGlobalError("No se pudo conectar con el servidor. Verifica tu conexión y que el servidor esté corriendo.");
            } else if (!error.message.toLowerCase().includes("sesión inválida")) {
                 showGlobalError(error.message);
            }
            throw error; 
        }
    }

    function showGlobalError(message, targetDiv = null) {
        console.error("ERROR APP:", message);
        if (targetDiv) {
            targetDiv.innerHTML = `<p class="error-message">${message}</p>`;
        } else if (loginErrorP && loginSection && loginSection.style.display === 'block') {
            loginErrorP.textContent = message;
        } else {
            alert(`Error en la aplicación: ${message}`);
        }
    }

    // --- Autenticación ---
    function handleAuthClick() { navigateTo('login'); }
    if (authButton) authButton.onclick = handleAuthClick;

    function handleLogout() {
        currentUser = null; currentToken = null;
        localStorage.removeItem('authToken'); localStorage.removeItem('userInfo');
        window.dashboardExcursions = []; // Clear excursions on logout
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
            const submitButton = loginForm.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;

            try {
                const data = await apiFetch('/auth/login', 'POST', { email, password }, null);
                if (data && data.token && data.user) {
                    handleLoginSuccess(data.user, data.token);
                } else { 
                    if (loginErrorP) loginErrorP.textContent = (data && data.error) || "Respuesta de login inesperada.";
                }
            } catch (error) { 
                if (loginErrorP && !loginErrorP.textContent) {
                    loginErrorP.textContent = error.message.includes("Credenciales incorrectas") ? error.message : "Error al iniciar sesión.";
                }
            } finally {
                if (submitButton) submitButton.disabled = false; 
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
        if(document.getElementById('excursion-calendar-container')) document.getElementById('excursion-calendar-container').innerHTML = ''; // Clear calendar
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
                apiFetch('/auth/me', 'GET', null, token)
                    .then(data => {
                        if (data && data.usuario) {
                            handleLoginSuccess(data.usuario, token); 
                        } else { handleLogout(); }
                    }).catch(() => handleLogout());
            } catch (e) { handleLogout(); }
        } else {
            updateUIAfterLogout();
            navigateTo('login'); 
        }
    }

    // --- Navegación ---
    function navigateTo(sectionName) {
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
        }
    }
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            if (currentToken || section === 'login') navigateTo(section); 
            else { navigateTo('login'); }
        });
    });

    // --- Carga de Contenido para Secciones ---
    function loadContentForSection(sectionName) {
        if (sectionName === 'login' || !currentToken) return;
        console.log("Cargando contenido para:", sectionName);
        switch (sectionName) {
            case 'dashboard': loadDashboardData(); break;
            case 'clases': loadClases(); break;
            case 'alumnos': loadAlumnos(); break;
            case 'excursiones': loadExcursiones(); break;
            case 'participaciones': loadParticipaciones(); break;
            case 'admin-usuarios': if (currentUser && currentUser.rol === 'DIRECCION') loadAdminUsuarios(); break;
        }
    }

    // --- Dashboard ---
    async function loadDashboardData() {
        if (!dashboardSummaryContentDiv) {
             console.error("Elemento dashboardSummaryContentDiv no encontrado.");
             // Still try to load calendar if its container exists
        }
        if (!currentToken) {
            if (dashboardSummaryContentDiv) dashboardSummaryContentDiv.innerHTML = '<p class="error-message">Error de sesión.</p>';
            return;
        }

        if (dashboardSummaryContentDiv) dashboardSummaryContentDiv.innerHTML = "<p>Cargando resumen...</p>";
        
        try {
            const excursionsData = await apiFetch('/excursiones');
            window.dashboardExcursions = excursionsData && excursionsData.excursiones ? excursionsData.excursiones : [];
        } catch (error) {
            console.error("Error fetching excursions for dashboard:", error);
            window.dashboardExcursions = [];
            if (dashboardSummaryContentDiv) dashboardSummaryContentDiv.innerHTML += '<p class="error-message">No se pudieron cargar las excursiones para el calendario.</p>';
        }

        if (typeof renderExcursionCalendar === 'function' && document.getElementById('excursion-calendar-container')) {
            renderExcursionCalendar(currentCalendarYear, currentCalendarMonth, window.dashboardExcursions || []);
        } else {
            console.warn("renderExcursionCalendar function not found or calendar container missing.");
        }

        try {
            const data = await apiFetch('/dashboard/summary');
            if (dashboardSummaryContentDiv) { // Check again in case it wasn't found initially
                if (!data) {
                    dashboardSummaryContentDiv.innerHTML = `<p class="error-message">No se pudo obtener el resumen.</p>`;
                    return;
                }
                let html = '<h4>Resumen General</h4>';
                // (Rest of summary HTML generation as before)
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
                dashboardSummaryContentDiv.innerHTML = html;
            }
        } catch (error) {
            console.error("[loadDashboardData] Error capturado al cargar datos del dashboard summary:", error.message);
            if (dashboardSummaryContentDiv) dashboardSummaryContentDiv.innerHTML = `<p class="error-message">Error al cargar el resumen: ${error.message}</p>`;
        }
    }

    let listaDeClasesGlobal = []; 
    // --- Gestión de Clases (Código existente) ---
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
            formElement.addEventListener('submit', function(event) {
                event.preventDefault();
                saveClase(event); 
            });
        }
        const btnCancelar = document.getElementById('btnCancelarFormClase');
        if (btnCancelar) {
            btnCancelar.onclick = () => { formClaseWrapper.innerHTML = ''; }; 
        }
    }
    
    async function saveClase(event) {
        const formClaseError = document.getElementById('formClaseError');
        if (formClaseError) formClaseError.textContent = '';
    
        const claseIdInput = document.getElementById('claseId');
        const nombreClaseInput = document.getElementById('nombreClase');
        const tutorClaseSelect = document.getElementById('tutorClase');
    
        if (!nombreClaseInput || !tutorClaseSelect || !claseIdInput) {
            if (formClaseError) formClaseError.textContent = 'Error: Elementos del formulario no encontrados.';
            return; 
        }
    
        const idClase = claseIdInput.value;
        const nombre_clase = nombreClaseInput.value.trim().toUpperCase();
        const tutor_id = tutorClaseSelect.value ? parseInt(tutorClaseSelect.value) : null;
    
        if (!nombre_clase) {
            if (formClaseError) formClaseError.textContent = 'El nombre de la clase es obligatorio.';
            return; 
        }
    
        const claseData = { nombre_clase, tutor_id };
        let method = 'POST';
        let endpoint = '/clases';
    
        if (idClase) {
            method = 'PUT';
            endpoint = `/clases/${idClase}`;
        }
    
        try {
            await apiFetch(endpoint, method, claseData);
            const formClaseWrapper = document.getElementById('formClaseWrapper');
            if (formClaseWrapper) formClaseWrapper.innerHTML = '';
            loadClases(); 
            const dataClasesActualizadas = await apiFetch('/clases');
            listaDeClasesGlobal = dataClasesActualizadas.clases || [];
            if (document.getElementById('alumnos-section') && document.getElementById('alumnos-section').style.display === 'block' && document.getElementById('csvClaseDestino')) {
                poblarSelectorClaseDestinoCSV();
            }
        } catch (error) {
            if (formClaseError) formClaseError.textContent = error.message || 'Error desconocido al guardar la clase.';
        }
    }
    async function loadClases() {
        if (!clasesContentDiv || !currentToken) return;
        clasesContentDiv.innerHTML = '<p>Cargando clases...</p>';
        try {
            const data = await apiFetch('/clases');
            listaDeClasesGlobal = data.clases || []; // Populate global list
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
        if (!confirm(`¿Estás seguro de que quieres eliminar la clase "${nombreClase}"?`)) return;
        try {
            await apiFetch(`/clases/${idClase}`, 'DELETE');
            loadClases(); 
            const dataClasesActualizadas = await apiFetch('/clases');
            listaDeClasesGlobal = dataClasesActualizadas.clases || [];
            if (document.getElementById('alumnos-section') && document.getElementById('alumnos-section').style.display === 'block' && document.getElementById('csvClaseDestino')) {
                 poblarSelectorClaseDestinoCSV();
            }
        } catch (error) {
            showGlobalError(error.message || "Error al eliminar la clase.");
        }
    }

    // --- Alumnos (Código existente) ---
    async function showFormAlumno(idAlumno = null, alumnoData = null) {
        const formAlumnoWrapper = document.getElementById('formAlumnoWrapper');
        if (!formAlumnoWrapper) return;
    
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
            if (listaDeClasesGlobal.length === 0) {
                try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) { opcionesClasesHtml = `<option value="">Error cargando clases</option>`; }
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
                    <div><label for="nombreAlumno">Nombre:</label><input type="text" id="nombreAlumno" value="${soloNombreExistente}" required></div>
                    <div><label for="apellidosAlumno">Apellidos:</label><input type="text" id="apellidosAlumno" value="${apellidosExistente}" required></div>
                    <div><label for="claseAlumno">Clase:</label><select id="claseAlumno" ${currentUser.rol === 'TUTOR' ? 'disabled' : ''} required>${opcionesClasesHtml}</select></div>
                    <div class="form-buttons"><button type="submit" class="success">${idAlumno ? 'Guardar' : 'Crear'}</button><button type="button" id="btnCancelarFormAlumno" class="secondary">Cancelar</button></div>
                    <p id="formAlumnoError" class="error-message"></p>
                </form>
            </div>`;
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
            if (formAlumnoError) formAlumnoError.textContent = 'Todos los campos son obligatorios.';
            return;
        }
        const alumnoData = { nombre, apellidos, clase_id: parseInt(clase_id) };
        let method = 'POST';
        let endpoint = '/alumnos';
        if (alumnoId) {
            method = 'PUT';
            endpoint = `/alumnos/${alumnoId}`;
        }
        try {
            await apiFetch(endpoint, method, alumnoData);
            document.getElementById('formAlumnoWrapper').innerHTML = '';
            loadAlumnos(sessionStorage.getItem('filtroAlumnosClaseId'), sessionStorage.getItem('filtroAlumnosNombreClase'));
        } catch (error) {
            if (formAlumnoError) formAlumnoError.textContent = error.message || 'Error guardando alumno.';
        }
    }
    async function deleteAlumno(idAlumno, nombreAlumno) {
        if (!confirm(`¿Seguro que quieres eliminar al alumno "${nombreAlumno}"?`)) return;
        try {
            await apiFetch(`/alumnos/${idAlumno}`, 'DELETE');
            loadAlumnos(sessionStorage.getItem('filtroAlumnosClaseId'), sessionStorage.getItem('filtroAlumnosNombreClase'));
        } catch (error) {
            showGlobalError(error.message || "Error al eliminar alumno.");
        }
    }
    async function poblarSelectorClaseDestinoCSV(selectElementId = 'csvClaseDestino') {
        const selectClase = document.getElementById(selectElementId);
        if (!selectClase) return;
        selectClase.innerHTML = '<option value="">Cargando clases...</option>';
        try {
            if (currentUser.rol === 'TUTOR') {
                if (currentUser.claseId && currentUser.claseNombre) {
                    selectClase.innerHTML = `<option value="${currentUser.claseId}" selected>${currentUser.claseNombre}</option>`;
                    selectClase.disabled = true;
                } else {
                    selectClase.innerHTML = '<option value="" disabled selected>No tienes clase asignada</option>';
                    selectClase.disabled = true;
                }
            } else if (currentUser.rol === 'DIRECCION') {
                if (listaDeClasesGlobal.length === 0) {
                    const dataClases = await apiFetch('/clases'); 
                    listaDeClasesGlobal = dataClases.clases || [];
                }
                let optionsHtml = '<option value="">-- Selecciona clase --</option>';
                if (listaDeClasesGlobal.length > 0) {
                    listaDeClasesGlobal.forEach(clase => optionsHtml += `<option value="${clase.id}">${clase.nombre_clase}</option>`);
                } else {
                    optionsHtml = '<option value="" disabled>No hay clases</option>';
                }
                selectClase.innerHTML = optionsHtml;
                selectClase.disabled = false;
            } else {
                selectClase.innerHTML = '<option value="" disabled>No autorizado</option>';
                selectClase.disabled = true;
            }
        } catch (error) {
            if (selectClase) selectClase.innerHTML = '<option value="">Error cargando</option>';
        }
    }
    async function handleImportAlumnosCSV(event) {
        event.preventDefault();
        const statusDiv = document.getElementById('importAlumnosStatus');
        if (!statusDiv) return;
        statusDiv.innerHTML = '<p><em>Procesando...</em></p>';
        const claseIdSelect = document.getElementById('csvClaseDestino');
        const fileInput = document.getElementById('csvFileAlumnos');
        if (!claseIdSelect || !fileInput || !fileInput.files || fileInput.files.length === 0) {
            statusDiv.innerHTML = '<p class="error-message">Selecciona clase y archivo CSV.</p>';
            return;
        }
        const clase_id_para_api = (currentUser.rol === 'TUTOR') ? currentUser.claseId : claseIdSelect.value;
        if (!clase_id_para_api) {
             statusDiv.innerHTML = `<p class="error-message">${currentUser.rol === 'TUTOR' ? 'No tienes clase asignada.' : 'Selecciona clase.'}</p>`;
             return;
        }
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = async function(e) {
            const csv_data = e.target.result;
            try {
                const resultado = await apiFetch('/alumnos/importar_csv', 'POST', { clase_id: clase_id_para_api, csv_data });
                let mensaje = `<p><strong>Resultado:</strong> ${resultado.message || 'Completado.'}</p><ul>`;
                if (resultado.importados !== undefined) mensaje += `<li>Importados: ${resultado.importados}</li>`;
                if (resultado.omitidos_duplicados !== undefined) mensaje += `<li>Omitidos (duplicados): ${resultado.omitidos_duplicados}</li>`;
                if (resultado.lineas_con_error > 0) {
                    mensaje += `<li style="color:red;">Líneas con error: ${resultado.lineas_con_error}</li>`;
                    if (resultado.detalles_errores && resultado.detalles_errores.length > 0) {
                        mensaje += `<li>Errores:<ul>${resultado.detalles_errores.slice(0,5).map(err => `<li>L${err.linea}: ${err.error}</li>`).join('')}</ul></li>`;
                    }
                }
                mensaje += `</ul>`;
                statusDiv.innerHTML = mensaje;
                loadAlumnos(sessionStorage.getItem('filtroAlumnosClaseId'), sessionStorage.getItem('filtroAlumnosNombreClase')); 
            } catch (error) {
                statusDiv.innerHTML = `<p class="error-message">Error importando: ${error.message}</p>`;
            } finally {
                if (fileInput) fileInput.value = ""; 
            }
        };
        reader.onerror = () => { statusDiv.innerHTML = '<p class="error-message">Error leyendo archivo.</p>'; };
        reader.readAsText(file, "UTF-8");
    }
    async function loadAlumnos(claseIdFiltroExterno = null, nombreClaseFiltroExterno = null) {
        if (!alumnosContentDiv || !currentToken) return;
        alumnosContentDiv.innerHTML = "<p>Cargando alumnos...</p>";
        const importCsvHtml = `<div id="import-alumnos-csv-container" style="padding:15px;border:1px solid #eee;margin-bottom:20px;background-color:#f9f9f9;border-radius:5px;"><h4>Importar Alumnos CSV</h4><form id="formImportarAlumnosCSV"><div><label for="csvClaseDestino">Clase Destino:</label><select id="csvClaseDestino" required></select></div><div><label for="csvFileAlumnos">Archivo CSV ("Apellidos, Nombre", UTF-8):</label><input type="file" id="csvFileAlumnos" accept=".csv" required></div><div class="form-buttons" style="justify-content:flex-start;margin-top:10px;"><button type="submit" class="success">Importar</button></div></form><div id="importAlumnosStatus" style="margin-top:10px;"></div></div><hr style="margin:20px 0;">`;
        const filtroClaseIdActual = claseIdFiltroExterno || sessionStorage.getItem('filtroAlumnosClaseId');
        const filtroNombreClaseActual = nombreClaseFiltroExterno || sessionStorage.getItem('filtroAlumnosNombreClase');
        let endpoint = '/alumnos';
        let queryParams = new URLSearchParams();
        let tituloSeccionAlumnos = "Alumnos";
        if (currentUser.rol === 'TUTOR') {
            if (!currentUser.claseId) { 
                alumnosContentDiv.innerHTML = importCsvHtml + "<p>No tienes clase asignada.</p>"; 
                poblarSelectorClaseDestinoCSV(); 
                const formImp = document.getElementById('formImportarAlumnosCSV');
                if(formImp) formImp.addEventListener('submit', handleImportAlumnosCSV);
                return; 
            }
            queryParams.append('claseId', currentUser.claseId);
            tituloSeccionAlumnos += ` de: ${currentUser.claseNombre}`;
        } else if (currentUser.rol === 'DIRECCION') {
            if (filtroClaseIdActual) {
                queryParams.append('claseId', filtroClaseIdActual);
                tituloSeccionAlumnos += ` de: ${filtroNombreClaseActual}`;
            } else {
                tituloSeccionAlumnos += ` (Todas las Clases)`;
            }
        }
        if (queryParams.toString()) endpoint += `?${queryParams.toString()}`;
        try {
            const dataAlumnos = await apiFetch(endpoint);
            if (currentUser.rol === 'DIRECCION' && listaDeClasesGlobal.length === 0) {
                const dataClasesParaFiltro = await apiFetch('/clases');
                listaDeClasesGlobal = dataClasesParaFiltro ? dataClasesParaFiltro.clases : [];
            }
            let htmlTablaAlumnos = `<h3 style="margin-top:0;">${tituloSeccionAlumnos}</h3>`;
            if (currentUser.rol === 'DIRECCION' && !filtroClaseIdActual) {
                htmlTablaAlumnos += `<div style="margin-bottom:15px;">Filtrar: <select id="selectFiltroClaseAlumnos"><option value="">-- Todas --</option>`;
                listaDeClasesGlobal.forEach(cl => htmlTablaAlumnos += `<option value="${cl.id}">${cl.nombre_clase}</option>`);
                htmlTablaAlumnos += `</select></div>`;
            } else if (filtroClaseIdActual && currentUser.rol === 'DIRECCION') {
                 htmlTablaAlumnos += `<button onclick="sessionStorage.removeItem('filtroAlumnosClaseId'); sessionStorage.removeItem('filtroAlumnosNombreClase'); loadAlumnos();" class="secondary" style="margin-bottom:15px;">Mostrar Todos</button>`;
            }
            if (currentUser.rol === 'DIRECCION' || (currentUser.rol === 'TUTOR' && currentUser.claseId)) {
                htmlTablaAlumnos += `<button id="btnShowFormNuevoAlumno" class="success" style="margin-bottom:15px;">+ Añadir Alumno</button>`;
            }
            htmlTablaAlumnos += `<table class="tabla-datos"><thead><tr><th>Nombre</th><th>Clase</th><th>Acciones</th></tr></thead><tbody>`;
            if (dataAlumnos.alumnos && dataAlumnos.alumnos.length > 0) {
                dataAlumnos.alumnos.forEach(a => { 
                    htmlTablaAlumnos += `<tr data-alumno-id="${a.id}"><td>${a.nombre_completo}</td><td>${a.nombre_clase}</td><td>
                        <button class="edit-alumno warning" data-id="${a.id}">Editar</button>
                        <button class="delete-alumno danger" data-id="${a.id}" data-nombre="${a.nombre_completo}">Eliminar</button>
                        </td></tr>`; 
                });
            } else { htmlTablaAlumnos += `<tr><td colspan="3" style="text-align:center;">No hay alumnos.</td></tr>`; }
            htmlTablaAlumnos += `</tbody></table><div id="formAlumnoWrapper" class="form-wrapper"></div>`;
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
                 if (sessionStorage.getItem('filtroAlumnosClaseId')) selectFiltro.value = sessionStorage.getItem('filtroAlumnosClaseId');
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
            alumnosContentDiv.innerHTML = importCsvHtml + `<p class="error-message">Error cargando alumnos: ${e.message}</p>`;
            poblarSelectorClaseDestinoCSV();
            const formImp = document.getElementById('formImportarAlumnosCSV');
            if(formImp) formImp.addEventListener('submit', handleImportAlumnosCSV);
        }
    }

    // --- Excursiones ---
    async function showFormExcursion(idExcursion = null, excursionData = {}) {
        const formExcursionWrapper = document.getElementById('formExcursionWrapper');
        if (!formExcursionWrapper) return;
        let opcionesClasesHtml = '<option value="">-- Global (para todas las clases) --</option>';
        if (currentUser.rol === 'DIRECCION') {
             if (listaDeClasesGlobal.length === 0) {
                try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) { console.error("Error cargando clases para formExcursion:", error); }
            }
            listaDeClasesGlobal.forEach(clase => {
                opcionesClasesHtml += `<option value="${clase.id}" ${excursionData.para_clase_id === clase.id ? 'selected' : ''}>${clase.nombre_clase}</option>`;
            });
        } else if (currentUser.rol === 'TUTOR') {
            if (currentUser.claseId && currentUser.claseNombre) {
                opcionesClasesHtml = `<option value="${currentUser.claseId}" selected>${currentUser.claseNombre} (Tu clase)</option>`;
            } else {
                opcionesClasesHtml = `<option value="" disabled selected>No tienes clase asignada</option>`;
            }
        }
        const formHtml = `
            <div class="form-container">
                <h3>${idExcursion ? 'Editar Excursión' : 'Crear Excursión'}</h3>
                <form id="formGestionExcursion">
                    <input type="hidden" id="excursionId" value="${idExcursion || ''}">
                    <div><label>Nombre:</label><input type="text" id="nombreExcursion" value="${excursionData.nombre_excursion || ''}" required></div>
                    <div><label>Actividad:</label><textarea id="actividadExcursion" required>${excursionData.actividad_descripcion || ''}</textarea></div>
                    <div><label>Lugar:</label><input type="text" id="lugarExcursion" value="${excursionData.lugar || ''}" required></div>
                    <div><label>Fecha:</label><input type="date" id="fechaExcursion" value="${excursionData.fecha_excursion || ''}" required></div>
                    <div><label>Hora Salida:</label><input type="time" id="horaSalidaExcursion" value="${excursionData.hora_salida || ''}" required></div>
                    <div><label>Hora Llegada:</label><input type="time" id="horaLlegadaExcursion" value="${excursionData.hora_llegada || ''}" required></div>
                    <div><label>Coste (€):</label><input type="number" id="costeExcursion" value="${excursionData.coste_excursion_alumno || 0}" min="0" step="0.01"></div>
                    <div><label>Vestimenta:</label><select id="vestimentaExcursion" required><option value="">-- Selecciona --</option><option value="Uniforme" ${excursionData.vestimenta === 'Uniforme' ? 'selected' : ''}>Uniforme</option><option value="Chándal" ${excursionData.vestimenta === 'Chándal' ? 'selected' : ''}>Chándal</option></select></div>
                    <div><label>Transporte:</label><select id="transporteExcursion" required><option value="">-- Selecciona --</option><option value="Autobús" ${excursionData.transporte === 'Autobús' ? 'selected' : ''}>Autobús</option><option value="Andando" ${excursionData.transporte === 'Andando' ? 'selected' : ''}>Andando</option></select></div>
                    <div><label>Justificación:</label><textarea id="justificacionExcursion" required>${excursionData.justificacion_texto || ''}</textarea></div>
                    <div><label>Notas:</label><textarea id="notasExcursion">${excursionData.notas_excursion || ''}</textarea></div>
                    ${currentUser.rol === 'DIRECCION' ? `<div><label>Para Clase:</label><select id="paraClaseIdExcursion">${opcionesClasesHtml}</select></div>` : ''}
                    ${currentUser.rol === 'TUTOR' && currentUser.claseId ? `<input type="hidden" id="paraClaseIdExcursion" value="${currentUser.claseId}"><p><em>Para tu clase: ${currentUser.claseNombre}.</em></p>` : ''}
                    ${currentUser.rol === 'TUTOR' && !currentUser.claseId ? `<p class="error-message">No tienes clase asignada.</p>` : ''}
                    <div class="form-buttons"><button type="submit" class="success" ${currentUser.rol === 'TUTOR' && !currentUser.claseId ? 'disabled' : ''}>${idExcursion ? 'Guardar' : 'Crear'}</button><button type="button" id="btnCancelarFormExcursion" class="secondary">Cancelar</button></div>
                    <p id="formExcursionError" class="error-message"></p>
                </form>
            </div>`;
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
            document.getElementById('formExcursionWrapper').innerHTML = '';
            loadExcursiones(); 
        } catch (error) {
            if(errorP) errorP.textContent = error.message || 'Error guardando.';
        } finally {
            if(submitButton) submitButton.disabled = false;
        }
    }

    async function handleDuplicateExcursion(excursionId, excursionName, originalParaClaseIdStr) {
        if (!currentUser) {
            alert("Error: Usuario no identificado.");
            return;
        }
    
        let target_clase_id_final = null;
        const originalParaClaseId = (originalParaClaseIdStr === 'null' || originalParaClaseIdStr === '' || originalParaClaseIdStr === undefined) ? null : parseInt(originalParaClaseIdStr);
    
        if (currentUser.rol === 'DIRECCION') {
            // Ensure listaDeClasesGlobal is populated
            if (listaDeClasesGlobal.length === 0) {
                try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) {
                    alert("Error cargando la lista de clases: " + error.message);
                    return;
                }
            }
    
            // Remove existing modal if any
            const existingModal = document.getElementById('duplicateExcursionModal');
            if (existingModal) existingModal.remove();
    
            // Create modal elements
            const modal = document.createElement('div');
            modal.id = 'duplicateExcursionModal';
            modal.className = 'simple-modal';
    
            const modalContent = document.createElement('div');
            modalContent.className = 'simple-modal-content';
    
            const title = document.createElement('h4');
            title.innerHTML = `Duplicar Excursión: <span id="modalDupExcursionName" style="font-weight:normal;">${excursionName}</span>`;
            
            const originalInfo = document.createElement('p');
            originalInfo.style.fontSize = '0.9em';
            originalInfo.style.color = '#555';
            originalInfo.textContent = `Originalmente para: ${originalParaClaseId === null ? 'GLOBAL' : `Clase ID ${originalParaClaseId}`}.`;
            
            const label = document.createElement('label');
            label.setAttribute('for', 'dupExcursionTargetClass');
            label.textContent = 'Seleccionar clase de destino para la copia:';
            label.style.display = 'block';
            label.style.marginBottom = '8px';
    
            const select = document.createElement('select');
            select.id = 'dupExcursionTargetClass';
            select.style.width = '100%';
            select.style.padding = '8px';
            select.style.marginBottom = '15px';
    
            const globalOption = document.createElement('option');
            globalOption.value = "null"; // Store as string "null" for easy parsing
            globalOption.textContent = '-- Global (ninguna clase específica) --';
            select.appendChild(globalOption);
    
            listaDeClasesGlobal.forEach(clase => {
                const option = document.createElement('option');
                option.value = clase.id;
                option.textContent = clase.nombre_clase;
                if (originalParaClaseId === clase.id) { // Pre-select if it was the original
                    option.selected = true;
                }
                select.appendChild(option);
            });
    
            const buttonsDiv = document.createElement('div');
            buttonsDiv.className = 'simple-modal-buttons';
    
            const acceptButton = document.createElement('button');
            acceptButton.id = 'dupExcursionAccept';
            acceptButton.textContent = 'Aceptar';
            acceptButton.className = 'success';
    
            const cancelButton = document.createElement('button');
            cancelButton.id = 'dupExcursionCancel';
            cancelButton.textContent = 'Cancelar';
            cancelButton.className = 'secondary';
    
            buttonsDiv.appendChild(acceptButton);
            buttonsDiv.appendChild(cancelButton);
    
            modalContent.appendChild(title);
            modalContent.appendChild(originalInfo);
            modalContent.appendChild(label);
            modalContent.appendChild(select);
            modalContent.appendChild(buttonsDiv);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
    
            modal.style.display = 'flex'; // Show modal
    
            // Event listeners for modal buttons
            cancelButton.onclick = () => {
                modal.remove();
                alert("Duplicación cancelada.");
            };
    
            acceptButton.onclick = async () => {
                const selectedValue = select.value;
                target_clase_id_final = (selectedValue === "null" || selectedValue === "") ? null : parseInt(selectedValue);
                
                modal.remove(); // Close modal before API call or after
    
                try {
                    const duplicatedExcursion = await apiFetch(`/excursiones/${excursionId}/duplicate`, 'POST', { target_clase_id: target_clase_id_final });
                    alert(`Excursión '${excursionName}' duplicada con éxito. Nueva excursión: '${duplicatedExcursion.nombre_excursion}'.`);
                    loadExcursiones();
                } catch (error) {
                    alert(`Error al duplicar la excursión: ${error.message}`);
                }
            };
    
        } else if (currentUser.rol === 'TUTOR') {
            if (!currentUser.claseId) {
                alert("No tienes una clase asignada. No puedes duplicar esta excursión para una clase específica sin tener una clase asignada.");
                return;
            }
            const confirmMessage = `Vas a duplicar la excursión: '${excursionName}'.\nOriginalmente era para: ${originalParaClaseId === null ? 'GLOBAL' : `Clase ID ${originalParaClaseId}`}.\n\nLa copia será asignada a TU CLASE: ${currentUser.claseNombre} (ID: ${currentUser.claseId}).\n\n¿Continuar?`;
            if (!confirm(confirmMessage)) {
                alert("Duplicación cancelada.");
                return;
            }
            target_clase_id_final = currentUser.claseId;
            // Proceed with API call for Tutor
            try {
                const duplicatedExcursion = await apiFetch(`/excursiones/${excursionId}/duplicate`, 'POST', { target_clase_id: target_clase_id_final });
                alert(`Excursión '${excursionName}' duplicada con éxito. Nueva excursión: '${duplicatedExcursion.nombre_excursion}'.`);
                loadExcursiones();
            } catch (error) {
                alert(`Error al duplicar la excursión: ${error.message}`);
            }

        } else {
            alert("No tienes permisos para duplicar excursiones.");
            return;
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
                html += `<button id="btnShowFormNuevaExcursion" class="success" style="margin-bottom:15px;">+ Crear Excursión</button>`;
            }
            html += `<table class="tabla-datos"><thead><tr><th>Nombre</th><th>Fecha</th><th>Lugar</th><th>Clase Destino</th><th>Creador</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.excursiones && data.excursiones.length > 0) {
                data.excursiones.forEach(ex => {
                    let accionesHtml = `<button class="view-participaciones secondary" data-excursionid="${ex.id}" data-excursionnombre="${ex.nombre_excursion}">Participaciones</button>`;
                    
                    if (currentUser.rol === 'DIRECCION' || (currentUser.rol === 'TUTOR' && ex.creada_por_usuario_id === currentUser.id) || (currentUser.rol === 'TUTOR' && ex.para_clase_id === currentUser.claseId) ) {
                        accionesHtml += ` <button class="edit-excursion warning" data-id="${ex.id}">Editar</button>`;
                        accionesHtml += ` <button class="delete-excursion danger" data-id="${ex.id}" data-nombre="${ex.nombre_excursion}">Eliminar</button>`;
                    }
                     if (currentUser.rol === 'DIRECCION' || currentUser.rol === 'TUTOR') {
                        accionesHtml += ` <button class="duplicate-excursion info" data-id="${ex.id}" data-nombre="${ex.nombre_excursion}" data-original-clase-id="${ex.para_clase_id === null ? 'null' : ex.para_clase_id}">Duplicar</button>`;
                    }

                    html += `<tr data-excursion-id="${ex.id}"><td>${ex.nombre_excursion}</td><td>${ex.fecha_excursion}</td><td>${ex.lugar}</td><td>${ex.nombre_clase_destino || '<em>Global</em>'}</td><td>${ex.nombre_creador}</td><td class="actions-cell">${accionesHtml}</td></tr>`;
                });
            } else { html += '<tr><td colspan="6" style="text-align:center;">No hay excursiones.</td></tr>'; }
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
                } catch (error) { showGlobalError("Error cargando excursión: " + error.message, formExcursionWrapper); }
            });
            excursionesContentDiv.querySelectorAll('.delete-excursion').forEach(b => b.onclick=(e)=>deleteExcursion(e.target.dataset.id, e.target.dataset.nombre));
            excursionesContentDiv.querySelectorAll('.view-participaciones').forEach(b => b.onclick=(e)=>{ 
                sessionStorage.setItem('filtroParticipacionesExcursionId',e.target.dataset.excursionid); 
                sessionStorage.setItem('filtroParticipacionesNombreExcursion',e.target.dataset.excursionnombre); 
                navigateTo('participaciones'); 
            });
            excursionesContentDiv.querySelectorAll('.duplicate-excursion').forEach(button => {
                button.addEventListener('click', (e) => {
                    const id = e.target.dataset.id;
                    const nombre = e.target.dataset.nombre;
                    const originalClaseId = e.target.dataset.originalClaseId;
                    handleDuplicateExcursion(id, nombre, originalClaseId);
                });
            });

        } catch (error) {
            showGlobalError(`Error cargando excursiones: ${error.message}`, excursionesContentDiv);
             excursionesContentDiv.insertBefore(formExcursionWrapper, excursionesContentDiv.firstChild);
             if(document.getElementById('btnShowFormNuevaExcursion')) document.getElementById('btnShowFormNuevaExcursion').onclick = () => showFormExcursion();
        }
    }
    async function deleteExcursion(idExcursion, nombreExcursion){
        if(!confirm(`¿Seguro que quieres eliminar "${nombreExcursion}"?`)) return;
        try {
            await apiFetch(`/excursiones/${idExcursion}`, 'DELETE');
            loadExcursiones();
        } catch(error){ showGlobalError(error.message, document.getElementById('formExcursionWrapper')); }
    }
    
    // --- Participaciones (Código existente) ---
    async function loadParticipaciones(excursionIdFiltroExterno = null, nombreExcursionFiltroExterno = null) {
        if (!participacionesContentDiv) return;
        participacionesContentDiv.innerHTML = "<p>Cargando participaciones...</p>";
        const excursionIdActual = excursionIdFiltroExterno || sessionStorage.getItem('filtroParticipacionesExcursionId');
        const nombreExcursionActual = nombreExcursionFiltroExterno || sessionStorage.getItem('filtroParticipacionesNombreExcursion');
        let selectExcursionesHtml = '<option value="">-- Selecciona excursión --</option>';
        try {
            const dataExcursiones = await apiFetch('/excursiones');
            (dataExcursiones.excursiones || []).forEach(ex => {
                selectExcursionesHtml += `<option value="${ex.id}" ${excursionIdActual == ex.id ? 'selected' : ''}>${ex.nombre_excursion} (${ex.fecha_excursion})</option>`;
            });
        } catch (error) { selectExcursionesHtml = '<option value="">Error cargando</option>'; }
        let filtroClaseHtml = '';
        if (currentUser.rol === 'DIRECCION') {
            filtroClaseHtml = `<label for="selectFiltroClaseParticipaciones">Filtrar Clase:</label><select id="selectFiltroClaseParticipaciones"><option value="">-- Todas --</option>`;
            if (listaDeClasesGlobal.length === 0) {
                 try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) { console.error("Error cargando clases", error); }
            }
            listaDeClasesGlobal.forEach(clase => filtroClaseHtml += `<option value="${clase.id}">${clase.nombre_clase}</option>`);
            filtroClaseHtml += `</select>`;
        }
        let html = `<h3>Participación en Excursiones</h3><div class="filtros-participaciones"><label>Excursión:</label><select id="selectExcursionParticipaciones">${selectExcursionesHtml}</select>${filtroClaseHtml}</div><div id="resumenParticipacionesContainer"></div><div id="tablaParticipacionesContainer"></div>`;
        participacionesContentDiv.innerHTML = html;
        const selectExcursion = document.getElementById('selectExcursionParticipaciones');
        if (selectExcursion) {
            selectExcursion.onchange = (e) => {
                const selectedExId = e.target.value;
                const selectedExNombre = e.target.options[e.target.selectedIndex].text;
                sessionStorage.setItem('filtroParticipacionesExcursionId', selectedExId);
                sessionStorage.setItem('filtroParticipacionesNombreExcursion', selectedExNombre);
                if (selectedExId) renderTablaParticipaciones(selectedExId, selectedExNombre);
                else {
                    document.getElementById('tablaParticipacionesContainer').innerHTML = '<p>Selecciona excursión.</p>';
                    document.getElementById('resumenParticipacionesContainer').innerHTML = '';
                }
            };
        }
        if (document.getElementById('selectFiltroClaseParticipaciones')) {
            document.getElementById('selectFiltroClaseParticipaciones').onchange = () => {
                if (excursionIdActual) renderTablaParticipaciones(excursionIdActual, nombreExcursionActual);
            };
        }
        if (excursionIdActual) renderTablaParticipaciones(excursionIdActual, nombreExcursionActual);
        else {
            document.getElementById('tablaParticipacionesContainer').innerHTML = '<p>Selecciona excursión.</p>';
            document.getElementById('resumenParticipacionesContainer').innerHTML = '';
        }
    }
    async function renderTablaParticipaciones(excursionId, excursionNombre) {
        const container = document.getElementById('tablaParticipacionesContainer');
        const resumenContainer = document.getElementById('resumenParticipacionesContainer');
        if (!container || !resumenContainer) return;
        container.innerHTML = `<p>Cargando para "${excursionNombre}"...</p>`;
        resumenContainer.innerHTML = ''; 
        let endpoint = `/excursiones/${excursionId}/participaciones`;
        const filtroClaseSelect = document.getElementById('selectFiltroClaseParticipaciones');
        if (currentUser.rol === 'DIRECCION' && filtroClaseSelect && filtroClaseSelect.value) {
            endpoint += `?view_clase_id=${filtroClaseSelect.value}`;
        }
        try {
            const data = await apiFetch(endpoint);
            if (!data || !data.alumnosParticipaciones) {
                container.innerHTML = `<p class="error-message">No se pudieron cargar datos.</p>`;
                return;
            }
            const r = data.resumen;
            let resumenHtml = `<h4>Resumen: "${excursionNombre}"</h4><div class="resumen-grid">
                <div>Total: ${r.totalAlumnos}</div><div>Autorización: Sí ${r.totalConAutorizacionFirmadaSi} | No ${r.totalConAutorizacionFirmadaNo}</div>
                <div>Pago: Pagado ${r.totalAlumnosPagadoGlobal} | Parcial ${r.totalConPagoRealizadoParcial} | No ${r.totalConPagoRealizadoNo}</div>
                <div>Recaudado: ${r.sumaTotalCantidadPagadaGlobal.toFixed(2)} €</div></div>`;
            if (r.resumenPorClase && r.resumenPorClase.length > 0) {
                resumenHtml += `<h5>Detalle Clase:</h5><table class="tabla-datos tabla-resumen-clase"><thead><tr><th>Clase</th><th>Alumnos</th><th>Pagado</th><th>Recaudado (€)</th></tr></thead><tbody>`;
                r.resumenPorClase.forEach(rc => resumenHtml += `<tr><td>${rc.nombre_clase}</td><td>${rc.alumnosEnClase}</td><td>${rc.totalAlumnosPagadoEnClase}</td><td>${rc.sumaTotalCantidadPagadaEnClase.toFixed(2)}</td></tr>`);
                resumenHtml += `</tbody></table>`;
            }
            resumenContainer.innerHTML = resumenHtml;
            let html = `<h4>Participantes: ${excursionNombre}</h4><table class="tabla-datos tabla-participaciones"><thead><tr><th>Alumno</th><th>Clase</th><th>Autorización</th><th>Fecha Aut.</th><th>Pago</th><th>Cantidad (€)</th><th>Fecha Pago</th><th>Notas</th><th class="status-column">Estado</th></tr></thead><tbody>`;
            if (data.alumnosParticipaciones.length > 0) {
                data.alumnosParticipaciones.forEach(ap => {
                    const esCampoDeshabilitado = ap.autorizacion_firmada === 'Sí' && ap.fecha_autorizacion;
                    html += `<tr data-participacion-id="${ap.participacion_id || ''}" data-alumno-id="${ap.alumno_id}">
                        <td>${ap.nombre_completo}</td><td>${ap.nombre_clase}</td>
                        <td><select class="participacion-field-edit" data-field="autorizacion_firmada" ${esCampoDeshabilitado?'disabled':''}><option value="No" ${ap.autorizacion_firmada==='No'?'selected':''}>No</option><option value="Sí" ${ap.autorizacion_firmada==='Sí'?'selected':''}>Sí</option></select></td>
                        <td><input type="date" class="participacion-field-edit" data-field="fecha_autorizacion" value="${ap.fecha_autorizacion||''}" ${esCampoDeshabilitado?'disabled':''}></td>
                        <td><select class="participacion-field-edit" data-field="pago_realizado"><option value="No" ${ap.pago_realizado==='No'?'selected':''}>No</option><option value="Parcial" ${ap.pago_realizado==='Parcial'?'selected':''}>Parcial</option><option value="Sí" ${ap.pago_realizado==='Sí'?'selected':''}>Sí</option></select></td>
                        <td><input type="number" step="0.01" class="participacion-field-edit" data-field="cantidad_pagada" value="${ap.cantidad_pagada||0}" min="0" style="width:70px;"></td>
                        <td><input type="date" class="participacion-field-edit" data-field="fecha_pago" value="${ap.fecha_pago||''}"></td>
                        <td><textarea class="participacion-field-edit" data-field="notas_participacion" rows="1">${ap.notas_participacion||''}</textarea></td>
                        <td class="status-message-cell"></td></tr>`;});
            } else { html += `<tr><td colspan="9" style="text-align:center;">No hay alumnos.</td></tr>`; }
            html += `</tbody></table>`;
            container.innerHTML = html;
            container.querySelectorAll('.participacion-field-edit').forEach(input => {
                const eventType = (input.tagName === 'SELECT' || input.type === 'date') ? 'change' : 'blur';
                input.addEventListener(eventType, (e) => saveParticipacionOnFieldChange(e.target, excursionId));
            });
        } catch (error) {
            container.innerHTML = `<p class="error-message">Error cargando: ${error.message}</p>`;
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
            showTemporaryStatusInCell(statusCell, "Fecha autorización requerida.", true); return;
        }
        if ((participacionData.pago_realizado === 'Sí' || participacionData.pago_realizado === 'Parcial') && !participacionData.fecha_pago) {
             showTemporaryStatusInCell(statusCell, "Fecha de pago requerida.", true); return;
        }
         if (participacionData.pago_realizado === 'Parcial' && participacionData.cantidad_pagada <= 0) {
            showTemporaryStatusInCell(statusCell, "Pago parcial > 0€.", true); return;
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
            if (currentExcursionId && currentExcursionNombre) updateParticipacionesSummary(currentExcursionId, currentExcursionNombre);
        } catch (error) {
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
                let resumenHtml = `<h4>Resumen: "${excursionNombre}"</h4><div class="resumen-grid">
                    <div>Total: ${r.totalAlumnos}</div><div>Autorización: Sí ${r.totalConAutorizacionFirmadaSi} | No ${r.totalConAutorizacionFirmadaNo}</div>
                    <div>Pago: Pagado ${r.totalAlumnosPagadoGlobal} | Parcial ${r.totalConPagoRealizadoParcial} | No ${r.totalConPagoRealizadoNo}</div>
                    <div>Recaudado: ${r.sumaTotalCantidadPagadaGlobal.toFixed(2)} €</div></div>`;
                if (r.resumenPorClase && r.resumenPorClase.length > 0) {
                    resumenHtml += `<h5>Detalle Clase:</h5><table class="tabla-datos tabla-resumen-clase"><thead><tr><th>Clase</th><th>Alumnos</th><th>Pagado</th><th>Recaudado (€)</th></tr></thead><tbody>`; 
                    r.resumenPorClase.forEach(rc => resumenHtml += `<tr><td>${rc.nombre_clase}</td><td>${rc.alumnosEnClase}</td><td>${rc.totalAlumnosPagadoEnClase}</td><td>${rc.sumaTotalCantidadPagadaEnClase.toFixed(2)}</td></tr>`);
                    resumenHtml += `</tbody></table>`;
                }
                resumenContainer.innerHTML = resumenHtml;
            }
        } catch (error) {
            if (resumenContainer) resumenContainer.innerHTML = `<p class="error-message">Error actualizando resumen: ${error.message}</p>`;
        }
    }
    function showTemporaryStatusInCell(cellElement, message, isError, duration = 3000) {
        if (!cellElement) return;
        cellElement.textContent = message;
        cellElement.style.color = isError ? 'red' : 'green';
        cellElement.style.fontSize = '0.8em';
        setTimeout(() => { cellElement.textContent = ''; }, duration);
    }
    
    // --- Admin Usuarios (Código existente) ---
    async function loadAdminUsuarios() {
        if (!adminUsuariosContentDiv || !currentUser || currentUser.rol !== 'DIRECCION') {
            if (adminUsuariosContentDiv) adminUsuariosContentDiv.innerHTML = "<p class='error-message'>Acceso denegado.</p>";
            return;
        }
        adminUsuariosContentDiv.innerHTML = "<p>Cargando usuarios...</p>";
        if (formAdminUsuarioWrapper) formAdminUsuarioWrapper.innerHTML = ''; 
        try {
            const data = await apiFetch('/usuarios');
            let html = '<h3>Listado de Usuarios</h3>';
            html += `<button id="btnShowFormNuevoUsuarioTutor" class="success" style="margin-bottom:15px;">+ Crear Usuario Tutor</button>`;
            html += `<table class="tabla-datos"><thead><tr><th>ID</th><th>Email</th><th>Nombre</th><th>Rol</th><th>Clase (Tutor)</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.usuarios && data.usuarios.length > 0) {
                data.usuarios.forEach(usuario => {
                    html += `<tr data-user-id="${usuario.id}"><td>${usuario.id}</td><td>${usuario.email}</td><td>${usuario.nombre_completo}</td><td>${usuario.rol}</td><td>${usuario.rol === 'TUTOR' ? (usuario.clase_asignada_nombre || '<em>No asignada</em>') : 'N/A'}</td><td class="actions-cell">
                        ${usuario.rol !== 'DIRECCION' ? `<button class="edit-usuario warning" data-id="${usuario.id}">Editar</button><button class="delete-usuario danger" data-id="${usuario.id}" data-nombre="${usuario.nombre_completo}">Eliminar</button>` : '<em>(No editable)</em>'}
                        </td></tr>`;});
            } else { html += '<tr><td colspan="6" style="text-align:center;">No hay usuarios.</td></tr>'; }
            html += '</tbody></table>';
            adminUsuariosContentDiv.innerHTML = html; 
            const btnShowForm = document.getElementById('btnShowFormNuevoUsuarioTutor');
            if (btnShowForm) btnShowForm.addEventListener('click', () => showFormAdminUsuario(null, null));
            adminUsuariosContentDiv.querySelectorAll('.edit-usuario').forEach(b => {
                b.onclick = async (e) => {
                    const userId = e.target.dataset.id;
                    const userToEdit = (data.usuarios || []).find(u => u.id == userId);
                    showFormAdminUsuario(userId, userToEdit);
                };
            });
            adminUsuariosContentDiv.querySelectorAll('.delete-usuario').forEach(b => b.onclick = (e) => deleteAdminUsuario(e.target.dataset.id, e.target.dataset.nombre));
        } catch (error) { showGlobalError(`Error cargando usuarios: ${error.message}`, adminUsuariosContentDiv); }
    }
    function showFormAdminUsuario(userId = null, initialUserData = null) {
        if (!formAdminUsuarioWrapper) return;
        const isEditMode = userId && initialUserData;
        const formTitle = isEditMode ? "Editar Usuario Tutor" : "Crear Nuevo Usuario Tutor";
        const submitButtonText = isEditMode ? "Guardar Cambios" : "Crear Usuario";
        let formHtml = `<div class="form-container"><h4>${formTitle}</h4><form id="formGestionUsuarioTutor">
            ${isEditMode ? `<input type="hidden" id="editUserId" value="${userId}">` : ''}
            <div><label>Email:</label><input type="email" id="adminUserEmail" value="${isEditMode ? initialUserData.email : ''}" required></div>
            <div><label>Nombre Completo:</label><input type="text" id="adminUserNombreCompleto" value="${isEditMode ? initialUserData.nombre_completo : ''}" required></div>`;
        if (!isEditMode) {
            formHtml += `<div><label>Contraseña:</label><input type="password" id="adminUserPassword" required minlength="8"></div>
                         <input type="hidden" id="adminUserRol" value="TUTOR">`;
        }
        formHtml += `<div class="form-buttons"><button type="submit" class="success">${submitButtonText}</button><button type="button" id="btnCancelarGestionUsuario" class="secondary">Cancelar</button></div>
                     <p id="formAdminUsuarioError" class="error-message"></p></form></div>`;
        formAdminUsuarioWrapper.innerHTML = formHtml;
        formAdminUsuarioWrapper.style.display = 'block';
        document.getElementById('formGestionUsuarioTutor').addEventListener('submit', saveAdminUsuario);
        document.getElementById('btnCancelarGestionUsuario').onclick = () => { formAdminUsuarioWrapper.innerHTML = ''; formAdminUsuarioWrapper.style.display = 'none'; };
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
        } else {
            const password = document.getElementById('adminUserPassword').value;
            const rol = document.getElementById('adminUserRol').value;
            if (!password || password.length < 8) {
                if (errorP) errorP.textContent = "Contraseña requerida (mínimo 8 caracteres)."; return;
            }
            userData.password = password; userData.rol = rol;
        }
        if (!email || !nombre_completo) {
            if (errorP) errorP.textContent = "Email y Nombre son requeridos."; return;
        }
        const submitButton = event.target.querySelector('button[type="submit"]');
        try {
            if (submitButton) submitButton.disabled = true;
            await apiFetch(endpoint, method, userData);
            if (formAdminUsuarioWrapper) {
                 formAdminUsuarioWrapper.innerHTML = `<p class="success-message">Usuario ${isEditMode ? 'actualizado' : 'creado'}.</p>`;
                 setTimeout(() => { formAdminUsuarioWrapper.innerHTML = ''; formAdminUsuarioWrapper.style.display = 'none'; }, 3000);
            }
            loadAdminUsuarios(); 
        } catch (error) {
            if (errorP) errorP.textContent = error.message || `Error al ${isEditMode ? 'actualizar' : 'crear'} usuario.`;
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }
    async function deleteAdminUsuario(userId, userName) {
        if (!confirm(`¿Seguro que quieres eliminar a "${userName}" (ID: ${userId})?`)) return;
        try {
            await apiFetch(`/usuarios/${userId}`, 'DELETE');
            loadAdminUsuarios();
        } catch (error) {
            showGlobalError(`Error eliminando usuario: ${error.message || 'Error desconocido.'}`);
        }
    }

    // --- Modal Functions ---
    function openExcursionModal(excursionData) {
        if (!excursionDetailModal) {
            console.error("Excursion detail modal element not found.");
            return;
        }
        if(modalExcursionTitle) modalExcursionTitle.textContent = excursionData.nombre_excursion || 'Detalles de la Excursión';
        if(modalExcursionDate) modalExcursionDate.textContent = excursionData.fecha_excursion ? excursionData.fecha_excursion.split('T')[0] : 'N/A';
        if(modalExcursionPlace) modalExcursionPlace.textContent = excursionData.lugar || 'N/A';
        if(modalExcursionDescription) modalExcursionDescription.textContent = excursionData.actividad_descripcion || 'N/A';
        if(modalExcursionHoraSalida) modalExcursionHoraSalida.textContent = excursionData.hora_salida || 'N/A';
        if(modalExcursionHoraLlegada) modalExcursionHoraLlegada.textContent = excursionData.hora_llegada || 'N/A';
        if(modalExcursionCoste) modalExcursionCoste.textContent = excursionData.coste_excursion_alumno !== null ? `${excursionData.coste_excursion_alumno} €` : 'N/A';
        if(modalExcursionVestimenta) modalExcursionVestimenta.textContent = excursionData.vestimenta || 'N/A';
        if(modalExcursionTransporte) modalExcursionTransporte.textContent = excursionData.transporte || 'N/A';
        if(modalExcursionJustificacion) modalExcursionJustificacion.textContent = excursionData.justificacion_texto || 'N/A';
        if(modalExcursionNotas) modalExcursionNotas.textContent = excursionData.notas_excursion || 'N/A';
        
        excursionDetailModal.style.display = 'block'; // Use 'block' or 'flex' based on CSS
    }

    function closeExcursionModal() {
        if (excursionDetailModal) {
            excursionDetailModal.style.display = 'none';
        }
    }

    if (modalCloseButton) {
        modalCloseButton.addEventListener('click', closeExcursionModal);
    }
    
    window.addEventListener('click', (event) => {
        if (excursionDetailModal && event.target === excursionDetailModal) {
            closeExcursionModal();
        }
    });

    async function handleExcursionDayClick(excursionId) {
        console.log("handleExcursionDayClick called with ID:", excursionId);
        if (!excursionId) {
            console.warn("No excursionId provided to handleExcursionDayClick.");
            return;
        }
        // TODO: Consider adding a loading indicator here
        try {
            // The endpoint was already /api/excursiones/:id in previous setup for editing, so it should be correct.
            const excursionDetails = await apiFetch(`/excursiones/${excursionId}`); 
            if (excursionDetails) { // apiFetch returns the excursion object directly if successful
                openExcursionModal(excursionDetails);
            } else {
                console.warn(`No details found for excursion ID: ${excursionId}. The API might have returned null or an empty object if not found.`);
                // If apiFetch throws for 404s, this 'else' might not be hit.
                // If it returns null/undefined for 404s, this is appropriate.
                alert("No se pudieron encontrar los detalles de la excursión. Puede que no exista.");
            }
        } catch (error) {
            console.error(`Error fetching details for excursion ID ${excursionId}:`, error);
            alert(`Error al cargar detalles de la excursión: ${error.message}`);
        }
        // TODO: Consider hiding loading indicator here
    }
    window.handleExcursionDayClick = handleExcursionDayClick; // Expose to global scope

    // --- INICIALIZACIÓN DE LA APP ---
    checkInitialLoginState();
}); // Fin de DOMContentLoaded
