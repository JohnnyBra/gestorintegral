document.addEventListener('DOMContentLoaded', () => {
    let currentCalendarYear = new Date().getFullYear();
    let currentCalendarMonth = new Date().getMonth(); 
    let currentUser = null;
    let currentParticipacionesDataArray = []; // Added global variable
    let currentToken = null;

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
    const modalExcursionParticipants = document.getElementById('modal-excursion-participants');
    const modalCloseButton = document.getElementById('modal-close-button');

    const tesoreriaFinancialModal = document.getElementById('tesoreria-excursion-financial-modal');
    const financialModalTitle = document.getElementById('financial-modal-title');
    const financialModalExcursionNombre = document.getElementById('financial-modal-excursion-nombre');
    const financialModalExcursionFecha = document.getElementById('financial-modal-excursion-fecha');
    const financialModalNumeroAutobuses = document.getElementById('financial-modal-numero-autobuses');
    const financialModalCostePorAutobus = document.getElementById('financial-modal-coste-por-autobus');
    const financialModalCosteEntradasIndividual = document.getElementById('financial-modal-coste-entradas-individual');
    const financialModalCosteActividadGlobal = document.getElementById('financial-modal-coste-actividad-global');
    const financialModalTotalRecaudado = document.getElementById('financial-modal-total-recaudado');
    const financialModalAlumnosAsistentes = document.getElementById('financial-modal-alumnos-asistentes');
    const financialModalCosteTotalAutobuses = document.getElementById('financial-modal-coste-total-autobuses');
    const financialModalCosteTotalEntradas = document.getElementById('financial-modal-coste-total-entradas');
    const financialModalCosteNinoActGlobal = document.getElementById('financial-modal-coste-nino-act-global');
    const financialModalBalance = document.getElementById('financial-modal-balance');
    const financialModalStatus = document.getElementById('financial-modal-status');
    const financialModalSaveButton = document.getElementById('financial-modal-save-button');
    const financialModalCloseButton = document.getElementById('financial-modal-close-button');
    let currentExcursionIdForFinancialModal = null;

    // Change Password Modal Elements (User's own password)
    const showChangePasswordModalBtn = document.getElementById('showChangePasswordModalBtn');
    const changePasswordModal = document.getElementById('changePasswordModal');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const cancelChangePasswordBtn = document.getElementById('cancelChangePasswordBtn');
    const changePasswordErrorP = document.getElementById('changePasswordError');
    const changePasswordSuccessP = document.getElementById('changePasswordSuccess');

    // Note: Admin changing other user's password will be handled within showFormAdminUsuario and saveAdminUsuario

    // Payment Confirmation Modal Elements
    const paymentConfirmationModal = document.getElementById('paymentConfirmationModal');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const paymentDateInput = document.getElementById('paymentDate');
    const confirmPaymentButton = document.getElementById('confirmPaymentButton');
    const cancelPaymentButton = document.getElementById('cancelPaymentButton');

    // State for payment modal
    let paymentModalState = {
        currentParticipationData: null,
        originalChangedElement: null,
        saveCallback: null,
        excursionCost: 0
    };

    async function fetchExcursionCost(excursionId) {
        if (!excursionId) {
            console.error("fetchExcursionCost: excursionId is undefined or null.");
            return 0; // Default cost if ID is invalid
        }
        try {
            const excursion = await apiFetch(`/excursiones/${excursionId}`);
            if (excursion && typeof excursion.coste_excursion_alumno === 'number') {
                return excursion.coste_excursion_alumno;
            } else {
                console.warn(`fetchExcursionCost: coste_excursion_alumno not found or not a number for excursionId ${excursionId}. Excursion data:`, excursion);
                return 0; // Default cost if not found or invalid format
            }
        } catch (error) {
            console.error(`fetchExcursionCost: Error fetching excursion details for excursionId ${excursionId}:`, error);
            return 0; // Default cost on error
        }
    }

    function showPaymentConfirmationModal(excursionCost, currentParticipationData, originalChangedElement, callback) {
        if (!paymentConfirmationModal || !paymentAmountInput || !paymentDateInput) {
            console.error("Payment confirmation modal elements not found.");
            return;
        }
        paymentModalState.currentParticipationData = currentParticipationData;
        paymentModalState.originalChangedElement = originalChangedElement;
        paymentModalState.saveCallback = callback;
        paymentModalState.excursionCost = excursionCost;

        paymentAmountInput.value = excursionCost > 0 ? excursionCost.toFixed(2) : (0).toFixed(2); // Default to 0 if cost is 0
        const today = new Date().toISOString().split('T')[0];
        paymentDateInput.value = today;

        paymentConfirmationModal.style.display = 'flex';
    }

    function closePaymentConfirmationModal() {
        if (paymentConfirmationModal) {
            paymentConfirmationModal.style.display = 'none';
        }
        // Clear stored data
        paymentModalState.currentParticipationData = null;
        paymentModalState.originalChangedElement = null;
        paymentModalState.saveCallback = null;
        paymentModalState.excursionCost = 0;
    }

    if (confirmPaymentButton) {
        confirmPaymentButton.addEventListener('click', async () => {
            if (!paymentModalState.currentParticipationData || !paymentModalState.saveCallback) {
                console.error("Missing data in payment modal state for confirm.");
                closePaymentConfirmationModal();
                return;
            }

            const amountPaid = parseFloat(paymentAmountInput.value);
            const datePaid = paymentDateInput.value;

            if (isNaN(amountPaid)) {
                alert("La cantidad pagada debe ser un número.");
                return;
            }
            if (paymentModalState.excursionCost > 0 && amountPaid <= 0) {
                alert("Para excursiones con coste, la cantidad pagada debe ser un número positivo.");
                return;
            }
            if (paymentModalState.excursionCost === 0 && amountPaid < 0) {
                alert("Para excursiones gratuitas, la cantidad pagada no puede ser negativa.");
                return;
            }
            if (!datePaid) {
                alert("La fecha de pago es obligatoria.");
                return;
            }

            // Update participation data
            paymentModalState.currentParticipationData.pago_realizado = (amountPaid >= paymentModalState.excursionCost) ? 'Sí' : 'Parcial';
            paymentModalState.currentParticipationData.cantidad_pagada = amountPaid;
            paymentModalState.currentParticipationData.fecha_pago = datePaid;

            // Autorizacion is already 'Sí' if we are here, ensure fecha_autorizacion is set
            if (!paymentModalState.currentParticipationData.fecha_autorizacion) {
                paymentModalState.currentParticipationData.fecha_autorizacion = new Date().toISOString().split('T')[0];
            }

            await paymentModalState.saveCallback(paymentModalState.currentParticipationData);
            closePaymentConfirmationModal();
        });
    }

    if (cancelPaymentButton) {
        cancelPaymentButton.addEventListener('click', () => {
            if (paymentModalState.originalChangedElement) {
                paymentModalState.originalChangedElement.value = 'No'; // Revert the select
                // If there's a visual feedback or state tied to this change elsewhere, it might need updating too.
                // For now, just reverting the select that triggered the modal.
            }
            closePaymentConfirmationModal();
        });
    }

    async function apiFetch(endpoint, method = 'GET', body = null, token = currentToken) {
        const url = `${API_BASE_URL}${endpoint}`;
    const headers = {}; // Initialize headers object
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const options = { method, headers };
        if (body && (method === 'POST' || method === 'PUT')) {
            if (body instanceof FormData) {
                options.body = body;
                // 'Content-Type' for FormData is set automatically by the browser
            } else {
                options.body = JSON.stringify(body);
                headers['Content-Type'] = 'application/json'; // Set Content-Type for JSON
            }
        }
        
        try {
            const response = await fetch(url, options);
            if (response.status === 204) return null; 
            
            const responseText = await response.text();
            let responseData;
            try {
                responseData = responseText ? JSON.parse(responseText) : {};
            } catch (e) {
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

    function handleAuthClick() { navigateTo('login'); }
    if (authButton) authButton.onclick = handleAuthClick;

    function handleLogout() {
        currentUser = null; currentToken = null;
        localStorage.removeItem('authToken'); localStorage.removeItem('userInfo');
        window.dashboardExcursions = []; 
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
        if (showChangePasswordModalBtn) showChangePasswordModalBtn.style.display = 'inline-block'; // Show change password button
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
        if (showChangePasswordModalBtn) showChangePasswordModalBtn.style.display = 'none'; // Hide change password button
        if (mainNavSidebar) mainNavSidebar.style.display = 'none';
        mainSections.forEach(s => { if (s) s.style.display = 'none'; });
        if(document.getElementById('excursion-calendar-container')) document.getElementById('excursion-calendar-container').innerHTML = ''; 
    }

    function adaptarMenuSegunRol() {
        if (!currentUser || !mainNavSidebar) return;
        const isAdmin = currentUser.rol === 'DIRECCION';
        const adminUsuariosLinkLi = mainNavSidebar.querySelector('a[data-section="admin-usuarios"]');
        if (adminUsuariosLinkLi) adminUsuariosLinkLi.parentElement.style.display = isAdmin ? 'list-item' : 'none';

        const importExportLinkLi = document.getElementById('nav-import-export');
        if (importExportLinkLi) {
            importExportLinkLi.style.display = (currentUser && currentUser.rol === 'DIRECCION') ? 'list-item' : 'none';
        }
        
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
                // Element for section not found, this could be an issue if the section is expected.
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

            // Existing mobile sidebar closing logic
            const isMobileView = window.innerWidth <= 768;
            if (isMobileView && sidebar && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                document.body.classList.remove('body-sidebar-open');
            }
            // No need to explicitly close desktop sidebar on nav link click,
            // as it's not an overlay. If desired, similar logic could be added.
        });
    });

    function loadContentForSection(sectionName) {
        if (sectionName === 'login' || !currentToken) return;
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
            case 'import-export': if (currentUser && currentUser.rol === 'DIRECCION') loadImportExportSection(); break;
            case 'tesoreria': 
                if (currentUser && (currentUser.rol === 'TESORERIA' || currentUser.rol === 'DIRECCION')) loadTesoreriaData();
                break;
        }
    }

    async function loadImportExportSection() {
        const contentDiv = document.getElementById('import-export-content');
        if (!contentDiv) {
            console.error("Error: El div 'import-export-content' no se encontró.");
            return;
        }
        // contentDiv.innerHTML = ''; // Clear previous content if any, though static HTML is fine for now

        // --- BEGIN: Logic for Import Data button ---
        const triggerImportBtn = document.getElementById('triggerImportDataBtn');
        const importDataFile = document.getElementById('importDataFile');
        const importDataUrl = document.getElementById('importDataUrl');
        const importDataStatus = document.getElementById('importDataStatus');

        if (triggerImportBtn && importDataFile && importDataUrl && importDataStatus) {
            // Clone and replace the button to remove old event listeners if this function can be called multiple times
            const newTriggerImportBtn = triggerImportBtn.cloneNode(true);
            triggerImportBtn.parentNode.replaceChild(newTriggerImportBtn, triggerImportBtn);

            newTriggerImportBtn.addEventListener('click', async () => {
                importDataStatus.textContent = ''; // Clear previous messages
                importDataStatus.style.color = 'inherit';

                const file = importDataFile.files[0];
                const url = importDataUrl.value.trim();

                if (file) {
                    importDataStatus.textContent = 'Importando desde archivo...';
                    const formData = new FormData();
                    formData.append('importFile', file);

                    try {
                        const response = await fetch('/api/direccion/import/all-data', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${currentToken}` },
                            body: formData
                        });
                        const result = await response.json();
                        if (response.ok) {
                            importDataStatus.style.color = 'green';
                            importDataStatus.textContent = 'Importación completada con éxito.';
                            alert('Importación completada. Por favor, recargue la página o navegue a las secciones relevantes para ver los cambios.');
                            // Consider which sections to reload or prompt user
                        } else {
                            throw result;
                        }
                    } catch (error) {
                        console.error('Error en la importación desde archivo:', error);
                        importDataStatus.style.color = 'red';
                        let detailedMsg = `Error: ${error.error || error.message || 'Desconocido'}. `;
                        if (error.summary) {
                            detailedMsg += `Resumen: ${JSON.stringify(error.summary, null, 2)}`;
                        } else if (error.missing_files) {
                            detailedMsg += `Archivos faltantes: ${error.missing_files.join(', ')}.`;
                        } else if (error.details) {
                            detailedMsg += `Detalles: ${error.details}.`;
                        }
                        importDataStatus.textContent = detailedMsg;
                    } finally {
                        importDataFile.value = '';
                        importDataUrl.value = '';
                    }
                } else if (url) {
                    importDataStatus.textContent = 'Importando desde URL...';
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        importDataStatus.style.color = 'red';
                        importDataStatus.textContent = 'URL inválida. Debe empezar con http:// o https://';
                        return;
                    }

                    try {
                        const response = await fetch('/api/direccion/import/all-data', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${currentToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ file_url: url })
                        });
                        const result = await response.json();
                        if (response.ok) {
                            importDataStatus.style.color = 'green';
                            importDataStatus.textContent = 'Importación desde URL completada con éxito.';
                            alert('Importación completada. Por favor, recargue la página o navegue a las secciones relevantes para ver los cambios.');
                        } else {
                            throw result;
                        }
                    } catch (error) {
                        console.error('Error en la importación desde URL:', error);
                        importDataStatus.style.color = 'red';
                        let detailedMsg = `Error: ${error.error || error.message || 'Desconocido'}. `;
                        if (error.summary) {
                            detailedMsg += `Resumen: ${JSON.stringify(error.summary, null, 2)}`;
                        } else if (error.missing_files) {
                            detailedMsg += `Archivos faltantes: ${error.missing_files.join(', ')}.`;
                        } else if (error.details) {
                            detailedMsg += `Detalles: ${error.details}.`;
                        }
                        importDataStatus.textContent = detailedMsg;
                    } finally {
                        importDataFile.value = '';
                        importDataUrl.value = '';
                    }
                } else {
                    importDataStatus.style.color = 'red';
                    importDataStatus.textContent = 'Por favor, selecciona un archivo ZIP o introduce una URL.';
                }
            });
        }
        // --- END: Logic for Import Data button ---

        // --- BEGIN: Logic for "Exportar Todos los Datos" button ---
        // Note: The button ID is 'exportAllDataBtn' as it was in the dashboard backup section
        const exportButton = document.getElementById('exportAllDataBtn');

        if (currentUser && currentUser.rol === 'DIRECCION' && exportButton) {
            // Clone and replace to ensure no old listeners if this function is called multiple times
            const newExportButton = exportButton.cloneNode(true);
            exportButton.parentNode.replaceChild(newExportButton, exportButton);

            newExportButton.addEventListener('click', async () => {
                const token = localStorage.getItem('authToken'); // currentToken should also be available
                if (!token) {
                    alert('Error de autenticación. Por favor, inicia sesión de nuevo.');
                    return;
                }

                newExportButton.disabled = true;
                newExportButton.textContent = 'Exportando...';

                try {
                    const response = await fetch('/api/direccion/export/all-data', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (!response.ok) {
                        let errorMsg = response.statusText;
                        try {
                            const errData = await response.json();
                            errorMsg = errData.error || errorMsg;
                        } catch (e) { /* Ignore parsing error */ }
                        throw new Error(errorMsg);
                    }

                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = 'export_gestion_escolar.zip';
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                        if (filenameMatch && filenameMatch.length > 1) {
                            filename = filenameMatch[1];
                        }
                    }

                    const blob = await response.blob();
                    const fileUrl = window.URL.createObjectURL(blob); // Renamed to avoid conflict with outer scope `url`
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = fileUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(fileUrl);
                    document.body.removeChild(a);
                    alert('Datos exportados correctamente como ' + filename);

                } catch (error) {
                    console.error('Error al exportar datos:', error);
                    alert('Error al exportar datos: ' + error.message);
                } finally {
                    newExportButton.disabled = false;
                    newExportButton.textContent = 'Exportar Todos los Datos';
                }
            });
        }
        // --- END: Logic for "Exportar Todos los Datos" button ---
    }


    async function loadDashboardData() {
        if (!dashboardSummaryContentDiv) return;
        if (!currentToken) {
            dashboardSummaryContentDiv.innerHTML = '<p class="error-message">Error de sesión.</p>';
            return;
        }

        dashboardSummaryContentDiv.innerHTML = "<p>Cargando resumen...</p>";
        
        try {
            const excursionsData = await apiFetch('/excursiones');
            window.dashboardExcursions = excursionsData && excursionsData.excursiones ? excursionsData.excursiones : [];
        } catch (error) {
            window.dashboardExcursions = [];
            dashboardSummaryContentDiv.innerHTML += '<p class="error-message">No se pudieron cargar las excursiones para el calendario.</p>';
        }

        if (typeof renderExcursionCalendar === 'function' && document.getElementById('excursion-calendar-container')) {
            renderExcursionCalendar(currentCalendarYear, currentCalendarMonth, window.dashboardExcursions || []);
        }

        try {
            const data = await apiFetch('/dashboard/summary');
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
                    data.proximasExcursiones.forEach(ex => html += `<li><a href="#" class="excursion-detail-link" data-excursion-id="${ex.id}" data-excursion-nombre="${ex.nombre_excursion}">${ex.nombre_excursion}</a> (${ex.fecha_excursion || 'N/D'}) - ${ex.participating_scope_name || 'Scope N/A'}</li>`);
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
                    data.proximasExcursiones.forEach(ex => html += `<li><a href="#" class="excursion-detail-link" data-excursion-id="${ex.id}" data-excursion-nombre="${ex.nombre_excursion}">${ex.nombre_excursion}</a> (${ex.fecha_excursion || 'N/D'}) - ${ex.participating_scope_name || 'Scope N/A'}</li>`);
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

            // Add event listeners for new dashboard links behavior
            dashboardSummaryContentDiv.querySelectorAll('.excursion-detail-link').forEach(link => {
                link.addEventListener('click', function(event) {
                    event.preventDefault();
                    const excursionId = this.dataset.excursionId;
                    const excursionName = this.dataset.excursionNombre; // Get the name from the new data attribute
                    if (excursionId && excursionName) {
                        sessionStorage.setItem('filtroParticipacionesExcursionId', excursionId);
                        sessionStorage.setItem('filtroParticipacionesNombreExcursion', excursionName);
                        navigateTo('participaciones');
                    } else {
                        console.error('Excursion ID or Name not found on link.', this);
                        // Optionally show an error to the user
                    }
                });
            });

        } catch (error) {
            if (dashboardSummaryContentDiv) dashboardSummaryContentDiv.innerHTML = `<p class="error-message">Error al cargar el resumen: ${error.message}</p>`;
        }
        
        // The export UI and its logic have been moved to loadImportExportSection.
        // No specific visibility control for a backup section is needed here anymore.
    }

    let listaDeClasesGlobal = []; 
    async function showFormClase(idClase = null, nombreExistente = '', tutorIdExistente = '') {
        const formClaseWrapper = document.getElementById('formClaseWrapper');
        if (!formClaseWrapper) return;
    
        let tutoresDisponibles = [];
        try {
            const dataUsuarios = await apiFetch('/usuarios'); 
            if (dataUsuarios && dataUsuarios.usuarios) {
                tutoresDisponibles = dataUsuarios.usuarios.filter(u => u.rol === 'TUTOR');
            }
        } catch (error) {
             // Error will be shown by showGlobalError if not caught by apiFetch's specific handling
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
                        <button type="submit" class="success"><i class="fas ${idClase ? 'fa-save' : 'fa-plus'}"></i> ${idClase ? 'Guardar Cambios' : 'Crear Clase'}</button>
                        <button type="button" id="btnCancelarFormClase" class="secondary"><i class="fas fa-times"></i> Cancelar</button>
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
            listaDeClasesGlobal = data.clases || []; 
            let html = '<h3>Listado de Clases</h3>';
        if (currentUser.rol === 'DIRECCION') html += `<button id="btnShowFormNuevaClase" class="success" style="margin-bottom:15px;"><i class="fas fa-plus"></i> Añadir Nueva Clase</button>`;
            html += `<table class="tabla-datos"><thead><tr><th>Nombre Clase</th><th>Tutor Asignado</th><th>Email Tutor</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.clases && data.clases.length > 0) {
                data.clases.forEach(clase => {
                    html += `<tr data-clase-id="${clase.id}"><td>${clase.nombre_clase}</td><td>${clase.nombre_tutor || '<em>No asignado</em>'}</td><td>${clase.email_tutor || '<em>N/A</em>'}</td><td class="actions-cell">
                    <button class="view-alumnos-clase secondary" data-claseid="${clase.id}" data-nclase="${clase.nombre_clase}"><i class="fas fa-users"></i> Ver Alumnos</button>
                    ${currentUser.rol === 'DIRECCION' ? `<button class="edit-clase warning" data-id="${clase.id}" data-nombre="${clase.nombre_clase}" data-tutorid="${clase.tutor_id || ''}"><i class="fas fa-edit"></i> Editar</button> <button class="delete-clase danger" data-id="${clase.id}" data-nombre="${clase.nombre_clase}"><i class="fas fa-trash-alt"></i> Eliminar</button>` : ''}
                        </td></tr>`;});
            } else html += '<tr><td colspan="4" style="text-align:center;">No hay clases registradas.</td></tr>';
            html += '</tbody></table><div id="formClaseWrapper" class="form-wrapper" style="margin-top:20px;"></div>';
            clasesContentDiv.innerHTML = html;
            if(document.getElementById('btnShowFormNuevaClase')) document.getElementById('btnShowFormNuevaClase').onclick = () => showFormClase();
            clasesContentDiv.querySelectorAll('.edit-clase').forEach(b => b.onclick=(e)=>showFormClase(e.target.dataset.id, e.target.dataset.nombre, e.target.dataset.tutorid));
            clasesContentDiv.querySelectorAll('.delete-clase').forEach(b => b.onclick=(e)=>deleteClase(e.target.dataset.id, e.target.dataset.nombre));
            clasesContentDiv.querySelectorAll('.view-alumnos-clase').forEach(b => b.onclick=(e)=>{ sessionStorage.setItem('filtroAlumnosClaseId',e.target.dataset.claseid); sessionStorage.setItem('filtroAlumnosNombreClase',e.target.dataset.nclase); navigateTo('alumnos'); });
        } catch (error) { 
            if (clasesContentDiv) clasesContentDiv.innerHTML = `<p class="error-message">Error al cargar clases: ${error.message}</p>`; 
        }
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

    async function showFormAlumno(idAlumno = null, alumnoData = null, defaultClaseId = null) {
        let currentFormWrapper = document.getElementById('formAlumnoWrapper'); 
        if (!currentFormWrapper) return;

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
                    <div class="form-buttons"><button type="submit" class="success" ${selectDisabled && !claseIdExistente ? 'disabled' : ''}><i class="fas ${idAlumno ? 'fa-save' : 'fa-user-plus'}"></i> ${idAlumno ? 'Guardar Cambios' : 'Crear Alumno'}</button><button type="button" id="btnCancelarFormAlumno" class="secondary"><i class="fas fa-times"></i> Cancelar</button></div>
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
            // e.target.result will be an ArrayBuffer
            const arrayBuffer = e.target.result;

            const formData = new FormData();
            formData.append('clase_id', clase_id_para_api);
            // Append the file itself (which contains the ArrayBuffer).
            // The backend (e.g., using multer) will handle reading the ArrayBuffer from the file.
            formData.append('csvFile', file);

            try {
                // Send FormData directly. apiFetch will handle not setting Content-Type.
                const resultado = await apiFetch('/alumnos/importar_csv', 'POST', formData);
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
        reader.readAsArrayBuffer(file); // Changed from readAsText
    }
    async function loadAlumnos(claseIdFiltroExterno = null, nombreClaseFiltroExterno = null) {
        if (!alumnosContentDiv || !currentToken) return;
        alumnosContentDiv.innerHTML = "<p>Cargando alumnos...</p>";
        const importCsvHtml = `<div id="import-alumnos-csv-container" style="padding:15px;border:1px solid #eee;margin-bottom:20px;background-color:#f9f9f9;border-radius:5px;"><h4>Importar Alumnos CSV</h4><form id="formImportarAlumnosCSV"><div><label for="csvClaseDestino">Clase Destino:</label><select id="csvClaseDestino" required></select></div><div><label for="csvFileAlumnos">Archivo CSV ("Apellidos, Nombre", UTF-8):</label><input type="file" id="csvFileAlumnos" accept=".csv" required></div><div class="form-buttons" style="justify-content:flex-start;margin-top:10px;"><button type="submit" class="success"><i class="fas fa-file-import"></i> Importar</button></div></form><div id="importAlumnosStatus" style="margin-top:10px;"></div></div><hr style="margin:20px 0;">`;
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
                 htmlTablaAlumnos += `<button onclick="sessionStorage.removeItem('filtroAlumnosClaseId'); sessionStorage.removeItem('filtroAlumnosNombreClase'); loadAlumnos();" class="secondary" style="margin-bottom:15px;"><i class="fas fa-list-ul"></i> Mostrar Todos</button>`;
            }
            if (currentUser.rol === 'DIRECCION' || (currentUser.rol === 'TUTOR' && currentUser.claseId)) {
                htmlTablaAlumnos += `<button id="btnShowFormNuevoAlumno" class="success" style="margin-bottom:15px;"><i class="fas fa-user-plus"></i> Añadir Alumno</button>`;
            }
            // Added wrapper div for table horizontal scrolling
            htmlTablaAlumnos += `<div style="width: 100%; overflow-x: auto;"><table class="tabla-datos"><thead><tr><th>Nombre</th><th>Clase</th><th>Acciones</th></tr></thead><tbody>`;
            if (dataAlumnos.alumnos && dataAlumnos.alumnos.length > 0) {
                dataAlumnos.alumnos.forEach(a => { 
                    htmlTablaAlumnos += `<tr data-alumno-id="${a.id}"><td>${a.nombre_completo}</td><td>${a.nombre_clase}</td><td class="actions-cell">
                        <button class="edit-alumno warning" data-id="${a.id}"><i class="fas fa-user-edit"></i> Editar</button>
                        <button class="delete-alumno danger" data-id="${a.id}" data-nombre="${a.nombre_completo}"><i class="fas fa-user-times"></i> Eliminar</button>
                        </td></tr>`; 
                });
            } else { htmlTablaAlumnos += `<tr><td colspan="3" style="text-align:center;">No hay alumnos.</td></tr>`; }
            htmlTablaAlumnos += `</tbody></table></div><div id="formAlumnoWrapper" class="form-wrapper"></div>`; // Close wrapper div
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

    async function showFormExcursion(idExcursion = null, excursionData = {}, defaultParaClaseId = null) {
        let currentFormWrapper = document.getElementById('formExcursionWrapper'); 
         if (!currentFormWrapper) return; 

        let paraClaseIdActual = excursionData.para_clase_id !== undefined ? excursionData.para_clase_id : defaultParaClaseId;
        if (!idExcursion && currentUser.rol === 'TUTOR' && paraClaseIdActual === null) {
            paraClaseIdActual = "ciclo"; 
        } else if (idExcursion && excursionData.para_clase_id === null && currentUser.rol === 'TUTOR') {
            paraClaseIdActual = "ciclo"; 
        }


        let opcionesClasesHtml = '';
        let selectDisabled = false;

        if (currentUser.rol === 'DIRECCION') {
             if (listaDeClasesGlobal.length === 0) { 
                try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) { /* Error handled by showGlobalError */ }
            }
            opcionesClasesHtml = `<option value="" ${paraClaseIdActual === null || paraClaseIdActual === "" ? 'selected' : ''}>-- Global (para todas las clases) --</option>`;
            listaDeClasesGlobal.forEach(clase => {
                opcionesClasesHtml += `<option value="${clase.id}" ${paraClaseIdActual == clase.id ? 'selected' : ''}>${clase.nombre_clase}</option>`;
            });
        } else if (currentUser.rol === 'TUTOR') {
            opcionesClasesHtml = ''; 
            opcionesClasesHtml += `<option value="ciclo" ${paraClaseIdActual === "ciclo" ? 'selected' : ''}>Mi Ciclo (Todas las clases de mi ciclo)</option>`;

            if (!currentUser.claseId) {
                 // Tutor sin clase solo puede seleccionar "Mi Ciclo" (que será global)
            } else {
                 if (listaDeClasesGlobal.length === 0) {
                    try {
                        const dataTodasClases = await apiFetch('/clases');
                        listaDeClasesGlobal = dataTodasClases.clases || [];
                    } catch (error) { /* Error handled by showGlobalError */ }
                }
                
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
                    <div class="form-buttons"><button type="submit" class="success"><i class="fas ${idExcursion ? 'fa-save' : 'fa-plus'}"></i> ${idExcursion ? 'Guardar Cambios' : 'Crear Excursión'}</button><button type="button" id="btnCancelarFormExcursion" class="secondary"><i class="fas fa-times"></i> Cancelar</button></div>
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
            if (selectedValue === "ciclo" || selectedValue === "") { 
                para_clase_id_valor = null;
            } else {
                para_clase_id_valor = parseInt(selectedValue);
            }
        } else { 
             const originalExcursionData = excursionId ? JSON.parse(sessionStorage.getItem(`editExcursionData_${excursionId}`) || '{}') : {};
             para_clase_id_valor = originalExcursionData.para_clase_id !== undefined ? originalExcursionData.para_clase_id : null;
             if (currentUser.rol === 'TUTOR' && !excursionId && currentUser.claseId) { 
                para_clase_id_valor = null; 
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
            acceptButton.innerHTML = '<i class="fas fa-check"></i> Aceptar';
            acceptButton.className = 'success';
    
            const cancelButton = document.createElement('button');
            cancelButton.id = 'dupExcursionCancel';
            cancelButton.innerHTML = '<i class="fas fa-times"></i> Cancelar';
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
            acceptButton.innerHTML = '<i class="fas fa-check"></i> Aceptar';
        acceptButton.className = 'success';
        if (tutoresDisponibles.length === 0) acceptButton.disabled = true;
    
        const cancelButton = document.createElement('button');
        cancelButton.id = 'shareExcursionCancel';
            cancelButton.innerHTML = '<i class="fas fa-times"></i> Cancelar';
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
                html += `<button id="btnShowFormNuevaExcursion" class="success" style="margin-bottom:15px;"><i class="fas fa-plus"></i> Crear Excursión</button>`;
            }
            // Added wrapper div for table horizontal scrolling
            html += `<div style="width: 100%; overflow-x: auto;"><table class="tabla-datos"><thead><tr><th>Nombre</th><th>Fecha</th><th>Lugar</th><th>Clase Destino</th><th>Creador</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.excursiones && data.excursiones.length > 0) {
                data.excursiones.forEach(ex => {
                    let accionesHtml = `<button class="view-participaciones secondary" data-excursionid="${ex.id}" data-excursionnombre="${ex.nombre_excursion}"><i class="fas fa-users"></i> Participaciones</button>`;
                    
                    if (currentUser.rol === 'DIRECCION' || (currentUser.rol === 'TUTOR' && ex.creada_por_usuario_id === currentUser.id) || (currentUser.rol === 'TUTOR' && ex.para_clase_id === currentUser.claseId) ) {
                        accionesHtml += ` <button class="edit-excursion warning" data-id="${ex.id}"><i class="fas fa-edit"></i> Editar</button>`;
                        accionesHtml += ` <button class="delete-excursion danger" data-id="${ex.id}" data-nombre="${ex.nombre_excursion}"><i class="fas fa-trash-alt"></i> Eliminar</button>`;
                    }
                     if (currentUser.rol === 'DIRECCION' || currentUser.rol === 'TUTOR') { 
                        accionesHtml += ` <button class="duplicate-excursion info" data-id="${ex.id}" data-nombre="${ex.nombre_excursion}" data-original-clase-id="${ex.para_clase_id === null ? 'null' : ex.para_clase_id}"><i class="fas fa-copy"></i> Duplicar</button>`;
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
                         accionesHtml += ` <button class="share-excursion primary" data-id="${ex.id}" data-nombre="${ex.nombre_excursion}"><i class="fas fa-share-alt"></i> Compartir</button>`;
                    }
                    // Add new button for Info General PDF
                    if (currentUser.rol === 'DIRECCION' || currentUser.rol === 'TUTOR' || currentUser.rol === 'TESORERIA' || currentUser.rol === 'COORDINACION') {
                        accionesHtml += ` <button class="download-info-general-pdf info" data-excursion-id="${ex.id}" data-excursion-nombre="${ex.nombre_excursion}"><i class="fas fa-file-pdf"></i> Info PDF</button>`;
                    }
            html += `<tr data-excursion-id="${ex.id}"><td>${ex.nombre_excursion}</td><td>${ex.fecha_excursion}</td><td>${ex.lugar}</td><td>${ex.nombre_clase_destino || '<em>Global</em>'}</td><td>${ex.nombre_creador}</td><td class="actions-cell">${accionesHtml}</td></tr>`;

                });
            } else { html += '<tr><td colspan="6" style="text-align:center;">No hay excursiones.</td></tr>'; }
            html += `</tbody></table></div>`; // Close wrapper div
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

            // Event listener for the new "Info General PDF" buttons
            excursionesContentDiv.querySelectorAll('.download-info-general-pdf').forEach(button => {
                button.addEventListener('click', async function() {
                    const excursionId = this.dataset.excursionId;
                    const excursionNombre = this.dataset.excursionNombre;
                    const apiUrl = `${API_BASE_URL}/excursiones/${excursionId}/info_pdf`;

                    try {
                        const response = await fetch(apiUrl, {
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${currentToken}` }
                        });

                        if (response.ok) {
                            const blob = await response.blob();
                            const downloadUrl = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = downloadUrl;
                            a.download = `Info_Excursion_${excursionNombre.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(downloadUrl);
                            a.remove();
                        } else {
                            const errorData = await response.json();
                            showGlobalError(errorData.error || `Error ${response.status} al generar el PDF de información general.`);
                        }
                    } catch (err) {
                        showGlobalError(`Error de red o conexión al generar PDF de información general: ${err.message}`);
                    }
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
    
    async function loadPendingShares() {
        const contentDiv = document.getElementById('shared-excursions-content');
        if (!contentDiv) return;

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

    async function loadParticipaciones() { 
        if (!participacionesContentDiv) return;
        participacionesContentDiv.innerHTML = "<p>Cargando participaciones...</p>";
        
        let selectExcursionesHtml = '<option value="">-- Selecciona excursión --</option>';
        let allExcursionsData = []; // To store fetched excursions data for validation

        try {
            const dataExcursionesFetched = await apiFetch('/excursiones'); // Fetch excursions first
            allExcursionsData = dataExcursionesFetched.excursiones || [];
            allExcursionsData.forEach(ex => {
                selectExcursionesHtml += `<option value="${ex.id}">${ex.nombre_excursion} (${new Date(ex.fecha_excursion).toLocaleDateString()})</option>`;
            });
        } catch (error) { 
            selectExcursionesHtml = '<option value="">Error cargando excursiones</option>'; 
        }

        let filtroClaseHtml = '';
        if (currentUser.rol === 'DIRECCION') {
            filtroClaseHtml = `<label for="selectFiltroClaseParticipaciones">Filtrar Clase:</label><select id="selectFiltroClaseParticipaciones"><option value="">-- Todas --</option>`;
            if (listaDeClasesGlobal.length === 0) {
                 try {
                    const dataClases = await apiFetch('/clases');
                    listaDeClasesGlobal = dataClases.clases || [];
                } catch (error) { /* Error handled by showGlobalError */ }
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
        const filtroClaseSelectElement = document.getElementById('selectFiltroClaseParticipaciones');

        if (selectExcursion) {
            selectExcursion.onchange = (e) => {
                const selectedExId = e.target.value;
                if (selectedExId) {
                    const selectedExNombre = e.target.options[e.target.selectedIndex].text;
                    // Store for persistence if user navigates away and back via menu (optional, can be removed if not desired)
                    // sessionStorage.setItem('lastSelectedExcursionIdParticipaciones', selectedExId);
                    // sessionStorage.setItem('lastSelectedExcursionNameParticipaciones', selectedExNombre);
                    renderTablaParticipaciones(selectedExId, selectedExNombre);
                } else {
                    // sessionStorage.removeItem('lastSelectedExcursionIdParticipaciones');
                    // sessionStorage.removeItem('lastSelectedExcursionNameParticipaciones');
                    if(tablaContainer) tablaContainer.innerHTML = '<p>Selecciona una excursión para ver las participaciones.</p>';
                    if(resumenContainer) resumenContainer.innerHTML = '';
                }
            };
        }
        
        if (filtroClaseSelectElement) {
            filtroClaseSelectElement.onchange = () => {
                const currentSelectedExcursionId = selectExcursion ? selectExcursion.value : null;
                if (currentSelectedExcursionId) { 
                    const currentSelectedExcursionName = selectExcursion.options[selectExcursion.selectedIndex].text;
                    renderTablaParticipaciones(currentSelectedExcursionId, currentSelectedExcursionName);
                }
            };
        }

        const excursionIdFromSession = sessionStorage.getItem('filtroParticipacionesExcursionId');
        const nombreExcursionFromSession = sessionStorage.getItem('filtroParticipacionesNombreExcursion');

        if (excursionIdFromSession && selectExcursion) {
            const isValidSessionId = Array.from(selectExcursion.options).some(opt => opt.value === excursionIdFromSession);
            if (isValidSessionId) {
                selectExcursion.value = excursionIdFromSession;
                const nombreToUse = nombreExcursionFromSession || (selectExcursion.options[selectExcursion.selectedIndex] ? selectExcursion.options[selectExcursion.selectedIndex].text : 'Excursión');
                renderTablaParticipaciones(excursionIdFromSession, nombreToUse);

                sessionStorage.removeItem('filtroParticipacionesExcursionId');
                sessionStorage.removeItem('filtroParticipacionesNombreExcursion');
            } else {
                 console.warn('Excursion ID from session not found in dropdown, clearing session items.');
                 sessionStorage.removeItem('filtroParticipacionesExcursionId');
                 sessionStorage.removeItem('filtroParticipacionesNombreExcursion');
                 if(tablaContainer) tablaContainer.innerHTML = '<p>Por favor, seleccione una excursión de la lista.</p>';
                 if(resumenContainer) resumenContainer.innerHTML = '';
            }
        } else {
            if(tablaContainer) tablaContainer.innerHTML = '<p>Por favor, seleccione una excursión de la lista para ver las participaciones.</p>';
            if(resumenContainer) resumenContainer.innerHTML = '';
        }
    }

    async function renderTablaParticipaciones(excursionId, excursionNombre) {
        const container = document.getElementById('tablaParticipacionesContainer');
        const resumenContainer = document.getElementById('resumenParticipacionesContainer');
        if (!container || !resumenContainer) return;

        container.innerHTML = `<p>Cargando para "${excursionNombre}"...</p>`;
        resumenContainer.innerHTML = '';

        try {
            // Fetch excursion details first to know its scope (para_clase_id)
            const excursionDetails = await apiFetch(`/excursiones/${excursionId}`);
            if (!excursionDetails) {
                container.innerHTML = `<p class="error-message">No se pudieron cargar los detalles de la excursión.</p>`;
                return;
            }

            let endpoint = `/excursiones/${excursionId}/participaciones`;
            const filtroClaseSelectElement = document.getElementById('selectFiltroClaseParticipaciones');
            let viewClaseId = null;

            if ((currentUser.rol === 'DIRECCION' || currentUser.rol === 'TESORERIA') && filtroClaseSelectElement && filtroClaseSelectElement.value) {
                viewClaseId = filtroClaseSelectElement.value;
            }

            if (viewClaseId) {
                endpoint += `?view_clase_id=${viewClaseId}`;
            }

            const data = await apiFetch(endpoint);
            currentParticipacionesDataArray = data.alumnosParticipaciones || []; // Populate global variable
            if (!data || !data.alumnosParticipaciones) {
                container.innerHTML = `<tr><td colspan="11">Error cargando participaciones.</td></tr>`;
                return;
            }

            const r = data.resumen;
            let resumenHtml = `<h4>Resumen: "${excursionNombre}"</h4><div class="resumen-grid">
                <div>Total: ${r.totalAlumnos}</div><div>Autorización: Sí ${r.totalConAutorizacionFirmadaSi} | No ${r.totalConAutorizacionFirmadaNo}</div>
                <div>Pago: Pagado ${r.totalAlumnosPagadoGlobal} | Parcial ${r.totalConPagoRealizadoParcial} | No ${r.totalConPagoRealizadoNo}</div>
                <div>Recaudado: ${r.sumaTotalCantidadPagadaGlobal.toFixed(2)} €</div></div>`;
            
            if (currentUser.rol === 'TUTOR' || currentUser.rol === 'DIRECCION' || currentUser.rol === 'TESORERIA') {
                resumenHtml += `<button id="btnGenerarReportePagos" data-excursion-id="${excursionId}" data-excursion-nombre="${excursionNombre}" class="info" style="margin-top: 10px; margin-bottom: 10px;"><i class="fas fa-file-pdf"></i> Listado Asistencia/Justificantes (PDF)</button>`;
            }

            if (r.resumenPorClase && r.resumenPorClase.length > 0) {
                resumenHtml += `<h5>Detalle Clase:</h5><table class="tabla-datos tabla-resumen-clase"><thead><tr><th>Clase</th><th>Alumnos</th><th>Pagado</th><th>Recaudado (€)</th></tr></thead><tbody>`;
                r.resumenPorClase.forEach(rc => resumenHtml += `<tr><td>${rc.nombre_clase}</td><td>${rc.alumnosEnClase}</td><td>${rc.totalAlumnosPagadoEnClase}</td><td>${rc.sumaTotalCantidadPagadaEnClase.toFixed(2)}</td></tr>`);
                resumenHtml += `</tbody></table>`;
            }
            resumenContainer.innerHTML = resumenHtml;

            if (document.getElementById('btnGenerarReportePagos')) {
                document.getElementById('btnGenerarReportePagos').addEventListener('click', async function() {
                    const exId = this.dataset.excursionId;
                    const exNombre = this.dataset.excursionNombre;
                    let urlApiReporte = `${API_BASE_URL}/excursiones/${exId}/participaciones/reporte_pagos`;
                    let params = new URLSearchParams();

                    // Fetch fresh excursion details to check para_clase_id for report generation logic
                    const currentExcursionDetailsForReport = await apiFetch(`/excursiones/${exId}`);

                    if ((currentUser.rol === 'DIRECCION' || currentUser.rol === 'TESORERIA') && currentExcursionDetailsForReport.para_clase_id === null) {
                        const filtroClaseSelect = document.getElementById('selectFiltroClaseParticipaciones');
                        if (filtroClaseSelect && filtroClaseSelect.value) {
                            params.append('view_clase_id', filtroClaseSelect.value);
                        }
                    }
                    // For Tutors on global excursions, backend handles their class scope.
                    // For specific class excursions, backend handles the scope.

                    if (params.toString()) {
                        urlApiReporte += `?${params.toString()}`;
                    }

                    try {
                        const response = await fetch(urlApiReporte, {
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${currentToken}` }
                        });

                        if (response.ok) {
                            const blob = await response.blob();
                            const downloadUrl = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = downloadUrl;
                            a.download = `Listado_Asistencia_${exNombre.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(downloadUrl);
                            a.remove();
                        } else {
                            const errorData = await response.json();
                            showGlobalError(errorData.error || `Error ${response.status} al generar el PDF.`);
                        }
                    } catch (err) {
                        showGlobalError(`Error de red o conexión al generar PDF: ${err.message}`);
                    }
                });
            }

            // Added wrapper div for table horizontal scrolling
            let html = `<h4>Participantes: ${excursionNombre}</h4><div style="width: 100%; overflow-x: auto;"><table class="tabla-datos tabla-participaciones"><thead><tr><th>Alumno</th><th>Clase</th><th>Autorización</th><th>Fecha Aut.</th><th>Pago</th><th>Cantidad (€)</th><th>Fecha Pago</th><th>Notas</th><th class="status-column">Estado</th><th>Acciones</th></tr></thead><tbody>`;
            if (data.alumnosParticipaciones.length > 0) {
                data.alumnosParticipaciones.forEach(ap => {
                    const esCampoDeshabilitado = ap.autorizacion_firmada === 'Sí' && ap.fecha_autorizacion;
                    let accionesParticipacionHtml = '';
                    if (ap.participacion_id && (currentUser.rol === 'DIRECCION' || currentUser.rol === 'TUTOR')) {
                        // Changed button class, icon, and text for "Resetear"
                        accionesParticipacionHtml = `<button class="btn-resetear-participacion danger" data-participacion-id="${ap.participacion_id}" data-alumno-nombre="${ap.nombre_completo}"><i class="fas fa-undo"></i> Resetear</button>`;
                    }

                    const excursionDate = new Date(excursionDetails.fecha_excursion);
                    const currentDate = new Date();
                    currentDate.setHours(0,0,0,0);
                    excursionDate.setHours(0,0,0,0);

                    const puedeModificarAsistenciaDirectamente = currentUser.rol === 'TUTOR' && currentDate >= excursionDate && ap.autorizacion_firmada === 'Sí';

                    let studentNameDisplayHtml = '';
                    const iconHtml = ap.asistencia === 'Sí'
                        ? `<i class="fas fa-check-circle" style="color: green; margin-right: 5px;"></i>`
                        : `<i class="far fa-circle" style="color: #ccc; margin-right: 5px;"></i>`;

                    if (puedeModificarAsistenciaDirectamente) {
                        studentNameDisplayHtml = `<span class="attendance-toggle" data-alumno-id="${ap.alumno_id}" data-excursion-id="${excursionId}" style="cursor: pointer;" title="Clic para cambiar asistencia">${iconHtml}${ap.nombre_completo}</span>`;
                    } else {
                        studentNameDisplayHtml = `${iconHtml}${ap.nombre_completo}`;
                    }

                    html += `<tr data-participacion-id="${ap.participacion_id || ''}" data-alumno-id="${ap.alumno_id}" data-current-asistencia="${ap.asistencia || 'Pendiente'}">
                        <td>${studentNameDisplayHtml}</td><td>${ap.nombre_clase}</td>
                        <td><select class="participacion-field-edit" data-field="autorizacion_firmada" ${esCampoDeshabilitado?'disabled':''}><option value="No" ${ap.autorizacion_firmada==='No'?'selected':''}>No</option><option value="Sí" ${ap.autorizacion_firmada==='Sí'?'selected':''}>Sí</option></select></td>
                        <td><input type="date" class="participacion-field-edit" data-field="fecha_autorizacion" value="${ap.fecha_autorizacion||''}" ${esCampoDeshabilitado?'disabled':''}></td>
                        <td><select class="participacion-field-edit" data-field="pago_realizado"><option value="No" ${ap.pago_realizado==='No'?'selected':''}>No</option><option value="Parcial" ${ap.pago_realizado==='Parcial'?'selected':''}>Parcial</option><option value="Sí" ${ap.pago_realizado==='Sí'?'selected':''}>Sí</option></select></td>
                        <td><input type="number" step="0.01" class="participacion-field-edit" data-field="cantidad_pagada" value="${ap.cantidad_pagada||0}" min="0" style="width:70px;"></td>
                        <td><input type="date" class="participacion-field-edit" data-field="fecha_pago" value="${ap.fecha_pago||''}"></td>
                        <td><textarea class="participacion-field-edit" data-field="notas_participacion" rows="1">${ap.notas_participacion||''}</textarea></td>
                        <td class="status-message-cell"></td>
                        <td class="actions-cell">${accionesParticipacionHtml}</td></tr>`;
                });
            } else { html += `<tr><td colspan="11" style="text-align:center;">No hay alumnos con participación registrada o la clase seleccionada no tiene alumnos.</td></tr>`; }
            html += `</tbody></table></div>`; // Close wrapper div
            container.innerHTML = html;

            // Event listener for editing fields
            // Event listener for editing fields (excluding attendance-toggle handled by delegatedTableClickHandler)
            container.querySelectorAll('.participacion-field-edit:not([data-field="asistencia"])').forEach(input => {
                const eventType = (input.tagName === 'SELECT' || input.type === 'date') ? 'change' : 'blur';
                input.addEventListener(eventType, (e) => {
                     saveParticipacionOnFieldChange(e.target, excursionId);
                });
            });

            // Event delegation for delete buttons AND attendance toggle
            // Remove any old listener before adding a new one to prevent multiple executions
            // Store the handler reference on the container to be able to remove it
            if (container._delegatedClickHandler) {
                container.removeEventListener('click', container._delegatedClickHandler);
            }

            container._delegatedClickHandler = async function(event) {
                // `this` refers to `container`
                const currentExcursionId = excursionId; // Capture excursionId from outer scope for this handler instance

                // Handle attendance toggle
                const attendanceToggleTarget = event.target.closest('.attendance-toggle');
                if (attendanceToggleTarget) {
                    await handleAttendanceToggleClick(event, currentExcursionId);
                    return;
                }

                // Handle reset participation (formerly delete)
                const resetButtonTarget = event.target.closest('.btn-resetear-participacion');
                if (resetButtonTarget) {
                    const button = resetButtonTarget;
                    const participacionId = button.dataset.participacionId;
                    const alumnoNombre = button.dataset.alumnoNombre;
                    const trElement = button.closest('tr');
                    const statusCell = trElement ? trElement.querySelector('.status-message-cell') : null;

                    // Updated confirmation message for reset
                    if (confirm(`¿Está seguro de que desea resetear la participación de ${alumnoNombre} (justificante, pago, asistencia, etc.)? Los datos introducidos se borrarán y el estado volverá a ser el inicial.`)) {
                        if(statusCell) showTemporaryStatusInCell(statusCell, "Reseteando...", false, null);
                        try {
                            // API call is still DELETE, but server-side logic is now UPDATE (reset)
                            const resetResult = await apiFetch(`/participaciones/${participacionId}`, 'DELETE');
                            // Updated success message
                            showGlobalError(`Participación de ${alumnoNombre} reseteada exitosamente.`, document.getElementById('resumenParticipacionesContainer'));

                            // The API now returns the updated (reset) participation.
                            // We need to update currentParticipacionesDataArray and re-render.
                            if (resetResult && resetResult.participacion) {
                                const index = currentParticipacionesDataArray.findIndex(p => p.participacion_id === resetResult.participacion.id);
                                if (index !== -1) {
                                     // Need to merge with existing alumno details as resetResult.participacion only contains participation fields
                                    currentParticipacionesDataArray[index] = {
                                        ...currentParticipacionesDataArray[index], // Keep alumno details like nombre_completo, nombre_clase
                                        ...resetResult.participacion // Overwrite with reset participation fields
                                    };
                                }
                            }

                            const currentExcursionNombreElement = document.getElementById('selectExcursionParticipaciones').selectedOptions[0];
                            const currentExcursionNombre = currentExcursionNombreElement ? currentExcursionNombreElement.text : "Excursión";
                            renderTablaParticipaciones(currentExcursionId, currentExcursionNombre);
                            updateParticipacionesSummary(currentExcursionId, currentExcursionNombre);

                        } catch (error) {
                            if(statusCell) showTemporaryStatusInCell(statusCell, `Error al resetear: ${error.message}`, true, 5000);
                            else showGlobalError(`Error al resetear participación: ${error.message}`, document.getElementById('resumenParticipacionesContainer'));
                        }
                    }
                }
            };
            container.addEventListener('click', container._delegatedClickHandler);

        } catch (error) {
            console.error("Error in renderTablaParticipaciones:", error); // Added for more detailed debugging
            container.innerHTML = `<p class="error-message">Error cargando participaciones: ${error.message}</p>`;
            resumenContainer.innerHTML = '';
        }
    }

    async function handleAttendanceToggleClick(event, excursionId) { // Added excursionId as parameter
        const target = event.target.closest('.attendance-toggle');
        // No need to check target again, already done by caller: delegatedTableClickHandler
        // if (!target) return;

        const alumnoId = target.dataset.alumnoId;
        // excursionId is now passed as a parameter
        const trElement = target.closest('tr');
        const statusCell = trElement.querySelector('.status-message-cell');

        const currentFullParticipation = currentParticipacionesDataArray.find(p => p.alumno_id.toString() === alumnoId);
        if (!currentFullParticipation) {
            if(statusCell) showTemporaryStatusInCell(statusCell, "Error: Datos del alumno no encontrados.", true);
            return;
        }

        let newAsistenciaValue;
        // Toggle logic: Sí -> No, No -> Pendiente, Pendiente -> Sí
        if (currentFullParticipation.asistencia === 'Sí') {
            newAsistenciaValue = 'No';
        } else if (currentFullParticipation.asistencia === 'No') {
            newAsistenciaValue = 'Pendiente';
        } else { // Covers 'Pendiente' and any undefined/null cases
            newAsistenciaValue = 'Sí';
        }

        const dataToSave = {
            excursion_id: parseInt(excursionId), // Ensure excursionId is number
            alumno_id: parseInt(alumnoId),       // Ensure alumnoId is number
            autorizacion_firmada: currentFullParticipation.autorizacion_firmada,
            fecha_autorizacion: currentFullParticipation.fecha_autorizacion,
            pago_realizado: currentFullParticipation.pago_realizado,
            cantidad_pagada: currentFullParticipation.cantidad_pagada,
            fecha_pago: currentFullParticipation.fecha_pago,
            notas_participacion: currentFullParticipation.notas_participacion,
            asistencia: newAsistenciaValue
        };

        if(statusCell) showTemporaryStatusInCell(statusCell, "Guardando asistencia...", false, null);

        try {
            await apiFetch('/participaciones', 'POST', dataToSave);
            if(statusCell) showTemporaryStatusInCell(statusCell, "Asistencia guardada.", false, 2000);

            // Refresh table and summary
            const currentExcursionIdFromSelect = document.getElementById('selectExcursionParticipaciones').value;
            const currentExcursionNombreElement = document.getElementById('selectExcursionParticipaciones').selectedOptions[0];
            const currentExcursionNombre = currentExcursionNombreElement ? currentExcursionNombreElement.text : "Excursión";

            if (currentExcursionIdFromSelect && currentExcursionIdFromSelect === excursionId.toString()) { // Make sure we're refreshing the correct excursion
                await renderTablaParticipaciones(currentExcursionIdFromSelect, currentExcursionNombre);
                await updateParticipacionesSummary(currentExcursionIdFromSelect, currentExcursionNombre);
            }

        } catch (error) {
            if(statusCell) showTemporaryStatusInCell(statusCell, `Error: ${error.message}`, true, 5000);
        }
    }

    // Define a single handler for clicks on the table container
    // This function will be attached once when renderTablaParticipaciones is called.
    // It needs access to excursionId to pass to handleAttendanceToggleClick.
    // We'll store excursionId on the container itself or pass it through.
    // For simplicity, the event listener will be added in renderTablaParticipaciones,
    // where excursionId is available.

    async function saveParticipacionOnFieldChange(changedElement, excursionId) {
        const fieldName = changedElement.dataset.field;
        const newValue = changedElement.value;

        const trElement = changedElement.closest('tr');
        const alumnoId = trElement.dataset.alumnoId;
        const statusCell = trElement.querySelector('.status-message-cell');
        if(statusCell) statusCell.textContent = '';

        // Fetch current asistencia from the globally available array or trElement's data attribute
        const currentFullDataForStudent = currentParticipacionesDataArray.find(p => p.alumno_id.toString() === alumnoId.toString());
        const currentAsistenciaValue = currentFullDataForStudent ? currentFullDataForStudent.asistencia : (trElement.dataset.currentAsistencia || 'Pendiente');

        const participacionData = {
            excursion_id: parseInt(excursionId),
            alumno_id: parseInt(alumnoId),
            autorizacion_firmada: trElement.querySelector('[data-field="autorizacion_firmada"]').value,
            fecha_autorizacion: trElement.querySelector('[data-field="fecha_autorizacion"]').value || null,
            pago_realizado: trElement.querySelector('[data-field="pago_realizado"]').value,
            cantidad_pagada: parseFloat(trElement.querySelector('[data-field="cantidad_pagada"]').value) || 0,
            fecha_pago: trElement.querySelector('[data-field="fecha_pago"]').value || null,
            notas_participacion: trElement.querySelector('[data-field="notas_participacion"]').value.trim() || null,
            asistencia: currentAsistenciaValue // Preserve existing asistencia
        };

        const isModalTriggerEvent = (fieldName === 'autorizacion_firmada' && newValue === 'Sí');

        // Preliminary validation checks
        // This first check is the one that was causing the issue.
        // It should NOT run if this is the event that's supposed to trigger the modal.
        if (!isModalTriggerEvent) {
            if (participacionData.autorizacion_firmada === 'Sí' && !participacionData.fecha_autorizacion) {
                showTemporaryStatusInCell(statusCell, "Fecha autorización requerida.", true);
                return;
            }
        }

        if ((participacionData.pago_realizado === 'Sí' || participacionData.pago_realizado === 'Parcial') && !participacionData.fecha_pago) {
             showTemporaryStatusInCell(statusCell, "Fecha de pago requerida.", true); return;
        }
         if (participacionData.pago_realizado === 'Parcial' && participacionData.cantidad_pagada <= 0) {
            showTemporaryStatusInCell(statusCell, "Pago parcial > 0€.", true); return;
        }
        const originalBackgroundColor = changedElement.style.backgroundColor;

    // Define the core save logic as a function to be used as a callback
    const executeSave = async (dataToSave) => {
        changedElement.style.backgroundColor = "#fff9c4"; // Visual feedback for saving attempt

        // Ensure fecha_autorizacion is set if autorizacion_firmada is 'Sí' before saving
        // This is a safeguard, primary logic is in saveParticipacionOnFieldChange or confirmPaymentButton listener
        if (dataToSave.autorizacion_firmada === 'Sí' && !dataToSave.fecha_autorizacion) {
            dataToSave.fecha_autorizacion = new Date().toISOString().split('T')[0];
        }

        try {
            const resultado = await apiFetch('/participaciones', 'POST', dataToSave);
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

            // Update currentParticipacionesDataArray with the saved/updated data
            const index = currentParticipacionesDataArray.findIndex(p => p.alumno_id === resultado.alumno_id && p.excursion_id === resultado.excursion_id);
            if (index !== -1) {
                currentParticipacionesDataArray[index] = { ...currentParticipacionesDataArray[index], ...resultado };
            } else {
                // This case should be rare if the table is populated correctly initially
                currentParticipacionesDataArray.push(resultado);
            }

            // Refresh summary and table
            const excursionSelect = document.getElementById('selectExcursionParticipaciones');
            let currentExcursionIdToRefresh = null;
            let currentExcursionNombreToRefresh = "Excursión"; // Default

            if (excursionSelect && excursionSelect.value) {
                currentExcursionIdToRefresh = excursionSelect.value;
                 if (excursionSelect.options[excursionSelect.selectedIndex]) {
                    currentExcursionNombreToRefresh = excursionSelect.options[excursionSelect.selectedIndex].text;
                }
            } else {
                // Fallback if select is not available or no value selected, try from dataToSave
                currentExcursionIdToRefresh = dataToSave.excursion_id;
                // Attempt to find name if needed from other sources or use a generic one
            }


            if (currentExcursionIdToRefresh) {
                // Ensure the correct excursionId from the current context is used for refresh
                 updateParticipacionesSummary(currentExcursionIdToRefresh, currentExcursionNombreToRefresh);
                 renderTablaParticipaciones(currentExcursionIdToRefresh, currentExcursionNombreToRefresh); // Re-render table
            }

        } catch (error) {
            changedElement.style.backgroundColor = "#ffcdd2";
            showTemporaryStatusInCell(statusCell, error.message || "Error", true, 5000);
            setTimeout(() => { changedElement.style.backgroundColor = originalBackgroundColor; }, 3000);
            // If save failed after modal confirmation, originalChangedElement might need to be reverted.
            if (fieldName === 'autorizacion_firmada' && newValue === 'Sí' && paymentModalState.originalChangedElement) {
                 paymentModalState.originalChangedElement.value = 'No'; // Revert UI
            }
        }
    };

    if (isModalTriggerEvent) {
        // Ensure fecha_autorizacion is set if autorizacion_firmada is 'Sí' - This is the crucial part for the modal trigger
        if (!participacionData.fecha_autorizacion) {
            participacionData.fecha_autorizacion = new Date().toISOString().split('T')[0];
            // Optionally update the UI for fecha_autorizacion input directly here if needed
            const fechaAutorizacionInput = trElement.querySelector('[data-field="fecha_autorizacion"]');
            if (fechaAutorizacionInput) fechaAutorizacionInput.value = participacionData.fecha_autorizacion;
        }

        const cost = await fetchExcursionCost(excursionId);
        showPaymentConfirmationModal(cost, participacionData, changedElement, executeSave);
        // The actual save is now deferred to the modal's confirm action via executeSave callback
    } else {
        // If not "autorizacion_firmada" or its value is not "Sí", proceed with direct save.
        changedElement.style.backgroundColor = "#fff9c4";
        await executeSave(participacionData);
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
    
    async function loadAdminUsuarios() {
        const direccionActionsDiv = document.getElementById('direccion-actions-section');
    
        if (!currentUser || currentUser.rol !== 'DIRECCION') {
            if (adminUsuariosContentDiv) adminUsuariosContentDiv.innerHTML = "<p class='error-message'>Acceso denegado.</p>";
            if (direccionActionsDiv) direccionActionsDiv.style.display = 'none'; // Hide actions if not DIRECCION
            if (formAdminUsuarioWrapper) formAdminUsuarioWrapper.innerHTML = ''; // Clear any forms
            return;
        }
    
        // Ensure the 'DIRECCION' specific actions container is visible (even if export button moved)
        // This div might be used for other Direccion actions in this view later.
        // If it only contained the export button, it might be better to hide it if no other actions are planned for this specific div.
        // For now, we ensure it's visible if the user is DIRECCION and the section loads.
        if (direccionActionsDiv) {
             direccionActionsDiv.style.display = 'block'; 
        } else {
            // console.error("Error: El div 'direccion-actions-section' no se encontró en el HTML."); // Commented out as it's no longer strictly necessary for export
        }
    
        if (!adminUsuariosContentDiv) {
             console.error("Error: El div 'admin-usuarios-content' no se encontró.");
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
    
            // EXPORT_BUTTON_LOGIC_REMOVAL_POINT
            // Old export button logic was here and is now removed.
    
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

            // Import logic has been moved to loadImportExportSection
            // The direccionActionsDiv might still be used for other Direccion-specific actions,
            // so its visibility control remains for now if it's not solely for the moved import UI.

        } catch (error) { 
            showGlobalError(`Error cargando usuarios: ${error.message}`, adminUsuariosContentDiv); 
            // If direccionActionsDiv was purely for import, it would be hidden here too.
            // For now, assuming it might have other uses.
            // if (direccionActionsDiv) direccionActionsDiv.style.display = 'none';
        }
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
                // Add new password field for admin editing non-admin user, if not editing self
                if (currentUser.rol === 'DIRECCION' && initialUserData.rol !== 'DIRECCION' && currentUser.id !== initialUserData.id) {
                    formHtml += `<div><label>Nueva Contraseña (opcional):</label><input type="password" id="adminUserNewPassword" minlength="8" placeholder="Dejar en blanco para no cambiar"></div>`;
                }
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
        const passwordInput = document.getElementById('adminUserPassword'); // For new user creation
        const adminUserNewPasswordInput = document.getElementById('adminUserNewPassword'); // For admin changing other's password

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
            // Handle admin changing other user's password
            if (adminUserNewPasswordInput) {
                const newPassword = adminUserNewPasswordInput.value;
                if (newPassword && newPassword.trim() !== '') {
                    if (newPassword.length < 8) {
                        if (errorP) errorP.textContent = "La nueva contraseña, si se proporciona, debe tener al menos 8 caracteres.";
                        const submitButton = event.target.querySelector('button[type="submit"]');
                        if (submitButton) submitButton.disabled = false; // Re-enable button
                        return;
                    }
                    userData.newPassword = newPassword; // Add to userData to be sent to backend
                }
            }
        } else { // Creating a new user
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

    function openExcursionModal(excursionData) {
        if (!excursionDetailModal) return;

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
        if(modalExcursionParticipants) modalExcursionParticipants.textContent = excursionData.participating_scope_name || 'N/A';

        const modalAuthCountSpan = document.getElementById('modal-excursion-auth-count');
        if (modalAuthCountSpan) {
            modalAuthCountSpan.textContent = excursionData.count_autorizados !== undefined ? excursionData.count_autorizados.toString() : 'N/D';
        }

        // Add the "Download Info for Families" and "Ver Participaciones" buttons
        const actionsContainer = excursionDetailModal.querySelector('.modal-actions-container') || excursionDetailModal.querySelector('.modal-content'); // Prefer a specific actions container

        if (actionsContainer) {
            // Remove previous buttons if they exist to prevent duplicates
            const existingParticipacionesBtn = actionsContainer.querySelector('#modalLinkToParticipaciones');
            if (existingParticipacionesBtn) existingParticipacionesBtn.parentElement.remove(); // Remove wrapper if exists
            else { // Fallback if not wrapped, remove individually
                 if(existingParticipacionesBtn) existingParticipacionesBtn.remove();
                 const existingDownloadBtn = actionsContainer.querySelector('#btnGenerarInfoFamiliasPdf');
                 if(existingDownloadBtn) existingDownloadBtn.remove();
            }


            const buttonWrapper = document.createElement('div');
            buttonWrapper.style.textAlign = 'right';
            buttonWrapper.style.marginTop = '20px';

            // "Ver Participaciones" Button
            const participacionesButton = document.createElement('button');
            participacionesButton.id = 'modalLinkToParticipaciones';
            participacionesButton.className = 'button secondary';
            participacionesButton.innerHTML = '<i class="fas fa-users"></i> Ver Participaciones';
            participacionesButton.style.marginRight = '10px';

            participacionesButton.addEventListener('click', () => {
                if (excursionData && excursionData.id && excursionData.nombre_excursion) {
                    sessionStorage.setItem('filtroParticipacionesExcursionId', excursionData.id.toString());
                    sessionStorage.setItem('filtroParticipacionesNombreExcursion', excursionData.nombre_excursion);
                    closeExcursionModal();
                    navigateTo('participaciones');
                } else {
                    console.error('Excursion data for participaciones link is missing in modal.');
                }
            });
            buttonWrapper.appendChild(participacionesButton);

            // "Download Info Familias (PDF)" Button
            const downloadInfoButton = document.createElement('button');
            downloadInfoButton.id = 'btnGenerarInfoFamiliasPdf';
            downloadInfoButton.className = 'info';
            downloadInfoButton.innerHTML = '<i class="fas fa-file-pdf"></i> Descargar Info Familias (PDF)';
            downloadInfoButton.setAttribute('data-excursion-id', excursionData.id);
            downloadInfoButton.setAttribute('data-excursion-nombre', excursionData.nombre_excursion);
            // No specific marginTop here, as it's on the wrapper

            downloadInfoButton.addEventListener('click', async function() {
                const excursionId = this.dataset.excursionId;
                const excursionNombre = this.dataset.excursionNombre;
                const apiUrl = `${API_BASE_URL}/excursiones/${excursionId}/info_pdf`;

                try {
                    const response = await fetch(apiUrl, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${currentToken}` }
                    });

                    if (response.ok) {
                        const blob = await response.blob();
                        const downloadUrl = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = downloadUrl;
                        a.download = `Info_Excursion_${excursionNombre.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(downloadUrl);
                        a.remove();
                    } else {
                        const errorData = await response.json();
                        showGlobalError(errorData.error || `Error ${response.status} al generar el PDF de información.`);
                    }
                } catch (err) {
                    showGlobalError(`Error de red o conexión al generar PDF de información: ${err.message}`);
                }
            });
            buttonWrapper.appendChild(downloadInfoButton);

            // Append the wrapper containing both buttons
            const modalBody = excursionDetailModal.querySelector('.modal-body-content'); // Standard place
            const modalFooter = excursionDetailModal.querySelector('.modal-footer'); // Alternative place

            if (modalBody) { // Prefer appending to modal-body-content if it exists
                modalBody.appendChild(buttonWrapper);
            } else if (modalFooter) { // Else, try modal-footer
                modalFooter.insertBefore(buttonWrapper, modalFooter.firstChild); // Insert before other footer items
            } else if (actionsContainer.contains(modalCloseButton) && modalCloseButton) {
                // If no specific body/footer, and actionsContainer has the close button, insert before it
                actionsContainer.insertBefore(buttonWrapper, modalCloseButton);
            }
             else { // Absolute fallback
                actionsContainer.appendChild(buttonWrapper);
            }
        }
        
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
        // Close change password modal on outside click
        if (changePasswordModal && event.target === changePasswordModal) {
            changePasswordModal.style.display = 'none';
        }
    });

    // Event listener for showing the change password modal
    if (showChangePasswordModalBtn) {
        showChangePasswordModalBtn.addEventListener('click', () => {
            if (changePasswordModal) {
                changePasswordModal.style.display = 'flex';
                if (changePasswordErrorP) changePasswordErrorP.textContent = '';
                if (changePasswordSuccessP) changePasswordSuccessP.textContent = '';
                if (changePasswordForm) changePasswordForm.reset();
            }
        });
    }

    // Event listener for cancelling/closing the change password modal
    if (cancelChangePasswordBtn) {
        cancelChangePasswordBtn.addEventListener('click', () => {
            if (changePasswordModal) changePasswordModal.style.display = 'none';
        });
    }

    // Event listener for submitting the change password form
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (changePasswordErrorP) changePasswordErrorP.textContent = '';
            if (changePasswordSuccessP) changePasswordSuccessP.textContent = '';

            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmNewPassword = document.getElementById('confirmNewPassword').value;

            if (!currentPassword || !newPassword || !confirmNewPassword) {
                if (changePasswordErrorP) changePasswordErrorP.textContent = 'Todos los campos son obligatorios.';
                return;
            }
            if (newPassword.length < 8) {
                if (changePasswordErrorP) changePasswordErrorP.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
                return;
            }
            if (newPassword !== confirmNewPassword) {
                if (changePasswordErrorP) changePasswordErrorP.textContent = 'Las nuevas contraseñas no coinciden.';
                return;
            }

            const submitButton = changePasswordForm.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;

            try {
                await apiFetch('/auth/change-password', 'PUT', { currentPassword, newPassword });
                if (changePasswordSuccessP) changePasswordSuccessP.textContent = 'Contraseña actualizada correctamente.';
                if (changePasswordForm) changePasswordForm.reset();
                setTimeout(() => {
                    if (changePasswordModal) changePasswordModal.style.display = 'none';
                    if (changePasswordSuccessP) changePasswordSuccessP.textContent = ''; // Clear success message before next open
                }, 2000);
            } catch (error) {
                if (changePasswordErrorP) changePasswordErrorP.textContent = error.message || 'Error al cambiar la contraseña.';
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    }


    async function handleExcursionDayClick(excursionId) {
        if (!excursionId) return;
        try {
            const excursionDetails = await apiFetch(`/excursiones/${excursionId}`); 
            if (excursionDetails) { 
                openExcursionModal(excursionDetails);
            } else {
                alert("No se pudieron encontrar los detalles de la excursión. Puede que no exista.");
            }
        } catch (error) {
            alert(`Error al cargar detalles de la excursión: ${error.message}`);
        }
    }
    window.handleExcursionDayClick = handleExcursionDayClick; 

    async function loadTesoreriaData() {
        const contentDiv = document.getElementById('tesoreria-content');
        if (!contentDiv || !currentToken) {
            if(contentDiv) contentDiv.innerHTML = '<p class="error-message">Error de acceso o carga.</p>';
            return;
        }
        contentDiv.innerHTML = "<p>Cargando datos de tesorería...</p>"; 
        
        let html = '';

        // Botón para Informe General de Secretaría
        if (currentUser && (currentUser.rol === 'DIRECCION' || currentUser.rol === 'TESORERIA')) {
            html += `<div style="margin-bottom: 20px;">
                        <button id="btnGenerarInformeSecretaria" class="primary"><i class="fas fa-file-alt"></i> Generar Informe General Secretaría (PDF)</button>
                     </div>`;
        }
        
        const ingresosClaseDiv = document.getElementById('tesoreria-ingresos-clase'); 
        // let html = ''; // html ya está inicializado arriba

        if (ingresosClaseDiv) {
            // ingresosClaseDiv.innerHTML = '<p>Cargando ingresos por clase...</p>'; // No es necesario, ya hay un cargando general
            try {
                const ingresosData = await apiFetch('/tesoreria/ingresos-por-clase');
                let ingresosHtml = '<h4>Ingresos Totales por Clase</h4>';
                if (ingresosData && ingresosData.ingresos_por_clase && ingresosData.ingresos_por_clase.length > 0) {
                    ingresosHtml += '<table class="tabla-datos tabla-tesoreria-ingresos"><thead><tr><th>Clase</th><th>Total Recaudado (€)</th></tr></thead><tbody>';
                    ingresosData.ingresos_por_clase.forEach(item => {
                        ingresosHtml += `<tr>
                            <td>${item.nombre_clase}</td>
                            <td>${formatCurrency(item.total_ingresos_clase)}</td>
                        </tr>`;
                    });
                    ingresosHtml += '</tbody></table>';
                } else {
                    ingresosHtml += '<p>No hay datos de ingresos por clase disponibles.</p>';
                }
                ingresosClaseDiv.innerHTML = ingresosHtml;
            } catch (error) {
                if(ingresosClaseDiv) ingresosClaseDiv.innerHTML = `<p class="error-message">Error al cargar ingresos por clase: ${error.message}</p>`;
            }
        }
    
        try {
            const [pendientesData, pasadasData] = await Promise.all([
                apiFetch('/tesoreria/excursiones-pendientes'),
                apiFetch('/tesoreria/excursiones-pasadas')
            ]);
    
            html += '<hr class="subsection-divider" style="margin-top: 20px; margin-bottom:20px;"><h3>Excursiones Pendientes</h3>';
            if (pendientesData && pendientesData.excursiones_pendientes && pendientesData.excursiones_pendientes.length > 0) {
                html += '<table class="tabla-datos"><thead><tr><th>Nombre</th><th>Fecha</th><th>Lugar</th><th>Coste Alumno (€)</th><th>Clase Destino</th><th>Creador</th><th>Acciones</th></tr></thead><tbody>';
                pendientesData.excursiones_pendientes.forEach(ex => {
                    html += `<tr>
                        <td>${ex.nombre_excursion || 'N/D'}</td>
                        <td>${ex.fecha_excursion ? new Date(ex.fecha_excursion).toLocaleDateString() : 'N/D'}</td>
                        <td>${ex.lugar || 'N/D'}</td>
                        <td>${ex.coste_excursion_alumno !== null ? ex.coste_excursion_alumno.toFixed(2) : '0.00'}</td>
                        <td>${ex.participating_scope_name || 'Global'}</td>
                        <td>${ex.nombre_creador || 'N/D'}</td>
                        <td><button class="edit-financials-button primary" data-excursion-id="${ex.id}">Ver/Editar Finanzas</button></td>
                    </tr>`;
                });
                html += '</tbody></table>';
            } else {
                html += '<p>No hay excursiones pendientes.</p>';
            }
    
            html += '<hr class="subsection-divider" style="margin-top: 20px; margin-bottom:20px;"><h3>Excursiones Pasadas</h3>';
            if (pasadasData && pasadasData.excursiones_pasadas && pasadasData.excursiones_pasadas.length > 0) {
                html += `<table class="tabla-datos tabla-tesoreria-pasadas">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>Fecha</th>
                                    <th>Participantes (Autorizados)</th>
                                    <th>Total Recaudado (€)</th>
                                    <th>Balance (€)</th>
                                    <th>Coste Total Autobuses (€)</th>
                                    <th>Coste Total Entradas (€)</th>
                                    <th>Coste Actividad Global (€)</th>
                                    <th>Lugar</th>
                                    <th>Clase Destino</th>
                                    <th>Creador</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>`;
                pasadasData.excursiones_pasadas.forEach(ex => {
                    html += `<tr>
                        <td><a href="#" class="excursion-detail-link-tesoreria" data-excursion-id="${ex.id}">${ex.nombre_excursion || 'N/D'}</a></td>
                        <td>${ex.fecha_excursion ? new Date(ex.fecha_excursion).toLocaleDateString() : 'N/D'}</td>
                        <td>${ex.numero_alumnos_asistentes !== null ? ex.numero_alumnos_asistentes : 'N/D'}</td>
                        <td>${formatCurrency(ex.total_dinero_recaudado)}</td>
                        <td style="font-weight: bold; color: ${ex.balance_excursion < 0 ? 'red' : 'green'};">${formatCurrency(ex.balance_excursion)}</td>
                        <td>${formatCurrency(ex.coste_total_autobuses)}</td>
                        <td>${formatCurrency(ex.coste_total_participacion_entradas)}</td>
                        <td>${formatCurrency(ex.coste_total_actividad_global)}</td>
                        <td>${ex.lugar || 'N/D'}</td>
                        <td>${ex.participating_scope_name || 'Global'}</td>
                        <td>${ex.nombre_creador || 'N/D'}</td>
                        <td><button class="edit-financials-button primary" data-excursion-id="${ex.id}">Ver/Editar Finanzas</button></td>
                    </tr>`;
                });
                html += '</tbody></table>';
            } else {
                html += '<p>No hay excursiones pasadas.</p>';
            }

            const hrDivider = contentDiv.querySelector('hr.subsection-divider');
            if (hrDivider) {
                let tempDiv = document.createElement('div');
                tempDiv.innerHTML = html; 
                while (tempDiv.firstChild) {
                    contentDiv.appendChild(tempDiv.firstChild);
                }
            } else {
                contentDiv.innerHTML = html;
            }
            contentDiv.querySelectorAll('.excursion-detail-link-tesoreria').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const excursionId = e.target.dataset.excursionId;
                    handleExcursionDayClick(excursionId); 
                });
            });
            
            contentDiv.querySelectorAll('.edit-financials-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    const excursionId = e.target.dataset.excursionId;
                    openTesoreriaFinancialModal(excursionId);
                });
            });

            // Event Listener para el nuevo botón de Informe de Secretaría
            const btnInformeSecretaria = document.getElementById('btnGenerarInformeSecretaria');
            if (btnInformeSecretaria) {
                btnInformeSecretaria.addEventListener('click', async () => {
                    try {
                        const response = await fetch(`${API_BASE_URL}/secretaria/informe_general_pdf`, {
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${currentToken}` }
                        });
                        if (response.ok) {
                            const blob = await response.blob();
                            const downloadUrl = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = downloadUrl;
                            a.download = `Informe_General_Secretaria_${new Date().toISOString().split('T')[0]}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(downloadUrl);
                            a.remove();
                        } else {
                            const errorData = await response.json();
                            showGlobalError(errorData.error || `Error ${response.status} al generar el PDF de secretaría.`);
                        }
                    } catch (err) {
                        showGlobalError(`Error de red o conexión al generar PDF de secretaría: ${err.message}`);
                    }
                });
            }

        } catch (error) {
            contentDiv.innerHTML = `<p class="error-message">Error al cargar datos de tesorería: ${error.message}</p>`;
        }
    }

    function formatCurrency(amount) {
        if (typeof amount !== 'number') {
            amount = parseFloat(amount) || 0;
        }
        return amount.toFixed(2).replace('.', ',') + ' €';
    }

    checkInitialLoginState();

    function closeTesoreriaFinancialModal() {
        if (tesoreriaFinancialModal) tesoreriaFinancialModal.style.display = 'none';
        if (financialModalStatus) financialModalStatus.textContent = '';
        currentExcursionIdForFinancialModal = null;
    }

    if (financialModalCloseButton) financialModalCloseButton.onclick = closeTesoreriaFinancialModal;
    if (financialModalSaveButton) financialModalSaveButton.onclick = saveTesoreriaFinancialDetails;
    
    [financialModalNumeroAutobuses, financialModalCostePorAutobus, financialModalCosteEntradasIndividual, financialModalCosteActividadGlobal].forEach(input => {
        if (input) input.addEventListener('input', recalculateFinancialsInModal);
    });


    async function openTesoreriaFinancialModal(excursionId) {
        if (!tesoreriaFinancialModal || !currentUser || (currentUser.rol !== 'TESORERIA' && currentUser.rol !== 'DIRECCION')) {
            alert("Acceso denegado o modal no encontrado.");
            return;
        }
        currentExcursionIdForFinancialModal = excursionId;
        if (financialModalStatus) financialModalStatus.textContent = 'Cargando...';
        tesoreriaFinancialModal.style.display = 'flex';

        try {
            const excursion = await apiFetch(`/tesoreria/excursion-financial-details/${excursionId}`);
            if(financialModalTitle) financialModalTitle.textContent = `Detalles Financieros: ${excursion.nombre_excursion}`;
            if(financialModalExcursionNombre) financialModalExcursionNombre.textContent = excursion.nombre_excursion;
            if(financialModalExcursionFecha) financialModalExcursionFecha.textContent = excursion.fecha_excursion ? new Date(excursion.fecha_excursion).toLocaleDateString() : 'N/D';

            if(financialModalNumeroAutobuses) financialModalNumeroAutobuses.value = excursion.numero_autobuses || 0;
            if(financialModalCostePorAutobus) financialModalCostePorAutobus.value = excursion.coste_por_autobus || 0;
            if(financialModalCosteEntradasIndividual) financialModalCosteEntradasIndividual.value = excursion.coste_entradas_individual || 0;
            if(financialModalCosteActividadGlobal) financialModalCosteActividadGlobal.value = excursion.coste_actividad_global || 0;
            
            if(financialModalAlumnosAsistentes) financialModalAlumnosAsistentes.dataset.value = excursion.numero_alumnos_asistentes || 0;
            if(financialModalTotalRecaudado) financialModalTotalRecaudado.dataset.value = excursion.total_dinero_recaudado || 0;

            recalculateFinancialsInModal(); 
            if (financialModalStatus) financialModalStatus.textContent = '';
        } catch (error) {
            if (financialModalStatus) financialModalStatus.textContent = `Error: ${error.message}`;
        }
    }

    function recalculateFinancialsInModal() {
        const numAutobuses = parseFloat(financialModalNumeroAutobuses.value) || 0;
        const costePorAutobus = parseFloat(financialModalCostePorAutobus.value) || 0;
        const costeEntradaIndividual = parseFloat(financialModalCosteEntradasIndividual.value) || 0;
        const costeActividadGlobal = parseFloat(financialModalCosteActividadGlobal.value) || 0;

        const totalRecaudado = parseFloat(financialModalTotalRecaudado.dataset.value) || 0;
        const numAsistentes = parseInt(financialModalAlumnosAsistentes.dataset.value) || 0;

        if(financialModalTotalRecaudado) financialModalTotalRecaudado.textContent = formatCurrency(totalRecaudado);
        if(financialModalAlumnosAsistentes) financialModalAlumnosAsistentes.textContent = numAsistentes;

        const costeTotalAutobusesCalc = numAutobuses * costePorAutobus;
        if(financialModalCosteTotalAutobuses) financialModalCosteTotalAutobuses.textContent = formatCurrency(costeTotalAutobusesCalc);

        const costeTotalEntradasCalc = numAsistentes * costeEntradaIndividual;
        if(financialModalCosteTotalEntradas) financialModalCosteTotalEntradas.textContent = formatCurrency(costeTotalEntradasCalc);
        
        const costePorNinoActGlobalCalc = numAsistentes > 0 ? costeActividadGlobal / numAsistentes : 0;
        if(financialModalCosteNinoActGlobal) financialModalCosteNinoActGlobal.textContent = formatCurrency(costePorNinoActGlobalCalc);

        const balanceCalc = totalRecaudado - (costeTotalAutobusesCalc + costeTotalEntradasCalc + costeActividadGlobal);
        if(financialModalBalance) {
            financialModalBalance.textContent = formatCurrency(balanceCalc);
            financialModalBalance.style.color = balanceCalc < 0 ? 'red' : 'green';
        }
    }

    async function saveTesoreriaFinancialDetails() {
        if (!currentExcursionIdForFinancialModal) return;
        if(financialModalStatus) financialModalStatus.textContent = 'Guardando...';

        const dataToSave = {
            numero_autobuses: financialModalNumeroAutobuses.value ? parseInt(financialModalNumeroAutobuses.value) : null,
            coste_por_autobus: financialModalCostePorAutobus.value ? parseFloat(financialModalCostePorAutobus.value) : null,
            coste_entradas_individual: financialModalCosteEntradasIndividual.value ? parseFloat(financialModalCosteEntradasIndividual.value) : null,
            coste_actividad_global: financialModalCosteActividadGlobal.value ? parseFloat(financialModalCosteActividadGlobal.value) : null
        };

        if ( (dataToSave.numero_autobuses !== null && dataToSave.numero_autobuses < 0) ||
             (dataToSave.coste_por_autobus !== null && dataToSave.coste_por_autobus < 0) ||
             (dataToSave.coste_entradas_individual !== null && dataToSave.coste_entradas_individual < 0) ||
             (dataToSave.coste_actividad_global !== null && dataToSave.coste_actividad_global < 0) ) {
            if(financialModalStatus) financialModalStatus.textContent = 'Error: Los costes y número de autobuses no pueden ser negativos.';
            return;
        }


        try {
            await apiFetch(`/excursiones/${currentExcursionIdForFinancialModal}`, 'PUT', dataToSave);
            
            if(financialModalStatus) showTemporaryStatusInElement(financialModalStatus, "Guardado con éxito!", false, 3000);

            const freshFinancialDetails = await apiFetch(`/tesoreria/excursion-financial-details/${currentExcursionIdForFinancialModal}`);
            
            if(financialModalNumeroAutobuses) financialModalNumeroAutobuses.value = freshFinancialDetails.numero_autobuses || 0;
            if(financialModalCostePorAutobus) financialModalCostePorAutobus.value = freshFinancialDetails.coste_por_autobus || 0;
            if(financialModalCosteEntradasIndividual) financialModalCosteEntradasIndividual.value = freshFinancialDetails.coste_entradas_individual || 0;
            if(financialModalCosteActividadGlobal) financialModalCosteActividadGlobal.value = freshFinancialDetails.coste_actividad_global || 0;
            
            if(financialModalAlumnosAsistentes) financialModalAlumnosAsistentes.dataset.value = freshFinancialDetails.numero_alumnos_asistentes || 0;
            if(financialModalTotalRecaudado) financialModalTotalRecaudado.dataset.value = freshFinancialDetails.total_dinero_recaudado || 0;
            
            recalculateFinancialsInModal(); 

            loadTesoreriaData(); 
        } catch (error) {
            if(financialModalStatus) financialModalStatus.textContent = `Error: ${error.message}`;
        }
    }

    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    const mainPanel = document.querySelector('.main-panel'); // Added mainPanel

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            const isMobileView = window.innerWidth <= 768;

            if (isMobileView) {
                sidebar.classList.toggle('open'); // Mobile uses 'open' for transform
                document.body.classList.toggle('body-sidebar-open'); // Mobile uses this to prevent body scroll
            } else {
                // Desktop toggles classes for sidebar and main-panel
                sidebar.classList.toggle('sidebar-desktop-collapsed');
                if (mainPanel) { // Check if mainPanel exists
                    mainPanel.classList.toggle('main-panel-sidebar-collapsed');
                }
            }
        });
    }

    window.navigateTo = navigateTo; // Expose navigateTo to the global scope
});
