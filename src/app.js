import './style.css';
import { buildRoute } from './route.js';

const form = document.querySelector('#route-form');
const input = document.querySelector('#target-url');
const target = document.querySelector('#route-target');
const status = document.querySelector('#route-status');
const copyButton = document.querySelector('#copy-tool');
const toolSpec = document.querySelector('#tool-spec').textContent.trim();

form.addEventListener('submit', (event) => {
  event.preventDefault();

  try {
    const route = buildRoute(input.value);
    target.textContent = route.target;
    status.textContent = `Route mapped locally for ${route.target}. No network request was sent.`;
    status.dataset.state = 'ok';
  } catch (error) {
    status.textContent = error.message;
    status.dataset.state = 'error';
  }
});

copyButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(toolSpec);
  copyButton.textContent = 'Copied';
  setTimeout(() => { copyButton.textContent = 'Copy schema'; }, 1400);
});
