import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export function activate(context: vscode.ExtensionContext) {
  // Función para manejar los cambios de texto
  function createTextDocumentChangeHandler() {
    // Obtener reglas de la configuración global del usuario
    const globalConfig = vscode.workspace.getConfiguration('autoReplace', null);
    const rules = globalConfig.get<{ before: string; after: string }[]>('rules', []);

    // Calcular el tamaño máximo del buffer basado en la regla más larga
    let maxBufferSize = 10; // Valor mínimo predeterminado
    if (rules.length > 0) {
      // Encontrar la longitud del patrón 'before' más largo
      const maxPatternLength = Math.max(...rules.map(rule => rule.before.length));
      // Usamos exactamente el tamaño del patrón más largo
      maxBufferSize = maxPatternLength;
      console.log(`Buffer: max=${maxBufferSize} (patrón más largo)`);
    }

    // Registrar las reglas para depuración (formato simplificado)
    console.log('Reglas:', rules.map(r => `${r.before}->${r.after}`).join(', '));

    // Crear un mapa para almacenar el texto acumulado por documento
    const textBufferByDocument = new Map<string, string>();

    // Limpiar el buffer cuando se cambia de documento
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          const docKey = editor.document.uri.toString();
          textBufferByDocument.set(docKey, '');
          console.log('Buffer limpiado: cambio de documento');
        }
      })
    );

    return vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || event.document !== editor.document) {
        return;
      }

      // Verificar si se ha borrado todo el texto del documento
      if (editor.document.getText().length === 0) {
        const docKey = editor.document.uri.toString();
        textBufferByDocument.set(docKey, '');
        console.log('Buffer limpiado: documento vacío');
      }

      const changes = event.contentChanges;
      if (!changes.length) {
        return;
      }

      // Procesar cambios de texto
      const change = changes[0];

      // Si es una eliminación (texto vacío) y el rango es grande, limpiar el buffer
      if (change && change.text.length === 0 &&
          (change.rangeLength > 10 || change.range.start.line !== change.range.end.line)) {
        const docKey = editor.document.uri.toString();
        textBufferByDocument.set(docKey, '');
        console.log('Buffer limpiado: eliminación grande');
        return;
      }

      // Solo continuamos si hay texto nuevo
      if (!change || change.text.length === 0) {
        return;
      }

      const cursorPos = change.range.end;
      const lineText = editor.document.lineAt(cursorPos.line).text;

      // Obtener el ID único del documento
      const docKey = editor.document.uri.toString();

      // Obtener el buffer actual o inicializarlo
      let textBuffer = textBufferByDocument.get(docKey) || '';

      // Añadir el nuevo texto al buffer
      textBuffer += change.text;

      // Limitar el tamaño del buffer para que contenga como máximo los últimos maxBufferSize caracteres
      if (textBuffer.length > maxBufferSize) {
        textBuffer = textBuffer.substring(textBuffer.length - maxBufferSize);
      }

      // Guardar el buffer actualizado
      textBufferByDocument.set(docKey, textBuffer);

      // Log simplificado
      console.log(`Texto: "${change.text}" | Buffer: "${textBuffer}" | Línea: "${lineText}"`);

      // Procesar cada regla
      for (const rule of rules) {
        const { before, after } = rule;

        // Verificar si el patrón está en la línea actual
        const lastIndex = lineText.lastIndexOf(before, cursorPos.character);
        const isPatternAtCursor = lastIndex !== -1 && lastIndex + before.length === cursorPos.character;

        // Si el patrón está justo antes del cursor en la línea actual
        if (isPatternAtCursor) {
          console.log(`Patrón encontrado en línea: "${before}" → "${after}"`);

          // Calcular el rango a reemplazar
          const startPos = new vscode.Position(cursorPos.line, cursorPos.character - before.length);
          const endPos = cursorPos;
          const range = new vscode.Range(startPos, endPos);

          // Realizar el reemplazo
          editor.edit(editBuilder => {
            editBuilder.replace(range, after);
          }).then(success => {
            if (success) {
              console.log(`Reemplazo exitoso: "${before}" → "${after}"`);

              // Actualizar el buffer después del reemplazo
              if (textBuffer.endsWith(before)) {
                const newBuffer = textBuffer.substring(0, textBuffer.length - before.length) + after;
                textBufferByDocument.set(docKey, newBuffer);

                // Actualizar la posición del cursor para permitir detectar patrones subsiguientes
                const newCursorPos = new vscode.Position(cursorPos.line, cursorPos.character - before.length + after.length);
                editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
              }
            }
          });

          // No salimos después del primer reemplazo para permitir múltiples reemplazos
          // break;
        }
        // Si el patrón no está en la línea pero está en el buffer o la línea actual es el patrón completo
        // O si el patrón está en la línea actual (para patrones subsiguientes)
        else if (textBuffer === before || lineText === before || lineText.includes(before)) {
          console.log(`Patrón completo detectado: "${before}" → "${after}"`);

          // Reemplazar toda la línea actual si es igual al patrón
          if (lineText === before) {
            const startPos = new vscode.Position(cursorPos.line, 0);
            const endPos = new vscode.Position(cursorPos.line, lineText.length);
            const range = new vscode.Range(startPos, endPos);

            console.log(`Reemplazo de línea completa: "${lineText}" → "${after}"`);

            // Realizar el reemplazo
            editor.edit(editBuilder => {
              editBuilder.replace(range, after);
            }).then(success => {
              if (success) {
                console.log(`Reemplazo exitoso: "${lineText}" → "${after}"`);

                // Actualizar el buffer después del reemplazo
                textBufferByDocument.set(docKey, after);

                // Actualizar la posición del cursor para permitir detectar patrones subsiguientes
                const newCursorPos = new vscode.Position(cursorPos.line, after.length);
                editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
              }
            });
          }
          // Si el buffer es igual al patrón y estamos al final de la línea
          else if (cursorPos.character === lineText.length) {
            // Reemplazar toda la línea actual
            const startPos = new vscode.Position(cursorPos.line, 0);
            const endPos = cursorPos;
            const range = new vscode.Range(startPos, endPos);

            console.log(`Reemplazo por buffer: "${lineText}" → "${after}"`);

            // Realizar el reemplazo
            editor.edit(editBuilder => {
              editBuilder.replace(range, after);
            }).then(success => {
              if (success) {
                console.log(`Reemplazo exitoso: "${lineText}" → "${after}"`);

                // Actualizar el buffer después del reemplazo
                textBufferByDocument.set(docKey, after);

                // Actualizar la posición del cursor para permitir detectar patrones subsiguientes
                const newCursorPos = new vscode.Position(cursorPos.line, after.length);
                editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
              }
            });
          }
          // Si el patrón está en la línea actual pero no es toda la línea ni estamos al final
          else if (lineText.includes(before)) {
            // Buscar todas las ocurrencias del patrón en la línea
            let startIndex = 0;
            let foundPatterns = [];

            // Buscar todas las ocurrencias del patrón en la línea
            while (startIndex < lineText.length) {
              const index = lineText.indexOf(before, startIndex);
              if (index === -1) {break;}

              foundPatterns.push({
                start: index,
                end: index + before.length
              });

              startIndex = index + 1; // Avanzar para buscar la siguiente ocurrencia
            }

            // Si encontramos patrones, reemplazar el último (más reciente)
            if (foundPatterns.length > 0) {
              // Tomar el último patrón encontrado (probablemente el más reciente)
              const lastPattern = foundPatterns[foundPatterns.length - 1];

              // Calcular el rango a reemplazar
              const startPos = new vscode.Position(cursorPos.line, lastPattern.start);
              const endPos = new vscode.Position(cursorPos.line, lastPattern.end);
              const range = new vscode.Range(startPos, endPos);

              console.log(`Reemplazando patrón subsiguiente en posición: ${lastPattern.start} a ${lastPattern.end}`);

              // Realizar el reemplazo
              editor.edit(editBuilder => {
                editBuilder.replace(range, after);
              }).then(success => {
                if (success) {
                  console.log(`Reemplazo exitoso de patrón subsiguiente: "${before}" → "${after}"`);

                  // Actualizar el buffer después del reemplazo
                  textBufferByDocument.set(docKey, ''); // Limpiar el buffer para evitar problemas

                  // Actualizar la posición del cursor para permitir detectar patrones subsiguientes
                  const newCursorPos = new vscode.Position(cursorPos.line, lastPattern.start + after.length);
                  editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
                }
              });
            }
          }

          // No salimos después del primer reemplazo para permitir múltiples reemplazos
          // break;
        }
        // Si el patrón está al final del buffer pero no necesariamente al final de la línea
        else if (textBuffer.endsWith(before)) {
          console.log(`Patrón encontrado al final del buffer: "${before}" → "${after}"`);

          // Buscar la última ocurrencia del patrón en la línea actual
          const patternIndex = lineText.lastIndexOf(before, cursorPos.character);

          // Solo proceder si encontramos el patrón en la línea y está cerca del cursor
          // Esto asegura que solo reemplazamos patrones recién escritos
          if (patternIndex !== -1 && patternIndex + before.length >= cursorPos.character - 1) {
            // Calcular el rango a reemplazar
            const startPos = new vscode.Position(cursorPos.line, patternIndex);
            const endPos = new vscode.Position(cursorPos.line, patternIndex + before.length);
            const range = new vscode.Range(startPos, endPos);

            console.log(`Reemplazando en posición: ${patternIndex} a ${patternIndex + before.length}`);

            // Realizar el reemplazo
            editor.edit(editBuilder => {
              editBuilder.replace(range, after);
            }).then(success => {
              if (success) {
                console.log(`Reemplazo exitoso desde buffer: "${before}" → "${after}"`);

                // Actualizar el buffer después del reemplazo
                const newBuffer = textBuffer.substring(0, textBuffer.length - before.length) + after;
                textBufferByDocument.set(docKey, newBuffer);

                // Actualizar la posición del cursor para permitir detectar patrones subsiguientes
                // Movemos el cursor al final del texto reemplazado para facilitar la detección de patrones subsiguientes
                const newCursorPos = new vscode.Position(cursorPos.line, patternIndex + after.length);
                editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
              }
            });
          }
        }
      }
    });
  }

  // Verificar si la extensión está habilitada y registrar el handler
  function checkAndRegisterHandler() {
    // Verificar tanto la configuración global como la del workspace
    const workspaceConfig = vscode.workspace.getConfiguration('autoReplace');
    const globalConfig = vscode.workspace.getConfiguration('autoReplace', null);

    // La extensión está habilitada si está activada en el workspace o globalmente
    const isEnabledWorkspace = workspaceConfig.get<boolean>('enabled', false);
    const isEnabledGlobal = globalConfig.get<boolean>('enabled', false);
    const isEnabled = isEnabledWorkspace || isEnabledGlobal;

    console.log('Auto Replace: Estado de activación:', JSON.stringify({
      workspace: isEnabledWorkspace,
      global: isEnabledGlobal,
      final: isEnabled
    }));

    // Eliminar el handler anterior si existe
    if (textChangeDisposable) {
      textChangeDisposable.dispose();
      textChangeDisposable = undefined;
    }

    if (isEnabled) {
      console.log('Auto Replace está activado y escuchando cambios');
      textChangeDisposable = createTextDocumentChangeHandler();
      context.subscriptions.push(textChangeDisposable);
    } else {
      console.log('Auto Replace está desactivado');
    }
  }

  // Variable para almacenar la suscripción actual
  let textChangeDisposable: vscode.Disposable | undefined;

  // Registrar el handler inicialmente
  checkAndRegisterHandler();

  // Escuchar cambios en la configuración
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('autoReplace')) {
        checkAndRegisterHandler();
      }
    })
  );

  // Comando para activar la extensión en este proyecto
  context.subscriptions.push(vscode.commands.registerCommand('autoReplace.enable', async () => {
    const config = vscode.workspace.getConfiguration();
    await config.update('autoReplace.enabled', true, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage('Auto Replace ha sido activado en este proyecto.');
  }));

  // Comando para activar la extensión globalmente
  context.subscriptions.push(vscode.commands.registerCommand('autoReplace.enableGlobal', async () => {
    const config = vscode.workspace.getConfiguration();
    await config.update('autoReplace.enabled', true, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('Auto Replace ha sido activado globalmente.');
  }));

  // Comando para desactivar la extensión en este proyecto
  context.subscriptions.push(vscode.commands.registerCommand('autoReplace.disable', async () => {
    const config = vscode.workspace.getConfiguration();
    await config.update('autoReplace.enabled', false, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage('Auto Replace ha sido desactivado en este proyecto.');
  }));

  // Comando para desactivar la extensión globalmente
  context.subscriptions.push(vscode.commands.registerCommand('autoReplace.disableGlobal', async () => {
    const config = vscode.workspace.getConfiguration();
    await config.update('autoReplace.enabled', false, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('Auto Replace ha sido desactivado globalmente.');
  }));

  // Comando para editar la configuración global de reemplazos
  context.subscriptions.push(vscode.commands.registerCommand('autoReplace.editGlobalReplacements', async () => {
    await openGlobalReplacementRules();
  }));

  // Comando para mostrar el estado actual de la extensión
  context.subscriptions.push(vscode.commands.registerCommand('autoReplace.showStatus', async () => {
    const workspaceConfig = vscode.workspace.getConfiguration('autoReplace');
    const globalConfig = vscode.workspace.getConfiguration('autoReplace', null);

    const isEnabledWorkspace = workspaceConfig.get<boolean>('enabled', false);
    const isEnabledGlobal = globalConfig.get<boolean>('enabled', false);
    const rules = globalConfig.get<{ before: string; after: string }[]>('rules', []);

    const status = {
      activadoEnWorkspace: isEnabledWorkspace,
      activadoGlobalmente: isEnabledGlobal,
      activado: isEnabledWorkspace || isEnabledGlobal,
      reglas: rules.map(r => `"${r.before}" → "${r.after}"`).join(', ')
    };

    vscode.window.showInformationMessage(`Auto Replace: ${status.activado ? 'Activado' : 'Desactivado'} (${rules.length} reglas)`);
    console.log('Auto Replace: Estado actual:', JSON.stringify(status, null, 2));
  }));
}

export function deactivate() {}

async function openGlobalReplacementRules() {
  try {
    const settingsPath = getUserSettingsPath();

    // Leer el archivo settings.json global
    let content = await fs.readFile(settingsPath, 'utf8');
    let json: any = {};
    try {
      json = JSON.parse(content);
    } catch {
      // Si no es JSON válido, inicializar objeto vacío
      json = {};
    }

    // Asegurar que existen las configuraciones necesarias
    // Nota: Usamos la estructura plana para settings.json global
    // Siempre activamos la extensión globalmente cuando se editan las reglas
    json['autoReplace.enabled'] = true;

    // Asegurarnos de que existan reglas predeterminadas
    if (!json['autoReplace.rules'] || !Array.isArray(json['autoReplace.rules']) || json['autoReplace.rules'].length === 0) {
      json['autoReplace.rules'] = [
        { before: '...', after: '…' },
        { before: '<3', after: '❤️' },
        { before: '->', after: '→' },
        { before: '<-', after: '←' },
        { before: '=>', after: '⇒' }
      ];
    }

    // Registrar para depuración
    console.log('Auto Replace: Configuración global guardada:', JSON.stringify({
      enabled: json['autoReplace.enabled'],
      rules: json['autoReplace.rules']
    }));

    // Guardar JSON formateado de nuevo
    await fs.writeFile(settingsPath, JSON.stringify(json, null, 2), 'utf8');

    // Abrir el archivo en editor
    const doc = await vscode.workspace.openTextDocument(settingsPath);
    const editor = await vscode.window.showTextDocument(doc);

    // Posicionar el cursor en la línea de "autoReplace.rules"
    const lines = doc.getText().split('\n');
    const lineNum = lines.findIndex(line => line.includes('"autoReplace.rules"'));
    if (lineNum !== -1) {
      const pos = new vscode.Position(lineNum, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
    }
  } catch (err) {
    vscode.window.showErrorMessage('Error accediendo a configuración global: ' + String(err));
  }
}

function getUserSettingsPath(): string {
  const platform = process.platform;
  let basePath = '';

  if (platform === 'win32') {
    basePath = path.join(process.env.APPDATA || '', 'Code', 'User');
  } else if (platform === 'darwin') {
    basePath = path.join(process.env.HOME || '', 'Library', 'Application Support', 'Code', 'User');
  } else {
    basePath = path.join(process.env.HOME || '', '.config', 'Code', 'User');
  }

  return path.join(basePath, 'settings.json');
}
