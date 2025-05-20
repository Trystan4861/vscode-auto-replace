# Auto Replace

Una extensión para Visual Studio Code que reemplaza automáticamente patrones de texto mientras escribes.

## Características

- Reemplaza automáticamente texto específico mientras escribes
- Configura tus propias reglas de reemplazo personalizadas
- Activa o desactiva la extensión por proyecto
- Edita fácilmente la configuración global de reemplazos

## Instalación

1. Abre Visual Studio Code
2. Ve a la pestaña de Extensiones (Ctrl+Shift+X)
3. Busca "Auto Replace"
4. Haz clic en Instalar

## Uso

La extensión monitorea lo que escribes y reemplaza automáticamente patrones de texto configurados. Por ejemplo, puedes configurar que `<3` se reemplace automáticamente por `❤️` o que `...` se reemplace por `…`.

### Activar/Desactivar

Por defecto, la extensión está desactivada. Puedes activarla de dos formas:

1. **Por proyecto**:
   - Abre la paleta de comandos (Ctrl+Shift+P)
   - Busca y selecciona `Auto Replace: Activar en este proyecto`

2. **Globalmente**:
   - Abre la configuración de VS Code (Archivo > Preferencias > Configuración)
   - Busca "autoReplace.enabled"
   - Marca la casilla para activar

Para desactivar, usa el comando `Auto Replace: Desactivar en este proyecto` o desmarca la opción en la configuración.

## Configuración

### Configurar reglas de reemplazo

Puedes configurar tus propias reglas de reemplazo de dos maneras:

1. **Usando el comando**:
   - Abre la paleta de comandos (Ctrl+Shift+P)
   - Busca y selecciona `Auto Replace: Editar lista de reemplazos global`
   - Se abrirá el archivo settings.json con la configuración de Auto Replace

2. **Manualmente**:
   - Abre la configuración de VS Code (Archivo > Preferencias > Configuración)
   - Haz clic en "Editar en settings.json"
   - Añade o modifica la configuración de `autoReplace.rules`

### Formato de las reglas

Las reglas se definen como un array de objetos con propiedades `before` y `after`:

```json
"autoReplace.rules": [
  { "before": "...", "after": "…" },
  { "before": "<3", "after": "❤️" },
  { "before": "->", "after": "→" }
]
```

Cada vez que escribas el texto especificado en `before`, será reemplazado automáticamente por el texto en `after`.

## Ejemplos de uso

### Símbolos y emojis

- `<3` → `❤️`
- `->` → `→`
- `<-` → `←`
- `=>` → `⇒`
- `...` → `…`

### Correcciones comunes

- `teh` → `the`
- `dont` → `don't`
- `cant` → `can't`

### Abreviaturas de código

- `cl` → `console.log()`
- `imp` → `import { } from '';`
- `fn` → `function() {}`

## Contribuir

Las contribuciones son bienvenidas. Si encuentras un error o tienes una sugerencia, por favor crea un issue en el repositorio GitHub.

## Licencia

[MIT](LICENSE.md)
