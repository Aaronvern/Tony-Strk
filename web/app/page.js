import Image from 'next/image';
import RoutePreview from './RoutePreview';

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top">tony <b>strk</b></a>
        <nav><a href="#scope">Scope</a><a href="#console">Console</a><a href="#build">Build</a><a href="/setup">Setup</a></nav>
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

      <div className="ticker" aria-label="Product principles"><span>LOCAL MAP · MCP BOUNDARY · STRK20 x402 · SEPOLIA TESTNET · </span><span>LOCAL MAP · MCP BOUNDARY · STRK20 x402 · SEPOLIA TESTNET · </span><span>LOCAL MAP · MCP BOUNDARY · STRK20 x402 · SEPOLIA TESTNET · </span></div>

      <section className="statement" id="scope">
        <div><p className="eyebrow">Prototype scope</p><h2>WHAT IT<br /><em>DOES.</em></h2></div>
        <p>This landing-page mapper validates a public HTTP(S) destination and shows a proposed route in your browser. It does not invoke the MCP server, fetch the destination, start a worker, open a wallet, contact STRK20, or process x402.</p>
      </section>

      <section className="scope-grid" aria-label="Prototype capabilities">
        <article><p>Landing page / 01</p><h3>LOCAL<br />ROUTE MAP.</h3><span>Accepts a public HTTP(S) URL and maps four conceptual steps in your browser.</span></article>
        <article><p>Local tool / 02</p><h3>MCP<br /><em>BROWSE.</em></h3><span>The local Streamable HTTP MCP server accepts a public URL and fetches it through Tor.</span></article>
        <article><p>Active flow / 03</p><h3>PRIVATE<br />SETTLEMENT.</h3><span>STRK20 and x402 settlement are available on Sepolia when the wallet and trusted helper are configured.</span></article>
      </section>

      <section className="future-system">
        <div className="section-heading"><p className="eyebrow">MCP server — local tool</p><h2>ONE AGENT.<br /><em>ONE BOUNDARY.</em></h2></div>
        <p className="future-intro">The landing page stays a local mapper. The local Streamable HTTP MCP server exposes <code>browse</code> and, when configured, <code>pay_paywall</code>: it validates a public URL, uses Tor, and returns only the requested page’s text.</p>
        <div className="future-flow">
          <article><span>01</span><h3>MCP<br />SERVER.</h3><p>An agent sends one structured action through the loopback Streamable HTTP endpoint.</p></article>
          <article><span>02</span><h3>TOR<br />FETCH.</h3><p>The server validates the public URL and sends each request through the configured Tor SOCKS proxy.</p></article>
          <article><span>03</span><h3>PRIVATE<br /><em>SETTLEMENT.</em></h3><p>A configured <code>pay_paywall</code> call uses STRK20 withdraw + <code>privacy_invoke</code> for the merchant.</p></article>
        </div>
        <p className="future-note">The payment path remains explicit and testnet-only. OHTTP is still opt-in and needs an independently operated relay and gateway; a local protocol test is not anonymity.</p>
      </section>

      <section className="technical-dissect" id="system">
        <div className="section-heading"><p className="eyebrow">Route model / 02</p><h2>ONE ROUTE.<br /><em>CLEAR BOUNDARIES.</em></h2></div>
        <figure className="technical-board">
          <Image src="/tony-strk-armour-assembly-blueprint.png" alt="Cobalt technical blueprint showing a powered armour torso and its components" fill sizes="(max-width: 900px) 100vw, 90vw" />
          <figcaption>Torso dissection / 02</figcaption>
          <div className="callout callout-core"><span>01</span><strong>Local input</strong><p>The URL stays in this browser while the route is mapped.</p></div>
          <div className="callout callout-frame"><span>02</span><strong>Separate tool</strong><p>The MCP runtime is local and never invoked by this landing-page mapper.</p></div>
          <div className="callout callout-lock"><span>03</span><strong>Trust gate</strong><p>The payer only settles a helper named by PAYWALL_ANONYMIZER_ADDRESS.</p></div>
        </figure>
      </section>

      <section className="system-plates" aria-label="Supporting system plates">
        <article className="system-plate">
          <Image src="/tony-strk-reactor-blueprint.png" alt="Cobalt blueprint of a circular core reactor" fill sizes="(max-width: 900px) 100vw, 50vw" />
          <div><p>Privacy layer / active</p><h3>SHIELDED<br />FOR <em>PRIVACY.</em></h3></div>
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
        <div><p>The landing page never sends a request. The local MCP server uses Tor for public fetches and can settle a configured Sepolia x402 paywall through STRK20. Read the complete wallet and merchant setup.</p><a href="/setup">Open setup guide <span>↗</span></a></div>
      </section>

      <footer><a className="wordmark" href="#top">tony <b>strk</b></a><p>Landing mapper: no requests or payments are sent.</p><p>© 2026</p></footer>
    </main>
  );
}
