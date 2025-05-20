import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export function activate(context: vscode.ExtensionContext) {
  const pendingReplacements = new Map<string, {
    pattern: string,
    replacement: string,
    range: vscode.Range,
    tooltipTimeout: NodeJS.Timeout | undefined
  }>();

  const tooltipDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(100, 100, 255, 0.1)',
    border: '1px dashed rgba(100, 100, 255, 0.5)',
    borderRadius: '2px',
    after: {
      contentText: ' ⮕ ',
      color: 'rgba(100, 100, 255, 0.8)'
    }
  });

  const hoverProvider = vscode.languages.registerHoverProvider('*', {
    provideHover(document, position) {
      const docKey = document.uri.toString();
      const pendingReplacement = pendingReplacements.get(docKey);

      if (pendingReplacement && pendingReplacement.range.contains(position)) {
        const content = new vscode.MarkdownString();
        content.appendMarkdown(`**Auto Replace:** \`${pendingReplacement.pattern}\` → \`${pendingReplacement.replacement}\``);
        content.appendMarkdown('\n\n*(Pulsa Enter para aplicar, Esc para cancelar)*');
        content.isTrusted = true;

        return new vscode.Hover(content, pendingReplacement.range);
      }
      return null;
    }
  });

  context.subscriptions.push(hoverProvider);

  function clearPendingReplacement(docKey: string) {
    vscode.window.visibleTextEditors.forEach(editor => {
      editor.setDecorations(tooltipDecorationType, []);
    });

    const pendingReplacement = pendingReplacements.get(docKey);
    if (pendingReplacement) {
      if (pendingReplacement.tooltipTimeout) {
        clearTimeout(pendingReplacement.tooltipTimeout);
      }
      pendingReplacements.delete(docKey);
      vscode.window.setStatusBarMessage('', 0);
    }
  }

  function showTooltip(editor: vscode.TextEditor, docKey: string, pattern: string, replacement: string, range: vscode.Range) {
    clearPendingReplacement(docKey);
    editor.setDecorations(tooltipDecorationType, [range]);

    const tooltipMessage = `Autoreplace: "${pattern}" -> "${replacement}" (Pulsa Enter para aplicar, Esc para cancelar)`;
    vscode.window.setStatusBarMessage(tooltipMessage, 3000);

    const tooltipTimeout = setTimeout(() => {
      clearPendingReplacement(docKey);
    }, 3000);

    pendingReplacements.set(docKey, {
      pattern,
      replacement,
      range,
      tooltipTimeout
    });
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        const docKey = editor.document.uri.toString();
        clearPendingReplacement(docKey);
      }
    })
  );

  function createTextDocumentChangeHandler() {
    const globalConfig = vscode.workspace.getConfiguration('autoReplace', null);
    const workspaceConfig = vscode.workspace.getConfiguration('autoReplace');

    const isGlobalDictEnabled = globalConfig.get<boolean>('enabledGlobal', false);
    const isLocalDictEnabled = workspaceConfig.get<boolean>('enabledLocal', false);

    const globalRules = isGlobalDictEnabled ? globalConfig.get<{ before: string; after: string }[]>('rules', []) : [];
    const localRules = isLocalDictEnabled ? workspaceConfig.get<{ before: string; after: string }[]>('localRules', []) : [];

    const ruleMap = new Map<string, string>();

    globalRules.forEach(rule => {
      ruleMap.set(rule.before, rule.after);
    });

    localRules.forEach(rule => {
      ruleMap.set(rule.before, rule.after);
    });

    const rules = Array.from(ruleMap.entries()).map(([before, after]) => ({ before, after }));

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

        const change = changes[0];

        if (!change || change.text.length === 0) {
          return;
        }

        if (change.text === '\r\n' || change.text === '\n') {
          return;
        }

        const docKey = editor.document.uri.toString();

        if (pendingReplacements.has(docKey)) {
          clearPendingReplacement(docKey);
        }

        setTimeout(() => checkForPatterns(editor), 0);
      }),

      vscode.window.onDidChangeTextEditorSelection(event => {
        const editor = event.textEditor;
        checkForPatterns(editor);
      })
    );

    function checkForPatterns(editor: vscode.TextEditor) {
      const docKey = editor.document.uri.toString();

      if (pendingReplacements.has(docKey)) {
        return;
      }

      const cursorPos = editor.selection.active;
      const lineText = editor.document.lineAt(cursorPos.line).text;

      for (const rule of rules) {
        const { before, after } = rule;

        if (cursorPos.character < before.length) {
          continue;
        }

        const textUpToCursor = lineText.substring(0, cursorPos.character);

        if (!textUpToCursor.endsWith(before)) {
          continue;
        }

        const startPos = cursorPos.character - before.length;
        const startPosition = new vscode.Position(cursorPos.line, startPos);
        const endPosition = cursorPos;
        const range = new vscode.Range(startPosition, endPosition);

        showTooltip(editor, docKey, before, after, range);
        break;
      }
    }
  }

  let currentTextChangeDisposable: vscode.Disposable | undefined;

  function checkAndRegisterHandler() {
    const workspaceConfig = vscode.workspace.getConfiguration('autoReplace');
    const globalConfig = vscode.workspace.getConfiguration('autoReplace', null);

    const isGlobalDictEnabled = globalConfig.get<boolean>('enabledGlobal', false);
    const isLocalDictEnabled = workspaceConfig.get<boolean>('enabledLocal', false);

    const isEnabled = isGlobalDictEnabled || isLocalDictEnabled;

    if (currentTextChangeDisposable) {
      currentTextChangeDisposable.dispose();
      currentTextChangeDisposable = undefined;
    }

    if (isEnabled) {
      currentTextChangeDisposable = createTextDocumentChangeHandler();
    }

    return currentTextChangeDisposable;
  }

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

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('autoReplace.handleEnterKey', (editor) => {
      const docKey = editor.document.uri.toString();
      const pendingReplacement = pendingReplacements.get(docKey);

      if (pendingReplacement) {
        const { pattern, replacement, range } = pendingReplacement;

        clearPendingReplacement(docKey);

        editor.edit(editBuilder => {
          editBuilder.replace(range, replacement);
        }).then(success => {
          if (success) {
            vscode.window.setStatusBarMessage(`Auto Replace: "${pattern}" → "${replacement}"`, 2000);
          }
        });
        return true;
      }

      return false;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('autoReplace.handleEscapeKey', (editor) => {
      const docKey = editor.document.uri.toString();

      if (pendingReplacements.has(docKey)) {
        const pattern = pendingReplacements.get(docKey)?.pattern;

        clearPendingReplacement(docKey);

        if (pattern) {
          vscode.window.setStatusBarMessage(`Auto Replace: Reemplazo de "${pattern}" cancelado`, 2000);
        }

        return true;
      }

      return false;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('type', args => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return vscode.commands.executeCommand('default:type', args);
      }

      if (args.text === '\n' || args.text === '\r\n') {
        const docKey = editor.document.uri.toString();

        if (pendingReplacements.has(docKey)) {
          vscode.commands.executeCommand('autoReplace.handleEnterKey');
          return;
        }
      }

      const docKey = editor.document.uri.toString();
      if (pendingReplacements.has(docKey)) {
        vscode.commands.executeCommand('autoReplace.handleEscapeKey');
      }

      return vscode.commands.executeCommand('default:type', args);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('autoReplace')) {
        checkAndRegisterHandler();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.openGlobalRules', async () => {
      await openGlobalReplacementRules();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.openLocalRules', async () => {
      await openLocalReplacementRules();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.showStatus', () => {
      const globalConfig = vscode.workspace.getConfiguration('autoReplace', null);
      const workspaceConfig = vscode.workspace.getConfiguration('autoReplace');

      const isGlobalDictEnabled = globalConfig.get<boolean>('enabledGlobal', false);
      const isLocalDictEnabled = workspaceConfig.get<boolean>('enabledLocal', false);

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

  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.editGlobalReplacements', async () => {
      await openGlobalReplacementRules();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.editLocalReplacements', async () => {
      await openLocalReplacementRules();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('autoReplace.clearAllDecorations', () => {
      vscode.window.visibleTextEditors.forEach(editor => {
        editor.setDecorations(tooltipDecorationType, []);
      });

      pendingReplacements.forEach((value) => {
        if (value.tooltipTimeout) {
          clearTimeout(value.tooltipTimeout);
        }
      });
      pendingReplacements.clear();

      vscode.window.showInformationMessage('Auto Replace: Todas las decoraciones han sido limpiadas');
    })
  );

  async function openGlobalReplacementRules() {
    try {
      const globalStoragePath = context.globalStorageUri.fsPath;
      const globalRulesPath = path.join(globalStoragePath, 'global_rules.json');

      try {
        await fs.mkdir(globalStoragePath, { recursive: true });
      } catch (err) {
        console.error('Error al crear el directorio de almacenamiento global:', err);
      }

      try {
        await fs.access(globalRulesPath);
      } catch (err) {
        const defaultRules = [
          { "before": "cl", "after": "console.log()" },
          { "before": "imp", "after": "import { } from '';" },
          { "before": "fn", "after": "function() {}" },
          { "before": "teh", "after": "the" },
          { "before": "dont", "after": "don't" }
        ];
        await fs.writeFile(globalRulesPath, JSON.stringify(defaultRules, null, 2));
      }

      const document = await vscode.workspace.openTextDocument(globalRulesPath);
      await vscode.window.showTextDocument(document);

    } catch (err) {
      console.error('Error al abrir el archivo de reglas globales:', err);
      vscode.window.showErrorMessage('Error al abrir el archivo de reglas globales. Consulta la consola para más detalles.');
    }
  }

  async function openLocalReplacementRules() {
    try {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No hay un workspace abierto. Abre un workspace para crear reglas locales.');
        return;
      }

      const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const localRulesPath = path.join(workspacePath, '.vscode', 'auto_replace_rules.json');

      const vscodePath = path.join(workspacePath, '.vscode');
      try {
        await fs.mkdir(vscodePath, { recursive: true });
      } catch (err) {
        console.error('Error al crear el directorio .vscode:', err);
      }

      try {
        await fs.access(localRulesPath);
      } catch (err) {
        const defaultRules = [
          { "before": "...", "after": "…" },
          { "before": "<3", "after": "❤️" }
        ];
        await fs.writeFile(localRulesPath, JSON.stringify(defaultRules, null, 2));
      }

      const document = await vscode.workspace.openTextDocument(localRulesPath);
      await vscode.window.showTextDocument(document);

    } catch (err) {
      console.error('Error al abrir el archivo de reglas locales:', err);
      vscode.window.showErrorMessage('Error al abrir el archivo de reglas locales. Consulta la consola para más detalles.');
    }
  }

  currentTextChangeDisposable = checkAndRegisterHandler();
  if (currentTextChangeDisposable) {
    context.subscriptions.push(currentTextChangeDisposable);
  }
}

export function deactivate() {
}