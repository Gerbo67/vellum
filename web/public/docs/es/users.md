# Usuarios {#top}

La pantalla de usuarios es exclusiva para administradores. Permite ver todas las cuentas registradas en la instancia de Vellum y controlar qué personas tienen acceso activo al sistema.

## Vista general {#overview}

Cada fila muestra la información básica de la cuenta:

- **Nombre y email** del usuario registrado.
- **Fecha de registro**.
- **Rol** — `admin` o `user`. Solo puede haber un rol; el primero en registrarse obtiene el rol de administrador.
- **Proveedor** — `local` si el usuario se registró con email y contraseña, o el nombre del proveedor OIDC si se autenticó con SSO.
- **Estado** — los usuarios inactivos aparecen con una etiqueta visible. Un usuario inactivo no puede iniciar sesión.

## Activar y desactivar {#activation}

El botón junto a cada usuario alterna entre activo e inactivo. Esta acción es inmediata y reversible: un usuario desactivado pierde el acceso de forma instantánea sin necesidad de eliminar la cuenta. Para restaurar el acceso basta con activarlo de nuevo.

Un administrador no puede desactivarse a sí mismo desde esta pantalla.

## Eliminar usuarios {#deletion}

El botón de eliminar borra la cuenta permanentemente. Se pide confirmación antes de ejecutar la acción. La eliminación no se puede deshacer.

Un administrador no puede eliminar su propia cuenta desde esta pantalla.

## Roles {#roles}

Los roles son informativos en esta vista; no se pueden cambiar desde la interfaz. El sistema admite dos roles:

- **admin** — acceso completo: usuarios, proyectos, configuración SMTP y correos de todos los proyectos a los que pertenece.
- **user** — acceso solo a los correos de los proyectos a los que ha sido asignado.

El rol de administrador se asigna automáticamente al primer usuario que se registra en una instancia nueva de Vellum.
