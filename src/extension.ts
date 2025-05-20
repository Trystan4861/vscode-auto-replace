import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('autoReplace');
  const isEnabled = config.get<boolean>('enabled', false);

  if (isEnabled) {
    const rules = config.get<{ before: string; after: string }[]>('rules') || [];

    const disposable = vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || event.document !== editor.document) {return;}

      const change = event.contentChanges[0];
      if (!change || change.text.length === 0) {return;}

      const cursorPos = change.range.end;

      for (const rule of rules) {
        const { before, after } = rule;
        const len = before.length;
        const start = cursorPos.translate(0, -len);
        const range = new vscode.Range(start, cursorPos);
        const text = editor.document.getText(range);

        if (text === before) {
          editor.edit(editBuilder => {
            editBuilder.replace(range, after);
          });
          break;
        }
      }
    });

    context.subscriptions.push(disposable);
  }

  // Comando para activar la extensión en este proyecto
  context.subscriptions.push(vscode.commands.registerCommand('autoReplace.enable', async () => {
    const config = vscode.workspace.getConfiguration();
    await config.update('autoReplace.enabled', true, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage('Auto Replace ha sido activado en este proyecto.');
  }));

  // Comando para desactivar la extensión en este proyecto
  context.subscriptions.push(vscode.commands.registerCommand('autoReplace.disable', async () => {
    const config = vscode.workspace.getConfiguration();
    await config.update('autoReplace.enabled', false, vscode.ConfigurationTarget.Workspace);
    vscode.window.showInformationMessage('Auto Replace ha sido desactivado en este proyecto.');
  }));

  // Comando para editar la configuración global de reemplazos
  context.subscriptions.push(vscode.commands.registerCommand('autoReplace.editGlobalReplacements', async () => {
    await openGlobalReplacementRules();
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

    // Asegurar la estructura autoReplace
    if (!json['autoReplace']) {
      json['autoReplace'] = {};
    }
    json['autoReplace'].enabled = true;
    if (!json['autoReplace'].rules) {
      json['autoReplace'].rules = [
        { before: '...', after: '…' },
        { before: '<3', after: '❤️' }
      ];
    }

    // Guardar JSON formateado de nuevo
    await fs.writeFile(settingsPath, JSON.stringify(json, null, 2), 'utf8');

    // Abrir el archivo en editor
    const doc = await vscode.workspace.openTextDocument(settingsPath);
    const editor = await vscode.window.showTextDocument(doc);

    // Posicionar el cursor en la línea de "rules"
    const lines = doc.getText().split('\n');
    const lineNum = lines.findIndex(line => line.includes('"rules"'));
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
