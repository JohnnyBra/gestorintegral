# Database Management Guide

This guide provides instructions for managing the application's database.

## Initial Database Setup

To set up the database for the first time or to apply schema updates, run the following command from the root of the project:

```bash
node setup_database.js
```

**Note:** This script is designed to create tables if they don't exist and add initial seed data. If run multiple times, it should not delete existing data unless the script itself is modified to do so (e.g., by dropping tables). However, for explicit data state management, please use the backup and restore scripts described below.

## Backing Up the Database

To save the current state of your database (users, excursions, students, etc.), you can use the backup script. This is useful before making significant changes or for creating save points.

1.  Ensure the script is executable:
    ```bash
    chmod +x backup_database.sh
    ```
2.  Run the script:
    ```bash
    ./backup_database.sh
    ```
This will create a timestamped copy of `database.db` in the `backups/` directory. For example: `backups/database_20231027_103000.db`.

## Restoring the Database

To restore the database to a previously saved state:

1.  Ensure the script is executable:
    ```bash
    chmod +x restore_database.sh
    ```
2.  Run the script:
    ```bash
    ./restore_database.sh
    ```
The script will list available backups. Enter the number corresponding to the backup you wish to restore. Before restoring, the script will automatically back up your current `database.db` to `database.db.before_restore_<timestamp>` as a safety measure.

## Important Considerations

-   The `backups/` directory is included in `.gitignore`, so your database backups will not be committed to the Git repository. This is generally good practice to avoid storing potentially large data files in the repo.
-   Regularly backing up your database is recommended, especially before running any operations that might alter or delete data.
-   The `setup_database.js` script should primarily be used for initializing the database schema and potentially seeding initial essential data. For day-to-day data preservation and recovery, rely on the backup and restore scripts.

## In-App Data Export (Dirección Profile)

For users with the 'DIRECCION' role, there is an in-application feature to export key application data.

-   **Location:** This feature is available in the user profile section (specifically, under "Administración de Usuarios" when logged in as Dirección).
-   **Button:** Look for a button labeled "Exportar Todos los Datos".
-   **Functionality:** Clicking this button will generate and download a ZIP file named `export_gestion_escolar_YYYYMMDDHHMMSS.zip`.
-   **Content:** This ZIP file contains several CSV files, one for each major data table in the application (e.g., `usuarios.csv`, `clases.csv`, `alumnos.csv`, `excursiones.csv`, `participaciones_excursion.csv`, `ciclos.csv`, and `shared_excursiones.csv`).
-   **Purpose:** This export can be useful for:
    -   Creating a data snapshot in a portable format.
    -   Migrating data to other systems.
    -   Offline analysis or record-keeping.
    -   As a potential source for a future import process (note: the import functionality is a separate feature to be developed).

**Note:** This in-app export is different from the `backup_database.sh` script. The script creates a full binary backup of the `database.db` file, while this feature exports data into human-readable CSV files.
