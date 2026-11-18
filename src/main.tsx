import { render } from 'preact';
import { App } from './ui/app';
import './styles/app.css';

render(<App />, document.getElementById('root')!);

// PWA: cache para abrir rápido y jugar "solo" sin internet
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
