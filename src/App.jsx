import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot, Area, AreaChart } from "recharts";
import { supabase } from "./supabase";

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

  // 7. CT niche relevance (real CT accounts carry more reputation weight)
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
// ─── PHASE 1: Handshake Jobs Board ──────────────────────────
const MOCK_JOBS = [
  // ─── CT / KOL JOBS ───────────────────────────────────
  {
    id: "job-001", jobType: "ct",
    title: "Shitpost campaign for memecoin launch",
    category: "Shitposting",
    poster: "@SolProject_", posterTrust: 84, posterVerified: true,
    budget: 500, budgetCurrency: "USDC",
    deadline: "72h",
    postedAgo: "2h ago",
    proposals: 7,
    minTrustScore: 55,
    status: "open",
    description: "Need 10 high-effort shitposts over 3 days for our memecoin launch. Must be degen-coded, not cringe. Looking for proven shitposters with CT credibility.",
    deliverables: ["10 original shitposts", "At least 3 with memes/images", "Post during peak CT hours (US/EU)"],
    tags: ["memecoin", "solana", "shitpost"],
  },
  {
    id: "job-003", jobType: "ct",
    title: "Thread writer — weekly alpha research",
    category: "Thread Writing",
    poster: "@AlphaResearch", posterTrust: 88, posterVerified: true,
    budget: 800, budgetCurrency: "USDC",
    deadline: "Ongoing",
    postedAgo: "1d ago",
    proposals: 23,
    minTrustScore: 70,
    status: "open",
    description: "Weekly long-form threads on emerging protocols and narratives. Looking for a writer with existing CT presence (50k+ ideally). Payment per thread, 4 threads/mo.",
    deliverables: ["Weekly 10-15 tweet thread", "Original research + sources", "Publish from your account"],
    tags: ["research", "threads", "ongoing"],
  },
  {
    id: "job-005", jobType: "ct",
    title: "KOL raid — 50 engaged comments",
    category: "KOL / Raids",
    poster: "@NewLaunchCo", posterTrust: 62, posterVerified: false,
    budget: 150, budgetCurrency: "USDC",
    deadline: "24h",
    postedAgo: "3h ago",
    proposals: 31,
    minTrustScore: 40,
    status: "open",
    description: "Need real, thoughtful comments (not generic emojis) on our announcement tweet. 50 comments, must be from accounts with trust score 40+.",
    deliverables: ["50 engaged comments", "From trust-verified accounts", "Delivered within 24h"],
    tags: ["raid", "engagement"],
  },
  {
    id: "job-007", jobType: "ct",
    title: "Space host for weekly founder AMAs",
    category: "Spaces / AMAs",
    poster: "@L1Launch", posterTrust: 87, posterVerified: true,
    budget: 400, budgetCurrency: "USDC",
    deadline: "Ongoing",
    postedAgo: "5h ago",
    proposals: 9,
    minTrustScore: 70,
    status: "open",
    description: "Looking for a high-signal CT host to run weekly Spaces with project founders. Must have 20k+ followers and strong vocal presence.",
    deliverables: ["1 hosted Space per week", "Guest prep + questions", "Promo tweet beforehand"],
    tags: ["spaces", "host", "ama"],
  },
  {
    id: "job-008", jobType: "ct",
    title: "Meme battle content for memecoin",
    category: "Meme Warfare",
    poster: "@DegenMemecoin", posterTrust: 71, posterVerified: false,
    budget: 250, budgetCurrency: "USDC",
    deadline: "48h",
    postedAgo: "12h ago",
    proposals: 15,
    minTrustScore: 50,
    status: "open",
    description: "Need rapid-fire meme content for ongoing meme war against a rival. 20 memes over 48h, must be sharp and on-narrative.",
    deliverables: ["20 meme assets", "Original captions", "Posted from your account"],
    tags: ["memes", "warfare", "memecoin"],
  },
  {
    id: "job-015", jobType: "ct",
    title: "Streamer for weekly crypto content sessions",
    category: "Streaming / Gambling",
    poster: "@CryptoPartner", posterTrust: 82, posterVerified: true,
    budget: 2000, budgetCurrency: "USDT",
    deadline: "Ongoing",
    postedAgo: "5h ago",
    proposals: 18,
    minTrustScore: 60,
    status: "open",
    description: "Looking for an active crypto streamer to run weekly sessions on Kick/Twitch/X. Must have 5k+ engaged followers and crypto-native personality. Bonus structure on referrals.",
    deliverables: ["2x weekly 2h streams", "Cross-post highlights to X", "Promo tweets with referral link"],
    tags: ["streaming", "kick", "content"],
  },
  {
    id: "job-016", jobType: "ct",
    title: "Short-form promo clip campaign",
    category: "Streaming / Gambling",
    poster: "@CryptoSponsor", posterTrust: 78, posterVerified: true,
    budget: 800, budgetCurrency: "SOL",
    deadline: "10d",
    postedAgo: "1d ago",
    proposals: 24,
    minTrustScore: 45,
    status: "open",
    description: "Need 10 short-form promo clips (TikTok/Reels style) featuring big wins and giveaway announcements. Fast turnaround, raw footage provided.",
    deliverables: ["10 vertical clips (30-60s)", "On-brand captions + hooks", "Native-ready for TikTok/Reels/Shorts"],
    tags: ["promo", "shorts", "clips"],
  },
  {
    id: "job-017", jobType: "ct",
    title: "Clipper — daily CT highlights reel",
    category: "Clipping / Editing",
    poster: "@CTHighlightsDaily", posterTrust: 74, posterVerified: false,
    budget: 450, budgetCurrency: "USDC",
    deadline: "Ongoing",
    postedAgo: "8h ago",
    proposals: 31,
    minTrustScore: 40,
    status: "open",
    description: "Scrape CT daily for the best moments (cook posts, drama, big calls). Cut 3-5 vertical clips per day with subtitles. Paid weekly.",
    deliverables: ["3-5 clips/day", "Subtitles + hooks", "Posted to your account + cross-post rights"],
    tags: ["clipping", "content", "daily"],
  },
  {
    id: "job-020", jobType: "ct",
    title: "Spaces clipper — viral moments from weekly AMAs",
    category: "Clipping / Editing",
    poster: "@SpacesHub", posterTrust: 81, posterVerified: true,
    budget: 600, budgetCurrency: "USDC",
    deadline: "Ongoing",
    postedAgo: "11h ago",
    proposals: 17,
    minTrustScore: 45,
    status: "open",
    description: "Listen to 2-3 Spaces per week, identify viral-worthy moments (alpha calls, callouts, mic-drops), and cut vertical clips with captions for X + TikTok.",
    deliverables: ["6-10 clips per week", "Auto-captions + title hooks", "Tagged source Space in description"],
    tags: ["spaces", "clipping", "viral"],
  },
  {
    id: "job-018", jobType: "ct",
    title: "Podcast editor — long-form to shorts",
    category: "Clipping / Editing",
    poster: "@CryptoPodcastHQ", posterTrust: 86, posterVerified: true,
    budget: 1200, budgetCurrency: "USDC",
    deadline: "Ongoing",
    postedAgo: "2d ago",
    proposals: 12,
    minTrustScore: 45,
    status: "open",
    description: "Edit weekly 90min podcast down to 1 full episode + 8-12 short clips. Pro-level editing required. Must understand crypto to pick the best moments.",
    deliverables: ["1 edited full episode", "8-12 vertical clips", "Thumbnails for each"],
    tags: ["podcast", "editing", "ongoing"],
  },
  {
    id: "job-019", jobType: "ct",
    title: "Kick stream clipper — crypto degen content",
    category: "Clipping / Editing",
    poster: "@DegenStreamer", posterTrust: 69, posterVerified: false,
    budget: 350, budgetCurrency: "USDT",
    deadline: "Ongoing",
    postedAgo: "14h ago",
    proposals: 22,
    minTrustScore: 35,
    status: "open",
    description: "Active Kick streamer needs a dedicated clipper. 5 clips per stream, 4 streams per week. Good pay for someone fast.",
    deliverables: ["5 clips per stream", "Upload to X + TikTok", "1hr turnaround after stream ends"],
    tags: ["kick", "clipping", "degen"],
  },

  // ─── CRYPTO WORK JOBS ───────────────────────────────────
  {
    id: "job-004", jobType: "crypto",
    title: "Solana smart contract dev — escrow modification",
    category: "Development",
    poster: "@BuildersDAO", posterTrust: 93, posterVerified: true,
    budget: 2500, budgetCurrency: "USDC",
    deadline: "2w",
    postedAgo: "8h ago",
    proposals: 4,
    minTrustScore: 40,
    status: "open",
    description: "Need a Rust/Anchor dev to modify an existing escrow contract. Add time-locked releases. Existing code + tests provided. Deliverable: PR + deployed devnet program.",
    deliverables: ["Modified Anchor program", "Unit tests", "Devnet deployment"],
    tags: ["solana", "rust", "anchor"],
    requiresPortfolio: true,
  },
  {
    id: "job-002", jobType: "crypto",
    title: "Video editor for 30s reel — crypto explainer",
    category: "Video Editing",
    poster: "@DeFi_Founder", posterTrust: 91, posterVerified: true,
    budget: 300, budgetCurrency: "USDC",
    deadline: "5d",
    postedAgo: "6h ago",
    proposals: 12,
    minTrustScore: 30,
    status: "open",
    description: "30-second vertical video explaining our L2 protocol. Raw footage provided. Need snappy cuts, captions, and crypto-native style.",
    deliverables: ["30s vertical 9:16 video", "Captions & b-roll", "2 revisions included"],
    tags: ["video", "explainer"],
    requiresPortfolio: true,
  },
  {
    id: "job-006", jobType: "crypto",
    title: "NFT PFP collection design — 10 pieces",
    category: "Design",
    poster: "@NFTArtist_Dao", posterTrust: 79, posterVerified: true,
    budget: 1200, budgetCurrency: "USDC",
    deadline: "10d",
    postedAgo: "2d ago",
    proposals: 18,
    minTrustScore: 30,
    status: "in_progress",
    description: "10 marketing memes for PFP drop. Degen-coded, shareable, original style.",
    deliverables: ["10 meme assets", "Square + vertical formats", "Source files"],
    tags: ["design", "nft", "art"],
    requiresPortfolio: true,
  },
  {
    id: "job-009", jobType: "crypto",
    title: "Smart contract audit — ERC-20 + staking",
    category: "Audits",
    poster: "@DeFiProtocol", posterTrust: 92, posterVerified: true,
    budget: 5000, budgetCurrency: "USDC",
    deadline: "3w",
    postedAgo: "1d ago",
    proposals: 3,
    minTrustScore: 40,
    status: "open",
    description: "Pre-launch audit of ERC-20 token + staking contract on Base. ~800 LOC. Looking for auditor with prior work on comparable contracts. Report + remediations required.",
    deliverables: ["Written audit report", "Severity-graded findings", "Remediation review pass"],
    tags: ["audit", "evm", "security"],
    requiresPortfolio: true,
  },
  {
    id: "job-010", jobType: "crypto",
    title: "Frontend dev — React + Wagmi dashboard",
    category: "Development",
    poster: "@YieldProtocol", posterTrust: 85, posterVerified: true,
    budget: 1800, budgetCurrency: "USDC",
    deadline: "2w",
    postedAgo: "14h ago",
    proposals: 8,
    minTrustScore: 30,
    status: "open",
    description: "Build analytics dashboard for our yield protocol. React + Wagmi/Viem + Tailwind. Figma provided. Must integrate with existing backend API.",
    deliverables: ["Responsive dashboard", "Wallet connection", "Data visualization"],
    tags: ["react", "wagmi", "frontend"],
    requiresPortfolio: true,
  },
  {
    id: "job-011", jobType: "crypto",
    title: "Whitepaper writer — L2 rollup protocol",
    category: "Technical Writing",
    poster: "@L2Research", posterTrust: 89, posterVerified: true,
    budget: 1500, budgetCurrency: "USDC",
    deadline: "3w",
    postedAgo: "2d ago",
    proposals: 6,
    minTrustScore: 40,
    status: "open",
    description: "Write technical whitepaper for novel L2 rollup. Must understand ZK proofs, rollup architecture, and tokenomics. Previous whitepaper work required.",
    deliverables: ["25-40 page whitepaper", "Architecture diagrams", "2 revision rounds"],
    tags: ["whitepaper", "technical", "l2"],
    requiresPortfolio: true,
  },
  {
    id: "job-012", jobType: "crypto",
    title: "Community manager — Discord + Telegram",
    category: "Community",
    poster: "@MemecoinProject", posterTrust: 74, posterVerified: false,
    budget: 1000, budgetCurrency: "USDC",
    deadline: "Ongoing",
    postedAgo: "3d ago",
    proposals: 22,
    minTrustScore: 35,
    status: "open",
    description: "Part-time CM for Discord (5k members) + Telegram (3k). Handle mod, run events, escalate FUD. Monthly retainer.",
    deliverables: ["Daily presence", "Weekly events", "FUD reports"],
    tags: ["community", "discord", "telegram"],
  },
  {
    id: "job-013", jobType: "crypto",
    title: "Logo + brand kit — DePIN project",
    category: "Design",
    poster: "@DePINFounder", posterTrust: 81, posterVerified: true,
    budget: 900, budgetCurrency: "USDC",
    deadline: "10d",
    postedAgo: "16h ago",
    proposals: 14,
    minTrustScore: 30,
    status: "open",
    description: "Complete brand identity: logo, color system, typography, basic style guide. Modern, technical, trustworthy aesthetic.",
    deliverables: ["Logo (vector)", "Brand guidelines PDF", "Social media kit"],
    tags: ["branding", "logo", "identity"],
    requiresPortfolio: true,
  },
  {
    id: "job-014", jobType: "crypto",
    title: "Technical blog writer — DeFi primitives",
    category: "Technical Writing",
    poster: "@DeFiResearchCo", posterTrust: 86, posterVerified: true,
    budget: 600, budgetCurrency: "USDC",
    deadline: "Ongoing",
    postedAgo: "1d ago",
    proposals: 11,
    minTrustScore: 30,
    status: "open",
    description: "2 deep-dive articles per month on DeFi primitives (AMMs, lending, CDPs). 1500-2500 words each, technical but accessible.",
    deliverables: ["2 articles/month", "Original research", "Edits included"],
    tags: ["writing", "defi", "content"],
    requiresPortfolio: true,
  },
  {
    id: "job-021", jobType: "crypto",
    title: "AI trading bot dev — Solana memecoin sniper",
    category: "AI / ML",
    poster: "@AlphaBotLabs", posterTrust: 88, posterVerified: true,
    budget: 3500, budgetCurrency: "USDC",
    deadline: "3w",
    postedAgo: "4h ago",
    proposals: 5,
    minTrustScore: 45,
    status: "open",
    description: "Build an AI-driven sniper bot for Solana memecoins. Model should score new launches by liquidity, holder distribution, dev wallet behavior, and social signals. Python + on-chain integration.",
    deliverables: ["Trained classifier model", "Live inference pipeline", "Backtest report + docs"],
    tags: ["ai", "solana", "trading"],
    requiresPortfolio: true,
  },
  {
    id: "job-022", jobType: "crypto",
    title: "LLM integration — on-chain analytics assistant",
    category: "AI / ML",
    poster: "@OnChainAI", posterTrust: 84, posterVerified: true,
    budget: 2200, budgetCurrency: "USDC",
    deadline: "2w",
    postedAgo: "9h ago",
    proposals: 7,
    minTrustScore: 40,
    status: "open",
    description: "Wire up a Claude/GPT-based chatbot that can query our on-chain analytics API. Natural language → SQL → formatted response. RAG over existing docs. OpenAI or Anthropic API.",
    deliverables: ["Working chatbot", "RAG pipeline", "Streamlit or React demo"],
    tags: ["llm", "rag", "analytics"],
    requiresPortfolio: true,
  },
  {
    id: "job-023", jobType: "crypto",
    title: "AI image generator for NFT collection",
    category: "AI / ML",
    poster: "@NFTStudio_", posterTrust: 76, posterVerified: false,
    budget: 1400, budgetCurrency: "USDC",
    deadline: "2w",
    postedAgo: "1d ago",
    proposals: 19,
    minTrustScore: 35,
    status: "open",
    description: "Use Stable Diffusion/Flux fine-tuning to generate 1000 unique NFT pieces based on a custom style. Trait weighting + rarity logic required.",
    deliverables: ["1000 generated assets", "Metadata JSON", "Trait rarity report"],
    tags: ["ai", "nft", "generative"],
    requiresPortfolio: true,
  },
];

const JOB_CATEGORIES_CT = [
  { id: "all", label: "All CT Jobs", icon: "🌐" },
  { id: "Shitposting", label: "Shitposting", icon: "🤡" },
  { id: "Thread Writing", label: "Threads", icon: "🧵" },
  { id: "KOL / Raids", label: "Raids", icon: "📢" },
  { id: "Spaces / AMAs", label: "Spaces", icon: "🎙️" },
  { id: "Meme Warfare", label: "Memes", icon: "⚔️" },
  { id: "Streaming / Gambling", label: "Streaming", icon: "🎰" },
  { id: "Clipping / Editing", label: "Clips", icon: "✂️" },
];

const JOB_CATEGORIES_CRYPTO = [
  { id: "all", label: "All Crypto Work", icon: "🌐" },
  { id: "Development", label: "Dev", icon: "💻" },
  { id: "AI / ML", label: "AI", icon: "🤖" },
  { id: "Design", label: "Design", icon: "🎨" },
  { id: "Audits", label: "Audits", icon: "🔐" },
  { id: "Technical Writing", label: "Writing", icon: "✍️" },
  { id: "Video Editing", label: "Video", icon: "🎬" },
  { id: "Community", label: "Community", icon: "💬" },
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
  { id: "score-milestone", name: "Tier Change", desc: "Alert when Trust Score tier changes (e.g. NOTED → CREDIBLE)", icon: "🎯", premium: false },
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


export default function Web3Gigs() {
  const [tab, setTab] = useState("home");
  const [form, setForm] = useState({
    followers: "", avgLikes: "", avgRetweets: "", avgReplies: "",
    tweets: "", accountAgeDays: "", verified: false, cryptoNiche: true,
  });
  const [result, setResult] = useState(null);
  const [trustResult, setTrustResult] = useState(null);
  const [animateValue, setAnimateValue] = useState(0);
  const [leaderboardTab, setLeaderboardTab] = useState("trending");
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profileData, setProfileData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [forensicsRun, setForensicsRun] = useState(false);
  const [jobsFilter, setJobsFilter] = useState("all");
  const [jobsType, setJobsType] = useState("crypto"); // "ct" or "crypto" — default to crypto work
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [waitlistError, setWaitlistError] = useState("");
  const [waitlistLoading, setWaitlistLoading] = useState(false);

  // Save email to Supabase waitlist
  const submitWaitlist = async (source = "analyze") => {
    if (!waitlistEmail.includes("@")) return;
    setWaitlistLoading(true);
    setWaitlistError("");
    try {
      const { error } = await supabase
        .from("waitlist")
        .insert([{ email: waitlistEmail.trim().toLowerCase(), source }]);
      if (error) {
        // Duplicate email is fine — treat as success
        if (error.code === "23505") {
          setWaitlistSubmitted(true);
        } else {
          setWaitlistError("Something went wrong. Try again in a sec.");
          console.error("Waitlist error:", error);
        }
      } else {
        setWaitlistSubmitted(true);
      }
    } catch (err) {
      setWaitlistError("Couldn't connect. Check your internet?");
      console.error(err);
    } finally {
      setWaitlistLoading(false);
    }
  };
  const [selectedJob, setSelectedJob] = useState(null);
  const [showPostJob, setShowPostJob] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [proposalText, setProposalText] = useState("");
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
            <div style={{ width: 40, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#000", fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.5 }}>W3G</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.5 }}>Web3Gigs</div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, textTransform: "uppercase" }}>Hire · Handshake · Ship</div>
            </div>
          </div>
          {/* Right side — waitlist + menu */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => { setWaitlistSubmitted(false); setWaitlistError(""); setShowWaitlistModal(true); }}
              style={{
                padding: "10px 16px", borderRadius: 12, border: "none",
                background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                color: "#000", fontSize: 12, fontWeight: 900,
                fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                letterSpacing: 0.3, transition: "all 0.2s",
                boxShadow: "0 0 20px rgba(212, 255, 0, 0.2)",
                display: "flex", alignItems: "center", gap: 6,
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 0 28px rgba(212, 255, 0, 0.35)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(212, 255, 0, 0.2)"; }}
            >
              <span>💌</span>
              <span>Join Waitlist</span>
            </button>
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
                  ["jobs", "💼 Jobs"],
                  ["valuate", "🔍 Analyze"],
                  ["trust", "🛡️ Trust"],
                  ["leaderboard", "🏆 Ranks"],
                  ["profile", "👤 Profile"],
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
                    ["jobs", "💼", "Jobs", "Hire or get hired"],
                    ["valuate", "🔍", "Analyze", "Full CT account analysis"],
                    ["trust", "🛡️", "Trust", "Trust Score guide"],
                    ["leaderboard", "🏆", "Ranks", "CT leaderboards"],
                    ["profile", "👤", "Profile", "Public profile page"],
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
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* ─── HOME / LANDING TAB ───────────────────────────── */}
        {tab === "home" && (
          <div>
            {/* LIVE JOBS TICKER */}
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
                .ticker-track { animation: scrollTicker 70s linear infinite; }
              `}</style>
              <div className="ticker-track" style={{ display: "flex", gap: 28, whiteSpace: "nowrap", width: "max-content" }}>
                {[...Array(2)].map((_, loopIdx) => (
                  <div key={loopIdx} style={{ display: "flex", gap: 28 }}>
                    {[
                      // Crypto Work
                      { icon: "💻", title: "Solana dev · Anchor escrow mod", budget: 2500, deadline: "2w", trust: 40, status: "open", type: "crypto" },
                      { icon: "🔐", title: "Smart contract audit · ERC-20 + staking", budget: 5000, deadline: "3w", trust: 40, status: "open", type: "crypto" },
                      { icon: "⚛️", title: "Frontend dev · React + Wagmi dashboard", budget: 1800, deadline: "2w", trust: 30, status: "open", type: "crypto" },
                      { icon: "🎬", title: "Video editor · 30s crypto explainer", budget: 300, deadline: "5d", trust: 30, status: "open", type: "crypto" },
                      { icon: "📄", title: "Whitepaper writer · L2 rollup", budget: 1500, deadline: "3w", trust: 40, status: "open", type: "crypto" },
                      { icon: "🖼️", title: "NFT PFP design · 10 pieces", budget: 1200, deadline: "10d", trust: 30, status: "progress", type: "crypto" },
                      { icon: "💬", title: "Community manager · Discord + TG", budget: 1000, deadline: "Ongoing", trust: 35, status: "open", type: "crypto" },
                      { icon: "🎨", title: "Logo + brand kit · DePIN project", budget: 900, deadline: "10d", trust: 30, status: "open", type: "crypto" },
                      { icon: "✍️", title: "Technical blog writer · DeFi primitives", budget: 600, deadline: "Ongoing", trust: 30, status: "open", type: "crypto" },
                      { icon: "🤖", title: "AI memecoin sniper bot · Solana", budget: 3500, deadline: "3w", trust: 45, status: "open", type: "crypto" },
                      { icon: "🤖", title: "LLM on-chain analytics assistant", budget: 2200, deadline: "2w", trust: 40, status: "open", type: "crypto" },
                      // CT / KOL
                      { icon: "🤡", title: "Shitpost campaign · memecoin launch", budget: 500, deadline: "72h", trust: 55, status: "open", type: "ct" },
                      { icon: "🧵", title: "Thread writer · weekly alpha", budget: 800, deadline: "Ongoing", trust: 70, status: "open", type: "ct" },
                      { icon: "📢", title: "KOL raid · 50 engaged comments", budget: 150, deadline: "24h", trust: 40, status: "open", type: "ct" },
                      { icon: "🎙️", title: "Space host · weekly founder AMAs", budget: 400, deadline: "Ongoing", trust: 70, status: "open", type: "ct" },
                      { icon: "⚔️", title: "Meme warfare · 48h campaign", budget: 250, deadline: "48h", trust: 50, status: "open", type: "ct" },
                      { icon: "🎥", title: "Streamer · weekly sessions", budget: 2000, deadline: "Ongoing", trust: 60, status: "open", type: "ct" },
                      { icon: "✂️", title: "Clipper · daily CT highlights", budget: 450, deadline: "Ongoing", trust: 40, status: "open", type: "ct" },
                      { icon: "🎙️", title: "Spaces clipper · viral moments", budget: 600, deadline: "Ongoing", trust: 45, status: "open", type: "ct" },
                      { icon: "🎬", title: "Podcast editor · longform to shorts", budget: 1200, deadline: "Ongoing", trust: 45, status: "open", type: "ct" },
                      { icon: "📺", title: "Kick clipper · stream content", budget: 350, deadline: "Ongoing", trust: 35, status: "open", type: "ct" },
                    ].map((item, i) => {
                      const statusColor = item.status === "open" ? "#10b981" : "#fbbf24";
                      const typeColor = item.type === "crypto" ? "#60a5fa" : "#c084fc";
                      const typeLabel = item.type === "crypto" ? "CRYPTO" : "CT";
                      return (
                        <div key={`${loopIdx}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
                          <span style={{ fontSize: 13 }}>{item.icon}</span>
                          <span style={{ padding: "2px 6px", borderRadius: 4, background: `${typeColor}15`, color: typeColor, fontSize: 9, fontWeight: 800, letterSpacing: 0.8 }}>{typeLabel}</span>
                          <span style={{ color: C.textPrimary, fontWeight: 700 }}>{item.title}</span>
                          <span style={{ color: C.primary, fontWeight: 800 }}>${item.budget.toLocaleString()} USDC</span>
                          <span style={{ color: C.textMuted }}>·</span>
                          <span style={{ color: C.textSecondary, fontSize: 11 }}>⏱ {item.deadline}</span>
                          <span style={{ color: C.textMuted }}>·</span>
                          <span style={{ color: "#fbbf24", fontSize: 11 }}>🛡️ {item.trust}+</span>
                          <span style={{ color: C.textMuted, marginLeft: 8 }}>·</span>
                        </div>
                      );
                    })}
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
                  <span style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>The Crypto Work Marketplace</span>
                </div>
              </Reveal>

              {/* Headline */}
              <Reveal delay={100}>
                <h1 style={{ fontSize: 64, fontWeight: 900, margin: 0, letterSpacing: -3, lineHeight: 1 }}>
                  Hire crypto's best.<br />
                  <span style={{ color: C.primary }}>Without the scams.</span>
                </h1>
              </Reveal>
              <Reveal delay={200}>
                <p style={{ color: C.textSecondary, fontSize: 18, marginTop: 20, maxWidth: 560, margin: "20px auto 0", lineHeight: 1.5 }}>
                  Dev, design, audits, writing — or shitposts, raids, and Spaces. Every applicant comes with a Trust Score attached. No middleman. No 20% Fiverr cut. Get paid in USDC, USDT or SOL.
                </p>
              </Reveal>

              {/* CTAs */}
              <Reveal delay={300}>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setTab("jobs")}
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
                  >💼 Browse Open Jobs</button>
                  <button
                    onClick={() => setTab("valuate")}
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
                >🔍 Analyze Any Account</button>
              </div>
              </Reveal>

              {/* LIVE JOBS PREVIEW */}
              <Reveal delay={500}>
                <div style={{ marginTop: 48, maxWidth: 720, margin: "48px auto 0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px #10b981", animation: "pulse 2s ease-in-out infinite" }} />
                      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2 }}>Live Jobs · Hiring Now</div>
                    </div>
                    <button
                      onClick={() => setTab("jobs")}
                      style={{
                        background: "transparent", border: "none", padding: 0, cursor: "pointer",
                        fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                      }}
                    >View all →</button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                    {[
                      { icon: "💻", cat: "Dev", title: "Solana dev · Anchor escrow", budget: 2500, deadline: "2w", trust: 40, type: "CRYPTO", typeColor: "#60a5fa" },
                      { icon: "🔐", cat: "Audit", title: "Smart contract audit · ERC-20", budget: 5000, deadline: "3w", trust: 40, type: "CRYPTO", typeColor: "#60a5fa" },
                      { icon: "🤡", cat: "Shitpost", title: "Shitpost campaign · memecoin", budget: 500, deadline: "72h", trust: 55, type: "CT", typeColor: "#c084fc" },
                      { icon: "📄", cat: "Writing", title: "Whitepaper · L2 rollup", budget: 1500, deadline: "3w", trust: 40, type: "CRYPTO", typeColor: "#60a5fa" },
                    ].map((job, i) => (
                      <div
                        key={i}
                        onClick={() => setTab("jobs")}
                        style={{
                          padding: "14px 16px", borderRadius: 12,
                          background: "rgba(18, 18, 18, 0.7)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          cursor: "pointer", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                          textAlign: "left",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(212, 255, 0, 0.3)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.background = "rgba(30, 30, 30, 0.9)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = "rgba(18, 18, 18, 0.7)"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 14 }}>{job.icon}</span>
                          <span style={{ padding: "2px 6px", borderRadius: 4, background: `${job.typeColor}15`, color: job.typeColor, fontSize: 9, fontWeight: 800, letterSpacing: 0.8, fontFamily: "'JetBrains Mono', monospace" }}>{job.type}</span>
                          <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{job.cat}</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 10, lineHeight: 1.3, textAlign: "left" }}>{job.title}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                          <span style={{ color: C.primary, fontWeight: 800 }}>${job.budget.toLocaleString()} USDC</span>
                          <span style={{ color: C.textMuted }}>⏱ {job.deadline}</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 10, color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace" }}>🛡️ Trust {job.trust}+</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>

              {/* Social proof bar — animated counters */}
              <Reveal delay={200}>
                <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 56, flexWrap: "wrap" }}>
                  {[
                    { val: 96, prefix: "", suffix: "%", lbl: "Bot detection accuracy" },
                    { val: 18, prefix: "", suffix: "k+", lbl: "Trust scores generated" },
                  ].map((s, i) => (
                    <div key={s.lbl} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: C.primary, letterSpacing: -1, fontFamily: "'JetBrains Mono', monospace" }}>
                        {s.static ? s.display : <CountUp end={s.val} prefix={s.prefix} suffix={s.suffix} duration={1800} />}
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
                  { num: "01", title: "Post or Apply", desc: "Post a job with budget, deadline, and minimum trust score. Or browse jobs and apply with your reputation attached.", icon: "📝" },
                  { num: "02", title: "Handshake", desc: "Both parties sign a public on-chain commitment. Trust scores + community reputation enforce delivery. No middleman taking a cut.", icon: "🤝" },
                  { num: "03", title: "Get Paid in USDC", desc: "Work delivered, buyer approves, funds released. Reputation compounds for both sides. Pure crypto-native workflow.", icon: "💸" },
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

            {/* JOBS FEATURED SECTION */}
            <Reveal>
              <div style={{ marginBottom: 60 }}>
                <div style={{ textAlign: "center", marginBottom: 40 }}>
                  <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>🤝 Handshake Jobs · NEW</div>
                  <h2 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>Two sides of <span style={{ color: C.primary }}>crypto work.</span></h2>
                  <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 12, maxWidth: 560, margin: "12px auto 0", lineHeight: 1.5 }}>
                    Whether you're building a protocol or running a memecoin launch, there's a version of crypto work here for you. Trust-verified. Paid in USDC. No middlemen.
                  </p>
                </div>

                {/* Two-category split */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 24 }}>
                  {/* CRYPTO WORK SIDE */}
                  <GlowCard glow style={{ padding: "24px", background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), rgba(0, 0, 0, 0.5))` }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>💼</div>
                    <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, letterSpacing: -0.5 }}>Crypto Work</div>
                    <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Dev · Design · Audits · Writing</div>
                    <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>
                      Hire real professionals for real crypto work. Solana devs, smart contract auditors, designers, whitepaper writers, community managers. Portfolio-based. Scam-free.
                    </div>
                    {/* Sample job mini-cards */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                      {[
                        { icon: "💻", title: "Solana dev · Anchor escrow", budget: "$2.5k" },
                        { icon: "🔐", title: "Smart contract audit", budget: "$5k" },
                        { icon: "🎨", title: "Logo + brand kit · DePIN", budget: "$900" },
                      ].map(j => (
                        <div key={j.title} style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 14 }}>{j.icon}</span>
                            <span style={{ fontSize: 12, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{j.title}</span>
                          </div>
                          <span style={{ fontSize: 12, color: C.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>{j.budget}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => { setTab("jobs"); setJobsType("crypto"); }}
                      style={{
                        width: "100%", padding: "12px 20px", borderRadius: 10, border: "none",
                        background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                        color: "#000", fontSize: 13, fontWeight: 900,
                        fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                        letterSpacing: 0.3, transition: "all 0.2s",
                      }}
                    >💼 Browse Crypto Work →</button>
                  </GlowCard>

                  {/* CT / KOL SIDE */}
                  <GlowCard glow style={{ padding: "24px", background: `linear-gradient(135deg, rgba(52, 211, 153, 0.04), rgba(0, 0, 0, 0.5))` }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🎭</div>
                    <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, letterSpacing: -0.5 }}>CT / KOL Jobs</div>
                    <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Shitposts · Threads · Raids · Spaces</div>
                    <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>
                      Hire CT natives who actually move narratives. KOLs, shitposters, thread writers, meme warriors. Trust Score = your reputation. High-trust accounts get booked first.
                    </div>
                    {/* Sample job mini-cards */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                      {[
                        { icon: "🧵", title: "Thread writer · weekly alpha", budget: "$800" },
                        { icon: "🤡", title: "Shitpost campaign · memecoin", budget: "$500" },
                        { icon: "🎙️", title: "Space host · weekly AMAs", budget: "$400" },
                      ].map(j => (
                        <div key={j.title} style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 14 }}>{j.icon}</span>
                            <span style={{ fontSize: 12, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{j.title}</span>
                          </div>
                          <span style={{ fontSize: 12, color: C.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>{j.budget}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => { setTab("jobs"); setJobsType("ct"); }}
                      style={{
                        width: "100%", padding: "12px 20px", borderRadius: 10,
                        border: `1px solid ${C.primary}40`,
                        background: "rgba(212, 255, 0, 0.06)",
                        color: C.primary, fontSize: 13, fontWeight: 900,
                        fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                        letterSpacing: 0.3, transition: "all 0.2s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(212, 255, 0, 0.12)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(212, 255, 0, 0.06)"; }}
                    >🎭 Browse CT Jobs →</button>
                  </GlowCard>
                </div>

                {/* Stats strip */}
                <GlowCard style={{ padding: "20px 24px", background: "rgba(0, 0, 0, 0.5)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
                    {[
                      { label: "Open Jobs", val: "22", icon: "💼" },
                      { label: "Total Budget", val: "$30k+", icon: "💰" },
                      { label: "vs Fiverr Cut", val: "0%", icon: "✂️" },
                      { label: "Paid in", val: "USDC", icon: "💸" },
                      { label: "Disputes", val: "0", icon: "⚖️" },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: C.primary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.5 }}>{s.val}</div>
                        <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </GlowCard>
              </div>
            </Reveal>


            {/* REPUTATION TOOLS */}
            <Reveal>
              <div style={{ marginBottom: 60 }}>
                <div style={{ textAlign: "center", marginBottom: 40 }}>
                  <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Reputation Engine</div>
                  <h2 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>The tools that <span style={{ color: C.primary }}>power</span> trust.</h2>
                  <p style={{ color: C.textSecondary, fontSize: 14, marginTop: 12, maxWidth: 520, margin: "12px auto 0", lineHeight: 1.5 }}>
                    Every Handshake is backed by real signals. Explore the reputation infrastructure that makes the marketplace work.
                  </p>
                </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                {[
                  { icon: "🛡️", title: "Trust Score", desc: "0-100 authenticity rating. Exposes bot-inflated audiences and engagement pods.", tab: "trust" },
                  { icon: "🕸️", title: "CIB Detection", desc: "Catches coordinated pods, raid networks, and F4F rings before you get scammed.", tab: "cib" },
                  { icon: "📊", title: "90-Day Tracking", desc: "Historical timeline exposes sudden growth spikes, bot purchases, and anomalies.", tab: "valuate" },
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
                      position: "relative",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(212, 255, 0, 0.3)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.background = "rgba(30, 30, 30, 0.9)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = "rgba(18, 18, 18, 0.7)"; }}
                  >
                    {f.badge && (
                      <div style={{ position: "absolute", top: 12, right: 12, padding: "2px 8px", borderRadius: 6, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, color: "#000", fontSize: 9, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
                        {f.badge}
                      </div>
                    )}
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
                      { icon: "🔍", title: "Independent Analysis", desc: "No paid placements. Every score is algorithmically generated from public data." },
                      { icon: "🤖", title: "Bot Detection", desc: "Our algorithm exposes bot-inflated followings and fake engagement." },
                      { icon: "📊", title: "Public Data Only", desc: "We only analyze what X makes public — no special access, no ToS violations." },
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
                  Join <span style={{ color: C.primary }}>crypto's work marketplace.</span>
                </div>
                <div style={{ fontSize: 15, color: C.textSecondary, marginBottom: 28, maxWidth: 500, margin: "0 auto 28px" }}>
                  22+ open jobs. Zero middleman fees. Paid in USDC, USDT or SOL. Reputation-first hiring. Ship the way crypto was meant to work.
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={() => setTab("jobs")}
                    style={{
                      padding: "16px 32px", borderRadius: 12, border: "none",
                      background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                      color: "#000", fontSize: 14, fontWeight: 900,
                      fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                      letterSpacing: 0.3, transition: "all 0.2s",
                      boxShadow: "0 0 32px rgba(212, 255, 0, 0.25)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(212, 255, 0, 0.4)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(212, 255, 0, 0.25)"; }}
                  >💼 Browse Open Jobs</button>
                  <button
                    onClick={() => setTab("valuate")}
                    style={{
                      padding: "16px 32px", borderRadius: 12,
                      border: `1px solid ${C.primary}40`,
                      background: "rgba(212, 255, 0, 0.06)",
                      color: C.primary, fontSize: 14, fontWeight: 800,
                      fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                      letterSpacing: 0.3, transition: "all 0.2s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(212, 255, 0, 0.12)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(212, 255, 0, 0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
                  >🔍 Analyze Any Account</button>
                </div>
              </GlowCard>
            </Reveal>
          </div>
        )}

        {tab === "valuate" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.2)", marginBottom: 20 }}>
                <span style={{ fontSize: 12 }}>🔍</span>
                <span style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>Full Account Analysis</span>
              </div>
              <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0, letterSpacing: -1.5, lineHeight: 1.1 }}>
                Verify any <span style={{ color: C.primary }}>CT account.</span>
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 16, marginTop: 12, fontWeight: 400, maxWidth: 520, margin: "12px auto 0", lineHeight: 1.5 }}>
                Trust score, bot detection, CIB analysis, 90-day tracking, engagement forensics, and red flag signals — all in one lookup.
              </p>

              {/* What you'll see */}
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
                {[
                  "🛡️ Trust Score",
                  "🤖 Bot Detection",
                  "🕸️ CIB Analysis",
                  "📈 90-Day Timeline",
                  "💬 Engagement Forensics",
                  "🚩 Red Flags",
                ].map(chip => (
                  <div key={chip} style={{ padding: "5px 11px", borderRadius: 16, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
                    {chip}
                  </div>
                ))}
              </div>
            </div>

            {/* COMING SOON + WAITLIST */}
            <GlowCard glow style={{ maxWidth: 650, margin: "0 auto 24px", padding: "32px 28px", textAlign: "center", background: `linear-gradient(180deg, rgba(212, 255, 0, 0.04), rgba(0, 0, 0, 0.5))` }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 20, background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.25)", marginBottom: 16 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", boxShadow: "0 0 8px #fbbf24", animation: "pulse 2s ease-in-out infinite" }} />
                <span style={{ fontSize: 10, color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>API Temporarily Paused</span>
              </div>

              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1.5, marginBottom: 12 }}>
                Live lookup <span style={{ color: C.primary }}>opens soon.</span>
              </div>

              <p style={{ color: C.textSecondary, fontSize: 14, maxWidth: 460, margin: "0 auto 24px", lineHeight: 1.6 }}>
                We're polishing the Trust Score engine before turning on live lookups. Join the waitlist for early access — first 500 signups get priority when we open the floodgates.
              </p>

              {!waitlistSubmitted ? (
                <>
                  <div style={{ display: "flex", gap: 8, maxWidth: 400, margin: "0 auto 14px", flexWrap: "wrap" }}>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={waitlistEmail}
                      onChange={e => setWaitlistEmail(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") submitWaitlist(); }}
                      style={{
                        flex: 1, minWidth: 200, padding: "13px 16px",
                        background: "rgba(0, 0, 0, 0.9)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: 10, color: C.textPrimary,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                        outline: "none", transition: "border 0.2s",
                      }}
                      onFocus={e => e.target.style.borderColor = C.primary}
                      onBlur={e => e.target.style.borderColor = "rgba(255, 255, 255, 0.12)"}
                    />
                    <button
                      onClick={submitWaitlist}
                      disabled={!waitlistEmail.includes("@") || waitlistLoading}
                      style={{
                        padding: "13px 22px", borderRadius: 10, border: "none",
                        background: (!waitlistEmail.includes("@") || waitlistLoading) ? "rgba(255, 255, 255, 0.05)" : `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                        color: (!waitlistEmail.includes("@") || waitlistLoading) ? C.textMuted : "#000",
                        fontSize: 13, fontWeight: 900,
                        fontFamily: "'Outfit', sans-serif",
                        cursor: (!waitlistEmail.includes("@") || waitlistLoading) ? "not-allowed" : "pointer",
                        letterSpacing: 0.3, transition: "all 0.2s",
                      }}
                    >{waitlistLoading ? "⏳ Saving..." : "🚀 Get Early Access"}</button>
                  </div>
                  {waitlistError && (
                    <div style={{ fontSize: 12, color: "#ef4444", fontFamily: "'JetBrains Mono', monospace", marginTop: 10, marginBottom: 4 }}>⚠ {waitlistError}</div>
                  )}
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
                    No spam. One email when we go live. Unsubscribe anytime.
                  </div>
                </>
              ) : (
                <div style={{ padding: "20px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: 12, maxWidth: 400, margin: "0 auto" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#10b981", marginBottom: 6 }}>You're on the list!</div>
                  <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>
                    We'll email <span style={{ color: C.primary }}>{waitlistEmail}</span> the second live lookups go live.
                  </div>
                </div>
              )}

              {/* What you can still do */}
              <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>Meanwhile, explore Web3Gigs</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                  {[
                    { icon: "🛡️", label: "Trust Score", tab: "trust" },
                    { icon: "💼", label: "Browse Jobs", tab: "jobs" },
                    { icon: "🕸️", label: "CIB Detection", tab: "cib" },
                    { icon: "🏆", label: "Leaderboards", tab: "leaderboard" },
                  ].map(link => (
                    <button
                      key={link.label}
                      onClick={() => setTab(link.tab)}
                      style={{
                        padding: "10px 12px", borderRadius: 10,
                        background: "rgba(0, 0, 0, 0.4)",
                        border: "1px solid rgba(255, 255, 255, 0.06)",
                        color: C.textSecondary,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                        cursor: "pointer", transition: "all 0.2s",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.primary}40`; e.currentTarget.style.color = C.primary; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)"; e.currentTarget.style.color = C.textSecondary; }}
                    >
                      <span>{link.icon}</span>
                      <span>{link.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </GlowCard>

            {result && (
              <div ref={resultRef} style={{ maxWidth: 650, margin: "0 auto" }}>
                {/* Hero: Trust Score (primary) + Valuation (secondary) */}
                {trustResult && (
                  <GlowCard glow style={{ marginBottom: 20, border: `1px solid ${trustResult.labelColor}40`, padding: "28px", textAlign: "center", background: `linear-gradient(180deg, ${trustResult.labelColor}06, transparent)` }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>🛡️ Trust Score</div>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 72, fontWeight: 900, color: trustResult.labelColor, letterSpacing: -3, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{trustResult.trustScore}</span>
                      <span style={{ fontSize: 18, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>/ 100</span>
                    </div>
                    <div style={{
                      display: "inline-block", padding: "8px 18px", borderRadius: 10,
                      background: `${trustResult.labelColor}15`, border: `1px solid ${trustResult.labelColor}40`,
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 800,
                      color: trustResult.labelColor, letterSpacing: 2, marginBottom: 20,
                    }}>{trustResult.label}</div>

                    {/* Secondary stats row */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 4 }}>
                      <div style={{ padding: "10px 8px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Followers</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{(form.followers || result.followers || 0).toLocaleString()}</div>
                      </div>
                      <div style={{ padding: "10px 8px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Engagement</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{result.engagementRate}%</div>
                      </div>
                      <div style={{ padding: "10px 8px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Bot Followers</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: trustResult.estimatedBotPct > 30 ? "#ef4444" : trustResult.estimatedBotPct > 15 ? "#f59e0b" : "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>~{trustResult.estimatedBotPct}%</div>
                      </div>
                    </div>
                  </GlowCard>
                )}

                {/* Trust Score detail card */}
                {trustResult && (
                  <GlowCard glow style={{ marginBottom: 20, border: `1px solid ${trustResult.labelColor}30` }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>Trust Breakdown</div>

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
                        {trustResult.trustScore < 40 && "This account shows strong signs of manipulation or bot inflation. The follower count is likely misleading. Avoid engaging, trusting, or hiring this account without verification."}
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
                    <div style={{ fontSize: 12, color: C.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>💡 Flex your score</div>
                    <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 4 }}>Share your trust score on X to prove you're the real deal. Screenshot this card or tweet your result.</div>
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
                Don't hire <span style={{ color: C.primary }}>bots or scammers.</span>
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 17, marginTop: 16, maxWidth: 560, margin: "16px auto 0", lineHeight: 1.5 }}>
                Every CT account gets scored 0-100 on authenticity. Trust Score gatekeeps who can apply to your jobs — catching bot followers, engagement pods, F4F rings, and fake activity before they waste your budget.
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
                Hard to. Here's why Web3Gigs' scoring system holds up where others don't:
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
              <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Every CT account gets a shareable profile at web3gigs.app/@username</p>
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
                    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Example Account</div>
                    <Pill text="✓ Verified" color={C.accent} />
                    <Pill text="SUPREME 91" color="#10b981" />
                  </div>
                  <div style={{ fontSize: 14, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>@ExampleAnon</div>
                  <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 8, lineHeight: 1.5 }}>Solana dev · On-chain analyst · CT native · Building in crypto</div>
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
                  ["Tier", "SUPREME", "#10b981"],
                  ["Followers", "18.4k", C.textPrimary],
                  ["Engagement", "3.8%", C.primary],
                  ["Bot Est.", "8%", "#10b981"],
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
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#000" }}>CT</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: -0.3 }}>Web3Gigs</div>
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
                    }}>E</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>Example Account</span>
                        <span style={{ fontSize: 14, color: C.accent }}>✓</span>
                      </div>
                      <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>@ExampleAnon</div>
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
                      <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>🏆 Tier</div>
                      <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "#10b981", fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>SUPREME</div>
                      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>Top 8% of CT</div>
                    </div>
                  </div>

                  {/* Authenticity signals */}
                  <div style={{ marginBottom: 18, padding: "14px 14px", background: "rgba(0, 0, 0, 0.3)", borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                    <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>✅ Authenticity Verified</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { icon: "🤖", label: "Bot-free audience", detail: "Only 8% estimated bot followers" },
                        { icon: "💬", label: "Real engagement", detail: "High reply-to-like ratio" },
                        { icon: "📈", label: "Organic growth", detail: "No anomaly spikes in 90d" },
                        { icon: "🛡️", label: "CIB-clean", detail: "Not part of any detected pod" },
                      ].map(sig => (
                        <div key={sig.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                          <span style={{ fontSize: 12 }}>{sig.icon}</span>
                          <span style={{ color: "#fff", fontWeight: 700, minWidth: 140 }}>{sig.label}</span>
                          <span style={{ color: C.textMuted, fontSize: 10 }}>{sig.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
                    {[
                      ["Followers", "18.4k"],
                      ["Engagement", "3.8%"],
                      ["Bot Est.", "8%"],
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
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>web3gigs.app/@ExampleAnon</div>
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
                ℹ️ Share card is served as an OG image — when you paste your web3gigs.app/@handle link on X, this card auto-attaches as the preview.
              </div>
            </GlowCard>

            {/* Handshake History */}
            <GlowCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>🤝 Handshake History</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Completed jobs build public reputation</div>
                </div>
                <Pill text="Coming with Jobs V1" color={C.textMuted} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                {[
                  { label: "Completed", val: "0", icon: "✅" },
                  { label: "In Progress", val: "0", icon: "🔄" },
                  { label: "Disputes", val: "0", icon: "⚠️" },
                  { label: "Rating", val: "N/A", icon: "⭐" },
                ].map(stat => (
                  <div key={stat.label} style={{ padding: "12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{stat.icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{stat.val}</div>
                    <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </GlowCard>
          </div>
        )}


        {/* ─── JOBS / HANDSHAKE TAB ────────────────────────── */}
        {tab === "jobs" && (
          <div>
            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.2)", marginBottom: 16 }}>
                <span style={{ fontSize: 12 }}>🤝</span>
                <span style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>Handshake · Beta</span>
              </div>
              <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0, letterSpacing: -1.5, lineHeight: 1.1 }}>
                Hire crypto's best.<br />
                <span style={{ color: C.primary }}>Without the scams.</span>
              </h1>
              <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 16, maxWidth: 580, margin: "16px auto 0", lineHeight: 1.5 }}>
                The crypto work marketplace. Hire devs, designers, auditors, and writers — or KOLs, shitposters, and Spaces hosts. Trust-verified. Public on-chain handshakes. Escrow V2 soon.
              </p>

              {/* How it works strip */}
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24, flexWrap: "wrap" }}>
                {[
                  { icon: "📝", label: "Post or apply" },
                  { icon: "🤝", label: "Sign handshake" },
                  { icon: "✅", label: "Deliver work" },
                  { icon: "⭐", label: "Build reputation" },
                ].map(step => (
                  <div key={step.label} style={{ padding: "6px 12px", borderRadius: 16, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{step.icon}</span>
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SUB-TAB TOGGLE */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 4, background: "rgba(0, 0, 0, 0.5)", borderRadius: 14, padding: 4, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                {[
                  { id: "crypto", label: "💼 Crypto Work", desc: "Dev, design, audits, writing" },
                  { id: "ct", label: "🎭 CT / KOL Jobs", desc: "Shitposts, threads, raids, spaces" },
                ].map(st => (
                  <button
                    key={st.id}
                    onClick={() => { setJobsType(st.id); setJobsFilter("all"); }}
                    style={{
                      padding: "10px 20px", borderRadius: 10, border: "none",
                      background: jobsType === st.id ? `linear-gradient(135deg, ${C.primary}15, ${C.accent}15)` : "transparent",
                      color: jobsType === st.id ? C.primary : C.textMuted,
                      fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 800,
                      cursor: "pointer", letterSpacing: 0.3, transition: "all 0.2s",
                      border: `1px solid ${jobsType === st.id ? `${C.primary}40` : "transparent"}`,
                      textAlign: "left",
                    }}
                  >
                    <div>{st.label}</div>
                    <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: C.textMuted, marginTop: 2, fontWeight: 500, letterSpacing: 0.5 }}>{st.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* V1 Beta disclaimer */}
            <GlowCard style={{ marginBottom: 24, padding: "16px 20px", background: "rgba(245, 158, 11, 0.04)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>V1 — Handshake Mode (No Custody)</div>
                  <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6 }}>
                    Web3Gigs doesn't hold funds yet. V1 uses <strong style={{ color: C.primary }}>on-chain handshakes</strong> — both parties sign a public commitment. Trust scores + community reputation enforce delivery. Multisig escrow (V2) and smart contract escrow (V3) coming soon.
                  </div>
                </div>
              </div>
            </GlowCard>

            {/* Top action bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(jobsType === "ct" ? JOB_CATEGORIES_CT : JOB_CATEGORIES_CRYPTO).map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setJobsFilter(cat.id)}
                    style={{
                      padding: "7px 14px", borderRadius: 10,
                      background: jobsFilter === cat.id ? "rgba(212, 255, 0, 0.12)" : "rgba(0, 0, 0, 0.5)",
                      color: jobsFilter === cat.id ? C.primary : C.textMuted,
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                      cursor: "pointer", letterSpacing: 0.5, transition: "all 0.2s",
                      border: `1px solid ${jobsFilter === cat.id ? `${C.primary}40` : "rgba(255, 255, 255, 0.06)"}`,
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowPostJob(true)}
                style={{
                  padding: "10px 20px", borderRadius: 10, border: "none",
                  background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                  color: "#000", fontSize: 12, fontWeight: 900,
                  fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                  letterSpacing: 0.3, transition: "all 0.2s",
                  boxShadow: "0 0 20px rgba(212, 255, 0, 0.2)",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >+ Post a Job</button>
            </div>

            {/* Jobs grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 40 }}>
              {MOCK_JOBS
                .filter(j => j.jobType === jobsType && (jobsFilter === "all" || j.category === jobsFilter))
                .map(job => {
                  const statusColor = job.status === "open" ? "#10b981" : job.status === "in_progress" ? "#fbbf24" : C.textMuted;
                  const statusLabel = job.status === "open" ? "OPEN" : job.status === "in_progress" ? "IN PROGRESS" : "COMPLETED";
                  const posterColor = job.posterTrust >= 85 ? "#10b981" : job.posterTrust >= 70 ? "#34d399" : job.posterTrust >= 55 ? "#fbbf24" : "#f97316";
                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      style={{
                        padding: 20, borderRadius: 14,
                        background: "rgba(18, 18, 18, 0.7)",
                        border: "1px solid rgba(255, 255, 255, 0.06)",
                        cursor: "pointer", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                        display: "flex", flexDirection: "column", gap: 12,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(212, 255, 0, 0.3)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.background = "rgba(25, 25, 25, 0.9)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = "rgba(18, 18, 18, 0.7)"; }}
                    >
                      {/* Top row: status + category */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
                          <span style={{ fontSize: 9, color: statusColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 1.5 }}>{statusLabel}</span>
                        </div>
                        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{job.postedAgo}</span>
                      </div>

                      {/* Title + budget */}
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginBottom: 8 }}>{job.title}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 24, fontWeight: 900, color: C.primary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.5 }}>${job.budget.toLocaleString()}</span>
                          <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{job.budgetCurrency} · {job.deadline}</span>
                        </div>
                      </div>

                      {/* Poster info */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg, #333, #111)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#fff" }}>{job.poster[1].toUpperCase()}</div>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{job.poster}</span>
                          {job.posterVerified && <span style={{ fontSize: 11, color: C.accent }}>✓</span>}
                        </div>
                        <div style={{ padding: "3px 8px", borderRadius: 6, background: `${posterColor}15`, border: `1px solid ${posterColor}40`, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 800, color: posterColor }}>{job.posterTrust}</div>
                      </div>

                      {/* Bottom: proposals + min trust */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                        <span>📬 {job.proposals} proposals</span>
                        <span>🛡️ Min trust: {job.minTrustScore}</span>
                      </div>

                      {/* Tags */}
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {job.tags.map(tag => (
                          <span key={tag} style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(212, 255, 0, 0.05)", border: "1px solid rgba(212, 255, 0, 0.15)", fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace" }}>#{tag}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Empty state message if no jobs match filter */}
            {MOCK_JOBS.filter(j => j.jobType === jobsType && (jobsFilter === "all" || j.category === jobsFilter)).length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                No jobs in this category yet. Try "All" or <span style={{ color: C.primary, cursor: "pointer" }} onClick={() => setShowPostJob(true)}>post the first one →</span>
              </div>
            )}

            {/* How Handshake Works card */}
            <GlowCard glow style={{ marginBottom: 20, padding: "28px" }}>
              <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>🤝 How Handshake Works</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                {[
                  { n: "1", title: "Post or Apply", desc: "Companies post jobs with budget, deadline, and minimum trust score. Applicants send proposals with their Trust Score credentials attached." },
                  { n: "2", title: "Sign Handshake", desc: "Both parties sign a public commitment on Solana — free, gasless. Terms become tamper-proof and publicly verifiable." },
                  { n: "3", title: "Work & Deliver", desc: "Worker delivers per the agreed deliverables. Buyer reviews. Both parties mark the handshake as complete." },
                  { n: "4", title: "Reputation Compounds", desc: "Successful handshakes boost both parties' trust scores. Disputes get arbitrated publicly by the community." },
                ].map(step => (
                  <div key={step.n}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(212, 255, 0, 0.1)", border: `1px solid ${C.primary}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: C.primary, fontFamily: "'JetBrains Mono', monospace" }}>{step.n}</div>
                      <span style={{ fontSize: 13, fontWeight: 800 }}>{step.title}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5, marginLeft: 32 }}>{step.desc}</div>
                  </div>
                ))}
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
                    <div style={{ fontSize: 14, fontWeight: 700 }}>Forensics Report · @ExampleAnon</div>
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
                  ["📧 Email", "your@email.com", false, false],
                  ["📱 Telegram", "@yourhandle", false, false],
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

      {/* ─── JOB DETAIL MODAL ─────────────────────────────── */}
      {selectedJob && (() => {
        const posterColor = selectedJob.posterTrust >= 85 ? "#10b981" : selectedJob.posterTrust >= 70 ? "#34d399" : selectedJob.posterTrust >= 55 ? "#fbbf24" : "#f97316";
        const statusColor = selectedJob.status === "open" ? "#10b981" : selectedJob.status === "in_progress" ? "#fbbf24" : C.textMuted;
        const statusLabel = selectedJob.status === "open" ? "OPEN" : selectedJob.status === "in_progress" ? "IN PROGRESS" : "COMPLETED";
        return (
          <div
            onClick={() => { setSelectedJob(null); setProposalText(""); }}
            style={{
              position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.85)",
              backdropFilter: "blur(8px)", zIndex: 100,
              display: "flex", alignItems: "flex-start", justifyContent: "center",
              padding: "40px 20px", overflowY: "auto", animation: "fadeIn 0.2s ease-out",
            }}
          >
            <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: 680, width: "100%",
                background: "rgba(10, 10, 10, 0.98)",
                border: `1px solid ${C.borderHover}`,
                borderRadius: 20, padding: 0,
                boxShadow: "0 40px 100px rgba(0, 0, 0, 0.8), 0 0 60px rgba(212, 255, 0, 0.1)",
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div style={{ padding: "24px 28px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), transparent)`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
                    <span style={{ fontSize: 9, color: statusColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 1.5 }}>{statusLabel}</span>
                    <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>· {selectedJob.category}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2 }}>{selectedJob.title}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 6 }}>Posted {selectedJob.postedAgo} · {selectedJob.proposals} proposals</div>
                </div>
                <button onClick={() => { setSelectedJob(null); setProposalText(""); }} style={{
                  width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
                  fontSize: 16, cursor: "pointer", fontFamily: "'Outfit', sans-serif", flexShrink: 0,
                }}>✕</button>
              </div>

              {/* Hero Budget */}
              <div style={{ padding: "24px 28px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Budget</div>
                <div style={{ fontSize: 52, fontWeight: 900, color: C.primary, letterSpacing: -2, fontFamily: "'JetBrains Mono', monospace" }}>${selectedJob.budget.toLocaleString()}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>{selectedJob.budgetCurrency} · Deadline: {selectedJob.deadline}</div>
              </div>

              <div style={{ padding: "24px 28px" }}>
                {/* Description */}
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>📝 Description</div>
                <div style={{ padding: "14px 16px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, marginBottom: 20, fontSize: 13, color: C.textSecondary, lineHeight: 1.6, border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                  {selectedJob.description}
                </div>

                {/* Deliverables */}
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>✅ Deliverables</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                  {selectedJob.deliverables.map((item, i) => (
                    <div key={i} style={{ padding: "10px 12px", background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "#10b981", fontWeight: 900 }}>✓</span>
                      <span style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>{item}</span>
                    </div>
                  ))}
                </div>

                {/* Requirements */}
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>🛡️ Requirements</div>
                <div style={{ padding: "12px 14px", background: "rgba(212, 255, 0, 0.04)", border: "1px solid rgba(212, 255, 0, 0.15)", borderRadius: 8, fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginBottom: 20, lineHeight: 1.6 }}>
                  Applicants must have a Trust Score of <strong style={{ color: C.primary }}>{selectedJob.minTrustScore}+</strong> to submit a proposal.
                </div>

                {/* Job Poster */}
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>👤 Posted By</div>
                <div style={{ padding: "14px 16px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg, #333, #111)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#fff" }}>{selectedJob.poster[1].toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        {selectedJob.poster}
                        {selectedJob.posterVerified && <span style={{ fontSize: 12, color: C.accent }}>✓</span>}
                      </div>
                      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>3 jobs posted · 2 completed · 0 disputes</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ padding: "4px 10px", borderRadius: 8, background: `${posterColor}15`, border: `1px solid ${posterColor}40`, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 800, color: posterColor }}>Trust {selectedJob.posterTrust}</div>
                  </div>
                </div>

                {/* Tags */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
                  {selectedJob.tags.map(tag => (
                    <span key={tag} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(212, 255, 0, 0.05)", border: "1px solid rgba(212, 255, 0, 0.15)", fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace" }}>#{tag}</span>
                  ))}
                </div>

                {/* Submit Proposal */}
                {selectedJob.status === "open" && (
                  <>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>📬 Submit Proposal</div>
                    <textarea
                      value={proposalText}
                      onChange={e => setProposalText(e.target.value)}
                      placeholder="Why are you right for this job? Include relevant work, timelines, and what makes you trustworthy. Your Trust Score will be auto-attached."
                      style={{
                        width: "100%", minHeight: 100, padding: "12px 14px",
                        background: "rgba(0, 0, 0, 0.9)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: 10, color: C.textPrimary,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                        resize: "vertical", outline: "none", marginBottom: 12,
                        transition: "border 0.2s",
                      }}
                      onFocus={e => e.target.style.borderColor = C.primary}
                      onBlur={e => e.target.style.borderColor = "rgba(255, 255, 255, 0.12)"}
                    />
                    <button
                      disabled={!proposalText.trim()}
                      style={{
                        width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
                        background: !proposalText.trim() ? "rgba(255, 255, 255, 0.05)" : `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                        color: !proposalText.trim() ? C.textMuted : "#000",
                        fontSize: 14, fontWeight: 900,
                        fontFamily: "'Outfit', sans-serif",
                        cursor: !proposalText.trim() ? "not-allowed" : "pointer",
                        letterSpacing: 0.3, transition: "all 0.2s",
                      }}
                    >🤝 Sign Handshake & Submit</button>

                    <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, textAlign: "center" }}>
                      🤝 Submitting creates a free on-chain commitment. If selected, both parties sign a public handshake. Trust scores enforce delivery.
                    </div>
                  </>
                )}

                {selectedJob.status === "in_progress" && (
                  <div style={{ padding: "16px 18px", background: "rgba(251, 191, 36, 0.06)", border: "1px solid rgba(251, 191, 36, 0.2)", borderRadius: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 13, color: "#fbbf24", fontWeight: 800, marginBottom: 4 }}>Already in progress</div>
                    <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>This job has an active handshake. Check back when it's complete to see the outcome.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── POST A JOB MODAL ─────────────────────────────── */}
      {showPostJob && (
        <div
          onClick={() => setShowPostJob(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(8px)", zIndex: 100,
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "40px 20px", overflowY: "auto", animation: "fadeIn 0.2s ease-out",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 600, width: "100%",
              background: "rgba(10, 10, 10, 0.98)",
              border: `1px solid ${C.borderHover}`,
              borderRadius: 20, padding: 0,
              boxShadow: "0 40px 100px rgba(0, 0, 0, 0.8), 0 0 60px rgba(212, 255, 0, 0.1)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "24px 28px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), transparent)`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>💼 New Job · Handshake Mode</div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Post a job on Web3Gigs</div>
              </div>
              <button onClick={() => setShowPostJob(false)} style={{
                width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
                fontSize: 16, cursor: "pointer", flexShrink: 0,
              }}>✕</button>
            </div>

            <div style={{ padding: "24px 28px" }}>
              {/* Coming Soon treatment */}
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: -0.5 }}>Job posting opens soon</div>
                <div style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, maxWidth: 400, margin: "0 auto 24px" }}>
                  We're polishing the post flow before opening it up. In the meantime, you can browse open jobs and see how Handshake works.
                </div>

                {/* Waitlist placeholder */}
                <div style={{ display: "flex", gap: 8, maxWidth: 360, margin: "0 auto", flexWrap: "wrap" }}>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    style={{
                      flex: 1, minWidth: 180, padding: "12px 14px",
                      background: "rgba(0, 0, 0, 0.9)",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      borderRadius: 10, color: C.textPrimary,
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                      outline: "none",
                    }}
                  />
                  <button style={{
                    padding: "12px 18px", borderRadius: 10, border: "none",
                    background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                    color: "#000", fontSize: 12, fontWeight: 900,
                    fontFamily: "'Outfit', sans-serif", cursor: "pointer", letterSpacing: 0.3,
                  }}>Notify Me</button>
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 16, letterSpacing: 1 }}>
                  First 100 to signup get priority access + free featured listing
                </div>
              </div>

              {/* What to expect */}
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>What you'll be able to do</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    "Post jobs with budget, deadline, and deliverables",
                    "Set minimum Trust Score gate to filter applicants",
                    "Review proposals with attached reputation data",
                    "Sign public on-chain handshake with selected worker",
                    "Release reputation rewards when work is completed",
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
                      <span style={{ color: C.primary, fontWeight: 900 }}>→</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── WAITLIST MODAL ───────────────────────────────── */}
      {showWaitlistModal && (
        <div
          onClick={() => setShowWaitlistModal(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(8px)", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px", overflowY: "auto", animation: "fadeIn 0.2s ease-out",
          }}
        >
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 480, width: "100%",
              background: "rgba(10, 10, 10, 0.98)",
              border: `1px solid ${C.borderHover}`,
              borderRadius: 20, padding: 0,
              boxShadow: "0 40px 100px rgba(0, 0, 0, 0.8), 0 0 60px rgba(212, 255, 0, 0.1)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{ padding: "24px 28px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), transparent)`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>💌 Early Access</div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>Join the Web3Gigs waitlist</div>
              </div>
              <button onClick={() => setShowWaitlistModal(false)} style={{
                width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
                fontSize: 16, cursor: "pointer", flexShrink: 0,
              }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: "24px 28px" }}>
              {!waitlistSubmitted ? (
                <>
                  <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, marginTop: 0, marginBottom: 20 }}>
                    Be first to post jobs, hire talent, and sign Handshakes when we go live. First 500 signups get priority access + free featured listings.
                  </p>

                  <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={waitlistEmail}
                      onChange={e => setWaitlistEmail(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") submitWaitlist("nav"); }}
                      autoFocus
                      style={{
                        flex: 1, minWidth: 200, padding: "13px 16px",
                        background: "rgba(0, 0, 0, 0.9)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: 10, color: C.textPrimary,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                        outline: "none", transition: "border 0.2s",
                      }}
                      onFocus={e => e.target.style.borderColor = C.primary}
                      onBlur={e => e.target.style.borderColor = "rgba(255, 255, 255, 0.12)"}
                    />
                    <button
                      onClick={() => submitWaitlist("nav")}
                      disabled={!waitlistEmail.includes("@") || waitlistLoading}
                      style={{
                        padding: "13px 22px", borderRadius: 10, border: "none",
                        background: (!waitlistEmail.includes("@") || waitlistLoading) ? "rgba(255, 255, 255, 0.05)" : `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                        color: (!waitlistEmail.includes("@") || waitlistLoading) ? C.textMuted : "#000",
                        fontSize: 13, fontWeight: 900,
                        fontFamily: "'Outfit', sans-serif",
                        cursor: (!waitlistEmail.includes("@") || waitlistLoading) ? "not-allowed" : "pointer",
                        letterSpacing: 0.3, transition: "all 0.2s",
                      }}
                    >{waitlistLoading ? "⏳" : "🚀 Join"}</button>
                  </div>

                  {waitlistError && (
                    <div style={{ fontSize: 12, color: "#ef4444", fontFamily: "'JetBrains Mono', monospace", marginTop: 6, marginBottom: 6 }}>⚠ {waitlistError}</div>
                  )}

                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
                    No spam. One email when we go live. Unsubscribe anytime.
                  </div>

                  {/* What you get */}
                  <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                    <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>What you'll get first access to</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        "Post trust-verified jobs (Crypto + CT)",
                        "Apply to jobs with your Trust Score attached",
                        "Sign on-chain Handshakes with buyers",
                        "Paid in USDC — no middleman, no 20% cut",
                      ].map((item, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
                          <span style={{ color: C.primary, fontWeight: 900 }}>→</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: "20px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981", marginBottom: 8 }}>You're on the list!</div>
                  <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace" }}>
                    We'll email <span style={{ color: C.primary }}>{waitlistEmail}</span> the second Web3Gigs goes live.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", padding: "20px 24px", marginTop: 60, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
          Web3Gigs © 2026 · Trust scores are estimates based on public metrics · Not financial advice
        </div>
      </div>
    </div>
  );
}
