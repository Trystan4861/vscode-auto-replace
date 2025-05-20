# Guía rápida para la extensión Auto Replace

## Estructura del proyecto

* Esta carpeta contiene todos los archivos necesarios para la extensión Auto Replace.
* `package.json` - Este es el archivo de manifiesto donde se declaran las configuraciones, comandos y metadatos de la extensión.
  * The sample plugin registers a command and defines its title and command name. With this information VS Code can show the command in the command palette. It doesn’t yet need to load the plugin.
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

* You can relaunch the extension from the debug toolbar after changing code in `src/extension.ts`.
* You can also reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with your extension to load your changes.

## Explore the API

* You can open the full set of our API when you open the file `node_modules/@types/vscode/index.d.ts`.

## Run tests

* Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
* Run the "watch" task via the **Tasks: Run Task** command. Make sure this is running, or tests might not be discovered.
* Open the Testing view from the activity bar and click the Run Test" button, or use the hotkey `Ctrl/Cmd + ; A`
* See the output of the test result in the Test Results view.
* Make changes to `src/test/extension.test.ts` or create new test files inside the `test` folder.
  * The provided test runner will only consider files matching the name pattern `**.test.ts`.
  * You can create folders inside the `test` folder to structure your tests any way you want.

## Go further

* [Follow UX guidelines](https://code.visualstudio.com/api/ux-guidelines/overview) to create extensions that seamlessly integrate with VS Code's native interface and patterns.
* Reduce the extension size and improve the startup time by [bundling your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).
* [Publish your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) on the VS Code extension marketplace.
* Automate builds by setting up [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration).
* Integrate to the [report issue](https://code.visualstudio.com/api/get-started/wrapping-up#issue-reporting) flow to get issue and feature requests reported by users.
