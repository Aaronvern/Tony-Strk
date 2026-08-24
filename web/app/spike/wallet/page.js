'use client'

/**
 * Wallet capability probe — what a privacy-enabled wallet will and will not do.
 *
 * This is kept because its answers shape the whole project, and because a
 * negative result nobody can reproduce is indistinguishable from not having
 * tried. Run it against Ready on Sepolia and you get the same wall we did.
 *
 * It asked two questions the SdkWallet path could not answer, and both are
 * now answered — recorded here rather than in a commit message someone would
 * have to go looking for.
 *
 *   1. Does the wallet balance the note surplus itself? NO. Naive note
 *      selection takes a whole note to cover a small withdraw and the builder
 *      refuses with "Surplus of N found ... but no surplus action found". The
 *      STRK20 action vocabulary has no surplus action, so the dapp has to add
 *      an explicit private transfer back to the payer. See
 *      `balanceSurplus` in server/src/pay/paywall.ts.
 *
 *   2. Does the wallet prove for a *custom* helper? NO — it does not implement
 *      `invoke` at all. Ready (advertising Wallet API 0.10.3) accepts
 *      `deposit`, `withdraw`, and `transfer` with a concrete amount, and
 *      rejects both `transfer` with amount `"OPEN"` and `invoke`, each with a
 *      bare INVALID_REQUEST_PAYLOAD that says nothing about which part it
 *      disliked. That is why the probe ladder below walks from the simplest
 *      action list upward: it separates "this account is not registered"
 *      (every rung fails) from "the wallet does not implement invoke" (only
 *      the rungs containing invoke fail).
 *
 * The consequence is the central constraint on this project: our anonymizer
 * cannot be reached on mainnet by any route available to us. The SDK path has
 * no published mainnet prover, and the wallet path has no `invoke`. The
 * contract is real, tested and deployed — see docs/HANDOFF.md — and the
 * ecosystem cannot call it there yet.
 *
 * The dry run answers everything without spending anything.
 */
import { useCallback, useEffect, useState } from 'react'
import { createStore } from '@starknet-io/get-starknet-discovery'
import { RpcProvider, WalletAccountV6, compareVersions, constants, num, walletV6 } from 'starknet'

const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://starknet-sepolia-rpc.publicnode.com'
const HELPER =
  process.env.NEXT_PUBLIC_HELPER_ADDRESS ??
  '0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d'
const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
const MERCHANT = '0x4d45524348414e54'
const POOL =
  process.env.NEXT_PUBLIC_POOL_ADDRESS ??
  '0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91'

/**
 * Parse a decimal STRK string to wei without touching Number — 2^53 wei is
 * about 0.009 STRK, so floats silently lose precision at these sizes. Same
 * rule the `pay` tool follows.
 */
function toWei(text) {
  const [whole, frac = ''] = String(text).trim().split('.')
  if (frac.length > 18) throw new Error(`${text} has more than 18 decimals`)
  return BigInt(whole || '0') * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18))
}

const fmt = (wei) => {
  const s = (wei < 0n ? -wei : wei).toString().padStart(19, '0')
  return `${wei < 0n ? '-' : ''}${s.slice(0, -18)}.${s.slice(-18).replace(/0+$/, '') || '0'}`
}
/** felt-encode a short ASCII string. Browser-safe: no Buffer here. */
function shortStringToFelt(text) {
  let hex = '0x'
  for (const byte of new TextEncoder().encode(text)) hex += byte.toString(16).padStart(2, '0')
  return num.toHex(BigInt(hex))
}
const RESOURCE = shortStringToFelt('article/42')

/** Wallet API version that introduced the STRK20 methods. */
const REQUIRED_API = '0.10.3'

/** The helper is deployed on Sepolia only. A wallet pointed at mainnet cannot
 *  invoke it — the contract does not exist there, which the wallet reports as
 *  INVALID_REQUEST_PAYLOAD rather than anything about the chain. */
const REQUIRED_CHAIN = constants.StarknetChainId.SN_SEPOLIA

/**
 * Wallet calls can hang forever. `switchStarknetChain` in particular may never
 * settle if the wallet queues the prompt in its popup, or ignores the request
 * for a network the user has not enabled. Bound every call so a silent wallet
 * cannot lock the page.
 */
function withTimeout(promise, ms, label) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `${label} did not answer in ${ms / 1000}s — the wallet may still be working, ` +
                `and the transaction can still land. Check the explorer before retrying.`
            )
          ),
        ms
      )
    }),
  ])
}

/**
 * The three legs. Calldata order must match `privacy_invoke`'s signature:
 *   merchant, token, price: u128, resource_hash: felt252, change_note_id: Option<felt252>
 * `Option::Some` is variant index 0 (verified on-chain), so the last argument
 * is two felts: the variant index, then the note id placeholder.
 */
function paywallActions(payer, funding, price) {
  return [
    { type: 'withdraw', token: STRK, amount: num.toHex(funding), recipient: HELPER },
    // The open note belongs to the payer — it is where their change lands.
    { type: 'transfer', token: STRK, amount: 'OPEN', recipient: payer },
    {
      type: 'invoke',
      contract: HELPER,
      calldata: [MERCHANT, STRK, num.toHex(price), RESOURCE, '0x0', '${openNoteIds[0]}'],
    },
  ]
}

export default function WalletSpike() {
  const [wallets, setWallets] = useState([])
  const [account, setAccount] = useState(null)
  const [info, setInfo] = useState(null)
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const [amounts, setAmounts] = useState({ shield: '10', funding: '0.1', price: '0.05' })
  const [poolFee, setPoolFee] = useState(null)
  const [pending, setPending] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const set = (k) => (e) => setAmounts((a) => ({ ...a, [k]: e.target.value }))

  let parsed = null
  let parseError = null
  try {
    parsed = {
      shield: toWei(amounts.shield),
      funding: toWei(amounts.funding),
      price: toWei(amounts.price),
    }
  } catch (e) {
    parseError = String(e.message)
  }

  const say = useCallback((line, kind = 'info') => {
    setLog((l) => [...l, { line, kind, at: new Date().toLocaleTimeString() }])
  }, [])

  // Without this, a wallet call that takes two prompts and a minute of proving
  // is indistinguishable from a frozen page.
  useEffect(() => {
    if (!pending) return setElapsed(0)
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [pending])

  /** Run a wallet step with a visible pending state and a bounded wait. */
  const step = useCallback(
    async (label, fn) => {
      setBusy(true)
      setPending(label)
      try {
        return await fn()
      } catch (e) {
        say(`${label}: ${String(e?.message ?? e)}`, 'bad')
      } finally {
        setBusy(false)
        setPending(null)
      }
    },
    [say]
  )

  // Wallet Standard discovery: wallets announce themselves, so this is a
  // subscription rather than a one-shot read.
  useEffect(() => {
    const store = createStore()
    setWallets(store.getWallets())
    const stop = store.subscribe((found) => setWallets([...found]))
    store._refreshInjectedWallets()
    return stop
  }, [])

  async function connect(wallet) {
    setBusy(true)
    try {
      say(`connecting to ${wallet.name}…`)

      // Feature-detect with a version query, never by probing a data method:
      // strk20Balances is gated behind a consent prompt for data we do not need.
      const versions = await withTimeout(walletV6.supportedWalletApi(wallet), 20000, 'supportedWalletApi')
      const ok = versions.some((v) => compareVersions(v, REQUIRED_API) >= 0)
      say(`wallet API versions: ${versions.join(', ')}`, ok ? 'good' : 'bad')
      if (!ok) {
        say(`needs >= ${REQUIRED_API} for STRK20. This wallet cannot do it.`, 'bad')
        return
      }

      await withTimeout(walletV6.standardConnect(wallet), 60000, 'standardConnect')
      const [address] = await withTimeout(walletV6.requestAccounts(wallet), 30000, 'requestAccounts')
      const chainId = await withTimeout(walletV6.requestChainId(wallet), 20000, 'requestChainId')

      const acct = new WalletAccountV6({
        provider: new RpcProvider({ nodeUrl: RPC }),
        walletProvider: wallet,
        address,
      })
      setAccount(acct)
      setInfo({ name: wallet.name, address, chainId, versions, wallet })
      say(`connected ${address} on ${chainId}`, 'good')

      // The flat pool fee comes out of the shielded balance on every private
      // operation, and wallet flows sponsor gas but not this. Read it rather
      // than hardcoding — it differs by network.
      try {
        const [fee] = await new RpcProvider({ nodeUrl: RPC }).callContract({
          contractAddress: POOL,
          entrypoint: 'get_fee_amount',
          calldata: [],
        })
        setPoolFee(BigInt(fee))
        say(`pool fee is ${fmt(BigInt(fee))} STRK per private operation`)
      } catch {
        say('could not read get_fee_amount from the pool', 'bad')
      }
      if (chainId !== REQUIRED_CHAIN) {
        say(`WRONG CHAIN — this is ${chainId}, the helper is on Sepolia. Switch before invoking.`, 'bad')
      }
    } catch (e) {
      say(String(e?.message ?? e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  async function switchToSepolia() {
    setBusy(true)
    try {
      say('asking the wallet to switch to Sepolia…')
      try {
        await withTimeout(
          walletV6.switchStarknetChain(info.wallet, REQUIRED_CHAIN),
          20000,
          'switchStarknetChain'
        )
      } catch (e) {
        say(String(e?.message ?? e), 'bad')
        say('Switch networks in the Ready extension itself, then press Re-check chain.', 'info')
      }
      const chainId = await withTimeout(walletV6.requestChainId(info.wallet), 10000, 'requestChainId')
      setInfo((i) => ({ ...i, chainId }))
      say(`now on ${chainId}`, chainId === REQUIRED_CHAIN ? 'good' : 'bad')
    } catch (e) {
      say(String(e?.message ?? e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  async function recheckChain() {
    setBusy(true)
    try {
      const chainId = await withTimeout(walletV6.requestChainId(info.wallet), 10000, 'requestChainId')
      setInfo((i) => ({ ...i, chainId }))
      say(`chain is now ${chainId}`, chainId === REQUIRED_CHAIN ? 'good' : 'bad')
    } catch (e) {
      say(String(e?.message ?? e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  // NOT_REGISTERED just means this account has never used the pool. A deposit
  // registers it and gives it something to spend. Note the shield is two
  // prompts: the ERC-20 approve must land before the private deposit.
  async function shield() {
    setBusy(true)
    setPending('shield')
    try {
      say(`shielding ${amounts.shield} STRK — expect TWO prompts (approve, then deposit)…`)
      const { transaction_hash } = await withTimeout(
        account.strk20InvokeTransaction([
          { type: 'deposit', token: STRK, amount: num.toHex(parsed.shield) },
        ]),
        180000,
        'shield'
      )
      say(`shielded, tx ${transaction_hash}`, 'good')
      say(`https://sepolia.voyager.online/tx/${transaction_hash}`, 'good')
      say('notes need ~12 blocks (~6 min) to be spendable — wait before the dry run.', 'info')
    } catch (e) {
      say(String(e?.message ?? e), 'bad')
      say('A timeout is not a failure — check the account balance or the explorer before retrying.', 'info')
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  async function shieldedBalance() {
    setBusy(true)
    try {
      say('asking the wallet for shielded balances (it will prompt for consent)…')
      const balances = await withTimeout(account.strk20Balances([STRK]), 60000, 'strk20Balances')
      if (!balances.length) say('no shielded balance for STRK', 'bad')
      for (const b of balances) {
        say(`shielded ${Number(BigInt(b.balance)) / 1e18} STRK`, 'good')
      }
    } catch (e) {
      say(String(e?.message ?? e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  // THE question. If this passes with no surplus action, the wallet balances
  // notes itself and the SdkWallet workaround is not needed on this route.
  async function dryRun() {
    setBusy(true)
    try {
      const actions = paywallActions(info.address, parsed.funding, parsed.price)
      say('dry run: proving the three legs without submitting…')
      say(`payload: ${JSON.stringify(actions)}`)
      if (info.chainId !== REQUIRED_CHAIN) {
        say(`refusing: wallet is on ${info.chainId}, helper is on Sepolia.`, 'bad')
        return
      }
      await withTimeout(account.strk20PrepareInvoke(actions, true), 90000, 'strk20PrepareInvoke')
      say('ACCEPTED — the wallet handled note selection itself ✅', 'good')
      say('No surplus action was needed. That is the answer.', 'good')
    } catch (e) {
      const msg = String(e?.message ?? e)
      say(msg, 'bad')
      if (/Surplus of (\d+)/.test(msg)) {
        say('The wallet does NOT balance the surplus either — the dapp must add the sink.', 'bad')
      }
    } finally {
      setBusy(false)
    }
  }

  /**
   * INVALID_REQUEST_PAYLOAD says nothing about which part the wallet disliked.
   * Walk from the simplest action list to the full three legs and report the
   * first rung that fails — that separates "account not registered" (every
   * rung fails) from "the wallet does not implement invoke for custom helpers"
   * (only the rungs containing invoke fail), which are very different problems.
   */
  async function probe() {
    setBusy(true)
    const me = info.address
    const ladder = [
      ['open note only', [{ type: 'transfer', token: STRK, amount: 'OPEN', recipient: me }]],
      ['withdraw to self', [{ type: 'withdraw', token: STRK, amount: num.toHex(parsed.funding), recipient: me }]],
      ['withdraw to helper', [{ type: 'withdraw', token: STRK, amount: num.toHex(parsed.funding), recipient: HELPER }]],
      ['withdraw + open note (no invoke)', [
        { type: 'withdraw', token: STRK, amount: num.toHex(parsed.funding), recipient: HELPER },
        { type: 'transfer', token: STRK, amount: 'OPEN', recipient: me },
      ]],
      // Is `transfer` broken, or only the "OPEN" literal? A concrete-amount
      // transfer to self separates "the action type is unsupported" from
      // "open notes specifically are unsupported".
      ['transfer to self, concrete amount', [
        { type: 'transfer', token: STRK, amount: num.toHex(parsed.price), recipient: me },
      ]],
      // Does the wallet do `invoke` at all for a custom helper? Nothing here
      // creates an open note, so this isolates the invoke action itself.
      ['invoke alone (no open note)', [
        { type: 'invoke', contract: HELPER, calldata: [MERCHANT, STRK, num.toHex(parsed.price), RESOURCE, '0x1'] },
      ]],
      // An open note WITH the invoke that fills it. A wallet that rejects a
      // dangling open note might accept this one, since the pool aborts on an
      // open note left undeposited (UNDEPOSITED_OPEN_NOTES).
      ['open note + invoke (no withdraw)', [
        { type: 'transfer', token: STRK, amount: 'OPEN', recipient: me },
        {
          type: 'invoke',
          contract: HELPER,
          calldata: [MERCHANT, STRK, num.toHex(parsed.price), RESOURCE, '0x0', '${openNoteIds[0]}'],
        },
      ]],
      ['full three legs', paywallActions(me, parsed.funding, parsed.price)],
    ]
    for (const [label, actions] of ladder) {
      try {
        await withTimeout(account.strk20PrepareInvoke(actions, true), 45000, label)
        say(`${label}: ACCEPTED ✅`, 'good')
      } catch (e) {
        const msg = String(e?.message ?? e)
        say(`${label}: ${msg}`, 'bad')
        if (/did not answer/.test(msg)) {
          say('→ the wallet never responded. Open the Ready popup — a prompt may be queued there.', 'info')
        }
        if (/NOT_REGISTERED/.test(msg)) {
          say('→ the account is not registered in the pool. Register it in Ready first.', 'info')
          break
        }
        if (/Surplus of/.test(msg)) {
          say('→ the wallet does NOT balance surplus either. Every dapp on this route needs the sink.', 'info')
        }
      }
    }
    setBusy(false)
  }

  async function submit() {
    setBusy(true)
    try {
      say('submitting for real — the wallet will prompt…')
      const { transaction_hash } = await withTimeout(
        account.strk20InvokeTransaction(paywallActions(info.address, parsed.funding, parsed.price)),
        180000,
        'strk20InvokeTransaction'
      )
      say(`SUBMITTED ${transaction_hash}`, 'good')
      say(`https://sepolia.voyager.online/tx/${transaction_hash}`, 'good')
    } catch (e) {
      say(String(e?.message ?? e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={S.page}>
      <h1 style={S.h1}>Wallet route spike</h1>
      <p style={S.sub}>
        Throwaway. Asks whether the Starknet Wallet API can drive our anonymizer at{' '}
        <code style={S.code}>{HELPER.slice(0, 14)}…</code> on Sepolia, and whether the wallet
        balances note surplus itself.
      </p>

      <section style={S.card}>
        <h2 style={S.h2}>1 · Wallets found</h2>
        {wallets.length === 0 ? (
          <p style={S.muted}>
            None announced yet. Ready must be installed and unlocked — it is currently the only
            STRK20-capable wallet.
          </p>
        ) : (
          wallets.map((w) => (
            <button key={w.name} style={S.btn} disabled={busy} onClick={() => connect(w)}>
              Connect {w.name}
            </button>
          ))
        )}
      </section>

      {info && (
        <section style={S.card}>
          <h2 style={S.h2}>2 · Connected</h2>
          <dl style={S.dl}>
            <dt style={S.dt}>wallet</dt><dd style={S.dd}>{info.name}</dd>
            <dt style={S.dt}>account</dt><dd style={S.dd}><code style={S.code}>{info.address}</code></dd>
            <dt style={S.dt}>chain</dt><dd style={S.dd}>{info.chainId}</dd>
            <dt style={S.dt}>api</dt><dd style={S.dd}>{info.versions.join(', ')}</dd>
          </dl>
          {info.chainId !== REQUIRED_CHAIN && (
            <button style={S.btnPrimary} disabled={busy} onClick={switchToSepolia}>
              Switch to Sepolia
            </button>
          )}
          <div style={S.amounts}>
            <label style={S.label}>
              Shield
              <input style={S.input} value={amounts.shield} onChange={set('shield')} inputMode="decimal" />
              <span style={S.unit}>STRK</span>
            </label>
            <label style={S.label}>
              Funding
              <input style={S.input} value={amounts.funding} onChange={set('funding')} inputMode="decimal" />
              <span style={S.unit}>STRK to the helper</span>
            </label>
            <label style={S.label}>
              Price
              <input style={S.input} value={amounts.price} onChange={set('price')} inputMode="decimal" />
              <span style={S.unit}>STRK to the merchant</span>
            </label>
          </div>

          {parseError && <p style={S.warn}>{parseError}</p>}

          {parsed && (
            <p style={parsed.price > parsed.funding ? S.warn : S.note}>
              {parsed.price > parsed.funding
                ? 'Price exceeds funding — the helper will revert with FUNDING_BELOW_PRICE.'
                : `Change to the open note: ${fmt(parsed.funding - parsed.price)} STRK.` +
                  (poolFee === null
                    ? ''
                    : ` Needs ${fmt(parsed.funding + poolFee)} STRK shielded (funding + ${fmt(poolFee)} pool fee).`)}
              {parsed && parsed.price === parsed.funding
                ? ' Exact payment returns an empty span — but this page always sends Some(note), so it would revert. Use a price below funding.'
                : ''}
            </p>
          )}

          <button style={S.btn} disabled={busy} onClick={recheckChain}>
            Re-check chain
          </button>
          <button style={S.btn} disabled={busy || !parsed} onClick={shield}>
            Shield {amounts.shield} STRK
          </button>
          <button style={S.btn} disabled={busy} onClick={shieldedBalance}>
            Read shielded balance
          </button>
          <button style={S.btnPrimary} disabled={busy} onClick={dryRun}>
            Dry run the paywall payment
          </button>
          <button style={S.btnPrimary} disabled={busy} onClick={probe}>
            Probe payload shapes
          </button>
          <button style={S.btn} disabled={busy} onClick={submit}>
            Submit for real
          </button>
        </section>
      )}

      {pending && (
        <section style={S.pending}>
          waiting on <b>{pending}</b> — {elapsed}s elapsed. Ready may be showing a prompt; a
          deposit needs two. This can take a minute or more while it proves.
        </section>
      )}

      <section style={S.card}>
        <h2 style={S.h2}>Log</h2>
        {log.length === 0 && <p style={S.muted}>Nothing yet.</p>}
        {log.map((l, i) => (
          <div key={i} style={{ ...S.log, color: l.kind === 'bad' ? '#ff8080' : l.kind === 'good' ? '#7ee787' : '#c9d1d9' }}>
            <span style={S.time}>{l.at}</span> {l.line}
          </div>
        ))}
      </section>
    </main>
  )
}

const S = {
  page: { maxWidth: 820, margin: '0 auto', padding: '2.5rem 1.25rem', fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#c9d1d9', background: '#0d1117', minHeight: '100vh' },
  h1: { fontSize: '1.6rem', margin: '0 0 .4rem' },
  h2: { fontSize: '.95rem', textTransform: 'uppercase', letterSpacing: '.06em', color: '#8b949e', margin: '0 0 .75rem' },
  sub: { color: '#8b949e', lineHeight: 1.6, margin: '0 0 1.75rem' },
  card: { border: '1px solid #30363d', borderRadius: 10, padding: '1.1rem 1.25rem', margin: '0 0 1.1rem', background: '#161b22' },
  btn: { background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 7, padding: '.5rem .9rem', marginRight: '.5rem', marginTop: '.4rem', cursor: 'pointer', fontSize: '.9rem' },
  btnPrimary: { background: '#1f6feb', color: '#fff', border: '1px solid #1f6feb', borderRadius: 7, padding: '.5rem .9rem', marginRight: '.5rem', marginTop: '.4rem', cursor: 'pointer', fontSize: '.9rem' },
  muted: { color: '#8b949e', margin: 0, lineHeight: 1.6 },
  dl: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '.35rem .9rem', margin: '0 0 .9rem' },
  dt: { color: '#8b949e', fontSize: '.85rem' },
  dd: { margin: 0, fontSize: '.85rem', overflowWrap: 'anywhere' },
  code: { fontFamily: 'ui-monospace, monospace', background: '#0d1117', padding: '.1rem .35rem', borderRadius: 4 },
  pending: { border: '1px solid #9e6a03', background: '#2b2000', color: '#e3b341', borderRadius: 10, padding: '.8rem 1rem', margin: '0 0 1.1rem', fontSize: '.85rem', lineHeight: 1.6 },
  amounts: { display: 'grid', gap: '.5rem', margin: '0 0 .75rem' },
  label: { display: 'grid', gridTemplateColumns: '5.5rem 7rem 1fr', alignItems: 'center', gap: '.6rem', fontSize: '.85rem', color: '#8b949e' },
  input: { background: '#0d1117', border: '1px solid #30363d', borderRadius: 6, color: '#c9d1d9', padding: '.35rem .5rem', fontFamily: 'ui-monospace, monospace', fontSize: '.85rem', width: '100%' },
  unit: { fontSize: '.8rem', color: '#6e7681' },
  note: { fontSize: '.82rem', color: '#8b949e', margin: '0 0 .6rem', lineHeight: 1.6 },
  warn: { fontSize: '.82rem', color: '#ffa657', margin: '0 0 .6rem', lineHeight: 1.6 },
  log: { fontFamily: 'ui-monospace, monospace', fontSize: '.82rem', lineHeight: 1.7, overflowWrap: 'anywhere' },
  time: { color: '#6e7681', marginRight: '.5rem' },
}
