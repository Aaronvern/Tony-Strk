import Image from 'next/image';
import RoutePreview from './RoutePreview';

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top">tony <b>strk</b></a>
        <nav><a href="#scope">Scope</a><a href="#console">Console</a><a href="#build">Build</a></nav>
        <span className="header-note">Prototype / 2026</span>
      </header>

      <section className="hero" id="top">
        <Image className="hero-background" src="/tony-strk-armour-dossier.png" alt="" fill priority sizes="100vw" />
        <div className="hero-copy">
          <p className="eyebrow">Local Web2 route-mapping prototype</p>
          <h1>MAP THE<br />ROUTE.<br /><em>KEEP CONTROL.</em></h1>
          <p className="hero-deck">Tony Strk lets you enter a public URL and map a conceptual agent route locally. It does not send the request, use a wallet, or process a payment.</p>
          <a className="primary-action" href="#console">Try the local mapper <span>↓</span></a>
        </div>
        <p className="hero-caption"><span>Prototype system / 20</span><span>Blueprint plate / 01</span></p>
      </section>

      <div className="ticker" aria-label="Product principles"><span>LOCAL MAP · NO FETCH · NO WALLET · NO PAYMENT · </span><span>LOCAL MAP · NO FETCH · NO WALLET · NO PAYMENT · </span><span>LOCAL MAP · NO FETCH · NO WALLET · NO PAYMENT · </span></div>

      <section className="statement" id="scope">
        <div><p className="eyebrow">Prototype scope</p><h2>WHAT IT<br /><em>DOES.</em></h2></div>
        <p>This is a browser-only planning interface for a future private agent route. The interaction validates a public HTTP(S) destination and shows the proposed route. It does not fetch the destination, start a worker, open a wallet, contact STRK20, or process x402.</p>
      </section>

      <section className="scope-grid" aria-label="Prototype capabilities">
        <article><p>Included now / 01</p><h3>LOCAL<br />ROUTE MAP.</h3><span>Accepts a public HTTP(S) URL and maps four conceptual steps in your browser.</span></article>
        <article><p>Explicitly off / 02</p><h3>NO LIVE<br /><em>EXECUTION.</em></h3><span>No destination fetch, disposable worker, egress connection, wallet request, payment, or transaction occurs.</span></article>
        <article><p>Next layer / 03</p><h3>PRIVATE<br />ROUTING.</h3><span>Privacy tooling is a future integration target, not a claim made by this prototype.</span></article>
      </section>

      <section className="future-system">
        <div className="section-heading"><p className="eyebrow">Finished product / design target</p><h2>ONE AGENT.<br /><em>PRIVATE ACTION.</em></h2></div>
        <p className="future-intro">The finished Tony Strk product is an MCP-facing execution layer for AI agents. The current site is only the route-mapping UI below. Design target — not live.</p>
        <div className="future-flow">
          <article><span>01</span><h3>MCP<br />SERVER.</h3><p>An agent sends a structured action to Tony Strk through an MCP server.</p></article>
          <article><span>02</span><h3>ISOLATED<br />EXECUTION.</h3><p>A future worker runs the approved web action in a short-lived, isolated session.</p></article>
          <article><span>03</span><h3>PRIVATE<br /><em>SETTLEMENT.</em></h3><p>Where payment is needed, a privacy-enabled wallet will build and prove the STRK20 action. The product never asks for a viewing key.</p></article>
        </div>
        <p className="future-note">STRK20 hides movement inside the pool. Deposits, withdrawals, and timing remain public by design.</p>
      </section>

      <section className="technical-dissect" id="system">
        <div className="section-heading"><p className="eyebrow">Route model / 02</p><h2>ONE ROUTE.<br /><em>CLEAR BOUNDARIES.</em></h2></div>
        <figure className="technical-board">
          <Image src="/tony-strk-armour-assembly-blueprint.png" alt="Cobalt technical blueprint showing a powered armour torso and its components" fill sizes="(max-width: 900px) 100vw, 90vw" />
          <figcaption>Torso dissection / 02</figcaption>
          <div className="callout callout-core"><span>01</span><strong>Local input</strong><p>The URL stays in this browser while the route is mapped.</p></div>
          <div className="callout callout-frame"><span>02</span><strong>Future shell</strong><p>Privacy integrations are designed as a later layer, not simulated as live.</p></div>
          <div className="callout callout-lock"><span>03</span><strong>Hard stop</strong><p>The prototype does not execute the route or contact the destination.</p></div>
        </figure>
      </section>

      <section className="system-plates" aria-label="Supporting system plates">
        <article className="system-plate">
          <Image src="/tony-strk-reactor-blueprint.png" alt="Cobalt blueprint of a circular core reactor" fill sizes="(max-width: 900px) 100vw, 50vw" />
          <div><p>Privacy layer / later</p><h3>RESERVED<br />FOR <em>PRIVACY.</em></h3></div>
        </article>
        <article className="system-plate">
          <Image src="/tony-strk-helmet-blueprint.png" alt="Cobalt blueprint of a sleek powered armour head module" fill sizes="(max-width: 900px) 100vw, 50vw" />
          <div><p>Interface / now</p><h3>CHECK THE<br /><em>WHOLE</em> ROUTE.</h3></div>
        </article>
      </section>

      <RoutePreview />

      <section className="build" id="build">
        <p className="eyebrow">Current status</p>
        <h2>LOCAL MAP.<br />LIVE LAYERS <em>OFF.</em></h2>
        <div><p>The landing page and local route mapper are working. Wallet connectivity, STRK20 transactions, x402, private egress, and live workers are intentionally absent.</p><a href="https://github.com/Aaronvern/Tony-Strk">View the build <span>↗</span></a></div>
      </section>

      <footer><a className="wordmark" href="#top">tony <b>strk</b></a><p>Web2 prototype. No requests or payments are sent.</p><p>© 2026</p></footer>
    </main>
  );
}
