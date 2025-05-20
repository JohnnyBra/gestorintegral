// --- public/app.js (Versión Completa y Revisada) ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Estado Global del Frontend ---
    let currentUser = null;
    let currentToken = null;

    // --- URLs y Selectores del DOM ---
    const API_BASE_URL = `http://${window.location.hostname}:3000/api`;

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

    // --- Funciones Auxiliares ---
    async function apiFetch(endpoint, method = 'GET', body = null, token = currentToken) {
        const url = `${API_BASE_URL}${endpoint}`;
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

            if (response.status === 204) { console.log("[apiFetch] 204 No Content."); return null; }
            
            const responseText = await response.text();
            let responseData;
            try {
                responseData = responseText ? JSON.parse(responseText) : {};
            } catch (e) {
                console.error(`[apiFetch] Failed to parse JSON from ${url}. Status: ${response.status}. Text:`, responseText.substring(0, 200));
                if (response.ok) throw new Error("Respuesta del servidor no es JSON válido.");
                else throw new Error(`Error HTTP ${response.status}. Respuesta no JSON: ${responseText.substring(0,100)}`);
            }
            
            if (!response.ok) {
                console.warn(`[apiFetch] Not OK (${response.status}) from ${url}. Data:`, responseData);
                if (response.status === 401 || response.status === 403) {
                    handleLogout();
                    alert(responseData.error || "Sesión inválida/denegada. Inicia sesión.");
                }
                throw new Error(responseData.error || `Error HTTP ${response.status}`);
            }
            return responseData;
        } catch (error) {
            console.error(`[apiFetch] CATCH ALL for ${method} ${url}:`, error.message);
            if (!error.message.toLowerCase().includes("sesión inválida")) {
                showGlobalError(error.message.includes("Failed to fetch") ? "No se pudo conectar al servidor." : error.message);
            }
            throw error; 
        }
    }
    function showGlobalError(message) { console.error("ERROR APP:", message); alert(`Error: ${message}`); }

    // --- Autenticación ---
    function handleAuthClick() { navigateTo('login'); }
    if (authButton) authButton.onclick = handleAuthClick;

    function handleLogout() {
        currentUser = null; currentToken = null;
        localStorage.removeItem('authToken'); localStorage.removeItem('userInfo');
        updateUIAfterLogout(); navigateTo('login');
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
                    handleLoginSuccess(data.user, data.token);
                } else { if (loginErrorP) loginErrorP.textContent = (data && data.error) || "Respuesta login inesperada.";}
            } catch (error) { if (loginErrorP) loginErrorP.textContent = error.message.includes("Credenciales incorrectas") ? error.message : "Error al iniciar sesión.";}
        });
    }

    function handleLoginSuccess(user, token) {
        currentUser = user; currentToken = token;
        localStorage.setItem('authToken', token); localStorage.setItem('userInfo', JSON.stringify(user));
        updateUIAfterLogin(); navigateTo('dashboard');
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
                    .then(data => { if (data && data.usuario) handleLoginSuccess(data.usuario, token); else handleLogout(); })
                    .catch(() => handleLogout());
            } catch (e) { handleLogout(); }
        } else { updateUIAfterLogout(); navigateTo('login'); }
    }

    // --- Navegación ---
    function navigateTo(sectionName) {
        console.log("Navegando a:", sectionName);
        mainSections.forEach(s => { if(s) s.style.display = 'none';});
        navLinks.forEach(l => { if(l) l.classList.remove('active');}); // 'active' es clase CSS opcional
        if (loginSection) loginSection.style.display = 'none';
        const activeSectionDiv = document.getElementById(`${sectionName}-section`);
        const activeLink = document.querySelector(`#main-nav-sidebar a[data-section="${sectionName}"]`);
        if (sectionName === 'login') { if (loginSection) loginSection.style.display = 'block'; }
        else if (activeSectionDiv) {
            activeSectionDiv.style.display = 'block';
            if (activeLink) activeLink.classList.add('active');
            loadContentForSection(sectionName);
        } else { console.warn(`Sección '${sectionName}-section' no encontrada.`); }
    }
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); const section = link.dataset.section; if (currentToken || section === 'login') navigateTo(section); else navigateTo('login'); });
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
            case 'admin-usuarios': if (currentUser.rol === 'DIRECCION') loadAdminUsuarios(); break;
            default:
                const sectionDiv = document.getElementById(`${sectionName}-section`);
                if (sectionDiv) sectionDiv.innerHTML = `<p>Contenido para ${sectionName} pendiente.</p>`;
        }
    }

    // --- Dashboard ---
    async function loadDashboardData() {
        if (!dashboardSummaryContentDiv) return;
        dashboardSummaryContentDiv.innerHTML = "<p>Cargando resumen...</p>";
        try {
            const data = await apiFetch('/dashboard/summary');
            let html = '<h4>Resumen General</h4>';
            if (currentUser.rol === 'DIRECCION') {
                html += `<ul><li>Total Clases: ${data.totalClases ?? 'N/D'}</li><li>Total Alumnos: ${data.totalAlumnos ?? 'N/D'}</li><li>Total Excursiones: ${data.totalExcursiones ?? 'N/D'}</li></ul>`;
                if (data.proximasExcursiones && data.proximasExcursiones.length > 0) {
                    html += '<h5>Próximas Excursiones (Global):</h5><ul>';
                    data.proximasExcursiones.forEach(ex => html += `<li>${ex.nombre_excursion} (${ex.fecha_excursion || 'N/D'})</li>`);
                    html += '</ul>';
                } else { html += '<p>No hay próximas excursiones generales.</p>';}
            }
            if (currentUser.rol === 'TUTOR') {
                 html += `<ul><li>Tu Clase: ${currentUser.claseNombre || 'No asignada'}</li><li>Nº Alumnos en tu Clase: ${data.infoSuClase ? data.infoSuClase.numAlumnos : 'N/D'}</li></ul>`;
                if (data.proximasExcursiones && data.proximasExcursiones.length > 0) {
                    html += '<h5>Próximas Excursiones (Tu Clase / Globales):</h5><ul>';
                    data.proximasExcursiones.forEach(ex => html += `<li>${ex.nombre_excursion} (${ex.fecha_excursion || 'N/D'}) ${ex.para_clase_id === currentUser.claseId ? '(Específica tuya)' : (ex.para_clase_id === null ? '(Global)' : '(Otra clase)')}</li>`);
                    html += '</ul>';
                } else { html += '<p>No hay próximas excursiones para tu clase o globales.</p>'; }
                if (data.resumenProximaExcursionSuClase) {
                    const r = data.resumenProximaExcursionSuClase;
                    html += `<h5>Resumen Próxima Excursión (${r.nombreExcursion||'N/A'} - ${r.fecha||'N/A'}):</h5>
                             <ul><li>Inscritos: ${r.totalInscritos??0}</li><li>Autoriz. Sí: ${r.autorizadosSi??0} | No: ${r.autorizadosNo??0}</li><li>Pagos Sí: ${r.pagadoSi??0} | Parcial: ${r.pagadoParcial??0} | No: ${r.pagadoNo??0}</li></ul>`;
                } else if (data.proximasExcursiones && data.proximasExcursiones.length > 0) { html += `<p>Sin datos de participación para la próxima excursión.</p>`; }
            }
            dashboardSummaryContentDiv.innerHTML = html;
        } catch (error) { dashboardSummaryContentDiv.innerHTML = `<p class="error-message">Error cargando dashboard.</p>`; }
    }

       // --- Gestión de Clases ---
    async function loadClases() {
        if (!clasesContentDiv || !currentToken) return;
        clasesContentDiv.innerHTML = '<p>Cargando listado de clases...</p>'; // Mensaje de carga
        try {
            const data = await apiFetch('/clases'); // Llama a GET /api/clases
            let html = '<h3>Listado de Clases</h3>';

            if (currentUser.rol === 'DIRECCION') {
                html += `<button id="btnShowFormNuevaClase" class="success" style="margin-bottom:15px;">+ Añadir Nueva Clase</button>`;
            }
            html += `
                <table class="tabla-datos">
                    <thead>
                        <tr>
                            <th>Nombre Clase</th>
                            <th>Tutor Asignado</th>
                            <th>Email Tutor</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>`;

            if (data.clases && data.clases.length > 0) {
                data.clases.forEach(clase => {
                    html += `
                        <tr data-clase-id="${clase.id}">
                            <td>${clase.nombre_clase}</td>
                            <td>${clase.nombre_tutor || '<em>No asignado</em>'}</td>
                            <td>${clase.email_tutor || '<em>N/A</em>'}</td>
                            <td class="actions-cell">
                                <button class="view-alumnos-clase secondary" data-claseid="${clase.id}" data-nclase="${clase.nombre_clase}">Ver Alumnos</button>
                                ${currentUser.rol === 'DIRECCION' ? `
                                    <button class="edit-clase warning" data-id="${clase.id}" data-nombre="${clase.nombre_clase}" data-tutorid="${clase.tutor_id || ''}">Editar</button>
                                    <button class="delete-clase danger" data-id="${clase.id}" data-nombre="${clase.nombre_clase}">Eliminar</button>
                                ` : ''}
                            </td>
                        </tr>`;
                });
            } else {
                html += '<tr><td colspan="4" style="text-align:center;">No hay clases registradas.</td></tr>';
            }
            html += '</tbody></table><div id="formClaseWrapper" class="form-wrapper" style="margin-top:20px;"></div>'; // Contenedor para el form
            clasesContentDiv.innerHTML = html;
            
            // Añadir Event Listeners a los botones recién creados
            if(document.getElementById('btnShowFormNuevaClase')) {
                document.getElementById('btnShowFormNuevaClase').onclick = () => showFormClase();
            }
            clasesContentDiv.querySelectorAll('.edit-clase').forEach(btn => {
                btn.onclick = (e) => showFormClase(e.target.dataset.id, e.target.dataset.nombre, e.target.dataset.tutorid);
            });
            clasesContentDiv.querySelectorAll('.delete-clase').forEach(btn => {
                btn.onclick = (e) => deleteClase(e.target.dataset.id, e.target.dataset.nombre);
            });
            clasesContentDiv.querySelectorAll('.view-alumnos-clase').forEach(btn => {
                btn.onclick = (e) => {
                    sessionStorage.setItem('filtroAlumnosClaseId', e.target.dataset.claseid);
                    sessionStorage.setItem('filtroAlumnosNombreClase', e.target.dataset.nclase);
                    navigateTo('alumnos'); 
                };
            });
        } catch (error) {
            console.error("Error en loadClases:", error);
            clasesContentDiv.innerHTML = `<p class="error-message">Error al cargar las clases: ${error.message}</p>`;
        }
    }

    async function showFormClase(idClase = null, nombreExistente = '', tutorIdExistente = '') {
        if (!currentUser || currentUser.rol !== 'DIRECCION') {
             showGlobalError("Acción no autorizada."); return;
        }
        const formWrapper = document.getElementById('formClaseWrapper');
        if (!formWrapper) { console.error("formClaseWrapper no encontrado"); return; }

        const tituloForm = idClase ? 'Editar Clase' : 'Añadir Nueva Clase';
        let tutoresOptionsHtml = '<option value="">-- Sin Asignar --</option>';
        
        try {
            // Cargar la lista de usuarios que son TUTORES para el desplegable
            const dataUsuarios = await apiFetch('/usuarios'); // Asume que este endpoint devuelve todos los usuarios
            if (dataUsuarios.usuarios) {
                dataUsuarios.usuarios.filter(u => u.rol === 'TUTOR').forEach(tutor => {
                    tutoresOptionsHtml += `<option value="${tutor.id}" ${parseInt(tutorIdExistente) === tutor.id ? 'selected' : ''}>
                                              ${tutor.nombre_completo} (${tutor.email})
                                           </option>`;
                });
                 // Si estamos editando y el tutor_id actual no está en la lista (ej. se eliminó el usuario tutor pero no la asignación)
                 // o si el tutor_id es de un usuario que ya no es tutor.
                if (idClase && tutorIdExistente && !dataUsuarios.usuarios.find(u => u.id === parseInt(tutorIdExistente) && u.rol === 'TUTOR')) {
                    // Podríamos intentar obtener el nombre del tutor actual si es posible, o mostrar ID
                    // Esta parte es compleja si los datos son inconsistentes. Por ahora, se mostrará el ID si no se encuentra el nombre.
                    const tutorActualObj = dataUsuarios.usuarios.find(u => u.id === parseInt(tutorIdExistente));
                    const nombreTutorActual = tutorActualObj ? tutorActualObj.nombre_completo : `ID ${tutorIdExistente} (Rol no Tutor o no encontrado)`;
                    if (tutorIdExistente) { // Añadirlo si no está para que se muestre seleccionado pero no se pueda re-seleccionar si ya no es tutor
                        tutoresOptionsHtml += `<option value="${tutorIdExistente}" selected disabled>${nombreTutorActual} (Asignación actual)</option>`;
                    }
                }
            }
        } catch(e){ 
            console.error("Error cargando lista de tutores para el formulario:", e);
            tutoresOptionsHtml += '<option value="" disabled>Error cargando tutores</option>';
        }

        formWrapper.innerHTML = `
            <h4>${tituloForm}</h4>
            <form id="claseFormDetalle" style="border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
                <input type="hidden" id="claseIdForm" value="${idClase || ''}">
                <div>
                    <label for="nombreClaseForm">Nombre Clase:</label>
                    <input type="text" id="nombreClaseForm" value="${nombreExistente || ''}" required>
                </div>
                <div>
                    <label for="tutorIdForm">Tutor Asignado:</label>
                    <select id="tutorIdForm">
                        ${tutoresOptionsHtml}
                    </select>
                </div>
                <div class="form-buttons">
                    <button type="submit" class="success">${idClase ? 'Actualizar Clase' : 'Crear Clase'}</button>
                    <button type="button" onclick="document.getElementById('formClaseWrapper').innerHTML=''; document.getElementById('formClaseWrapper').style.display='none';">Cancelar</button>
                </div>
            </form>`;
        formWrapper.style.display = 'block';
        
        const detalleForm = document.getElementById('claseFormDetalle');
        if (detalleForm) {
            detalleForm.addEventListener('submit', saveClase);
        }
    }

    async function saveClase(event) {
        event.preventDefault();
        if (!currentUser || currentUser.rol !== 'DIRECCION') { showGlobalError("Acción no autorizada."); return; }

        const id = document.getElementById('claseIdForm').value;
        const nombre_clase = document.getElementById('nombreClaseForm').value.trim();
        let tutor_id_str = document.getElementById('tutorIdForm').value;
        // Convertir a número o null. Si es cadena vacía, se convierte en null.
        const tutor_id = tutor_id_str ? parseInt(tutor_id_str) : null;


        if (!nombre_clase) {
            alert("El nombre de la clase es obligatorio.");
            return;
        }

        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/clases/${id}` : '/clases';
        const body = { nombre_clase, tutor_id }; // tutor_id puede ser null aquí

        console.log(`Guardando clase: ${method} ${endpoint}`, body);

        try {
            const resultado = await apiFetch(endpoint, method, body);
            alert(resultado.message || (id ? "Clase actualizada correctamente." : "Clase creada correctamente."));
            const formWrapper = document.getElementById('formClaseWrapper');
            if(formWrapper) {
                formWrapper.innerHTML = ''; // Limpiar el formulario
                formWrapper.style.display = 'none';
            }
            loadClases(); // Recargar la lista de clases para ver los cambios
        } catch (error) {
            showGlobalError(`Error guardando clase: ${error.message}`);
        }
    }

    async function deleteClase(idClase, nombreClase) {
        if (!currentUser || currentUser.rol !== 'DIRECCION') { showGlobalError("Acción no autorizada."); return; }
        if (!idClase) return;

        const nombreParaConfirmar = nombreClase || `la clase con ID ${idClase}`;
        if (confirm(`¿Estás seguro de que quieres eliminar ${nombreParaConfirmar}? Esto también eliminará a todos sus alumnos y sus participaciones en excursiones (si existen).`)) {
            try {
                const resultado = await apiFetch(`/clases/${idClase}`, 'DELETE');
                alert(resultado.message || "Clase eliminada correctamente.");
                loadClases(); // Recargar la lista
            } catch (error) {
                showGlobalError(`Error eliminando la clase: ${error.message}`);
            }
        }
    }
    // --- Fin de Gestión de Clases ---


    // --- ESQUELETOS PARA OTRAS SECCIONES (A COMPLETAR) ---
    async function loadAlumnos() {
        if (!alumnosContentDiv || !currentToken) return;
        alumnosContentDiv.innerHTML = "<p>Cargando alumnos...</p>";
        const filtroClaseId = sessionStorage.getItem('filtroAlumnosClaseId');
        const filtroNombreClase = sessionStorage.getItem('filtroAlumnosNombreClase');
        // No limpiar sessionStorage aquí para que el filtro persista si el usuario navega y vuelve
        
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
            } else {
                titulo += ` (Todas las Clases)`;
            }
        }
        if (queryParams.toString()) {
            endpoint += `?${queryParams.toString()}`;
        }
        
        try {
            const data = await apiFetch(endpoint);
            const dataClases = (currentUser.rol === 'DIRECCION') ? await apiFetch('/clases') : null;
            
            let html = `<h3>${titulo}</h3>`;
            if (currentUser.rol === 'DIRECCION' && !filtroClaseId) { // Solo mostrar filtro general si no hay uno específico de "Ver Alumnos"
                html += `<div style="margin-bottom:15px;">Filtrar por clase: <select id="selectFiltroClaseAlumnos"><option value="">Todas las clases</option>`;
                if (dataClases && dataClases.clases) {
                    dataClases.clases.forEach(cl => html += `<option value="${cl.id}">${cl.nombre_clase}</option>`);
                }
                html += `</select></div>`;
            } else if (filtroClaseId && currentUser.rol === 'DIRECCION') {
                 html += `<button onclick="sessionStorage.removeItem('filtroAlumnosClaseId'); sessionStorage.removeItem('filtroAlumnosNombreClase'); loadAlumnos();" class="secondary" style="margin-bottom:15px;">Mostrar Todos los Alumnos</button>`;
            }

            if (currentUser.rol === 'DIRECCION' || (currentUser.rol === 'TUTOR' && currentUser.claseId)) {
                html += `<button id="btnShowFormNuevoAlumno" class="success" style="margin-bottom:15px;">+ Añadir Alumno ${currentUser.rol === 'TUTOR' ? 'a mi clase' : ''}</button>`;
            }
            html += `<table class="tabla-datos"><thead><tr><th>Nombre Completo</th><th>Clase</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.alumnos && data.alumnos.length > 0) {
                data.alumnos.forEach(a => { html += `<tr><td>${a.nombre_completo}</td><td>${a.nombre_clase}</td><td>
                    <button class="edit-alumno warning" data-id="${a.id}" data-nombre="${a.nombre_completo}" data-claseid="${a.clase_id}">Editar</button>
                    <button class="delete-alumno danger" data-id="${a.id}" data-nombre="${a.nombre_completo}">Eliminar</button>
                    </td></tr>`; });
            } else { html += `<tr><td colspan="3" style="text-align:center;">No hay alumnos para mostrar según el filtro actual.</td></tr>`; }
            html += `</tbody></table><div id="formAlumnoWrapper" class="form-wrapper" style="margin-top:20px;"></div>`;
            alumnosContentDiv.innerHTML = html;

            if(document.getElementById('btnShowFormNuevoAlumno')) document.getElementById('btnShowFormNuevoAlumno').onclick = () => showFormAlumno(null, dataClases ? dataClases.clases : null);
            alumnosContentDiv.querySelectorAll('.edit-alumno').forEach(b=>b.onclick=(e)=>showFormAlumno(e.target.dataset.id, dataClases ? dataClases.clases : null, e.target.dataset.nombre, e.target.dataset.claseid));
            alumnosContentDiv.querySelectorAll('.delete-alumno').forEach(b=>b.onclick=(e)=>deleteAlumno(e.target.dataset.id, e.target.dataset.nombre));
            
            if (document.getElementById('selectFiltroClaseAlumnos')) {
                const selectFiltro = document.getElementById('selectFiltroClaseAlumnos');
                 if (sessionStorage.getItem('filtroAlumnosClaseId')) { // Mantener selección del filtro
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
                    loadAlumnos(); // Recargar alumnos con el nuevo filtro
                };
            }
        } catch (e) { alumnosContentDiv.innerHTML = `<p class="error-message">Error cargando alumnos: ${e.message}</p>`;}
    }
    async function showFormAlumno(idAlumno = null, listaTodasClases = null, nombreExistente = '', claseIdExistente = '') {
         const formWrapper = document.getElementById('formAlumnoWrapper'); if (!formWrapper) return;
         const titulo = idAlumno ? 'Editar Alumno' : 'Añadir Nuevo Alumno';
         let claseAsignadaPorTutor = '';
         if (currentUser.rol === 'TUTOR' && currentUser.claseId && currentUser.claseNombre) {
             claseAsignadaPorTutor = `<p>Se añadirá/editará el alumno en tu clase: <strong>${currentUser.claseNombre}</strong>.</p>
                                     <input type="hidden" id="claseIdAlumnoForm" value="${currentUser.claseId}">`;
         }

        let clasesOptHtml = '';
        if (currentUser.rol === 'DIRECCION') {
            if (!listaTodasClases) { // Si no se pasó la lista (ej. se llama desde botón general)
                try { const dataC = await apiFetch('/clases'); listaTodasClases = dataC.clases; } catch(e){console.error(e);}
            }
            if(listaTodasClases) {
                listaTodasClases.forEach(cl => {
                    clasesOptHtml += `<option value="${cl.id}" ${parseInt(claseIdExistente) === cl.id ? 'selected' : ''}>${cl.nombre_clase}</option>`;
                });
            } else {
                clasesOptHtml = '<option value="" disabled>No hay clases disponibles</option>';
            }
        }

        formWrapper.innerHTML = `<h4>${titulo}</h4>
            <form id="alumnoFormDetalle" style="border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
                <input type="hidden" id="alumnoIdForm" value="${idAlumno||''}"/>
                <div><label for="nombreAlumnoForm">Nombre Completo:</label><input type="text" id="nombreAlumnoForm" value="${nombreExistente||''}" required/></div>
                ${currentUser.rol==='DIRECCION' ? `<div><label for="claseIdAlumnoForm">Clase:</label><select id="claseIdAlumnoForm" required>${clasesOptHtml}</select></div>` : claseAsignadaPorTutor}
                <div class="form-buttons">
                    <button type="submit" class="success">${idAlumno?'Actualizar Alumno':'Crear Alumno'}</button>
                    <button type="button" onclick="document.getElementById('formAlumnoWrapper').innerHTML='';document.getElementById('formAlumnoWrapper').style.display='none';">Cancelar</button>
                </div>
            </form>`;
        formWrapper.style.display='block';
        document.getElementById('alumnoFormDetalle').onsubmit = saveAlumno;
    }
    async function saveAlumno(event) {
        event.preventDefault();
        const id = document.getElementById('alumnoIdForm').value;
        const nombre_completo = document.getElementById('nombreAlumnoForm').value.trim();
        let clase_id;
        if (currentUser.rol === 'DIRECCION') {
            const selectClase = document.getElementById('claseIdAlumnoForm');
            if (!selectClase || !selectClase.value) { alert("Debes seleccionar una clase para el alumno."); return; }
            clase_id = parseInt(selectClase.value);
        } else if (currentUser.rol === 'TUTOR' && currentUser.claseId) {
            clase_id = currentUser.claseId; // Tutor asigna a su propia clase
        } else {
            showGlobalError("No se pudo determinar la clase para el alumno."); return;
        }

        if (!nombre_completo) { alert("Nombre del alumno es obligatorio."); return; }
        
        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/alumnos/${id}` : '/alumnos';
        const body = { nombre_completo, clase_id };

        try {
            await apiFetch(endpoint, method, body);
            document.getElementById('formAlumnoWrapper').innerHTML=''; 
            document.getElementById('formAlumnoWrapper').style.display='none'; 
            loadAlumnos(sessionStorage.getItem('filtroAlumnosClaseId'), sessionStorage.getItem('filtroAlumnosNombreClase')); // Recargar con el filtro actual
        } catch (error) { showGlobalError(`Error guardando alumno: ${error.message}`); }
    }
    async function deleteAlumno(idAlumno, nombreAlumno) {
        if (confirm(`¿Estás seguro de eliminar al alumno "${nombreAlumno||`ID ${idAlumno}`}"? Esto también eliminará sus participaciones en excursiones.`)) {
            try {
                await apiFetch(`/alumnos/${idAlumno}`, 'DELETE');
                loadAlumnos(sessionStorage.getItem('filtroAlumnosClaseId'), sessionStorage.getItem('filtroAlumnosNombreClase')); // Recargar con el filtro actual
            } catch (error) { showGlobalError(`Error eliminando alumno: ${error.message}`); }
        }
    }


    // --- Excursiones ---
    async function loadExcursiones() { /* TODO: Implementar similar a loadClases/loadAlumnos, con botones para crear/editar/eliminar y ver participantes */ }
    // async function showFormExcursion(id = null) { /* ... */ }
    // async function saveExcursion(event) { /* ... */ }
    // async function deleteExcursion(id) { /* ... */ }

    // --- Participaciones ---
    async function loadParticipaciones() { /* TODO: Implementar filtros y tabla. La edición aquí es más compleja (inline o modal por participación) */ }
    // async function showFormParticipacion(id = null) { /* ... */ } // Podría ser un modal para editar una línea
    // async function saveParticipacion(eventOrData) { /* ... */ }


    // --- Admin Usuarios (Solo Dirección) ---
    async function loadAdminUsuarios() { /* TODO: Implementar similar a loadClases, usando /api/usuarios. Los formularios serán para email, nombre, rol, y opcionalmente clase_asignada_id para tutores */ }
    // async function showFormAdminUsuario(id = null) { /* ... */ }
    // async function saveAdminUsuario(event) { /* ... */ }
    // async function deleteAdminUsuario(id) { /* ... */ }


    // --- INICIALIZACIÓN DE LA APP ---
    checkInitialLoginState();
}); // Fin de DOMContentLoaded
