# Guía rápida para la extensión Auto Replace

## Estructura del proyecto

* Esta carpeta contiene todos los archivos necesarios para la extensión Auto Replace.
* `package.json` - Este es el archivo de manifiesto donde se declaran las configuraciones, comandos y metadatos de la extensión.
  * Define los comandos `autoReplace.enable`, `autoReplace.disable` y `autoReplace.editGlobalReplacements` que aparecen en la paleta de comandos.
  * Configura las propiedades `autoReplace.enabled` y `autoReplace.rules` que los usuarios pueden modificar.
* `src/extension.ts` - Este es el archivo principal que contiene la implementación de la extensión.
  * Exporta la función `activate` que se llama cuando la extensión se activa.
  * Implementa la lógica de reemplazo automático y los comandos para gestionar la configuración.

## Ejecutar y probar la extensión

* Presiona `F5` para abrir una nueva ventana con la extensión cargada.
* Ejecuta los comandos desde la paleta de comandos (`Ctrl+Shift+P` o `Cmd+Shift+P` en Mac):
  * `Auto Replace: Activar en este proyecto`
  * `Auto Replace: Desactivar en este proyecto`
  * `Auto Replace: Editar lista de reemplazos global`
* Configura algunas reglas de reemplazo y prueba escribiendo los patrones configurados.
* Establece puntos de interrupción en `src/extension.ts` para depurar la extensión.
* Revisa la salida de la extensión en la consola de depuración.

## Realizar cambios

* Puedes relanzar la extensión desde la barra de herramientas de depuración después de cambiar el código en `src/extension.ts`.
* También puedes recargar (`Ctrl+R` o `Cmd+R` en Mac) la ventana de VS Code con tu extensión para cargar los cambios.

## Explorar la API

* Puedes explorar el conjunto completo de la API de VS Code abriendo el archivo `node_modules/@types/vscode/index.d.ts`.
* La extensión utiliza principalmente:
  * `workspace.onDidChangeTextDocument` para detectar cambios en el texto
  * `window.activeTextEditor` para acceder al editor activo
  * `workspace.getConfiguration` para gestionar la configuración

## Ejecutar pruebas

* Instala el [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
* Ejecuta la tarea "watch" a través del comando **Tasks: Run Task**. Asegúrate de que esté en ejecución, o las pruebas podrían no ser descubiertas.
* Abre la vista de Testing desde la barra de actividades y haz clic en el botón "Run Test", o usa el atajo `Ctrl/Cmd + ; A`
* Consulta el resultado de la prueba en la vista Test Results.
* Modifica `src/test/extension.test.ts` o crea nuevos archivos de prueba dentro de la carpeta `test`.
  * El ejecutor de pruebas solo considerará archivos que coincidan con el patrón `**.test.ts`.

## Próximos pasos

* [Sigue las directrices de UX](https://code.visualstudio.com/api/ux-guidelines/overview) para crear extensiones que se integren perfectamente con la interfaz y los patrones nativos de VS Code.
* Reduce el tamaño de la extensión y mejora el tiempo de inicio [empaquetando tu extensión](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
* [Publica tu extensión](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) en el marketplace de extensiones de VS Code.
* Automatiza las compilaciones configurando [Integración Continua](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).
* Integra el [flujo de reporte de problemas](https://code.visualstudio.com/api/get-started/wrapping-up#issue-reporting) para que los usuarios puedan reportar problemas y solicitar nuevas funcionalidades.
