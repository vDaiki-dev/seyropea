// Punto de entrada del frontend de SeyroPea.
import { Editor } from './editor.js';

const editor = new Editor();
window.seyropea = editor;

editor.init().catch((error) => {
  console.error('Error al iniciar SeyroPea:', error);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `<div style="padding:32px;color:#ff6b00;font-family:system-ui">
      <h1>No se pudo iniciar SeyroPea</h1>
      <p>${String(error.message || error)}</p>
      <p>Comprueba que la aplicación se esté ejecutando dentro del paquete de escritorio.</p>
    </div>`;
  }
});
