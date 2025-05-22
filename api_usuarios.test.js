// api_usuarios.test.js

// User must install node-fetch: npm install node-fetch@2
// And replace placeholder tokens with actual valid JWT tokens.
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000/api';

// --- IMPORTANT: Replace these with actual valid JWT tokens ---
// Token for a user with 'DIRECCION' role
const DIRECCION_TOKEN = 'YOUR_DIRECCION_USER_TOKEN'; 
// Token for a user with 'TUTOR' role
const TUTOR_TOKEN = 'YOUR_TUTOR_USER_TOKEN';
// ---

// Helper function to generate unique emails for testing
const generateUniqueEmail = (base = 'testuser') => `${base}_${Date.now()}@example.com`;

// Helper to print test results
function printResult(testName, condition, responseStatus, responseData) {
    console.log(`Status: ${responseStatus}`);
    console.log('Response:', JSON.stringify(responseData, null, 2));
    if (condition) {
        console.log(`Result: PASSED - ${testName}\n`);
        return true;
    } else {
        console.error(`Result: FAILED - ${testName}\n`);
        return false;
    }
}

async function runTests() {
    console.log('--- Running POST /api/usuarios Tests ---');
    let testsPassed = 0;
    let totalTests = 0;

    if (DIRECCION_TOKEN === 'YOUR_DIRECCION_USER_TOKEN' || TUTOR_TOKEN === 'YOUR_TUTOR_USER_TOKEN') {
        console.error("\nCRITICAL ERROR: Placeholder tokens are still in use. Please replace YOUR_DIRECCION_USER_TOKEN and YOUR_TUTOR_USER_TOKEN with actual valid JWTs to run tests.\n");
        return;
    }

    // Test Case 1: Successful Tutor Creation by DIRECCION
    totalTests++;
    const uniqueEmailSuccess = generateUniqueEmail('tutor_success');
    console.log('Test 1: Successful Tutor Creation by DIRECCION');
    console.log(`  Attempting to create user: ${uniqueEmailSuccess}`);
    try {
        const response = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
            body: JSON.stringify({ email: uniqueEmailSuccess, nombre_completo: 'Test Tutor Success', password: 'password123', rol: 'TUTOR' })
        });
        const data = await response.json();
        if (printResult('Successful Tutor Creation', response.status === 201 && data.email === uniqueEmailSuccess && data.rol === 'TUTOR' && data.id, response.status, data)) {
            testsPassed++;
        }
    } catch (error) {
        console.error('Test 1 FAILED due to exception:', error.message, '\n');
    }

    // Test Case 2: Unauthorized access (TUTOR role attempting to create)
    totalTests++;
    console.log('Test 2: Unauthorized - TUTOR role attempting creation');
    try {
        const response = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TUTOR_TOKEN}` },
            body: JSON.stringify({ email: generateUniqueEmail('tutor_unauth'), nombre_completo: 'Unauthorized Test', password: 'password123', rol: 'TUTOR' })
        });
        const data = await response.json();
        if (printResult('Unauthorized (TUTOR role)', response.status === 403 && data.error === 'No autorizado. Solo el rol DIRECCION puede crear usuarios.', response.status, data)) {
            testsPassed++;
        }
    } catch (error) {
        console.error('Test 2 FAILED due to exception:', error.message, '\n');
    }

    // Test Case 3: Missing email
    totalTests++;
    console.log('Test 3: Missing email field');
    try {
        const response = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
            body: JSON.stringify({ nombre_completo: 'Missing Email Test', password: 'password123', rol: 'TUTOR' })
        });
        const data = await response.json();
        if (printResult('Missing email', response.status === 400 && data.error === 'Email, nombre_completo, password y rol son requeridos.', response.status, data)) {
            testsPassed++;
        }
    } catch (error) {
        console.error('Test 3 FAILED due to exception:', error.message, '\n');
    }
    
    // Test Case 4: Missing nombre_completo
    totalTests++;
    console.log('Test 4: Missing nombre_completo field');
    try {
        const response = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
            body: JSON.stringify({ email: generateUniqueEmail('missing_name'), password: 'password123', rol: 'TUTOR' })
        });
        const data = await response.json();
        if (printResult('Missing nombre_completo', response.status === 400 && data.error === 'Email, nombre_completo, password y rol son requeridos.', response.status, data)) {
            testsPassed++;
        }
    } catch (error) {
        console.error('Test 4 FAILED due to exception:', error.message, '\n');
    }

    // Test Case 5: Missing password
    totalTests++;
    console.log('Test 5: Missing password field');
    try {
        const response = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
            body: JSON.stringify({ email: generateUniqueEmail('missing_pass'), nombre_completo: 'Missing Password', rol: 'TUTOR' })
        });
        const data = await response.json();
        if (printResult('Missing password', response.status === 400 && data.error === 'Email, nombre_completo, password y rol son requeridos.', response.status, data)) {
            testsPassed++;
        }
    } catch (error) {
        console.error('Test 5 FAILED due to exception:', error.message, '\n');
    }

    // Test Case 6: Missing rol
    totalTests++;
    console.log('Test 6: Missing rol field');
    try {
        const response = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
            body: JSON.stringify({ email: generateUniqueEmail('missing_role'), nombre_completo: 'Missing Role', password: 'password123' })
        });
        const data = await response.json();
        if (printResult('Missing rol', response.status === 400 && data.error === 'Email, nombre_completo, password y rol son requeridos.', response.status, data)) {
            testsPassed++;
        }
    } catch (error) {
        console.error('Test 6 FAILED due to exception:', error.message, '\n');
    }

    // Test Case 7: Invalid email format
    totalTests++;
    console.log('Test 7: Invalid email format');
    try {
        const response = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
            body: JSON.stringify({ email: 'invalidemail', nombre_completo: 'Invalid Email Test', password: 'password123', rol: 'TUTOR' })
        });
        const data = await response.json();
        if (printResult('Invalid email format', response.status === 400 && data.error === 'Formato de email inválido.', response.status, data)) {
            testsPassed++;
        }
    } catch (error) {
        console.error('Test 7 FAILED due to exception:', error.message, '\n');
    }

    // Test Case 8: Password too short
    totalTests++;
    console.log('Test 8: Password too short (less than 8 characters)');
    try {
        const response = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
            body: JSON.stringify({ email: generateUniqueEmail('short_pass'), nombre_completo: 'Short Password Test', password: 'pass', rol: 'TUTOR' })
        });
        const data = await response.json();
        if (printResult('Password too short', response.status === 400 && data.error === 'La contraseña debe tener al menos 8 caracteres.', response.status, data)) {
            testsPassed++;
        }
    } catch (error) {
        console.error('Test 8 FAILED due to exception:', error.message, '\n');
    }

    // Test Case 9: Duplicate email
    totalTests++;
    const duplicateEmail = generateUniqueEmail('duplicate_email');
    console.log(`Test 9: Duplicate email - First attempt to create user ${duplicateEmail}`);
    try {
        // First, create a user successfully
        const firstResponse = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
            body: JSON.stringify({ email: duplicateEmail, nombre_completo: 'Duplicate Email User 1', password: 'password123', rol: 'TUTOR' })
        });
        if (firstResponse.status !== 201) {
            console.error(`Test 9 SETUP FAILED: Could not create initial user for duplicate test. Status: ${firstResponse.status}`);
            const firstData = await firstResponse.json();
            console.error('Setup response:', firstData);
            printResult('Duplicate email (setup step)', false, firstResponse.status, firstData);
        } else {
            console.log(`Test 9: Duplicate email - Second attempt with same email: ${duplicateEmail}`);
            const secondResponse = await fetch(`${BASE_URL}/usuarios`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
                body: JSON.stringify({ email: duplicateEmail, nombre_completo: 'Duplicate Email User 2', password: 'password456', rol: 'TUTOR' })
            });
            const secondData = await secondResponse.json();
            if (printResult('Duplicate email', secondResponse.status === 409 && secondData.error === 'El email proporcionado ya está en uso.', secondResponse.status, secondData)) {
                testsPassed++;
            }
        }
    } catch (error) {
        console.error('Test 9 FAILED due to exception:', error.message, '\n');
    }

    // Test Case 10: Invalid rol (attempting to create DIRECCION)
    totalTests++;
    console.log('Test 10: Invalid rol (attempting to create DIRECCION role)');
    try {
        const response = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
            body: JSON.stringify({ email: generateUniqueEmail('invalid_role'), nombre_completo: 'Invalid Role Test', password: 'password123', rol: 'DIRECCION' })
        });
        const data = await response.json();
        if (printResult('Invalid rol (DIRECCION)', response.status === 400 && data.error === 'Solo se pueden crear usuarios con rol TUTOR.', response.status, data)) {
            testsPassed++;
        }
    } catch (error) {
        console.error('Test 10 FAILED due to exception:', error.message, '\n');
    }
    
    // Test Case 11: Email empty after trim
    totalTests++;
    console.log('Test 11: Email consists only of spaces');
    try {
        const response = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DIRECCION_TOKEN}` },
            body: JSON.stringify({ email: '   ', nombre_completo: 'Empty Email Test', password: 'password123', rol: 'TUTOR' })
        });
        const data = await response.json();
        if (printResult('Email only spaces', response.status === 400 && data.error === 'El email no puede estar vacío.', response.status, data)) {
            testsPassed++;
        }
    } catch (error) {
        console.error('Test 11 FAILED due to exception:', error.message, '\n');
    }

    console.log(`--- Tests Summary ---`);
    console.log(`Total tests: ${totalTests}`);
    console.log(`Tests passed: ${testsPassed}`);
    console.log(`Tests failed: ${totalTests - testsPassed}`);
    console.log(`---------------------`);

    if (totalTests - testsPassed > 0) {
        // Optional: exit with error code if any test failed, useful for CI
        // process.exit(1); 
    }
}

runTests().catch(err => {
    console.error("FATAL ERROR DURING TEST EXECUTION:", err);
});
