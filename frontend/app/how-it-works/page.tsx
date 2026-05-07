"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CreditCard,
  Search,
  ShieldCheck,
  Database,
  AlertTriangle,
  CheckCircle2,
  Copy,
  CheckCheck,
  ArrowRight,
} from "lucide-react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";

import { Nav } from "../_components/Nav";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://twm1ztoxud.execute-api.us-east-1.amazonaws.com";
const CONTRACT =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x781fF2E176196F2a3fDedA1a892d86FE0Bf42320";

// ---------- React Flow nodes/edges ----------

const nodes: Node[] = [
  {
    id: "client",
    position: { x: 0, y: 100 },
    data: { label: "Prediction market" },
    style: nodeStyle("amber"),
  },
  {
    id: "lambda",
    position: { x: 280, y: 0 },
    data: { label: "AWS Lambda\n+ x402 middleware" },
    style: nodeStyle("blue"),
  },
  {
    id: "claude",
    position: { x: 580, y: 0 },
    data: { label: "Claude Sonnet 4.5\n+ web search" },
    style: nodeStyle("purple"),
  },
  {
    id: "bedrock",
    position: { x: 580, y: 110 },
    data: { label: "AWS Bedrock\n(fallback)" },
    style: nodeStyleDashed("purple"),
  },
  {
    id: "base",
    position: { x: 280, y: 230 },
    data: { label: "Base Sepolia\nGavelOracle.sol" },
    style: nodeStyle("emerald"),
  },
  {
    id: "usdc",
    position: { x: 0, y: 230 },
    data: { label: "USDC payment\non Base" },
    style: nodeStyle("teal"),
  },
];

const edges: Edge[] = [
  {
    id: "e1",
    source: "client",
    target: "lambda",
    label: "POST /resolve",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#fbbf24" },
    labelStyle: edgeLabel(),
    labelBgStyle: edgeLabelBg(),
  },
  {
    id: "e2",
    source: "lambda",
    target: "client",
    label: "HTTP 402",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#fb7185", strokeDasharray: "4 2" },
    labelStyle: edgeLabel(),
    labelBgStyle: edgeLabelBg(),
  },
  {
    id: "e3",
    source: "client",
    target: "usdc",
    label: "0.50 USDC",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#2dd4bf" },
    labelStyle: edgeLabel(),
    labelBgStyle: edgeLabelBg(),
  },
  {
    id: "e4",
    source: "usdc",
    target: "lambda",
    label: "verify tx",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#94a3b8" },
    labelStyle: edgeLabel(),
    labelBgStyle: edgeLabelBg(),
  },
  {
    id: "e5",
    source: "lambda",
    target: "claude",
    label: "resolve",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#a78bfa" },
    labelStyle: edgeLabel(),
    labelBgStyle: edgeLabelBg(),
  },
  {
    id: "e6",
    source: "claude",
    target: "bedrock",
    label: "529 fallback",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#a78bfa", strokeDasharray: "4 2" },
    labelStyle: edgeLabel(),
    labelBgStyle: edgeLabelBg(),
  },
  {
    id: "e7",
    source: "lambda",
    target: "base",
    label: "post verdict",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#34d399" },
    labelStyle: edgeLabel(),
    labelBgStyle: edgeLabelBg(),
  },
  {
    id: "e8",
    source: "base",
    target: "client",
    label: "tx hash",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "#34d399" },
    labelStyle: edgeLabel(),
    labelBgStyle: edgeLabelBg(),
  },
];

function nodeStyle(color: "amber" | "blue" | "purple" | "emerald" | "teal") {
  const palette = {
    amber: { bg: "rgba(251,191,36,0.08)", border: "#fbbf24", text: "#fbbf24" },
    blue: { bg: "rgba(96,165,250,0.08)", border: "#60a5fa", text: "#60a5fa" },
    purple: { bg: "rgba(167,139,250,0.08)", border: "#a78bfa", text: "#a78bfa" },
    emerald: { bg: "rgba(52,211,153,0.08)", border: "#34d399", text: "#34d399" },
    teal: { bg: "rgba(45,212,191,0.08)", border: "#2dd4bf", text: "#2dd4bf" },
  }[color];
  return {
    background: palette.bg,
    border: "1px solid " + palette.border,
    color: palette.text,
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "var(--font-geist-sans), sans-serif",
    width: 180,
    whiteSpace: "pre-line" as const,
    textAlign: "center" as const,
  };
}

function nodeStyleDashed(color: "purple") {
  return {
    ...nodeStyle(color),
    borderStyle: "dashed",
    opacity: 0.7,
  };
}

function edgeLabel() {
  return {
    fill: "#cbd5e1",
    fontSize: 10,
    fontFamily: "var(--font-geist-sans), sans-serif",
  };
}

function edgeLabelBg() {
  return { fill: "#0f172a", fillOpacity: 0.85 };
}

// ---------- Page ----------

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <Nav />

      <Hero />
      <ProblemSection />
      <ArchitectureSection />
      <StagesSection />
      <TryItSection />
      <FaqSection />

      <footer className="max-w-6xl mx-auto px-6 py-12 text-xs text-slate-600 mt-12">
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-slate-900">
          <span>Built at EasyA Consensus Miami · May 2026</span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/gaganv007/Gavel"
              target="_blank"
              rel="noreferrer"
              className="hover:text-amber-400 transition"
            >
              github
            </a>
            <a
              href={"https://sepolia.basescan.org/address/" + CONTRACT}
              target="_blank"
              rel="noreferrer"
              className="hover:text-amber-400 transition"
            >
              contract
            </a>
            <a href={API_URL} target="_blank" rel="noreferrer" className="hover:text-amber-400 transition">
              api
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

// ---------- Sections ----------

function Hero() {
  return (
    <section className="max-w-6xl mx-auto px-6 pt-16 pb-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="text-xs uppercase tracking-widest text-amber-400/70 font-mono mb-4">
          How it works
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-tight">
          The AI oracle that calls it.
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl leading-relaxed">
          Gavel resolves prediction-market questions in 30 seconds for $0.50.
          Pay via x402, get a verdict from Claude grounded in cited sources,
          and have it written immutably to Base — all in one HTTP call.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-10">
          <Stat label="Resolution time" value="~14s" />
          <Stat label="Cost per query" value="$0.50" />
          <Stat label="vs UMA delay" value="172x faster" />
          <Stat label="vs UMA cost" value="10-100x cheaper" />
        </div>
      </motion.div>
    </section>
  );
}

function ProblemSection() {
  const cards = [
    {
      label: "UMA optimistic oracle",
      pros: ["Decentralized", "Battle-tested"],
      cons: ["24-48h disputes", "$5-50 per query", "Public dispute drama"],
      bad: true,
    },
    {
      label: "Centralized resolver",
      pros: ["Fast for clear cases", "No staking required"],
      cons: ["Single party trust", "Opaque process", "Has been gamed"],
      bad: true,
    },
    {
      label: "Gavel",
      pros: [
        "30 seconds end-to-end",
        "$0.50 per query",
        "Cited sources + on-chain hash",
        "UNRESOLVED when sources conflict",
      ],
      cons: [],
      bad: false,
    },
  ];
  return (
    <section className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-900">
      <SectionHeader
        kicker="The problem"
        title="Resolution is the broken layer"
        body="Every prediction market has the same flaw: a slow, expensive, opaque oracle. Polymarket and Kalshi both ship resolution disputes that go publicly wrong. Gavel fixes the most painful 95% of cases."
      />
      <div className="grid md:grid-cols-3 gap-4 mt-10">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className={"rounded-xl border p-5 " +
              (c.bad
                ? "border-slate-800 bg-slate-900/30"
                : "border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-500/20")
            }
          >
            <p
              className={"text-xs font-semibold uppercase tracking-wider mb-3 " +
                (c.bad ? "text-slate-400" : "text-amber-400")
              }
            >
              {c.label}
            </p>
            <ul className="space-y-2 mb-3">
              {c.pros.map((p) => (
                <li key={p} className="text-sm text-slate-200 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-2">
              {c.cons.map((p) => (
                <li key={p} className="text-sm text-slate-500 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400/80 mt-0.5 shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function ArchitectureSection() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-900">
      <SectionHeader
        kicker="Architecture"
        title="Six components, one HTTP call"
        body="The full stack from prediction market to on-chain settlement. Drag any node, zoom with scroll, follow the animated arrows."
      />
      <div
        className="mt-10 rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden"
        style={{ height: 480 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="#1e293b" />
          <Controls
            showInteractive={false}
            style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 8,
            }}
          />
        </ReactFlow>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6 text-xs">
        <LegendItem color="amber" label="Client" />
        <LegendItem color="blue" label="AWS Lambda + API Gateway" />
        <LegendItem color="purple" label="AI inference" />
        <LegendItem color="emerald" label="Base Sepolia + USDC" />
      </div>
    </section>
  );
}

function StagesSection() {
  const stages = [
    {
      icon: CreditCard,
      title: "1. Pay via x402",
      detail:
        "Client POSTs to /resolve. Server demands HTTP 402 with payment terms. Client sends 0.50 USDC on Base Sepolia, retries with X-Payment header.",
      color: "blue",
      time: "~5s",
    },
    {
      icon: ShieldCheck,
      title: "2. Verify on-chain",
      detail:
        "Lambda inspects the tx receipt, confirms a USDC Transfer event to our recipient ≥ 500000 micro-USDC. Replay-protected.",
      color: "teal",
      time: "<1s",
    },
    {
      icon: Search,
      title: "3. Reason over evidence",
      detail:
        "Claude Sonnet 4.5 with native web_search hits Reuters, AP, Bloomberg, etc. Returns YES, NO, or UNRESOLVED + cited sources. If Anthropic 529s, falls over to AWS Bedrock.",
      color: "purple",
      time: "~12s",
    },
    {
      icon: Database,
      title: "4. Settle on-chain",
      detail:
        "keccak256 the question and evidence. Sign with the oracle wallet. Post to GavelOracle.sol on Base Sepolia. Return the verdict + tx hash to caller.",
      color: "emerald",
      time: "~5s",
    },
  ];

  return (
    <section className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-900">
      <SectionHeader
        kicker="The 4 stages"
        title="What happens between pay and settled"
        body="Total ~14s on a warm Lambda. The stages run sequentially because each gates the next."
      />
      <div className="space-y-4 mt-10">
        {stages.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 flex items-start gap-4"
          >
            <div
              className={
                "shrink-0 p-2.5 rounded-lg " + colorBg(s.color)
              }
            >
              <s.icon className={"w-5 h-5 " + colorText(s.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <h3 className="text-base font-semibold text-slate-100">
                  {s.title}
                </h3>
                <span className="text-xs font-mono text-slate-500 shrink-0">
                  {s.time}
                </span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                {s.detail}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function TryItSection() {
  const examples = [
    {
      label: "1. Get payment terms",
      command:
        'curl -i -X POST ' +
        API_URL +
        "/resolve \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"question\":\"Did Argentina win the 2022 World Cup?\"}'",
      response:
        "HTTP/2 402\naccept-payment: x402 base-sepolia usdc 500000\n\n{\n  \"x402Version\": 1,\n  \"accepts\": [{\n    \"network\": \"base-sepolia\",\n    \"maxAmountRequired\": \"500000\",\n    \"asset\": \"0x036C...DCF7e\",\n    \"payTo\": \"0x1FBC...D1a3\"\n  }]\n}",
    },
    {
      label: "2. Pay then retry",
      command:
        'curl -X POST ' +
        API_URL +
        "/resolve \\\n  -H \"Content-Type: application/json\" \\\n  -H \"X-Payment: 0xPAY_TX_HASH\" \\\n  -d '{\"question\":\"Did Argentina win the 2022 World Cup?\"}'",
      response:
        "{\n  \"verdict\": \"YES\",\n  \"confidence\": 1.0,\n  \"reasoning\": \"Argentina defeated France 4-2 on penalties...\",\n  \"sources\": [...],\n  \"onchain\": {\n    \"tx_hash\": \"0xeb7e...\",\n    \"explorer_url\": \"https://sepolia.basescan.org/tx/...\"\n  },\n  \"elapsed_ms\": 13331\n}",
    },
  ];

  return (
    <section className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-900">
      <SectionHeader
        kicker="Try it"
        title="The whole loop in two curls"
        body="Hit the live AWS endpoint. Copy, paste, watch HTTP 402 → on-chain payment → AI verdict + Basescan link."
      />
      <div className="space-y-6 mt-10">
        {examples.map((e) => (
          <CodePair key={e.label} label={e.label} command={e.command} response={e.response} />
        ))}
      </div>
    </section>
  );
}

function FaqSection() {
  const faqs = [
    {
      q: "Why should anyone trust an LLM verdict?",
      a: "You're not trusting the LLM — you're trusting the cited sources. Every verdict ships with Reuters, AP, Bloomberg URLs and an evidence hash on-chain. If a verdict is wrong, you don't argue with Claude, you point at the article that contradicts it. Polymarket today has a Slack channel of humans reading the same articles. Gavel just does that 100x faster with a public audit trail.",
    },
    {
      q: "What happens if sources conflict?",
      a: "Gavel returns UNRESOLVED with low confidence. Try \"Did Yevgeny Prigozhin die in the August 2023 plane crash, according to the official Russian investigation?\" — international reporting and the official Russian investigation diverged. Gavel cites both sides and refuses to fake certainty. UNRESOLVED is always a valid answer.",
    },
    {
      q: "Who runs the oracle signer?",
      a: "Today: a single hackathon wallet. Production: a multisig of operators, then eventually a TEE running Claude inside Intel SGX so even we can't tamper with the verdict. The on-chain evidence hash means any tampering would be visible — the verdict would no longer match its sources.",
    },
    {
      q: "Why $0.50?",
      a: "Anthropic API + Base gas costs us ~$0.05 per query. The $0.45 margin funds a future dispute escrow — disagree with a verdict? Stake $5, we re-resolve, loser pays.",
    },
    {
      q: "Why not just use UMA?",
      a: "UMA is great for the 5% of contested questions. For the 95% — \"did the Chiefs win?\" — UMA still takes 24h and costs $5. Gavel resolves those in 30s for $0.50. We coexist: Gavel handles obvious cases, UMA handles disputes.",
    },
    {
      q: "What if Anthropic's API is down?",
      a: "Gavel falls over to AWS Bedrock with a separate quota pool. Same Sonnet 4.5 model, different infrastructure, IAM-permissioned from the same Lambda. Lower-quality fallback (no web search on Bedrock yet) but the demo stays alive.",
    },
    {
      q: "What stops me from just using GPT-4 directly?",
      a: "Three things: signed on-chain settlement, evidence hashing, and an SLA. Markets don't want to run their own LLM infra and trust their own outputs — they want a neutral, paid-for, auditable third party. That's why Chainlink exists.",
    },
  ];

  return (
    <section className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-900">
      <SectionHeader
        kicker="FAQ"
        title="The hard questions"
        body="Real pushback we've gotten from judges and crypto-native builders."
      />
      <div className="space-y-3 mt-10">
        {faqs.map((f, i) => (
          <FaqItem key={i} q={f.q} a={f.a} />
        ))}
      </div>
    </section>
  );
}

// ---------- Subcomponents ----------

function SectionHeader({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs uppercase tracking-widest text-amber-400/70 font-mono mb-3">
        {kicker}
      </p>
      <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
        {title}
      </h2>
      <p className="text-slate-400 leading-relaxed">{body}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </p>
      <p className="text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function LegendItem({
  color,
  label,
}: {
  color: "amber" | "blue" | "purple" | "emerald";
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={"w-2 h-2 rounded-full " + colorDot(color)} />
      <span className="text-slate-400">{label}</span>
    </div>
  );
}

function colorBg(color: string) {
  return (
    {
      blue: "bg-blue-500/10",
      teal: "bg-teal-500/10",
      purple: "bg-purple-500/10",
      emerald: "bg-emerald-500/10",
    } as Record<string, string>
  )[color];
}

function colorText(color: string) {
  return (
    {
      blue: "text-blue-400",
      teal: "text-teal-400",
      purple: "text-purple-400",
      emerald: "text-emerald-400",
    } as Record<string, string>
  )[color];
}

function colorDot(color: string) {
  return (
    {
      amber: "bg-amber-400",
      blue: "bg-blue-400",
      purple: "bg-purple-400",
      emerald: "bg-emerald-400",
    } as Record<string, string>
  )[color];
}

function CodePair({
  label,
  command,
  response,
}: {
  label: string;
  command: string;
  response: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <div className="bg-slate-900/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-300 border-b border-slate-800">
        {label}
      </div>
      <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
        <CodeBlock code={command} variant="cmd" />
        <CodeBlock code={response} variant="resp" />
      </div>
    </div>
  );
}

function CodeBlock({ code, variant }: { code: string; variant: "cmd" | "resp" }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="relative bg-slate-950/60">
      <div className="absolute top-2.5 right-2.5 flex items-center gap-2 z-10">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
          {variant === "cmd" ? "$ request" : "← response"}
        </span>
        <button
          onClick={copy}
          className="p-1.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-amber-400 transition"
          aria-label="copy"
        >
          {copied ? (
            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <pre className="p-4 pt-10 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-900/60 transition"
      >
        <span className="font-medium text-slate-100">{q}</span>
        <ArrowRight
          className={"w-4 h-4 text-slate-500 shrink-0 transition-transform " +
            (open ? "rotate-90" : "")
          }
        />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
          className="px-5 pb-5 text-sm text-slate-400 leading-relaxed"
        >
          {a}
        </motion.div>
      )}
    </motion.div>
  );
}