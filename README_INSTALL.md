# Gestor Escolar Integral - Guía de Instalación en Ubuntu Server

Esta guía detalla paso a paso cómo instalar y desplegar la aplicación en un servidor Ubuntu limpio.

## Requisitos Previos

*   Acceso a un servidor Ubuntu (20.04 o 22.04 recomendado).
*   Acceso root o usuario con privilegios sudo.

## Pasos de Instalación

### 1. Actualizar el Sistema

Primero, asegurémonos de que todos los paquetes del sistema estén actualizados.

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Instalar Node.js

Usaremos NodeSource para instalar una versión reciente de Node.js (v18 o v20 LTS).

```bash
# Descargar e importar las claves GPG de Nodesource
sudo apt-get install -y ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

# Crear el repositorio de NodeSource (versión 20)
NODE_MAJOR=20
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list

# Instalar Node.js
sudo apt-get update
sudo apt-get install nodejs -y
```

Verifica la instalación:
```bash
node -v
npm -v
```

### 3. Copiar los Archivos de la Aplicación

Puedes clonar el repositorio o subir los archivos mediante SCP/SFTP. Supongamos que la aplicación estará en `/var/www/gestion-escolar`.

```bash
# Crear directorio
sudo mkdir -p /var/www/gestion-escolar
# Asignar permisos a tu usuario (reemplaza 'tu_usuario' por tu usuario actual)
sudo chown -R $USER:$USER /var/www/gestion-escolar

# (Aquí subirías los archivos del proyecto a esta carpeta)
cd /var/www/gestion-escolar
```

### 4. Instalar Dependencias

Dentro del directorio de la aplicación:

```bash
npm install
```
Si necesitas reconstruir modulos nativos (como sqlite3 en algunos casos):
```bash
npm rebuild sqlite3
```

### 5. Configuración de Variables de Entorno (Opcional)

Crea un archivo `.env` si necesitas configurar secretos específicos (como `JWT_SECRET`).

```bash
nano .env
```
Contenido de ejemplo:
```
JWT_SECRET=tu_secreto_super_seguro_y_largo
PORT=3002
```

### 6. Instalar y Configurar PM2

PM2 es un gestor de procesos que mantendrá la aplicación ejecutándose en segundo plano y la reiniciará automáticamente si falla o si el servidor se reinicia.

```bash
sudo npm install -g pm2
```

### 7. Iniciar la Aplicación con PM2

La aplicación ya incluye un archivo de configuración `ecosystem.config.js`.

```bash
pm2 start ecosystem.config.js
```

Para guardar la lista de procesos y asegurarte de que se inicien al reiniciar el servidor:

```bash
pm2 save
pm2 startup
```
Ejecuta el comando que `pm2 startup` te muestre en pantalla.

### 8. Verificar el Despliegue

La aplicación debería estar corriendo en el puerto 3002. Puedes verificarlo con:

```bash
curl http://localhost:3002/api
```
Deberías recibir un mensaje JSON confirmando que la API está funcionando.

### 9. (Opcional) Configurar Firewall

Si tienes UFW activado, permite el puerto 3002 (o mejor aún, configura Nginx como proxy inverso y abre solo el 80/443).

```bash
sudo ufw allow 3002/tcp
```

¡Listo! Tu aplicación está desplegada y es persistente.
