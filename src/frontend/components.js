// Componentes estándar de SeyroPea: Toast, Modal, Tooltip, Badge y SkeletonLoader.
// Son ligeros, locales y no dependen de frameworks ni de servicios remotos.
import { escapeHtml, clamp, mulberry32 } from './util.js';
import { sanitizeLabel, sanitizeId } from './security.js';

const DOT_SIZES = ['sm', 'md', 'lg'];

/** Aviso breve y no bloqueante; el contenedor raíz mantiene pointer-events: none. */
export class Toast {
  constructor(root = null, { limit = 4 } = {}) {
    this.limit = limit;
    this.timers = new WeakMap();
    this.mount(root);
  }

  mount(root) {
    if (root) this.root = typeof root === 'string' ? document.querySelector(root) : root;
    return this;
  }

  show(message, type = 'info', duration = 3800) {
    if (!this.root) return null;
    const el = document.createElement('div');
    el.className = `toast toast-${sanitizeId(type, 'info')}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = sanitizeLabel(message, 300);
    this.root.appendChild(el);
    while (this.root.children.length > this.limit) this.root.firstElementChild.remove();
    const timer = setTimeout(() => el.remove(), clamp(Number(duration) || 3800, 800, 20000));
    this.timers.set(el, timer);
    return el;
  }

  clear() {
    if (!this.root) return;
    for (const child of [...this.root.children]) child.remove();
  }
}

/** Modal centrado con fondo atenuado; un solo diálogo activo a la vez. */
export class Modal {
  constructor(root = null) {
    this.current = null;
    this.mount(root);
  }

  mount(root) {
    if (root) this.root = typeof root === 'string' ? document.querySelector(root) : root;
    return this;
  }

  open(title, body, { wide = false, kind = '', onClose = null } = {}) {
    this.close();
    if (!this.root) return null;
    const previousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.dataset.kind = sanitizeId(kind, 'dialog');
    const panel = document.createElement('div');
    panel.className = `modal${wide ? ' wide' : ''}`;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', sanitizeLabel(title, 120));
    const heading = document.createElement('h2');
    heading.textContent = sanitizeLabel(title, 120);
    const content = document.createElement('div');
    content.className = 'body';
    // El cuerpo lo construyen las plantillas propias de la aplicación con escapeHtml.
    content.innerHTML = body;
    const actions = document.createElement('div');
    actions.className = 'actions';
    panel.append(heading, content, actions);
    backdrop.appendChild(panel);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) this.close();
    });
    this.root.appendChild(backdrop);
    const modal = {
      el: backdrop,
      panel,
      body: content,
      actions,
      close: () => this.close(),
    };
    this.current = modal;
    this._onClose = onClose;
    panel.querySelector('button, input, select, textarea, [tabindex]')?.focus();
    this._previousFocus = previousFocus;
    return modal;
  }

  close() {
    if (!this.current) return;
    this.current.el.remove();
    this.current = null;
    const onClose = this._onClose;
    this._onClose = null;
    if (this._previousFocus?.isConnected) this._previousFocus.focus();
    this._previousFocus = null;
    onClose?.();
  }
}

/** Tooltip accesible: muestra función y atajo sin capturar clics. */
export class Tooltip {
  sync(root = document) {
    root.querySelectorAll('[title]').forEach((el) => {
      const label = sanitizeLabel(el.getAttribute('title'), 120);
      if (label && !el.hasAttribute('data-tooltip')) el.dataset.tooltip = label;
    });
    return this;
  }

  attach(el, label, shortcut = '') {
    if (!el) return this;
    el.dataset.tooltip = sanitizeLabel(label, 120);
    if (shortcut) el.dataset.shortcut = sanitizeLabel(shortcut, 24);
    el.setAttribute('aria-label', [label, shortcut].filter(Boolean).join(' '));
    return this;
  }

  attachAll(root, resolve) {
    root.querySelectorAll('[data-tool], [data-shortcut-key]').forEach((el) => {
      const label = resolve?.(el) || el.getAttribute('title') || el.getAttribute('aria-label') || '';
      const shortcut = el.dataset.shortcutKey || (el.querySelector('small')?.textContent || '');
      this.attach(el, label, shortcut.trim());
    });
    return this;
  }
}

/** Insignia compacta para contadores y estados; siempre usa textContent. */
export class Badge {
  static render(text, variant = 'status') {
    return `<span class="badge badge-${sanitizeId(variant, 'status')}">${escapeHtml(sanitizeLabel(text, 40))}</span>`;
  }

  static set(el, text, variant = 'status') {
    if (!el) return null;
    el.textContent = sanitizeLabel(text, 40);
    el.classList.add('badge');
    el.classList.remove('badge-status', 'badge-count', 'badge-accent');
    el.classList.add(`badge-${sanitizeId(variant, 'status')}`);
    return el;
  }
}

/**
 * SkeletonLoader inspirado en DIVAE: puntos de tres tamaños que forman patrones
 * y matices. La secuencia es determinista y usa colores del tema (currentColor).
 */
export class SkeletonLoader {
  static render({ rows = 3, cells = 10, seed = 1, label = 'Cargando…' } = {}) {
    const safeRows = clamp(Math.floor(Number(rows) || 3), 1, 8);
    const safeCells = clamp(Math.floor(Number(cells) || 10), 4, 24);
    const random = mulberry32((Number(seed) || 1) >>> 0);
    const lines = [];
    for (let row = 0; row < safeRows; row++) {
      const dots = [];
      for (let cell = 0; cell < safeCells; cell++) {
        const size = DOT_SIZES[Math.floor(random() * DOT_SIZES.length)];
        const delay = Math.round(random() * 800);
        dots.push(`<span class="skeleton-dot dot-${size}" style="animation-delay:${delay}ms"></span>`);
      }
      lines.push(`<div class="skeleton-dots" aria-hidden="true">${dots.join('')}</div>`);
      lines.push(`<div class="skeleton-bars" aria-hidden="true"><span class="skeleton-bar" style="width:${72 + Math.floor(random() * 26)}%"></span></div>`);
    }
    return `<div class="skeleton" role="status" aria-busy="true" aria-label="${escapeHtml(sanitizeLabel(label, 80))}">${lines.join('')}</div>`;
  }

  mount(container, options = {}) {
    if (!container) return null;
    container.innerHTML = SkeletonLoader.render(options);
    return container;
  }

  clear(container) {
    if (container) container.replaceChildren();
    return container;
  }
}

export { DOT_SIZES };
