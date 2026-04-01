# Papelera {#top}

Cuando se elimina un correo en Vellum, no desaparece de inmediato. Entra en la papelera del proyecto y permanece ahí durante **3 días**. Pasado ese periodo, un proceso interno lo borra de forma definitiva sin intervención manual.

Lo mismo ocurre con los proyectos: cuando el administrador elimina uno, entra en un estado de borrado pendiente y puede restaurarse. Si se elimina definitivamente, todo el contenido desaparece.

## Papelera por proyecto {#project-trash}

Cada proyecto tiene su propia papelera, accesible desde el icono de papelera en la cabecera de la bandeja de entrada. Desde ahí se puede:

- **Ver los correos eliminados** ordenados por fecha de recepción.
- **Restaurar correos** de forma individual o seleccionando varios a la vez.
- **Eliminar definitivamente** un correo antes de que expire su periodo.
- **Vaciar la papelera** del proyecto de una sola vez.

Los correos muestran cuántos días les quedan antes de ser borrados definitivamente. Cuando quedan menos de 24 horas, se indica «Expira hoy».

## Estados de un correo en papelera {#states}

Un correo en papelera puede estar en dos estados distintos:

| Estado | Descripción |
|--------|-------------|
| En papelera | Eliminado por el usuario o admin. Expira en 3 días desde la eliminación. |
| Proyecto eliminado | El proyecto al que pertenece fue eliminado. No tiene temporizador activo hasta que el proyecto se restaure o se elimine definitivamente. |

Los correos en estado «Proyecto eliminado» no se pueden restaurar individualmente mientras el proyecto esté en la papelera. Solo se restauran al recuperar el proyecto.

## Papelera de proyectos {#admin-trash}

Solo el administrador puede eliminar proyectos. Al hacerlo:

1. El proyecto entra en la papelera de la sección de administración.
2. Todos sus correos activos pasan a estado «Proyecto eliminado» y suspenden su temporizador.
3. Los correos que ya estaban en la papelera del proyecto también suspenden su temporizador.

Desde la sección **Proyectos** en la administración, el bloque de proyectos eliminados aparece al final de la lista. Cada proyecto muestra la fecha en que fue eliminado y dos acciones disponibles:

### Restaurar un proyecto

Al restaurar un proyecto:

- El proyecto vuelve a aparecer en el sidebar y en la bandeja de entrada de sus miembros.
- Todos los correos que estaban en estado «Proyecto eliminado» recuperan un temporizador fresco de **3 días** desde el momento de la restauración.
- Los correos activos del proyecto que no estaban eliminados se mantienen activos.

### Eliminar definitivamente un proyecto

Al purgar un proyecto de la papelera, se borran de forma permanente e irrecuperable:

- El proyecto y su configuración.
- Todos sus senders.
- Todos sus miembros.
- Todos sus correos, tanto los activos como los que estaban en papelera.

Esta acción pide confirmación explícita antes de ejecutarse.

## Proceso automático de purga {#purge-job}

Vellum ejecuta un proceso interno cada hora que elimina permanentemente los correos cuyo periodo de 3 días ha expirado. El proceso actúa solo sobre correos en papelera con temporizador activo; los correos en estado «Proyecto eliminado» no se ven afectados hasta que se toma una decisión sobre el proyecto.

No hay notificación cuando se ejecuta la purga automática. Los correos simplemente dejan de existir.

## Aviso sobre permanencia de datos {#disclaimer}

Vellum es una herramienta de desarrollo, no un sistema de auditoría de permanencia de datos. Su objetivo es capturar correos salientes durante el desarrollo y la fase de QA para que los equipos puedan inspeccionarlos sin que lleguen a destinatarios reales.

La papelera existe para dar un margen de corrección ante eliminaciones accidentales, no como garantía de retención. Una vez vencido el periodo o ejecutada una purga manual, los datos desaparecen sin posibilidad de recuperación. Vellum no guarda copias de seguridad de los correos.

Si tu caso de uso requiere conservar correos como evidencia o cumplir con requisitos de auditoría, Vellum no es la herramienta adecuada.

