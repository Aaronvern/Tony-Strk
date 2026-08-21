import { Agent, buildConnector, fetch as undiciFetch } from "undici";
import { SocksClient } from "socks";

/**
 * A fetch that goes through a SOCKS5 proxy.
 *
 * Node's global fetch has no SOCKS support and silently ignores options it
 * doesn't recognise, so the only safe way to do this is to replace the
 * connector underneath undici rather than pass a proxy alongside the request.
 *
 * Browse resolves and vets each destination before calling this fetcher. The
 * SOCKS connection uses that address, while Undici retains the URL hostname
 * for HTTP Host and HTTPS SNI.
 */
export function createTorFetch() {
  const agents = new Map<string, Agent>();

  async function torFetch(
    target: string,
    { proxy, address, redirect, signal }: {
      proxy: string;
      address?: string;
      redirect?: "manual";
      signal?: AbortSignal;
    },
  ): Promise<Response> {
    const destination = address ?? new URL(target).hostname;
    const key = `${proxy}\0${destination}`;
    let agent = agents.get(key);
    if (!agent) {
      agent = buildSocksAgent(proxy, destination);
      agents.set(key, agent);
    }

    return (await undiciFetch(target, {
      dispatcher: agent,
      redirect,
      signal,
    })) as unknown as Response;
  }

  /** Pooled keep-alive sockets otherwise keep the process alive. */
  torFetch.close = async () => {
    await Promise.all([...agents.values()].map((agent) => agent.close()));
    agents.clear();
  };

  return torFetch;
}

function buildSocksAgent(proxy: string, destination: string): Agent {
  const { hostname: proxyHost, port: proxyPort } = new URL(proxy);
  const connect = buildConnector({});

  return new Agent({
    connect: async (opts, callback) => {
      try {
        const { socket } = await SocksClient.createConnection({
          proxy: { host: proxyHost, port: Number(proxyPort), type: 5 },
          command: "connect",
          destination: {
            host: destination,
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
