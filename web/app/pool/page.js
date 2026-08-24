'use client'

/**
 * The STRK20 pool console.
 *
 * Three buttons, in the order the money moves: shield, transfer privately,
 * unshield. Each returns a transaction hash we have to keep — the hackathon
 * hub verifies those hashes on-chain, so losing one means paying the pool fee
 * again to replace it. On mainnet that fee is 6 STRK a step, which is also why
 * every step here can be dry-run first: proving without submitting costs
 * nothing and catches a bad payload before the wallet charges for one.
 *
 * The route deliberately does NOT touch our anonymizer. `invoke` is the one
 * STRK20 action Ready rejects today (see docs/HANDOFF.md), so a page needing it
 * could not run on mainnet at all. Deposit, transfer and withdraw are the three
 * the wallet does implement, and also exactly the three the submission wants.
 */

import { useCallback, useEffect, useState } from 'react'
import { createStore } from '@starknet-io/get-starknet-discovery'
import { RpcProvider, WalletAccountV6, compareVersions, constants, num, walletV6 } from 'starknet'

import { fmt, toWei, u256 } from '../../src/amount.js'

/** Wallet API version that introduced the STRK20 methods. */
const REQUIRED_API = '0.10.3'

/** Same token address on both networks. */
const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'

/**
 * Everything network-specific, keyed by the chain id the wallet reports. Read
 * at runtime rather than from NEXT_PUBLIC_*, which Next inlines at build time:
 * this page has to follow whatever chain the extension is on, and a baked-in
 * value would quietly point mainnet actions at a Sepolia explorer.
 */
const CHAINS = {
  [constants.StarknetChainId.SN_MAIN]: {
    name: 'mainnet',
    real: true,
    pool: '0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a',
    rpc: 'https://rpc.starknet.lava.build',
    voyager: 'https://voyager.online/tx/',
    starkscan: 'https://starkscan.co/tx/',
  },
  [constants.StarknetChainId.SN_SEPOLIA]: {
    name: 'sepolia',
    real: false,
    pool: '0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91',
    rpc: 'https://starknet-sepolia-rpc.publicnode.com',
    voyager: 'https://sepolia.voyager.online/tx/',
    starkscan: 'https://sepolia.starkscan.co/tx/',
  },
}

/** A new note is not spendable until the pool has moved on ~10 blocks. */
const MATURITY_BLOCKS = 12

/**
 * Wallet calls can hang forever — a prompt queued in a popup the user never
 * opened looks exactly like a frozen page. Bound every one, and say clearly
 * that a timeout is not a failure: proving plus paymaster relay can outlast
 * any bound we pick, and the transaction may still land.
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
              `${label} did not answer in ${Math.round(ms / 1000)}s. The wallet may still be ` +
                `working and the transaction can still land — check the explorer before retrying.`
            )
          ),
        ms
      )
    }),
  ])
}

export default function PoolConsole() {
  const [wallets, setWallets] = useState([])
  const [account, setAccount] = useState(null)
  const [info, setInfo] = useState(null)
  const [chain, setChain] = useState(null)
  const [fee, setFee] = useState(null)
  const [publicBalance, setPublicBalance] = useState(null)
  const [block, setBlock] = useState(null)
  const [shieldedAt, setShieldedAt] = useState(null)
  const [log, setLog] = useState([])
  const [records, setRecords] = useState([])
  const [pending, setPending] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [form, setForm] = useState({ shield: '30', transfer: '1', unshield: '1', recipient: '' })

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const say = useCallback((line, kind = 'info') => {
    setLog((l) => [...l, { line, kind, at: new Date().toLocaleTimeString() }])
  }, [])

  // Amounts are parsed on every render so a bad keystroke disables the buttons
  // rather than throwing inside a wallet call that has already prompted.
  let amounts = null
  let amountError = null
  try {
    amounts = {
      shield: toWei(form.shield),
      transfer: toWei(form.transfer),
      unshield: toWei(form.unshield),
    }
  } catch (error) {
    amountError = error.message
  }

  useEffect(() => {
    if (!pending) return setElapsed(0)
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [pending])

  // Wallet Standard discovery is a subscription, not a one-shot read: wallets
  // announce themselves whenever they finish injecting.
  useEffect(() => {
    const store = createStore()
    setWallets(store.getWallets())
    const stop = store.subscribe((found) => setWallets([...found]))
    store._refreshInjectedWallets()
    return stop
  }, [])

  // Poll the head so the maturity counter under a fresh shield stays live.
  // Notes are the one thing here that fails on timing rather than on payload.
  useEffect(() => {
    if (!chain) return
    const provider = new RpcProvider({ nodeUrl: chain.rpc })
    let alive = true
    const tick = () =>
      provider
        .getBlockNumber()
        .then((n) => alive && setBlock(n))
        .catch(() => {})
    tick()
    const timer = setInterval(tick, 15000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [chain])

  async function readChainState(target, address) {
    const provider = new RpcProvider({ nodeUrl: target.rpc })
    try {
      const [amount] = await provider.callContract({
        contractAddress: target.pool,
        entrypoint: 'get_fee_amount',
        calldata: [],
      })
      setFee(BigInt(amount))
      say(`pool fee is ${fmt(BigInt(amount))} STRK per private operation`)
    } catch {
      setFee(null)
      say('could not read get_fee_amount from the pool', 'bad')
    }
    try {
      const balance = u256(
        await provider.callContract({
          contractAddress: STRK,
          entrypoint: 'balanceOf',
          calldata: [address],
        })
      )
      setPublicBalance(balance)
    } catch {
      setPublicBalance(null)
    }
  }

  /** Point the page at whatever chain and account the wallet is currently on. */
  async function adopt(wallet, chainId, address) {
    const target = CHAINS[chainId]
    if (!target) {
      say(`unknown chain ${chainId} — switch the wallet to mainnet or Sepolia.`, 'bad')
      return
    }
    setAccount(
      new WalletAccountV6({
        provider: new RpcProvider({ nodeUrl: target.rpc }),
        walletProvider: wallet,
        address,
      })
    )
    setInfo({ name: wallet.name, address, chainId, wallet })
    setChain(target)
    // Notes do not survive a chain change, and neither should the counter.
    setShieldedAt(null)
    say(`connected ${address} on ${target.name}`, 'good')
    if (target.real) say('This is MAINNET. Every fee below is real money.', 'warn')
    await readChainState(target, address)
  }

  async function connect(wallet) {
    setPending('connect')
    try {
      say(`connecting to ${wallet.name}…`)

      // Feature-detect with a version query. Probing strk20Balances would work
      // too, but it is a balance read gated behind a consent prompt for data
      // this page has no reason to see.
      const versions = await withTimeout(
        walletV6.supportedWalletApi(wallet),
        20000,
        'supportedWalletApi'
      )
      if (!versions.some((v) => compareVersions(v, REQUIRED_API) >= 0)) {
        say(`${wallet.name} speaks ${versions.join(', ')} — STRK20 needs ${REQUIRED_API}.`, 'bad')
        return
      }

      await withTimeout(walletV6.standardConnect(wallet), 60000, 'standardConnect')
      const [address] = await withTimeout(walletV6.requestAccounts(wallet), 30000, 'requestAccounts')
      const chainId = await withTimeout(walletV6.requestChainId(wallet), 20000, 'requestChainId')
      await adopt(wallet, chainId, address)
    } catch (error) {
      say(String(error?.message ?? error), 'bad')
    } finally {
      setPending(null)
    }
  }

  async function recheckChain() {
    setPending('chain')
    try {
      const chainId = await withTimeout(walletV6.requestChainId(info.wallet), 10000, 'requestChainId')
      const [address] = await withTimeout(
        walletV6.requestAccounts(info.wallet),
        20000,
        'requestAccounts'
      )
      await adopt(info.wallet, chainId, address)
    } catch (error) {
      say(String(error?.message ?? error), 'bad')
    } finally {
      setPending(null)
    }
  }

  const recipient = form.recipient.trim() || info?.address

  /**
   * The three action lists, built in one place so a dry run proves exactly the
   * payload the submit will send. A dry run against a different payload would
   * be worse than none — it would buy false confidence with real money behind
   * it.
   */
  const actionsFor = (kind) =>
    ({
      shield: [{ type: 'deposit', token: STRK, amount: num.toHex(amounts.shield) }],
      transfer: [
        { type: 'transfer', token: STRK, amount: num.toHex(amounts.transfer), recipient },
      ],
      unshield: [
        {
          type: 'withdraw',
          token: STRK,
          amount: num.toHex(amounts.unshield),
          recipient: info.address,
        },
      ],
    })[kind]

  const describe = (kind) =>
    ({
      shield: `shield ${form.shield} STRK`,
      transfer: `transfer ${form.transfer} STRK privately to ${recipient}`,
      unshield: `withdraw ${form.unshield} STRK to ${info?.address}`,
    })[kind]

  /** Prove without submitting. Free, and the only cheap way to test a payload. */
  async function dryRun(kind) {
    setPending(`${kind} (dry run)`)
    try {
      const actions = actionsFor(kind)
      say(`dry run — proving ${describe(kind)} without submitting…`)
      say(`payload: ${JSON.stringify(actions)}`)
      await withTimeout(account.strk20PrepareInvoke(actions, true), 120000, `${kind} dry run`)
      say(`${kind}: the wallet accepted and proved it. Safe to submit.`, 'good')
    } catch (error) {
      say(`${kind} dry run: ${String(error?.message ?? error)}`, 'bad')
    } finally {
      setPending(null)
    }
  }

  /**
   * Submit one action list and keep the hash. Everything that differs between
   * the three steps is a parameter, because the part that must never differ is
   * what happens to the hash afterwards.
   */
  async function submit(kind) {
    setPending(kind)
    try {
      const actions = actionsFor(kind)
      say(
        kind === 'shield'
          ? `${describe(kind)} — expect TWO prompts (approve, then deposit)…`
          : `${describe(kind)}…`
      )
      const { transaction_hash: hash } = await withTimeout(
        account.strk20InvokeTransaction(actions),
        240000,
        kind
      )
      setRecords((r) => [
        ...r,
        {
          kind,
          hash,
          chain: chain.name,
          voyager: `${chain.voyager}${hash}`,
          starkscan: `${chain.starkscan}${hash}`,
          at: new Date().toISOString(),
        },
      ])
      say(`${kind} submitted — ${hash}`, 'good')
      say(`${chain.voyager}${hash}`, 'good')

      if (kind === 'shield') {
        // Read the head now rather than trusting the 15s poll: a stale block
        // number would make the maturity counter finish early, which is the one
        // direction that costs a failed transaction.
        const head = await new RpcProvider({ nodeUrl: chain.rpc }).getBlockNumber()
        setShieldedAt(head)
        setBlock(head)
        say(`wait ~${MATURITY_BLOCKS} blocks before spending the new note.`, 'info')
      }
      await readChainState(chain, info.address)
    } catch (error) {
      say(String(error?.message ?? error), 'bad')
      say(
        'If that was a timeout rather than a rejection, look for the hash in the wallet ' +
          'activity list before paying the pool fee again.',
        'info'
      )
    } finally {
      setPending(null)
    }
  }

  const matureIn = shieldedAt !== null && block ? Math.max(0, shieldedAt + MATURITY_BLOCKS - block) : 0
  const mainnetHashes = records.filter((r) => r.chain === 'mainnet').map((r) => r.hash)
  const busy = pending !== null
  const ready = Boolean(account && chain && !amountError)

  const step = (kind, label, help) => (
    <div className="step">
      <label htmlFor={kind}>{label}</label>
      <div className="row">
        <input id={kind} value={form[kind]} onChange={set(kind)} inputMode="decimal" />
        <span className="unit">STRK</span>
        <button className="ghost" onClick={() => dryRun(kind)} disabled={!ready || busy}>
          Dry run
        </button>
        <button onClick={() => submit(kind)} disabled={!ready || busy}>
          Submit
        </button>
      </div>
      {help}
    </div>
  )

  return (
    <main className="pool">
      <header>
        <a className="wordmark" href="/">tony <b>strk</b></a>
        <h1>Pool console</h1>
        <p>
          Shield, transfer privately, unshield. Three transactions against the STRK20 pool, with
          every hash kept for the submission. Dry-run each step first — proving costs nothing,
          submitting costs the pool fee whether or not it works.
        </p>
      </header>

      <section className="panel">
        <h2>1 · Wallet</h2>
        {!info && (
          <div className="wallets">
            {wallets.length === 0 && (
              <p className="muted">No Starknet wallet has announced itself yet.</p>
            )}
            {wallets.map((wallet) => (
              <button key={wallet.name} onClick={() => connect(wallet)} disabled={busy}>
                Connect {wallet.name}
              </button>
            ))}
          </div>
        )}
        {info && (
          <>
            <dl className="facts">
              <div><dt>Wallet</dt><dd>{info.name}</dd></div>
              <div><dt>Account</dt><dd className="mono break">{info.address}</dd></div>
              <div>
                <dt>Network</dt>
                <dd className={chain?.real ? 'danger' : ''}>
                  {chain?.name}{chain?.real ? ' — real money' : ' — test money'}
                </dd>
              </div>
              <div><dt>Head block</dt><dd>{block ?? '…'}</dd></div>
              <div>
                <dt>Public STRK</dt>
                <dd>{publicBalance === null ? '…' : `${fmt(publicBalance)} STRK`}</dd>
              </div>
              <div>
                <dt>Pool fee</dt>
                <dd>
                  {fee === null ? '…' : `${fmt(fee)} STRK per operation`}
                  {fee !== null && (
                    <span className="muted"> · {fmt(fee * 3n)} STRK for all three steps</span>
                  )}
                </dd>
              </div>
            </dl>
            <button className="ghost" onClick={recheckChain} disabled={busy}>
              Re-check network and account
            </button>
          </>
        )}
      </section>

      {chain?.real && (
        <p className="banner danger">
          Mainnet. The pool fee is charged on every one of the three operations and is not refunded
          if a later step fails. Rehearse the whole sequence on Sepolia first.
        </p>
      )}

      <section className="panel">
        <h2>2 · Move the money</h2>
        {amountError && <p className="banner danger">{amountError}</p>}

        {step(
          'shield',
          'Shield (public → pool)',
          <>
            <p className="muted">
              Two prompts: an ERC-20 approve, then the private deposit. This is the public leg — it
              names you on-chain, which is exactly why the transfer below has to be a separate
              transaction rather than a second action in this one.
            </p>
            {shieldedAt !== null && (
              <p className={matureIn > 0 ? 'muted warn' : 'muted good'}>
                {matureIn > 0
                  ? `New note matures in ~${matureIn} blocks. Spending it sooner fails with NOTE_NOT_FOUND.`
                  : 'New note should be spendable now.'}
              </p>
            )}
          </>
        )}

        {step(
          'transfer',
          'Transfer privately (pool → pool)',
          <>
            <input
              className="wide mono"
              value={form.recipient}
              onChange={set('recipient')}
              placeholder={info?.address ?? 'recipient — defaults to yourself'}
            />
            <p className="muted">
              No contract call, no event, no approval. The recipient must already be registered with
              the pool and only they can register themselves — sending to yourself always works,
              because the deposit above registered you.
            </p>
          </>
        )}

        {step(
          'unshield',
          'Unshield (pool → public)',
          <p className="muted">
            Withdraws to your own account. Leave enough shielded to cover the pool fee, or the
            withdrawal fails after you have already signed for it.
          </p>
        )}
      </section>

      {pending && (
        <p className="banner">
          {pending} — {elapsed}s elapsed. Proving and paymaster relay take time; check the wallet
          popup if nothing has appeared.
        </p>
      )}

      <section className="panel">
        <h2>3 · Hashes</h2>
        {records.length === 0 && <p className="muted">Nothing submitted yet.</p>}
        {records.length > 0 && (
          <table>
            <thead>
              <tr><th>Step</th><th>Network</th><th>Hash</th><th>Explorers</th></tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.hash}>
                  <td>{r.kind}</td>
                  <td>{r.chain}</td>
                  <td className="mono break">{r.hash}</td>
                  <td>
                    <a href={r.voyager} target="_blank" rel="noreferrer">Voyager</a>
                    {' · '}
                    <a href={r.starkscan} target="_blank" rel="noreferrer">Starkscan</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {mainnetHashes.length > 0 && (
          <>
            <p className="muted">Mainnet hashes, in the shape `strk20.json` wants:</p>
            <pre className="mono">{JSON.stringify(mainnetHashes, null, 2)}</pre>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Log</h2>
        <ol className="log">
          {log.map((entry, i) => (
            <li key={i} className={entry.kind}>
              <span className="muted">{entry.at}</span> {entry.line}
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
