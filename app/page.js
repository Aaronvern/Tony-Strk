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
        <p>This landing-page mapper validates a public HTTP(S) destination and shows a proposed route in your browser. It does not invoke the MCP server, fetch the destination, start a worker, open a wallet, contact STRK20, or process x402.</p>
      </section>

      <section className="scope-grid" aria-label="Prototype capabilities">
        <article><p>Landing page / 01</p><h3>LOCAL<br />ROUTE MAP.</h3><span>Accepts a public HTTP(S) URL and maps four conceptual steps in your browser.</span></article>
        <article><p>Local tool / 02</p><h3>MCP<br /><em>BROWSE.</em></h3><span>A separately runnable local MCP server accepts one public URL and uses an isolated worker only.</span></article>
        <article><p>Future layer / 03</p><h3>PRIVATE<br />SETTLEMENT.</h3><span>STRK20, x402, and wallet actions remain future work—not simulated here.</span></article>
      </section>

      <section className="future-system">
        <div className="section-heading"><p className="eyebrow">MCP server — local tool</p><h2>ONE AGENT.<br /><em>ONE BOUNDARY.</em></h2></div>
        <p className="future-intro">The landing page stays a local mapper. The separate stdio MCP server has one <code>browse</code> tool: it validates a public URL, creates one isolated browser context, and returns only that page’s text.</p>
        <div className="future-flow">
          <article><span>01</span><h3>MCP<br />SERVER.</h3><p>An agent sends one structured <code>browse</code> action through local stdio.</p></article>
          <article><span>02</span><h3>ISOLATED<br />EXECUTION.</h3><p>With local Obscura and Tor configured, each action uses a fresh browser context and closes it afterward.</p></article>
          <article><span>03</span><h3>PRIVATE<br /><em>SETTLEMENT.</em></h3><p>Wallet actions, STRK20, and x402 remain an intentionally unbuilt future layer.</p></article>
        </div>
        <p className="future-note">Optional OHTTP mode has no direct-worker fallback. It needs an independently operated relay and gateway; a local protocol test is not anonymity.</p>
      </section>

      <section className="technical-dissect" id="system">
        <div className="section-heading"><p className="eyebrow">Route model / 02</p><h2>ONE ROUTE.<br /><em>CLEAR BOUNDARIES.</em></h2></div>
        <figure className="technical-board">
          <Image src="/tony-strk-armour-assembly-blueprint.png" alt="Cobalt technical blueprint showing a powered armour torso and its components" fill sizes="(max-width: 900px) 100vw, 90vw" />
          <figcaption>Torso dissection / 02</figcaption>
          <div className="callout callout-core"><span>01</span><strong>Local input</strong><p>The URL stays in this browser while the route is mapped.</p></div>
          <div className="callout callout-frame"><span>02</span><strong>Separate tool</strong><p>The MCP runtime is local and never invoked by this landing-page mapper.</p></div>
          <div className="callout callout-lock"><span>03</span><strong>Hard stop</strong><p>Wallets, payments, STRK20, and x402 are not part of the current runtime.</p></div>
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
        <h2>LANDING MAP.<br />MCP TOOL <em>LOCAL.</em></h2>
        <div><p>The landing page never sends a request. The separately runnable MCP tool needs local Obscura and Tor; remote relay and gateway services are opt-in. Wallet connectivity, STRK20 transactions, and x402 remain absent.</p><a href="https://github.com/Aaronvern/Tony-Strk">View the build <span>↗</span></a></div>
      </section>

      <footer><a className="wordmark" href="#top">tony <b>strk</b></a><p>Landing mapper: no requests or payments are sent.</p><p>© 2026</p></footer>
    </main>
  );
}
