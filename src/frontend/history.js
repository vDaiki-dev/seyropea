// Historial reversible: parches de píxeles acotados por bounding box y snapshots estructurales.
export class CommandHistory {
  constructor(editor, limit = 50) {
    this.editor = editor;
    this.limit = Math.max(10, Number(limit) || 50);
    this.entries = [];
    this.index = 0;
  }

  push(entry) {
    if (!entry) return;
    this.entries.splice(this.index);
    this.entries.push({ ...entry, at: new Date() });
    if (this.entries.length > this.limit) this.entries.shift();
    this.index = this.entries.length;
    this.editor.ui?.renderHistory?.();
  }

  canUndo() { return this.index > 0; }
  canRedo() { return this.index < this.entries.length; }

  undo() {
    if (!this.canUndo()) return false;
    const entry = this.entries[--this.index];
    this.editor.applyHistoryEntry(entry, 'undo');
    this.editor.ui?.renderHistory?.();
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    const entry = this.entries[this.index++];
    this.editor.applyHistoryEntry(entry, 'redo');
    this.editor.ui?.renderHistory?.();
    return true;
  }

  clear() {
    this.entries = [];
    this.index = 0;
    this.editor.ui?.renderHistory?.();
  }

  panelEntries() {
    return this.entries.map((entry, i) => ({
      ...entry, index: i, active: i === this.index - 1, applied: i < this.index,
    })).reverse();
  }
}
