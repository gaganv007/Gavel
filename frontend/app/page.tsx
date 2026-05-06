"use client";

import { useState } from "react";
import {
  Sparkles,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  Zap,
  FileText,
  Wallet,
  CreditCard,
} from "lucide-react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { parseUnits, type Address } from "viem";
import { baseSepolia } from "wagmi/chains";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const EXPLORER = process.env.NEXT_PUBLIC_BASESCAN_URL || "https://sepolia.basescan.org";
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type Source = { url: string; title: string; snippet: string };
type OnchainReceipt = {
  tx_hash: string;
  block_number: number;
  explorer_url: string;
  question_hash: string;
  evidence_hash: string;
  chain_id: number;
};
type ResolveResponse = {
  verdict: "YES" | "NO" | "UNRESOLVED";
  confidence: number;
  reasoning: string;
  sources: Source[];
  model: string;
  elapsed_ms: number;
  onchain: OnchainReceipt | null;
};
type PaymentTerms = {
  payTo: Address;
  amount: string;
  asset: Address;
  network: string;
};

const DEMO_MARKETS = [
  {
    id: "celtics-2024",
    question: "Did the Boston Celtics win the 2024 NBA Finals?",
    yesPrice: 0.97,
    volume: "$1.8M",
    ends: "Already settled",
  },
  {
    id: "liberty-wnba",
    question: "Did the New York Liberty win the WNBA Finals in 2024?",
    yesPrice: 0.95,
    volume: "$420K",
    ends: "Already settled",
  },
  {
    id: "btc-200k",
    question: "Will Bitcoin trade above $200,000 by December 31, 2027?",
    yesPrice: 0.32,
    volume: "$5.1M",
    ends: "Dec 31, 2027",
  },
];

type Stage =
  | "idle"
  | "fetching-terms"
  | "awaiting-wallet"
  | "switching-chain"
  | "awaiting-payment"
  | "confirming-payment"
  | "resolving"
  | "done"
  | "error";

export default function Home() {
  const [selected, setSelected] = useState(DEMO_MARKETS[0]);
  const [stage, setStage] = useState<Stage>("idle");
  const [terms, setTerms] = useState<PaymentTerms | null>(null);
  const [paymentTxHash, setPaymentTxHash] = useState<`0x${string}` | null>(null);
  const [result, setResult] = useState<ResolveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { isLoading: waitingForReceipt, isSuccess: paymentConfirmed } =
    useWaitForTransactionReceipt({
      hash: paymentTxHash ?? undefined,
    });

  // When the on-chain payment confirms, retry /resolve with X-Payment.
  if (paymentConfirmed && stage === "confirming-payment") {
    setStage("resolving");
    void retryResolveWithPayment();
  }

  async function retryResolveWithPayment() {
    if (!paymentTxHash) return;
    try {
      const res = await fetch(`${API_URL}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Payment": paymentTxHash,
        },
        body: JSON.stringify({ question: selected.question }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `HTTP ${res.status}`);
      }
      setResult(await res.json());
      setStage("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }

  function reset() {
    setStage("idle");
    setTerms(null);
    setPaymentTxHash(null);
    setResult(null);
    setError(null);
  }

  async function startResolution() {
    setError(null);
    setResult(null);
    setStage("fetching-terms");

    try {
      const res = await fetch(`${API_URL}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: selected.question }),
      });

      if (res.status === 402) {
        const data = await res.json();
        const accept = data.accepts?.[0];
        if (!accept) throw new Error("missing payment terms in 402 response");
        setTerms({
          payTo: accept.payTo as Address,
          amount: accept.maxAmountRequired,
          asset: accept.asset as Address,
          network: accept.network,
        });
        setStage("awaiting-wallet");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `HTTP ${res.status}`);
      }

      // x402 disabled on backend — return verdict directly.
      setResult(await res.json());
      setStage("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }

  async function payAndRetry() {
    if (!terms || !address) return;
    setError(null);

    try {
      // Make sure we're on Base Sepolia
      if (chainId !== baseSepolia.id) {
        setStage("switching-chain");
        await switchChainAsync({ chainId: baseSepolia.id });
      }

      setStage("awaiting-payment");
      const hash = await writeContractAsync({
        address: USDC_BASE_SEPOLIA,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [terms.payTo, BigInt(terms.amount)],
      });
      setPaymentTxHash(hash);
      setStage("confirming-payment");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }

  const verdictColor = result
    ? result.verdict === "YES"
      ? "text-emerald-400"
      : result.verdict === "NO"
      ? "text-rose-400"
      : "text-amber-400"
    : "";

  const VerdictIcon = result
    ? result.verdict === "YES"
      ? CheckCircle2
      : result.verdict === "NO"
      ? XCircle
      : AlertCircle
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-slate-800/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-1.5 rounded-lg">
              <Sparkles className="w-5 h-5 text-slate-900" />
            </div>
            <span className="text-xl font-bold tracking-tight">Gavel</span>
            <span className="text-xs text-slate-500 font-medium ml-2 hidden sm:inline">
              The AI oracle that calls it.
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {isConnected && address ? (
              <button
                onClick={() => disconnect()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/60 hover:bg-slate-800 transition"
              >
                <Wallet className="w-3 h-3" />
                <span className="font-mono">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              </button>
            ) : null}
            {/* FIX: was missing the opening <a> tag */}
            <a
              href={`${EXPLORER}/address/${CONTRACT}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-amber-400 flex items-center gap-1 transition"
            >
              <ShieldCheck className="w-3 h-3" />
              Live on Base
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Markets to resolve
          </h2>
          <div className="space-y-3">
            {DEMO_MARKETS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSelected(m);
                  reset();
                }}
                className={`w-full text-left rounded-xl border transition p-5 ${
                  selected.id === m.id
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                }`}
              >
                <p className="font-medium text-slate-100 mb-3 leading-snug">
                  {m.question}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded font-mono">
                      YES {(m.yesPrice * 100).toFixed(0)}c
                    </span>
                    <span className="px-2 py-1 bg-rose-500/10 text-rose-400 rounded font-mono">
                      NO {((1 - m.yesPrice) * 100).toFixed(0)}c
                    </span>
                  </div>
                  <div className="text-slate-500 flex items-center gap-3">
                    <span>Vol {m.volume}</span>
                    <span>{m.ends}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:sticky lg:top-24 self-start">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Resolve via Gavel
              </h3>
            </div>

            <p className="text-slate-100 mb-6 leading-relaxed">{selected.question}</p>

            {stage === "idle" && (
              <button
                onClick={startResolution}
                className="w-full py-3.5 rounded-lg font-semibold bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 hover:from-amber-300 hover:to-orange-400 transition shadow-lg shadow-amber-500/10"
              >
                Resolve for $0.50 USDC
              </button>
            )}

            {stage === "fetching-terms" && (
              <StatusCard
                icon={<Loader2 className="w-4 h-4 animate-spin" />}
                title="Requesting payment terms…"
                detail="POST /resolve → expecting HTTP 402"
              />
            )}

            {stage === "awaiting-wallet" && terms && (
              <PaymentRequiredCard
                terms={terms}
                isConnected={isConnected}
                connectors={[...connectors]}
                onConnect={(c) => connect({ connector: c as Parameters<typeof connect>[0]["connector"] })}
                onPay={payAndRetry}
              />
            )}

            {stage === "switching-chain" && (
              <StatusCard
                icon={<Loader2 className="w-4 h-4 animate-spin" />}
                title="Switching to Base Sepolia…"
                detail="approve the network change in your wallet"
              />
            )}

            {stage === "awaiting-payment" && (
              <StatusCard
                icon={<Loader2 className="w-4 h-4 animate-spin" />}
                title="Awaiting wallet signature…"
                detail="confirm the USDC transfer in MetaMask"
              />
            )}

            {stage === "confirming-payment" && paymentTxHash && (
              <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-5 space-y-3">
                <div className="flex items-center gap-2 text-amber-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">Waiting for payment confirmation…</span>
                </div>
                {/* FIX: was missing the opening <a> tag */}
                <a
                  href={`${EXPLORER}/tx/${paymentTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono text-slate-400 hover:text-amber-400 truncate"
                >
                  {paymentTxHash}
                </a>
                {waitingForReceipt && (
                  <p className="text-xs text-slate-500">~5-15 seconds on Base Sepolia</p>
                )}
              </div>
            )}

            {stage === "resolving" && (
              <ResolvingCard />
            )}

            {stage === "error" && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-300">
                <p className="font-medium mb-1">Resolution failed</p>
                <p className="text-rose-400/80 break-words">{error}</p>
                <button
                  onClick={reset}
                  className="mt-3 text-xs underline text-rose-300 hover:text-rose-200"
                >
                  Start over
                </button>
              </div>
            )}

            {stage === "done" && result && VerdictIcon && (
              <div className="space-y-5">
                <div className="rounded-lg bg-slate-950/50 p-5 border border-slate-800">
                  <div className="flex items-center gap-3 mb-3">
                    <VerdictIcon className={`w-7 h-7 ${verdictColor}`} />
                    <span className={`text-2xl font-bold ${verdictColor}`}>{result.verdict}</span>
                    <span className="ml-auto text-xs text-slate-500 font-mono">
                      {(result.confidence * 100).toFixed(1)}% confident
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        result.verdict === "YES"
                          ? "bg-emerald-400"
                          : result.verdict === "NO"
                          ? "bg-rose-400"
                          : "bg-amber-400"
                      }`}
                      style={{ width: `${result.confidence * 100}%` }}
                    />
                  </div>
                  <p className="text-sm text-slate-300 mt-4 leading-relaxed">
                    {result.reasoning}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Sources ({result.sources.length})
                  </p>
                  <div className="space-y-2">
                    {result.sources.map((s, i) => (
                      // FIX: was using bare <a> without closing JSX properly
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg bg-slate-950/40 border border-slate-800 p-3 hover:border-slate-700 transition group"
                      >
                        <p className="text-sm font-medium text-slate-200 group-hover:text-amber-400 transition leading-snug">
                          {s.title}
                        </p>
                        {s.snippet && (
                          <p className="text-xs text-slate-500 mt-1">&quot;{s.snippet}&quot;</p>
                        )}
                        <p className="text-xs text-slate-600 mt-1 truncate">{s.url}</p>
                      </a>
                    ))}
                  </div>
                </div>

                {paymentTxHash && (
                  // FIX: was missing the opening <a> tag
                  <a
                    href={`${EXPLORER}/tx/${paymentTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/30 p-4 hover:border-blue-500/60 transition"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-semibold text-blue-400">
                        Payment via x402 (USDC)
                      </span>
                      <ExternalLink className="w-3 h-3 text-blue-400/60 ml-auto" />
                    </div>
                    <p className="text-xs font-mono text-slate-400 truncate">{paymentTxHash}</p>
                  </a>
                )}

                {result.onchain && (
                  // FIX: was missing the opening <a> tag
                  <a
                    href={result.onchain.explorer_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 p-4 hover:border-emerald-500/60 transition group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-emerald-400">
                        Settled on Base Sepolia
                      </span>
                      <ExternalLink className="w-3 h-3 text-emerald-400/60 ml-auto group-hover:text-emerald-400" />
                    </div>
                    <p className="text-xs font-mono text-slate-400 truncate">
                      0x{result.onchain.tx_hash.replace(/^0x/, "")}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Block {result.onchain.block_number} · Resolved in{" "}
                      {(result.elapsed_ms / 1000).toFixed(1)}s
                    </p>
                  </a>
                )}

                <button
                  onClick={reset}
                  className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  Back to markets
                </button>
              </div>
            )}
          </div>

          {stage === "idle" && (
            <p className="text-xs text-slate-600 text-center mt-4 leading-relaxed">
              Pay 0.50 USDC via x402 → Claude resolves → verdict written to Base in ~25s.
            </p>
          )}
        </div>
      </div>

      <footer className="max-w-6xl mx-auto px-6 py-12 text-xs text-slate-600 text-center">
        Built at EasyA Consensus Miami May 2026
      </footer>
    </main>
  );
}

function StatusCard({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-5 space-y-2">
      <div className="flex items-center gap-2 text-amber-400">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

type Connector = { uid: string; name: string; id: string };

function PaymentRequiredCard({
  terms,
  isConnected,
  connectors,
  onConnect,
  onPay,
}: {
  terms: PaymentTerms;
  isConnected: boolean;
  connectors: readonly Connector[] | Connector[];
  onConnect: (c: Connector) => void;
  onPay: () => void;
}) {
  const amountUsdc = Number(terms.amount) / 1_000_000;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <p className="text-amber-300 font-semibold mb-2 flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          HTTP 402 — Payment Required
        </p>
        <div className="space-y-1 text-xs text-slate-300 font-mono">
          <div>amount: {amountUsdc.toFixed(2)} USDC</div>
          <div>network: {terms.network}</div>
          <div className="truncate">payTo: {terms.payTo}</div>
        </div>
      </div>

      {!isConnected ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 mb-2">connect a wallet to continue</p>
          {connectors
            .filter((c) => c.id === "metaMask" || c.id === "injected")
            .map((c) => (
              <button
                key={c.uid}
                onClick={() => onConnect(c)}
                className="w-full py-2.5 rounded-lg font-medium bg-slate-800 hover:bg-slate-700 transition flex items-center justify-center gap-2"
              >
                <Wallet className="w-4 h-4" />
                Connect {c.name}
              </button>
            ))}
        </div>
      ) : (
        <button
          onClick={onPay}
          className="w-full py-3 rounded-lg font-semibold bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-900 hover:from-emerald-300 hover:to-teal-400 transition"
        >
          Pay {amountUsdc.toFixed(2)} USDC
        </button>
      )}
    </div>
  );
}

function ResolvingCard() {
  const stages = [
    { label: "Verifying payment on-chain" },
    { label: "Reasoning over web evidence (~12s)" },
    { label: "Hashing evidence + signing" },
    { label: "Settling on Base Sepolia (~5s)" },
  ];
  return (
    <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-5 space-y-3">
      <div className="flex items-center gap-2 text-amber-400 mb-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-medium">Gavel is deliberating…</span>
      </div>
      {stages.map((s, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="text-slate-300">{s.label}</span>
        </div>
      ))}
    </div>
  );
}