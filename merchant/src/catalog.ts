import { hash, num } from "starknet";

/**
 * What this site sells.
 *
 * The resource hash is what ties a payment to an article. It goes into the
 * 402, into the anonymizer call, and into the receipt event, so a payment for
 * one article cannot unlock another. Deriving it from the slug rather than
 * storing an id means the merchant and the payer compute the same value
 * independently, with nothing to agree on beforehand.
 */
export interface Article {
  slug: string;
  title: string;
  blurb: string;
  /** Price in the token's smallest unit. */
  price: bigint;
  body: string;
}

/** felt252 identifier for a resource. starknetKeccak is 250 bits, so it fits. */
export const resourceHash = (slug: string) => num.toHex(hash.starknetKeccak(slug));

const article = (
  slug: string,
  title: string,
  blurb: string,
  price: bigint,
  body: string,
): Article => ({ slug, title, blurb, price, body });

export const CATALOG: Article[] = [
  article(
    "agent-privacy",
    "Why your agent leaks more than you do",
    "An agent browsing on your behalf makes your reading list machine-readable.",
    50_000_000_000_000_000n,
    `A browser leaks one person's attention. An agent leaks a plan.

When you read three articles about a company, that is a Tuesday. When your
agent reads three hundred, in order, at machine speed, the sequence is the
thesis. Anyone sitting on the other end of those requests — the site, its CDN,
its analytics vendor, whoever buys that data later — gets something you never
meant to publish: not what you read, but what you are about to do.

The usual fix is to hide the network path. That is necessary and it is not
sufficient, because the moment the agent has to pay for something the payment
carries an identity the network layer just spent all that effort removing. A
card number is a name. A wallet address is a name that never changes and that
anyone can look up forever.

So the payment has to be anonymous in the same sense the request is: the
merchant learns that it was paid, and nothing else. Not a pseudonym. Not a
rotating address that still links to the last one. Nothing.`,
  ),
  article(
    "settlement-without-identity",
    "Settlement without identity",
    "How a merchant can verify it was paid without ever learning who paid.",
    100_000_000_000_000_000n,
    `A payment proves two different things, and we usually conflate them.

The first is that value moved. The second is who moved it. Card networks bind
them together so tightly that we forget they are separable, but they are: a
merchant needs the first to ship the goods, and needs the second only because
the rail it chose insists on carrying it.

Strip the second and the merchant's position barely changes. It still verifies
the payment — from the chain, unilaterally, without trusting the customer or a
processor. What changes is what it holds afterwards. There is no customer
record to secure, to leak, to sell, or to be compelled to produce, because at
no point did one exist.

The interesting part is that this is better for the merchant, not merely
tolerable. Every identity a business collects is a liability it has to carry
until it deletes it, and most businesses are very bad at deleting things.`,
  ),
  article(
    "the-402-that-works",
    "The 402 that finally does something",
    "HTTP reserved a status code for payment in 1997 and left it empty.",
    25_000_000_000_000_000n,
    `402 Payment Required has been in the spec, marked "reserved for future
use", since before most of the web existed. The future kept not arriving,
because the missing piece was never the status code.

What was missing was a way for a server to state its terms in a form a machine
could act on, and a way for a client to satisfy them without a relationship
established in advance. Both halves are now ordinary. The server answers a 402
with the price, the asset, and where to send it. The client pays and comes back
with a transaction hash. The server checks the chain.

No account. No key exchange. No signup flow, no email confirmation, no card on
file, no subscription the reader forgets to cancel. The first request and the
paid request are the same request, made twice, four seconds apart.`,
  ),
];

export const findArticle = (slug: string) => CATALOG.find((a) => a.slug === slug);
