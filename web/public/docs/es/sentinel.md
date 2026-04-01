# Vellum Sentinel {#top}

Vellum Sentinel es el motor de detección de contenido spam integrado en Vellum. Analiza cada correo que entra al sistema y produce una evaluación de su contenido, expresada como un porcentaje de probabilidad de ser marcado como correo no deseado.

No requiere conexión a internet. Opera completamente dentro del proceso de Vellum, sin enviar datos a servicios externos ni añadir latencia perceptible al flujo de análisis.

## Qué detecta {#what-it-detects}

Vellum Sentinel reconoce patrones de contenido que los proveedores de correo reales (Gmail, Outlook, Yahoo) usan como señales negativas. Entre ellos:

- **Urgencia artificial** — lenguaje diseñado para presionar al destinatario a actuar de inmediato sin reflexión
- **Promesas de ganancia o premio** — promesas de dinero fácil, sorteos, premios sin contexto real
- **Ofertas agresivas** — descuentos extremos, productos gratuitos sin justificación
- **Patrones de marketing invasivo** — llamadas a la acción repetitivas, lenguaje hiperbólico
- **Vocabulario de fraude conocido** — términos recurrentes en campañas de phishing y estafa

La detección funciona en español, inglés y portugués simultáneamente. Un correo puede mezclar los tres idiomas y Sentinel lo evalúa de forma coherente.

## Cómo aparece en el análisis {#in-analysis}

El resultado de Vellum Sentinel aparece como el check **"Contenido sin indicadores de spam"** dentro de la categoría **Entregabilidad** del panel de análisis.

Cuando el contenido supera el umbral de riesgo, el check falla y muestra un detalle como el siguiente:

> El contenido del correo tiene un 88 % de probabilidad de ser marcado como spam. Palabras detectadas: [urgente, gratis, gana, dinero, reclama].

Cuando el contenido es aceptable, el check pasa e indica la probabilidad estimada:

> El contenido no presenta indicadores de spam (probabilidad: 12 %).

La probabilidad se calcula siempre sobre la combinación del **asunto y el cuerpo de texto** del correo. Si el correo no tiene cuerpo de texto, el check se omite.

## Cómo interpretar los resultados {#interpreting}

### El check pasa pero la probabilidad no es cero

Una probabilidad baja (por debajo del 25 %) es lo esperado en correos transaccionales normales: confirmaciones de pedido, restablecimiento de contraseña, notificaciones de sistema. No existe un correo con 0 % de probabilidad; el objetivo es mantenerse por debajo del umbral.

### El check falla con palabras detectadas

Las palabras que aparecen en el detalle son los términos que más contribuyeron a la clasificación. Revisa si aparecen en el asunto o en el cuerpo con un tono agresivo o sensacionalista. Cambiar el contexto o la redacción puede reducir la probabilidad significativamente.

### La probabilidad es alta pero el contenido parece legítimo

Puede ocurrir en correos que combinan varios términos que son inofensivos por separado pero que Sentinel reconoce como una combinación sospechosa. En ese caso revisa si el correo tiene también problemas en otras categorías del análisis — un correo con buenas cabeceras RFC, texto plano y dominio de envío limpio tiene mucho menos riesgo real aunque Sentinel detecte algo en el contenido.

## Limitaciones conocidas {#limitations}

Vellum Sentinel es un detector estadístico, no un clasificador perfecto. Conviene tener en cuenta lo siguiente:

- **Falsos positivos**: correos legítimos de marketing (boletines, newsletters bien formados) pueden obtener probabilidades más altas de lo esperado si usan vocabulario promocional intenso.
- **Falsos negativos**: spam muy sofisticado o en idiomas poco representados en el modelo puede obtener probabilidades bajas.
- **El análisis es offline**: Sentinel no consulta listas de reputación de dominios ni IPs. Un correo puede pasar el análisis de contenido y aun así ser rechazado en producción por la reputación del servidor de envío.
- **Correos sin texto plano**: si el correo solo tiene cuerpo HTML, Sentinel solo analiza el asunto. El texto visible en el HTML no se procesa. Incluir siempre una versión de texto plano mejora tanto el análisis como la entregabilidad real.

