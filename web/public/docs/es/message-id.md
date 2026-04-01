# Message-ID y hilos de conversación {#top}

El `Message-ID` es un identificador único que cada correo lleva en su cabecera. Lo define el RFC 2822 y su formato estándar es una cadena delimitada por ángulos con una parte local y un dominio: `<local@dominio>`. Cuando una aplicación envía un correo, ella es la responsable de generar ese identificador. Si no lo incluye, el servidor SMTP receptor generalmente lo asigna.

En Vellum, el `Message-ID` es la base sobre la que se construyen los **hilos de conversación**: grupos de correos relacionados que se muestran como una sola entrada en el listado.

## Los tres encabezados del hilo {#threading-headers}

El estándar de correo define tres cabeceras que permiten relacionar mensajes entre sí. Los tres trabajan en conjunto para que cualquier cliente de correo —o Vellum— pueda reconstruir el árbol completo de una conversación.

### Message-ID {#message-id-header}

Identifica de forma única a ese correo. Debe ser globalmente único: ningún otro correo en ningún servidor debería tener el mismo valor.

```
Message-ID: <1682544012.abc123@app.tudominio.com>
```

La parte local (antes del `@`) suele combinarse con un timestamp y un identificador aleatorio. La parte del dominio ancla el identificador a quien lo emite.

### In-Reply-To {#in-reply-to}

Contiene el `Message-ID` del correo al que responde este mensaje. Es la referencia directa al padre inmediato en el hilo. Sin este encabezado, los clientes de correo no pueden determinar automáticamente a cuál mensaje responde este.

```
In-Reply-To: <1682544012.abc123@app.tudominio.com>
```

### References {#references}

Contiene la cadena completa de `Message-ID`s de todos los mensajes ancestros, en orden cronológico y separados por espacios. Permite reconstruir el árbol completo del hilo aunque algún mensaje intermedio no esté disponible o haya llegado fuera de orden.

```
References: <raiz@dominio.com> <respuesta1@dominio.com> <respuesta2@dominio.com>
```

Cada vez que se responde, el campo `References` se construye tomando el `References` del mensaje padre y añadiendo al final su `Message-ID`.

## Cómo Vellum agrupa los hilos {#how-vellum-groups}

Vellum analiza las cabeceras `In-Reply-To` y `References` de cada correo recibido y usa un algoritmo de unión para detectar qué mensajes pertenecen a la misma conversación. Los mensajes relacionados se agrupan en el listado como un único hilo con el número de correos que lo componen.

El comportamiento concreto es el siguiente:

- Un hilo con un solo correo se muestra igual que un correo individual.
- Un hilo con varios correos muestra la lista de remitentes únicos, el asunto del primer correo y la fecha del más reciente, más un contador con el número total de mensajes.
- El indicador de color en el borde izquierdo marca el hilo como no leído si alguno de sus correos aún no fue abierto.
- Al hacer clic en un hilo, se despliega para mostrar los correos individuales que lo componen. Cada uno indica su remitente y fecha. Al hacer clic en un correo del hilo, se abre en el panel de detalle.

### Tolerancia a Message-IDs duplicados {#duplicate-tolerance}

Vellum también agrupa correos con el mismo `Message-ID`. Esta situación es habitual en entornos de prueba cuando una aplicación reenvía el mismo correo sin generar un nuevo identificador. En lugar de rechazarlos o mostrarlos como correos independientes, Vellum los incorpora al mismo hilo.

### Modo de selección {#select-mode}

En el modo de selección por lotes, hacer clic en un hilo marca o desmarca todos sus correos a la vez. Si solo algunos correos del hilo están seleccionados, el checkbox del hilo muestra un estado intermedio. Los correos dentro de un hilo expandido pueden seleccionarse de forma individual.

## Recomendaciones {#recommendations}

### Genera un Message-ID único por envío {#unique-per-send}

La unicidad es la propiedad fundamental del `Message-ID`. El formato más robusto combina un timestamp en milisegundos o microsegundos, un token aleatorio y el dominio de la aplicación:

```
<1682544012550.f3a9c1b2@app.tudominio.com>
```

La mayoría de **librerías cliente de correo** generan este identificador automáticamente si no se especifica uno. Es importante entender que quien genera el `Message-ID` es la librería que construye el mensaje —no el servidor SMTP receptor ni el proveedor de envío—. El servidor solo reenvía lo que recibe; si el mensaje llega sin `Message-ID`, algunos servidores lo añaden, pero no es comportamiento garantizado ni consistente entre proveedores.

Las siguientes librerías lo generan de forma automática al enviar:

| Lenguaje    | Librería                                  | ¿Genera Message-ID automáticamente? |
|-------------|-------------------------------------------|--------------------------------------|
| Node.js     | **Nodemailer**                            | Sí, siempre que no se especifique uno |
| PHP         | **PHPMailer**                             | Sí, con `PHPMailer::generateId()`    |
| PHP         | **Symfony Mailer**                        | Sí, lo añade en el momento del envío |
| PHP         | **Laravel Mail** (vía Symfony Mailer)     | Sí, heredado de Symfony Mailer       |
| Python      | **Django** (`django.core.mail`)           | Sí, lo inserta automáticamente       |
| Python      | `email` stdlib + `smtplib`               | No, debes usar `email.utils.make_msgid()` manualmente |
| .NET / C#   | **MimeKit / MailKit**                     | No por defecto; usa `MimeUtils.GenerateMessageId()` y asígnalo a `message.MessageId` |
| Go          | **gomail**                                | Sí, lo genera al llamar a `Send()`   |
| Go          | `net/smtp` stdlib                        | No, debes incluirlo en las cabeceras manualmente |
| Ruby        | **ActionMailer** (Rails)                  | Sí, lo añade como parte del mensaje  |
| Java        | **Jakarta Mail** (antiguo JavaMail)       | No, debes llamar a `message.saveChanges()` después de asignarlo manualmente |

Conviene verificar el comportamiento exacto de la versión de la librería que uses, ya que algunas cambian este comportamiento entre versiones mayores. La forma más rápida es inspeccionar un correo enviado en Vellum y verificar la cabecera `Message-ID` en la pestaña **Código**.

### Usa un dominio real en el Message-ID {#use-real-domain}

La parte después del `@` debe ser el dominio de tu aplicación o servidor de correo, no `localhost`, `127.0.0.1` ni una dirección IP. Los filtros antispam verifican la coherencia entre el dominio del `Message-ID` y el dominio del remitente. Un `Message-ID` con `localhost` no bloquea la entrega en la mayoría de casos, pero sí genera señales negativas en las evaluaciones de reputación.

### Incluye References en las respuestas automáticas {#include-references}

Si tu aplicación envía correos en cadena —notificaciones de seguimiento, actualizaciones de ticket, recordatorios escalonados—, incluye tanto `In-Reply-To` como `References` con la cadena completa de ancestros. Esto permite que los clientes de correo y Vellum reconstruyan el hilo completo aunque los mensajes lleguen fuera de orden o en páginas de carga distintas.

Un ejemplo de una segunda respuesta en una cadena de tres mensajes:

```
Message-ID: <tercero@app.dominio.com>
In-Reply-To: <segundo@app.dominio.com>
References: <primero@app.dominio.com> <segundo@app.dominio.com>
```

### No reutilices Message-IDs en pruebas {#no-reuse-in-tests}

El error más frecuente en entornos de desarrollo es generar el mismo `Message-ID` para distintos correos por simplificación en el código de prueba (un UUID estático, un valor fijo, un contador que se reinicia). Eso agrupa en Vellum correos no relacionados en un mismo hilo, lo que dificulta identificar qué correo proviene de qué flujo. Genera un identificador nuevo por cada correo enviado, aunque estés probando un mismo template varias veces.

### No confundas Message-ID con el ID interno de tu sistema {#dont-confuse-ids}

El `Message-ID` es un estándar del protocolo de correo, no tu clave primaria de base de datos. Ambos coexisten con propósitos distintos: el `Message-ID` lo entienden los servidores de correo, los clientes y Vellum; el ID interno solo lo entiende tu aplicación. En Vellum, el identificador de almacenamiento es independiente del `Message-ID` recibido en la cabecera.

### Cuándo no necesitas preocuparte por el Message-ID {#when-not-to-worry}

Si tu aplicación envía correos transaccionales independientes —confirmaciones de registro, facturas, alertas puntuales— y no existe relación semántica entre ellos, no es necesario gestionar `In-Reply-To` ni `References`. Cada correo es un mensaje completo en sí mismo y Vellum lo mostrará como una entrada separada en el listado.

El `Message-ID` se vuelve relevante cuando los correos forman parte de una secuencia: un sistema de tickets, una campaña de seguimiento escalonado, una notificación con su confirmación posterior. En esos casos, la trazabilidad del hilo tiene valor tanto para quien desarrolla como para quien analiza el comportamiento del sistema de correo.


