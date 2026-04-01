# Analizador de HTML {#top}

El analizador es una herramienta independiente que permite analizar el HTML de un correo sin necesidad de enviarlo a través del servidor SMTP. Es útil para evaluar plantillas en desarrollo antes de integrarlas con una aplicación real.

El análisis utiliza exactamente el mismo motor que Vellum aplica a los correos recibidos por SMTP. Las verificaciones, la puntuación y la calificación son idénticas.

## Cómo usarlo {#usage}

Accede a la herramienta desde el apartado **Herramientas → Analizador** en el panel lateral.

1. Arrastra un archivo `.html` al área de carga, o haz clic en **Seleccionar archivo** para buscarlo en tu equipo.
2. Pulsa **Analizar**.
3. El resultado aparece debajo con la puntuación, la calificación y el detalle de cada verificación.

Para analizar otra plantilla, pulsa la **X** junto al nombre del archivo y repite el proceso.

### Requisitos del archivo

- El archivo debe tener extensión `.html`.
- El tamaño máximo es **5 MB**.

## Análisis temporal {#temporary}

El análisis no se guarda en ningún lugar. Al recargar la página o navegar a otra sección los resultados se pierden. Esto es por diseño: el analizador es una herramienta de inspección rápida, no un historial de plantillas.

Si necesitas conservar el resultado, copia o exporta la información antes de salir de la página.

## Puntuación esperada en HTML puro {#score-expectations}

Cuando se analiza un archivo HTML de forma aislada, el motor no dispone de las cabeceras y metadatos que normalmente acompañan a un correo real. Esto hace que varias verificaciones fallen o se omitan de forma estructural, independientemente de la calidad del HTML.

Los checks afectados son:

| Verificación | Motivo | Severidad | Impacto |
|---|---|---|---|
| Contiene versión texto plano | El archivo solo tiene HTML | warning | -8 pts |
| El asunto no está vacío | No hay asunto en un archivo HTML | warning | -6 pts |
| Cabecera Date presente | No hay cabeceras en el archivo | warning | -5 pts |
| Contiene Message-ID | No hay cabeceras en el archivo | blocker | -10 pts |
| El remitente incluye nombre visible | No hay campo From en el archivo | warning | -5 pts |

Esto significa que **un HTML técnicamente perfecto no superará los 66 puntos** en el analizador de archivos, y no obtendrá la distinción **Vellum Verified** por la ausencia del Message-ID.

Esta limitación es esperada y correcta: un correo real siempre debe incluir esas cabeceras. El analizador por archivo permite evaluar el contenido HTML de la plantilla, mientras que el análisis completo sobre correos recibidos por SMTP evalúa también la estructura del mensaje.

## Diferencia con el análisis por SMTP {#vs-smtp}

| | Analizador por archivo | Análisis por SMTP |
|---|---|---|
| Fuente del HTML | Archivo `.html` subido manualmente | Correo recibido por el servidor |
| Cabeceras del mensaje | No disponibles | Disponibles (From, Date, Message-ID…) |
| Texto plano | No disponible | Disponible si el correo lo incluye |
| Adjuntos | No evaluados | Evaluados |
| Se guarda en la base de datos | No | Sí |
| Resultado persistente | No — se pierde al recargar | Sí — consulta disponible en cualquier momento |

El flujo recomendado para un equipo de desarrollo es usar el analizador de archivos para iteraciones rápidas de la plantilla HTML, y luego enviar el correo final a través del SMTP de Vellum para obtener el análisis completo con todas las cabeceras.

