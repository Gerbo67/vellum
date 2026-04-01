# Análisis de correos {#top}

Vellum es un servidor SMTP de desarrollo y pruebas. Recibe correos enviados desde cualquier aplicación, los almacena y los presenta en una interfaz web donde se pueden inspeccionar, analizar y reenviar. No entrega mensajes a destinatarios reales a menos que se configure un relay SMTP explícito.

Cuando Vellum recibe un correo, ejecuta un análisis automático sobre su contenido, cabeceras y estructura. El resultado es un conjunto de verificaciones agrupadas en seis categorías. Cada verificación tiene un nivel de severidad y un impacto numérico que determina cuántos puntos descuenta del total.

Los niveles de severidad son tres:

- **blocker** — compromete la entrega o la seguridad. Su presencia casi garantiza que el correo será rechazado o filtrado.
- **warning** — problema que afecta la entregabilidad o la compatibilidad en condiciones reales.
- **info** — mejora recomendable que no bloquea la entrega pero sí reduce la calidad del mensaje.

## Puntuación y calificación {#scoring}

El análisis parte de 100 puntos. Por cada verificación que falla, se resta el valor de impacto correspondiente. La puntuación final no baja de cero.

| Puntuación | Calificación |
|------------|-------------|
| 95 – 100   | A+          |
| 88 – 94    | A           |
| 78 – 87    | B           |
| 65 – 77    | C           |
| 45 – 64    | D           |
| 0 – 44     | F           |

Si alguna verificación de tipo **blocker** falla, la calificación baja automáticamente un nivel, independientemente del puntaje numérico.

**Vellum Verified** es una distinción adicional que se otorga cuando el correo supera todas las verificaciones críticas sin ningún blocker fallido. Indica que el mensaje está técnicamente bien construido y preparado para entornos de producción.

## Seguridad {#security}

Las verificaciones de seguridad detectan patrones en el HTML del correo que los proveedores de correo eliminan, bloquean o usan como señal de phishing o malware. Si el correo no tiene cuerpo HTML, todas las verificaciones de esta categoría se omiten automáticamente.

### Sin etiquetas `<script>` {#no_script_tags}

**Severidad:** blocker — **Impacto:** 20 puntos

Los clientes de correo no ejecutan JavaScript. Gmail, Outlook y Apple Mail eliminan cualquier etiqueta `<script>` antes de mostrar el mensaje; algunos proveedores rechazan el correo completo si detectan scripts. Incluir JavaScript en un correo HTML no produce ningún efecto funcional y activa filtros de seguridad.

### Sin URLs `javascript:` {#no_javascript_urls}

**Severidad:** blocker — **Impacto:** 20 puntos

Los atributos `href`, `src` y `action` que contienen `javascript:` como protocolo son bloqueados por todos los clientes de correo. Además de no funcionar, son una señal directa de intento de ejecución de código arbitrario. Los filtros antiphishing los identifican de forma inmediata.

### Sin manejadores de eventos inline {#no_event_handlers}

**Severidad:** warning — **Impacto:** 12 puntos

Los atributos `onclick`, `onload`, `onerror` y similares son eliminados silenciosamente por los clientes de correo antes de renderizar el mensaje. El código que dependa de ellos no se ejecutará. Además, su presencia es interpretada por algunos filtros como comportamiento sospechoso.

### Sin etiquetas iframe, object o embed {#no_dangerous_tags}

**Severidad:** blocker — **Impacto:** 12 puntos

Las etiquetas `<iframe>`, `<object>` y `<embed>` son eliminadas completamente por Gmail, Outlook y el resto de proveedores principales. Se usan en vectores de ataque conocidos para inyectar contenido externo o ejecutar código. Ningún cliente de correo las renderiza.

### Sin expresiones CSS `expression()` {#no_css_expression}

**Severidad:** blocker — **Impacto:** 15 puntos

`expression()` es una construcción de CSS de Internet Explorer que permite ejecutar JavaScript desde dentro de una hoja de estilos. Ningún navegador moderno la soporta, pero sigue siendo detectada activamente por filtros antispam como vector de ataque. Su presencia activa bloqueos inmediatos en la mayoría de proveedores.

### Sin URLs `data:` con código ejecutable {#no_data_js_urls}

**Severidad:** blocker — **Impacto:** 15 puntos

Las URLs con esquema `data:text/html` o `data:application/javascript` en atributos `src` o `href` son bloqueadas por todos los filtros de seguridad modernos. Se usan para incrustar contenido ejecutable sin pasar por un servidor externo, lo que las convierte en un mecanismo de evasión de filtros de dominio.

### Sin formularios con acción hacia dominios externos {#no_external_form}

**Severidad:** warning — **Impacto:** 6 puntos

Un elemento `<form>` cuyo atributo `action` apunta a una URL externa es tratado como señal de phishing por Gmail y Outlook. El objetivo típico de este patrón es recopilar datos del usuario al hacer clic en un botón dentro del correo.

### Sin enlaces directos a direcciones IP {#no_ip_links}

**Severidad:** warning — **Impacto:** 8 puntos

Los enlaces que apuntan directamente a una dirección IP (por ejemplo `http://192.168.1.1/ruta`) son bloqueados sistemáticamente por filtros antispam y antiphishing. Los correos legítimos usan nombres de dominio. Una IP en un enlace es una señal de intento de evadir la reputación de dominio.

## Compatibilidad con clientes {#compatibility}

Esta categoría verifica que el HTML del correo no use características de CSS o estructuras que los clientes de correo no soportan. Outlook es el caso más crítico: su motor de renderizado es Word, no un navegador, y tiene limitaciones severas respecto a CSS moderno.

### Sin CSS Flexbox {#no_flexbox}

**Severidad:** warning — **Impacto:** 6 puntos

`display: flex` e `display: inline-flex` no están soportados en Outlook 2007 a 2019. El layout basado en Flexbox se romperá completamente en esas versiones. Para correos compatibles con Outlook, el diseño debe construirse con tablas HTML.

### Sin CSS Grid {#no_grid}

**Severidad:** warning — **Impacto:** 6 puntos

CSS Grid no está soportado en Outlook ni en la mayoría de clientes de correo de escritorio. Su uso produce layouts incorrectos o sin estructura visible.

### Sin variables CSS {#no_css_vars}

**Severidad:** info — **Impacto:** 3 puntos

Las propiedades personalizadas de CSS (`var(--nombre)`) no están soportadas en Outlook ni en varios clientes webmail. Los valores que dependan de ellas simplemente no se aplican, lo que puede afectar colores, tamaños o espaciados.

### Sin `@font-face` {#no_font_face}

**Severidad:** info — **Impacto:** 3 puntos

Solo Gmail y Apple Mail soportan fuentes web cargadas con `@font-face`. El resto de clientes ignoran la declaración y usan el primer `font-family` de fallback disponible. Si ese fallback no está definido explícitamente, el cliente elige su propia tipografía genérica.

### Sin `@import` en CSS {#no_css_import}

**Severidad:** warning — **Impacto:** 4 puntos

Los clientes de correo ignoran las hojas de estilo importadas con `@import`. Las reglas definidas en esas hojas externas no se aplican, y el correo puede quedar sin los estilos esperados. Todos los estilos deben estar incluidos directamente en el documento HTML.

### Sin hojas de estilo externas {#no_external_css}

**Severidad:** warning — **Impacto:** 7 puntos

Las etiquetas `<link rel="stylesheet">` que apuntan a hojas de estilo externas son bloqueadas por los clientes de correo por razones de seguridad y privacidad. El CSS debe estar incrustado directamente en el HTML del correo.

### Sin `position: fixed` {#no_position_fixed}

**Severidad:** info — **Impacto:** 3 puntos

`position: fixed` no está soportado en la mayoría de clientes de correo. Dependiendo del cliente, puede hacer que un elemento quede invisible, oculte otro contenido o genere comportamiento impredecible en el layout.

### DOCTYPE presente {#has_doctype}

**Severidad:** info — **Impacto:** 3 puntos

Sin la declaración `<!DOCTYPE html>`, los clientes de correo activan el modo quirks de renderizado, que aplica reglas de compatibilidad heredadas de navegadores de los años 90. Esto puede deformar el layout, alterar el box model y cambiar el comportamiento de varios elementos CSS.

### Declaración de codificación presente {#has_charset}

**Severidad:** warning — **Impacto:** 4 puntos

Sin una declaración de charset (`<meta charset="UTF-8">` o equivalente), los clientes de correo pueden interpretar la codificación del texto de forma incorrecta. El resultado visible son caracteres especiales corruptos: tildes, eñes o símbolos que se muestran como secuencias ilegibles.

## Estructura y cabeceras RFC {#structure}

Esta categoría verifica que el correo cumpla con los estándares definidos en los RFC de correo electrónico (principalmente RFC 2822 y RFC 5322). Las cabeceras mal formadas o ausentes pueden hacer que el correo sea rechazado antes de llegar a la bandeja de entrada.

### Versión HTML presente {#has_html_body}

**Severidad:** warning — **Impacto:** 8 puntos

Un correo sin cuerpo HTML tiene formato muy limitado. Los correos de texto plano pueden parecer automatizados o poco profesionales dependiendo del contexto.

### Versión texto plano presente {#has_text_body}

**Severidad:** warning — **Impacto:** 8 puntos

El texto plano es el fallback para clientes que no renderizan HTML y para los filtros antispam. Un correo sin versión de texto plano pierde puntos en la evaluación de entregabilidad de varios proveedores.

### Texto plano con contenido real {#text_body_content}

**Severidad:** warning — **Impacto:** 5 puntos

Un cuerpo de texto plano vacío o con solo espacios es peor que no tenerlo. Los filtros antispam lo interpretan como un intento de evasión: un correo con HTML extenso y texto plano vacío es sospechoso.

### Asunto no vacío {#has_subject}

**Severidad:** warning — **Impacto:** 6 puntos

Un correo sin asunto es penalizado fuertemente por los filtros antispam. Además, en la mayoría de clientes aparece como "(sin asunto)", lo que reduce drásticamente la tasa de apertura.

### Longitud del asunto adecuada {#subject_length}

**Severidad:** info — **Impacto:** 3 puntos

El rango óptimo para el asunto es entre 6 y 78 caracteres. Por encima de 78, Gmail, Outlook y los clientes móviles lo truncan. Los asuntos de 40 a 60 caracteres funcionan mejor en dispositivos móviles.

### Cabecera Date presente {#has_date}

**Severidad:** warning — **Impacto:** 5 puntos

La cabecera `Date` es obligatoria según RFC 2822. Su ausencia genera desconfianza en los filtros antispam porque los correos legítimos siempre tienen fecha.

### Message-ID presente {#has_message_id}

**Severidad:** blocker — **Impacto:** 10 puntos

El `Message-ID` es un identificador único del correo definido en RFC 5322 y es obligatorio. Su ausencia activa filtros antispam en la mayoría de proveedores. Además, es necesario para que los clientes de correo gestionen correctamente los hilos de conversación.

### Sin cabeceras singulares duplicadas {#unique_headers}

**Severidad:** warning — **Impacto:** 6 puntos

RFC 5322 especifica que cabeceras como `From`, `Subject`, `Date` o `Message-ID` solo pueden aparecer una vez. Un mensaje con estas cabeceras duplicadas está malformado y los filtros antispam lo penalizan.

### Remitente con nombre visible {#has_from_name}

**Severidad:** warning — **Impacto:** 5 puntos

El campo `From` puede contener solo la dirección o la dirección con un nombre visible (`Equipo Acme <info@acme.com>`). Incluir un nombre mejora la tasa de apertura y reduce la probabilidad de que el correo sea marcado como spam.

### Campo From con una sola dirección {#single_from_address}

**Severidad:** blocker — **Impacto:** 8 puntos

RFC 5322 exige que el campo `From` contenga exactamente una dirección de autor. Múltiples direcciones en `From` producen un mensaje malformado que los proveedores pueden rechazar.

## Entregabilidad {#deliverability}

Esta categoría evalúa factores que determinan si el correo llegará a la bandeja de entrada o terminará en spam. Combina análisis del asunto, del HTML y de los adjuntos.

### Contenido sin indicadores de spam {#no_spam_triggers}

**Severidad:** warning — **Impacto:** 8 puntos

Este check es ejecutado por **[Vellum Sentinel](/docs/sentinel)**, el motor de detección de contenido spam integrado en Vellum. Analiza el asunto y el cuerpo de texto del correo en busca de patrones asociados a spam: urgencia artificial, promesas de ganancia, vocabulario de fraude y lenguaje de marketing invasivo.

Cuando detecta riesgo, muestra la probabilidad estimada y las palabras que más contribuyeron a la clasificación. Consulta la [documentación de Vellum Sentinel](/docs/sentinel) para entender en detalle qué detecta y cómo interpretar los resultados.

### Asunto no en mayúsculas {#subject_not_allcaps}

**Severidad:** warning — **Impacto:** 6 puntos

Escribir el asunto en mayúsculas es uno de los patrones más básicos que los filtros antispam detectan. El énfasis en los asuntos se consigue con palabras bien elegidas, no con mayúsculas.

### Sin exceso de signos de exclamación {#no_excessive_exclamation}

**Severidad:** info — **Impacto:** 3 puntos

Un solo signo de exclamación en el asunto puede ser aceptable en ciertos contextos. Más de uno activa filtros antispam en los principales proveedores.

### Asunto sin Re:/Fwd: engañoso {#no_deceptive_subject}

**Severidad:** blocker — **Impacto:** 10 puntos

Iniciar el asunto con `Re:` o `Fwd:` sin que el correo sea una respuesta real (sin la cabecera `In-Reply-To`) es una práctica engañosa. Google y Microsoft la identifican activamente y la tratan como un intento de manipular al destinatario.

### Sin emojis en el nombre del remitente {#no_emoji_from_name}

**Severidad:** blocker — **Impacto:** 8 puntos

Google identifica los emojis en el nombre visible del remitente como un intento de imitar verificaciones visuales o insignias de confianza. Esta práctica activa filtros antispam de forma directa.

### Sin contenido HTML oculto {#no_hidden_content}

**Severidad:** blocker — **Impacto:** 15 puntos

Ocultar texto en el HTML mediante `display:none`, `visibility:hidden`, `font-size:0`, `opacity:0` o posicionamiento fuera de pantalla es una técnica usada para engañar a los filtros antispam. Google penaliza severamente esta práctica.

### Sin adjuntos con extensiones peligrosas {#no_suspicious_attachments}

**Severidad:** warning — **Impacto:** 10 puntos

Los proveedores de correo bloquean automáticamente los adjuntos con extensiones ejecutables: `.exe`, `.bat`, `.cmd`, `.vbs`, `.js`, `.scr`, `.pif`, `.msi`, `.ps1`. Un correo con estos adjuntos es rechazado antes de llegar al destinatario.

### Cantidad de enlaces razonable {#reasonable_link_count}

**Severidad:** info — **Impacto:** 3 puntos

Más de 25 enlaces en un correo es una señal de spam para los filtros automáticos. Los correos legítimos tienen un número acotado de URLs relevantes.

### Sin acortadores de URL {#no_url_shorteners}

**Severidad:** warning — **Impacto:** 6 puntos

Los servicios como `bit.ly`, `goo.gl` o `tinyurl.com` ocultan el destino real del enlace. Los filtros antispam los penalizan porque se usan para evadir la reputación de dominio. Los enlaces deben apuntar directamente al dominio de la organización.

### Todas las imágenes con atributo alt {#images_have_alt}

**Severidad:** info — **Impacto:** 4 puntos

Las imágenes sin atributo `alt` son penalizadas por filtros antispam y son inaccesibles para usuarios con lectores de pantalla. Cuando una imagen no se carga, el atributo `alt` es lo único que el destinatario ve en su lugar.

### HTML de tamaño menor a 100 KB {#html_size_ok}

**Severidad:** warning — **Impacto:** 5 puntos

Gmail recorta los mensajes cuyo HTML supera los 100 KB y muestra un enlace "Ver mensaje completo". El destinatario no ve el correo completo a menos que haga clic en ese enlace.

### Tamaño del mensaje menor a 10 MB {#no_size_excess}

**Severidad:** warning — **Impacto:** 5 puntos

Los mensajes que superan los 10 MB son rechazados o bloqueados por la mayoría de servidores de destino. Si es necesario compartir archivos grandes, la práctica estándar es usar un servicio de almacenamiento externo e incluir el enlace en el correo.

## Desuscripción {#unsubscribe}

Esta categoría solo aplica a correos masivos (boletines, campañas de marketing). Los correos transaccionales —confirmaciones de contraseña, notificaciones de cuenta, alertas del sistema— se omiten automáticamente. Vellum detecta si un correo es transaccional analizando las cabeceras y las palabras clave del asunto.

Desde febrero de 2024, Google, Microsoft y Apple exigen mecanismos de desuscripción para remitentes que envían más de 5.000 mensajes al día.

### Cabecera List-Unsubscribe presente {#has_list_unsubscribe}

**Severidad:** info — **Impacto:** 2 puntos

La cabecera `List-Unsubscribe` permite a los clientes de correo mostrar un botón de desuscripción directamente en su interfaz, sin que el usuario tenga que abrir el correo. Gmail y Yahoo lo muestran de forma prominente junto al remitente.

### Desuscripción con un clic (RFC 8058) {#has_one_click_unsubscribe}

**Severidad:** info — **Impacto:** 2 puntos

La cabecera `List-Unsubscribe-Post: List-Unsubscribe=One-Click` indica que el servidor acepta solicitudes de desuscripción mediante una petición POST directa. Desde febrero de 2024, Gmail y Yahoo requieren esta implementación para remitentes masivos.

### Enlace de desuscripción en el cuerpo {#has_unsubscribe_body}

**Severidad:** info — **Impacto:** 2 puntos

Además de la cabecera, el cuerpo del correo debe incluir un texto o enlace de desuscripción visible. Google, Microsoft y Apple exigen que sea fácilmente localizable por el destinatario.

## Accesibilidad y visualización {#a11y}

Esta categoría evalúa la experiencia visual del correo en distintos contextos: modo oscuro y contraste de colores.

### Soporte para modo oscuro {#dark_mode_support}

**Severidad:** info — **Impacto:** 3 puntos

Cuando un cliente de correo está en modo oscuro y el HTML no declara soporte explícito para él, el cliente aplica una inversión automática de colores. El resultado puede ser texto negro sobre fondo negro o imágenes con colores invertidos.

Hay dos formas de declarar soporte para modo oscuro en un correo HTML:

```html
<meta name="color-scheme" content="light dark">
```

```css
@media (prefers-color-scheme: dark) {
  /* estilos para modo oscuro */
}
```

Lo más robusto es combinar ambas. La etiqueta meta indica al cliente que el correo maneja los esquemas de color activamente.

### Contraste de texto adecuado {#text_contrast}

**Severidad:** info — **Impacto:** 6 puntos

El análisis verifica los pares de color texto-fondo definidos en estilos inline y calcula si cumplen con el ratio de contraste mínimo de 4.5:1 establecido por las pautas WCAG. Un ratio inferior a 4.5:1 produce texto difícil de leer, especialmente en pantallas de baja calidad o para personas con visión reducida.

El análisis evalúa solo los colores definidos en atributos `style` inline.
