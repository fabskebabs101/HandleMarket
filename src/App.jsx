import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot, Area, AreaChart } from "recharts";

const VALUATION_WEIGHTS = {
  followers: 0.30,
  engagement: 0.25,
  accountAge: 0.15,
  tweetVolume: 0.10,
  verification: 0.10,
  nicheRelevance: 0.10,
};

function estimateValue({ followers, avgLikes, avgRetweets, avgReplies, tweets, accountAgeDays, verified, cryptoNiche }) {
  const engagementRate = followers > 0 ? ((avgLikes + avgRetweets + avgReplies) / followers) * 100 : 0;
  const followerScore = Math.min(100, (Math.log10(Math.max(followers, 1)) / Math.log10(1000000)) * 100);
  let engScore = 0;
  if (engagementRate >= 5) engScore = 100;
  else if (engagementRate >= 3) engScore = 85;
  else if (engagementRate >= 1.5) engScore = 65;
  else if (engagementRate >= 0.5) engScore = 40;
  else engScore = Math.max(5, engagementRate * 80);
  const ageScore = Math.min(100, (accountAgeDays / 1460) * 100);
  const tweetsPerDay = tweets / Math.max(accountAgeDays, 1);
  let tweetScore = 0;
  if (tweetsPerDay >= 3) tweetScore = 100;
  else if (tweetsPerDay >= 1) tweetScore = 75;
  else if (tweetsPerDay >= 0.3) tweetScore = 50;
  else tweetScore = Math.max(10, tweetsPerDay * 166);
  const verifyScore = verified ? 100 : 20;
  const nicheScore = cryptoNiche ? 90 : 30;
  const totalScore =
    followerScore * VALUATION_WEIGHTS.followers +
    engScore * VALUATION_WEIGHTS.engagement +
    ageScore * VALUATION_WEIGHTS.accountAge +
    tweetScore * VALUATION_WEIGHTS.tweetVolume +
    verifyScore * VALUATION_WEIGHTS.verification +
    nicheScore * VALUATION_WEIGHTS.nicheRelevance;
  const baseCPM = verified ? 10 : 4;
  const avgImpressions = followers * (engagementRate / 100) * 15;
  const monthlyEarnings = (avgImpressions / 1000) * baseCPM * 30;
  const multiplier = verified ? 18 : 12;
  let estimatedValue = monthlyEarnings * multiplier;
  if (followers < 500) estimatedValue = Math.max(estimatedValue, 5);
  else if (followers < 5000) estimatedValue = Math.max(estimatedValue, followers * 0.02);
  else if (followers < 50000) estimatedValue = Math.max(estimatedValue, followers * 0.05);
  else estimatedValue = Math.max(estimatedValue, followers * 0.08);
  if (cryptoNiche) estimatedValue *= 1.4;
  if (engagementRate >= 3) estimatedValue *= 1.3;
  else if (engagementRate >= 1.5) estimatedValue *= 1.1;
  return {
    estimatedValue: Math.round(estimatedValue),
    totalScore: Math.round(totalScore),
    breakdown: {
      followers: Math.round(followerScore),
      engagement: Math.round(engScore),
      accountAge: Math.round(ageScore),
      tweetVolume: Math.round(tweetScore),
      verification: Math.round(verifyScore),
      nicheRelevance: Math.round(nicheScore),
    },
    engagementRate: engagementRate.toFixed(2),
    monthlyEarnings: Math.round(monthlyEarnings),
  };
}

// ─── Trust Score Calculator ─────────────────────────────────────
// Detects likely bot accounts and scores authenticity based on
// multiple signals. Returns a score 0-100 and red flags.
function calculateTrustScore({ followers, following, avgLikes, avgRetweets, avgReplies, tweets, accountAgeDays, verified, cryptoNiche, avgImpressions = 0 }) {
  const redFlags = [];
  const greenFlags = [];

  // 1. Follower-to-Following ratio
  // Healthy: followers >> following. Suspicious: following >> followers (follow-for-follow)
  const followRatio = following > 0 ? followers / following : followers;
  let followRatioScore = 50;
  if (followRatio > 10) { followRatioScore = 95; greenFlags.push("Strong follower-to-following ratio"); }
  else if (followRatio > 3) followRatioScore = 80;
  else if (followRatio > 1) followRatioScore = 60;
  else if (followRatio > 0.5) { followRatioScore = 35; redFlags.push("Follows almost as many as followers"); }
  else { followRatioScore = 15; redFlags.push("Follows more than they're followed (F4F pattern)"); }

  // 2. Engagement-to-follower ratio
  // Real accounts: engagement scales with followers. Botted: massive followers, tiny engagement.
  const totalEngagement = avgLikes + avgRetweets + avgReplies;
  const engagementRate = followers > 0 ? (totalEngagement / followers) * 100 : 0;
  let engagementQualityScore = 50;
  if (engagementRate >= 2) { engagementQualityScore = 95; greenFlags.push("Healthy organic engagement"); }
  else if (engagementRate >= 0.8) engagementQualityScore = 75;
  else if (engagementRate >= 0.3) engagementQualityScore = 50;
  else if (engagementRate >= 0.1) { engagementQualityScore = 25; redFlags.push("Low engagement for follower count"); }
  else if (followers > 1000) { engagementQualityScore = 5; redFlags.push("Very low engagement — possible bot followers"); }

  // 3. Reply-to-like ratio (real conversations vs drive-by likes)
  const replyRatio = avgLikes > 0 ? avgReplies / avgLikes : 0;
  let conversationScore = 50;
  if (replyRatio >= 0.15) { conversationScore = 90; greenFlags.push("Strong conversation ratio — real audience"); }
  else if (replyRatio >= 0.05) conversationScore = 70;
  else if (replyRatio >= 0.02) conversationScore = 50;
  else if (avgLikes > 50) { conversationScore = 25; redFlags.push("Likes but no replies — possible engagement pods"); }

  // 4. Account age vs activity
  // Brand new accounts with huge followers = sus. Old accounts with consistent posting = trusted.
  const tweetsPerDay = tweets / Math.max(accountAgeDays, 1);
  let activityScore = 50;
  if (accountAgeDays < 90 && followers > 5000) {
    activityScore = 15;
    redFlags.push("Very new account with large follower count");
  } else if (accountAgeDays < 180 && followers > 20000) {
    activityScore = 20;
    redFlags.push("Rapid follower growth for account age");
  } else if (tweetsPerDay > 50) {
    activityScore = 20;
    redFlags.push("Abnormally high posting frequency — possible bot");
  } else if (tweetsPerDay > 0.3 && accountAgeDays > 365) {
    activityScore = 85;
    greenFlags.push("Consistent long-term activity");
  } else if (tweetsPerDay > 0.1) {
    activityScore = 65;
  } else {
    activityScore = 40;
    if (followers > 10000) redFlags.push("Low tweet volume for follower size");
  }

  // 5. Estimated bot followers percentage (heuristic without per-follower scraping)
  // Based on the engagement gap - bots don't engage
  let estimatedBotPct = 0;
  if (engagementRate < 0.1 && followers > 1000) estimatedBotPct = 60;
  else if (engagementRate < 0.3) estimatedBotPct = 35;
  else if (engagementRate < 0.8) estimatedBotPct = 18;
  else if (engagementRate < 1.5) estimatedBotPct = 10;
  else estimatedBotPct = 5;

  // Adjust bot estimate based on follow ratio
  if (followRatio < 0.5 && followers > 500) estimatedBotPct = Math.min(80, estimatedBotPct + 15);

  // 6. Verification boost
  const verificationScore = verified ? 90 : 50;
  if (verified) greenFlags.push("Verified account");

  // 7. CT niche relevance (real CT accounts have more trust in this marketplace)
  if (cryptoNiche) greenFlags.push("Active in crypto niche");

  // Weighted composite score
  const trustScore = Math.round(
    followRatioScore * 0.20 +
    engagementQualityScore * 0.30 +
    conversationScore * 0.15 +
    activityScore * 0.15 +
    verificationScore * 0.10 +
    (100 - estimatedBotPct) * 0.10
  );

  // Determine label (Sorsa-style tiers)
  let label, labelColor;
  if (trustScore >= 85) { label = "SUPREME"; labelColor = "#10b981"; }
  else if (trustScore >= 70) { label = "CREDIBLE"; labelColor = "#34d399"; }
  else if (trustScore >= 55) { label = "NOTED"; labelColor = "#fbbf24"; }
  else if (trustScore >= 40) { label = "UNKNOWN"; labelColor = "#f97316"; }
  else if (trustScore >= 25) { label = "SUSPICIOUS"; labelColor = "#ef4444"; }
  else { label = "LIKELY BOT"; labelColor = "#dc2626"; }

  return {
    trustScore,
    label,
    labelColor,
    estimatedBotPct: Math.round(estimatedBotPct),
    breakdown: {
      followRatio: Math.round(followRatioScore),
      engagementQuality: Math.round(engagementQualityScore),
      conversation: Math.round(conversationScore),
      activity: Math.round(activityScore),
      verification: Math.round(verificationScore),
    },
    redFlags,
    greenFlags,
    followRatio: followRatio.toFixed(2),
  };
}

const MOCK_LISTINGS = [
  { id: 1, handle: "@CryptoAlpha_", followers: 45200, value: 3800, engagement: "3.2%", age: "3y", verified: true, niche: "DeFi / Alpha", status: "listed", trustScore: 87, trustLabel: "SUPREME" },
  { id: 2, handle: "@SOL_Trader99", followers: 12800, value: 950, engagement: "4.1%", age: "2y", verified: false, niche: "Solana Trading", status: "listed", trustScore: 76, trustLabel: "CREDIBLE" },
  { id: 3, handle: "@NFTWhaleWatch", followers: 88400, value: 9200, engagement: "2.8%", age: "4y", verified: true, niche: "NFTs / Whales", status: "sold", trustScore: 82, trustLabel: "CREDIBLE" },
  { id: 4, handle: "@DeFi_Degen", followers: 6300, value: 420, engagement: "5.5%", age: "1y", verified: false, niche: "Memecoin / Degen", status: "listed", trustScore: 68, trustLabel: "NOTED" },
  { id: 5, handle: "@OnChainMax", followers: 31500, value: 2600, engagement: "2.1%", age: "3y", verified: true, niche: "On-chain Analytics", status: "listed", trustScore: 79, trustLabel: "CREDIBLE" },
  { id: 6, handle: "@AirdropHunterX", followers: 22100, value: 1750, engagement: "1.9%", age: "2y", verified: false, niche: "Airdrops", status: "listed", trustScore: 45, trustLabel: "UNKNOWN" },
];

const C = {
  // Single accent — electric lime. Hits hard against monochrome, feels CT-native without being the usual purple.
  primary: "#d4ff00",
  primaryLight: "#e4ff55",
  primaryDark: "#a8cc00",
  accent: "#d4ff00",
  accentLight: "#e4ff55",
  accentWarm: "#f5ff99",
  // Pure black foundation, layered with subtle warm-grey depth
  bg1: "#000000",
  bg2: "#0a0a0a",
  bg3: "#111111",
  surface: "rgba(18, 18, 18, 0.85)",
  surfaceHover: "rgba(30, 30, 30, 0.95)",
  border: "rgba(255, 255, 255, 0.08)",
  borderHover: "rgba(212, 255, 0, 0.4)",
  // Sharp white typography, graded secondary tones
  textPrimary: "#ffffff",
  textSecondary: "#a3a3a3",
  textMuted: "#525252",
};

function ScoreBar({ label, score, color }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), 100);
    return () => clearTimeout(t);
  }, [score]);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 12, color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{score}/100</span>
      </div>
      <div style={{ height: 6, background: "rgba(255, 255, 255, 0.05)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${width}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)`, borderRadius: 3, transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }} />
      </div>
    </div>
  );
}

// ─── Scroll-triggered reveal wrapper ───────────────────────────
function Reveal({ children, delay = 0 }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(30px)",
      transition: `opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
    }}>{children}</div>
  );
}

// ─── Animated count-up number ──────────────────────────────────
function CountUp({ end, duration = 1500, prefix = "", suffix = "" }) {
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        setStarted(true);
        const start = Date.now();
        const tick = () => {
          const elapsed = Date.now() - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(eased * end);
          if (progress < 1) requestAnimationFrame(tick);
        };
        tick();
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [end, duration, started]);
  const formatted = end >= 1000 ? `${(value / 1000).toFixed(value >= 1000 ? 1 : 0)}k` : Math.round(value).toLocaleString();
  return <span ref={ref}>{prefix}{formatted}{suffix}</span>;
}

// ─── Cycling word animator ─────────────────────────────────────
function CycleWord({ words, color }) {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex(i => (i + 1) % words.length);
        setFading(false);
      }, 300);
    }, 2500);
    return () => clearInterval(interval);
  }, [words.length]);
  return (
    <span style={{
      display: "inline-block",
      color,
      opacity: fading ? 0 : 1,
      transform: fading ? "translateY(-10px)" : "translateY(0)",
      transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
      minWidth: "auto",
    }}>
      {words[index]}
    </span>
  );
}

// ─── Animated Demo Card (the hero "watch it work" moment) ──────
// Uses CT-flavored fictional handles so we don't fake real accounts' scores.
const DEMO_ACCOUNTS = [
  {
    handle: "@CryptoDegen_", niche: "Solana · 18.4k followers", initial: "C",
    score: 91, bars: [92, 88, 85, 94, 100],
    flags: [
      { text: "Healthy organic engagement", type: "green" },
      { text: "Strong conversation ratio — real audience", type: "green" },
      { text: "Verified account", type: "green" },
    ],
  },
  {
    handle: "@SolAlphaHunter", niche: "DeFi · 42.1k followers", initial: "S",
    score: 84, bars: [88, 82, 78, 86, 100],
    flags: [
      { text: "Consistent long-term activity", type: "green" },
      { text: "Verified account", type: "green" },
    ],
  },
  {
    handle: "@MemecoinMaxi", niche: "Memecoin · 7.8k followers", initial: "M",
    score: 72, bars: [75, 70, 68, 80, 20],
    flags: [
      { text: "Healthy organic engagement", type: "green" },
      { text: "Strong follower-to-following ratio", type: "green" },
    ],
  },
  {
    handle: "@OnChainWhale", niche: "Analytics · 31.2k followers", initial: "O",
    score: 88, bars: [90, 86, 82, 92, 100],
    flags: [
      { text: "Healthy organic engagement", type: "green" },
      { text: "Consistent long-term activity", type: "green" },
      { text: "Verified account", type: "green" },
    ],
  },
  {
    handle: "@PumpBot2024", niche: "Crypto · 85.3k followers", initial: "P",
    score: 22, bars: [15, 10, 18, 20, 20],
    flags: [
      { text: "Very low engagement — possible bot followers", type: "red" },
      { text: "Rapid follower growth for account age", type: "red" },
      { text: "Abnormally high posting frequency — possible bot", type: "red" },
    ],
  },
];

function DemoCard() {
  // Pick one random demo account on mount — cycles between refreshes
  const [account] = useState(() => DEMO_ACCOUNTS[Math.floor(Math.random() * DEMO_ACCOUNTS.length)]);
  const [score, setScore] = useState(0);
  const [bars, setBars] = useState([0, 0, 0, 0, 0]);
  const [flags, setFlags] = useState([]);
  const [started, setStarted] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        setStarted(true);
        // Step 1: count up score
        setTimeout(() => {
          const start = Date.now();
          const duration = 1400;
          const target = account.score;
          const tick = () => {
            const progress = Math.min((Date.now() - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setScore(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          tick();
        }, 200);
        // Step 2: bars fill sequentially
        account.bars.forEach((b, i) => {
          setTimeout(() => {
            setBars(prev => { const next = [...prev]; next[i] = b; return next; });
          }, 600 + i * 220);
        });
        // Step 3: flags appear
        account.flags.forEach((f, i) => {
          setTimeout(() => {
            setFlags(prev => [...prev, f]);
          }, 2100 + i * 350);
        });
      }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [started, account]);

  const tierColor = score >= 85 ? "#10b981" : score >= 70 ? "#34d399" : score >= 55 ? "#fbbf24" : score >= 40 ? "#f97316" : "#ef4444";
  const tierLabel = score >= 85 ? "SUPREME" : score >= 70 ? "CREDIBLE" : score >= 55 ? "NOTED" : score >= 40 ? "UNKNOWN" : score >= 25 ? "SUSPICIOUS" : "LIKELY BOT";

  const barLabels = ["Follow Ratio", "Engagement", "Conversations", "Activity", "Verified"];
  const barColors = ["#10b981", "#06b6d4", "#a855f7", "#f59e0b", "#ec4899"];

  const isNegative = account.flags.some(f => f.type === "red");

  return (
    <div ref={ref} style={{
      background: "rgba(18, 18, 18, 0.85)",
      border: `1px solid ${tierColor}40`,
      borderRadius: 16,
      padding: 24,
      textAlign: "left",
      boxShadow: `0 0 40px ${tierColor}15`,
      transition: "all 0.5s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #333, #111)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff" }}>{account.initial}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{account.handle}</div>
            <div style={{ fontSize: 10, color: "#a3a3a3", fontFamily: "'JetBrains Mono', monospace" }}>{account.niche}</div>
          </div>
        </div>
        {score > 0 && (
          <div style={{
            padding: "4px 10px", borderRadius: 8,
            background: `${tierColor}15`, border: `1px solid ${tierColor}40`,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 800,
            color: tierColor, letterSpacing: 1.5,
            animation: "fadeIn 0.4s ease-out",
          }}>{tierLabel}</div>
        )}
      </div>

      {/* Score display */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 16 }}>
        <span style={{ fontSize: 48, fontWeight: 900, color: tierColor, letterSpacing: -2, fontFamily: "'JetBrains Mono', monospace" }}>{score}</span>
        <span style={{ fontSize: 14, color: "#525252", fontFamily: "'JetBrains Mono', monospace" }}>/ 100 Trust Score</span>
      </div>

      {/* Signal bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bars.map((val, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: "#a3a3a3", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{barLabels[i]}</span>
              <span style={{ fontSize: 10, color: barColors[i], fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{val}</span>
            </div>
            <div style={{ height: 4, background: "rgba(255, 255, 255, 0.05)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${val}%`,
                background: `linear-gradient(90deg, ${barColors[i]}, ${barColors[i]}cc)`,
                transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", flexDirection: "column", gap: 6 }}>
          {flags.map((f, i) => (
            <div key={i} style={{
              padding: "8px 10px",
              background: f.type === "red" ? "rgba(239, 68, 68, 0.06)" : "rgba(16, 185, 129, 0.06)",
              border: f.type === "red" ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: 6,
              fontSize: 11,
              color: f.type === "red" ? "#fca5a5" : "#6ee7b7",
              fontFamily: "'JetBrains Mono', monospace",
              display: "flex", alignItems: "center", gap: 8,
              animation: "fadeIn 0.4s ease-out",
            }}>
              <span>{f.type === "red" ? "🚩" : "✅"}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Fictional disclaimer */}
      {flags.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 9, color: "#525252", fontFamily: "'JetBrains Mono', monospace", textAlign: "center", letterSpacing: 1, textTransform: "uppercase" }}>
          * Demo account — illustrative example
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

function GlowCard({ children, style, glow = false, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? C.surfaceHover : C.surface,
        border: glow ? `1px solid ${hover ? C.borderHover : C.border}` : `1px solid rgba(255, 255, 255, 0.08)`,
        borderRadius: 16,
        padding: 24,
        transition: "all 0.3s ease",
        cursor: onClick ? "pointer" : "default",
        boxShadow: glow && hover ? "0 0 40px rgba(255, 255, 255, 0.05), 0 0 80px rgba(255, 255, 255, 0.02)" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Pill({ text, color = C.primary }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      fontFamily: "'JetBrains Mono', monospace",
      background: `${color}15`,
      color,
      border: `1px solid ${color}30`,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    }}>{text}</span>
  );
}

// ─── Mock Historical Data (would come from daily snapshots DB) ──
function generateHistory(baseFollowers, baseTrust, days = 90, anomalyDay = null) {
  const points = [];
  let followers = baseFollowers * 0.7;
  let trust = baseTrust - 5;
  for (let i = 0; i < days; i++) {
    const noise = (Math.random() - 0.5) * 0.02;
    followers *= 1 + noise + 0.004;
    trust += (Math.random() - 0.5) * 1.5;
    trust = Math.max(20, Math.min(98, trust));
    if (anomalyDay === i) followers *= 1.35; // sudden spike
    points.push({
      day: i,
      date: new Date(Date.now() - (days - i) * 86400000).toISOString().split('T')[0],
      followers: Math.round(followers),
      trust: Math.round(trust),
      anomaly: anomalyDay === i,
    });
  }
  return points;
}

const LEADERBOARD_DATA = {
  trending: [
    { rank: 1, handle: "@CryptoAlpha_", change: "+12", score: 94, followers: 45200, niche: "DeFi", growth: "+8.2%" },
    { rank: 2, handle: "@SOL_Trader99", change: "+8", score: 87, followers: 12800, niche: "Solana", growth: "+15.4%" },
    { rank: 3, handle: "@0xTrenchKing", change: "+5", score: 91, followers: 67800, niche: "DeFi", growth: "+6.1%" },
    { rank: 4, handle: "@GMResearch", change: "+3", score: 89, followers: 34100, niche: "Research", growth: "+4.8%" },
    { rank: 5, handle: "@PumpWatch_", change: "+2", score: 82, followers: 18900, niche: "Memecoin", growth: "+11.2%" },
    { rank: 6, handle: "@OnChainMax", change: "−1", score: 85, followers: 31500, niche: "Analytics", growth: "+3.1%" },
    { rank: 7, handle: "@DegenHQ", change: "−2", score: 78, followers: 22100, niche: "Memecoin", growth: "+2.4%" },
    { rank: 8, handle: "@BTCPurist", change: "+4", score: 88, followers: 54300, niche: "Bitcoin", growth: "+5.7%" },
  ],
  rising: [
    { rank: 1, handle: "@NewDegen420", change: "NEW", score: 72, followers: 4200, niche: "Memecoin", growth: "+142%" },
    { rank: 2, handle: "@SolanaShiller", change: "NEW", score: 68, followers: 8900, niche: "Solana", growth: "+98%" },
    { rank: 3, handle: "@AlphaHunter_", change: "+25", score: 75, followers: 12300, niche: "Alpha", growth: "+84%" },
    { rank: 4, handle: "@MemeEconomist", change: "+18", score: 71, followers: 6700, niche: "Memecoin", growth: "+67%" },
    { rank: 5, handle: "@DeFi_Detective", change: "NEW", score: 79, followers: 15400, niche: "DeFi", growth: "+55%" },
  ],
  suspicious: [
    { rank: 1, handle: "@FakeAlpha2024", change: "🚩", score: 18, followers: 85000, niche: "DeFi", growth: "+210%" },
    { rank: 2, handle: "@BotNetwork_", change: "🚩", score: 22, followers: 45000, niche: "Memecoin", growth: "+180%" },
    { rank: 3, handle: "@PumpDumpKing", change: "🚩", score: 28, followers: 120000, niche: "Memecoin", growth: "+95%" },
    { rank: 4, handle: "@FollowBot420", change: "🚩", score: 15, followers: 33000, niche: "Crypto", growth: "+340%" },
  ],
};

// ─── PHASE 2: Sale History + Seller Reputation ──────────────────
const SALE_HISTORY = [
  { id: 1, handle: "@CryptoAlpha_", price: 3800, prevPrice: 2400, soldAgo: "2d ago", buyer: "@0xTrenchKing", seller: "@OGTrader", sellerScore: 98, followers: 45200, trustScore: 87 },
  { id: 2, handle: "@DeFiSniper", price: 2100, prevPrice: null, soldAgo: "5d ago", buyer: "@WhaleBuyer", seller: "@FlipKing", sellerScore: 94, followers: 28400, trustScore: 82 },
  { id: 3, handle: "@MemecoinMF", price: 680, prevPrice: 420, soldAgo: "1w ago", buyer: "@DegenHQ", seller: "@NewSeller23", sellerScore: 72, followers: 8900, trustScore: 65 },
  { id: 4, handle: "@SolanaGod_", price: 12400, prevPrice: 8200, soldAgo: "2w ago", buyer: "@Institutional", seller: "@OGTrader", sellerScore: 98, followers: 124000, trustScore: 91 },
  { id: 5, handle: "@AlphaSignals", price: 4500, prevPrice: null, soldAgo: "3w ago", buyer: "@NewDegen420", seller: "@VerifiedPro", sellerScore: 89, followers: 52000, trustScore: 84 },
];

const TOP_SELLERS = [
  { handle: "@OGTrader", score: 98, totalSales: 47, totalVolume: 142300, disputeRate: "0%", avgTime: "4h", badges: ["pro", "fast", "clean"] },
  { handle: "@VerifiedPro", score: 94, totalSales: 31, totalVolume: 89400, disputeRate: "0%", avgTime: "6h", badges: ["pro", "clean"] },
  { handle: "@FlipKing", score: 91, totalSales: 28, totalVolume: 64200, disputeRate: "3.6%", avgTime: "8h", badges: ["pro"] },
  { handle: "@WhaleBuyer", score: 88, totalSales: 19, totalVolume: 78900, disputeRate: "5.3%", avgTime: "12h", badges: ["trusted"] },
];

// ─── PHASE 3: Wallet Binding + Vouching Network ─────────────────
const WALLET_DATA = {
  address: "7xKXt...9m2pQ",
  full: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  walletAgeDays: 1247,
  totalTxns: 8934,
  chains: ["Solana"],
  onChainScore: 92,
  holdings: [
    { symbol: "SOL", amount: "47.2", value: 9440, held: "2.1y" },
    { symbol: "BONK", amount: "12.4M", value: 3120, held: "1.4y" },
    { symbol: "WIF", amount: "843", value: 2180, held: "8mo" },
    { symbol: "JUP", amount: "1.2k", value: 980, held: "1.2y" },
  ],
  protocols: ["Jupiter", "Raydium", "Drift", "Kamino", "MarginFi", "Tensor"],
  notableActivity: [
    { event: "Bought SOL at $8.50 (bear market bottom)", date: "Dec 2022", signal: "diamond" },
    { event: "Held through FTX collapse", date: "Nov 2022", signal: "diamond" },
    { event: "Top 5% Jupiter volume", date: "2024", signal: "og" },
    { event: "Early BONK holder (pre-CEX listing)", date: "Jan 2023", signal: "og" },
  ],
};

const VOUCHES = [
  { handle: "@0xTrenchKing", score: 94, vouchedAt: "3 weeks ago", weight: "high", reason: "Met IRL at Breakpoint" },
  { handle: "@DegenHQ", score: 88, vouchedAt: "1 month ago", weight: "high", reason: "Long-time mutual" },
  { handle: "@SOL_Trader99", score: 82, vouchedAt: "2 months ago", weight: "medium", reason: "Verified trader" },
  { handle: "@OnChainMax", score: 85, vouchedAt: "2 months ago", weight: "high", reason: "Professional relationship" },
  { handle: "@CryptoAlpha_", score: 87, vouchedAt: "3 months ago", weight: "high", reason: "Known good actor" },
];

// ─── PHASE 4: CIB Detection + Forensics + Alerts ────────────────
const CIB_CLUSTERS = [
  {
    id: "cluster-001",
    name: "Engagement Pod Alpha",
    members: 47,
    reciprocal: 68,
    detectedAt: "12 days ago",
    accounts: ["@PumpBot1", "@ShillKing_", "@GainzGuru", "@PumpBot2", "@MoonBoi42"],
    severity: "high",
    pattern: "Reciprocal likes within 3min of posting, 92% follower overlap",
  },
  {
    id: "cluster-002",
    name: "Coordinated Raid Network",
    members: 24,
    reciprocal: 81,
    detectedAt: "5 days ago",
    accounts: ["@RaidLeader", "@RaidHelper1", "@RaidHelper2", "@CopyPaste_"],
    severity: "high",
    pattern: "Identical reply templates, synchronized posting times",
  },
  {
    id: "cluster-003",
    name: "Follow-for-Follow Ring",
    members: 156,
    reciprocal: 45,
    detectedAt: "2 days ago",
    accounts: ["@F4F_Account1", "@F4F_Account2", "@F4F_Account3"],
    severity: "medium",
    pattern: "Mass following patterns, low organic engagement",
  },
];

const FORENSICS_REPORT = {
  tweetsAnalyzed: 50,
  totalReplies: 1247,
  suspiciousReplies: 186,
  suspiciousPct: 14.9,
  repliesFromNewAccounts: 42,
  repliesWithTemplates: 28,
  engagementPodSignals: 116,
  velocityAnomalies: 8,
  flaggedTweets: [
    { tweet: "Just bought more $BONK 🚀", replies: 127, suspiciousPct: 42, flag: "Pod engagement" },
    { tweet: "This is the next 100x...", replies: 89, suspiciousPct: 38, flag: "Template replies" },
    { tweet: "GM frens ☕", replies: 54, suspiciousPct: 28, flag: "New account replies" },
  ],
};

const ALERT_TYPES = [
  { id: "follower-spike", name: "Follower Spike", desc: "Alert when followers jump >10% in 24h", icon: "📈", premium: false },
  { id: "trust-drop", name: "Trust Score Drop", desc: "Alert when Trust Score drops by 10+ points", icon: "📉", premium: false },
  { id: "listing", name: "Listed for Sale", desc: "Alert when watched account is listed on marketplace", icon: "🏷️", premium: false },
  { id: "bot-flag", name: "Bot Activity Detected", desc: "Alert when CIB detection flags the account", icon: "🤖", premium: true },
  { id: "cluster", name: "Pod Membership", desc: "Alert when account joins a detected engagement pod", icon: "🕸️", premium: true },
  { id: "engagement-drop", name: "Engagement Collapse", desc: "Alert when engagement rate drops 50%+", icon: "⚠️", premium: true },
  { id: "rival", name: "Competitor Movement", desc: "Alert when rival accounts change strategy", icon: "👁️", premium: true },
];

const WATCHLIST = [
  { handle: "@0xTrenchKing", score: 94, alerts: ["follower-spike", "trust-drop"], lastAlert: "2h ago — followers +12%" },
  { handle: "@BigKOL", score: 88, alerts: ["listing", "engagement-drop"], lastAlert: "None in 7d" },
  { handle: "@CompetitorX", score: 76, alerts: ["follower-spike", "listing", "cluster"], lastAlert: "Yesterday — flagged in cluster-003" },
];


export default function HandleMarket() {
  const [tab, setTab] = useState("home");
  const [form, setForm] = useState({
    followers: "", avgLikes: "", avgRetweets: "", avgReplies: "",
    tweets: "", accountAgeDays: "", verified: false, cryptoNiche: true,
  });
  const [result, setResult] = useState(null);
  const [trustResult, setTrustResult] = useState(null);
  const [animateValue, setAnimateValue] = useState(0);
  const [sortBy, setSortBy] = useState("value");
  const [filterNiche, setFilterNiche] = useState("all");
  const [mode, setMode] = useState("handle"); // "handle" or "manual"
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profileData, setProfileData] = useState(null);
  const [leaderboardTab, setLeaderboardTab] = useState("trending");
  const [historyData, setHistoryData] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [selectedListing, setSelectedListing] = useState(null);
  const [showListForm, setShowListForm] = useState(false);
  const [listForm, setListForm] = useState({
    handle: "", askingPrice: "", description: "", niche: "DeFi",
    contactMethod: "telegram", contactHandle: "", negotiable: true,
  });
  const [listSubmitted, setListSubmitted] = useState(false);
  const [forensicsRun, setForensicsRun] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredTab, setHoveredTab] = useState(null);
  const resultRef = useRef(null);

  const API_BASE = "http://localhost:3001"; // Change this to your deployed backend URL

  useEffect(() => {
    if (result) {
      const end = result.estimatedValue;
      const duration = 1200;
      const startTime = Date.now();
      const tick = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimateValue(Math.round(eased * end));
        if (progress < 1) requestAnimationFrame(tick);
      };
      tick();
    }
  }, [result]);

  const handleLookup = async () => {
    const cleanHandle = handle.replace("@", "").trim();
    if (!cleanHandle) return;
    setLoading(true);
    setError("");
    setResult(null);
    setProfileData(null);
    try {
      const res = await fetch(`${API_BASE}/api/valuate/${cleanHandle}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch account data");
      setProfileData(data);
      const val = estimateValue({
        followers: data.followers,
        avgLikes: data.avgLikes,
        avgRetweets: data.avgRetweets,
        avgReplies: data.avgReplies,
        tweets: data.totalTweets,
        accountAgeDays: data.accountAgeDays,
        verified: data.verified,
        cryptoNiche: data.cryptoNiche,
      });
      const trust = calculateTrustScore({
        followers: data.followers,
        following: data.following,
        avgLikes: data.avgLikes,
        avgRetweets: data.avgRetweets,
        avgReplies: data.avgReplies,
        tweets: data.totalTweets,
        accountAgeDays: data.accountAgeDays,
        verified: data.verified,
        cryptoNiche: data.cryptoNiche,
        avgImpressions: data.avgImpressions,
      });
      setResult(val);
      setTrustResult(trust);
      // Generate historical snapshot data
      const anomalyDay = data.followers > 10000 && trust.trustScore < 40 ? Math.floor(Math.random() * 60) + 10 : null;
      setHistoryData(generateHistory(data.followers, trust.trustScore, 90, anomalyDay));
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleValuate = () => {
    const data = {
      followers: parseInt(form.followers) || 0,
      avgLikes: parseInt(form.avgLikes) || 0,
      avgRetweets: parseInt(form.avgRetweets) || 0,
      avgReplies: parseInt(form.avgReplies) || 0,
      tweets: parseInt(form.tweets) || 0,
      accountAgeDays: parseInt(form.accountAgeDays) || 365,
      verified: form.verified,
      cryptoNiche: form.cryptoNiche,
    };
    setProfileData(null);
    const val = estimateValue(data);
    const trust = calculateTrustScore({
      ...data,
      following: Math.round(data.followers / 3), // estimate if not provided
    });
    setResult(val);
    setTrustResult(trust);
    const anomalyDay = data.followers > 10000 && trust.trustScore < 40 ? Math.floor(Math.random() * 60) + 10 : null;
    setHistoryData(generateHistory(data.followers, trust.trustScore, 90, anomalyDay));
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const sortedListings = [...MOCK_LISTINGS]
    .filter(l => filterNiche === "all" || l.niche.toLowerCase().includes(filterNiche))
    .sort((a, b) => sortBy === "value" ? b.value - a.value : b.followers - a.followers);

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    background: "rgba(0, 0, 0, 0.9)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: 10,
    color: C.textPrimary,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontSize: 11,
    color: C.textMuted,
    marginBottom: 6,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(145deg, ${C.bg1} 0%, ${C.bg2} 40%, ${C.bg3} 100%)`,
      color: C.textPrimary,
      fontFamily: "'Outfit', sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ position: "fixed", top: "-20%", right: "-10%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(212, 255, 0, 0.05) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-15%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(255, 255, 255, 0.02) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: "40%", left: "50%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(255, 255, 255, 0.02) 0%, transparent 60%)", pointerEvents: "none", transform: "translateX(-50%)" }} />

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(212, 255, 0, 0.08)", padding: "16px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div
            onClick={() => setTab("home")}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", transition: "opacity 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#000" }}>HM</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.5 }}>HandleMarket</div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, textTransform: "uppercase" }}>Valuate · Trade · Profit</div>
            </div>
          </div>
          {/* Hamburger Menu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(212, 255, 0, 0.18)"; e.currentTarget.style.transform = "scale(1.05)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = menuOpen ? "rgba(212, 255, 0, 0.12)" : "rgba(0, 0, 0, 0.5)"; e.currentTarget.style.transform = "scale(1)"; }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 18px", borderRadius: 12,
                background: menuOpen ? "rgba(212, 255, 0, 0.12)" : "rgba(0, 0, 0, 0.5)",
                border: `1px solid ${menuOpen ? C.borderHover : "rgba(255, 255, 255, 0.06)"}`,
                color: menuOpen ? C.primary : C.textSecondary,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700,
                cursor: "pointer", textTransform: "uppercase", letterSpacing: 1.2,
                transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              {/* Animated hamburger icon */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, width: 16 }}>
                <div style={{ height: 2, background: "currentColor", borderRadius: 1, transition: "all 0.3s", transform: menuOpen ? "rotate(45deg) translate(4px, 4px)" : "none" }} />
                <div style={{ height: 2, background: "currentColor", borderRadius: 1, transition: "all 0.2s", opacity: menuOpen ? 0 : 1 }} />
                <div style={{ height: 2, background: "currentColor", borderRadius: 1, transition: "all 0.3s", transform: menuOpen ? "rotate(-45deg) translate(4px, -4px)" : "none" }} />
              </div>
              <span>
                {[
                  ["home", "🏠 Home"],
                  ["valuate", "⚡ Valuate"],
                  ["trust", "🛡️ Trust"],
                  ["marketplace", "🏪 Market"],
                  ["leaderboard", "🏆 Ranks"],
                  ["profile", "👤 Profile"],
                  ["history", "💸 Sales"],
                  ["wallet", "💎 Wallet"],
                  ["cib", "🕸️ CIB"],
                  ["alerts", "🔔 Alerts"],
                ].find(([t]) => t === tab)?.[1] || "Menu"}
              </span>
            </button>

            {/* Dropdown Menu */}
            {menuOpen && (
              <>
                {/* Click-away overlay */}
                <div
                  onClick={() => setMenuOpen(false)}
                  style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}
                />
                {/* Menu panel */}
                <div style={{
                  position: "absolute", top: "calc(100% + 10px)", right: 0,
                  minWidth: 260, zIndex: 51,
                  background: "rgba(10, 10, 10, 0.98)",
                  backdropFilter: "blur(20px)",
                  border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: 8,
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 255, 255, 0.05)",
                  animation: "menuSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                }}>
                  <style>{`
                    @keyframes menuSlide {
                      from { opacity: 0; transform: translateY(-10px) scale(0.96); }
                      to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                  `}</style>
                  {[
                    ["home", "🏠", "Home", "Welcome + overview"],
                    ["valuate", "⚡", "Valuate", "Run account valuation"],
                    ["trust", "🛡️", "Trust", "Trust Score guide"],
                    ["marketplace", "🏪", "Market", "Browse listings"],
                    ["leaderboard", "🏆", "Ranks", "CT leaderboards"],
                    ["profile", "👤", "Profile", "Public profile page"],
                    ["history", "💸", "Sales", "Transaction history"],
                    ["wallet", "💎", "Wallet", "On-chain reputation"],
                    ["cib", "🕸️", "CIB", "Bot & pod detection"],
                    ["alerts", "🔔", "Alerts", "Real-time watchlist"],
                  ].map(([t, icon, label, desc]) => {
                    const isActive = tab === t;
                    const isHovered = hoveredTab === t;
                    return (
                      <button
                        key={t}
                        onClick={() => { setTab(t); setMenuOpen(false); }}
                        onMouseEnter={() => setHoveredTab(t)}
                        onMouseLeave={() => setHoveredTab(null)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 12,
                          padding: "12px 14px", borderRadius: 10, border: "none",
                          background: isActive ? `linear-gradient(135deg, ${C.primary}20, ${C.accent}15)` : isHovered ? "rgba(255, 255, 255, 0.05)" : "transparent",
                          color: isActive ? C.primary : isHovered ? C.textPrimary : C.textSecondary,
                          cursor: "pointer", textAlign: "left",
                          fontFamily: "'Outfit', sans-serif",
                          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                          transform: isHovered ? "scale(1.02) translateX(2px)" : "scale(1)",
                          boxShadow: isHovered ? `0 4px 20px rgba(255, 255, 255, 0.06)` : "none",
                          borderLeft: isActive ? `3px solid ${C.primary}` : "3px solid transparent",
                          marginBottom: 2,
                        }}
                      >
                        <div style={{
                          fontSize: isHovered ? 22 : 20,
                          transition: "font-size 0.2s",
                          width: 28, textAlign: "center",
                        }}>{icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: isHovered ? 14 : 13,
                            fontWeight: 700,
                            letterSpacing: isHovered ? 0 : -0.2,
                            transition: "all 0.2s",
                          }}>{label}</div>
                          <div style={{
                            fontSize: 10,
                            color: isActive ? `${C.primary}aa` : C.textMuted,
                            fontFamily: "'JetBrains Mono', monospace",
                            textTransform: "uppercase",
                            letterSpacing: 0.8,
                            marginTop: 2,
                          }}>{desc}</div>
                        </div>
                        {isActive && (
                          <div style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: C.primary,
                            boxShadow: `0 0 10px ${C.primary}`,
                          }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* ─── HOME / LANDING TAB ───────────────────────────── */}
        {tab === "home" && (
          <div>
            {/* LIVE TICKER */}
            <div style={{
              position: "relative",
              marginBottom: 40,
              padding: "12px 0",
              borderTop: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
              background: "rgba(0, 0, 0, 0.5)",
              overflow: "hidden",
              maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
              WebkitMaskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
            }}>
              <style>{`
                @keyframes scrollTicker {
                  from { transform: translateX(0); }
                  to { transform: translateX(-50%); }
                }
                .ticker-track { animation: scrollTicker 60s linear infinite; }
              `}</style>
              <div className="ticker-track" style={{ display: "flex", gap: 32, whiteSpace: "nowrap", width: "max-content" }}>
                {[...Array(2)].map((_, loopIdx) => (
                  <div key={loopIdx} style={{ display: "flex", gap: 32 }}>
                    {[
                      { handle: "@CryptoAlpha_", val: 3800, score: 87, tier: "SUPREME", color: "#10b981" },
                      { handle: "@SOL_Trader99", val: 950, score: 76, tier: "CREDIBLE", color: "#34d399" },
                      { handle: "@0xTrenchKing", val: 6700, score: 91, tier: "SUPREME", color: "#10b981" },
                      { handle: "@PumpWatch_", val: 1480, score: 68, tier: "NOTED", color: "#fbbf24" },
                      { handle: "@FakeAlpha2024", val: null, score: 22, tier: "SUSPICIOUS", color: "#ef4444", flag: true },
                      { handle: "@NFTWhaleWatch", val: 9200, score: 84, tier: "CREDIBLE", color: "#34d399" },
                      { handle: "@DeFi_Degen", val: 420, score: 65, tier: "NOTED", color: "#fbbf24" },
                      { handle: "@BotNetwork_", val: null, score: 18, tier: "LIKELY BOT", color: "#dc2626", flag: true },
                      { handle: "@GMResearch", val: 4200, score: 88, tier: "SUPREME", color: "#10b981" },
                      { handle: "@AirdropHunter", val: 1750, score: 54, tier: "UNKNOWN", color: "#f97316" },
                      { handle: "@OnChainMax", val: 2600, score: 85, tier: "SUPREME", color: "#10b981" },
                      { handle: "@BTCPurist", val: 5200, score: 82, tier: "CREDIBLE", color: "#34d399" },
                    ].map((item, i) => (
                      <div key={`${loopIdx}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                        <span style={{ color: C.textPrimary, fontWeight: 700 }}>{item.handle}</span>
                        {item.val && <span style={{ color: C.primary, fontWeight: 800 }}>${item.val.toLocaleString()}</span>}
                        <span style={{ color: item.color, fontWeight: 800, letterSpacing: 1 }}>{item.flag ? "🚩" : "·"} {item.tier} {item.score}</span>
                        <span style={{ color: C.textMuted }}>·</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* HERO */}
            <div style={{ textAlign: "center", padding: "20px 20px 60px", position: "relative" }}>
              {/* Badge */}
              <Reveal>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.2)", marginBottom: 24 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary, boxShadow: `0 0 10px ${C.primary}`, animation: "pulse 2s ease-in-out infinite" }} />
                  <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
                  <span style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>The CT Account Marketplace</span>
                </div>
              </Reveal>

              {/* Headline with word cycle */}
              <Reveal delay={100}>
                <h1 style={{ fontSize: 64, fontWeight: 900, margin: 0, letterSpacing: -3, lineHeight: 1 }}>
                  Buy. Sell.<br />
                  <CycleWord words={["Verify", "Track", "Expose", "Trust", "Monitor"]} color={C.primary} /> CT accounts.
                </h1>
              </Reveal>
              <Reveal delay={200}>
                <p style={{ color: C.textSecondary, fontSize: 18, marginTop: 20, maxWidth: 560, margin: "20px auto 0", lineHeight: 1.5 }}>
                  The first marketplace built for Crypto Twitter. Free valuations, trust scores, bot detection, and escrow-protected trades — all in one place.
                </p>
              </Reveal>

              {/* CTAs */}
              <Reveal delay={300}>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setTab("valuate")}
                    style={{
                      padding: "14px 28px", borderRadius: 12, border: "none",
                      background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                      color: "#000", fontSize: 14, fontWeight: 900,
                      fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                      letterSpacing: 0.3, transition: "all 0.2s",
                      boxShadow: "0 0 32px rgba(212, 255, 0, 0.25)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(212, 255, 0, 0.4)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(212, 255, 0, 0.25)"; }}
                  >⚡ Get Free Valuation</button>
                  <button
                    onClick={() => setTab("marketplace")}
                    style={{
                      padding: "14px 28px", borderRadius: 12,
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      background: "rgba(0, 0, 0, 0.5)",
                    color: C.textPrimary, fontSize: 14, fontWeight: 700,
                    fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(212, 255, 0, 0.4)"; e.currentTarget.style.color = C.primary; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)"; e.currentTarget.style.color = C.textPrimary; }}
                >🏪 Browse Marketplace</button>
              </div>
              </Reveal>

              {/* LIVE DEMO CARD */}
              <Reveal delay={500}>
                <div style={{ marginTop: 48, maxWidth: 480, margin: "48px auto 0" }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>⚡ Live Trust Score Demo</div>
                  <DemoCard />
                </div>
              </Reveal>

              {/* Social proof bar — animated counters */}
              <Reveal delay={200}>
                <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 56, flexWrap: "wrap" }}>
                  {[
                    { val: 847, prefix: "$", suffix: "k", lbl: "Traded volume" },
                    { val: 2400, prefix: "", suffix: "+", lbl: "Accounts valued" },
                    { val: 96, prefix: "", suffix: "%", lbl: "Bot detection" },
                    { val: 0, prefix: "", suffix: "%", lbl: "Dispute rate", static: true },
                  ].map((s, i) => (
                    <div key={s.lbl} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: C.primary, letterSpacing: -1, fontFamily: "'JetBrains Mono', monospace" }}>
                        {s.static ? `${s.prefix}${s.val}${s.suffix}` : <CountUp end={s.val} prefix={s.prefix} suffix={s.suffix} duration={1800} />}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 2 }}>{s.lbl}</div>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* HOW IT WORKS */}
            <Reveal>
              <div style={{ marginBottom: 60 }}>
                <div style={{ textAlign: "center", marginBottom: 40 }}>
                  <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>How It Works</div>
                  <h2 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>Three steps. No bullshit.</h2>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                {[
                  { num: "01", title: "Valuate", desc: "Plug in any CT handle. Get a real-time estimate based on engagement, reach, niche, and verification.", icon: "⚡" },
                  { num: "02", title: "Verify", desc: "Our Trust Score exposes bot followers, engagement pods, and coordinated networks. Buy with confidence.", icon: "🛡️" },
                  { num: "03", title: "Trade", desc: "List for sale or buy via escrow. Funds held until transfer confirmed. 2.5% fee only on completed sales.", icon: "💸" },
                ].map((step, i) => (
                  <GlowCard key={step.num} glow style={{ position: "relative", paddingTop: 32 }}>
                    <div style={{ position: "absolute", top: 20, right: 20, fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 2 }}>/ {step.num}</div>
                    <div style={{ fontSize: 40, marginBottom: 14 }}>{step.icon}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, marginBottom: 8 }}>{step.title}</div>
                    <div style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6 }}>{step.desc}</div>
                  </GlowCard>
                ))}
              </div>
              </div>
            </Reveal>

            {/* FEATURES GRID */}
            <Reveal>
              <div style={{ marginBottom: 60 }}>
                <div style={{ textAlign: "center", marginBottom: 40 }}>
                  <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>What's Inside</div>
                  <h2 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>Built for <span style={{ color: C.primary }}>CT degens.</span></h2>
                </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                {[
                  { icon: "🛡️", title: "Trust Score", desc: "0-100 authenticity rating. Exposes bot-inflated audiences and engagement pods.", tab: "trust" },
                  { icon: "💎", title: "Wallet Binding", desc: "Prove you're a real CT trader with on-chain reputation from your Solana wallet.", tab: "wallet" },
                  { icon: "🕸️", title: "CIB Detection", desc: "Catches coordinated pods, raid networks, and F4F rings before you get scammed.", tab: "cib" },
                  { icon: "💸", title: "Public Sale Ledger", desc: "See what accounts actually sold for. Price anchored to real market data.", tab: "history" },
                  { icon: "🏆", title: "CT Leaderboards", desc: "Trending, Rising, and Suspicious rankings updated hourly.", tab: "leaderboard" },
                  { icon: "🔔", title: "Real-Time Alerts", desc: "Watch any account. Get notified the second something changes.", tab: "alerts" },
                ].map(f => (
                  <div key={f.title}
                    onClick={() => setTab(f.tab)}
                    style={{
                      padding: "20px 22px", borderRadius: 14,
                      background: "rgba(18, 18, 18, 0.7)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      cursor: "pointer", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(212, 255, 0, 0.3)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.background = "rgba(30, 30, 30, 0.9)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = "rgba(18, 18, 18, 0.7)"; }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, letterSpacing: -0.3 }}>{f.title}</div>
                    <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{f.desc}</div>
                    <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", marginTop: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Explore →</div>
                  </div>
                ))}
              </div>
              </div>
            </Reveal>

            {/* TRUST SIGNALS / WHY USE US */}
            <Reveal>
              <div style={{ marginBottom: 60 }}>
                <GlowCard glow style={{ padding: "32px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
                    {[
                      { icon: "🔒", title: "Escrow-Protected", desc: "Funds held until ownership transfers. Zero counterparty risk." },
                      { icon: "✅", title: "Verified Sellers", desc: "Every seller builds a public reputation. See sales history, dispute rate, transfer speed." },
                      { icon: "🎯", title: "Bot-Free Buying", desc: "Our algorithm scans every listing for fake followers and engagement manipulation." },
                      { icon: "📈", title: "Tracked History", desc: "90-day account snapshots expose sudden growth spikes and red flags." },
                    ].map(item => (
                      <div key={item.title}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                </GlowCard>
              </div>
            </Reveal>

            {/* FINAL CTA */}
            <Reveal>
              <GlowCard glow style={{ textAlign: "center", padding: "48px 32px", background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), rgba(0, 0, 0, 0.5))` }}>
                <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1.5, marginBottom: 12 }}>
                  Ready to know what your <span style={{ color: C.primary }}>account</span> is worth?
                </div>
                <div style={{ fontSize: 15, color: C.textSecondary, marginBottom: 28, maxWidth: 440, margin: "0 auto 28px" }}>
                  Free valuations. No signup required. Takes 10 seconds.
                </div>
                <button
                  onClick={() => setTab("valuate")}
                  style={{
                    padding: "16px 36px", borderRadius: 12, border: "none",
                    background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                    color: "#000", fontSize: 15, fontWeight: 900,
                    fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                    letterSpacing: 0.3, transition: "all 0.2s",
                    boxShadow: "0 0 32px rgba(212, 255, 0, 0.25)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(212, 255, 0, 0.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(212, 255, 0, 0.25)"; }}
                >⚡ Valuate My Account</button>
              </GlowCard>
            </Reveal>
          </div>
        )}

        {tab === "valuate" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0, letterSpacing: -1.5, lineHeight: 1.1 }}>
                How much is your <span style={{ color: C.primary }}>CT account</span> worth?
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 16, marginTop: 12, fontWeight: 400 }}>
                Get an instant valuation based on real engagement metrics
              </p>
            </div>

            <GlowCard style={{ maxWidth: 650, margin: "0 auto 24px" }} glow>
              {/* Mode toggle */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 4, background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, padding: 3, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  {[["handle", "🔍 Handle Lookup"], ["manual", "✏️ Manual"]].map(([val, label]) => (
                    <button key={val} onClick={() => { setMode(val); setError(""); }} style={{
                      padding: "6px 14px", borderRadius: 7, border: "none",
                      background: mode === val ? "rgba(212, 255, 0, 0.12)" : "transparent",
                      color: mode === val ? C.primary : C.textMuted,
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                      cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5, transition: "all 0.2s",
                    }}>{label}</button>
                  ))}
                </div>
                {mode === "handle" && <Pill text="Live API" color={C.accent} />}
                {mode === "manual" && <Pill text="Manual Entry" color={C.textMuted} />}
              </div>

              {/* Handle lookup mode */}
              {mode === "handle" && (
                <div>
                  <label style={labelStyle}>X / Twitter Handle</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.textMuted, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>@</span>
                      <input
                        style={{ ...inputStyle, paddingLeft: 32 }}
                        type="text"
                        placeholder="FabsKebabs101"
                        value={handle}
                        onChange={e => setHandle(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleLookup()}
                        onFocus={e => e.target.style.borderColor = C.primary}
                        onBlur={e => e.target.style.borderColor = "rgba(255, 255, 255, 0.12)"}
                      />
                    </div>
                    <button
                      onClick={handleLookup}
                      disabled={loading}
                      style={{
                        padding: "12px 24px", borderRadius: 10, border: "none",
                        background: loading ? "rgba(255, 255, 255, 0.1)" : `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                        color: loading ? C.textPrimary : "#000", fontSize: 13, fontWeight: 800,
                        fontFamily: "'JetBrains Mono', monospace", cursor: loading ? "wait" : "pointer",
                        transition: "all 0.2s", whiteSpace: "nowrap",
                      }}
                    >
                      {loading ? "⏳ Fetching..." : "⚡ Valuate"}
                    </button>
                  </div>

                  {error && (
                    <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8 }}>
                      <span style={{ fontSize: 12, color: "#ef4444", fontFamily: "'JetBrains Mono', monospace" }}>⚠ {error}</span>
                    </div>
                  )}

                  {/* Show fetched profile data */}
                  {profileData && result && (
                    <div style={{ marginTop: 16, padding: "14px 16px", background: "rgba(255, 255, 255, 0.02)", borderRadius: 10, border: "1px solid rgba(212, 255, 0, 0.08)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                        {profileData.profileImage && (
                          <img src={profileData.profileImage} alt="" style={{ width: 40, height: 40, borderRadius: 10, border: `2px solid ${C.primary}30` }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{profileData.name} <span style={{ color: C.textMuted, fontWeight: 400 }}>@{profileData.handle}</span></div>
                          {profileData.bio && <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 2, maxWidth: 450, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profileData.bio}</div>}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                        {[
                          ["Followers", profileData.followers?.toLocaleString()],
                          ["Tweets", profileData.totalTweets?.toLocaleString()],
                          ["Avg Likes", profileData.avgLikes?.toLocaleString()],
                          ["Age", `${Math.round(profileData.accountAgeDays / 365)}y`],
                        ].map(([label, val]) => (
                          <div key={label} style={{ textAlign: "center", padding: "6px 4px", background: "rgba(0, 0, 0, 0.3)", borderRadius: 6 }}>
                            <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginTop: 1 }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        {profileData.verified && <Pill text="✓ Verified" color={C.accent} />}
                        {profileData.cryptoNiche && <Pill text="CT Niche" color={C.primary} />}
                        <Pill text={`${profileData.recentTweetsSampled} tweets sampled`} color={C.textMuted} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manual entry mode */}
              {mode === "manual" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {[
                      ["Followers", "followers", "e.g. 12500"],
                      ["Total Tweets", "tweets", "e.g. 8400"],
                      ["Avg Likes / Post", "avgLikes", "e.g. 85"],
                      ["Avg Retweets / Post", "avgRetweets", "e.g. 20"],
                      ["Avg Replies / Post", "avgReplies", "e.g. 12"],
                      ["Account Age (days)", "accountAgeDays", "e.g. 1095"],
                    ].map(([label, key, placeholder]) => (
                      <div key={key}>
                        <label style={labelStyle}>{label}</label>
                        <input
                          style={inputStyle} type="number" placeholder={placeholder}
                          value={form[key]}
                          onChange={e => setForm({ ...form, [key]: e.target.value })}
                          onFocus={e => e.target.style.borderColor = C.primary}
                          onBlur={e => e.target.style.borderColor = "rgba(255, 255, 255, 0.12)"}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.textSecondary }}>
                      <input type="checkbox" checked={form.verified} onChange={e => setForm({ ...form, verified: e.target.checked })} style={{ accentColor: C.primary }} />
                      Verified (Blue Check)
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: C.textSecondary }}>
                      <input type="checkbox" checked={form.cryptoNiche} onChange={e => setForm({ ...form, cryptoNiche: e.target.checked })} style={{ accentColor: C.primary }} />
                      Crypto / CT Niche
                    </label>
                  </div>

                  <button
                    onClick={handleValuate}
                    style={{
                      width: "100%", marginTop: 20, padding: "14px 24px", borderRadius: 12, border: "none",
                      background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                      color: "#000", fontSize: 15, fontWeight: 800,
                      fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                      letterSpacing: 0.5, transition: "all 0.2s",
                    }}
                    onMouseEnter={e => e.target.style.transform = "translateY(-1px)"}
                    onMouseLeave={e => e.target.style.transform = "translateY(0)"}
                  >
                    ⚡ Get Valuation
                  </button>
                </div>
              )}
            </GlowCard>

            {result && (
              <div ref={resultRef} style={{ maxWidth: 650, margin: "0 auto" }}>
                <GlowCard glow style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Estimated Value</div>
                  <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: -2, color: C.primary }}>
                    ${animateValue.toLocaleString()}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                    <Pill text={`Score: ${result.totalScore}/100`} color={C.primary} />
                    <Pill text={`${result.engagementRate}% Engagement`} color={C.accent} />
                    <Pill text={`~$${result.monthlyEarnings}/mo`} color={C.accentWarm} />
                  </div>
                </GlowCard>

                {/* Trust Score Section */}
                {trustResult && (
                  <GlowCard glow style={{ marginBottom: 20, border: `1px solid ${trustResult.labelColor}30` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                      <div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>🛡️ Trust Score</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                          <span style={{ fontSize: 42, fontWeight: 900, color: trustResult.labelColor, letterSpacing: -1 }}>{trustResult.trustScore}</span>
                          <span style={{ fontSize: 14, color: C.textMuted }}>/ 100</span>
                        </div>
                      </div>
                      <div style={{
                        padding: "8px 16px", borderRadius: 10,
                        background: `${trustResult.labelColor}15`,
                        border: `1px solid ${trustResult.labelColor}40`,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 13, fontWeight: 800,
                        color: trustResult.labelColor,
                        letterSpacing: 1.5,
                      }}>{trustResult.label}</div>
                    </div>

                    {/* Bot follower estimate */}
                    <div style={{ padding: "14px 16px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Estimated Bot Followers</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: trustResult.estimatedBotPct > 30 ? "#ef4444" : trustResult.estimatedBotPct > 15 ? "#f59e0b" : "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>
                          {trustResult.estimatedBotPct}%
                        </span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255, 255, 255, 0.05)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${trustResult.estimatedBotPct}%`,
                          background: `linear-gradient(90deg, ${trustResult.estimatedBotPct > 30 ? "#ef4444" : trustResult.estimatedBotPct > 15 ? "#f59e0b" : "#10b981"}, ${trustResult.estimatedBotPct > 30 ? "#dc2626" : trustResult.estimatedBotPct > 15 ? "#f97316" : "#059669"})`,
                          transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)"
                        }} />
                      </div>
                    </div>

                    {/* Breakdown bars */}
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Authenticity Signals</div>
                    <ScoreBar label="Follow Ratio" score={trustResult.breakdown.followRatio} color="#10b981" />
                    <ScoreBar label="Engagement Quality" score={trustResult.breakdown.engagementQuality} color="#06b6d4" />
                    <ScoreBar label="Conversations" score={trustResult.breakdown.conversation} color="#8b5cf6" />
                    <ScoreBar label="Activity Pattern" score={trustResult.breakdown.activity} color="#f59e0b" />
                    <ScoreBar label="Verification" score={trustResult.breakdown.verification} color="#ec4899" />

                    {/* Flags */}
                    {(trustResult.redFlags.length > 0 || trustResult.greenFlags.length > 0) && (
                      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                        {trustResult.redFlags.map((flag, i) => (
                          <div key={`red-${i}`} style={{ padding: "10px 12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 14 }}>🚩</span>
                            <span style={{ fontSize: 12, color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace" }}>{flag}</span>
                          </div>
                        ))}
                        {trustResult.greenFlags.map((flag, i) => (
                          <div key={`green-${i}`} style={{ padding: "10px 12px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 14 }}>✅</span>
                            <span style={{ fontSize: 12, color: "#6ee7b7", fontFamily: "'JetBrains Mono', monospace" }}>{flag}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Signal explanations */}
                    <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>📖 What Each Signal Means</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {[
                          {
                            label: "Follow Ratio",
                            score: trustResult.breakdown.followRatio,
                            meaning: trustResult.breakdown.followRatio >= 80 ? "Followers far outnumber following — organic growth pattern." : trustResult.breakdown.followRatio >= 50 ? "Balanced ratio — neither suspicious nor premium." : "Following count is close to or exceeds followers. Common F4F pattern.",
                            color: "#10b981"
                          },
                          {
                            label: "Engagement Quality",
                            score: trustResult.breakdown.engagementQuality,
                            meaning: trustResult.breakdown.engagementQuality >= 80 ? `${trustResult.followRatio}x ratio — real humans are engaging with content.` : trustResult.breakdown.engagementQuality >= 50 ? "Moderate engagement — audience is present but not highly active." : "Low engagement relative to follower count — heavy bot follower signal.",
                            color: "#06b6d4"
                          },
                          {
                            label: "Conversations",
                            score: trustResult.breakdown.conversation,
                            meaning: trustResult.breakdown.conversation >= 80 ? "Strong reply-to-like ratio indicates real discussion, not passive likes." : trustResult.breakdown.conversation >= 50 ? "Some conversation happening — audience cares enough to reply." : "Likes without replies — classic engagement pod or bot-liker pattern.",
                            color: "#8b5cf6"
                          },
                          {
                            label: "Activity Pattern",
                            score: trustResult.breakdown.activity,
                            meaning: trustResult.breakdown.activity >= 80 ? "Consistent long-term posting — established, real account." : trustResult.breakdown.activity >= 50 ? "Moderate activity — posting is irregular but present." : "Irregular or suspicious activity patterns detected.",
                            color: "#f59e0b"
                          },
                          {
                            label: "Verification",
                            score: trustResult.breakdown.verification,
                            meaning: trustResult.breakdown.verification >= 80 ? "Verified account — carries weight but doesn't override other signals." : "Unverified account — no X verification trust boost.",
                            color: "#ec4899"
                          },
                        ].map(s => (
                          <div key={s.label} style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                              <span style={{ fontSize: 11, color: s.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</span>
                              <span style={{ fontSize: 11, color: s.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>{s.score}/100</span>
                            </div>
                            <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{s.meaning}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Risk assessment */}
                    <div style={{ marginTop: 18, padding: "16px 18px", background: trustResult.trustScore >= 70 ? "rgba(16, 185, 129, 0.06)" : trustResult.trustScore >= 40 ? "rgba(245, 158, 11, 0.06)" : "rgba(239, 68, 68, 0.06)", borderRadius: 10, border: `1px solid ${trustResult.trustScore >= 70 ? "rgba(16, 185, 129, 0.2)" : trustResult.trustScore >= 40 ? "rgba(245, 158, 11, 0.2)" : "rgba(239, 68, 68, 0.2)"}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 18 }}>
                          {trustResult.trustScore >= 85 ? "🏆" : trustResult.trustScore >= 70 ? "✅" : trustResult.trustScore >= 55 ? "📊" : trustResult.trustScore >= 40 ? "⚠️" : "🚫"}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: trustResult.labelColor, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>
                          {trustResult.trustScore >= 85 ? "Premium Buy Recommendation" : trustResult.trustScore >= 70 ? "Safe to Buy" : trustResult.trustScore >= 55 ? "Proceed with Verification" : trustResult.trustScore >= 40 ? "High Risk — Verify Before Buying" : "Do Not Buy"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6 }}>
                        {trustResult.trustScore >= 85 && "All authenticity signals check out. Low bot follower estimate. Strong engagement patterns. Ideal account to acquire or trust."}
                        {trustResult.trustScore >= 70 && trustResult.trustScore < 85 && "Most signals look healthy. Double-check the weakest signal below, but this is generally a solid account worth the asking price."}
                        {trustResult.trustScore >= 55 && trustResult.trustScore < 70 && "Mixed signals. We recommend running Deep Forensics (CIB tab) for a full tweet-level analysis before purchasing. Negotiate if price seems high."}
                        {trustResult.trustScore >= 40 && trustResult.trustScore < 55 && "Multiple authenticity concerns. Only purchase if you've independently verified the account's real audience. Price should reflect the risk."}
                        {trustResult.trustScore < 40 && "This account shows strong signs of manipulation or bot inflation. The follower count is likely misleading. Avoid purchasing or heavily discount the valuation."}
                      </div>
                    </div>

                    {/* Next steps CTAs */}
                    <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <button onClick={() => setTab("cib")} style={{
                        padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)",
                        background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(212, 255, 0, 0.3)"; e.currentTarget.style.color = C.primary; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)"; e.currentTarget.style.color = C.textSecondary; }}
                      >🔬 Run Deep Forensics</button>
                      <button onClick={() => setTab("trust")} style={{
                        padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)",
                        background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(212, 255, 0, 0.3)"; e.currentTarget.style.color = C.primary; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)"; e.currentTarget.style.color = C.textSecondary; }}
                      >📖 Learn More</button>
                    </div>
                  </GlowCard>
                )}

                {/* Historical Tracking Chart */}
                {historyData && (
                  <GlowCard style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>📈 Account Timeline</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>90-day historical tracking · snapshots captured daily</div>
                      </div>
                      <Pill text="TRACKED 90d" color={C.primary} />
                    </div>

                    <div style={{ height: 180, marginTop: 10 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={historyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="followerGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={C.primary} stopOpacity={0.4} />
                              <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="day" stroke="#6b5a85" fontSize={10} tickFormatter={d => `${90 - d}d ago`} interval={15} />
                          <YAxis stroke="#6b5a85" fontSize={10} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
                          <Tooltip
                            contentStyle={{ background: "rgba(12, 5, 21, 0.95)", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
                            labelFormatter={v => `${90 - v} days ago`}
                            formatter={(v, name) => [v.toLocaleString(), "Followers"]}
                          />
                          <Area type="monotone" dataKey="followers" stroke={C.primary} strokeWidth={2} fill="url(#followerGrad)" />
                          {historyData.filter(p => p.anomaly).map((p, i) => (
                            <ReferenceDot key={i} x={p.day} y={p.followers} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {historyData.some(p => p.anomaly) && (
                      <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 14 }}>⚠️</span>
                        <span style={{ fontSize: 12, color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace" }}>Anomaly detected: Sudden follower spike on day {90 - historyData.find(p => p.anomaly).day}</span>
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
                      {[
                        ["90d Growth", `+${Math.round(((historyData[89].followers - historyData[0].followers) / historyData[0].followers) * 100)}%`],
                        ["Volatility", historyData.some(p => p.anomaly) ? "HIGH" : "LOW"],
                        ["Integrity", historyData.some(p => p.anomaly) ? "⚠ Flagged" : "✅ Clean"],
                      ].map(([label, val]) => (
                        <div key={label} style={{ padding: "8px 10px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center" }}>
                          <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </GlowCard>
                )}

                <GlowCard>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Score Breakdown</div>
                  <ScoreBar label="Followers" score={result.breakdown.followers} color={C.primary} />
                  <ScoreBar label="Engagement" score={result.breakdown.engagement} color={C.accent} />
                  <ScoreBar label="Account Age" score={result.breakdown.accountAge} color="#c084fc" />
                  <ScoreBar label="Tweet Volume" score={result.breakdown.tweetVolume} color={C.accentWarm} />
                  <ScoreBar label="Verification" score={result.breakdown.verification} color="#e879f9" />
                  <ScoreBar label="CT Niche" score={result.breakdown.nicheRelevance} color="#fb923c" />

                  <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(212, 255, 0, 0.05)", borderRadius: 10, border: "1px solid rgba(212, 255, 0, 0.12)" }}>
                    <div style={{ fontSize: 12, color: C.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>💡 Want to sell this account?</div>
                    <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 4 }}>List it on the marketplace tab to find buyers. Escrow protection included.</div>
                  </div>
                </GlowCard>
              </div>
            )}
          </div>
        )}

        {/* ─── TRUST SCORE TAB ─────────────────────────────── */}
        {tab === "trust" && (
          <div>
            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.2)", marginBottom: 20 }}>
                <span style={{ fontSize: 12 }}>🛡️</span>
                <span style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>The Trust Score</span>
              </div>
              <h1 style={{ fontSize: 48, fontWeight: 900, margin: 0, letterSpacing: -2, lineHeight: 1.1 }}>
                Don't buy <span style={{ color: C.primary }}>bot-inflated</span><br />garbage accounts.
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 17, marginTop: 16, maxWidth: 560, margin: "16px auto 0", lineHeight: 1.5 }}>
                Every CT account gets scored 0-100 on authenticity. We catch bot followers, engagement pods, F4F rings, and fake activity — before you get scammed.
              </p>
            </div>

            {/* Tier System */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8, textAlign: "center" }}>Score Tiers</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, textAlign: "center", marginBottom: 24 }}>From trash to <span style={{ color: C.primary }}>supreme.</span></h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { range: "85-100", label: "SUPREME", color: "#10b981", icon: "👑", desc: "Legit, established, zero red flags. Premium tier." },
                  { range: "70-84", label: "CREDIBLE", color: "#34d399", icon: "✅", desc: "Solid authenticity signals. Safe buy." },
                  { range: "55-69", label: "NOTED", color: "#fbbf24", icon: "📊", desc: "Decent account. Some signals worth verifying." },
                  { range: "40-54", label: "UNKNOWN", color: "#f97316", icon: "❓", desc: "Mixed signals. Proceed with caution and verify." },
                  { range: "25-39", label: "SUSPICIOUS", color: "#ef4444", icon: "⚠️", desc: "Multiple red flags detected. High risk." },
                  { range: "0-24", label: "LIKELY BOT", color: "#dc2626", icon: "🚫", desc: "Heavy bot signals. Do not buy." },
                ].map(tier => (
                  <div key={tier.label} style={{
                    padding: "16px 20px", borderRadius: 12,
                    background: `${tier.color}06`,
                    border: `1px solid ${tier.color}25`,
                    display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                  }}>
                    <div style={{ fontSize: 28 }}>{tier.icon}</div>
                    <div style={{
                      padding: "6px 12px", borderRadius: 8,
                      background: `${tier.color}15`, border: `1px solid ${tier.color}40`,
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800,
                      color: tier.color, letterSpacing: 1.5, minWidth: 110, textAlign: "center",
                    }}>{tier.label}</div>
                    <div style={{ fontSize: 13, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", minWidth: 70 }}>{tier.range}</div>
                    <div style={{ fontSize: 13, color: C.textSecondary, flex: 1, minWidth: 200 }}>{tier.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Signals Explained */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8, textAlign: "center" }}>The 5 Signals</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, textAlign: "center", marginBottom: 24 }}>What we <span style={{ color: C.primary }}>actually measure.</span></h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                {[
                  {
                    icon: "⚖️", title: "Follow Ratio", weight: "20%",
                    desc: "Real accounts have way more followers than they follow. Accounts following thousands with low follower counts are flagged as F4F (follow-for-follow) patterns.",
                    flag: "🚩 Red flag: following > followers"
                  },
                  {
                    icon: "💬", title: "Engagement Quality", weight: "30%",
                    desc: "Bot-inflated accounts have massive follower counts but tiny engagement. This is the single biggest tell. We compare total engagement to follower count to catch fakes.",
                    flag: "🚩 Red flag: <0.1% engagement rate"
                  },
                  {
                    icon: "🗣️", title: "Conversations", weight: "15%",
                    desc: "Real audiences reply. Bots and engagement pods only drop likes. We measure the ratio of replies to likes — genuine accounts have meaningful conversations.",
                    flag: "🚩 Red flag: likes but no replies"
                  },
                  {
                    icon: "📈", title: "Activity Pattern", weight: "15%",
                    desc: "Brand new accounts with huge followings are suspicious — you can't grow 50k followers in a month organically. We flag rapid growth and bot-like posting frequencies.",
                    flag: "🚩 Red flag: new account + big followers"
                  },
                  {
                    icon: "✓", title: "Verification", weight: "10%",
                    desc: "X verification (legacy blue, gold, or paid) is a trust boost but doesn't override other signals. A verified bot account is still a bot account.",
                    flag: "✅ Bonus: verified status"
                  },
                  {
                    icon: "🤖", title: "Bot Detection", weight: "10%",
                    desc: "We estimate what % of followers are likely bots based on engagement gap and follow patterns. Accounts with >30% estimated bots are flagged.",
                    flag: "🚩 Red flag: >30% bot estimate"
                  },
                ].map(signal => (
                  <GlowCard key={signal.title} glow style={{ padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ fontSize: 28 }}>{signal.icon}</div>
                      <Pill text={`${signal.weight} weight`} color={C.primary} />
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, letterSpacing: -0.3 }}>{signal.title}</div>
                    <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>{signal.desc}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", padding: "8px 10px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 6, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      {signal.flag}
                    </div>
                  </GlowCard>
                ))}
              </div>
            </div>

            {/* How to use it */}
            <GlowCard style={{ marginBottom: 40, padding: "32px" }}>
              <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>For Buyers</div>
              <h3 style={{ fontSize: 22, fontWeight: 900, marginBottom: 16, marginTop: 0, letterSpacing: -0.5 }}>How to read a Trust Score</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { rule: "Never buy anything below 40. Full stop.", color: "#ef4444" },
                  { rule: "40-55 range? Run Deep Forensics on it first (CIB tab) to see the full picture.", color: "#f97316" },
                  { rule: "Check the 'Why This Score?' section — specific flags tell you WHY the number is what it is.", color: "#fbbf24" },
                  { rule: "A 70+ with green flags for 'Healthy organic engagement' and 'Strong conversation ratio' is a solid buy.", color: "#10b981" },
                  { rule: "Always check the 90-day timeline. Anomaly spikes = purchased followers. Clean lines = organic growth.", color: C.primary },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: `${item.color}15`, border: `1px solid ${item.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: item.color, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, paddingTop: 2 }}>{item.rule}</div>
                  </div>
                ))}
              </div>
            </GlowCard>

            {/* For Sellers */}
            <GlowCard style={{ marginBottom: 40, padding: "32px" }}>
              <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>For Sellers</div>
              <h3 style={{ fontSize: 22, fontWeight: 900, marginBottom: 16, marginTop: 0, letterSpacing: -0.5 }}>Boost your score before listing</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  "Stop buying followers. It tanks your engagement rate and flags anomalies in the 90-day timeline.",
                  "Engage genuinely — reply to comments, quote tweets, join conversations. Conversations signal is weighted 15%.",
                  "Post consistently for 3+ months. Activity Pattern rewards long-term organic growth.",
                  "Clean your follower list — remove obvious bot accounts. Lower bot % = higher trust score.",
                  "Get vouched by other SUPREME accounts to compound your trust over time.",
                ].map((rule, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ color: C.primary, fontSize: 18, fontWeight: 900, flexShrink: 0, lineHeight: 1.5 }}>→</div>
                    <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>{rule}</div>
                  </div>
                ))}
              </div>
            </GlowCard>

            {/* Anti-gaming */}
            <GlowCard glow style={{ marginBottom: 40, padding: "28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 28 }}>🔒</div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>Can the score be gamed?</div>
              </div>
              <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>
                Hard to. Here's why HandleMarket's scoring system holds up where others don't:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                {[
                  { title: "Historical Tracking", desc: "Scores look at 90 days of data. Can't retroactively fake your history." },
                  { title: "Multi-Signal Weighting", desc: "Gaming one signal (buying blue check) doesn't move the needle much." },
                  { title: "Cluster Detection", desc: "Even if you pass individual checks, we catch pod/network membership." },
                  { title: "Refresh Delay", desc: "Scores cache for 24h so last-minute score manipulation doesn't work." },
                ].map(item => (
                  <div key={item.title} style={{ padding: "12px 14px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.primary, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </GlowCard>

            {/* CTA */}
            <GlowCard glow style={{ textAlign: "center", padding: "40px 32px", background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), rgba(0, 0, 0, 0.5))` }}>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, marginBottom: 12 }}>
                Check any <span style={{ color: C.primary }}>CT account's</span> trust score.
              </div>
              <div style={{ fontSize: 14, color: C.textSecondary, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
                Free. No signup. Full analysis in 10 seconds.
              </div>
              <button
                onClick={() => setTab("valuate")}
                style={{
                  padding: "14px 32px", borderRadius: 12, border: "none",
                  background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                  color: "#000", fontSize: 14, fontWeight: 900,
                  fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                  letterSpacing: 0.3, transition: "all 0.2s",
                  boxShadow: "0 0 32px rgba(212, 255, 0, 0.25)",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(212, 255, 0, 0.4)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(212, 255, 0, 0.25)"; }}
              >🛡️ Run Trust Analysis</button>
            </GlowCard>
          </div>
        )}

        {tab === "marketplace" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>
                CT Account <span style={{ color: C.primary }}>Marketplace</span>
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Buy and sell verified Crypto Twitter accounts with escrow protection</p>

              {/* Hero CTA — List Your Account */}
              <button
                onClick={() => setShowListForm(true)}
                style={{
                  marginTop: 20, padding: "14px 32px", borderRadius: 12, border: "none",
                  background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                  color: "#000", fontSize: 15, fontWeight: 800,
                  fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                  letterSpacing: 0.3, transition: "all 0.2s",
                  boxShadow: "0 0 24px rgba(212, 255, 0, 0.2)",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(212, 255, 0, 0.35)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 24px rgba(212, 255, 0, 0.2)"; }}
              >
                + List Your Account
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap", justifyContent: "center" }}>
              <div style={{ display: "flex", gap: 4, background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, padding: 3, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                {[["all", "All"], ["defi", "DeFi"], ["solana", "Solana"], ["nft", "NFTs"], ["memecoin", "Memecoins"]].map(([val, label]) => (
                  <button key={val} onClick={() => setFilterNiche(val)} style={{
                    padding: "6px 14px", borderRadius: 7, border: "none",
                    background: filterNiche === val ? "rgba(212, 255, 0, 0.12)" : "transparent",
                    color: filterNiche === val ? C.primary : C.textMuted,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5,
                  }}>{label}</button>
                ))}
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
                padding: "6px 14px", borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.06)",
                background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: "pointer",
              }}>
                <option value="value">Sort: Value ↓</option>
                <option value="followers">Sort: Followers ↓</option>
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {sortedListings.map(listing => (
                <GlowCard key={listing.id} glow={listing.status === "listed"} style={{ position: "relative" }} onClick={() => {}}>
                  {listing.status === "sold" && (
                    <div style={{ position: "absolute", top: 16, right: 16 }}><Pill text="SOLD" color="#ef4444" /></div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: `linear-gradient(135deg, hsl(0, 0%, ${25 + listing.id * 4}%), hsl(0, 0%, ${12 + listing.id * 2}%))`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, fontWeight: 800, color: "white",
                    }}>
                      {listing.handle[1].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: -0.3 }}>{listing.handle}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{listing.niche}</div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                    {[["Followers", listing.followers.toLocaleString()], ["Engagement", listing.engagement], ["Age", listing.age]].map(([label, val]) => (
                      <div key={label} style={{ padding: "8px 10px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, marginTop: 2 }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Trust Score Bar */}
                  {listing.trustScore && (() => {
                    const tColor = listing.trustScore >= 85 ? "#10b981" : listing.trustScore >= 70 ? "#34d399" : listing.trustScore >= 55 ? "#fbbf24" : listing.trustScore >= 40 ? "#f97316" : "#ef4444";
                    return (
                      <div style={{ padding: "10px 12px", background: `${tColor}08`, border: `1px solid ${tColor}25`, borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>🛡️ Trust Score</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 9, color: tColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, letterSpacing: 1 }}>{listing.trustLabel}</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: tColor, fontFamily: "'JetBrains Mono', monospace" }}>{listing.trustScore}</span>
                          </div>
                        </div>
                        <div style={{ height: 4, background: "rgba(0, 0, 0, 0.5)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${listing.trustScore}%`, background: `linear-gradient(90deg, ${tColor}, ${tColor}cc)` }} />
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Asking Price</div>
                      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: C.primary }}>${listing.value.toLocaleString()}</div>
                    </div>
                    {listing.status === "listed" && (
                      <button onClick={(e) => { e.stopPropagation(); setSelectedListing(listing); }} style={{
                        padding: "10px 20px", borderRadius: 10, border: `1px solid rgba(212, 255, 0, 0.25)`,
                        background: "rgba(255, 255, 255, 0.05)", color: C.primary,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
                        cursor: "pointer", transition: "all 0.2s",
                      }}
                        onMouseEnter={e => { e.target.style.background = "rgba(212, 255, 0, 0.12)"; }}
                        onMouseLeave={e => { e.target.style.background = "rgba(255, 255, 255, 0.05)"; }}
                      >View Details →</button>
                    )}
                  </div>

                  {listing.verified && (
                    <div style={{ position: "absolute", top: 16, right: listing.status === "sold" ? 76 : 16 }}>
                      <Pill text="✓ Verified" color={C.accent} />
                    </div>
                  )}
                </GlowCard>
              ))}
            </div>

            <GlowCard glow style={{ textAlign: "center", marginTop: 32 }}>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Ready to sell your CT account?</div>
              <div style={{ color: C.textSecondary, fontSize: 14, marginBottom: 20 }}>Get a free valuation first, then list it on the marketplace with escrow protection</div>
              <button onClick={() => setTab("valuate")} style={{
                padding: "12px 32px", borderRadius: 12, border: "none",
                background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                color: "#000", fontSize: 14, fontWeight: 800,
                fontFamily: "'Outfit', sans-serif", cursor: "pointer",
              }}>⚡ Get Your Valuation</button>
            </GlowCard>
          </div>
        )}

        {/* LEADERBOARD TAB */}
        {tab === "leaderboard" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>
                CT <span style={{ color: C.primary }}>Leaderboards</span>
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Real-time rankings across Crypto Twitter · Updated hourly</p>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
              <div style={{ display: "flex", gap: 4, background: "rgba(0, 0, 0, 0.5)", borderRadius: 12, padding: 4, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                {[
                  ["trending", "🔥 Trending", C.accent],
                  ["rising", "🚀 Rising", "#10b981"],
                  ["suspicious", "🚩 Suspicious", "#ef4444"],
                ].map(([val, label, clr]) => (
                  <button key={val} onClick={() => setLeaderboardTab(val)} style={{
                    padding: "8px 18px", borderRadius: 8, border: "none",
                    background: leaderboardTab === val ? `${clr}15` : "transparent",
                    color: leaderboardTab === val ? clr : C.textMuted,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
                    cursor: "pointer", textTransform: "uppercase", letterSpacing: 1, transition: "all 0.2s",
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {/* Leaderboard context banner */}
            <GlowCard style={{ marginBottom: 20, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 24 }}>
                  {leaderboardTab === "trending" && "🔥"}
                  {leaderboardTab === "rising" && "🚀"}
                  {leaderboardTab === "suspicious" && "🚩"}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {leaderboardTab === "trending" && "Trending This Week"}
                    {leaderboardTab === "rising" && "Rising Stars"}
                    {leaderboardTab === "suspicious" && "Suspicious Accounts"}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>
                    {leaderboardTab === "trending" && "Top CT accounts ranked by 7-day Trust Score momentum"}
                    {leaderboardTab === "rising" && "Newly detected accounts with accelerating growth & clean signals"}
                    {leaderboardTab === "suspicious" && "Accounts flagged by our detection systems — buyer beware"}
                  </div>
                </div>
              </div>
            </GlowCard>

            {/* Leaderboard table */}
            <GlowCard style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 80px 100px 120px 80px", gap: 0, padding: "12px 20px", background: "rgba(255, 255, 255, 0.02)", borderBottom: `1px solid ${C.border}` }}>
                {["#", "Account", "Change", "Followers", "Niche", "Score"].map(h => (
                  <div key={h} style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{h}</div>
                ))}
              </div>
              {LEADERBOARD_DATA[leaderboardTab].map((row, i) => {
                const scoreColor = row.score >= 85 ? "#10b981" : row.score >= 70 ? "#34d399" : row.score >= 55 ? "#fbbf24" : row.score >= 40 ? "#f97316" : "#ef4444";
                const changeColor = row.change.startsWith("+") ? "#10b981" : row.change.startsWith("−") ? "#ef4444" : row.change === "NEW" ? C.primary : row.change === "🚩" ? "#ef4444" : C.textMuted;
                return (
                  <div key={row.handle} style={{
                    display: "grid", gridTemplateColumns: "50px 1fr 80px 100px 120px 80px", gap: 0,
                    padding: "14px 20px", alignItems: "center",
                    borderBottom: i === LEADERBOARD_DATA[leaderboardTab].length - 1 ? "none" : "1px solid rgba(212, 255, 0, 0.05)",
                    transition: "background 0.2s", cursor: "pointer",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ fontSize: 16, fontWeight: 800, color: row.rank <= 3 ? C.accent : C.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
                      {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `#${row.rank}`}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{row.handle}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>growth: {row.growth}</div>
                    </div>
                    <div style={{ fontSize: 12, color: changeColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{row.change}</div>
                    <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{row.followers.toLocaleString()}</div>
                    <div><Pill text={row.niche} color={C.primary} /></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${scoreColor}20`, border: `1px solid ${scoreColor}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: scoreColor, fontFamily: "'JetBrains Mono', monospace" }}>
                        {row.score}
                      </div>
                    </div>
                  </div>
                );
              })}
            </GlowCard>

            <div style={{ textAlign: "center", marginTop: 24 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                Rankings update hourly · Only tracked accounts are eligible · Detection systems flag coordinated behavior
              </div>
            </div>
          </div>
        )}

        {/* PROFILE TAB — sample public profile page */}
        {tab === "profile" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>
                Public <span style={{ color: C.primary }}>Profile</span>
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Every CT account gets a shareable profile at handlemarket.com/@username</p>
            </div>

            {/* Sample profile card */}
            <GlowCard glow style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
                <div style={{
                  width: 72, height: 72, borderRadius: 16,
                  background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, fontWeight: 900, color: "#000",
                  flexShrink: 0,
                }}>F</div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Fabs Kebabs</div>
                    <Pill text="✓ Verified" color={C.accent} />
                    <Pill text="SUPREME 91" color="#10b981" />
                  </div>
                  <div style={{ fontSize: 14, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>@FabsKebabs101</div>
                  <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 8, lineHeight: 1.5 }}>Solana memecoin trader · Building on-chain · CT degen · Based in 🇦🇺</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                    <Pill text="🔥 Tracked 127d" color={C.primary} />
                    <Pill text="⚡ Solana" color={C.accent} />
                    <Pill text="🛡 Clean History" color="#10b981" />
                  </div>
                </div>
              </div>

              {/* Profile stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
                {[
                  ["Trust Score", "91", "#10b981"],
                  ["Est. Value", "$4,200", C.accent],
                  ["Followers", "18.4k", C.textPrimary],
                  ["Engagement", "3.8%", C.primary],
                  ["Bot Est.", "8%", "#10b981"],
                  ["Vouches", "14", C.accentLight],
                ].map(([label, val, clr]) => (
                  <div key={label} style={{ padding: "12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: clr, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Mini timeline */}
              <div style={{ height: 100 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={generateHistory(18400, 91, 90)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="profileGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="followers" stroke="#10b981" strokeWidth={2} fill="url(#profileGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlowCard>

            {/* Share Card Section */}
            <GlowCard style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>🖼️ Share Card</div>
              <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 20 }}>Flex your score on X — auto-generated preview card that gets attached when you share your profile link.</div>

              {/* Big Share Card Preview */}
              <div style={{
                position: "relative",
                borderRadius: 16,
                overflow: "hidden",
                background: `linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%)`,
                border: "1px solid rgba(255, 255, 255, 0.15)",
                padding: 0,
                marginBottom: 16,
              }}>
                {/* Ambient glows */}
                <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${C.primary}30 0%, transparent 70%)`, pointerEvents: "none" }} />
                <div style={{ position: "absolute", bottom: -40, left: -40, width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle, ${C.accent}25 0%, transparent 70%)`, pointerEvents: "none" }} />

                {/* Card content */}
                <div style={{ position: "relative", padding: "28px 28px 24px" }}>
                  {/* Top row — logo + branding */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#000" }}>HM</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: -0.3 }}>HandleMarket</div>
                        <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1.5, textTransform: "uppercase" }}>Verified CT Account</div>
                      </div>
                    </div>
                    <div style={{
                      padding: "6px 12px", borderRadius: 8,
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid rgba(16, 185, 129, 0.4)",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10, fontWeight: 800,
                      color: "#10b981",
                      letterSpacing: 1.5,
                    }}>✓ SUPREME</div>
                  </div>

                  {/* Profile Row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                    <div style={{
                      width: 72, height: 72, borderRadius: 18,
                      background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 32, fontWeight: 800, color: "#fff",
                      border: "3px solid rgba(255, 255, 255, 0.1)",
                      flexShrink: 0,
                    }}>F</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>Fabs Kebabs</span>
                        <span style={{ fontSize: 14, color: C.accent }}>✓</span>
                      </div>
                      <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>@FabsKebabs101</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 12, background: `${C.accent}20`, color: C.accent, fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.5 }}>Solana</span>
                        <span style={{ padding: "2px 8px", borderRadius: 12, background: `${C.primary}20`, color: C.primary, fontSize: 9, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.5 }}>CT Native</span>
                      </div>
                    </div>
                  </div>

                  {/* Big Numbers Row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                    <div style={{
                      padding: "16px 14px",
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      borderRadius: 12,
                    }}>
                      <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>🛡️ Trust Score</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span style={{ fontSize: 34, fontWeight: 900, color: "#10b981", letterSpacing: -1, fontFamily: "'JetBrains Mono', monospace" }}>91</span>
                        <span style={{ fontSize: 13, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>/100</span>
                      </div>
                    </div>
                    <div style={{
                      padding: "16px 14px",
                      background: `linear-gradient(135deg, ${C.primary}15, ${C.accent}15)`,
                      border: `1px solid ${C.primary}30`,
                      borderRadius: 12,
                    }}>
                      <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>💰 Est. Value</div>
                      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, color: C.primary, fontFamily: "'JetBrains Mono', monospace" }}>$4,200</div>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
                    {[
                      ["Followers", "18.4k"],
                      ["Engagement", "3.8%"],
                      ["Bot Est.", "8%"],
                      ["Vouches", "14"],
                    ].map(([label, val]) => (
                      <div key={label} style={{ padding: "8px 6px", background: "rgba(0, 0, 0, 0.25)", borderRadius: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 8, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Footer URL */}
                  <div style={{
                    paddingTop: 14,
                    borderTop: "1px solid rgba(212, 255, 0, 0.12)",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>handlemarket.com/@FabsKebabs101</div>
                    <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Verify Yours →</div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button style={{
                  flex: 1, minWidth: 140,
                  padding: "12px 20px", borderRadius: 10, border: "none",
                  background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                  color: "#000", fontSize: 13, fontWeight: 800,
                  fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                  transition: "all 0.2s",
                }}
                  onMouseEnter={e => e.target.style.transform = "translateY(-1px)"}
                  onMouseLeave={e => e.target.style.transform = "translateY(0)"}
                >🐦 Share to X</button>
                <button style={{
                  padding: "12px 20px", borderRadius: 10, border: `1px solid ${C.primary}40`,
                  background: `${C.primary}15`, color: C.primary,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>📷 Download PNG</button>
                <button style={{
                  padding: "12px 20px", borderRadius: 10, border: `1px solid ${C.accent}40`,
                  background: `${C.accent}15`, color: C.accent,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>🔗 Copy Link</button>
              </div>

              <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: 8, fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
                ℹ️ Share card is served as an OG image — when you paste your handlemarket.com/@handle link on X, this card auto-attaches as the preview.
              </div>
            </GlowCard>

            {/* Vouches preview */}
            <GlowCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>🤝 Vouches</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>14 CT accounts have vouched for this handle</div>
                </div>
                <Pill text="Coming soon" color={C.textMuted} />
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["@CryptoAlpha_", "@0xTrenchKing", "@DegenHQ", "@SOL_Trader99", "@OnChainMax", "+9 more"].map(h => (
                  <div key={h} style={{
                    padding: "8px 12px", background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8,
                    fontSize: 12, color: C.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                  }}>{h}</div>
                ))}
              </div>
            </GlowCard>
          </div>
        )}

        {/* ─── PHASE 2: SALES HISTORY TAB ───────────────────── */}
        {tab === "history" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>
                Sale <span style={{ color: C.primary }}>History</span>
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Public transaction ledger · Every sale verified via escrow</p>
            </div>

            {/* Market stats bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 24 }}>
              {[
                ["Total Volume", "$847.2k", C.primary],
                ["Sales (30d)", "182", C.accent],
                ["Avg Sale", "$2,840", "#10b981"],
                ["Median Markup", "+18%", C.accentLight],
              ].map(([label, val, clr]) => (
                <GlowCard key={label} style={{ padding: "16px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: clr, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{val}</div>
                </GlowCard>
              ))}
            </div>

            {/* Sales table */}
            <GlowCard style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Recent Sales</div>
                <Pill text="LIVE" color="#10b981" />
              </div>
              {SALE_HISTORY.map((sale, i) => (
                <div key={sale.id} style={{
                  padding: "16px 20px",
                  borderBottom: i === SALE_HISTORY.length - 1 ? "none" : "1px solid rgba(212, 255, 0, 0.05)",
                  display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
                  transition: "background 0.2s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{sale.handle}</span>
                      <Pill text={`Trust ${sale.trustScore}`} color={sale.trustScore >= 85 ? "#10b981" : sale.trustScore >= 70 ? "#34d399" : "#fbbf24"} />
                      <span style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{sale.followers.toLocaleString()} followers</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
                      {sale.seller} → {sale.buyer} · {sale.soldAgo}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.primary, fontFamily: "'JetBrains Mono', monospace" }}>
                      ${sale.price.toLocaleString()}
                    </div>
                    {sale.prevPrice && (
                      <div style={{ fontSize: 10, color: sale.price > sale.prevPrice ? "#10b981" : "#ef4444", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                        {sale.price > sale.prevPrice ? "▲" : "▼"} prev ${sale.prevPrice.toLocaleString()} ({((sale.price - sale.prevPrice) / sale.prevPrice * 100).toFixed(0)}%)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </GlowCard>

            {/* Top Sellers leaderboard */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>🏅 Top Sellers</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              {TOP_SELLERS.map((seller, i) => (
                <GlowCard key={seller.handle} glow style={{ position: "relative" }}>
                  {i === 0 && <div style={{ position: "absolute", top: 14, right: 14 }}><Pill text="🥇 #1 SELLER" color="#fbbf24" /></div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#000" }}>{seller.handle[1].toUpperCase()}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{seller.handle}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{seller.totalSales} sales · ${(seller.totalVolume / 1000).toFixed(0)}k volume</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Seller Score</span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>{seller.score}</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                    <div style={{ padding: "6px 8px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 6, textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>DISPUTE RATE</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: seller.disputeRate === "0%" ? "#10b981" : C.accentLight, fontFamily: "'JetBrains Mono', monospace" }}>{seller.disputeRate}</div>
                    </div>
                    <div style={{ padding: "6px 8px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 6, textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>AVG TRANSFER</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{seller.avgTime}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {seller.badges.map(b => (
                      <span key={b} style={{
                        padding: "3px 8px", borderRadius: 12, fontSize: 9, fontWeight: 700,
                        fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8,
                        background: b === "pro" ? `${C.primary}20` : b === "fast" ? `${C.accent}20` : "rgba(16, 185, 129, 0.15)",
                        color: b === "pro" ? C.primary : b === "fast" ? C.accent : "#10b981",
                        border: `1px solid ${b === "pro" ? C.primary + "40" : b === "fast" ? C.accent + "40" : "rgba(16, 185, 129, 0.3)"}`,
                      }}>
                        {b === "pro" ? "PRO" : b === "fast" ? "⚡ FAST" : "✓ CLEAN"}
                      </span>
                    ))}
                  </div>
                </GlowCard>
              ))}
            </div>
          </div>
        )}

        {/* ─── PHASE 3: WALLET BINDING TAB ──────────────────── */}
        {tab === "wallet" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>
                Wallet <span style={{ color: C.primary }}>Reputation</span>
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>On-chain proof-of-existence · Real wallets, real history, real trust</p>
            </div>

            {/* Bound wallet hero */}
            <GlowCard glow style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg, #9945FF, #14F195)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#fff" }}>◎</div>
                  <div>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 2 }}>Bound Wallet</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{WALLET_DATA.address}</div>
                    <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>Solana · Verified via signature</div>
                  </div>
                </div>
                <div style={{ textAlign: "center", padding: "10px 18px", background: `linear-gradient(135deg, ${C.primary}15, ${C.accent}15)`, border: `1px solid ${C.primary}40`, borderRadius: 12 }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>On-Chain Score</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: C.primary, fontFamily: "'JetBrains Mono', monospace" }}>{WALLET_DATA.onChainScore}</div>
                </div>
              </div>

              {/* Wallet stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
                {[
                  ["Wallet Age", `${(WALLET_DATA.walletAgeDays / 365).toFixed(1)}y`, C.primary],
                  ["Txn Count", WALLET_DATA.totalTxns.toLocaleString(), C.accent],
                  ["Protocols", WALLET_DATA.protocols.length, "#10b981"],
                  ["Holdings", `$${(WALLET_DATA.holdings.reduce((s, h) => s + h.value, 0) / 1000).toFixed(1)}k`, C.accentLight],
                ].map(([label, val, clr]) => (
                  <div key={label} style={{ padding: "12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: clr, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{val}</div>
                  </div>
                ))}
              </div>
            </GlowCard>

            {/* Holdings */}
            <GlowCard style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>💎 Diamond Hands Holdings</div>
              {WALLET_DATA.holdings.map((h, i) => (
                <div key={h.symbol} style={{
                  display: "grid", gridTemplateColumns: "40px 1fr auto auto", gap: 12, alignItems: "center",
                  padding: "10px 0",
                  borderBottom: i === WALLET_DATA.holdings.length - 1 ? "none" : "1px solid rgba(255, 255, 255, 0.03)",
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}30, ${C.accent}30)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>{h.symbol}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{h.amount} {h.symbol}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>Held {h.held}</div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>${h.value.toLocaleString()}</div>
                  <Pill text="💎 HODLER" color="#10b981" />
                </div>
              ))}
            </GlowCard>

            {/* Notable activity */}
            <GlowCard style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>🏆 On-Chain Notable Activity</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {WALLET_DATA.notableActivity.map((act, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, border: `1px solid ${act.signal === "diamond" ? "rgba(16, 185, 129, 0.2)" : "rgba(212, 255, 0, 0.12)"}` }}>
                    <span style={{ fontSize: 20 }}>{act.signal === "diamond" ? "💎" : "🏅"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{act.event}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{act.date}</div>
                    </div>
                    <Pill text={act.signal === "diamond" ? "DIAMOND HANDS" : "OG"} color={act.signal === "diamond" ? "#10b981" : C.accent} />
                  </div>
                ))}
              </div>
            </GlowCard>

            {/* Protocols used */}
            <GlowCard style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>🔗 Active Protocols</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {WALLET_DATA.protocols.map(p => (
                  <div key={p} style={{
                    padding: "8px 14px", background: `linear-gradient(135deg, ${C.primary}12, ${C.accent}12)`,
                    border: `1px solid ${C.primary}30`, borderRadius: 10,
                    fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace",
                  }}>{p}</div>
                ))}
              </div>
            </GlowCard>

            {/* Vouches — Web of Trust */}
            <GlowCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>🤝 Web of Trust · Vouches</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Vouches weighted by voucher's own Trust Score</div>
                </div>
                <button style={{
                  padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.primary}40`,
                  background: `${C.primary}15`, color: C.primary,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>+ Vouch</button>
              </div>

              {VOUCHES.map((v, i) => (
                <div key={v.handle} style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
                  padding: "12px 0",
                  borderBottom: i === VOUCHES.length - 1 ? "none" : "1px solid rgba(255, 255, 255, 0.03)",
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, hsl(0, 0%, ${25 + i * 5}%), hsl(0, 0%, ${12 + i * 3}%))`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>{v.handle[1].toUpperCase()}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{v.handle}</span>
                      <Pill text={`Score ${v.score}`} color={v.score >= 90 ? "#10b981" : "#34d399"} />
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>"{v.reason}" · {v.vouchedAt}</div>
                  </div>
                  <Pill text={v.weight === "high" ? "HIGH WEIGHT" : "MEDIUM"} color={v.weight === "high" ? C.accent : C.textMuted} />
                </div>
              ))}

              <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(255, 255, 255, 0.03)", borderRadius: 8, fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
                ℹ️ Vouchers stake their reputation. If a vouchee is later flagged as a bot, the voucher's Trust Score decays. Mutual vouches weighted less to prevent gaming.
              </div>
            </GlowCard>
          </div>
        )}

        {/* ─── PHASE 4: CIB DETECTION TAB ──────────────────── */}
        {tab === "cib" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>
                CIB <span style={{ color: C.primary }}>Detection</span>
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Coordinated Inauthentic Behavior · Exposing engagement pods & raid networks</p>
              <Pill text="🔒 PRO FEATURE" color={C.accent} />
            </div>

            {/* Detection stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
              {[
                ["Clusters Detected", "23", "#ef4444"],
                ["Accounts Flagged", "847", C.accent],
                ["Pods This Week", "+5", C.primary],
                ["Network Coverage", "96%", "#10b981"],
              ].map(([label, val, clr]) => (
                <GlowCard key={label} style={{ padding: "14px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: clr, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{val}</div>
                </GlowCard>
              ))}
            </div>

            {/* Cluster cards */}
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>🕸️ Detected Clusters</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, marginBottom: 24 }}>
              {CIB_CLUSTERS.map(c => {
                const sevColor = c.severity === "high" ? "#ef4444" : c.severity === "medium" ? "#f59e0b" : "#fbbf24";
                return (
                  <GlowCard key={c.id} glow style={{ borderColor: `${sevColor}30`, cursor: "pointer" }} onClick={() => setSelectedCluster(selectedCluster === c.id ? null : c.id)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{c.id}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{c.name}</div>
                      </div>
                      <Pill text={c.severity.toUpperCase()} color={sevColor} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <div style={{ padding: "8px 10px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>Members</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: sevColor, fontFamily: "'JetBrains Mono', monospace" }}>{c.members}</div>
                      </div>
                      <div style={{ padding: "8px 10px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>Reciprocal Eng</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: sevColor, fontFamily: "'JetBrains Mono', monospace" }}>{c.reciprocal}%</div>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, padding: "10px 12px", background: `${sevColor}08`, borderRadius: 8, border: `1px solid ${sevColor}20`, marginBottom: 10 }}>
                      📋 <strong>Pattern:</strong> {c.pattern}
                    </div>

                    {selectedCluster === c.id && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Sample Members</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {c.accounts.map(a => (
                            <span key={a} style={{ padding: "4px 10px", background: `${sevColor}15`, color: sevColor, border: `1px solid ${sevColor}30`, borderRadius: 6, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{a}</span>
                          ))}
                          <span style={{ padding: "4px 10px", color: C.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>+{c.members - c.accounts.length} more</span>
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 8 }}>Detected {c.detectedAt}</div>
                  </GlowCard>
                );
              })}
            </div>

            {/* Forensics Report Section */}
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>🔍 Deep Forensics</div>
            <GlowCard>
              {!forensicsRun ? (
                <div style={{ textAlign: "center", padding: "40px 20px" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔬</div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Run Deep Forensics Scan</div>
                  <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>Deep-scan the last 50 tweets for engagement manipulation, template replies, bot velocity patterns, and fake reply authors.</div>
                  <button onClick={() => setForensicsRun(true)} style={{
                    padding: "12px 28px", borderRadius: 10, border: "none",
                    background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                    color: "#000", fontSize: 13, fontWeight: 800,
                    fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                  }}>🔬 Run Scan · 50 API calls</button>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Forensics Report · @FabsKebabs101</div>
                    <Pill text={`${FORENSICS_REPORT.suspiciousPct}% FLAGGED`} color={FORENSICS_REPORT.suspiciousPct > 20 ? "#ef4444" : FORENSICS_REPORT.suspiciousPct > 10 ? "#f59e0b" : "#10b981"} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 20 }}>
                    {[
                      ["Tweets Analyzed", FORENSICS_REPORT.tweetsAnalyzed],
                      ["Total Replies", FORENSICS_REPORT.totalReplies.toLocaleString()],
                      ["Suspicious", FORENSICS_REPORT.suspiciousReplies],
                      ["New Account Replies", FORENSICS_REPORT.repliesFromNewAccounts],
                      ["Template Replies", FORENSICS_REPORT.repliesWithTemplates],
                      ["Velocity Anomalies", FORENSICS_REPORT.velocityAnomalies],
                    ].map(([l, v]) => (
                      <div key={l} style={{ padding: "10px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{l}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: C.textPrimary, marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Flagged Tweets</div>
                  {FORENSICS_REPORT.flaggedTweets.map((t, i) => (
                    <div key={i} style={{ padding: "12px 14px", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontSize: 13, fontStyle: "italic" }}>"{t.tweet}"</div>
                        <Pill text={`${t.suspiciousPct}%`} color="#ef4444" />
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{t.replies} replies · {t.flag}</div>
                    </div>
                  ))}
                </div>
              )}
            </GlowCard>
          </div>
        )}

        {/* ─── PHASE 4: ALERTS TAB ───────────────────────────── */}
        {tab === "alerts" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>
                Real-Time <span style={{ color: C.primary }}>Alerts</span>
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Watch any CT account · Get notified the instant something changes</p>
            </div>

            {/* Your Watchlist */}
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>👁️ Your Watchlist</div>
            <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              {WATCHLIST.map(w => (
                <GlowCard key={w.handle} style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#000" }}>{w.handle[1].toUpperCase()}</div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>{w.handle}</span>
                          <Pill text={`Trust ${w.score}`} color={w.score >= 85 ? "#10b981" : "#34d399"} />
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 3 }}>
                          {w.alerts.length} alerts active · Last: {w.lastAlert}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {w.alerts.map(a => {
                        const alert = ALERT_TYPES.find(at => at.id === a);
                        return <span key={a} style={{ padding: "4px 10px", background: "rgba(212, 255, 0, 0.08)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 6, fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace" }}>{alert?.icon} {alert?.name}</span>;
                      })}
                    </div>
                  </div>
                </GlowCard>
              ))}
              <button style={{
                padding: "14px 20px", borderRadius: 12, border: `1px dashed ${C.primary}40`,
                background: "transparent", color: C.primary,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>+ Add Account to Watchlist</button>
            </div>

            {/* Available Alert Types */}
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>🔔 Available Alert Types</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 24 }}>
              {ALERT_TYPES.map(a => (
                <GlowCard key={a.id} glow style={{ padding: "16px", opacity: a.premium ? 0.85 : 1 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontSize: 28 }}>{a.icon}</div>
                    {a.premium && <Pill text="PRO" color={C.accent} />}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{a.desc}</div>
                </GlowCard>
              ))}
            </div>

            {/* Delivery channels */}
            <GlowCard>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>📬 Delivery Channels</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                {[
                  ["📧 Email", "fabs@...", true, false],
                  ["📱 Telegram", "@FabsKebabs101", true, false],
                  ["🐦 X DM", "Not connected", false, false],
                  ["🔗 Webhook", "Custom endpoint", false, true],
                ].map(([channel, value, enabled, premium]) => (
                  <div key={channel} style={{
                    padding: "14px", borderRadius: 10,
                    background: enabled ? "rgba(16, 185, 129, 0.06)" : "rgba(0, 0, 0, 0.4)",
                    border: `1px solid ${enabled ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.08)"}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{channel}</span>
                      {premium && <Pill text="PRO" color={C.accent} />}
                      {enabled && !premium && <span style={{ fontSize: 10, color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>● ON</span>}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
                  </div>
                ))}
              </div>
            </GlowCard>
          </div>
        )}
      </div>

      {/* ─── LISTING DETAIL MODAL ───────────────────────────── */}
      {selectedListing && (() => {
        const tColor = selectedListing.trustScore >= 85 ? "#10b981" : selectedListing.trustScore >= 70 ? "#34d399" : selectedListing.trustScore >= 55 ? "#fbbf24" : "#f97316";
        // Calculate full trust analysis for this listing
        const engRate = parseFloat(selectedListing.engagement);
        const ageYears = parseInt(selectedListing.age) || 1;
        const estimatedAvgLikes = Math.round(selectedListing.followers * (engRate / 100) * 0.75);
        const estimatedReplies = Math.round(estimatedAvgLikes * 0.12);
        const estimatedRetweets = Math.round(estimatedAvgLikes * 0.18);
        const listingTrust = calculateTrustScore({
          followers: selectedListing.followers,
          following: Math.round(selectedListing.followers / 8),
          avgLikes: estimatedAvgLikes,
          avgRetweets: estimatedRetweets,
          avgReplies: estimatedReplies,
          tweets: ageYears * 365 * 0.8,
          accountAgeDays: ageYears * 365,
          verified: selectedListing.verified,
          cryptoNiche: true,
        });
        // Also calculate valuation breakdown
        const listingVal = estimateValue({
          followers: selectedListing.followers,
          avgLikes: estimatedAvgLikes,
          avgRetweets: estimatedRetweets,
          avgReplies: estimatedReplies,
          tweets: ageYears * 365 * 0.8,
          accountAgeDays: ageYears * 365,
          verified: selectedListing.verified,
          cryptoNiche: true,
        });
        return (
          <div
            onClick={() => setSelectedListing(null)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.85)",
              backdropFilter: "blur(8px)", zIndex: 100,
              display: "flex", alignItems: "flex-start", justifyContent: "center",
              padding: "40px 20px", overflowY: "auto",
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: 720, width: "100%",
                background: "rgba(10, 10, 10, 0.98)",
                border: `1px solid ${C.borderHover}`,
                borderRadius: 20, padding: 0,
                boxShadow: "0 40px 100px rgba(0, 0, 0, 0.8), 0 0 60px rgba(212, 255, 0, 0.1)",
                overflow: "hidden",
              }}
            >
              {/* Header banner */}
              <div style={{ padding: "24px 28px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), transparent)`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 14,
                    background: `linear-gradient(135deg, hsl(0, 0%, ${25 + selectedListing.id * 4}%), hsl(0, 0%, ${12 + selectedListing.id * 2}%))`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 900, color: "#fff",
                  }}>{selectedListing.handle[1].toUpperCase()}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{selectedListing.handle}</span>
                      {selectedListing.verified && <Pill text="✓ Verified" color={C.accent} />}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{selectedListing.niche} · Tracked since 94d ago</div>
                  </div>
                </div>
                <button onClick={() => setSelectedListing(null)} style={{
                  width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
                  fontSize: 16, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                }}>✕</button>
              </div>

              {/* Hero price + valuation comparison */}
              <div style={{ padding: "28px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(180deg, rgba(212, 255, 0, 0.02), transparent)` }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Asking Price</div>
                  <div style={{ fontSize: 56, fontWeight: 900, color: C.primary, letterSpacing: -2, fontFamily: "'JetBrains Mono', monospace" }}>${selectedListing.value.toLocaleString()}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ padding: "10px 8px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>HM Est. Value</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.textPrimary, marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>${listingVal.estimatedValue.toLocaleString()}</div>
                  </div>
                  <div style={{ padding: "10px 8px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>Price vs Est.</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: selectedListing.value > listingVal.estimatedValue * 1.1 ? "#ef4444" : selectedListing.value < listingVal.estimatedValue * 0.9 ? "#10b981" : C.textPrimary, marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>
                      {selectedListing.value > listingVal.estimatedValue ? "+" : ""}{Math.round((selectedListing.value - listingVal.estimatedValue) / listingVal.estimatedValue * 100)}%
                    </div>
                  </div>
                  <div style={{ padding: "10px 8px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>$/1k Followers</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.textPrimary, marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>${Math.round(selectedListing.value / selectedListing.followers * 1000)}</div>
                  </div>
                </div>
              </div>

              {/* Account stats grid */}
              <div style={{ padding: "24px 28px" }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>📊 Account Stats</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
                  {[
                    ["Followers", selectedListing.followers.toLocaleString()],
                    ["Engagement", selectedListing.engagement],
                    ["Age", selectedListing.age],
                    ["Avg Likes", estimatedAvgLikes.toLocaleString()],
                  ].map(([l, v]) => (
                    <div key={l} style={{ padding: "12px 8px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{l}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.textPrimary, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Trust Score Hero */}
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>🛡️ Trust Assessment</div>
                <div style={{ padding: "18px 20px", background: `${tColor}08`, border: `1px solid ${tColor}30`, borderRadius: 12, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Trust Score</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 36, fontWeight: 900, color: tColor, letterSpacing: -1, fontFamily: "'JetBrains Mono', monospace" }}>{selectedListing.trustScore}</span>
                        <span style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>/ 100</span>
                      </div>
                    </div>
                    <div style={{
                      padding: "8px 14px", borderRadius: 10,
                      background: `${tColor}15`, border: `1px solid ${tColor}40`,
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 800,
                      color: tColor, letterSpacing: 1.5,
                    }}>{selectedListing.trustLabel}</div>
                  </div>

                  {/* Bot estimate */}
                  <div style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 10, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Estimated Bot Followers</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: listingTrust.estimatedBotPct > 30 ? "#ef4444" : listingTrust.estimatedBotPct > 15 ? "#f59e0b" : "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>
                        {listingTrust.estimatedBotPct}%
                      </span>
                    </div>
                    <div style={{ height: 4, background: "rgba(255, 255, 255, 0.05)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${listingTrust.estimatedBotPct}%`,
                        background: `linear-gradient(90deg, ${listingTrust.estimatedBotPct > 30 ? "#ef4444" : listingTrust.estimatedBotPct > 15 ? "#f59e0b" : "#10b981"}, ${listingTrust.estimatedBotPct > 30 ? "#dc2626" : listingTrust.estimatedBotPct > 15 ? "#f97316" : "#059669"})`,
                      }} />
                    </div>
                  </div>

                  {/* Signal breakdown */}
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Authenticity Signals</div>
                  <ScoreBar label="Follow Ratio" score={listingTrust.breakdown.followRatio} color="#10b981" />
                  <ScoreBar label="Engagement Quality" score={listingTrust.breakdown.engagementQuality} color="#06b6d4" />
                  <ScoreBar label="Conversations" score={listingTrust.breakdown.conversation} color="#a855f7" />
                  <ScoreBar label="Activity Pattern" score={listingTrust.breakdown.activity} color="#f59e0b" />
                  <ScoreBar label="Verification" score={listingTrust.breakdown.verification} color="#ec4899" />
                </div>

                {/* Why this score — flags */}
                {(listingTrust.redFlags.length > 0 || listingTrust.greenFlags.length > 0) && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>🔍 Why This Score?</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {listingTrust.greenFlags.map((flag, i) => (
                        <div key={`g-${i}`} style={{ padding: "10px 12px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 14 }}>✅</span>
                          <span style={{ fontSize: 12, color: "#6ee7b7", fontFamily: "'JetBrains Mono', monospace" }}>{flag}</span>
                        </div>
                      ))}
                      {listingTrust.redFlags.map((flag, i) => (
                        <div key={`r-${i}`} style={{ padding: "10px 12px", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 14 }}>🚩</span>
                          <span style={{ fontSize: 12, color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace" }}>{flag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Valuation breakdown */}
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>💰 Valuation Breakdown</div>
                <div style={{ padding: "14px 16px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, marginBottom: 20, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                  <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginBottom: 10, lineHeight: 1.5 }}>Score out of 100 for each valuation signal:</div>
                  <ScoreBar label="Followers Weight" score={listingVal.breakdown.followers} color={C.primary} />
                  <ScoreBar label="Engagement Weight" score={listingVal.breakdown.engagement} color="#06b6d4" />
                  <ScoreBar label="Account Age" score={listingVal.breakdown.accountAge} color="#a855f7" />
                  <ScoreBar label="Tweet Volume" score={listingVal.breakdown.tweetVolume} color="#f59e0b" />
                  <ScoreBar label="Verification" score={listingVal.breakdown.verification} color="#ec4899" />
                  <ScoreBar label="CT Niche" score={listingVal.breakdown.nicheRelevance} color="#fb923c" />
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255, 255, 255, 0.05)", fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
                    💡 Estimated projected earnings: <strong style={{ color: C.textPrimary }}>~${listingVal.monthlyEarnings}/mo</strong> based on engagement and reach. Total valuation = projected earnings × {selectedListing.verified ? "18" : "12"} months × CT niche premium.
                  </div>
                </div>

                {/* Seller info */}
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>👤 Seller</div>
                <div style={{ padding: "14px 16px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #333, #111)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#fff" }}>OG</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>@OGTrader</div>
                      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>47 sales · 0% disputes · Avg transfer 4h</div>
                    </div>
                  </div>
                  <Pill text="Score 98" color="#10b981" />
                </div>

                {/* Description */}
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>📝 About This Account</div>
                <div style={{ padding: "14px 16px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, marginBottom: 20, fontSize: 13, color: C.textSecondary, lineHeight: 1.6, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                  Established {selectedListing.niche} account with strong organic engagement. Original email included in transfer. Clean history with no bans or warnings. Serious buyers only. Escrow required — no exceptions.
                </div>

                {/* What's included */}
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>✅ What's Included</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
                  {["Full account credentials + email access", "Linked phone number removal", "24h transfer window via escrow", "All listed stats verified by HandleMarket"].map(item => (
                    <div key={item} style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: C.primary }}>✓</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                  <button style={{
                    padding: "14px 20px", borderRadius: 12, border: "none",
                    background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                    color: "#000", fontSize: 14, fontWeight: 900,
                    fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                    letterSpacing: 0.3, transition: "all 0.2s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                  >💰 Buy via Escrow</button>
                  <button style={{
                    padding: "14px 20px", borderRadius: 12, border: `1px solid ${C.primary}40`,
                    background: "rgba(212, 255, 0, 0.06)", color: C.primary,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700,
                    cursor: "pointer",
                  }}>💬 Make Offer</button>
                </div>

                <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, textAlign: "center" }}>
                  🔒 All transactions protected by HandleMarket escrow. Funds held until transfer verified.
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── LIST YOUR ACCOUNT MODAL ────────────────────────── */}
      {showListForm && (
        <div
          onClick={() => { if (!listSubmitted) setShowListForm(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(8px)", zIndex: 100,
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "40px 20px", overflowY: "auto",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 620, width: "100%",
              background: "rgba(10, 10, 10, 0.98)",
              border: `1px solid ${C.borderHover}`,
              borderRadius: 20, padding: 0,
              boxShadow: "0 40px 100px rgba(0, 0, 0, 0.8), 0 0 60px rgba(212, 255, 0, 0.1)",
              overflow: "hidden",
            }}
          >
            {!listSubmitted ? (
              <>
                <div style={{ padding: "24px 28px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>List Your CT Account</div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>Your listing goes live instantly · No fees until sale</div>
                  </div>
                  <button onClick={() => setShowListForm(false)} style={{
                    width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.08)",
                    background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
                    fontSize: 16, cursor: "pointer",
                  }}>✕</button>
                </div>

                <div style={{ padding: "24px 28px" }}>
                  {/* X Handle */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>X / Twitter Handle *</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.textMuted, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>@</span>
                      <input
                        style={{ ...inputStyle, paddingLeft: 32 }} type="text" placeholder="FabsKebabs101"
                        value={listForm.handle}
                        onChange={e => setListForm({ ...listForm, handle: e.target.value })}
                        onFocus={e => e.target.style.borderColor = C.primary}
                        onBlur={e => e.target.style.borderColor = "rgba(255, 255, 255, 0.12)"}
                      />
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>We'll verify ownership via DM before listing goes live</div>
                  </div>

                  {/* Asking Price */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Asking Price (USD) *</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.textMuted, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>$</span>
                      <input
                        style={{ ...inputStyle, paddingLeft: 30 }} type="number" placeholder="3500"
                        value={listForm.askingPrice}
                        onChange={e => setListForm({ ...listForm, askingPrice: e.target.value })}
                        onFocus={e => e.target.style.borderColor = C.primary}
                        onBlur={e => e.target.style.borderColor = "rgba(255, 255, 255, 0.12)"}
                      />
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>💡 Unsure? Get a free valuation first in the Valuate tab</div>
                  </div>

                  {/* Niche */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Niche *</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["DeFi", "Solana", "NFTs", "Memecoin", "Bitcoin", "Trading", "Alpha", "Analytics"].map(n => (
                        <button key={n} type="button" onClick={() => setListForm({ ...listForm, niche: n })} style={{
                          padding: "8px 14px", borderRadius: 8,
                          border: `1px solid ${listForm.niche === n ? C.primary : "rgba(255, 255, 255, 0.08)"}`,
                          background: listForm.niche === n ? "rgba(212, 255, 0, 0.12)" : "rgba(0, 0, 0, 0.5)",
                          color: listForm.niche === n ? C.primary : C.textSecondary,
                          fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                          cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5,
                        }}>{n}</button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Description</label>
                    <textarea
                      placeholder="Tell buyers what makes this account valuable. Posting history, engagement patterns, notable followers, etc."
                      value={listForm.description}
                      onChange={e => setListForm({ ...listForm, description: e.target.value })}
                      onFocus={e => e.target.style.borderColor = C.primary}
                      onBlur={e => e.target.style.borderColor = "rgba(255, 255, 255, 0.12)"}
                      style={{
                        ...inputStyle, minHeight: 90, resize: "vertical",
                        fontFamily: "'Outfit', sans-serif",
                      }}
                    />
                  </div>

                  {/* Contact method */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Preferred Contact Method</label>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      {[["telegram", "Telegram"], ["dm", "X DM"], ["email", "Email"]].map(([val, lbl]) => (
                        <button key={val} type="button" onClick={() => setListForm({ ...listForm, contactMethod: val })} style={{
                          padding: "8px 14px", borderRadius: 8,
                          border: `1px solid ${listForm.contactMethod === val ? C.primary : "rgba(255, 255, 255, 0.08)"}`,
                          background: listForm.contactMethod === val ? "rgba(212, 255, 0, 0.12)" : "rgba(0, 0, 0, 0.5)",
                          color: listForm.contactMethod === val ? C.primary : C.textSecondary,
                          fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                          cursor: "pointer", flex: 1,
                        }}>{lbl}</button>
                      ))}
                    </div>
                    <input
                      style={inputStyle} type="text"
                      placeholder={listForm.contactMethod === "telegram" ? "@YourTelegram" : listForm.contactMethod === "dm" ? "@YourXHandle" : "you@email.com"}
                      value={listForm.contactHandle}
                      onChange={e => setListForm({ ...listForm, contactHandle: e.target.value })}
                      onFocus={e => e.target.style.borderColor = C.primary}
                      onBlur={e => e.target.style.borderColor = "rgba(255, 255, 255, 0.12)"}
                    />
                  </div>

                  {/* Negotiable */}
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: C.textSecondary, marginBottom: 20 }}>
                    <input type="checkbox" checked={listForm.negotiable} onChange={e => setListForm({ ...listForm, negotiable: e.target.checked })} style={{ accentColor: C.primary }} />
                    Price is negotiable — allow buyers to make offers
                  </label>

                  {/* Info box */}
                  <div style={{ padding: "12px 14px", background: "rgba(212, 255, 0, 0.04)", borderRadius: 8, border: "1px solid rgba(212, 255, 0, 0.12)", marginBottom: 20, fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
                    🔒 HandleMarket takes 2.5% commission on completed sales. All transactions go through escrow. Your listing will be live within 5 minutes of ownership verification.
                  </div>

                  {/* Submit */}
                  <button
                    onClick={() => setListSubmitted(true)}
                    disabled={!listForm.handle || !listForm.askingPrice}
                    style={{
                      width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
                      background: (!listForm.handle || !listForm.askingPrice) ? "rgba(255, 255, 255, 0.05)" : `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                      color: (!listForm.handle || !listForm.askingPrice) ? C.textMuted : "#000",
                      fontSize: 14, fontWeight: 900,
                      fontFamily: "'Outfit', sans-serif",
                      cursor: (!listForm.handle || !listForm.askingPrice) ? "not-allowed" : "pointer",
                      letterSpacing: 0.3,
                    }}
                  >🚀 Submit Listing</button>
                </div>
              </>
            ) : (
              <div style={{ padding: "48px 28px", textAlign: "center" }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Listing Submitted</div>
                <div style={{ fontSize: 14, color: C.textSecondary, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
                  We'll DM <span style={{ color: C.primary, fontFamily: "'JetBrains Mono', monospace" }}>@{listForm.handle}</span> within the next hour to verify account ownership. Once verified, your listing goes live instantly.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 28 }}>
                  {[
                    ["Handle", `@${listForm.handle}`],
                    ["Price", `$${parseInt(listForm.askingPrice).toLocaleString()}`],
                    ["Niche", listForm.niche],
                  ].map(([l, v]) => (
                    <div key={l} style={{ padding: "12px 8px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                      <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{l}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>{v}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setShowListForm(false);
                    setListSubmitted(false);
                    setListForm({ handle: "", askingPrice: "", description: "", niche: "DeFi", contactMethod: "telegram", contactHandle: "", negotiable: true });
                  }}
                  style={{
                    padding: "12px 32px", borderRadius: 12, border: "none",
                    background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                    color: "#000", fontSize: 13, fontWeight: 900,
                    fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                  }}
                >Done</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", padding: "20px 24px", marginTop: 60, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
          HandleMarket © 2026 · Valuations are estimates based on public metrics · Not financial advice
        </div>
      </div>
    </div>
  );
}
