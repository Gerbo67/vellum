# Proyectos {#top}

Un proyecto es la unidad de organización central en Vellum. Agrupa correos bajo un nombre, controla qué direcciones de envío les pertenecen y define qué usuarios pueden verlos. Solo los administradores pueden crear proyectos y gestionar su membresía.

## Para qué sirve Vellum en equipo {#use-case}

Vellum está diseñado para correr como servidor SMTP compartido dentro de un equipo o empresa, accesible desde internet o desde una red interna. La idea es apuntar los dominios de correo de los entornos de desarrollo y QA a la instancia de Vellum: cualquier correo que la aplicación envíe llega a Vellum en lugar de salir a internet.

Cada equipo o proyecto tiene su propio espacio aislado. Los usuarios solo ven los correos de los proyectos a los que pertenecen. Esto permite que varios equipos compartan la misma instancia sin que unos vean los flujos de correo de los otros.

Para uso individual o local, herramientas como Mailpit son más ligeras y no requieren autenticación. Vellum aporta valor cuando se necesita un servidor centralizado con usuarios, proyectos y acceso controlado.

## Senders {#senders}

Cada proyecto tiene una lista de **senders**: las direcciones de correo cuyo dominio apunta a Vellum. Cuando la aplicación envía un correo, el campo `From` o `Return-Path` del mensaje determina a qué proyecto pertenece.

Si el sender del correo entrante coincide con uno de los configurados en un proyecto, el correo se asigna a ese proyecto y queda visible para sus miembros. Si no coincide con ningún proyecto, el correo es recibido por Vellum pero no aparece en ninguna bandeja de entrada — ningún usuario lo verá.

Los senders se configuran como lista de direcciones separadas por coma:

```
soporte@empresa.dev, notificaciones@empresa.dev, noreply@qa.empresa.com
```

La comparación es insensible a mayúsculas y minúsculas.

## Crear y editar proyectos {#create-edit}

Solo el administrador puede crear proyectos. Los campos disponibles son:

| Campo       | Descripción                                                                 |
|-------------|-----------------------------------------------------------------------------|
| Nombre      | Nombre del proyecto. Requerido.                                             |
| Descripción | Texto libre opcional para identificar el propósito del proyecto.            |
| Senders     | Lista de direcciones de correo separadas por coma que enrutan a este proyecto. |

Un proyecto puede existir sin senders, pero no recibirá correos hasta que se configure al menos uno. Un proyecto puede tener tantos senders como necesite.

## Miembros {#members}

Cada proyecto tiene una lista de miembros: los usuarios que pueden ver sus correos. El administrador gestiona la membresía desde el botón de miembros en cada proyecto.

Desde ese diálogo se puede:

- **Ver los miembros actuales** y eliminar a cualquiera de ellos.
- **Agregar usuarios** que aún no pertenecen al proyecto.

Un usuario puede pertenecer a múltiples proyectos simultáneamente. Cuando un usuario accede a Vellum ve en el sidebar solo los proyectos a los que pertenece.

Los administradores tienen acceso global y pueden ver todos los proyectos sin necesidad de ser miembros explícitos.

## Eliminar proyectos {#deletion}

Al eliminar un proyecto, la configuración y la membresía se borran permanentemente. Los correos asociados permanecen en la base de datos pero quedan sin proyecto asignado. La acción pide confirmación antes de ejecutarse.

## Cuota de almacenamiento {#storage-quota}

Cada proyecto puede tener un límite de almacenamiento definido por el administrador. Por defecto no hay límite: el proyecto puede recibir correos sin restricción de espacio.

### Cómo se configura {#quota-config}

El administrador establece el límite al crear o editar un proyecto, en el campo **Almacenamiento**. El valor se expresa en megabytes (MB). Dejarlo vacío o en 0 equivale a sin límite.

Una vez configurado, en la pantalla de administración de proyectos cada tarjeta muestra:

- El espacio usado y el límite en formato legible (`2.4 MB de 100 MB`).
- Una barra de progreso que cambia de color: azul en uso normal, ámbar al superar el 80 % y rojo al alcanzar o superar el límite.
- El badge **Cuota excedida** cuando el proyecto ha alcanzado su límite.

### Qué ocurre cuando se llena {#quota-full}

Si el proyecto ha alcanzado su cuota, el servidor SMTP rechaza los correos entrantes con el error estándar **552 — Insufficient storage**. La aplicación que intenta enviar el correo recibirá ese código y, según su configuración, lo reintentará o lo registrará como fallo.

El espacio se libera solo de dos formas:

- Los correos en la papelera se eliminan de forma permanente al vencer su periodo de 3 días.
- El administrador vacía la papelera del proyecto manualmente.

Restaurar correos de la papelera al inbox no libera espacio: el correo ya estaba contando hacia la cuota mientras estaba en papelera.

### Qué cuenta hacia la cuota {#what-counts}

Se cuentan todos los correos del proyecto, tanto los activos en la bandeja de entrada como los que están en la papelera pendientes de expirar. La cuota refleja el espacio real en disco que ocupa ese proyecto en Vellum.

