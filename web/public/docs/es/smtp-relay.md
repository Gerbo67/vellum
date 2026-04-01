# SMTP Relay {#top}

El SMTP Relay es la funcionalidad que permite reenviar correos capturados por Vellum hacia destinatarios reales usando un servidor SMTP externo. Sin esta configuración, Vellum solo recibe y almacena correos. Con ella, cualquier correo almacenado puede enviarse a una dirección real con un solo clic.

## Quién lo configura {#who-configures}

Solo un administrador puede configurar el SMTP Relay. La configuración se encuentra en la sección de administración del sidebar, en **SMTP Relay**. Si el relay no está configurado y un usuario intenta reenviar un correo, Vellum indica que debe solicitárselo al administrador.

Los usuarios regulares pueden:

- Usar el botón de reenvío en cualquier correo almacenado.
- Gestionar su lista de direcciones guardadas para reenvío rápido.

Los usuarios regulares no pueden ver ni modificar las credenciales del servidor SMTP.

## Parámetros de configuración {#parameters}

| Campo              | Descripción                                                                  |
|--------------------|------------------------------------------------------------------------------|
| Servidor           | Dirección del servidor SMTP (por ejemplo, `smtp.sendgrid.net`)               |
| Puerto             | Puerto de conexión. Con STARTTLS es 587; con TLS directo (SMTPS), 465        |
| Usuario            | Usuario de autenticación en el servidor SMTP externo                         |
| Contraseña         | Contraseña de autenticación. Se almacena cifrada y nunca se muestra en claro |
| Dirección de envío | Dirección que aparecerá como remitente en el mensaje reenviado               |
| TLS directo        | Si se activa, Vellum conecta por TLS desde el inicio. Si no, negocia STARTTLS si el servidor lo ofrece |
| Relay habilitado   | Interruptor principal. El relay solo funciona si está activo                 |

La **dirección de envío** es obligatoria. Será el remitente en todos los correos reenviados, independientemente de quién sea el remitente original en Vellum.

## Cómo funciona el reenvío {#how-it-works}

Cuando el relay está habilitado, cada correo en la lista de mensajes muestra un botón de reenvío. Al pulsarlo, aparece un diálogo donde el usuario elige el destinatario. Vellum construye un mensaje MIME con el asunto, el cuerpo HTML y el cuerpo de texto plano del correo original y lo envía al servidor SMTP configurado.

El proceso de conexión sigue estos pasos:

1. Vellum abre una conexión TCP al servidor SMTP en el host y puerto configurados.
2. Si **TLS directo** está activo, la conexión se establece por TLS desde el inicio.
3. Si no, Vellum negocia STARTTLS si el servidor lo ofrece.
4. Si hay credenciales configuradas, se autentica con PLAIN auth sobre la conexión cifrada.
5. Se envía el mensaje usando los comandos estándar SMTP (`MAIL FROM`, `RCPT TO`, `DATA`).

La función **Probar conexión** en la pantalla de configuración verifica que Vellum puede conectarse y autenticarse sin enviar ningún correo.

## Direcciones guardadas por usuario {#saved-addresses}

Vellum almacena un historial de reenvíos por usuario. Cuando un usuario reenvía un correo a una dirección por primera vez, esa dirección queda guardada en su perfil. En los reenvíos siguientes, puede seleccionarla de la lista sin necesidad de escribirla de nuevo.

Las direcciones guardadas son privadas por usuario; cada usuario administra las suyas de forma independiente.

Desde el diálogo de reenvío se puede:

- Seleccionar una dirección guardada.
- Escribir una dirección nueva (que quedará guardada automáticamente al enviar).
- Eliminar una dirección guardada desde el gestor de direcciones.

Si el relay no está configurado en el momento en que un usuario intenta reenviar un correo, Vellum muestra un aviso indicando que debe solicitarse la configuración al administrador.
