// Punto de entrada del frontend de SeyroPea.
import { Editor } from './editor.js';

const editor = new Editor();
window.seyropea = editor;

editor.init().catch((error) => {
  // Sin volcados de stack ni HTML del error: solo un mensaje legible y seguro.
  const message = String(error?.message || 'Error desconocido').slice(0, 300);
  const app = document.getElementById('app');
  if (!app) return;
  app.replaceChildren();
  const panel = document.createElement('div');
  panel.style.cssText = 'padding:32px;color:#ff6b00;font-family:system-ui';
  const title = document.createElement('h1');
  title.textContent = 'No se pudo iniciar SeyroPea';
  const detail = document.createElement('p');
  detail.textContent = message;
  const hint = document.createElement('p');
  hint.textContent = 'Comprueba que la aplicación se esté ejecutando dentro del paquete de escritorio.';
  panel.append(title, detail, hint);
  app.appendChild(panel);
});
