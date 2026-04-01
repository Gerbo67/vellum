# Modo oscuro en correos {#top}

Los clientes de correo tienen dos comportamientos distintos frente al modo oscuro: algunos respetan el CSS que escribiste, y otros lo ignoran por completo e invierten los colores por su cuenta. Son dos problemas diferentes y requieren soluciones diferentes.

## Modo oscuro estándar {#standard-dark-mode}

El modo oscuro estándar funciona mediante una media query CSS y, opcionalmente, una etiqueta meta de esquema de color. Los clientes que lo soportan aplican los estilos que tú defines cuando el sistema operativo del destinatario está en modo oscuro.

Los clientes que respetan este modo: **Apple Mail**, **Thunderbird** y algunas versiones recientes de **Outlook para Mac**.

Para que funcione, el HTML del correo necesita declarar soporte explícito:

```html
<meta name="color-scheme" content="light dark">
```

```css
@media (prefers-color-scheme: dark) {
  body {
    background-color: #1a1a1a;
    color: #e5e5e5;
  }
  /* resto de overrides */
}
```

La etiqueta meta le indica al cliente que el correo está preparado para ambos esquemas. Sin ella, algunos clientes pueden no activar la media query aunque el sistema esté en modo oscuro. La media query define exactamente cómo deben verse los elementos cuando el modo oscuro está activo.

Si el correo no tiene ninguna de las dos declaraciones, el cliente aplica su propio comportamiento por defecto, que en la mayoría de casos resulta en una inversión de colores no controlada.

## Modo oscuro forzado {#forced-dark-mode}

El modo oscuro forzado es diferente: el cliente ignora completamente el CSS del correo y aplica su propio algoritmo de inversión de color. No importa si tienes una media query bien escrita. El cliente convierte los fondos claros en oscuros y los colores oscuros en claros usando su propia lógica.

Los clientes que hacen esto: **Gmail para Android e iOS** y **Outlook para Windows**.

El resultado puede ser impredecible:

- Fondos blancos se vuelven grises oscuros o negros.
- Textos que eran oscuros se vuelven claros, pero con matices de color que no esperabas.
- Imágenes PNG con fondo transparente que contienen iconos o logos oscuros quedan completamente invisibles, porque el ícono negro sobre fondo transparente ahora está sobre un fondo negro.
- Gradientes y bordes pueden quedar con colores extraños.

Para mitigar los efectos del modo oscuro forzado sin que rompas el diseño en modo claro:

- Añade un borde o resplandor blanco sutil a los logos e iconos que usen PNG transparente.
- Evita depender de que el texto heredará el color correcto; define colores explícitos con `color` inline donde el contraste sea crítico.
- Prueba el correo con la opción de **oscuro forzado** en la vista previa de Vellum, que simula el algoritmo de Gmail y Outlook antes de enviarlo.

## Por qué no basta con uno solo {#why-both}

Escribir solo la media query estándar no protege el correo en Gmail app ni en Outlook para Windows, porque esos clientes no la leen. Pero ignorar la media query y confiar en que todos los clientes fuercen los colores tampoco funciona, porque Apple Mail y Thunderbird sí respetan el CSS y el correo quedaría sin estilos propios en modo oscuro.

El enfoque más robusto es declarar soporte en la meta de esquema de color, escribir los overrides en la media query para los clientes estándar, y verificar el resultado con la simulación de modo oscuro forzado para asegurarse de que las imágenes y los colores críticos resisten la inversión automática.
