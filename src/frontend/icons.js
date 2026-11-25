// Iconos SVG locales, con trazo uniformly grueso y sin dependencias externas.
const wrap = (body) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  move: wrap('<path d="M12 3v18M3 12h18M12 3 9 6m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3"/>'),
  transform: wrap('<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M2 5h3M5 2v3M19 2v3M22 5h-3M22 19h-3M19 22v-3M5 22v-3M2 19h3"/>'),
  marquee: wrap('<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2"/><path d="M4 9V5h4M16 19h4v-4"/>'),
  lasso: wrap('<path d="M12 5a7 5 0 1 1-6.7 9.2"/><path d="M5.3 14.2a2 2 0 1 0 2 2"/><circle cx="12" cy="5" r="1.3"/>'),
  wand: wrap('<path d="M5 19 16.5 7.5l2 2L7 21H5z"/><path d="M14 4v3m3.5-4v3M16 5.5h3M19 10h2"/>'),
  crop: wrap('<path d="M6 2v14h14M2 6h14v14"/>'),
  eyedropper: wrap('<path d="m14 4 6 6-3 3-6-6z"/><path d="M11 7 4 14l3 3 7-7M4 14 2 16l6 6 2-2"/>'),
  brush: wrap('<path d="m14 4 6 6-9 9H5v-6z"/><path d="M13 5 17 9"/>'),
  eraser: wrap('<path d="m4 15 8-8 8 8-5 5H9z"/><path d="M9 20h11"/>'),
  bucket: wrap('<path d="M4 13 12 5l7 7-8 8z"/><path d="M4 13h15"/><path d="M19 16c1.3 1.7 2 2.5 2 3.3a2 2 0 0 1-4 0c0-.8.7-1.6 2-3.3z"/>'),
  text: wrap('<path d="M5 5h14M12 5v14M8 19h8"/>'),
  shape: wrap('<rect x="3" y="4" width="11" height="11" rx="1"/><circle cx="16" cy="16" r="4"/>'),
  hand: wrap('<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6a1.5 1.5 0 0 1 3 0v7M17 11a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-3l-3-5a1.6 1.6 0 0 1 2.6-1.8L8 14"/>'),
  zoom: wrap('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10.5h5m-2.5-2.5v5"/>'),
  home: wrap('<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M10 20v-6h4v6"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2.8 2.8-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21h-4v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1L4.2 17l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3v-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8L4.2 7 7 4.2l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3h4v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1L19.8 7l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21v4h-.2a1.6 1.6 0 0 0-1.4 1z"/>'),
  undo: wrap('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: wrap('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  duplicate: wrap('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  up: wrap('<path d="m6 14 6-6 6 6"/>'),
  down: wrap('<path d="m6 10 6 6 6-6"/>'),
  trash: wrap('<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>'),
  eye: wrap('<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>'),
  eyeOff: wrap('<path d="M3 3l18 18M10.6 6.2A10.5 10.5 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.6M6.3 8.2A17 17 0 0 0 2 12s3.6 6 10 6a10 10 0 0 0 3.4-.6"/>'),
  lock: wrap('<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  unlock: wrap('<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.8-1.2"/>'),
  swap: wrap('<path d="M4 8h14l-3-3m3 3-3 3M20 16H6l3-3m-3 3 3 3"/>'),
  copy: wrap('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  file: wrap('<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/>'),
  folder: wrap('<path d="M3 6h6l2 2h10v12H3z"/>'),
  github: wrap('<path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-2c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.7-1.4-2.2-.3-4.6-1.1-4.6-5a4 4 0 0 1 1-2.8 3.7 3.7 0 0 1 .1-2.7s.8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1a3.7 3.7 0 0 1 .1 2.7 4 4 0 0 1 1 2.8c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/>'),
  book: wrap('<path d="M4 4h7a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4zM20 4h-3a3 3 0 0 0-3 3v14a3 3 0 0 1 3-3h3z"/>'),
  keyboard: wrap('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8"/>'),
  refresh: wrap('<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 7.5L4 11m16 2-2 3.5A7 7 0 0 1 5.5 15"/>'),
  spark: wrap('<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/>'),
  close: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
};

export const iconButton = (name, label, extra = '') =>
  `<span class="icon-button" title="${label}" aria-label="${label}" ${extra}>${ICONS[name] || ''}</span>`;

export default ICONS;
