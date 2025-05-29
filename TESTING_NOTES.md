# Testing Network Access

To ensure the application is accessible from both internal and external networks, please follow these testing steps:

## Internal Network Access

1.  Connect a device (e.g., computer, smartphone) to the same local network as the server (e.g., the same Wi-Fi network).
2.  Open a web browser on this device.
3.  Navigate to `http://192.168.1.7:3000` (replace `192.168.1.7` with your server's actual internal IP if it's different).
4.  Verify that the application loads and all features, especially those making API calls (like login, loading data), work correctly.

## External Network Access

1.  You will need a device that is *not* connected to your local network. The easiest way to do this is often to use a smartphone with Wi-Fi turned OFF, using its mobile data connection instead.
2.  Open a web browser on this external device.
3.  Navigate to `http://79.116.193.109:3000` (replace `79.116.193.109` with your current public IP address if it has changed. You can find your public IP by searching "what is my IP" on Google from a device on your network).
4.  Verify that the application loads and all features work correctly. This confirms that port forwarding on your router is set up correctly for port 3000 and that the application can be accessed from the internet.

## Important Considerations

*   **Dynamic External IP:** Your external IP address (`79.116.193.109`) might be dynamic and could change over time if assigned by your Internet Service Provider (ISP). If you can no longer access the application externally, check if your public IP has changed. For a permanent solution, consider using a Dynamic DNS (DDNS) service.
*   **Router Configuration:** Ensure that port 3000 is correctly forwarded in your router settings to the internal IP address of the machine running the server (`192.168.1.7`).
*   **Firewall:** Make sure that no firewall (on your server machine or network) is blocking incoming connections on port 3000.

## Secure Connections (HTTPS)

When running this application in an IDX environment (or any environment that provides an HTTPS proxy), you should always use the HTTPS URL provided by the environment for accessing the application. This URL typically looks like `https://*.idx.dev/...` or `https://*.cloud.goog/...`.

Using the HTTPS URL ensures that:
- Your connection to the server is encrypted.
- PDF downloads and other API interactions are served over a secure connection, which should prevent browser warnings about insecure downloads.
- JWT tokens and other sensitive data are transmitted securely.

Avoid accessing the application via raw IP addresses or HTTP on public-facing URLs if a secure HTTPS option is available. For local development, `http://localhost:3000` is typical, but for previews shared or accessed externally, always prefer the HTTPS link provided by the platform.

## Testing the In-App Data Export Feature (Dirección Profile)

After implementing the "Exportar Todos los Datos" feature, perform the following manual tests:

**1. UI Verification:**
    - Log in as a user with the 'DIRECCION' role.
    - Navigate to the user profile or administrative section where the button was added (expected in "Administración de Usuarios" view).
    - **Expected:** The "Exportar Todos los Datos" button should be visible and enabled.
    - Log out and log in as a user with a different role (e.g., 'TUTOR', 'TESORERIA').
    - Navigate to the same section.
    - **Expected:** The "Exportar Todos los Datos" button should NOT be visible or should be disabled.

**2. Export Functionality (Happy Path):**
    - As a 'DIRECCION' user, click the "Exportar Todos los Datos" button.
    - **Expected:**
        - A loading indicator should appear (e.g., button text changes to "Exportando...", button disabled).
        - After a short period, a file download should initiate for a ZIP file (e.g., `export_gestion_escolar_YYYYMMDDHHMMSS.zip`).
        - A success message should be displayed (e.g., an alert or UI notification).
        - The loading indicator should disappear (button returns to normal state).

**3. ZIP File and CSV Content Verification:**
    - Open the downloaded ZIP file.
    - **Expected:** The ZIP file should contain the following CSV files:
        - `usuarios.csv`
        - `ciclos.csv`
        - `clases.csv`
        - `alumnos.csv`
        - `excursiones.csv`
        - `participaciones_excursion.csv`
        - `shared_excursiones.csv`
    - Open each CSV file with a spreadsheet program or text editor.
    - **For each CSV file, verify:**
        - **Headers:** The first row contains the correct column headers as designed (e.g., `id,email,nombre_completo,password_hash,rol` for `usuarios.csv`).
        - **Data Integrity:**
            - Data from the database is accurately represented.
            - Special characters (commas, double quotes, newlines) within data fields are correctly escaped (e.g., enclosed in double quotes, internal double quotes are doubled `""`).
            - `null` or `undefined` values from the database are represented as empty strings in the CSV.
            - Number of data rows matches the number of records in the corresponding database table.
        - **Encoding:** Text (especially names with accents or special characters) is displayed correctly (should be UTF-8).

**4. Edge Case: Export with Empty Database:**
    - (If possible and safe) Test with a mostly empty database (e.g., only the initial Dirección user, no other data).
    - Perform the export.
    - **Expected:**
        - The ZIP file should still be generated.
        - CSV files should contain only their header rows (or be empty if that was the implemented behavior for `recordsToCsv` with no records).

**5. API Access Control (Manual API Request):**
    - Using a tool like Postman or `curl`, try to make a GET request to `/api/direccion/export/all-data`:
        - Without any JWT token.
          - **Expected:** `401 Unauthorized` error.
        - With a JWT token from a non-'DIRECCION' user (e.g., 'TUTOR').
          - **Expected:** `403 Forbidden` error.
        - With a JWT token from a 'DIRECCION' user.
          - **Expected:** Successful response (ZIP file download).

**6. Error Handling (Frontend):**
    - (If possible to simulate) If the API call fails (e.g., server returns a 500 error, or network error):
    - **Expected:** An error message should be displayed to the user on the frontend (e.g., "Error al exportar datos: Server Error"). The loading indicator should be reset.
