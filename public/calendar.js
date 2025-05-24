// --- Calendar State ---
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth(); // 0-indexed

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]; // MODIFIED for Monday start

// --- Calendar Helper Functions ---
function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
    const day = new Date(year, month, 1).getDay(); // Sunday is 0, Monday is 1, ...
    return (day === 0) ? 6 : day - 1; // MODIFIED: Monday is 0, Sunday is 6
}

// --- Process Excursions and Mark Days ---
function markExcursionDays(excursions) {
    // Clear existing .has-excursion classes and listeners from all day cells first
    // This is important if markExcursionDays is called multiple times on the same grid (e.g. if excursions are re-fetched without full calendar re-render)
    // However, current design re-renders the whole calendar, so direct cell modification is fine.
    
    const dayCells = document.querySelectorAll('.calendar-day[data-date]');
    dayCells.forEach(cell => {
        cell.classList.remove('has-excursion');
        delete cell.dataset.excursionIds;
        // Clone and replace to remove old listeners more robustly
        const oldCell = cell;
        const newCell = oldCell.cloneNode(true);
        oldCell.parentNode.replaceChild(newCell, oldCell);
        // Future operations should use 'newCell' if they happen in this loop,
        // but for click, we query all cells again after this loop or rely on event delegation.
        // For simplicity with current structure, we'll re-add listeners to 'newCell'.
    });


    if (!excursions || excursions.length === 0) {
        // No message here, handled in renderExcursionCalendar
        return;
    }

    const excursionsByDate = {};
    excursions.forEach(excursion => {
        if (excursion.fecha_excursion) {
            const dateStr = excursion.fecha_excursion.split('T')[0]; 
            if (!excursionsByDate[dateStr]) {
                excursionsByDate[dateStr] = [];
            }
            excursionsByDate[dateStr].push(excursion.id); 
        }
    });
    
    // Re-query cells after cloning to attach listeners to the new nodes
    document.querySelectorAll('.calendar-day[data-date]').forEach(cell => {
        const cellDate = cell.dataset.date;
        if (excursionsByDate[cellDate] && excursionsByDate[cellDate].length > 0) {
            cell.classList.add('has-excursion');
            cell.dataset.excursionIds = JSON.stringify(excursionsByDate[cellDate]);
            
            cell.addEventListener('click', () => {
                const idsString = cell.dataset.excursionIds;
                if (idsString) {
                    try {
                        const ids = JSON.parse(idsString);
                        if (ids && ids.length > 0) {
                            const excursionId = ids[0]; 
                            if (typeof window.handleExcursionDayClick === 'function') {
                                window.handleExcursionDayClick(excursionId);
                            } else {
                                console.error('handleExcursionDayClick is not defined on window.');
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing excursion IDs from cell:', e);
                    }
                }
            });
        }
    });
}

// --- Render Calendar Function (Main) ---
function renderExcursionCalendar(year, month, excursions = []) { 
    const calendarContainer = document.getElementById('excursion-calendar-container');
    if (!calendarContainer) {
        console.error("Elemento excursion-calendar-container no encontrado.");
        return;
    }
    calendarContainer.innerHTML = ''; // Clear previous calendar

    // --- Create Header ---
    const header = document.createElement('div');
    header.className = 'calendar-header';

    const prevButton = document.createElement('button');
    prevButton.id = 'calendar-prev-month';
    prevButton.textContent = 'Anterior'; // TRANSLATED
    prevButton.onclick = () => {
        currentCalendarMonth--;
        if (currentCalendarMonth < 0) {
            currentCalendarMonth = 11;
            currentCalendarYear--;
        }
        renderExcursionCalendar(currentCalendarYear, currentCalendarMonth, window.dashboardExcursions || []);
    };

    const monthYearDisplay = document.createElement('h4');
    monthYearDisplay.textContent = `${monthNames[month]} ${year}`;

    const nextButton = document.createElement('button');
    nextButton.id = 'calendar-next-month';
    nextButton.textContent = 'Siguiente'; // TRANSLATED
    nextButton.onclick = () => {
        currentCalendarMonth++;
        if (currentCalendarMonth > 11) {
            currentCalendarMonth = 0;
            currentCalendarYear++;
        }
        renderExcursionCalendar(currentCalendarYear, currentCalendarMonth, window.dashboardExcursions || []);
    };

    header.appendChild(prevButton);
    header.appendChild(monthYearDisplay);
    header.appendChild(nextButton);
    calendarContainer.appendChild(header);

    // --- Create Day Grid ---
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';

    dayNames.forEach(dayName => {
        const dayHeaderCell = document.createElement('div');
        dayHeaderCell.className = 'calendar-day-header';
        dayHeaderCell.textContent = dayName;
        grid.appendChild(dayHeaderCell);
    });

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month); // This will now return 0 for Monday

    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-day empty';
        grid.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day';
        dayCell.textContent = day;
        const dayString = day.toString().padStart(2, '0');
        const monthString = (month + 1).toString().padStart(2, '0');
        dayCell.dataset.date = `${year}-${monthString}-${dayString}`;
        grid.appendChild(dayCell);
    }
    calendarContainer.appendChild(grid);

    // --- Mark excursion days ---
    markExcursionDays(excursions); // This will now use the cloned cells for adding listeners

    // --- Display message if no excursions or failed to load ---
    // Check if window.dashboardExcursions is undefined (fetch failed) or empty (no excursions)
    if (window.dashboardExcursions === undefined) { // Indicates fetch failure if app.js sets it to undefined initially or on error
        const errorMessage = document.createElement('p');
        errorMessage.className = 'calendar-message error-message';
        errorMessage.textContent = 'Error al cargar datos de excursiones.'; // Already Spanish
        calendarContainer.appendChild(errorMessage);
    } else if (excursions.length === 0) {
        const noExcursionsMessage = document.createElement('p');
        noExcursionsMessage.className = 'calendar-message'; // General message class
        noExcursionsMessage.textContent = 'No hay excursiones programadas para este mes.'; // Already Spanish
        calendarContainer.appendChild(noExcursionsMessage);
    }
}

// Initial render is called from app.js
