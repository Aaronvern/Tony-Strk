'use client';

import { useState } from 'react';
import { buildRoute } from '../src/route.js';

export default function RoutePreview() {
  const [value, setValue] = useState('https://example.com');
  const [message, setMessage] = useState('Map a route locally. No request is sent.');

  function submit(event) {
    event.preventDefault();
    try {
      const route = buildRoute(value);
      setMessage(`Mapped locally for ${route.target}. No request is sent.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="console" id="console">
      <div className="console-heading">
        <p className="eyebrow">Concept preview / local only</p>
        <h2>Ask the shell<br />to move.</h2>
      </div>
      <form onSubmit={submit} className="route-form">
        <label htmlFor="target-url">Public destination</label>
        <div className="url-control">
          <input id="target-url" type="url" value={value} onChange={(event) => setValue(event.target.value)} required />
          <button type="submit">Map route <span>↗</span></button>
        </div>
        <p aria-live="polite" className="route-status">{message}</p>
      </form>
      <div className="route-steps">
        {['Current: local map', 'Current: local MCP', 'Roadmap: worker isolation', 'Roadmap: OHTTP relay'].map((label, index) => (
          <article key={label}><span>0{index + 1}</span><strong>{label}</strong><i>{index < 3 ? '→' : '✓'}</i></article>
        ))}
      </div>
    </section>
  );
}
