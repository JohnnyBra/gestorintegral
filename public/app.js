// --- public/app.js (Revisado y Mejorado a partir de tu versión) ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Estado Global del Frontend ---
    let currentCalendarYear = new Date().getFullYear();
    let currentCalendarMonth = new Date().getMonth(); // 0-indexed (0 for January, 11 for December)
    let currentUser = null;
    let currentToken = null;
    // let selectedCoordClaseId = null;  // Eliminado
    // let selectedCoordClaseNombre = null; // Eliminado


    // --- URLs y Selectores del DOM ---
    const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:3000/api`;

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
    const sharedExcursionsContentDiv = document.getElementById('shared-excursions-content');


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
    const modalExcursionParticipants = document.getElementById('modal-excursion-participants'); // Added for new field
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
        
        const sharedExcursionsLinkLi = mainNavSidebar.querySelector('a[data-section="shared-excursions"]').parentElement;
        if (sharedExcursionsLinkLi) sharedExcursionsLinkLi.style.display = (currentUser && currentUser.rol === 'TUTOR') ? 'list-item' : 'none';

        const tesoreriaLinkLi = mainNavSidebar.querySelector('a[data-section="tesoreria"]');
        if (tesoreriaLinkLi) { 
            const canViewTesoreria = currentUser.rol === 'TESORERIA' || currentUser.rol === 'DIRECCION';
            tesoreriaLinkLi.parentElement.style.display = canViewTesoreria ? 'list-item' : 'none';
        }
        
        const coordinacionLinkLi = mainNavSidebar.querySelector('a[data-section="coordinacion"]');
        if (coordinacionLinkLi) { 
            coordinacionLinkLi.parentElement.style.display = 'none'; 
        }
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
            if (sectionName !== 'coordinacion') {
                console.warn(`Div de sección '${sectionName}-section' no encontrado.`);
            }
        }
    }
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            if (currentToken || section === 'login') {
                navigateTo(section);
            } else {
                navigateTo('login');
            }

            // --- Auto-collapse sidebar on mobile when a nav link is clicked ---
            // Ensure sidebarToggle and sidebar are defined (they are at the top of DOMContentLoaded)
            if (sidebarToggle && sidebar) {
                const isMobileView = getComputedStyle(sidebarToggle).display !== 'none';
                if (isMobileView && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    document.body.classList.remove('body-sidebar-open');
                }
            }
            // --- End auto-collapse logic ---
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
            case 'shared-excursions':
                if (currentUser && currentUser.rol === 'TUTOR') loadPendingShares();
                break;
            case 'admin-usuarios': if (currentUser && currentUser.rol === 'DIRECCION') loadAdminUsuarios(); break;
            case 'tesoreria': 
                if (currentUser && (currentUser.rol === 'TESORERIA' || currentUser.rol === 'DIRECCION')) loadTesoreriaData();
                break;
        }
    }

    // --- Dashboard ---
    async function loadDashboardData() {
        if (!dashboardSummaryContentDiv) {
             console.error("Elemento dashboardSummaryContentDiv no encontrado.");
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
            if (dashboardSummaryContentDiv) { 
                if (!data) {
                    dashboardSummaryContentDiv.innerHTML = `<p class="error-message">No se pudo obtener el resumen.</p>`;
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
                        data.proximasExcursiones.forEach(ex => html += `<li><a href="#" class="excursion-detail-link" data-excursion-id="${ex.id}">${ex.nombre_excursion}</a> (${ex.fecha_excursion || 'N/D'}) - ${ex.participating_scope_name || 'Scope N/A'}</li>`);
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
                        data.proximasExcursiones.forEach(ex => html += `<li><a href="#" class="excursion-detail-link" data-excursion-id="${ex.id}">${ex.nombre_excursion}</a> (${ex.fecha_excursion || 'N/D'}) - ${ex.participating_scope_name || 'Scope N/A'}</li>`);
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
                if (currentUser && currentUser.rol === 'TESORERIA') {
                    html += '<h4>Resumen de Tesorería</h4>';
                    html += '<ul>';
                    html += `<li>Total Excursiones Registradas: ${data.totalExcursiones ?? 'N/D'}</li>`;
                    html += `<li>Total Alumnos con Algún Pago Registrado: ${data.totalAlumnosConPago ?? 'N/D'}</li>`;
                    html += `<li>Suma Total Recaudada (Global): ${data.sumaTotalPagado !== undefined ? data.sumaTotalPagado.toFixed(2) : '0.00'} €</li>`;
                    html += '</ul>';
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
    async function showFormAlumno(idAlumno = null, alumnoData = null, defaultClaseId = null) {
        let currentFormWrapper = document.getElementById('formAlumnoWrapper'); 
        if (!currentFormWrapper) {
            console.error("Form wrapper for alumnos not found.");
            return;
        }

        const nombreExistente = alumnoData ? alumnoData.nombre_completo : '';
        let claseIdExistente = alumnoData ? alumnoData.clase_id : defaultClaseId;
        
        const apellidosExistente = alumnoData && alumnoData.nombre_completo ? alumnoData.nombre_completo.split(' ').slice(1).join(' ') : '';
        const soloNombreExistente = alumnoData && alumnoData.nombre_completo ? alumnoData.nombre_completo.split(' ')[0] : '';
    
        let opcionesClasesHtml = '';
        let selectDisabled = false;

        if (currentUser.rol === 'TUTOR') {
            if (currentUser.claseId && currentUser.claseNombre) {
                opcionesClasesHtml = `<option value="${currentUser.claseId}" selected>${currentUser.claseNombre} (Tu clase)</option>`;
                selectDisabled = true; 
                claseIdExistente = currentUser.claseId; 
            } else {
                opcionesClasesHtml = `<option value="" disabled selected>No tienes clase asignada</option>`;
                selectDisabled = true;
            }
        } else if (currentUser.rol === 'DIRECCION') {
            if (listaDeClasesGlobal.length === 0) {
                try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) { 
                    opcionesClasesHtml = `<option value="">Error cargando clases</option>`; 
                }
            }
            opcionesClasesHtml = '<option value="">-- Selecciona una clase --</option>';
            listaDeClasesGlobal.forEach(clase => {
                opcionesClasesHtml += `<option value="${clase.id}" ${clase.id == claseIdExistente ? 'selected' : ''}>${clase.nombre_clase}</option>`;
            });
        } 
    
        const formHtml = `
            <div class="form-container" style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin-top: 15px; border: 1px solid #e0e0e0;">
                <h3>${idAlumno ? 'Editar Alumno' : 'Añadir Nuevo Alumno'}</h3>
                <form id="formGestionAlumno">
                    <input type="hidden" id="alumnoId" name="alumnoId" value="${idAlumno || ''}">
                    <div><label for="nombreAlumno">Nombre:</label><input type="text" id="nombreAlumno" value="${soloNombreExistente}" required></div>
                    <div><label for="apellidosAlumno">Apellidos:</label><input type="text" id="apellidosAlumno" value="${apellidosExistente}" required></div>
                    <div><label for="claseAlumno">Clase:</label><select id="claseAlumno" ${selectDisabled ? 'disabled' : ''} required>${opcionesClasesHtml}</select></div>
                    <div class="form-buttons"><button type="submit" class="success" ${selectDisabled && !claseIdExistente ? 'disabled' : ''}>${idAlumno ? 'Guardar Cambios' : 'Crear Alumno'}</button><button type="button" id="btnCancelarFormAlumno" class="secondary">Cancelar</button></div>
                    <p id="formAlumnoError" class="error-message"></p>
                </form>
            </div>`;
        currentFormWrapper.innerHTML = formHtml;
        currentFormWrapper.style.display = 'block'; 
        
        const formElement = currentFormWrapper.querySelector('#formGestionAlumno'); 
        if (formElement) {
            formElement.addEventListener('submit', (e) => saveAlumno(e, null));
        }
        const btnCancelar = currentFormWrapper.querySelector('#btnCancelarFormAlumno');
        if (btnCancelar) {
            btnCancelar.onclick = () => { currentFormWrapper.innerHTML = ''; currentFormWrapper.style.display = 'none'; };
        }
    }
    async function saveAlumno(event, specificClaseIdForReload = null) { 
        event.preventDefault();
        const formElement = event.target;
        const formWrapper = formElement.closest('.form-container').parentElement; 
        const formAlumnoError = formWrapper.querySelector('#formAlumnoError');

        if (formAlumnoError) formAlumnoError.textContent = '';
        const alumnoId = formWrapper.querySelector('#alumnoId').value;
        const nombre = formWrapper.querySelector('#nombreAlumno').value.trim();
        const apellidos = formWrapper.querySelector('#apellidosAlumno').value.trim();
        const clase_id_element = formWrapper.querySelector('#claseAlumno');
        const clase_id = clase_id_element ? clase_id_element.value : null;


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
            formWrapper.innerHTML = '';
            formWrapper.style.display = 'none';
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
                selectClase.innerHTML = '<option value="" disabled>No tiene permisos para seleccionar clase</option>';
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
        } else { 
            alumnosContentDiv.innerHTML = importCsvHtml + "<p>No tiene permisos para ver alumnos o no hay filtro aplicable.</p>";
             poblarSelectorClaseDestinoCSV(); 
             const formImp = document.getElementById('formImportarAlumnosCSV');
             if (formImp) formImp.addEventListener('submit', handleImportAlumnosCSV);
             return;
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
    async function showFormExcursion(idExcursion = null, excursionData = {}, defaultParaClaseId = null) {
        let currentFormWrapper = document.getElementById('formExcursionWrapper'); 
         if (!currentFormWrapper) { 
             console.error("Form wrapper for excursions not found."); return; 
        }

        let paraClaseIdActual = excursionData.para_clase_id !== undefined ? excursionData.para_clase_id : defaultParaClaseId;
        // If editing an existing "Global" excursion, paraClaseIdActual will be null.
        // For tutors, this should map to "Mi Ciclo" (value "ciclo") by default if creating new.
        if (!idExcursion && currentUser.rol === 'TUTOR' && paraClaseIdActual === null) {
            paraClaseIdActual = "ciclo"; 
        } else if (idExcursion && excursionData.para_clase_id === null && currentUser.rol === 'TUTOR') {
            paraClaseIdActual = "ciclo"; // Map existing global to "Mi Ciclo" for tutors
        }


        let opcionesClasesHtml = '';
        let selectDisabled = false;

        if (currentUser.rol === 'DIRECCION') {
             if (listaDeClasesGlobal.length === 0) { 
                try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) { console.error("Error cargando clases para formExcursion:", error); }
            }
            opcionesClasesHtml = `<option value="" ${paraClaseIdActual === null || paraClaseIdActual === "" ? 'selected' : ''}>-- Global (para todas las clases) --</option>`;
            listaDeClasesGlobal.forEach(clase => {
                opcionesClasesHtml += `<option value="${clase.id}" ${paraClaseIdActual == clase.id ? 'selected' : ''}>${clase.nombre_clase}</option>`;
            });
        } else if (currentUser.rol === 'TUTOR') {
            opcionesClasesHtml = ''; // Reset for tutor
             // "Mi Ciclo" option is default for new or if editing a global/cycle-wide excursion
            opcionesClasesHtml += `<option value="ciclo" ${paraClaseIdActual === "ciclo" ? 'selected' : ''}>Mi Ciclo (Todas las clases de mi ciclo)</option>`;

            if (!currentUser.claseId) {
                console.warn("Tutor sin clase asignada intentando crear/editar excursión.");
                // selectDisabled = true; // Tutor sin clase solo puede seleccionar "Mi Ciclo" (que será global)
            } else {
                 if (listaDeClasesGlobal.length === 0) {
                    try {
                        const dataTodasClases = await apiFetch('/clases');
                        listaDeClasesGlobal = dataTodasClases.clases || [];
                    } catch (error) {
                        console.error("Error cargando todas las clases para el tutor:", error);
                    }
                }
                
                // Añadir la clase propia del tutor
                opcionesClasesHtml += `<option value="${currentUser.claseId}" ${paraClaseIdActual == currentUser.claseId ? 'selected' : ''}>${currentUser.claseNombre} (Mi Clase)</option>`;

                const tutorClaseActual = listaDeClasesGlobal.find(clase => clase.id === currentUser.claseId);
                const tutorCicloId = tutorClaseActual ? tutorClaseActual.ciclo_id : null;

                if (tutorCicloId) {
                    const clasesDelMismoCiclo = listaDeClasesGlobal.filter(clase => clase.ciclo_id === tutorCicloId && clase.id !== currentUser.claseId);
                    clasesDelMismoCiclo.forEach(clase => {
                        opcionesClasesHtml += `<option value="${clase.id}" ${paraClaseIdActual == clase.id ? 'selected' : ''}>${clase.nombre_clase} (Mismo Ciclo)</option>`;
                    });
                }
                selectDisabled = false; 
            }
        }

        let paraClaseSelectHtml = '';
        if (currentUser.rol === 'DIRECCION' || currentUser.rol === 'TUTOR') {
            paraClaseSelectHtml = `<div><label>Para Clase:</label><select id="paraClaseIdExcursion" ${selectDisabled ? 'disabled':''}>${opcionesClasesHtml}</select></div>`;
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
                    ${paraClaseSelectHtml}
                    <div class="form-buttons"><button type="submit" class="success">${idExcursion ? 'Guardar Cambios' : 'Crear Excursión'}</button><button type="button" id="btnCancelarFormExcursion" class="secondary">Cancelar</button></div>
                    <p id="formExcursionError" class="error-message"></p>
                </form>
            </div>`;
        currentFormWrapper.innerHTML = formHtml;
        currentFormWrapper.style.display = 'block';

        const formElement = currentFormWrapper.querySelector('#formGestionExcursion');
        if(formElement) formElement.addEventListener('submit', (e) => saveExcursion(e, null)); 
        
        const btnCancelar = currentFormWrapper.querySelector('#btnCancelarFormExcursion');
        if(btnCancelar) btnCancelar.onclick = () => { currentFormWrapper.innerHTML = ''; currentFormWrapper.style.display = 'none'; };
    }
    async function saveExcursion(event, specificClaseIdForReload = null) { 
        event.preventDefault();
        const formElement = event.target;
        const formWrapper = formElement.closest('.form-container').parentElement;
        const errorP = formWrapper.querySelector('#formExcursionError');

        if(errorP) errorP.textContent = '';
        const excursionId = formWrapper.querySelector('#excursionId').value;
        const paraClaseIdSelect = formWrapper.querySelector('#paraClaseIdExcursion');
        
        let para_clase_id_valor;
        if (paraClaseIdSelect) {
            const selectedValue = paraClaseIdSelect.value;
            if (selectedValue === "ciclo" || selectedValue === "") { // "ciclo" es el nuevo valor para ciclo/global por tutor, "" es el viejo global
                para_clase_id_valor = null;
            } else {
                para_clase_id_valor = parseInt(selectedValue);
            }
        } else { // Fallback, aunque el select debería estar siempre para roles permitidos
             const originalExcursionData = excursionId ? JSON.parse(sessionStorage.getItem(`editExcursionData_${excursionId}`) || '{}') : {};
             para_clase_id_valor = originalExcursionData.para_clase_id !== undefined ? originalExcursionData.para_clase_id : null;
             if (currentUser.rol === 'TUTOR' && !excursionId && currentUser.claseId) { // Creando y es tutor con clase, sin select? (raro)
                para_clase_id_valor = null; // Default a ciclo/global si no hay select.
             }
        }

        const excursionData = {
            nombre_excursion: document.getElementById('nombreExcursion').value,
            actividad_descripcion: document.getElementById('actividadExcursion').value,
            lugar: document.getElementById('lugarExcursion').value,
            fecha_excursion: document.getElementById('fechaExcursion').value,
            hora_salida: document.getElementById('horaSalidaExcursion').value,
            hora_llegada: document.getElementById('horaLlegadaExcursion').value,
            coste_excursion_alumno: parseFloat(formWrapper.querySelector('#costeExcursion').value) || 0,
            vestimenta: formWrapper.querySelector('#vestimentaExcursion').value,
            transporte: formWrapper.querySelector('#transporteExcursion').value,
            justificacion_texto: formWrapper.querySelector('#justificacionExcursion').value,
            notas_excursion: formWrapper.querySelector('#notasExcursion').value,
            para_clase_id: para_clase_id_valor
        };

        if (excursionId) { 
            sessionStorage.setItem(`editExcursionData_${excursionId}`, JSON.stringify(excursionData));
        }

        let method = 'POST';
        let endpoint = '/excursiones';
        if (excursionId) {
            method = 'PUT';
            endpoint = `/excursiones/${excursionId}`;
        }
        const submitButton = formWrapper.querySelector('button[type="submit"]');
        try {
            if(submitButton) submitButton.disabled = true;
            await apiFetch(endpoint, method, excursionData);
            formWrapper.innerHTML = '';
            formWrapper.style.display = 'none';
            if (excursionId) sessionStorage.removeItem(`editExcursionData_${excursionId}`);
            loadExcursiones(); 
        } catch (error) {
            if(errorP) errorP.textContent = error.message || 'Error guardando excursión.';
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
            if (listaDeClasesGlobal.length === 0) { 
                try {
                    const dataClasesDir = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClasesDir.clases || [];
                } catch (error) { alert("Error cargando la lista de clases: " + error.message); return; }
            }
            let classesForModal = listaDeClasesGlobal; 
    
            const existingModal = document.getElementById('duplicateExcursionModal');
            if (existingModal) existingModal.remove();
    
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
            globalOption.value = "null"; 
            globalOption.textContent = '-- Global (ninguna clase específica) --';
            select.appendChild(globalOption);
    
            classesForModal.forEach(clase => {
                const option = document.createElement('option');
                option.value = clase.id;
                option.textContent = clase.nombre_clase;
                if (originalParaClaseId && originalParaClaseId === clase.id) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            if (originalParaClaseId === null) {
                globalOption.selected = true;
            }
    
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
    
            modal.style.display = 'flex'; 
    
            cancelButton.onclick = () => {
                modal.remove();
                alert("Duplicación cancelada.");
            };
    
            acceptButton.onclick = async () => {
                const selectedValue = select.value;
                target_clase_id_final = (selectedValue === "null" || selectedValue === "") ? null : parseInt(selectedValue);
                
                modal.remove(); 
    
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

    async function handleShareExcursion(originalExcursionId, excursionName) {
        if (!currentUser) {
            alert("Error: Usuario no identificado.");
            return;
        }
        if (currentUser.rol !== 'DIRECCION' && currentUser.rol !== 'TUTOR') {
            alert("No tienes permisos para compartir excursiones.");
            return;
        }
    
        let tutoresDisponibles = [];
        try {
            const data = await apiFetch('/usuarios/tutores'); 
            if (data && data.tutores) {
                tutoresDisponibles = data.tutores;
                if (currentUser.rol === 'TUTOR') {
                    tutoresDisponibles = tutoresDisponibles.filter(tutor => tutor.id !== currentUser.id);
                }
            }
            if (tutoresDisponibles.length === 0) {
                alert("No hay otros tutores disponibles para compartir la excursión.");
                return;
            }
        } catch (error) {
            alert("Error al cargar la lista de tutores: " + error.message);
            return;
        }
    
        const existingModal = document.getElementById('shareExcursionModal');
        if (existingModal) existingModal.remove();
    
        const modal = document.createElement('div');
        modal.id = 'shareExcursionModal';
        modal.className = 'simple-modal';
    
        const modalContent = document.createElement('div');
        modalContent.className = 'simple-modal-content';
    
        const title = document.createElement('h4');
        title.textContent = `Compartir Excursión: ${excursionName}`;
    
        const label = document.createElement('label');
        label.setAttribute('for', 'shareTargetTutor');
        label.textContent = 'Seleccionar tutor para compartir:';
    
        const select = document.createElement('select');
        select.id = 'shareTargetTutor';
        select.style.width = '100%';
        select.style.padding = '8px';
        select.style.marginBottom = '15px';
    
        if (tutoresDisponibles.length === 0) { 
            const noTutorsOption = document.createElement('option');
            noTutorsOption.value = "";
            noTutorsOption.textContent = "No hay tutores disponibles";
            select.appendChild(noTutorsOption);
            select.disabled = true;
        } else {
            tutoresDisponibles.forEach(tutor => {
                const option = document.createElement('option');
                option.value = tutor.id;
                option.textContent = `${tutor.nombre_completo} (ID: ${tutor.id})`;
                select.appendChild(option);
            });
        }
    
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'simple-modal-buttons';
    
        const acceptButton = document.createElement('button');
        acceptButton.id = 'shareExcursionAccept';
        acceptButton.textContent = 'Aceptar';
        acceptButton.className = 'success';
        if (tutoresDisponibles.length === 0) acceptButton.disabled = true;
    
        const cancelButton = document.createElement('button');
        cancelButton.id = 'shareExcursionCancel';
        cancelButton.textContent = 'Cancelar';
        cancelButton.className = 'secondary';
    
        buttonsDiv.appendChild(acceptButton);
        buttonsDiv.appendChild(cancelButton);
    
        modalContent.appendChild(title);
        modalContent.appendChild(label);
        modalContent.appendChild(select);
        modalContent.appendChild(buttonsDiv);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    
        modal.style.display = 'flex';
    
        cancelButton.onclick = () => {
            modal.remove();
        };
    
        acceptButton.onclick = async () => {
            const target_usuario_id = select.value;
            if (!target_usuario_id) {
                alert("Por favor, selecciona un tutor.");
                return;
            }
    
            const selectedTutor = tutoresDisponibles.find(t => t.id == target_usuario_id);
            const selectedTutorName = selectedTutor ? selectedTutor.nombre_completo : "el tutor seleccionado";
    
            try {
                await apiFetch(`/excursiones/${originalExcursionId}/share`, 'POST', { target_usuario_id: parseInt(target_usuario_id) });
                alert(`Excursión '${excursionName}' compartida exitosamente con ${selectedTutorName}.`);
            } catch (error) {
                alert(`Error al compartir la excursión: ${error.message}`);
            } finally {
                modal.remove();
            }
        };
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
                    let canShare = false;
                    if (currentUser.rol === 'DIRECCION') {
                        canShare = true;
                    } else if (currentUser.rol === 'TUTOR') {
                        if (ex.para_clase_id === null || ex.para_clase_id === currentUser.claseId) { 
                            canShare = true;
                        }
                    }
                    if (canShare) {
                         accionesHtml += ` <button class="share-excursion primary" data-id="${ex.id}" data-nombre="${ex.nombre_excursion}">Compartir</button>`;
                    }

                        <td>${ex.nombre_excursion}</td><td>${ex.fecha_excursion}</td><td>${ex.lugar}</td><td>${ex.participating_scope_name || 'N/A'}</td><td>${ex.nombre_creador}</td><td class="actions-cell">${accionesHtml}</td></tr>`;
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
            excursionesContentDiv.querySelectorAll('.share-excursion').forEach(button => {
                button.addEventListener('click', (e) => {
                    const id = e.target.dataset.id;
                    const nombre = e.target.dataset.nombre;
                    handleShareExcursion(id, nombre);
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
    
    // --- Shared Excursions ---
    async function loadPendingShares() {
        const contentDiv = document.getElementById('shared-excursions-content');
        if (!contentDiv) { 
            console.error("Elemento shared-excursions-content no encontrado.");
            return;
        }
        if (!currentUser || currentUser.rol !== 'TUTOR') {
            contentDiv.innerHTML = "<p>Acceso denegado o sección no disponible.</p>";
            return;
        }
        contentDiv.innerHTML = "<p>Cargando excursiones recibidas...</p>";
        try {
            const data = await apiFetch('/excursiones/shared/pending'); 
            if (!data || !data.pending_shares || data.pending_shares.length === 0) {
                contentDiv.innerHTML = "<p>No tienes excursiones pendientes de aceptar o rechazar.</p>";
                return;
            }

            let html = `
                <table class="tabla-datos">
                    <thead>
                        <tr>
                            <th>Excursión Original</th>
                            <th>Fecha Original</th>
                            <th>Lugar Original</th>
                            <th>Compartida Por</th>
                            <th>Fecha de Envío</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.pending_shares.map(share => `
                            <tr data-share-id="${share.share_id}">
                                <td>${share.nombre_excursion}</td>
                                <td>${share.fecha_excursion ? share.fecha_excursion.split('T')[0] : 'N/D'}</td>
                                <td>${share.lugar}</td>
                                <td>${share.nombre_compartido_por}</td>
                                <td>${share.shared_at ? new Date(share.shared_at).toLocaleString() : 'N/D'}</td>
                                <td class="actions-cell">
                                    <button class="accept-share success" data-share-id="${share.share_id}" data-excursion-nombre="${share.nombre_excursion}">Aceptar</button>
                                    <button class="decline-share danger" data-share-id="${share.share_id}">Declinar</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
            contentDiv.innerHTML = html;

            contentDiv.querySelectorAll('.accept-share').forEach(button => {
                button.addEventListener('click', (e) => handleAcceptShare(e.target.dataset.shareId, e.target.dataset.excursionNombre));
            });
            contentDiv.querySelectorAll('.decline-share').forEach(button => {
                button.addEventListener('click', (e) => handleDeclineShare(e.target.dataset.shareId));
            });

        } catch (error) {
            showGlobalError("Error cargando excursiones compartidas: " + error.message, contentDiv);
        }
    }

    async function handleAcceptShare(shareId, excursionNombre) {
        if (!currentUser || currentUser.rol !== 'TUTOR' || !currentUser.claseId) {
            alert("Debes ser un tutor con una clase asignada para aceptar excursiones.");
            return;
        }
        if (!confirm(`¿Aceptar la excursión "${excursionNombre}"? Se creará una copia para tu clase: ${currentUser.claseNombre}. Podrás editarla después.`)) return;
        
        try {
            await apiFetch(`/shared-excursions/${shareId}/accept`, 'POST');
            alert("Excursión aceptada y añadida a tus excursiones.");
            loadPendingShares(); 
        } catch (error) {
            alert("Error al aceptar la excursión: " + error.message);
        }
    }

    async function handleDeclineShare(shareId) {
        if (!confirm("¿Seguro que quieres declinar esta excursión compartida?")) return;
        try {
            await apiFetch(`/shared-excursions/${shareId}/decline`, 'POST');
            alert("Excursión compartida declinada.");
            loadPendingShares(); 
        } catch (error) {
            alert("Error al declinar la excursión: " + error.message);
        }
    }

    // --- Participaciones (Código existente) ---
    async function loadParticipaciones() { 
        if (!participacionesContentDiv) return;
        participacionesContentDiv.innerHTML = "<p>Cargando participaciones...</p>";
        
        let selectExcursionesHtml = '<option value="">-- Selecciona excursión --</option>';
        let dataExcursiones;
        try {
            dataExcursiones = await apiFetch('/excursiones');
            (dataExcursiones.excursiones || []).forEach(ex => {
                selectExcursionesHtml += `<option value="${ex.id}">${ex.nombre_excursion} (${new Date(ex.fecha_excursion).toLocaleDateString()})</option>`;
            });
        } catch (error) { 
            selectExcursionesHtml = '<option value="">Error cargando excursiones</option>'; 
            console.error("Error fetching excursions for participation filter:", error);
        }

        let filtroClaseHtml = '';
        if (currentUser.rol === 'DIRECCION') {
            filtroClaseHtml = `<label for="selectFiltroClaseParticipaciones">Filtrar Clase:</label><select id="selectFiltroClaseParticipaciones"><option value="">-- Todas --</option>`;
            if (listaDeClasesGlobal.length === 0) {
                 try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) { console.error("Error cargando clases para filtro de participaciones:", error); }
            }
            listaDeClasesGlobal.forEach(clase => filtroClaseHtml += `<option value="${clase.id}">${clase.nombre_clase}</option>`);
            filtroClaseHtml += `</select>`;
        }
        
        let html = `<h3>Participación en Excursiones</h3>
                    <div class="filtros-participaciones">
                        <label>Excursión:</label><select id="selectExcursionParticipaciones">${selectExcursionesHtml}</select>
                        ${filtroClaseHtml}
                    </div>
                    <div id="resumenParticipacionesContainer"></div>
                    <div id="tablaParticipacionesContainer"></div>`;
        participacionesContentDiv.innerHTML = html;

        const selectExcursion = document.getElementById('selectExcursionParticipaciones');
        const tablaContainer = document.getElementById('tablaParticipacionesContainer');
        const resumenContainer = document.getElementById('resumenParticipacionesContainer');

        if (selectExcursion) {
            selectExcursion.onchange = (e) => {
                const selectedExId = e.target.value;
                if (selectedExId) {
                    const selectedExNombre = e.target.options[e.target.selectedIndex].text;
                    sessionStorage.setItem('filtroParticipacionesExcursionId', selectedExId);
                    sessionStorage.setItem('filtroParticipacionesNombreExcursion', selectedExNombre);
                    sessionStorage.removeItem('viewParticipacionesForClaseId'); 
                    renderTablaParticipaciones(selectedExId, selectedExNombre);
                } else {
                    sessionStorage.removeItem('filtroParticipacionesExcursionId');
                    sessionStorage.removeItem('filtroParticipacionesNombreExcursion');
                    sessionStorage.removeItem('viewParticipacionesForClaseId');
                    if(tablaContainer) tablaContainer.innerHTML = '<p>Selecciona una excursión para ver las participaciones.</p>';
                    if(resumenContainer) resumenContainer.innerHTML = '';
                }
            };
        }
        
        const filtroClaseSelect = document.getElementById('selectFiltroClaseParticipaciones');
        if (filtroClaseSelect) {
            filtroClaseSelect.onchange = () => {
                const currentSelectedExcursionId = selectExcursion ? selectExcursion.value : null;
                if (currentSelectedExcursionId) { 
                    const currentSelectedExcursionName = selectExcursion.options[selectExcursion.selectedIndex].text;
                    renderTablaParticipaciones(currentSelectedExcursionId, currentSelectedExcursionName);
                }
            };
        }

        const excursionIdFromSession = sessionStorage.getItem('filtroParticipacionesExcursionId');
        let isValidSessionId = false;

        if (excursionIdFromSession && dataExcursiones && dataExcursiones.excursiones) {
            const numericExcursionId = parseInt(excursionIdFromSession);
            const foundExcursion = dataExcursiones.excursiones.find(ex => ex.id === numericExcursionId);
            if (foundExcursion) {
                isValidSessionId = true;
                if(selectExcursion) selectExcursion.value = numericExcursionId; 
                const nombreExcursionFromSession = sessionStorage.getItem('filtroParticipacionesNombreExcursion') || foundExcursion.nombre_excursion; 
                renderTablaParticipaciones(numericExcursionId, nombreExcursionFromSession);
            } else {
                sessionStorage.removeItem('filtroParticipacionesExcursionId');
                sessionStorage.removeItem('filtroParticipacionesNombreExcursion');
                sessionStorage.removeItem('viewParticipacionesForClaseId');
            }
        }

        if (!isValidSessionId) {
            if(tablaContainer) tablaContainer.innerHTML = '<p>Por favor, seleccione una excursión de la lista para ver las participaciones.</p>';
            if(resumenContainer) resumenContainer.innerHTML = '';
            if(selectExcursion) selectExcursion.value = ""; 
        }
    }

    async function renderTablaParticipaciones(excursionId, excursionNombre) {
        const container = document.getElementById('tablaParticipacionesContainer');
        const resumenContainer = document.getElementById('resumenParticipacionesContainer');
        if (!container || !resumenContainer) return;
        container.innerHTML = `<p>Cargando para "${excursionNombre}"...</p>`;
        resumenContainer.innerHTML = ''; 
        let endpoint = `/excursiones/${excursionId}/participaciones`;
        
        const filtroClaseSelectElement = document.getElementById('selectFiltroClaseParticipaciones');
        let viewClaseId = null;

        if (currentUser.rol === 'DIRECCION' && filtroClaseSelectElement && filtroClaseSelectElement.value) {
            viewClaseId = filtroClaseSelectElement.value;
        }

        if (viewClaseId) {
            endpoint += `?view_clase_id=${viewClaseId}`;
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
            html += `<button id="btnShowFormNuevoUsuarioTutor" class="success" style="margin-bottom:15px;">+ Crear Usuario</button>`; 
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
        const isDireccionUserBeingViewed = isEditMode && initialUserData.rol === 'DIRECCION';
        
        const formTitle = isEditMode ? (isDireccionUserBeingViewed ? "Ver Usuario Dirección" : "Editar Usuario") : "Crear Nuevo Usuario";
        const submitButtonText = isEditMode ? "Guardar Cambios" : "Crear Usuario";

        let roleOptionsHtml = '';
        const allowedRoles = ['TUTOR', 'TESORERIA']; 
        allowedRoles.forEach(role => {
            roleOptionsHtml += `<option value="${role}" ${isEditMode && initialUserData.rol === role ? 'selected' : ''}>${role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()}</option>`;
        });

        let formHtml = `<div class="form-container"><h4>${formTitle}</h4><form id="formGestionUsuarioTutor">
            ${isEditMode ? `<input type="hidden" id="editUserId" value="${userId}">` : ''}
            <div><label>Email:</label><input type="email" id="adminUserEmail" value="${isEditMode ? initialUserData.email : ''}" ${isDireccionUserBeingViewed ? 'disabled' : ''} required></div>
            <div><label>Nombre Completo:</label><input type="text" id="adminUserNombreCompleto" value="${isEditMode ? initialUserData.nombre_completo : ''}" ${isDireccionUserBeingViewed ? 'disabled' : ''} required></div>`;

        if (isEditMode) {
            if (isDireccionUserBeingViewed) {
                formHtml += `<div><label>Rol:</label><input type="text" value="${initialUserData.rol}" disabled></div>`;
            } else {
                formHtml += `<div><label>Rol:</label><select id="adminUserRol" name="adminUserRol">${roleOptionsHtml}</select></div>`;
            }
        } else { 
            formHtml += `<div><label>Contraseña:</label><input type="password" id="adminUserPassword" required minlength="8"></div>
                         <div><label>Rol:</label><select id="adminUserRol" name="adminUserRol" required>${roleOptionsHtml}</select></div>`;
        }
        
        formHtml += `<div class="form-buttons">`;
        if (!isDireccionUserBeingViewed) { 
            formHtml += `<button type="submit" class="success">${submitButtonText}</button>`;
        }
        formHtml += `<button type="button" id="btnCancelarGestionUsuario" class="secondary">Cancelar</button></div>
                     <p id="formAdminUsuarioError" class="error-message"></p></form></div>`;
        formAdminUsuarioWrapper.innerHTML = formHtml;
        formAdminUsuarioWrapper.style.display = 'block';
        
        const formElement = document.getElementById('formGestionUsuarioTutor');
        if (formElement) {
            formElement.addEventListener('submit', saveAdminUsuario);
        }
        
        const cancelButton = document.getElementById('btnCancelarGestionUsuario');
        if (cancelButton) {
            cancelButton.onclick = () => { 
                formAdminUsuarioWrapper.innerHTML = ''; 
                formAdminUsuarioWrapper.style.display = 'none'; 
            };
        }
    }


    function showTemporaryStatusInElement(element, message, isError, duration = 3000) {
        if (!element) return;
        element.textContent = message;
        element.style.color = isError ? 'red' : 'green';
        setTimeout(() => { if (element) element.textContent = ''; }, duration);
    }

    async function saveAdminUsuario(event) {
        event.preventDefault();
        const errorP = document.getElementById('formAdminUsuarioError');
        if (errorP) errorP.textContent = '';
        const editUserIdInput = document.getElementById('editUserId');
        const isEditMode = editUserIdInput && editUserIdInput.value;
        const emailInput = document.getElementById('adminUserEmail');
        const nombreCompletoInput = document.getElementById('adminUserNombreCompleto');
        const rolSelect = document.getElementById('adminUserRol'); 
        const passwordInput = document.getElementById('adminUserPassword'); 

        const email = emailInput ? emailInput.value.trim() : null;
        const nombre_completo = nombreCompletoInput ? nombreCompletoInput.value.trim() : null;
        
        let userData = {};
        if (email) userData.email = email;
        if (nombre_completo) userData.nombre_completo = nombre_completo;

        let method = 'POST';
        let endpoint = '/usuarios';

        if (isEditMode) {
            method = 'PUT';
            endpoint = `/usuarios/${editUserIdInput.value}`;
            if (rolSelect) { 
                userData.rol = rolSelect.value;
            }
        } else { 
            if (passwordInput) {
                const password = passwordInput.value;
                if (!password || password.length < 8) {
                    if (errorP) errorP.textContent = "Contraseña requerida (mínimo 8 caracteres)."; return;
                }
                userData.password = password;
            } else { 
                 if (errorP) errorP.textContent = "Campo de contraseña no encontrado."; return;
            }
            if (rolSelect) {
                 userData.rol = rolSelect.value;
            } else { 
                 if (errorP) errorP.textContent = "Campo de rol no encontrado."; return;
            }
        }

        if (!userData.email || !userData.nombre_completo) {
            if (errorP) errorP.textContent = "Email y Nombre Completo son requeridos."; return;
        }
         if (!isEditMode && !userData.rol) { 
            if (errorP) errorP.textContent = "Rol es requerido para nuevos usuarios."; return;
        }

        const submitButton = event.target.querySelector('button[type="submit"]');
        try {
            if (submitButton) submitButton.disabled = true;
            await apiFetch(endpoint, method, userData);
            
            if (formAdminUsuarioWrapper) {
                 formAdminUsuarioWrapper.innerHTML = `<p class="success-message">Usuario ${isEditMode ? 'actualizado' : 'creado'} exitosamente.</p>`;
                 setTimeout(() => { 
                    formAdminUsuarioWrapper.innerHTML = ''; 
                    formAdminUsuarioWrapper.style.display = 'none'; 
                }, 2000);
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
        if(modalExcursionParticipants) modalExcursionParticipants.textContent = excursionData.participating_scope_name || 'N/A'; // Added
        
        excursionDetailModal.style.display = 'block'; 
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
        try {
            const excursionDetails = await apiFetch(`/excursiones/${excursionId}`); 
            if (excursionDetails) { 
                openExcursionModal(excursionDetails);
            } else {
                console.warn(`No details found for excursion ID: ${excursionId}.`);
                alert("No se pudieron encontrar los detalles de la excursión. Puede que no exista.");
            }
        } catch (error) {
            console.error(`Error fetching details for excursion ID ${excursionId}:`, error);
            alert(`Error al cargar detalles de la excursión: ${error.message}`);
        }
    }
    window.handleExcursionDayClick = handleExcursionDayClick; 

    // --- Tesorería ---
    async function loadTesoreriaData() {
        const contentDiv = document.getElementById('tesoreria-content');
        if (!contentDiv || !currentToken) {
            if(contentDiv) contentDiv.innerHTML = '<p class="error-message">Error de acceso o carga.</p>';
            return;
        }
        contentDiv.innerHTML = "<p>Cargando datos de tesorería...</p>";
    
        try {
            const [pendientesData, pasadasData] = await Promise.all([
                apiFetch('/tesoreria/excursiones-pendientes'),
                apiFetch('/tesoreria/excursiones-pasadas')
            ]);
    
            let html = '<h3>Excursiones Pendientes</h3>';
            if (pendientesData && pendientesData.excursiones_pendientes && pendientesData.excursiones_pendientes.length > 0) {
                html += '<table class="tabla-datos"><thead><tr><th>Nombre</th><th>Fecha</th><th>Lugar</th><th>Coste Alumno (€)</th><th>Clase Destino</th><th>Creador</th></tr></thead><tbody>';
                pendientesData.excursiones_pendientes.forEach(ex => {
                    html += `<tr>
                        <td>${ex.nombre_excursion || 'N/D'}</td>
                        <td>${ex.fecha_excursion ? new Date(ex.fecha_excursion).toLocaleDateString() : 'N/D'}</td>
                        <td>${ex.lugar || 'N/D'}</td>
                        <td>${ex.coste_excursion_alumno !== null ? ex.coste_excursion_alumno.toFixed(2) : '0.00'}</td>
                        <td>${ex.nombre_clase_destino || 'Global'}</td>
                        <td>${ex.nombre_creador || 'N/D'}</td>
                    </tr>`;
                });
                html += '</tbody></table>';
            } else {
                html += '<p>No hay excursiones pendientes.</p>';
            }
    
            html += '<h3 style="margin-top: 20px;">Excursiones Pasadas</h3>';
            if (pasadasData && pasadasData.excursiones_pasadas && pasadasData.excursiones_pasadas.length > 0) {
                html += '<table class="tabla-datos"><thead><tr><th>Nombre</th><th>Fecha</th><th>Lugar</th><th>Participantes</th><th>Total Pagado (€)</th><th>Coste Alumno (€)</th><th>Clase Destino</th><th>Creador</th></tr></thead><tbody>';
                pasadasData.excursiones_pasadas.forEach(ex => {
                    html += `<tr>
                        <td>${ex.nombre_excursion || 'N/D'}</td>
                        <td>${ex.fecha_excursion ? new Date(ex.fecha_excursion).toLocaleDateString() : 'N/D'}</td>
                        <td>${ex.lugar || 'N/D'}</td>
                        <td>${ex.totalAlumnosParticipantes !== null ? ex.totalAlumnosParticipantes : 'N/D'}</td>
                        <td>${ex.totalPagado !== null ? ex.totalPagado.toFixed(2) : '0.00'}</td>
                        <td>${ex.coste_excursion_alumno !== null ? ex.coste_excursion_alumno.toFixed(2) : '0.00'}</td>
                        <td>${ex.nombre_clase_destino || 'Global'}</td>
                        <td>${ex.nombre_creador || 'N/D'}</td>
                    </tr>`;
                });
                html += '</tbody></table>';
            } else {
                html += '<p>No hay excursiones pasadas.</p>';
            }
            contentDiv.innerHTML = html;
        } catch (error) {
            console.error("Error en loadTesoreriaData:", error);
            contentDiv.innerHTML = `<p class="error-message">Error al cargar datos de tesorería: ${error.message}</p>`;
        }
    }

    // --- INICIALIZACIÓN DE LA APP ---
    checkInitialLoginState();

    // --- Sidebar Toggle Functionality ---
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            document.body.classList.toggle('body-sidebar-open');
        });

        // The logic for closing sidebar on navLink click has been moved into the main
        // navLinks.forEach event listener earlier in the script (around line 260-270).
        // This keeps all navLink click logic consolidated.
    } else {
        console.warn("Sidebar toggle button or sidebar element not found."); // navLinks check removed as it's not relevant here anymore
    }

}); // Fin de DOMContentLoaded
