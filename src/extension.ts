import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export function activate(context: vscode.ExtensionContext) {
  // Mapa para almacenar patrones detectados pendientes de reemplazo
  const pendingReplacements = new Map<string, {
    pattern: string,
    replacement: string,
    range: vscode.Range,
    tooltipTimeout: NodeJS.Timeout | undefined
  }>();

  // Decoración para resaltar el texto que se puede reemplazar
  const tooltipDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(100, 100, 255, 0.1)',
    border: '1px dashed rgba(100, 100, 255, 0.5)',
    borderRadius: '2px',
    after: {
      contentText: ' ⮕ ',
      color: 'rgba(100, 100, 255, 0.8)'
    }
  });

  // Registrar el proveedor de hover para mostrar tooltips
  const hoverProvider = vscode.languages.registerHoverProvider('*', {
    provideHover(document, position, token) {
      const docKey = document.uri.toString();
      const pendingReplacement = pendingReplacements.get(docKey);

      if (pendingReplacement) {
        // Verificar si la posición está dentro del rango del reemplazo pendiente
        if (pendingReplacement.range.contains(position)) {
          const content = new vscode.MarkdownString();
          content.appendMarkdown(`**Auto Replace:** \`${pendingReplacement.pattern}\` → \`${pendingReplacement.replacement}\``);
          content.appendMarkdown('\n\n*(Pulsa Enter para aplicar, Esc para cancelar)*');
          content.isTrusted = true;

          return new vscode.Hover(content, pendingReplacement.range);
        }
      }
      return null;
    }
  });

  context.subscriptions.push(hoverProvider);

  // Función para limpiar un reemplazo pendiente
  function clearPendingReplacement(docKey: string) {
    console.log(`Limpiando reemplazo pendiente para documento: ${docKey}`);

    // Limpiar todas las decoraciones en todos los editores
    vscode.window.visibleTextEditors.forEach(editor => {
      editor.setDecorations(tooltipDecorationType, []);
    });

    const pendingReplacement = pendingReplacements.get(docKey);
    if (pendingReplacement) {
      // Limpiar el timeout si existe
      if (pendingReplacement.tooltipTimeout) {
        clearTimeout(pendingReplacement.tooltipTimeout);
      }

      // Eliminar el reemplazo pendiente
      pendingReplacements.delete(docKey);

      // Limpiar el mensaje de la barra de estado
      vscode.window.setStatusBarMessage('', 0);
    }
  }

  // Función para mostrar el tooltip con la información de reemplazo
  function showTooltip(editor: vscode.TextEditor, docKey: string, pattern: string, replacement: string, range: vscode.Range) {
    console.log(`Mostrando tooltip para patrón: "${pattern}" -> "${replacement}"`);

    // Limpiar cualquier reemplazo pendiente anterior
    clearPendingReplacement(docKey);

    // Mostrar la decoración en el texto
    editor.setDecorations(tooltipDecorationType, [range]);

    // Mostrar un mensaje en la barra de estado
    const tooltipMessage = `Autoreplace: "${pattern}" -> "${replacement}" (Pulsa Enter para aplicar, Esc para cancelar)`;
    vscode.window.setStatusBarMessage(tooltipMessage, 3000);

    // Guardar el reemplazo pendiente con un timeout de 3 segundos
    const tooltipTimeout = setTimeout(() => {
      console.log(`Timeout alcanzado para patrón: "${pattern}"`);
      clearPendingReplacement(docKey);
    }, 3000);

    // Guardar el reemplazo pendiente
    pendingReplacements.set(docKey, {
      pattern,
      replacement,
      range,
      tooltipTimeout
    });

    console.log(`Reemplazo pendiente guardado para: "${pattern}"`);
  }

  // Limpiar reemplazos pendientes cuando se cambia de documento
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        const docKey = editor.document.uri.toString();
        clearPendingReplacement(docKey);
      }
    })
  );

  // Función para manejar los cambios de texto
  function createTextDocumentChangeHandler() {
    // Obtener configuraciones
    const globalConfig = vscode.workspace.getConfiguration('autoReplace', null);
    const workspaceConfig = vscode.workspace.getConfiguration('autoReplace');

    // Verificar estados de activación
    const isGlobalDictEnabled = globalConfig.get<boolean>('enabledGlobal', false);
    const isLocalDictEnabled = workspaceConfig.get<boolean>('enabledLocal', false);

    // Verificar si se requiere Enter para reemplazar
    // Según DESCRIPTION.yml, esto debe tratarse como una constante con valor true
    const requireEnterToReplace = true;

    // Obtener reglas según los estados de activación
    const globalRules = isGlobalDictEnabled ? globalConfig.get<{ before: string; after: string }[]>('rules', []) : [];
    const localRules = isLocalDictEnabled ? workspaceConfig.get<{ before: string; after: string }[]>('localRules', []) : [];

    // Crear un mapa para combinar reglas, dando prioridad a las locales
    const ruleMap = new Map<string, string>();

    // Primero añadir reglas globales
    globalRules.forEach(rule => {
      ruleMap.set(rule.before, rule.after);
    });

    // Luego añadir reglas locales (sobrescribirán las globales si hay conflicto)
    localRules.forEach(rule => {
      ruleMap.set(rule.before, rule.after);
    });

    // Convertir el mapa de reglas de nuevo a un array
    const rules = Array.from(ruleMap.entries()).map(([before, after]) => ({ before, after }));

    console.log(`Auto Replace: Reglas cargadas - Global: ${globalRules.length}, Local: ${localRules.length}, Combinadas: ${rules.length}`);

    // Registrar las reglas cargadas
    if (rules.length > 0) {
      console.log(`Auto Replace: ${rules.length} reglas cargadas`);
    }

    // Crear un evento compuesto que combine onDidChangeTextDocument y onDidChangeSelection
    return vscode.Disposable.from(
      vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || event.document !== editor.document) {
          return;
        }

        const changes = event.contentChanges;
        if (!changes.length) {
          return;
        }

        // Procesar cambios de texto
        const change = changes[0];

        // Solo continuamos si hay texto nuevo
        if (!change || change.text.length === 0) {
          return;
        }

        // Si el texto ingresado es un Enter, no procesamos aquí
        // ya que se manejará en el comando de Enter
        if (change.text === '\r\n' || change.text === '\n') {
          return;
        }

        // Obtener el ID único del documento
        const docKey = editor.document.uri.toString();

        // Si hay un reemplazo pendiente y se está escribiendo algo (que no sea Enter)
        // cancelamos el reemplazo pendiente inmediatamente
        if (pendingReplacements.has(docKey)) {
          console.log(`Texto ingresado: "${change.text}" después de un patrón pendiente - CANCELANDO`);
          clearPendingReplacement(docKey);
          // Continuamos procesando para detectar nuevos patrones
        }

        // Programar la detección de patrones para el próximo ciclo de eventos
        // Esto permite que VS Code termine de procesar el cambio de texto actual
        setTimeout(() => checkForPatterns(editor), 0);
      }),

      // También verificamos patrones cuando cambia la selección (cursor)
      vscode.window.onDidChangeTextEditorSelection(event => {
        const editor = event.textEditor;
        checkForPatterns(editor);
      })
    );

    // Función para verificar patrones en el texto actual
    function checkForPatterns(editor: vscode.TextEditor) {
      // Obtener el ID único del documento
      const docKey = editor.document.uri.toString();

      // Si ya hay un reemplazo pendiente, no buscamos nuevos patrones
      if (pendingReplacements.has(docKey)) {
        return;
      }

      // Obtener la posición del cursor
      const cursorPos = editor.selection.active;
      const lineText = editor.document.lineAt(cursorPos.line).text;

      // Procesar cada regla
      for (const rule of rules) {
        const { before, after } = rule;

        // Verificar si tenemos suficientes caracteres para formar el patrón
        if (cursorPos.character < before.length) {
          continue;
        }

        // Verificar que el patrón está al final de lo que acabamos de escribir
        const textUpToCursor = lineText.substring(0, cursorPos.character);

        // Verificar si el texto termina con el patrón
        if (!textUpToCursor.endsWith(before)) {
          continue;
        }

        // Si llegamos aquí, hemos encontrado un patrón válido al final del texto
        const startPos = cursorPos.character - before.length;

        console.log(`Patrón "${before}" detectado en posición ${startPos}-${cursorPos.character}`);

        // Si llegamos aquí, hemos encontrado un patrón válido
        // Calcular el rango a reemplazar
        const startPosition = new vscode.Position(cursorPos.line, startPos);
        const endPosition = cursorPos;
        const range = new vscode.Range(startPosition, endPosition);

        // Mostrar tooltip y guardar el reemplazo pendiente
        showTooltip(editor, docKey, before, after, range);

        // Solo procesamos el primer patrón encontrado
        break;
      }
    }
  }

  // Variable para almacenar la suscripción al evento de cambio de texto
  let currentTextChangeDisposable: vscode.Disposable | undefined;

  // Verificar si la extensión está habilitada y registrar el handler
  function checkAndRegisterHandler() {
    // Verificar tanto la configuración global como la del workspace
    const workspaceConfig = vscode.workspace.getConfiguration('autoReplace');
    const globalConfig = vscode.workspace.getConfiguration('autoReplace', null);

    // Verificar estados de activación de los diccionarios
    const isGlobalDictEnabled = globalConfig.get<boolean>('enabledGlobal', false);
    const isLocalDictEnabled = workspaceConfig.get<boolean>('enabledLocal', false);

    // La extensión está habilitada si al menos uno de los diccionarios está activado
    const isEnabled = isGlobalDictEnabled || isLocalDictEnabled;

    // Si hay una suscripción previa, eliminarla
    if (currentTextChangeDisposable) {
      currentTextChangeDisposable.dispose();
      currentTextChangeDisposable = undefined;
    }

    // Si la extensión está habilitada, registrar el handler
    if (isEnabled) {
      console.log('Auto Replace: Extensión habilitada');
      currentTextChangeDisposable = createTextDocumentChangeHandler();
    } else {
      console.log('Auto Replace: Extensión deshabilitada');
    }

    return currentTextChangeDisposable;
  }

  // Registrar el comando para habilitar/deshabilitar la extensión
  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.toggleGlobal', () => {
      const config = vscode.workspace.getConfiguration('autoReplace', null);
      const currentValue = config.get<boolean>('enabledGlobal', false);
      config.update('enabledGlobal', !currentValue, vscode.ConfigurationTarget.Global).then(() => {
        vscode.window.showInformationMessage(`Auto Replace: Diccionario global ${!currentValue ? 'habilitado' : 'deshabilitado'}`);
        checkAndRegisterHandler();
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.toggleLocal', () => {
      const config = vscode.workspace.getConfiguration('autoReplace');
      const currentValue = config.get<boolean>('enabledLocal', false);
      config.update('enabledLocal', !currentValue, vscode.ConfigurationTarget.Workspace).then(() => {
        vscode.window.showInformationMessage(`Auto Replace: Diccionario local ${!currentValue ? 'habilitado' : 'deshabilitado'}`);
        checkAndRegisterHandler();
      });
    })
  );

  // Registrar el comando para manejar la tecla Enter
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('autoReplace.handleEnterKey', (editor) => {
      console.log('Ejecutando handleEnterKey');
      const docKey = editor.document.uri.toString();
      const pendingReplacement = pendingReplacements.get(docKey);

      if (pendingReplacement) {
        console.log('Encontrado reemplazo pendiente para aplicar');
        const { pattern, replacement, range } = pendingReplacement;

        // Limpiar el reemplazo pendiente
        clearPendingReplacement(docKey);

        // Realizar el reemplazo
        editor.edit(editBuilder => {
          editBuilder.replace(range, replacement);
        }).then(success => {
          if (success) {
            console.log(`Reemplazo exitoso: "${pattern}" → "${replacement}"`);
            vscode.window.setStatusBarMessage(`Auto Replace: "${pattern}" → "${replacement}"`, 2000);
          }
        });
        return true; // Indicar que se ha manejado el Enter
      }

      return false; // Permitir que Enter funcione normalmente
    })
  );

  // Registrar el comando para manejar la tecla Escape
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('autoReplace.handleEscapeKey', (editor) => {
      console.log('Ejecutando handleEscapeKey');
      const docKey = editor.document.uri.toString();

      if (pendingReplacements.has(docKey)) {
        console.log('Encontrado reemplazo pendiente para cancelar');
        const pattern = pendingReplacements.get(docKey)?.pattern;

        // Limpiar el reemplazo pendiente
        clearPendingReplacement(docKey);

        // Mostrar mensaje de cancelación
        if (pattern) {
          vscode.window.setStatusBarMessage(`Auto Replace: Reemplazo de "${pattern}" cancelado`, 2000);
        }

        return true; // Indicar que se ha manejado el Escape
      }

      return false; // Permitir que Escape funcione normalmente
    })
  );

  // Registrar el keybinding para Enter y Escape
  context.subscriptions.push(
    vscode.commands.registerCommand('type', args => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return vscode.commands.executeCommand('default:type', args);
      }

      // Si se pulsa Enter
      if (args.text === '\n' || args.text === '\r\n') {
        console.log('Tecla Enter detectada');
        const docKey = editor.document.uri.toString();

        if (pendingReplacements.has(docKey)) {
          // Ejecutar el comando de reemplazo y no enviar el Enter al documento
          vscode.commands.executeCommand('autoReplace.handleEnterKey');
          return; // No propagamos el Enter
        }
      }

      // Para cualquier otra tecla (que no sea Enter), cancelamos el reemplazo pendiente
      const docKey = editor.document.uri.toString();
      if (pendingReplacements.has(docKey)) {
        console.log(`Tecla detectada: "${args.text}" - Cancelando reemplazo pendiente`);
        // Ejecutar el comando para cancelar el reemplazo
        vscode.commands.executeCommand('autoReplace.handleEscapeKey');
        // Continuamos con el comportamiento normal de la tecla
      }

      // Comportamiento predeterminado para todas las teclas que no sean Enter
      return vscode.commands.executeCommand('default:type', args);
    })
  );

  // Escuchar cambios en la configuración
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('autoReplace')) {
        console.log('Configuración de Auto Replace cambiada, recargando...');
        checkAndRegisterHandler();
      }
    })
  );

  // Registrar el comando para abrir el archivo de reglas globales
  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.openGlobalRules', async () => {
      await openGlobalReplacementRules();
    })
  );

  // Registrar el comando para abrir el archivo de reglas locales
  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.openLocalRules', async () => {
      await openLocalReplacementRules();
    })
  );

  // Registrar el comando para mostrar el estado actual
  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.showStatus', () => {
      const globalConfig = vscode.workspace.getConfiguration('autoReplace', null);
      const workspaceConfig = vscode.workspace.getConfiguration('autoReplace');

      const isGlobalDictEnabled = globalConfig.get<boolean>('enabledGlobal', false);
      const isLocalDictEnabled = workspaceConfig.get<boolean>('enabledLocal', false);
      // Según DESCRIPTION.yml, esto debe tratarse como una constante con valor true
      const requireEnterToReplace = true;

      const globalRules = isGlobalDictEnabled ? globalConfig.get<{ before: string; after: string }[]>('rules', []) : [];
      const localRules = isLocalDictEnabled ? workspaceConfig.get<{ before: string; after: string }[]>('localRules', []) : [];

      const statusMessage = [
        `Estado de Auto Replace:`,
        `- Diccionario global: ${isGlobalDictEnabled ? 'Activado' : 'Desactivado'} (${globalRules.length} reglas)`,
        `- Diccionario local: ${isLocalDictEnabled ? 'Activado' : 'Desactivado'} (${localRules.length} reglas)`,
        `- Modo de reemplazo: Con Enter`
      ].join('\n');

      vscode.window.showInformationMessage(statusMessage);
    })
  );

  // Registrar comandos para habilitar/deshabilitar el diccionario global
  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.enableGlobalDict', () => {
      const config = vscode.workspace.getConfiguration('autoReplace', null);
      config.update('enabledGlobal', true, vscode.ConfigurationTarget.Global).then(() => {
        vscode.window.showInformationMessage('Auto Replace: Diccionario global habilitado');
        checkAndRegisterHandler();
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.disableGlobalDict', () => {
      const config = vscode.workspace.getConfiguration('autoReplace', null);
      config.update('enabledGlobal', false, vscode.ConfigurationTarget.Global).then(() => {
        vscode.window.showInformationMessage('Auto Replace: Diccionario global deshabilitado');
        checkAndRegisterHandler();
      });
    })
  );

  // Registrar comandos para habilitar/deshabilitar el diccionario local
  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.enableLocalDict', () => {
      const config = vscode.workspace.getConfiguration('autoReplace');
      config.update('enabledLocal', true, vscode.ConfigurationTarget.Workspace).then(() => {
        vscode.window.showInformationMessage('Auto Replace: Diccionario local habilitado');
        checkAndRegisterHandler();
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.disableLocalDict', () => {
      const config = vscode.workspace.getConfiguration('autoReplace');
      config.update('enabledLocal', false, vscode.ConfigurationTarget.Workspace).then(() => {
        vscode.window.showInformationMessage('Auto Replace: Diccionario local deshabilitado');
        checkAndRegisterHandler();
      });
    })
  );

  // El comando toggleEnterToReplace se ha eliminado porque requireEnterToReplace debe tratarse como una constante

  // Registrar comando para editar reemplazos globales (alias para openGlobalRules)
  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.editGlobalReplacements', async () => {
      await openGlobalReplacementRules();
    })
  );

  // Registrar comando para editar reemplazos locales (alias para openLocalRules)
  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.editLocalReplacements', async () => {
      await openLocalReplacementRules();
    })
  );

  // Registrar comando para limpiar todas las decoraciones
  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.clearAllDecorations', () => {
      // Limpiar todas las decoraciones en todos los editores
      vscode.window.visibleTextEditors.forEach(editor => {
        editor.setDecorations(tooltipDecorationType, []);
      });

      // Limpiar todos los reemplazos pendientes
      pendingReplacements.forEach((value, key) => {
        if (value.tooltipTimeout) {
          clearTimeout(value.tooltipTimeout);
        }
      });
      pendingReplacements.clear();

      vscode.window.showInformationMessage('Auto Replace: Todas las decoraciones han sido limpiadas');
    })
  );

  // Función para abrir el archivo de reglas globales
  async function openGlobalReplacementRules() {
    try {
      // Obtener la ruta del archivo de configuración global
      const globalStoragePath = context.globalStorageUri.fsPath;
      const globalRulesPath = path.join(globalStoragePath, 'global_rules.json');

      // Verificar si el directorio existe, si no, crearlo
      try {
        await fs.mkdir(globalStoragePath, { recursive: true });
      } catch (err) {
        console.error('Error al crear el directorio de almacenamiento global:', err);
      }

      // Verificar si el archivo existe, si no, crearlo con un contenido predeterminado
      try {
        await fs.access(globalRulesPath);
      } catch (err) {
        // El archivo no existe, crearlo con un contenido predeterminado
        const defaultRules = [
          { "before": "cl", "after": "console.log()" },
          { "before": "imp", "after": "import { } from '';" },
          { "before": "fn", "after": "function() {}" },
          { "before": "teh", "after": "the" },
          { "before": "dont", "after": "don't" }
        ];
        await fs.writeFile(globalRulesPath, JSON.stringify(defaultRules, null, 2));
      }

      // Abrir el archivo en el editor
      const document = await vscode.workspace.openTextDocument(globalRulesPath);
      await vscode.window.showTextDocument(document);

    } catch (err) {
      console.error('Error al abrir el archivo de reglas globales:', err);
      vscode.window.showErrorMessage('Error al abrir el archivo de reglas globales. Consulta la consola para más detalles.');
    }
  }

  // Función para abrir el archivo de reglas locales
  async function openLocalReplacementRules() {
    try {
      // Verificar si hay un workspace abierto
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No hay un workspace abierto. Abre un workspace para crear reglas locales.');
        return;
      }

      // Obtener la ruta del workspace
      const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const localRulesPath = path.join(workspacePath, '.vscode', 'auto_replace_rules.json');

      // Verificar si el directorio .vscode existe, si no, crearlo
      const vscodePath = path.join(workspacePath, '.vscode');
      try {
        await fs.mkdir(vscodePath, { recursive: true });
      } catch (err) {
        console.error('Error al crear el directorio .vscode:', err);
      }

      // Verificar si el archivo existe, si no, crearlo con un contenido predeterminado
      try {
        await fs.access(localRulesPath);
      } catch (err) {
        // El archivo no existe, crearlo con un contenido predeterminado
        const defaultRules = [
          { "before": "...", "after": "…" },
          { "before": "<3", "after": "❤️" }
        ];
        await fs.writeFile(localRulesPath, JSON.stringify(defaultRules, null, 2));
      }

      // Abrir el archivo en el editor
      const document = await vscode.workspace.openTextDocument(localRulesPath);
      await vscode.window.showTextDocument(document);

    } catch (err) {
      console.error('Error al abrir el archivo de reglas locales:', err);
      vscode.window.showErrorMessage('Error al abrir el archivo de reglas locales. Consulta la consola para más detalles.');
    }
  }

  // Inicializar la extensión
  currentTextChangeDisposable = checkAndRegisterHandler();
  if (currentTextChangeDisposable) {
    context.subscriptions.push(currentTextChangeDisposable);
  }
}

export function deactivate() {
  // Limpiar recursos al desactivar la extensión
}