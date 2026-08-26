import styles from './setup.module.css';

export const metadata = {
  title: 'Setup — tony strk',
  description: 'Run the local STRK20 x402 MCP flow on Starknet Sepolia.',
};

const block = (label, command) => (
  <div className={styles.codeBlock}>
    <p className={styles.codeLabel}>{label}</p>
    <pre aria-label={label}><code>{command}</code></pre>
  </div>
);

export default function SetupPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="/">tony <b>strk</b></a>
        <p className={styles.headerNote}>SETUP / SEPOLIA</p>
        <a className={styles.backLink} href="/">Back to landing <span aria-hidden="true">↗</span></a>
      </header>

      <div className={styles.intro}>
        <p className={styles.eyebrow}>Local MCP / STRK20 x402</p>
        <h1>RUN THE<br /><em>PRIVATE ROUTE.</em></h1>
        <p className={styles.lede}>
          Set up a local Tony Strk server that browses through Tor and can pay a
          compatible HTTP x402 paywall with shielded test STRK. This guide uses
          real Sepolia contracts and a temporary public HTTPS merchant URL.
        </p>
        <p className={styles.warning}>
          <strong>Testnet only.</strong> The guided payment flow is for Starknet
          Sepolia test funds. Mainnet paywall settlement is not supported.
        </p>
      </div>

      <ol className={styles.steps}>
        <li className={styles.step}>
          <section aria-labelledby="prerequisites">
            <p className={styles.stepNumber}>01 / PREREQUISITES</p>
            <h2 id="prerequisites">Bring the right tools.</h2>
            <p>
              Use macOS, Node 24, npm, and a running Tor process. The privacy SDK
              requires Node 24. Tor must listen at the SOCKS URL you configure,
              usually <code>socks5://127.0.0.1:9050</code>. Create an AVNU
              account and obtain an API key; store it with the paymaster setup
              command below. Never put a private key, viewing key, passphrase, or
              AVNU key in this page or in a committed file.
            </p>
          </section>
        </li>

        <li className={styles.step}>
          <section aria-labelledby="install">
            <p className={styles.stepNumber}>02 / INSTALL</p>
            <h2 id="install">Install the stack.</h2>
            <p>Run these commands from the project root.</p>
            {block('Project install', `nvm use
npm install
npm run setup`)}
          </section>
        </li>

        <li className={styles.step}>
          <section aria-labelledby="wallet">
            <p className={styles.stepNumber}>03 / WALLET</p>
            <h2 id="wallet">Create, fund, deploy, shield.</h2>
            <p>
              The wallet lifecycle is explicit. The local Keychain stores the
              spending key and privacy passphrase; the MCP returns public status
              and transaction values only.
            </p>
            <ol className={styles.substeps}>
              <li>Run <code>npm run wallet:create</code>. Save the printed public Sepolia address.</li>
              <li>Fund that address with public Sepolia test STRK. The first shield must cover the private balance and the pool fee.</li>
              <li>Call <code>wallet_status</code>. When it reports <code>needs_deployment</code>, call <code>wallet_deploy</code>.</li>
              <li>Obtain an AVNU key from the AVNU portal, then run <code>npm run paymaster:set</code> to store it.</li>
              <li>After <code>wallet_status</code> reports <code>ready</code>, call <code>wallet_shield</code> with the public STRK amount to shield.</li>
              <li>Wait for the shield receipt and its <code>spendableAfterBlock</code>. A new deployment, top-up, or private note needs 12 blocks of maturity before the next proof.</li>
            </ol>
            {block('Wallet creation', 'npm run wallet:create')}
            <p className={styles.note}>
              The pool fee is read from the external stack. Do not hardcode it
              in a UI or assume the Sepolia quote is a mainnet cost.
            </p>
          </section>
        </li>

        <li className={styles.step}>
          <section aria-labelledby="configuration">
            <p className={styles.stepNumber}>04 / CONFIGURATION</p>
            <h2 id="configuration">Choose the trust boundary.</h2>
            <p>
              Set a helper contract you have chosen to trust and a per-resource
              ceiling. <code>PAYWALL_ANONYMIZER_ADDRESS</code> is a payer trust
              decision: the paywall&apos;s invoke leg sends the withdrawn amount to
              that contract. The default Sepolia RPC below supports the class
              lookup used by <code>wallet_status</code>; an explicit RPC may
              override it.
            </p>
            {block('Non-secret Sepolia settings', `PAYWALL_ANONYMIZER_ADDRESS=YOUR_TRUSTED_HELPER_ADDRESS
PAYWALL_MAX_PRICE=0.5
STARKNET_RPC_URL=https://starknet-sepolia-rpc.publicnode.com
TOR_SOCKS_PROXY=socks5://127.0.0.1:9050`)}
            <p className={styles.note}>
              Keep API keys and wallet material in the macOS Keychain. The
              settings above are addresses, limits, and service URLs, not
              credentials.
            </p>
          </section>
        </li>

        <li className={styles.step}>
          <section aria-labelledby="services">
            <p className={styles.stepNumber}>05 / SERVICES</p>
            <h2 id="services">Give the merchant a public origin.</h2>
            <p>
              Start the paywalled merchant, then expose its loopback port through
              a temporary Cloudflare Quick Tunnel. Set{' '}
              <code>MERCHANT_TRUST_PROXY=1</code> so the merchant advertises the
              public HTTPS URL instead of its local HTTP listener.
            </p>
            {block('Merchant and Cloudflare Quick Tunnel', `MERCHANT_TRUST_PROXY=1 npm run start:merchant
cloudflared tunnel --url http://127.0.0.1:8788`)}
            <p>
              Copy the tunnel&apos;s <code>https://</code> URL and use it as the
              merchant URL. The MCP correctly rejects localhost for merchant
              payment requests because Tor cannot reach a local listener.
            </p>
            {block('Local MCP server', 'TOR_SOCKS_PROXY=socks5://127.0.0.1:9050 npm run start:server')}
            <details className={styles.details}>
              <summary>Local script versus the real MCP flow</summary>
              <p>
                The standalone script is a direct localhost check. It is useful
                for rehearsing the payer without the MCP URL policy:
              </p>
              {block('Direct localhost payer (separate path)', 'npm run pay:paywall -- http://127.0.0.1:8788/article/agent-privacy --dry')}
              <p>
                The real flow is <code>pay_paywall</code> through the local MCP,
                and therefore requires the public HTTPS tunnel URL. It uses Tor
                for both the unpaid and signed requests.
              </p>
            </details>
          </section>
        </li>

        <li className={styles.step}>
          <section aria-labelledby="clients">
            <p className={styles.stepNumber}>06 / CLIENTS</p>
            <h2 id="clients">Connect Codex or Claude.</h2>
            <p>Register the same loopback Streamable HTTP MCP endpoint in your client.</p>
            {block('Codex', 'codex mcp add tony-strk --url http://127.0.0.1:8787/mcp')}
            {block('Claude Code', 'claude mcp add --scope user --transport http tony-strk http://127.0.0.1:8787/mcp')}
            <p>
              Ask the client for <code>wallet_status</code> first. Then use
              <code>pay</code> for a direct private transfer or{' '}
              <code>pay_paywall</code> with the copied public HTTPS merchant URL.
            </p>
          </section>
        </li>

        <li className={styles.step}>
          <section aria-labelledby="verification">
            <p className={styles.stepNumber}>07 / VERIFICATION</p>
            <h2 id="verification">Prove each boundary.</h2>
            <p>
              Deterministic tests spend nothing. The verifier checks the live MCP,
              Tor, tool registration, and wallet status before it attempts a
              payment. Add <code>--live</code> only when the shielded note is
              mature and you intend to spend Sepolia test STRK.
            </p>
            {block('Deterministic and preflight checks', `npm test
npm run verify:mcp
npm run verify:x402 -- --url PUBLIC_HTTPS_MERCHANT_URL`)}
            {block('Opt-in live x402 payment', 'npm run verify:x402 -- --url PUBLIC_HTTPS_MERCHANT_URL --live')}
            <p className={styles.note}>
              A successful live run reports <code>paid: true</code>, HTTP 200,
              the settlement transaction hash, an explorer URL, and protected
              content. Do not paste a secret or a private URL into shell examples.
            </p>
          </section>
        </li>

        <li className={styles.step}>
          <section aria-labelledby="limits">
            <p className={styles.stepNumber}>08 / LIMITS</p>
            <h2 id="limits">Know what the route reveals.</h2>
            <p>
              Tor hides the MCP host IP from the merchant, while the stateless
              fetcher keeps no browser session. The merchant still sees a public
              settlement receipt, amount, timing, and its own public URL. Deposits
              and withdrawals are visible on-chain; privacy begins inside the
              shared STRK20 pool. OHTTP is not configured by this app, and this is
              not logged-in browsing.
            </p>
            <p className={styles.warning}>
              <strong>Sepolia scope.</strong> The guided x402 verifier is
              testnet-only. Mainnet pool operations and mainnet paywall settlement
              are separate concerns; do not treat a Sepolia proof or test STRK as
              mainnet readiness.
            </p>
            <a className={styles.primaryAction} href="/">Return to the landing page <span aria-hidden="true">↗</span></a>
          </section>
        </li>
      </ol>

      <footer className={styles.footer}>
        <a className={styles.wordmark} href="/">tony <b>strk</b></a>
        <p>Local-first. Shielded testnet payments. No secrets in the browser.</p>
      </footer>
    </main>
  );
}
