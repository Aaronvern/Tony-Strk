import Image from 'next/image';
import RoutePreview from './RoutePreview';

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top">tony <b>strk</b></a>
        <nav><a href="#scope">Scope</a><a href="#console">Console</a><a href="#build">Build</a><a href="/setup">Setup</a><a href="/demo/tony-strk-demo.mp4">Demo</a></nav>
        <span className="header-note">Mainnet / 2026</span>
      </header>

      <section className="hero" id="top">
        <Image className="hero-background" src="/tony-strk-armour-dossier.png" alt="" fill priority sizes="100vw" />
        <div className="hero-copy">
          <p className="eyebrow">Private routes for AI agents</p>
          <h1>MAP THE<br />ROUTE.<br /><em>KEEP CONTROL.</em></h1>
          <p className="hero-deck">Tony Strk is a working end-to-end route for paid public data. A local MCP server sends public browsing requests through Tor, handles STRK20 x402 settlement on Starknet Mainnet, and returns the protected page to the agent.</p>
          <a className="primary-action" href="#console">See the route <span>↓</span></a>
        </div>
        <p className="hero-caption"><span>Verified system / 20</span><span>Blueprint plate / 01</span></p>
      </section>

      <div className="ticker" aria-label="Product principles"><span>LOCAL MCP · TOR BROWSING · STRK20 x402 · STARKNET MAINNET · </span><span>LOCAL MCP · TOR BROWSING · STRK20 x402 · STARKNET MAINNET · </span><span>LOCAL MCP · TOR BROWSING · STRK20 x402 · STARKNET MAINNET · </span></div>

      <section className="statement" id="scope">
        <div><p className="eyebrow">Working scope</p><h2>WHAT IT<br /><em>DOES.</em></h2></div>
        <p>Tony Strk maps the route on this page, while the local MCP server executes it: it accepts a public HTTP(S) URL, fetches through Tor, handles the x402 challenge, settles with STRK20, and returns protected text after HTTP 200.</p>
      </section>

      <section className="scope-grid" aria-label="Product capabilities">
        <article><p>Route preview / 01</p><h3>LOCAL<br />ROUTE MAP.</h3><span>Accepts a public HTTP(S) URL and maps the four-step agent route in your browser.</span></article>
        <article><p>Local tool / 02</p><h3>MCP<br /><em>BROWSE.</em></h3><span>The local Streamable HTTP MCP server accepts a public URL and fetches it through Tor.</span></article>
        <article><p>Verified flow / 03</p><h3>PRIVATE<br />SETTLEMENT.</h3><span>STRK20 x402 settlement completes on Starknet Mainnet, then the agent receives the protected page.</span></article>
      </section>

      <section className="future-system">
        <div className="section-heading"><p className="eyebrow">MCP server — active local tool</p><h2>ONE AGENT.<br /><em>ONE BOUNDARY.</em></h2></div>
        <p className="future-intro">The local Streamable HTTP MCP server exposes <code>browse</code> and <code>pay_paywall</code>: it validates a public URL, uses Tor, completes STRK20 x402 settlement on Starknet Mainnet, and returns only the requested page’s text.</p>
        <div className="future-flow">
          <article><span>01</span><h3>MCP<br />SERVER.</h3><p>An agent sends one structured action through the loopback Streamable HTTP endpoint. The route is working end to end.</p></article>
          <article><span>02</span><h3>TOR<br />FETCH.</h3><p>The server validates the public URL and sends each request through the configured Tor SOCKS proxy.</p></article>
          <article><span>03</span><h3>STRK20 x402<br /><em>SETTLEMENT.</em></h3><p>A configured <code>pay_paywall</code> call completes the Mainnet payment and retries the merchant with the payment signature.</p></article>
        </div>
        <p className="future-note">Three Mainnet runs completed successfully and are recorded with explorer links in the repository. Follow the setup guide to run the same local MCP route.</p>
      </section>

      <section className="technical-dissect" id="system">
        <div className="section-heading"><p className="eyebrow">Route model / 02</p><h2>ONE ROUTE.<br /><em>CLEAR BOUNDARIES.</em></h2></div>
        <figure className="technical-board">
          <Image src="/tony-strk-armour-assembly-blueprint.png" alt="Cobalt technical blueprint showing a powered armour torso and its components" fill sizes="(max-width: 900px) 100vw, 90vw" />
          <figcaption>Torso dissection / 02</figcaption>
          <div className="callout callout-core"><span>01</span><strong>Local input</strong><p>The URL stays in this browser while the route is mapped.</p></div>
          <div className="callout callout-frame"><span>02</span><strong>MCP execution</strong><p>The local Streamable HTTP server owns browsing, payment, and protected-content retrieval.</p></div>
          <div className="callout callout-lock"><span>03</span><strong>Verified settlement</strong><p>The payer settles the configured helper named by PAYWALL_ANONYMIZER_ADDRESS.</p></div>
        </figure>
      </section>

      <section className="system-plates" aria-label="Supporting system plates">
        <article className="system-plate">
          <Image src="/tony-strk-reactor-blueprint.png" alt="Cobalt blueprint of a circular core reactor" fill sizes="(max-width: 900px) 100vw, 50vw" />
          <div><p>Privacy layer / verified</p><h3>SHIELDED<br />FOR <em>PRIVACY.</em></h3></div>
        </article>
        <article className="system-plate">
          <Image src="/tony-strk-helmet-blueprint.png" alt="Cobalt blueprint of a sleek powered armour head module" fill sizes="(max-width: 900px) 100vw, 50vw" />
          <div><p>Interface / live</p><h3>CHECK THE<br /><em>WHOLE</em> ROUTE.</h3></div>
        </article>
      </section>

      <RoutePreview />

      <section className="build" id="build">
        <p className="eyebrow">Current status</p>
        <h2>MAINNET ROUTE.<br />MCP TOOL <em>ACTIVE.</em></h2>
        <div><p>The route preview maps the path here; the local MCP server runs public browsing through Tor, completes STRK20 x402 settlement on Starknet Mainnet, and returns protected content after HTTP 200. Read the complete wallet and merchant setup.</p><a href="/setup">Open setup guide <span>↗</span></a></div>
      </section>

      <footer><a className="wordmark" href="#top">tony <b>strk</b></a><p>Local route preview · verified MCP flow · Starknet Mainnet.</p><p>© 2026</p></footer>
    </main>
  );
}
