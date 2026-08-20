import Image from 'next/image';
import RoutePreview from './RoutePreview';

const plates = [
  ['01', 'MCP surface', 'One compact interface for an agent to request a public-web action.'],
  ['02', 'Ephemeral compute', 'Each route is designed as a short-lived, isolated task.'],
  ['03', 'Payment later', 'STRK20 and x402 remain intentionally disabled in this Web2 prototype.'],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top">tony <b>strk</b></a>
        <nav><a href="#system">System</a><a href="#console">Console</a><a href="#build">Build</a></nav>
        <span className="header-note">Prototype / 2026</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">A privacy shell for AI agents</p>
          <h1>THE WEB<br />NEEDS<br /><em>ARMOUR.</em></h1>
          <p className="hero-deck">Tony Strk is an image-led concept for routing a user&apos;s AI-agent requests with less exposed context.</p>
          <a className="primary-action" href="#console">Open the route console <span>↓</span></a>
        </div>
        <figure className="hero-art">
          <Image src="/tony-strk-armour-dossier.png" alt="Cobalt blueprint illustration of a powered armour system" fill loading="eager" sizes="(max-width: 900px) 100vw, 61vw" />
          <figcaption><span>Prototype system / 20</span><span>Blueprint plate / 01</span></figcaption>
        </figure>
      </section>

      <div className="ticker" aria-label="Product principles"><span>ROUTE · ISOLATE · RETURN · </span><span>ROUTE · ISOLATE · RETURN · </span><span>ROUTE · ISOLATE · RETURN · </span></div>

      <section className="statement" id="system">
        <div><p className="eyebrow">The premise</p><h2>Built like an<br /><em>armour system.</em></h2></div>
        <p>Not a promise of invisibility. A clear product boundary: the demo maps a privacy-minded route locally, and does not fetch your destination or make a payment.</p>
      </section>

      <section className="dossier">
        <div className="dossier-art">
          <Image src="/tony-strk-armour-dossier.png" alt="Powered armour technical drawing with component callouts" fill sizes="(max-width: 900px) 100vw, 50vw" />
          <span className="plate-label">Frame analysis / 02</span>
        </div>
        <div className="plates">
          {plates.map(([number, title, text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </section>

      <RoutePreview />

      <section className="build" id="build">
        <p className="eyebrow">What is real today</p>
        <h2>A clean interface<br />for the <em>next layer.</em></h2>
        <div><p>The landing page and local route interaction are ready for demo. Wallet connectivity, STRK20 transactions, and payment rails are deliberately not represented as live.</p><a href="https://github.com/Aaronvern/Tony-Strk">View the build <span>↗</span></a></div>
      </section>

      <footer><a className="wordmark" href="#top">tony <b>strk</b></a><p>Web2 prototype. No requests or payments are sent.</p><p>© 2026</p></footer>
    </main>
  );
}
