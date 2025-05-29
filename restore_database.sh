#!/bin/bash

# Define backup directory name
BACKUP_DIR="backups"

# Check if backup directory exists
if [ ! -d "$BACKUP_DIR" ]; then
  echo "Error: Backup directory '$BACKUP_DIR' not found."
  exit 1
fi

# List backup files
echo "Available backups:"
BACKUP_FILES=("$BACKUP_DIR"/*.db)

# Check if any backup files exist
if [ ${#BACKUP_FILES[@]} -eq 0 ] || [ ! -e "${BACKUP_FILES[0]}" ]; then
  echo "No backups found in '$BACKUP_DIR'."
  exit 0
fi

for i in "${!BACKUP_FILES[@]}"; do
  echo "$((i+1))) $(basename "${BACKUP_FILES[$i]}")"
done

# Prompt user for backup selection
read -p "Enter the number of the backup to restore: " BACKUP_NUMBER

# Validate user input
if ! [[ "$BACKUP_NUMBER" =~ ^[0-9]+$ ]] || [ "$BACKUP_NUMBER" -lt 1 ] || [ "$BACKUP_NUMBER" -gt "${#BACKUP_FILES[@]}" ]; then
  echo "Error: Invalid selection."
  exit 1
fi

SELECTED_BACKUP_FILE="${BACKUP_FILES[$((BACKUP_NUMBER-1))]}"

# Define source database file
SOURCE_DB="database.db"

# Back up current database before restoring
if [ -f "$SOURCE_DB" ]; then
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  mv "$SOURCE_DB" "${SOURCE_DB}.before_restore_${TIMESTAMP}"
  echo "Current database backed up to ${SOURCE_DB}.before_restore_${TIMESTAMP}"
fi

# Copy selected backup to database.db
cp "$SELECTED_BACKUP_FILE" "$SOURCE_DB"

# Print success message
echo "Database restored from $(basename "$SELECTED_BACKUP_FILE") to $SOURCE_DB."
