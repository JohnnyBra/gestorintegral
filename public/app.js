// --- public/app.js (Versión con esqueletos para todas las secciones) ---
document.addEventListener('DOMContentLoaded', () => {
    // --- Estado Global, Selectores, API_BASE_URL (como antes) ---
    let currentUser = null; let currentToken = null;
    const API_BASE_URL = `http://${window.location.hostname}:3000/api`;
    // Todos los getElementById y querySelectorAll que ya tenías...
    const loginSection = document.getElementById('login-section'); /* ...y todos los demás ... */
    const mainNavSidebar = document.getElementById('main-nav-sidebar');
    const navLinks = document.querySelectorAll('#main-nav-sidebar a');
    const mainSections = document.querySelectorAll('.main-section');
    const authButton = document.getElementById('auth_button');
    const signoutButton = document.getElementById('signout_button');
    const userInfoDisplay = document.getElementById('userInfoDisplay');
    const loginForm = document.getElementById('loginForm');
    const loginErrorP = document.getElementById('loginError');

    const dashboardSummaryContentDiv = document.getElementById('dashboard-summary-content');
    const clasesContentDiv = document.getElementById('clases-content');
    const alumnosContentDiv = document.getElementById('alumnos-content');
    const excursionesContentDiv = document.getElementById('excursiones-content');
    const participacionesContentDiv = document.getElementById('participaciones-content');
    const adminUsuariosContentDiv = document.getElementById('admin-usuarios-content');

    // --- apiFetch, showGlobalError, Auth, Navegación (como en la última versión que te di) ---
    // ... (Pega aquí tus funciones apiFetch, showGlobalError, handleAuthClick, handleLogout, 
    //      loginForm listener, handleLoginSuccess, updateUIAfterLogin, updateUIAfterLogout,
    //      adaptarMenuSegunRol, checkInitialLoginState, navigateTo, loadContentForSection)
    // ASEGÚRATE DE QUE ESTÉN COMPLETAS Y FUNCIONANDO BASADO EN NUESTRAS ÚLTIMAS CORRECCIONES

    // --- Carga de Contenido Específico para Secciones ---

    // Dashboard (ya lo tenías más o menos)
    async function loadDashboardData() { /* ... como lo tenías ... */ }

    // Clases (ya lo tenías bastante completo, con showFormClase, saveClase, deleteClase)
    async function loadClases() { /* ... como lo tenías ... */ }
    async function showFormClase(idClase = null, nombreExistente = '', tutorIdExistente = '') { /* ... */ }
    async function saveClase(event) { /* ... */ }
    async function deleteClase(idClase, nombreClase) { /* ... */ }

    // Alumnos
    async function loadAlumnos() {
        if (!alumnosContentDiv || !currentToken) return;
        // ... (tu lógica de endpoint y fetch que ya tenías) ...
        // Renderizar tabla y añadir botones/formularios
        alumnosContentDiv.innerHTML = `
            <h3>Alumnos ...</h3>
            <button onclick="showFormAlumno()">Añadir Alumno</button>
            <div id="alumnosTableContainer">Cargando alumnos...</div>
            <div id="formAlumnoWrapper" style="display:none; margin-top:20px;"></div>
        `;
        // ... luego llamas a apiFetch y renderizas la tabla en alumnosTableContainer ...
        // ... y configuras listeners para botones de editar/eliminar que llamen a showFormAlumno(id) o deleteAlumno(id)
    }
    async function showFormAlumno(id = null) { /* ... Lógica para mostrar form ... */ }
    async function saveAlumno(event) { /* ... Lógica para POST/PUT /api/alumnos ... */ }
    async function deleteAlumno(id) { /* ... Lógica para DELETE /api/alumnos/:id ... */ }

    // Excursiones
    async function loadExcursiones() {
        if (!excursionesContentDiv || !currentToken) return;
        // ... (tu lógica de fetch y renderizado de tabla de excursiones, similar a clases) ...
        excursionesContentDiv.innerHTML = `
            <h3>Excursiones</h3>
            <button onclick="showFormExcursion()">Añadir Excursión</button>
            <div id="excursionesTableContainer">Cargando excursiones...</div>
            <div id="formExcursionWrapper" style="display:none; margin-top:20px;"></div>
        `;
    }
    async function showFormExcursion(id = null) { /* ... */ }
    async function saveExcursion(event) { /* ... */ }
    async function deleteExcursion(id) { /* ... */ }

    // Participaciones
    async function loadParticipaciones() {
        if (!participacionesContentDiv || !currentToken) return;
        // ... (lógica de fetch con filtros y renderizado de tabla de participaciones) ...
        // Esta es la más compleja de renderizar interactivamente.
        participacionesContentDiv.innerHTML = `
            <h3>Participaciones en Excursión</h3>
            <div id="participacionesTableContainer">Selecciona filtros para ver participaciones...</div>
            <div id="formParticipacionWrapper" style="display:none; margin-top:20px;"></div>
        `;
    }
    // showFormParticipacion (para editar una participación), saveParticipacion

    // Admin Usuarios (Solo Dirección)
    async function loadAdminUsuarios() {
        if (!adminUsuariosContentDiv || !currentUser || currentUser.rol !== 'DIRECCION') return;
        adminUsuariosContentDiv.innerHTML = "<p>Cargando usuarios...</p>";
        try {
            const data = await apiFetch('/usuarios');
            const clasesData = await apiFetch('/clases'); // Para mostrar a qué clase está asignado un tutor
            const claseMap = new Map(clasesData.clases.map(c => [c.id, c.nombre_clase]));

            let html = `<h3>Gestión de Cuentas de Usuario</h3>
                        <button onclick="showFormAdminUsuario()" class="success" style="margin-bottom:15px;">+ Añadir Nuevo Usuario</button>
                        <table><thead><tr><th>Email</th><th>Nombre</th><th>Rol</th><th>Clase Asignada</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.usuarios && data.usuarios.length > 0) {
                data.usuarios.forEach(u => {
                    let claseDelTutor = 'N/A';
                    if (u.rol === 'TUTOR') {
                        const claseAsignada = clasesData.clases.find(c => c.tutor_id === u.id);
                        claseDelTutor = claseAsignada ? claseAsignada.nombre_clase : '<em>Sin asignar</em>';
                    }
                    html += `<tr>
                                <td>${u.email}</td><td>${u.nombre_completo}</td><td>${u.rol}</td><td>${claseDelTutor}</td>
                                <td>
                                    <button class="edit-usuario-admin warning" data-id="${u.id}">Editar</button> 
                                    ${u.id !== currentUser.id && !(u.rol === 'DIRECCION' && data.usuarios.filter(usr => usr.rol === 'DIRECCION').length <= 1) ? 
                                     `<button class="delete-usuario-admin danger" data-id="${u.id}">Eliminar</button>` : ''}
                                </td>
                             </tr>`;
                });
            } else { html += `<tr><td colspan="5">No hay usuarios.</td></tr>`; }
            html += `</tbody></table><div id="formAdminUsuarioWrapper" style="margin-top:20px;"></div>`;
            adminUsuariosContentDiv.innerHTML = html;

            adminUsuariosContentDiv.querySelectorAll('.edit-usuario-admin').forEach(b=>b.onclick = (e) => showFormAdminUsuario(e.target.dataset.id));
            adminUsuariosContentDiv.querySelectorAll('.delete-usuario-admin').forEach(b=>b.onclick = (e) => deleteAdminUsuario(e.target.dataset.id));

        } catch (e) { adminUsuariosContentDiv.innerHTML = `<p class="error-message">Error cargando usuarios.</p>`;}
    }

    async function showFormAdminUsuario(idUsuario = null) {
        const formWrapper = document.getElementById('formAdminUsuarioWrapper');
        let userActual = { email: '', nombre_completo: '', rol: 'TUTOR', clase_asignada_id: null };
        let titulo = "Añadir Nuevo Usuario";
        if (idUsuario) {
            titulo = "Editar Usuario";
            try { // Cargar datos del usuario a editar
                const data = await apiFetch(`/usuarios`); // Podríamos tener un GET /api/usuarios/:id
                const foundUser = data.usuarios.find(u => u.id === parseInt(idUsuario));
                if (foundUser) {
                     userActual = {...foundUser};
                     // Necesitamos el ID de la clase si es tutor
                     if(userActual.rol === 'TUTOR'){
                        const clasesData = await apiFetch('/clases');
                        const claseAsignada = clasesData.clases.find(c => c.tutor_id === userActual.id);
                        userActual.clase_asignada_id = claseAsignada ? claseAsignada.id : null;
                     }
                }
            } catch (e) { showGlobalError("Error cargando datos del usuario."); return; }
        }

        let clasesOptionsHtml = '<option value="">-- No asignar a clase --</option>';
        try {
            const dataClases = await apiFetch('/clases');
            if (dataClases.clases) {
                dataClases.clases.forEach(cl => {
                    // Mostrar solo clases sin tutor o la clase actual del tutor que se edita
                    const tutorDeEstaClase = dataClases.clases.find(c => c.id === cl.id)?.tutor_id;
                    if (!tutorDeEstaClase || tutorDeEstaClase === (idUsuario ? parseInt(idUsuario) : null) || tutorDeEstaClase === userActual.tutor_id) {
                         clasesOptionsHtml += `<option value="${cl.id}" ${userActual.clase_asignada_id === cl.id ? 'selected':''}>${cl.nombre_clase}</option>`;
                    } else {
                         clasesOptionsHtml += `<option value="${cl.id}" disabled>${cl.nombre_clase} (Tutor: ${cl.nombre_tutor || 'ID:'+cl.tutor_id})</option>`;
                    }
                });
            }
        } catch(e) { console.error("Error cargando clases para form admin usuarios:", e); }

        formWrapper.innerHTML = `<h4>${titulo}</h4>
            <form id="adminUsuarioFormDetalle">
                <input type="hidden" id="adminUserIdForm" value="${idUsuario || ''}">
                <div><label>Email:</label><input type="email" id="adminUserEmailForm" value="${userActual.email}" ${idUsuario ? 'disabled' : 'required'}></div>
                <div><label>Nombre Completo:</label><input type="text" id="adminUserNombreForm" value="${userActual.nombre_completo}" required></div>
                <div><label>Contraseña ${idUsuario ? '(Dejar en blanco para no cambiar)' : ''}:</label><input type="password" id="adminUserPasswordForm" ${!idUsuario ? 'required' : ''}></div>
                <div><label>Rol:</label><select id="adminUserRolForm">
                    <option value="TUTOR" ${userActual.rol === 'TUTOR' ? 'selected':''}>Tutor</option>
                    <option value="DIRECCION" ${userActual.rol === 'DIRECCION' ? 'selected':''}>Dirección</option>
                </select></div>
                <div id="adminUserClaseAsignadaDivForm" style="display: ${userActual.rol === 'TUTOR' ? 'flex':'none'}; flex-direction:column;">
                    <label>Asignar a Clase:</label><select id="adminUserClaseIdForm">${clasesOptionsHtml}</select>
                </div>
                <button type="submit" class="success">${idUsuario ? 'Actualizar' : 'Crear'}</button>
                <button type="button" onclick="document.getElementById('formAdminUsuarioWrapper').innerHTML='';">Cancelar</button>
            </form>`;
        formWrapper.style.display = 'block';
        document.getElementById('adminUserRolForm').onchange = function() {
            document.getElementById('adminUserClaseAsignadaDivForm').style.display = this.value === 'TUTOR' ? 'flex':'none';
        };
        document.getElementById('adminUsuarioFormDetalle').onsubmit = saveAdminUsuario;
    }

    async function saveAdminUsuario(event) {
        event.preventDefault();
        const id = document.getElementById('adminUserIdForm').value;
        const email = document.getElementById('adminUserEmailForm').value; // Email no se edita
        const nombre_completo = document.getElementById('adminUserNombreForm').value;
        const password = document.getElementById('adminUserPasswordForm').value; // Enviar solo si se quiere cambiar
        const rol = document.getElementById('adminUserRolForm').value;
        let clase_asignada_id = document.getElementById('adminUserClaseIdForm').value;
        clase_asignada_id = (rol === 'TUTOR' && clase_asignada_id) ? parseInt(clase_asignada_id) : null;

        const body = { nombre_completo, rol };
        if (password) body.password = password; // Enviar como 'password' para crear, o 'new_password' para actualizar
        if (!id) body.email = email; // Email solo para crear
        if (rol === 'TUTOR') body.clase_asignada_id = clase_asignada_id; // ID de la tabla 'clases'

        const method = id ? 'PUT' : 'POST';
        const endpoint = id ? `/usuarios/${id}` : '/usuarios';
        if (id && password) body.new_password = password; // Backend espera 'new_password' para PUT
        delete body.password; // No enviar 'password' vacío en PUT si no se cambia

        try {
            await apiFetch(endpoint, method, body);
            document.getElementById('formAdminUsuarioWrapper').innerHTML = ''; loadAdminUsuarios();
        } catch (e) { showGlobalError(`Error guardando usuario: ${e.message}`); }
    }
    async function deleteAdminUsuario(id) { /* ... (similar a deleteClase, llamando a DELETE /api/usuarios/:id) ... */ }

    // --- INICIALIZACIÓN ---
    checkInitialLoginState();
});
