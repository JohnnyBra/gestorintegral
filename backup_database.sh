#!/bin/bash

# Define backup directory name
BACKUP_DIR="backups"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Define source database file
SOURCE_DB="database.db"

# Define timestamp format
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Construct backup filename
BACKUP_FILENAME="database_${TIMESTAMP}.db"

# Copy the database file to the backup directory
cp "$SOURCE_DB" "$BACKUP_DIR/$BACKUP_FILENAME"

# Print success message
echo "Database backup successful: $BACKUP_DIR/$BACKUP_FILENAME"
