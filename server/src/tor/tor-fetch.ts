import { Agent, buildConnector, fetch as undiciFetch } from "undici";
import { SocksClient } from "socks";

/**
 * A fetch that goes through a SOCKS5 proxy.
 *
 * Node's global fetch has no SOCKS support and silently ignores options it
 * doesn't recognise, so the only safe way to do this is to replace the
 * connector underneath undici rather than pass a proxy alongside the request.
 *
 * The destination hostname is handed to the proxy unresolved, so name lookups
 * happen at the exit relay. Resolving locally first would leak every
 * destination to the local DNS resolver even though the traffic itself was
 * tunnelled.
 */
export function createTorFetch() {
  const agents = new Map<string, Agent>();

  async function torFetch(
    target: string,
    { proxy }: { proxy: string },
  ): Promise<Response> {
    let agent = agents.get(proxy);
    if (!agent) {
      agent = buildSocksAgent(proxy);
      agents.set(proxy, agent);
    }

    return (await undiciFetch(target, {
      dispatcher: agent,
    })) as unknown as Response;
  }

  /** Pooled keep-alive sockets otherwise keep the process alive. */
  torFetch.close = async () => {
    await Promise.all([...agents.values()].map((agent) => agent.close()));
    agents.clear();
  };

  return torFetch;
}

function buildSocksAgent(proxy: string): Agent {
  const { hostname: proxyHost, port: proxyPort } = new URL(proxy);
  const connect = buildConnector({});

  return new Agent({
    connect: async (opts, callback) => {
      try {
        const { socket } = await SocksClient.createConnection({
          proxy: { host: proxyHost, port: Number(proxyPort), type: 5 },
          command: "connect",
          destination: {
            host: opts.hostname,
            port: Number(opts.port) || (opts.protocol === "https:" ? 443 : 80),
          },
        });

        if (opts.protocol === "https:") {
          // Let undici's own connector run the TLS handshake over the tunnel.
          return connect({ ...opts, httpSocket: socket }, callback);
        }

        // Plain HTTP: undici rejects `httpSocket` outside a TLS upgrade
        // ("httpSocket can only be sent on TLS update"), so the tunnelled
        // socket has to be handed back directly.
        socket.setNoDelay(true);
        callback(null, socket);
      } catch (error) {
        callback(error as Error, null);
      }
    },
  });
}
