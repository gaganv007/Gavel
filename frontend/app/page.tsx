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
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const EXPLORER = process.env.NEXT_PUBLIC_BASESCAN_URL || "https://sepolia.basescan.org";
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

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

export default function Home() {
  const [selected, setSelected] = useState(DEMO_MARKETS[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResolveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: selected.question }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(detail.detail || `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
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
          {/* FIX 1: was missing closing > on this div */}
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {/* FIX 2: was missing opening <a tag */}
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
                  setResult(null);
                  setError(null);
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

            <p className="text-slate-100 mb-6 leading-relaxed">
              {selected.question}
            </p>

            {!result && !loading && (
              <button
                onClick={resolve}
                disabled={loading}
                className="w-full py-3.5 rounded-lg font-semibold bg-gradient-to-r from-amber-400 to-orange-500 text-slate-900 hover:from-amber-300 hover:to-orange-400 transition shadow-lg shadow-amber-500/10"
              >
                Resolve for $0.50 USDC
              </button>
            )}

            {loading && <LoadingState />}

            {error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-300">
                <p className="font-medium mb-1">Resolution failed</p>
                <p className="text-rose-400/80">{error}</p>
                <button
                  onClick={resolve}
                  className="mt-3 text-xs underline text-rose-300 hover:text-rose-200"
                >
                  Try again
                </button>
              </div>
            )}

            {result && VerdictIcon && (
              <div className="space-y-5">
                <div className="rounded-lg bg-slate-950/50 p-5 border border-slate-800">
                  <div className="flex items-center gap-3 mb-3">
                    <VerdictIcon className={`w-7 h-7 ${verdictColor}`} />
                    <span className={`text-2xl font-bold ${verdictColor}`}>
                      {result.verdict}
                    </span>
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
                      // FIX 3: was missing opening <a tag
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
                          <p className="text-xs text-slate-500 mt-1">
                            &quot;{s.snippet}&quot;
                          </p>
                        )}
                        <p className="text-xs text-slate-600 mt-1 truncate">
                          {s.url}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>

                {result.onchain && (
                  // FIX 4: was missing opening <a tag
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
                  onClick={() => {
                    setResult(null);
                    setError(null);
                  }}
                  className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition"
                >
                  Back to markets
                </button>
              </div>
            )}
          </div>

          {!loading && !result && (
            <p className="text-xs text-slate-600 text-center mt-4 leading-relaxed">
              Gavel pays Anthropic + a Base gas fee per query. Average resolution: ~25s.
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

function LoadingState() {
  const stages = [
    { label: "Reasoning over web evidence", time: "0-15s" },
    { label: "Hashing evidence + signing tx", time: "15-25s" },
    { label: "Settling on Base Sepolia", time: "25-40s" },
  ];
  return (
    <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-5 space-y-3">
      <div className="flex items-center gap-2 text-amber-400 mb-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-medium">Gavel is deliberating...</span>
      </div>
      {stages.map((s, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="text-slate-300">{s.label}</span>
          <span className="text-slate-600 font-mono">{s.time}</span>
        </div>
      ))}
    </div>
  );
}