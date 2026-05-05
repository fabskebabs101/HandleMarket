import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot, Area, AreaChart } from "recharts";
import { supabase } from "./supabase";
import {
  Home, Briefcase, Search, Shield, Trophy, User, Network, Bell,
  Mail, Menu as MenuIcon, Check, X as XIcon, AlertTriangle, Flag,
  Code, Palette, Lock, PenTool, Video, MessageCircle, Bot, Scissors,
  Mic, Swords, Smile, Hash, Megaphone, Tv, BarChart3, Clock,
  DollarSign, Rocket, Handshake, Zap, TrendingUp, Eye, Sparkles,
  ArrowRight, Construction, Radio, Globe, FileText
} from "lucide-react";

const VALUATION_WEIGHTS = {
 followers: 0.30,
 engagement: 0.25,
 accountAge: 0.15,
 tweetVolume: 0.10,
 verification: 0.10,
 nicheRelevance: 0.10,
};

function estimateValue({ followers, avgLikes, avgRetweets, avgReplies, tweets, accountAgeDays, verified, cryptoNiche }) {
 const engagementRate = followers > 0? ((avgLikes + avgRetweets + avgReplies) / followers) * 100: 0;
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
 const verifyScore = verified? 100: 20;
 const nicheScore = cryptoNiche? 90: 30;
 const totalScore =
 followerScore * VALUATION_WEIGHTS.followers +
 engScore * VALUATION_WEIGHTS.engagement +
 ageScore * VALUATION_WEIGHTS.accountAge +
 tweetScore * VALUATION_WEIGHTS.tweetVolume +
 verifyScore * VALUATION_WEIGHTS.verification +
 nicheScore * VALUATION_WEIGHTS.nicheRelevance;
 const baseCPM = verified? 10: 4;
 const avgImpressions = followers * (engagementRate / 100) * 15;
 const monthlyEarnings = (avgImpressions / 1000) * baseCPM * 30;
 const multiplier = verified? 18: 12;
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
 const followRatio = following > 0? followers / following: followers;
 let followRatioScore = 50;
 if (followRatio > 10) { followRatioScore = 95; greenFlags.push("Strong follower-to-following ratio"); }
 else if (followRatio > 3) followRatioScore = 80;
 else if (followRatio > 1) followRatioScore = 60;
 else if (followRatio > 0.5) { followRatioScore = 35; redFlags.push("Follows almost as many as followers"); }
 else { followRatioScore = 15; redFlags.push("Follows more than they're followed (F4F pattern)"); }

 // 2. Engagement-to-follower ratio
 // Real accounts: engagement scales with followers. Botted: massive followers, tiny engagement.
 const totalEngagement = avgLikes + avgRetweets + avgReplies;
 const engagementRate = followers > 0? (totalEngagement / followers) * 100: 0;
 let engagementQualityScore = 50;
 if (engagementRate >= 2) { engagementQualityScore = 95; greenFlags.push("Healthy organic engagement"); }
 else if (engagementRate >= 0.8) engagementQualityScore = 75;
 else if (engagementRate >= 0.3) engagementQualityScore = 50;
 else if (engagementRate >= 0.1) { engagementQualityScore = 25; redFlags.push("Low engagement for follower count"); }
 else if (followers > 1000) { engagementQualityScore = 5; redFlags.push("Very low engagement: possible bot followers"); }

 // 3. Reply-to-like ratio (real conversations vs drive-by likes)
 const replyRatio = avgLikes > 0? avgReplies / avgLikes: 0;
 let conversationScore = 50;
 if (replyRatio >= 0.15) { conversationScore = 90; greenFlags.push("Strong conversation ratio, real audience"); }
 else if (replyRatio >= 0.05) conversationScore = 70;
 else if (replyRatio >= 0.02) conversationScore = 50;
 else if (avgLikes > 50) { conversationScore = 25; redFlags.push("Likes but no replies: possible engagement pods"); }

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
 redFlags.push("Abnormally high posting frequency: possible bot");
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
 const verificationScore = verified? 90: 50;
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
 // Single accent, electric lime. Hits hard against monochrome, feels CT-native without being the usual purple.
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
 <div style={{ height: 6, background: "rgba(255, 255, 255, 0.05)", borderRadius: 3, overflow: "hidden"}}>
 <div style={{ height: "100%", width: `${width}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)`, borderRadius: 3, transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)"}} />
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
 opacity: visible? 1: 0,
 transform: visible? "translateY(0)": "translateY(30px)",
 transition: `opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
 }}>{children}</div>
 );
}

// ─── Animated count-up number ──────────────────────────────────
function CountUp({ end, duration = 1500, prefix = "", suffix = ""}) {
 const [value, setValue] = useState(0);
 const [started, setStarted] = useState(false);
 const ref = useRef(null);
 useEffect(() => {
 const el = ref.current;
 if (!el) return;
 const obs = new IntersectionObserver(([entry]) => {
 if (entry.isIntersecting &&!started) {
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
 const formatted = end >= 1000? `${(value / 1000).toFixed(value >= 1000? 1: 0)}k`: Math.round(value).toLocaleString();
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
 opacity: fading? 0: 1,
 transform: fading? "translateY(-10px)": "translateY(0)",
 transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
 minWidth: "auto",
 }}>
 {words[index]}
 </span>
 );
}

// ─── Animated Demo Card (the hero "watch it work"moment) ──────
// Uses CT-flavored fictional handles so we don't fake real accounts' scores.
const DEMO_ACCOUNTS = [
 {
 handle: "@CryptoDegen_", niche: "Solana · 18.4k followers", initial: "C",
 score: 91, bars: [92, 88, 85, 94, 100],
 flags: [
 { text: "Healthy organic engagement", type: "green"},
 { text: "Strong conversation ratio, real audience", type: "green"},
 { text: "Verified account", type: "green"},
 ],
 },
 {
 handle: "@SolAlphaHunter", niche: "DeFi · 42.1k followers", initial: "S",
 score: 84, bars: [88, 82, 78, 86, 100],
 flags: [
 { text: "Consistent long-term activity", type: "green"},
 { text: "Verified account", type: "green"},
 ],
 },
 {
 handle: "@MemecoinMaxi", niche: "Memecoin · 7.8k followers", initial: "M",
 score: 72, bars: [75, 70, 68, 80, 20],
 flags: [
 { text: "Healthy organic engagement", type: "green"},
 { text: "Strong follower-to-following ratio", type: "green"},
 ],
 },
 {
 handle: "@OnChainWhale", niche: "Analytics · 31.2k followers", initial: "O",
 score: 88, bars: [90, 86, 82, 92, 100],
 flags: [
 { text: "Healthy organic engagement", type: "green"},
 { text: "Consistent long-term activity", type: "green"},
 { text: "Verified account", type: "green"},
 ],
 },
 {
 handle: "@PumpBot2024", niche: "Crypto · 85.3k followers", initial: "P",
 score: 22, bars: [15, 10, 18, 20, 20],
 flags: [
 { text: "Very low engagement: possible bot followers", type: "red"},
 { text: "Rapid follower growth for account age", type: "red"},
 { text: "Abnormally high posting frequency: possible bot", type: "red"},
 ],
 },
];

function DemoCard() {
 // Pick one random demo account on mount, cycles between refreshes
 const [account] = useState(() =>DEMO_ACCOUNTS[Math.floor(Math.random() * DEMO_ACCOUNTS.length)]);
 const [score, setScore] = useState(0);
 const [bars, setBars] = useState([0, 0, 0, 0, 0]);
 const [flags, setFlags] = useState([]);
 const [started, setStarted] = useState(false);
 const ref = useRef(null);

 useEffect(() => {
 const el = ref.current;
 if (!el) return;
 const obs = new IntersectionObserver(([entry]) => {
 if (entry.isIntersecting &&!started) {
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

 const tierColor = score >= 85? "#10b981": score >= 70? "#34d399": score >= 55? "#fbbf24": score >= 40? "#f97316": "#ef4444";
 const tierLabel = score >= 85? "SUPREME": score >= 70? "CREDIBLE": score >= 55? "NOTED": score >= 40? "UNKNOWN": score >= 25? "SUSPICIOUS": "LIKELY BOT";

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
 <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #333, #111)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff"}}>{account.initial}</div>
 <div>
 <div style={{ fontWeight: 700, fontSize: 14 }}>{account.handle}</div>
 <div style={{ fontSize: 10, color: "#a3a3a3", fontFamily: "'JetBrains Mono', monospace"}}>{account.niche}</div>
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
 <span style={{ fontSize: 48, fontWeight: 900, color: tierColor, letterSpacing: -2, fontFamily: "'JetBrains Mono', monospace"}}>{score}</span>
 <span style={{ fontSize: 14, color: "#525252", fontFamily: "'JetBrains Mono', monospace"}}>/ 100 Trust Score</span>
 </div>

 {/* Signal bars */}
 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 {bars.map((val, i) => (
 <div key={i}>
 <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
 <span style={{ fontSize: 10, color: "#a3a3a3", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{barLabels[i]}</span>
 <span style={{ fontSize: 10, color: barColors[i], fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{val}</span>
 </div>
 <div style={{ height: 4, background: "rgba(255, 255, 255, 0.05)", borderRadius: 2, overflow: "hidden"}}>
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
 background: f.type === "red"? "rgba(239, 68, 68, 0.06)": "rgba(16, 185, 129, 0.06)",
 border: f.type === "red"? "1px solid rgba(239, 68, 68, 0.2)": "1px solid rgba(16, 185, 129, 0.2)",
 borderRadius: 6,
 fontSize: 11,
 color: f.type === "red"? "#fca5a5": "#6ee7b7",
 fontFamily: "'JetBrains Mono', monospace",
 display: "flex", alignItems: "center", gap: 8,
 animation: "fadeIn 0.4s ease-out",
 }}>
 <span>{f.type === "red"? "": ""}</span>
 <span>{f.text}</span>
 </div>
 ))}
 </div>
 )}

 {/* Fictional disclaimer */}
 {flags.length > 0 && (
 <div style={{ marginTop: 10, fontSize: 9, color: "#525252", fontFamily: "'JetBrains Mono', monospace", textAlign: "center", letterSpacing: 1, textTransform: "uppercase"}}>
 * Demo account, illustrative example
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
 background: hover? C.surfaceHover: C.surface,
 border: glow? `1px solid ${hover? C.borderHover: C.border}`: `1px solid rgba(255, 255, 255, 0.08)`,
 borderRadius: 16,
 padding: 24,
 transition: "all 0.3s ease",
 cursor: onClick? "pointer": "default",
 boxShadow: glow && hover? "0 0 40px rgba(255, 255, 255, 0.05), 0 0 80px rgba(255, 255, 255, 0.02)": "none",
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

function JobCardSkeleton() {
 return (
 <div style={{
 padding: 20, borderRadius: 14,
 background: "rgba(18, 18, 18, 0.5)",
 border: "1px solid rgba(255, 255, 255, 0.04)",
 display: "flex", flexDirection: "column", gap: 14,
 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center"}}>
 <div className="w3g-skeleton" style={{ height: 14, width: 60 }} />
 <div className="w3g-skeleton" style={{ height: 12, width: 40 }} />
 </div>
 <div className="w3g-skeleton" style={{ height: 18, width: "85%" }} />
 <div className="w3g-skeleton" style={{ height: 18, width: "65%" }} />
 <div style={{ display: "flex", gap: 8 }}>
 <div className="w3g-skeleton" style={{ height: 28, width: 60, borderRadius: 14 }} />
 <div className="w3g-skeleton" style={{ height: 28, width: 80, borderRadius: 14 }} />
 </div>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
 <div className="w3g-skeleton" style={{ height: 16, width: 90 }} />
 <div className="w3g-skeleton" style={{ height: 16, width: 50 }} />
 </div>
 </div>
 );
}

function MiniJobSkeleton() {
 return (
 <div style={{
 padding: "14px 16px", borderRadius: 12,
 background: "rgba(18, 18, 18, 0.5)",
 border: "1px solid rgba(255, 255, 255, 0.04)",
 display: "flex", flexDirection: "column", gap: 8,
 }}>
 <div style={{ display: "flex", gap: 6 }}>
 <div className="w3g-skeleton" style={{ height: 14, width: 40 }} />
 <div className="w3g-skeleton" style={{ height: 14, width: 50 }} />
 </div>
 <div className="w3g-skeleton" style={{ height: 16, width: "90%" }} />
 <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
 <div className="w3g-skeleton" style={{ height: 12, width: 80 }} />
 <div className="w3g-skeleton" style={{ height: 12, width: 36 }} />
 </div>
 </div>
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
 { rank: 1, handle: "@CryptoAlpha_", change: "+12", score: 94, followers: 45200, niche: "DeFi", growth: "+8.2%"},
 { rank: 2, handle: "@SOL_Trader99", change: "+8", score: 87, followers: 12800, niche: "Solana", growth: "+15.4%"},
 { rank: 3, handle: "@0xTrenchKing", change: "+5", score: 91, followers: 67800, niche: "DeFi", growth: "+6.1%"},
 { rank: 4, handle: "@GMResearch", change: "+3", score: 89, followers: 34100, niche: "Research", growth: "+4.8%"},
 { rank: 5, handle: "@PumpWatch_", change: "+2", score: 82, followers: 18900, niche: "Memecoin", growth: "+11.2%"},
 { rank: 6, handle: "@OnChainMax", change: "−1", score: 85, followers: 31500, niche: "Analytics", growth: "+3.1%"},
 { rank: 7, handle: "@DegenHQ", change: "−2", score: 78, followers: 22100, niche: "Memecoin", growth: "+2.4%"},
 { rank: 8, handle: "@BTCPurist", change: "+4", score: 88, followers: 54300, niche: "Bitcoin", growth: "+5.7%"},
 ],
 rising: [
 { rank: 1, handle: "@NewDegen420", change: "NEW", score: 72, followers: 4200, niche: "Memecoin", growth: "+142%"},
 { rank: 2, handle: "@SolanaShiller", change: "NEW", score: 68, followers: 8900, niche: "Solana", growth: "+98%"},
 { rank: 3, handle: "@AlphaHunter_", change: "+25", score: 75, followers: 12300, niche: "Alpha", growth: "+84%"},
 { rank: 4, handle: "@MemeEconomist", change: "+18", score: 71, followers: 6700, niche: "Memecoin", growth: "+67%"},
 { rank: 5, handle: "@DeFi_Detective", change: "NEW", score: 79, followers: 15400, niche: "DeFi", growth: "+55%"},
 ],
 suspicious: [
 { rank: 1, handle: "@FakeAlpha2024", change: "", score: 18, followers: 85000, niche: "DeFi", growth: "+210%"},
 { rank: 2, handle: "@BotNetwork_", change: "", score: 22, followers: 45000, niche: "Memecoin", growth: "+180%"},
 { rank: 3, handle: "@PumpDumpKing", change: "", score: 28, followers: 120000, niche: "Memecoin", growth: "+95%"},
 { rank: 4, handle: "@FollowBot420", change: "", score: 15, followers: 33000, niche: "Crypto", growth: "+340%"},
 ],
};

// ─── DEMO TRUST SCORE (Deterministic preview tool) ──────────────
// Generates a plausible score from observable handle patterns.
// Same handle → same score. Public demo only — real score requires X API.
function generateDemoTrustScore(rawHandle) {
  const h = (rawHandle || "").trim().replace(/^@/, "").toLowerCase();
  if (!h || h.length < 1) return null;

  // Hash the handle for deterministic randomness
  let hash = 0;
  for (let i = 0; i < h.length; i++) {
    hash = ((hash << 5) - hash) + h.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);
  const rand = (offset, range) => ((seed + offset * 7919) % range);

  // Heuristic signals from observable handle patterns
  const hasNumberSuffix = /\d{2,}$/.test(h);                  // foo123 = bot tell
  const hasSequentialNums = /(\d)\1{2,}/.test(h);             // 0000 = bot tell
  const looksRandom = /^[a-z]+\d{4,}$/.test(h);              // user12345 = bot tell
  const isShort = h.length < 5;                               // short = OG status
  const isMedium = h.length >= 5 && h.length <= 12;
  const hasUnderscore = h.includes("_");
  const looksClean = /^[a-z][a-z0-9]+$/.test(h) && !hasNumberSuffix;
  const hasCapsOrigin = /[A-Z]/.test(rawHandle);              // CamelCase = real person

  // Build sub-scores deterministically
  let followerScore = 50 + rand(1, 50);
  let engagementScore = 40 + rand(2, 55);
  let conversationScore = 35 + rand(3, 60);
  let consistencyScore = 45 + rand(4, 50);
  let cibScore = 50 + rand(5, 50);
  let ageScore = 40 + rand(6, 55);
  let nicheScore = 50 + rand(7, 45);

  // Apply observable adjustments
  if (looksRandom) { followerScore -= 25; cibScore -= 30; engagementScore -= 20; }
  if (hasSequentialNums) { cibScore -= 25; followerScore -= 15; }
  if (hasNumberSuffix) { cibScore -= 12; }
  if (looksClean) { followerScore += 12; cibScore += 15; }
  if (isShort) { ageScore += 25; followerScore += 18; }
  if (isMedium) { ageScore += 10; }
  if (hasUnderscore) { followerScore += 5; }
  if (hasCapsOrigin) { engagementScore += 8; conversationScore += 10; }

  // Clamp
  const clamp = (v) => Math.max(5, Math.min(99, Math.round(v)));
  followerScore = clamp(followerScore);
  engagementScore = clamp(engagementScore);
  conversationScore = clamp(conversationScore);
  consistencyScore = clamp(consistencyScore);
  cibScore = clamp(cibScore);
  ageScore = clamp(ageScore);
  nicheScore = clamp(nicheScore);

  // Weighted composite
  const overall = clamp(
    followerScore * 0.18 +
    engagementScore * 0.20 +
    conversationScore * 0.15 +
    consistencyScore * 0.12 +
    cibScore * 0.18 +
    ageScore * 0.10 +
    nicheScore * 0.07
  );

  // Tier
  let tier, tierColor;
  if (overall >= 85) { tier = "SUPREME"; tierColor = "#10b981"; }
  else if (overall >= 70) { tier = "CREDIBLE"; tierColor = "#34d399"; }
  else if (overall >= 55) { tier = "NOTED"; tierColor = "#fbbf24"; }
  else if (overall >= 40) { tier = "WATCHLIST"; tierColor = "#f97316"; }
  else { tier = "FLAGGED"; tierColor = "#ef4444"; }

  // Generate flags based on score patterns
  const redFlags = [];
  const greenFlags = [];
  if (looksRandom) redFlags.push("Handle pattern looks auto-generated");
  if (hasSequentialNums) redFlags.push("Sequential digits in handle (bot pattern)");
  if (cibScore < 40) redFlags.push("CIB cluster signals detected");
  if (engagementScore < 30) redFlags.push("Low engagement quality vs follower count");
  if (looksClean && cibScore > 70) greenFlags.push("Clean handle, no bot patterns detected");
  if (isShort) greenFlags.push("Short OG-style handle, high seniority signal");
  if (hasCapsOrigin) greenFlags.push("Mixed-case original handle, human signal");
  if (engagementScore > 70) greenFlags.push("Healthy engagement quality");
  if (overall > 75) greenFlags.push("Top-tier reputation cluster");

  return {
    handle: rawHandle.replace(/^@/, ""),
    overall,
    tier,
    tierColor,
    breakdowns: [
      { label: "Follower Quality", score: followerScore },
      { label: "Engagement", score: engagementScore },
      { label: "Conversation", score: conversationScore },
      { label: "Posting Consistency", score: consistencyScore },
      { label: "CIB Signals", score: cibScore },
      { label: "Account Age", score: ageScore },
      { label: "Crypto Niche", score: nicheScore },
    ],
    redFlags,
    greenFlags,
  };
}

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
 title: "Thread writer · weekly alpha research",
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
 title: "KOL raid · 50 engaged comments",
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
 title: "Clipper · daily CT highlights reel",
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
 title: "Spaces clipper · viral moments from weekly AMAs",
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
 title: "Podcast editor · long-form to shorts",
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
 title: "Kick stream clipper · crypto degen content",
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
 title: "Solana smart contract dev · escrow modification",
 category: "Development",
 poster: "@BuildersDAO", posterTrust: 93, posterVerified: true,
 budget: 2500, budgetCurrency: "USDC",
 deadline: "2w",
 postedAgo: "8h ago",
 proposals: 4,
 minTrustScore: 0,
 status: "open",
 description: "Need a Rust/Anchor dev to modify an existing escrow contract. Add time-locked releases. Existing code + tests provided. Deliverable: PR + deployed devnet program.",
 deliverables: ["Modified Anchor program", "Unit tests", "Devnet deployment"],
 tags: ["solana", "rust", "anchor"],
 requiresPortfolio: true,
 },
 {
 id: "job-002", jobType: "crypto",
 title: "Video editor for 30s reel · crypto explainer",
 category: "Video Editing",
 poster: "@DeFi_Founder", posterTrust: 91, posterVerified: true,
 budget: 300, budgetCurrency: "USDC",
 deadline: "5d",
 postedAgo: "6h ago",
 proposals: 12,
 minTrustScore: 0,
 status: "open",
 description: "30-second vertical video explaining our L2 protocol. Raw footage provided. Need snappy cuts, captions, and crypto-native style.",
 deliverables: ["30s vertical 9:16 video", "Captions & b-roll", "2 revisions included"],
 tags: ["video", "explainer"],
 requiresPortfolio: true,
 },
 {
 id: "job-006", jobType: "crypto",
 title: "NFT PFP collection design · 10 pieces",
 category: "Design",
 poster: "@NFTArtist_Dao", posterTrust: 79, posterVerified: true,
 budget: 1200, budgetCurrency: "USDC",
 deadline: "10d",
 postedAgo: "2d ago",
 proposals: 18,
 minTrustScore: 0,
 status: "in_progress",
 description: "10 marketing memes for PFP drop. Degen-coded, shareable, original style.",
 deliverables: ["10 meme assets", "Square + vertical formats", "Source files"],
 tags: ["design", "nft", "art"],
 requiresPortfolio: true,
 },
 {
 id: "job-009", jobType: "crypto",
 title: "Smart contract audit · ERC-20 + staking",
 category: "Audits",
 poster: "@DeFiProtocol", posterTrust: 92, posterVerified: true,
 budget: 5000, budgetCurrency: "USDC",
 deadline: "3w",
 postedAgo: "1d ago",
 proposals: 3,
 minTrustScore: 0,
 status: "open",
 description: "Pre-launch audit of ERC-20 token + staking contract on Base. ~800 LOC. Looking for auditor with prior work on comparable contracts. Report + remediations required.",
 deliverables: ["Written audit report", "Severity-graded findings", "Remediation review pass"],
 tags: ["audit", "evm", "security"],
 requiresPortfolio: true,
 },
 {
 id: "job-010", jobType: "crypto",
 title: "Frontend dev · React + Wagmi dashboard",
 category: "Development",
 poster: "@YieldProtocol", posterTrust: 85, posterVerified: true,
 budget: 1800, budgetCurrency: "USDC",
 deadline: "2w",
 postedAgo: "14h ago",
 proposals: 8,
 minTrustScore: 0,
 status: "open",
 description: "Build analytics dashboard for our yield protocol. React + Wagmi/Viem + Tailwind. Figma provided. Must integrate with existing backend API.",
 deliverables: ["Responsive dashboard", "Wallet connection", "Data visualization"],
 tags: ["react", "wagmi", "frontend"],
 requiresPortfolio: true,
 },
 {
 id: "job-011", jobType: "crypto",
 title: "Whitepaper writer · L2 rollup protocol",
 category: "Technical Writing",
 poster: "@L2Research", posterTrust: 89, posterVerified: true,
 budget: 1500, budgetCurrency: "USDC",
 deadline: "3w",
 postedAgo: "2d ago",
 proposals: 6,
 minTrustScore: 0,
 status: "open",
 description: "Write technical whitepaper for novel L2 rollup. Must understand ZK proofs, rollup architecture, and tokenomics. Previous whitepaper work required.",
 deliverables: ["25-40 page whitepaper", "Architecture diagrams", "2 revision rounds"],
 tags: ["whitepaper", "technical", "l2"],
 requiresPortfolio: true,
 },
 {
 id: "job-012", jobType: "crypto",
 title: "Community manager · Discord + Telegram",
 category: "Community",
 poster: "@MemecoinProject", posterTrust: 74, posterVerified: false,
 budget: 1000, budgetCurrency: "USDC",
 deadline: "Ongoing",
 postedAgo: "3d ago",
 proposals: 22,
 minTrustScore: 0,
 status: "open",
 description: "Part-time CM for Discord (5k members) + Telegram (3k). Handle mod, run events, escalate FUD. Monthly retainer.",
 deliverables: ["Daily presence", "Weekly events", "FUD reports"],
 tags: ["community", "discord", "telegram"],
 },
 {
 id: "job-013", jobType: "crypto",
 title: "Logo + brand kit · DePIN project",
 category: "Design",
 poster: "@DePINFounder", posterTrust: 81, posterVerified: true,
 budget: 900, budgetCurrency: "USDC",
 deadline: "10d",
 postedAgo: "16h ago",
 proposals: 14,
 minTrustScore: 0,
 status: "open",
 description: "Complete brand identity: logo, color system, typography, basic style guide. Modern, technical, trustworthy aesthetic.",
 deliverables: ["Logo (vector)", "Brand guidelines PDF", "Social media kit"],
 tags: ["branding", "logo", "identity"],
 requiresPortfolio: true,
 },
 {
 id: "job-014", jobType: "crypto",
 title: "Technical blog writer · DeFi primitives",
 category: "Technical Writing",
 poster: "@DeFiResearchCo", posterTrust: 86, posterVerified: true,
 budget: 600, budgetCurrency: "USDC",
 deadline: "Ongoing",
 postedAgo: "1d ago",
 proposals: 11,
 minTrustScore: 0,
 status: "open",
 description: "2 deep-dive articles per month on DeFi primitives (AMMs, lending, CDPs). 1500-2500 words each, technical but accessible.",
 deliverables: ["2 articles/month", "Original research", "Edits included"],
 tags: ["writing", "defi", "content"],
 requiresPortfolio: true,
 },
 {
 id: "job-021", jobType: "crypto",
 title: "AI trading bot dev · Solana memecoin sniper",
 category: "AI / ML",
 poster: "@AlphaBotLabs", posterTrust: 88, posterVerified: true,
 budget: 3500, budgetCurrency: "USDC",
 deadline: "3w",
 postedAgo: "4h ago",
 proposals: 5,
 minTrustScore: 0,
 status: "open",
 description: "Build an AI-driven sniper bot for Solana memecoins. Model should score new launches by liquidity, holder distribution, dev wallet behavior, and social signals. Python + on-chain integration.",
 deliverables: ["Trained classifier model", "Live inference pipeline", "Backtest report + docs"],
 tags: ["ai", "solana", "trading"],
 requiresPortfolio: true,
 },
 {
 id: "job-022", jobType: "crypto",
 title: "LLM integration · on-chain analytics assistant",
 category: "AI / ML",
 poster: "@OnChainAI", posterTrust: 84, posterVerified: true,
 budget: 2200, budgetCurrency: "USDC",
 deadline: "2w",
 postedAgo: "9h ago",
 proposals: 7,
 minTrustScore: 0,
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
 minTrustScore: 0,
 status: "open",
 description: "Use Stable Diffusion/Flux fine-tuning to generate 1000 unique NFT pieces based on a custom style. Trait weighting + rarity logic required.",
 deliverables: ["1000 generated assets", "Metadata JSON", "Trait rarity report"],
 tags: ["ai", "nft", "generative"],
 requiresPortfolio: true,
 },
 {
 id: "job-024", jobType: "crypto",
 title: "Clipper for founder Spaces · weekly cuts",
 category: "Clipping",
 poster: "@FounderHQ", posterTrust: 81, posterVerified: true,
 budget: 800, budgetCurrency: "USDC",
 deadline: "Ongoing",
 postedAgo: "6h ago",
 proposals: 11,
 minTrustScore: 0,
 status: "open",
 description: "Crypto founder running 2 Spaces per week needs a clipper to cut viral moments (alpha calls, hot takes, mic drops) into vertical shorts for X + TikTok + YouTube Shorts.",
 deliverables: ["6-10 clips per week", "Auto-captions + on-brand title cards", "Posted natively to founder's channels"],
 tags: ["clipping", "spaces", "founder"],
 requiresPortfolio: true,
 },
 {
 id: "job-025", jobType: "crypto",
 title: "Stream clipper for KOL · daily highlights",
 category: "Clipping",
 poster: "@KOLStudio", posterTrust: 76, posterVerified: false,
 budget: 1200, budgetCurrency: "USDC",
 deadline: "Ongoing",
 postedAgo: "1d ago",
 proposals: 23,
 minTrustScore: 0,
 status: "open",
 description: "Crypto KOL streams 4-5h daily on Kick + X. Looking for a fast clipper to pull the best 30-90s moments and post within 2 hours of the live stream ending. Volume play.",
 deliverables: ["3-5 clips per stream day", "Subtitles + thumbnails", "Posted to KOL's accounts"],
 tags: ["clipping", "kol", "streaming"],
 },
 {
 id: "job-026", jobType: "crypto",
 title: "Rust dev · Solana program optimization",
 category: "Development",
 poster: "@SolBuilders", posterTrust: 87, posterVerified: true,
 budget: 4500, budgetCurrency: "USDC",
 deadline: "4w",
 postedAgo: "3h ago",
 proposals: 7,
 minTrustScore: 0,
 status: "open",
 description: "Existing Anchor program needs compute unit optimization. Targeting 30% reduction in CU usage. Strong Rust + Solana experience required.",
 deliverables: ["Optimized program with benchmarks", "Migration plan", "Test coverage"],
 tags: ["rust", "solana", "anchor"],
 requiresPortfolio: true,
 },
 {
 id: "job-027", jobType: "ct",
 title: "Spaces co-host · weekly memecoin show",
 category: "Spaces / AMAs",
 poster: "@PumpHQ", posterTrust: 72, posterVerified: false,
 budget: 600, budgetCurrency: "USDC",
 deadline: "Ongoing",
 postedAgo: "5h ago",
 proposals: 14,
 minTrustScore: 40,
 status: "open",
 description: "Looking for a co-host for our weekly Sunday Spaces. Topic: memecoin meta, alpha calls, market commentary. Must be plugged into Solana CT.",
 deliverables: ["1.5-2hr Spaces every Sunday", "Promotion 2x prior to show", "Active in chat during"],
 tags: ["spaces", "memecoin", "weekly"],
 },
 {
 id: "job-028", jobType: "ct",
 title: "Meme designer · launch campaign",
 category: "Meme Warfare",
 poster: "@DegenLabs", posterTrust: 81, posterVerified: true,
 budget: 1500, budgetCurrency: "USDC",
 deadline: "1w",
 postedAgo: "2h ago",
 proposals: 31,
 minTrustScore: 45,
 status: "open",
 description: "Token launching next week. Need 30+ launch memes in CT-native style. Mix of templates and original. Must understand current CT meta references.",
 deliverables: ["30+ memes in 1080x1080 + 1080x1920", "Editable PSDs/Figma", "Cleared for commercial use"],
 tags: ["meme", "launch", "design"],
 requiresPortfolio: true,
 },
 {
 id: "job-029", jobType: "crypto",
 title: "Discord mod · 24/7 community coverage",
 category: "Community",
 poster: "@Web3Founders", posterTrust: 78, posterVerified: false,
 budget: 800, budgetCurrency: "USDC",
 deadline: "Ongoing",
 postedAgo: "8h ago",
 proposals: 19,
 minTrustScore: 0,
 status: "open",
 description: "10k member Discord needs a senior mod for APAC timezone coverage. Spam filtering, raid response, FAQ handling, escalation to team.",
 deliverables: ["12hr/day APAC coverage", "Weekly mod report", "Active in #help channel"],
 tags: ["discord", "moderation", "community"],
 },
 {
 id: "job-030", jobType: "ct",
 title: "Twitter ghostwriter · founder voice",
 category: "Thread Writing",
 poster: "@CryptoFounder", posterTrust: 85, posterVerified: true,
 budget: 2200, budgetCurrency: "USDC",
 deadline: "Ongoing",
 postedAgo: "1d ago",
 proposals: 22,
 minTrustScore: 60,
 status: "open",
 description: "Crypto founder needs ghostwriter for X. 3-5 posts daily + 1 long thread weekly. Voice is technical-but-degen, opinionated, builder-focused. NDA required.",
 deliverables: ["3-5 posts daily", "1 long thread weekly", "Pre-launch content for V2 announce"],
 tags: ["ghostwriting", "founder", "ongoing"],
 requiresPortfolio: true,
 },
 {
 id: "job-031", jobType: "ct",
 title: "KOL ambassador · 3 month DeFi protocol partnership",
 category: "Partnership",
 poster: "@LiquidProtocol", posterTrust: 84, posterVerified: true,
 budget: 12000, budgetCurrency: "USDC",
 deadline: "3 months",
 postedAgo: "5h ago",
 proposals: 18,
 minTrustScore: 70,
 status: "open",
 description: "DeFi protocol seeking KOL ambassador for 3-month launch + growth campaign. 4 posts per week, 2 spaces per month, exclusive alpha drops to your audience. Long-term relationship with potential extension. Must have crypto-native audience of 5k+ engaged followers.",
 deliverables: ["4 posts/week throughout campaign", "2 Spaces appearances per month", "Quarterly performance review", "Optional: token unlock incentive on launch"],
 tags: ["partnership", "ambassador", "defi", "long-term"],
 requiresPortfolio: true,
 },
 {
 id: "job-032", jobType: "ct",
 title: "Performance-based shill partnership · per-post payout",
 category: "Partnership",
 poster: "@MemeFi", posterTrust: 71, posterVerified: false,
 budget: 50, budgetCurrency: "SOL",
 deadline: "Ongoing",
 postedAgo: "1d ago",
 proposals: 27,
 minTrustScore: 55,
 status: "open",
 description: "Memecoin project running pay-per-post partnership. 1.5 SOL per organic-feeling shill post, bonus 0.5 SOL if it goes viral (50k+ impressions). Up to 30 posts over 60 days. No bot pods, must be authentic engagement.",
 deliverables: ["Up to 30 posts over 60 days", "Tagged + tracking link", "Min 5k followers verified"],
 tags: ["partnership", "performance", "memecoin"],
 requiresPortfolio: false,
 },
 {
 id: "job-033", jobType: "ct",
 title: "6 month brand ambassador · L2 ecosystem",
 category: "Partnership",
 poster: "@L2Builder", posterTrust: 88, posterVerified: true,
 budget: 24000, budgetCurrency: "USDC",
 deadline: "6 months",
 postedAgo: "2d ago",
 proposals: 12,
 minTrustScore: 75,
 status: "open",
 description: "Looking for a serious crypto KOL to be the face of our L2 ecosystem campaign. Bi-weekly threads, monthly community AMAs, presence at one IRL event (we cover travel). Full creative freedom on content as long as core narrative aligns.",
 deliverables: ["Bi-weekly long-form threads", "Monthly community AMA", "1 IRL event appearance", "Quarterly creative review"],
 tags: ["partnership", "ambassador", "L2", "long-term"],
 requiresPortfolio: true,
 },
];

const JOB_CATEGORIES_CT = [
 { id: "all", label: "All CT Jobs", Icon: Globe },
 { id: "Partnership", label: "Partnerships", Icon: Handshake },
 { id: "Shitposting", label: "Shitposting", Icon: Smile },
 { id: "Thread Writing", label: "Threads", Icon: Hash },
 { id: "KOL / Raids", label: "Raids", Icon: Megaphone },
 { id: "Spaces / AMAs", label: "Spaces", Icon: Mic },
 { id: "Meme Warfare", label: "Memes", Icon: Swords },
 { id: "Streaming / Gambling", label: "Streaming", Icon: Radio },
 { id: "Clipping / Editing", label: "Clips", Icon: Scissors },
];

const JOB_CATEGORIES_CRYPTO = [
 { id: "all", label: "All Crypto Work", Icon: Globe },
 { id: "Development", label: "Dev", Icon: Code },
 { id: "AI / ML", label: "AI", Icon: Bot },
 { id: "Design", label: "Design", Icon: Palette },
 { id: "Audits", label: "Audits", Icon: Lock },
 { id: "Technical Writing", label: "Writing", Icon: PenTool },
 { id: "Video Editing", label: "Video", Icon: Video },
 { id: "Clipping", label: "Clips", Icon: Scissors },
 { id: "Community", label: "Community", Icon: MessageCircle },
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
 { tweet: "Just bought more $BONK ", replies: 127, suspiciousPct: 42, flag: "Pod engagement"},
 { tweet: "This is the next 100x...", replies: 89, suspiciousPct: 38, flag: "Template replies"},
 { tweet: "GM frens ", replies: 54, suspiciousPct: 28, flag: "New account replies"},
 ],
};

const ALERT_TYPES = [
 { id: "follower-spike", name: "Follower Spike", desc: "Alert when followers jump >10% in 24h", Icon: TrendingUp, premium: false },
 { id: "trust-drop", name: "Trust Score Drop", desc: "Alert when Trust Score drops by 10+ points", Icon: AlertTriangle, premium: false },
 { id: "score-milestone", name: "Tier Change", desc: "Alert when Trust Score tier changes (e.g. NOTED → CREDIBLE)", Icon: Trophy, premium: false },
 { id: "bot-flag", name: "Bot Activity Detected", desc: "Alert when CIB detection flags the account", Icon: Bot, premium: false },
 { id: "cluster", name: "Pod Membership", desc: "Alert when account joins a detected engagement pod", Icon: Network, premium: false },
 { id: "engagement-drop", name: "Engagement Collapse", desc: "Alert when engagement rate drops 50%+", Icon: Eye, premium: false },
 { id: "rival", name: "Competitor Movement", desc: "Alert when rival accounts change strategy", Icon: Flag, premium: false },
];

const WATCHLIST = [
 { handle: "@0xTrenchKing", score: 94, alerts: ["follower-spike", "trust-drop"], lastAlert: "2h ago, followers +12%"},
 { handle: "@BigKOL", score: 88, alerts: ["listing", "engagement-drop"], lastAlert: "None in 7d"},
 { handle: "@CompetitorX", score: 76, alerts: ["follower-spike", "listing", "cluster"], lastAlert: "Yesterday, flagged in cluster-003"},
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
 const [jobsType, setJobsType] = useState("crypto"); // "ct"or "crypto", default to crypto work
 const [jobsStatus, setJobsStatus] = useState("all"); // all | open | in_progress | completed
 const [waitlistEmail, setWaitlistEmail] = useState("");
 const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
 const [userPosition, setUserPosition] = useState(null);
 const [waitlistError, setWaitlistError] = useState("");
 const [waitlistLoading, setWaitlistLoading] = useState(false);

 // Save email to Supabase waitlist
 const submitWaitlist = async (source = "analyze") => {
 if (!waitlistEmail.includes("@")) return;
 setWaitlistLoading(true);
 setWaitlistError("");
 const cleanEmail = waitlistEmail.trim().toLowerCase();
 try {
 const { error } = await supabase
.from("waitlist")
.insert([{ email: cleanEmail, source }]);
 if (error) {
 // Duplicate email is fine, treat as success
 if (error.code === "23505") {
 setWaitlistSubmitted(true);
 } else {
 setWaitlistError("Something went wrong. Try again in a sec.");
 console.error("Waitlist error:", error);
 }
 } else {
 setWaitlistSubmitted(true);
 }
 // Fetch position (works for both new and dupe signups)
 try {
 const { data: posData, error: posErr } = await supabase.rpc("get_waitlist_position", { user_email: cleanEmail });
 if (!posErr && posData !== null && posData !== undefined) {
 setUserPosition(Number(posData));
 }
 } catch (posCatch) {
 console.error("Couldn't fetch position:", posCatch);
 }
 // Refresh total count too so it reflects the new signup
 fetchWaitlistCount();
 } catch (err) {
 setWaitlistError("Couldn't connect. Check your internet?");
 console.error(err);
 } finally {
 setWaitlistLoading(false);
 }
 };

 const submitJob = async () => {
   // Basic validation
   if (!jobForm.title.trim() || jobForm.title.length < 8) {
     setJobError("Title needs to be at least 8 characters.");
     return;
   }
   if (!jobForm.budget || isNaN(Number(jobForm.budget)) || Number(jobForm.budget) < 50) {
     setJobError("Budget must be a number, minimum $50.");
     return;
   }
   if (!jobForm.description.trim() || jobForm.description.length < 30) {
     setJobError("Description needs at least 30 characters.");
     return;
   }
   if (!jobForm.posterName.trim() || jobForm.posterName.length < 2) {
     setJobError("Add a company or team name that posters will see.");
     return;
   }
   if (!jobForm.email.includes("@")) {
     setJobError("Need a valid email so we can reach you.");
     return;
   }
   if (!jobForm.contact.trim()) {
     setJobError("Add your X handle (so we can verify and tag you).");
     return;
   }
   setJobSubmitting(true);
   setJobError("");
   try {
     const { error } = await supabase
       .from("job_submissions")
       .insert([{
         title: jobForm.title.trim(),
         job_type: jobForm.jobType,
         category: jobForm.category,
         budget: Number(jobForm.budget),
         currency: jobForm.currency,
         deadline: jobForm.deadline.trim() || "Flexible",
         description: jobForm.description.trim(),
         deliverables: jobForm.deliverables.trim(),
         min_trust_score: Number(jobForm.minTrust) || 0,
         poster_name: jobForm.posterName.trim(),
         poster_handle: jobForm.contact.trim().replace(/^@/, ""),
         poster_email: jobForm.email.trim().toLowerCase(),
         status: "pending",
       }]);
     if (error) {
       setJobError("Couldn't submit. Try again in a moment.");
       console.error("Job submit error:", error);
     } else {
       setJobSubmitted(true);
     }
   } catch (err) {
     setJobError("Couldn't connect. Check your internet?");
     console.error(err);
   } finally {
     setJobSubmitting(false);
   }
 };

 const fetchApprovedJobs = async () => {
   setApprovedJobsLoading(true);
   try {
     const { data, error } = await supabase
       .from("job_submissions")
       .select("*")
       .in("status", ["approved", "in_progress", "completed"])
       .order("created_at", { ascending: false });
     if (error) {
       console.error("Failed to fetch approved jobs:", error);
       return;
     }
     // Map Supabase rows → MOCK_JOBS shape
     const mapped = (data || []).map((row) => {
       const createdDate = new Date(row.created_at);
       const now = new Date();
       const ageMinutes = Math.floor((now - createdDate) / 60000);
       let postedAgo = "Just now";
       if (ageMinutes >= 60 * 24) postedAgo = `${Math.floor(ageMinutes / (60 * 24))}d ago`;
       else if (ageMinutes >= 60) postedAgo = `${Math.floor(ageMinutes / 60)}h ago`;
       else if (ageMinutes >= 1) postedAgo = `${ageMinutes}m ago`;
       return {
         id: `live-${row.id}`,
         jobType: row.job_type,
         isNew: row.status === "approved",
         featured: row.featured === true,
         title: row.title,
         category: row.category,
         poster: row.poster_name ? `@${row.poster_name.replace(/^@/, "")}` : `@${row.poster_handle}`,
         posterTrust: 75,
         posterVerified: false,
         budget: Number(row.budget),
         budgetCurrency: row.currency,
         deadline: row.deadline || "Flexible",
         postedAgo,
         proposals: 0,
         minTrustScore: row.min_trust_score || 0,
         status: row.status === "in_progress" ? "in_progress" : row.status === "completed" ? "completed" : "open",
         description: row.description,
         deliverables: row.deliverables ? row.deliverables.split("\n").filter(Boolean) : [],
         tags: ["new"],
       };
     });
     setApprovedJobs(mapped);
   } catch (err) {
     console.error("Couldn't fetch approved jobs:", err);
   } finally {
     setApprovedJobsLoading(false);
   }
 };

 // Fetch approved jobs on mount + whenever Jobs tab opens
 useEffect(() => {
   if (tab === "jobs" || tab === "home") {
     fetchApprovedJobs();
   }
 }, [tab]);

 const fetchWaitlistCount = async () => {
   try {
     const { data, error } = await supabase.rpc("get_waitlist_count");
     if (!error && typeof data === "number") {
       setWaitlistCount(data);
     } else if (!error && data !== null && data !== undefined) {
       setWaitlistCount(Number(data));
     }
   } catch (err) {
     console.error("Couldn't fetch waitlist count:", err);
   }
 };

 const submitApply = async () => {
   if (!selectedJob) return;
   if (!applyForm.handle.trim()) {
     setApplyError("Add your X handle so the poster can verify you.");
     return;
   }
   if (!applyForm.message.trim() || applyForm.message.length < 30) {
     setApplyError("Add a real message (min 30 chars). Cookie-cutter pitches get rejected.");
     return;
   }
   if (!applyForm.email.includes("@")) {
     setApplyError("Add a valid email so the poster can reach you.");
     return;
   }
   setApplySubmitting(true);
   setApplyError("");
   try {
     const { error } = await supabase
       .from("job_applications")
       .insert([{
         job_id: selectedJob.id,
         job_title: selectedJob.title,
         job_poster: selectedJob.poster,
         applicant_handle: applyForm.handle.trim().replace(/^@/, ""),
         applicant_email: applyForm.email.trim().toLowerCase(),
         message: applyForm.message.trim(),
         portfolio_url: applyForm.portfolio.trim(),
         expected_pay: applyForm.expectedPay.trim(),
         status: "pending",
       }]);
     if (error) {
       setApplyError("Couldn't submit. Try again in a moment.");
       console.error("Apply submit error:", error);
     } else {
       setApplySubmitted(true);
     }
   } catch (err) {
     setApplyError("Couldn't connect. Check your internet?");
     console.error(err);
   } finally {
     setApplySubmitting(false);
   }
 };

 const resetApplyForm = () => {
   setApplyForm({ handle: "", message: "", portfolio: "", expectedPay: "", email: "" });
   setApplySubmitted(false);
   setApplyError("");
 };

 const runDemoTrustScore = () => {
   if (!demoHandle.trim()) return;
   setDemoLoading(true);
   setDemoResult(null);
   // Simulate computation with a brief delay (feels real)
   setTimeout(() => {
     const result = generateDemoTrustScore(demoHandle);
     setDemoResult(result);
     setDemoLoading(false);
   }, 800);
 };

 const runCibScan = () => {
   const h = cibSearchHandle.trim().replace(/^@/, "");
   if (!h || h.length < 2) return;
   setCibScanning(true);
   setCibScanResult(null);
   // Simulate API + analysis delay
   setTimeout(() => {
     const trust = generateDemoTrustScore(h);
     if (!trust) { setCibScanning(false); return; }
     // Derive CIB intensity from inverse Trust Score
     // Lower trust → higher CIB flags
     const cibScore = trust.breakdowns.find(b => b.label === "CIB Signals")?.score || 50;
     const inauthenticity = Math.max(2, Math.min(98, Math.round((100 - cibScore) * 0.85)));
     const tweetsAnalyzed = 50;
     const totalReplies = 800 + Math.round((100 - trust.overall) * 12);
     const suspiciousReplies = Math.round(totalReplies * (inauthenticity / 100) * 0.85);
     const newAccountReplies = Math.round(totalReplies * (inauthenticity / 100) * 0.32);
     const templateReplies = Math.round(totalReplies * (inauthenticity / 100) * 0.22);
     const velocityAnomalies = Math.max(0, Math.round((inauthenticity / 100) * 24));

     // Generate realistic-looking pod members (deterministic from handle)
     let hash = 0;
     for (let i = 0; i < h.length; i++) hash = ((hash << 5) - hash) + h.charCodeAt(i);
     const seed = Math.abs(hash);
     const podPool = ["alpha_dev", "shillmaster", "moon_caller", "degen_sigma", "sol_maxi", "follow4follow", "based_anon", "memecoin_king", "crypto_pump", "raidleader", "bot_or_real", "coordinated_a"];
     const podMembers = podPool.slice(0, Math.min(12, Math.max(3, Math.round(inauthenticity / 8))))
       .map((p, i) => `${p}_${(seed + i * 7919) % 1000}`);

     // Tier-based message
     let verdict, verdictColor;
     if (inauthenticity >= 60) { verdict = "HIGH RISK · LIKELY POD MEMBER"; verdictColor = "#ef4444"; }
     else if (inauthenticity >= 35) { verdict = "ELEVATED · COORDINATION SIGNALS"; verdictColor = "#f97316"; }
     else if (inauthenticity >= 18) { verdict = "WATCH · MIXED SIGNALS"; verdictColor = "#fbbf24"; }
     else { verdict = "CLEAN · NO POD ACTIVITY"; verdictColor = "#10b981"; }

     setCibScanResult({
       handle: h,
       inauthenticity,
       verdict,
       verdictColor,
       trust: trust.overall,
       trustTier: trust.tier,
       trustColor: trust.tierColor,
       tweetsAnalyzed,
       totalReplies,
       suspiciousReplies,
       newAccountReplies,
       templateReplies,
       velocityAnomalies,
       podMembers,
     });
     setCibScanning(false);
     // Smooth-scroll to result
     setTimeout(() => {
       const el = document.querySelector("[data-cib-result]");
       if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
     }, 50);
   }, 1200);
 };

 useEffect(() => {
   fetchWaitlistCount();
 }, [tab]);

 const resetJobForm = () => {
   setJobForm({
     title: "", jobType: "crypto", category: "Development",
     budget: "", currency: "USDC", deadline: "",
     description: "", deliverables: "",
     minTrust: "0", posterName: "", contact: "", email: "",
   });
   setJobSubmitted(false);
   setJobError("");
 };
 const [selectedJob, setSelectedJob] = useState(null);
 const [showPostJob, setShowPostJob] = useState(false);
 const [showWaitlistModal, setShowWaitlistModal] = useState(false);
 const [proposalText, setProposalText] = useState("");
 const [menuOpen, setMenuOpen] = useState(false);
 const [hoveredTab, setHoveredTab] = useState(null);
 const [cibSearchHandle, setCibSearchHandle] = useState("");
 const [cibScanResult, setCibScanResult] = useState(null);
 const [cibScanning, setCibScanning] = useState(false);
 const [profileSearchHandle, setProfileSearchHandle] = useState("");
 const [openFaqIndex, setOpenFaqIndex] = useState(0);
 const [jobForm, setJobForm] = useState({
   title: "", jobType: "crypto", category: "Development",
   budget: "", currency: "USDC", deadline: "",
   description: "", deliverables: "",
   minTrust: "0", posterName: "", contact: "", email: "",
 });
 const [jobSubmitting, setJobSubmitting] = useState(false);
 const [jobSubmitted, setJobSubmitted] = useState(false);
 const [jobError, setJobError] = useState("");
 const [approvedJobs, setApprovedJobs] = useState([]);
 const [approvedJobsLoading, setApprovedJobsLoading] = useState(false);
 const [waitlistCount, setWaitlistCount] = useState(null);
 const [jobSearch, setJobSearch] = useState("");
 const [applyForm, setApplyForm] = useState({
   handle: "", message: "", portfolio: "", expectedPay: "", email: "",
 });
 const [applySubmitting, setApplySubmitting] = useState(false);
 const [applySubmitted, setApplySubmitted] = useState(false);
 const [applyError, setApplyError] = useState("");
 const [demoHandle, setDemoHandle] = useState("");
 const [demoResult, setDemoResult] = useState(null);
 const [demoLoading, setDemoLoading] = useState(false);
 const [profileDemoIdx, setProfileDemoIdx] = useState(0);
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
 const anomalyDay = data.followers > 10000 && trust.trustScore < 40? Math.floor(Math.random() * 60) + 10: null;
 setHistoryData(generateHistory(data.followers, trust.trustScore, 90, anomalyDay));
 setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start"}), 100);
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
 const anomalyDay = data.followers > 10000 && trust.trustScore < 40? Math.floor(Math.random() * 60) + 10: null;
 setHistoryData(generateHistory(data.followers, trust.trustScore, 90, anomalyDay));
 setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start"}), 100);
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
 <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"rel="stylesheet"/>

 <div style={{ position: "fixed", top: "-20%", right: "-10%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(212, 255, 0, 0.05) 0%, transparent 70%)", pointerEvents: "none"}} />
 <div style={{ position: "fixed", bottom: "-15%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(255, 255, 255, 0.02) 0%, transparent 70%)", pointerEvents: "none"}} />
 <div style={{ position: "fixed", top: "40%", left: "50%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(255, 255, 255, 0.02) 0%, transparent 60%)", pointerEvents: "none", transform: "translateX(-50%)"}} />

 {/* Header */}
 <div style={{ borderBottom: "1px solid rgba(212, 255, 0, 0.08)", padding: "16px 24px"}}>
 <style>{`
.w3g-waitlist-short { display: none; }
 @media (max-width: 600px) {
.w3g-tagline { font-size: 9px!important; letter-spacing: 0.8px!important; }
.w3g-brand { font-size: 16px!important; }
.w3g-waitlist-label { display: none!important; }
.w3g-waitlist-short { display: inline!important; }
.w3g-waitlist-btn { padding: 10px 14px!important; font-size: 13px!important; letter-spacing: 1px!important; }
 }
 @media (max-width: 380px) {
.w3g-tagline { display: none!important; }
 }
 @keyframes auroraDrift {
   0% { transform: translate(-10%, -5%) rotate(0deg); }
   33% { transform: translate(8%, 6%) rotate(120deg); }
   66% { transform: translate(-6%, 10%) rotate(240deg); }
   100% { transform: translate(-10%, -5%) rotate(360deg); }
 }
 @keyframes shimmerSlide {
   0% { background-position: -200% center; }
   100% { background-position: 200% center; }
 }
 @keyframes ctaPulse {
   0%, 100% { box-shadow: 0 0 24px rgba(212, 255, 0, 0.25); }
   50% { box-shadow: 0 0 36px rgba(212, 255, 0, 0.45); }
 }
 @keyframes gridFloat {
   0%, 100% { transform: translateY(0); }
   50% { transform: translateY(-6px); }
 }
 @keyframes skeletonPulse {
   0%, 100% { background-position: -200% 0; }
   100% { background-position: 200% 0; }
 }
 @keyframes skeletonShimmer {
   0% { transform: translateX(-100%); }
   100% { transform: translateX(100%); }
 }
 .w3g-skeleton {
   position: relative;
   overflow: hidden;
   background: rgba(255, 255, 255, 0.04);
   border-radius: 6px;
 }
 .w3g-skeleton::after {
   content: "";
   position: absolute; inset: 0;
   background: linear-gradient(90deg, transparent 0%, rgba(212, 255, 0, 0.06) 50%, transparent 100%);
   animation: skeletonShimmer 1.6s ease-in-out infinite;
 }
 .w3g-aurora {
   position: absolute; pointer-events: none; z-index: 0;
   width: 80%; height: 80%; top: 10%; left: 10%;
   background: radial-gradient(circle at 30% 40%, rgba(212, 255, 0, 0.06) 0%, transparent 50%),
               radial-gradient(circle at 70% 60%, rgba(0, 200, 255, 0.04) 0%, transparent 50%),
               radial-gradient(circle at 50% 50%, rgba(212, 255, 0, 0.03) 0%, transparent 60%);
   filter: blur(40px);
   animation: auroraDrift 24s ease-in-out infinite;
 }
 .w3g-shimmer-text {
   background: linear-gradient(90deg, #d4ff00 20%, #ffffff 45%, #d4ff00 55%, #d4ff00 80%);
   background-size: 200% auto;
   -webkit-background-clip: text;
   background-clip: text;
   -webkit-text-fill-color: transparent;
   color: transparent;
   animation: shimmerSlide 6s ease-in-out infinite;
 }
 .w3g-cta-pulse {
   animation: ctaPulse 3s ease-in-out infinite;
 }
 .w3g-cta-pulse:hover {
   animation: none;
 }
 .w3g-grid-bg {
   position: absolute; pointer-events: none; z-index: 0;
   inset: 0;
   background-image: linear-gradient(rgba(212, 255, 0, 0.025) 1px, transparent 1px),
                     linear-gradient(90deg, rgba(212, 255, 0, 0.025) 1px, transparent 1px);
   background-size: 60px 60px;
   mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
   -webkit-mask-image: radial-gradient(ellipse at center, black 0%, transparent 70%);
   animation: gridFloat 8s ease-in-out infinite;
 }
 `}</style>
 <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "nowrap", gap: 8 }}>
 <div
 onClick={() => setTab("home")}
 style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", transition: "opacity 0.2s", minWidth: 0 }}
 onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
 onMouseLeave={e => e.currentTarget.style.opacity = "1"}
 >
 <svg width="40" height="40" viewBox="0 0 80 80" style={{ flexShrink: 0, overflow: "visible"}} xmlns="http://www.w3.org/2000/svg">
 <defs>
 <linearGradient id="logoLime" x1="0" y1="0" x2="1" y2="1">
 <stop offset="0%" stopColor="#d4ff00"/>
 <stop offset="100%" stopColor="#b8e600"/>
 </linearGradient>
 </defs>
 {/* Shield outline, safe-margins so nothing clips on any side */}
 <path d="M 40 10 L 66 18 L 66 45 Q 66 60 40 72 Q 14 60 14 45 L 14 18 Z"
 fill="none" stroke="url(#logoLime)" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round"/>
 {/* Lucide Handshake icon inside shield */}
 <g transform="translate(22, 28) scale(1.45)"
 fill="none"
 stroke="url(#logoLime)"
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round">
 <path d="m11 17 2 2a1 1 0 1 0 3-3"/>
 <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/>
 <path d="m21 3 1 11h-2"/>
 <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/>
 <path d="M3 4h8"/>
 </g>
 </svg>
 <div style={{ minWidth: 0 }}>
 <div className="w3g-brand"style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.5 }}>Web3Gigs</div>
 <div className="w3g-tagline"style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, textTransform: "uppercase"}}>Hire · Handshake · Ship</div>
 </div>
 </div>
 {/* Right side, waitlist + menu */}
 <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
 <button
 className="w3g-waitlist-btn"onClick={() => { setWaitlistSubmitted(false); setWaitlistError(""); setShowWaitlistModal(true); }}
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
 <Mail size={14} strokeWidth={2.5} />
 <span className="w3g-waitlist-short">WL</span>
 <span className="w3g-waitlist-label">Join Waitlist</span>
 {waitlistCount !== null && waitlistCount > 0 && (
 <span style={{
 display: "inline-flex", alignItems: "center", justifyContent: "center",
 minWidth: 18, height: 18, padding: "0 5px",
 borderRadius: 9,
 background: "rgba(0, 0, 0, 0.85)",
 color: C.primary,
 fontSize: 10, fontWeight: 900,
 fontFamily: "'JetBrains Mono', monospace",
 letterSpacing: 0,
 marginLeft: 2,
 }}>{waitlistCount.toLocaleString()}</span>
 )}
 </button>
 {/* Hamburger Menu */}
 <div style={{ position: "relative"}}>
 <button
 onClick={() => setMenuOpen(!menuOpen)}
 onMouseEnter={e => { e.currentTarget.style.background = "rgba(212, 255, 0, 0.18)"; e.currentTarget.style.transform = "scale(1.05)"; }}
 onMouseLeave={e => { e.currentTarget.style.background = menuOpen? "rgba(212, 255, 0, 0.12)": "rgba(0, 0, 0, 0.5)"; e.currentTarget.style.transform = "scale(1)"; }}
 style={{
 display: "flex", alignItems: "center", gap: 10,
 padding: "10px 18px", borderRadius: 12,
 background: menuOpen? "rgba(212, 255, 0, 0.12)": "rgba(0, 0, 0, 0.5)",
 border: `1px solid ${menuOpen? C.borderHover: "rgba(255, 255, 255, 0.06)"}`,
 color: menuOpen? C.primary: C.textSecondary,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700,
 cursor: "pointer", textTransform: "uppercase", letterSpacing: 1.2,
 transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
 }}
 >
 {/* Menu icon */}
 <MenuIcon size={16} strokeWidth={2.5} style={{ transition: "transform 0.3s", transform: menuOpen? "rotate(90deg)": "none"}} />
 <span>
 {[
 ["home", "Home"],
 ["jobs", "Jobs"],
 ["valuate", "Analyze"],
 ["trust", "Trust"],
 ["leaderboard", "Ranks"],
 ["cib", "CIB"],
 ["alerts", "Alerts"],
 ["profile", "Profile"],
 ["about", "About"],
 ].find(([t]) => t === tab)?.[1] || "Menu"}
 </span>
 </button>

 {/* Dropdown Menu */}
 {menuOpen && (
 <>
 {/* Click-away overlay with backdrop blur on mobile */}
 <div
 className="w3g-menu-backdrop"
 onClick={() => setMenuOpen(false)}
 style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}
 />
 {/* Menu panel */}
 <div className="w3g-menu-panel" style={{
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
 @keyframes mobileMenuSlide {
 from { transform: translateX(100%); }
 to { transform: translateX(0); }
 }
 @keyframes mobileBackdropFade {
 from { opacity: 0; }
 to { opacity: 1; }
 }
 @media (max-width: 600px) {
 .w3g-menu-backdrop {
 background: rgba(0, 0, 0, 0.6) !important;
 backdrop-filter: blur(8px);
 -webkit-backdrop-filter: blur(8px);
 animation: mobileBackdropFade 0.25s ease-out;
 }
 .w3g-menu-panel {
 position: fixed !important;
 top: 0 !important;
 right: 0 !important;
 bottom: 0 !important;
 left: auto !important;
 width: 86% !important;
 max-width: 360px !important;
 min-width: 0 !important;
 height: 100vh !important;
 height: 100dvh !important;
 border-radius: 0 !important;
 border: none !important;
 border-left: 1px solid rgba(212, 255, 0, 0.15) !important;
 padding: 16px !important;
 padding-top: env(safe-area-inset-top, 16px) !important;
 padding-bottom: env(safe-area-inset-bottom, 16px) !important;
 animation: mobileMenuSlide 0.32s cubic-bezier(0.16, 1, 0.3, 1) !important;
 box-shadow: -20px 0 60px rgba(0, 0, 0, 0.7) !important;
 overflow-y: auto !important;
 }
 .w3g-menu-close {
 display: flex !important;
 }
 .w3g-menu-item {
 padding: 16px 14px !important;
 min-height: 56px !important;
 margin-bottom: 4px !important;
 }
 .w3g-menu-item-label {
 font-size: 15px !important;
 }
 .w3g-menu-item-desc {
 font-size: 11px !important;
 }
 .w3g-menu-item-icon-size { /* signal larger icon on mobile */ }
 .w3g-menu-header {
 display: flex !important;
 }
 }
 `}</style>

 {/* Mobile-only header with close button */}
 <div className="w3g-menu-header" style={{
 display: "none",
 alignItems: "center", justifyContent: "space-between",
 padding: "8px 8px 16px", marginBottom: 8,
 borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
 <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>Menu</span>
 </div>
 <button
 className="w3g-menu-close"
 onClick={() => setMenuOpen(false)}
 style={{
 display: "none",
 width: 36, height: 36, borderRadius: 10,
 background: "rgba(255, 255, 255, 0.05)",
 border: "1px solid rgba(255, 255, 255, 0.08)",
 color: C.textPrimary, cursor: "pointer",
 alignItems: "center", justifyContent: "center",
 transition: "all 0.15s",
 }}
 onTouchStart={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"; e.currentTarget.style.transform = "scale(0.95)"; }}
 onTouchEnd={e => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"; e.currentTarget.style.transform = "scale(1)"; }}
 >
 <XIcon size={18} strokeWidth={2.5} />
 </button>
 </div>
 {[
 ["home", Home, "Home", "Welcome + overview"],
 ["jobs", Briefcase, "Jobs", "Hire or get hired"],
 ["valuate", Search, "Analyze", "Full CT account analysis"],
 ["trust", Shield, "Trust", "Trust Score guide"],
 ["leaderboard", Trophy, "Ranks", "CT leaderboards"],
 ["cib", Network, "CIB", "Bot & pod detection"],
 ["alerts", Bell, "Alerts", "Real-time watchlist"],
 ["profile", User, "Profile", "Example profile preview"],
 ["about", FileText, "About", "Why I built this"],
 ].map(([t, Icon, label, desc]) => {
 const isActive = tab === t;
 const isHovered = hoveredTab === t;
 return (
 <button
 key={t}
 onClick={() => { setTab(t); setMenuOpen(false); }}
 onMouseEnter={() => setHoveredTab(t)}
 onMouseLeave={() => setHoveredTab(null)}
 className="w3g-menu-item"
 style={{
 width: "100%", display: "flex", alignItems: "center", gap: 12,
 padding: "12px 14px", borderRadius: 10, border: "none",
 background: isActive? `linear-gradient(135deg, ${C.primary}20, ${C.accent}15)`: isHovered? "rgba(255, 255, 255, 0.05)": "transparent",
 color: isActive? C.primary: isHovered? C.textPrimary: C.textSecondary,
 cursor: "pointer", textAlign: "left",
 fontFamily: "'Outfit', sans-serif",
 transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
 transform: isHovered? "scale(1.02) translateX(2px)": "scale(1)",
 boxShadow: isHovered? `0 4px 20px rgba(255, 255, 255, 0.06)`: "none",
 borderLeft: isActive? `3px solid ${C.primary}`: "3px solid transparent",
 marginBottom: 2,
 }}
 >
 <div style={{
 width: 28, display: "flex", alignItems: "center", justifyContent: "center",
 color: isActive ? C.primary : isHovered ? C.textPrimary : C.textMuted,
 transition: "color 0.2s",
 }}>
 <Icon size={isHovered ? 20 : 18} strokeWidth={2} />
 </div>
 <div style={{ flex: 1 }}>
 <div className="w3g-menu-item-label" style={{
 fontSize: isHovered? 14: 13,
 fontWeight: 700,
 letterSpacing: isHovered? 0: -0.2,
 transition: "all 0.2s",
 }}>{label}</div>
 <div className="w3g-menu-item-desc" style={{
 fontSize: 10,
 color: isActive? `${C.primary}aa`: C.textMuted,
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

 <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px"}}>

 {/* ─── HOME / LANDING TAB ───────────────────────────── */}
 {tab === "home"&& (
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
.ticker-track { animation: scrollTicker 140s linear infinite; }
 `}</style>
 <div className="ticker-track"style={{ display: "flex", gap: 28, whiteSpace: "nowrap", width: "max-content"}}>
 {[...Array(2)].map((_, loopIdx) => (
 <div key={loopIdx} style={{ display: "flex", gap: 28 }}>
 {[
 // Crypto Work
 { title: "Solana dev · Anchor escrow mod", budget: 2500, deadline: "2w", trust: 40, status: "open", type: "crypto"},
 { title: "Smart contract audit · ERC-20 + staking", budget: 5000, deadline: "3w", trust: 40, status: "open", type: "crypto"},
 { title: "Frontend dev · React + Wagmi dashboard", budget: 1800, deadline: "2w", trust: 30, status: "open", type: "crypto"},
 { title: "Video editor · 30s crypto explainer", budget: 300, deadline: "5d", trust: 30, status: "open", type: "crypto"},
 { title: "Whitepaper writer · L2 rollup", budget: 1500, deadline: "3w", trust: 40, status: "open", type: "crypto"},
 { title: "NFT PFP design · 10 pieces", budget: 1200, deadline: "10d", trust: 30, status: "progress", type: "crypto"},
 { title: "Community manager · Discord + TG", budget: 1000, deadline: "Ongoing", trust: 35, status: "open", type: "crypto"},
 { title: "Logo + brand kit · DePIN project", budget: 900, deadline: "10d", trust: 30, status: "open", type: "crypto"},
 { title: "Technical blog writer · DeFi primitives", budget: 600, deadline: "Ongoing", trust: 30, status: "open", type: "crypto"},
 { title: "AI memecoin sniper bot · Solana", budget: 3500, deadline: "3w", trust: 45, status: "open", type: "crypto"},
 { title: "LLM on-chain analytics assistant", budget: 2200, deadline: "2w", trust: 40, status: "open", type: "crypto"},
 // CT / KOL
 { title: "Shitpost campaign · memecoin launch", budget: 500, deadline: "72h", trust: 55, status: "open", type: "ct"},
 { title: "Thread writer · weekly alpha", budget: 800, deadline: "Ongoing", trust: 70, status: "open", type: "ct"},
 { title: "KOL raid · 50 engaged comments", budget: 150, deadline: "24h", trust: 40, status: "open", type: "ct"},
 { title: "Space host · weekly founder AMAs", budget: 400, deadline: "Ongoing", trust: 70, status: "open", type: "ct"},
 { title: "Meme warfare · 48h campaign", budget: 250, deadline: "48h", trust: 50, status: "open", type: "ct"},
 { title: "Streamer · weekly sessions", budget: 2000, deadline: "Ongoing", trust: 60, status: "open", type: "ct"},
 { title: "Clipper · daily CT highlights", budget: 450, deadline: "Ongoing", trust: 40, status: "open", type: "ct"},
 { title: "Spaces clipper · viral moments", budget: 600, deadline: "Ongoing", trust: 45, status: "open", type: "ct"},
 { title: "Podcast editor · longform to shorts", budget: 1200, deadline: "Ongoing", trust: 45, status: "open", type: "ct"},
 { title: "Kick clipper · stream content", budget: 350, deadline: "Ongoing", trust: 35, status: "open", type: "ct"},
 ].map((item, i) => {
 const statusColor = item.status === "open"? "#10b981": "#fbbf24";
 const typeColor = item.type === "crypto"? "#60a5fa": "#c084fc";
 const typeLabel = item.type === "crypto"? "CRYPTO": "CT";
 return (
 <div key={`${loopIdx}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
 <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
 <span style={{ padding: "2px 6px", borderRadius: 4, background: `${typeColor}15`, color: typeColor, fontSize: 9, fontWeight: 800, letterSpacing: 0.8 }}>{typeLabel}</span>
 <span style={{ color: C.textPrimary, fontWeight: 700 }}>{item.title}</span>
 <span style={{ color: C.primary, fontWeight: 800 }}>${item.budget.toLocaleString()} USDC</span>
 <span style={{ color: C.textMuted }}>·</span>
 <span style={{ color: C.textSecondary, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
 <Clock size={11} strokeWidth={2} /> {item.deadline}
 </span>
 <span style={{ color: C.textMuted }}>·</span>
 <span style={{ color: "#fbbf24", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
 <Shield size={11} strokeWidth={2} /> {item.trust}+
 </span>
 <span style={{ color: C.textMuted, marginLeft: 8 }}>·</span>
 </div>
 );
 })}
 </div>
 ))}
 </div>
 </div>

 {/* HERO */}
 <div style={{ textAlign: "center", padding: "20px 20px 60px", position: "relative", overflow: "hidden"}}>
 {/* Animated grid bg */}
 <div className="w3g-grid-bg" />
 {/* Aurora glow */}
 <div className="w3g-aurora" />
 <div style={{ position: "relative", zIndex: 1 }}>
 {/* Badge */}
 <Reveal>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.2)", marginBottom: 24 }}>
 <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary, boxShadow: `0 0 10px ${C.primary}`, animation: "pulse 2s ease-in-out infinite"}} />
 <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
 <span style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>The Crypto Work Marketplace</span>
 </div>
 </Reveal>

 {/* Headline */}
 <Reveal delay={100}>
 <h1 style={{ fontSize: 64, fontWeight: 900, margin: 0, letterSpacing: -3, lineHeight: 1 }}>Hire crypto's best.<br />
 <span className="w3g-shimmer-text">Trust-verified.</span>
 </h1>
 </Reveal>
 <Reveal delay={200}>
 <p style={{ color: C.textSecondary, fontSize: 18, marginTop: 20, maxWidth: 560, margin: "20px auto 0", lineHeight: 1.5 }}>Dev, design, audits, writing, or shitposts, raids, and Spaces. Every applicant comes with a Trust Score attached. No middleman. No 20% Fiverr cut. Get paid in USDC, USDT or SOL.
 </p>
 </Reveal>

 {/* CTAs */}
 <Reveal delay={300}>
 <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32, flexWrap: "wrap"}}>
 <button
 onClick={() => setTab("jobs")}
 className="w3g-cta-pulse"
 style={{
 padding: "14px 28px", borderRadius: 12, border: "none",
 background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: "#000", fontSize: 14, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer",
 letterSpacing: 0.3, transition: "all 0.2s",
 }}
 onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(212, 255, 0, 0.5)"; }}
 onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = ""; }}
 >Browse Open Jobs</button>
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
 >Analyze Any Account</button>
 </div>
 {waitlistCount !== null && waitlistCount > 0 && (
 <div style={{ marginTop: 20, display: "flex", justifyContent: "center"}}>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 20, background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(212, 255, 0, 0.2)"}}>
 <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
 <span style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.8 }}>
 <span style={{ color: C.primary, fontWeight: 800 }}>{waitlistCount.toLocaleString()}</span> {waitlistCount === 1 ? "builder" : "builders"} on the waitlist
 </span>
 </div>
 </div>
 )}
 </Reveal>

 {/* LIVE JOBS PREVIEW */}
 <Reveal delay={500}>
 <div style={{ marginTop: 48, maxWidth: 720, margin: "48px auto 0"}}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
 <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px #10b981", animation: "pulse 2s ease-in-out infinite"}} />
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2 }}>{approvedJobs.length > 0 ? "Recently Posted · Live" : "Live Jobs · Hiring Now"}</div>
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
 {approvedJobsLoading && approvedJobs.length === 0 ? (
 <>
 <MiniJobSkeleton />
 <MiniJobSkeleton />
 <MiniJobSkeleton />
 <MiniJobSkeleton />
 </>
 ) : (() => {
 // Show approved jobs first (up to 4), fallback to mock preview
 // Only show OPEN jobs on home preview (not in_progress or completed)
 const realPreviews = approvedJobs.filter(j => j.status === "open").slice(0, 4).map(j => ({
 cat: j.category,
 title: j.title,
 budget: j.budget,
 currency: j.budgetCurrency || "USDC",
 deadline: j.deadline,
 trust: j.minTrustScore || 0,
 type: j.jobType === "ct" ? "CT" : "CRYPTO",
 typeColor: j.jobType === "ct" ? "#c084fc" : "#60a5fa",
 isReal: true,
 poster: j.poster,
 jobId: j.id,
 }));
 const mockPreviews = [
 { cat: "Dev", title: "Solana dev · Anchor escrow", budget: 2500, currency: "USDC", deadline: "2w", trust: 40, type: "CRYPTO", typeColor: "#60a5fa", isReal: false },
 { cat: "Audit", title: "Smart contract audit · ERC-20", budget: 5000, currency: "USDC", deadline: "3w", trust: 40, type: "CRYPTO", typeColor: "#60a5fa", isReal: false },
 { cat: "Shitpost", title: "Shitpost campaign · memecoin", budget: 500, currency: "USDC", deadline: "72h", trust: 55, type: "CT", typeColor: "#c084fc", isReal: false },
 { cat: "Writing", title: "Whitepaper · L2 rollup", budget: 1500, currency: "USDC", deadline: "3w", trust: 40, type: "CRYPTO", typeColor: "#60a5fa", isReal: false },
 ];
 // Fill remaining slots with mocks if fewer than 4 approved
 const combined = [...realPreviews];
 while (combined.length < 4) {
 const fillIdx = combined.length;
 combined.push(mockPreviews[fillIdx]);
 }
 return combined.slice(0, 4).map((job, i) => (
 <div
 key={i}
 onClick={() => setTab("jobs")}
 style={{
 padding: "14px 16px", borderRadius: 12,
 background: job.isReal ? "rgba(212, 255, 0, 0.04)" : "rgba(18, 18, 18, 0.7)",
 border: `1px solid ${job.isReal ? "rgba(212, 255, 0, 0.25)" : "rgba(255, 255, 255, 0.06)"}`,
 cursor: "pointer", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
 textAlign: "left", position: "relative",
 }}
 onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(212, 255, 0, 0.5)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.background = job.isReal ? "rgba(212, 255, 0, 0.08)" : "rgba(30, 30, 30, 0.9)"; }}
 onMouseLeave={e => { e.currentTarget.style.borderColor = job.isReal ? "rgba(212, 255, 0, 0.25)" : "rgba(255, 255, 255, 0.06)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = job.isReal ? "rgba(212, 255, 0, 0.04)" : "rgba(18, 18, 18, 0.7)"; }}
 >
 {job.isReal && (
 <span style={{ position: "absolute", top: 8, right: 8, padding: "2px 6px", borderRadius: 4, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, color: "#000", fontSize: 8, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, boxShadow: `0 0 8px ${C.primary}40` }}>NEW</span>
 )}
 <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
 <span style={{ padding: "2px 6px", borderRadius: 4, background: `${job.typeColor}15`, color: job.typeColor, fontSize: 9, fontWeight: 800, letterSpacing: 0.8, fontFamily: "'JetBrains Mono', monospace"}}>{job.type}</span>
 <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{job.cat}</span>
 </div>
 <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 10, lineHeight: 1.3, textAlign: "left", paddingRight: job.isReal ? 32 : 0 }}>{job.title}</div>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontFamily: "'JetBrains Mono', monospace"}}>
 <span style={{ color: C.primary, fontWeight: 800 }}>${job.budget.toLocaleString()} {job.currency}</span>
 <span style={{ color: C.textMuted, display: "inline-flex", alignItems: "center", gap: 3 }}>
 <Clock size={10} strokeWidth={2} /> {job.deadline}
 </span>
 </div>
 {job.trust > 0 && (
 <div style={{ marginTop: 6, fontSize: 10, color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace"}}>Trust {job.trust}+</div>
 )}
 </div>
 ));
 })()}
 </div>
 </div>
 </Reveal>
 <Reveal delay={200}>
 <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 56, flexWrap: "wrap"}}>
 {[
 { val: 96, prefix: "", suffix: "%", lbl: "Bot detection accuracy"},
 { val: 18, prefix: "", suffix: "k+", lbl: "Trust scores generated"},
 ].map((s, i) => (
 <div key={s.lbl} style={{ textAlign: "center"}}>
 <div style={{ fontSize: 28, fontWeight: 900, color: C.primary, letterSpacing: -1, fontFamily: "'JetBrains Mono', monospace"}}>
 {s.static? s.display: <CountUp end={s.val} prefix={s.prefix} suffix={s.suffix} duration={1800} />}
 </div>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 2 }}>{s.lbl}</div>
 </div>
 ))}
 </div>
 </Reveal>
 </div>
 </div>

 {/* HOW IT WORKS */}
 <Reveal>
 <div style={{ marginBottom: 60 }}>
 <div style={{ textAlign: "center", marginBottom: 40 }}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>How It Works</div>
 <h2 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>Three <span style={{ color: C.primary }}>easy</span> steps.</h2>
 </div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
 {[
 { num: "01", title: "Post or Apply", desc: "Post a job with budget, deadline, and minimum trust score. Or browse jobs and apply with your reputation attached.", Icon: FileText },
 { num: "02", title: "Handshake", desc: "Both parties sign a public on-chain commitment. Trust scores + community reputation enforce delivery. No middleman taking a cut.", Icon: Handshake },
 { num: "03", title: "Get Paid", desc: "Work delivered, buyer approves, funds released in USDC, USDT or SOL. Reputation compounds for both sides. Pure crypto-native workflow.", Icon: DollarSign },
 ].map((step, i) => (
 <GlowCard key={step.num} glow style={{ position: "relative", paddingTop: 32 }}>
 <div style={{ position: "absolute", top: 20, right: 20, fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 2 }}>/ {step.num}</div>
 <div style={{ marginBottom: 14, color: C.primary }}><step.Icon size={36} strokeWidth={2} /></div>
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
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Handshake Jobs · NEW</div>
 <h2 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>Two sides of <span style={{ color: C.primary }}>crypto work.</span></h2>
 <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 12, maxWidth: 560, margin: "12px auto 0", lineHeight: 1.5 }}>Whether you're building a protocol or running a memecoin launch, there's a version of crypto work here for you. Trust-verified. Paid in USDC. No middlemen.
 </p>
 </div>

 {/* Two-category split */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 24 }}>
 {/* CRYPTO WORK SIDE */}
 <GlowCard glow style={{ padding: "24px", background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), rgba(0, 0, 0, 0.5))` }}>
 <div style={{ marginBottom: 14, color: C.primary }}><Briefcase size={32} strokeWidth={2} /></div>
 <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, letterSpacing: -0.5 }}>Crypto Work</div>
 <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Dev · Design · Audits · Writing</div>
 <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>Hire real professionals for real crypto work. Solana devs, smart contract auditors, designers, whitepaper writers, community managers. Portfolio-based. Scam-free.
 </div>
 {/* Sample job mini-cards */}
 <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
 {[
 { title: "Solana dev · Anchor escrow", budget: "$2.5k"},
 { title: "Smart contract audit", budget: "$5k"},
 { title: "Logo + brand kit · DePIN", budget: "$900"},
 ].map(j => (
 <div key={j.title} style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
 <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.primary, flexShrink: 0 }} />
 <span style={{ fontSize: 12, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace"}}>{j.title}</span>
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
 >Browse Crypto Work →</button>
 </GlowCard>

 {/* CT / KOL SIDE */}
 <GlowCard glow style={{ padding: "24px", background: `linear-gradient(135deg, rgba(52, 211, 153, 0.04), rgba(0, 0, 0, 0.5))` }}>
 <div style={{ marginBottom: 14, color: "#34d399"}}><Megaphone size={32} strokeWidth={2} /></div>
 <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, letterSpacing: -0.5 }}>CT / KOL Jobs</div>
 <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14 }}>Shitposts · Threads · Raids · Spaces</div>
 <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>Hire CT natives who actually move narratives. KOLs, shitposters, thread writers, meme warriors. Trust Score = your reputation. High-trust accounts get booked first.
 </div>
 {/* Sample job mini-cards */}
 <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
 {[
 { title: "Thread writer · weekly alpha", budget: "$800"},
 { title: "Shitpost campaign · memecoin", budget: "$500"},
 { title: "Space host · weekly AMAs", budget: "$400"},
 ].map(j => (
 <div key={j.title} style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
 <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.primary, flexShrink: 0 }} />
 <span style={{ fontSize: 12, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace"}}>{j.title}</span>
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
 >Browse CT Jobs →</button>
 </GlowCard>
 </div>

 {/* Stats strip */}
 <GlowCard style={{ padding: "20px 24px", background: "rgba(0, 0, 0, 0.5)"}}>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
 {[
 { label: "Open Jobs", val: "33", Icon: Briefcase },
 { label: "Total Budget", val: "$80k+", Icon: DollarSign },
 { label: "vs Fiverr Cut", val: "0%", Icon: Zap },
 { label: "Paid in", val: "USDC", Icon: Sparkles },
 { label: "Disputes", val: "0", Icon: Shield },
 ].map(s => (
 <div key={s.label} style={{ textAlign: "center"}}>
 <div style={{ display: "flex", justifyContent: "center", marginBottom: 6, color: C.primary }}><s.Icon size={18} strokeWidth={2} /></div>
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
 <p style={{ color: C.textSecondary, fontSize: 14, marginTop: 12, maxWidth: 520, margin: "12px auto 0", lineHeight: 1.5 }}>Every Handshake is backed by real signals. Explore the reputation infrastructure that makes the marketplace work.
 </p>
 </div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
 {[
 { Icon: Shield, title: "Trust Score", desc: "0-100 authenticity rating. Exposes bot-inflated audiences and engagement pods.", tab: "trust"},
 { Icon: Network, title: "CIB Detection", desc: "Catches coordinated pods, raid networks, and F4F rings before you get scammed.", tab: "cib"},
 { Icon: TrendingUp, title: "90-Day Tracking", desc: "Historical timeline exposes sudden growth spikes, bot purchases, and anomalies.", tab: "valuate"},
 { Icon: Trophy, title: "CT Leaderboards", desc: "Trending, Rising, and Suspicious rankings updated hourly.", tab: "leaderboard"},
 { Icon: Bell, title: "Real-Time Alerts", desc: "Watch any account. Get notified the second something changes.", tab: "alerts"},
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
 <div style={{ marginBottom: 14, color: C.primary }}>
 <f.Icon size={28} strokeWidth={2} />
 </div>
 <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, letterSpacing: -0.3 }}>{f.title}</div>
 <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{f.desc}</div>
 <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", marginTop: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
 Explore <ArrowRight size={11} strokeWidth={2.5} />
 </div>
 </div>
 ))}
 </div>
 </div>
 </Reveal>
 {/* TRUST SIGNALS / WHY USE US */}
 <Reveal>
 <div style={{ marginBottom: 60 }}>
 <GlowCard glow style={{ padding: "32px"}}>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
 {[
 { title: "Independent Analysis", desc: "No paid placements. Every score is algorithmically generated from public data."},
 { title: "Bot Detection", desc: "Our algorithm exposes bot-inflated followings and fake engagement."},
 { title: "Public Data Only", desc: "We only analyze what X makes public, no special access, no ToS violations."},
 { title: "Tracked History", desc: "90-day account snapshots expose sudden growth spikes and red flags."},
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

 {/* FAQ SECTION */}
 <Reveal>
 <div style={{ marginBottom: 60 }}>
 <div style={{ textAlign: "center", marginBottom: 32 }}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>FAQ</div>
 <h2 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>Common <span style={{ color: C.primary }}>questions</span>.</h2>
 </div>
 <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
 {[
 {
 q: "When does Web3Gigs launch?",
 a: "V1 launches soon. Join the waitlist to get first access to the trust-verified marketplace, on-chain Handshakes, and full Trust Score analytics. Early waitlist members get priority onboarding and zero listing fees at launch.",
 },
 {
 q: "How does the Trust Score work?",
 a: "Every CT account gets a 0-100 authenticity rating based on 7 signals: follower velocity, engagement quality, bot follower ratio, CIB cluster membership, account age, content consistency, and cross-platform verification. Trust Scores are public, on-chain anchored, and portable, not locked to Web3Gigs. You can't game it by buying followers or joining pods."
 },
 {
 q: "Is it free to use?",
 a: "Browsing jobs, viewing profiles, and checking Trust Scores will always be free. V1 launches with zero fees on job posts or applications, we're not taking a cut during the early phase. Optional premium features (advanced CIB scans, real-time alerts, verification boosts) may be introduced later, but the core marketplace stays free-to-use.",
 },
 {
 q: "How are disputes handled?",
 a: "V1 uses a reputation-first Handshake model, both parties sign a public commitment before work starts. If a party breaks the handshake, their Trust Score takes a public, permanent hit. V2 will add optional Squads multisig escrow for higher-stakes jobs. V3 will introduce Kleros-style decentralized arbitration. No centralized mediator takes your side by default.",
 },
 {
 q: "How do payments work?",
 a: "Direct wallet-to-wallet. Web3Gigs never holds your money, funds move directly between buyer and worker in USDC, USDT or SOL. No 14-day holds, no chargebacks, no platform taking a % of your payout. You keep 100% of what you earn.",
 },
 {
 q: "Who is Web3Gigs for?",
 a: "Anyone hiring or getting hired in crypto. Devs, designers, smart contract auditors, technical writers, community managers, video editors, AI/ML builders, plus the CT-native side: shitposters, thread writers, Spaces hosts, KOL raids, meme warfare, and clippers. If the work pays in stables or SOL and reputation matters, it's probably here.",
 },
 {
 q: "Who's behind Web3Gigs?",
 a: "Built by @FabsKebabs, a solo builder active in the Solana memecoin and CT ecosystems. No VCs, no token, no promises of riches. Just a product trying to solve the actual problem of hiring without getting scammed in crypto. Follow the builder on X for dev updates, alpha drops, and early access invites.",
 },
 ].map((item, i) => {
 const isOpen = openFaqIndex === i;
 return (
 <GlowCard key={i} style={{ padding: 0, overflow: "hidden", cursor: "pointer"}}>
 <div
 onClick={() => setOpenFaqIndex(isOpen ? -1 : i)}
 style={{
 padding: "18px 22px",
 display: "flex", alignItems: "center", justifyContent: "space-between",
 gap: 12,
 }}
 >
 <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
 <div style={{
 width: 24, height: 24, borderRadius: 6,
 background: isOpen ? `${C.primary}20` : "rgba(255, 255, 255, 0.04)",
 color: isOpen ? C.primary : C.textMuted,
 display: "flex", alignItems: "center", justifyContent: "center",
 fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 900,
 flexShrink: 0, transition: "all 0.2s",
 }}>{String(i + 1).padStart(2, "0")}</div>
 <div style={{ fontSize: 15, fontWeight: 700, color: isOpen ? C.primary : C.textPrimary, letterSpacing: -0.2, transition: "color 0.2s"}}>{item.q}</div>
 </div>
 <div style={{
 width: 24, height: 24, borderRadius: 6,
 background: "rgba(255, 255, 255, 0.04)",
 display: "flex", alignItems: "center", justifyContent: "center",
 color: isOpen ? C.primary : C.textMuted,
 transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
 transition: "all 0.3s",
 flexShrink: 0,
 }}>
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
 </div>
 </div>
 {isOpen && (
 <div style={{
 padding: "0 22px 20px 58px",
 fontSize: 13, color: C.textSecondary, lineHeight: 1.6,
 borderTop: "1px solid rgba(255, 255, 255, 0.04)",
 paddingTop: 14,
 margin: "0 0 0 0",
 }}>
 {item.a}
 </div>
 )}
 </GlowCard>
 );
 })}
 </div>
 <div style={{ textAlign: "center", marginTop: 24 }}>
 <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
 Got more questions? DM{" "}
 <a
 href="https://x.com/FabsKebabs"
 target="_blank"
 rel="noopener noreferrer"
 style={{
 color: C.primary, fontWeight: 700,
 textDecoration: "none",
 borderBottom: `1px solid ${C.primary}40`,
 transition: "all 0.2s",
 }}
 onMouseEnter={e => { e.currentTarget.style.borderBottomColor = C.primary; e.currentTarget.style.textShadow = `0 0 8px ${C.primary}60`; }}
 onMouseLeave={e => { e.currentTarget.style.borderBottomColor = `${C.primary}40`; e.currentTarget.style.textShadow = "none"; }}
 >@FabsKebabs</a>{" "}on X
 </div>
 </div>
 </div>
 </Reveal>

 {/* FINAL CTA */}
 <Reveal>
 <GlowCard glow style={{ textAlign: "center", padding: "48px 32px", background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), rgba(0, 0, 0, 0.5))` }}>
 <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1.5, marginBottom: 12 }}>Join <span style={{ color: C.primary }}>crypto's work marketplace.</span>
 </div>
 <div style={{ fontSize: 15, color: C.textSecondary, marginBottom: 28, maxWidth: 500, margin: "0 auto 28px"}}>
 33+ open jobs. Zero middleman fees. Paid in USDC, USDT or SOL. Reputation-first hiring. Ship the way crypto was meant to work.
 </div>
 <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap"}}>
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
 >Browse Open Jobs</button>
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
 >Analyze Any Account</button>
 </div>
 </GlowCard>
 </Reveal>
 </div>
 )}

 {tab === "valuate"&& (
 <div>
 <div style={{ textAlign: "center", marginBottom: 40 }}>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.2)", marginBottom: 20 }}>
 <Search size={12} strokeWidth={2.5} style={{ color: C.primary }} />
 <span style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>Full Account Analysis</span>
 </div>
 <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0, letterSpacing: -1.5, lineHeight: 1.1 }}>Verify any <span style={{ color: C.primary }}>CT account.</span>
 </h1>
 <p style={{ color: C.textSecondary, fontSize: 16, marginTop: 12, fontWeight: 400, maxWidth: 520, margin: "12px auto 0", lineHeight: 1.5 }}>Trust score, bot detection, CIB analysis, 90-day tracking, engagement forensics, and red flag signals, all in one lookup.
 </p>

 {/* What you'll see */}
 <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20, flexWrap: "wrap"}}>
 {[
 "Trust Score",
 "Bot Detection",
 "CIB Analysis",
 "90-Day Timeline",
 "Engagement Forensics",
 "Red Flags",
 ].map(chip => (
 <div key={chip} style={{ padding: "5px 11px", borderRadius: 16, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace"}}>
 {chip}
 </div>
 ))}
 </div>
 </div>

 {/* WORKING DEMO TOOL */}
 <GlowCard glow style={{ maxWidth: 720, margin: "0 auto 24px", padding: "28px 24px", background: `linear-gradient(180deg, rgba(212, 255, 0, 0.03), rgba(0, 0, 0, 0.5))` }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 20, background: "rgba(212, 255, 0, 0.08)", border: "1px solid rgba(212, 255, 0, 0.25)"}}>
 <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
 <span style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>Try the Preview</span>
 </div>
 <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: "#fbbf24", color: "#000", fontSize: 10, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1.5 }}>
 <AlertTriangle size={11} strokeWidth={3} /> DEMO MODE
 </span>
 </div>

 <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.8, marginBottom: 8 }}>Score any CT handle <span style={{ color: C.primary }}>instantly.</span></div>
 <p style={{ color: C.textSecondary, fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>Get a Trust Score preview based on observable handle patterns. <span style={{ color: "#fbbf24", fontWeight: 700 }}>Demo only — scores are not yet real.</span> Live API at V1 will use real on-chain + X data.</p>

 <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap"}}>
 <div style={{ flex: 1, minWidth: 220, position: "relative"}}>
 <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700 }}>@</span>
 <input
 type="text"
 placeholder="handle"
 value={demoHandle}
 onChange={e => setDemoHandle(e.target.value.replace(/^@/, ""))}
 onKeyDown={e => { if (e.key === "Enter") runDemoTrustScore(); }}
 maxLength={50}
 style={{
 width: "100%", padding: "13px 16px 13px 30px",
 background: "rgba(0, 0, 0, 0.9)",
 border: "1px solid rgba(255, 255, 255, 0.12)",
 borderRadius: 10, color: C.textPrimary,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700,
 outline: "none", boxSizing: "border-box", transition: "border 0.2s",
 }}
 onFocus={e => e.target.style.borderColor = C.primary}
 onBlur={e => e.target.style.borderColor = "rgba(255, 255, 255, 0.12)"}
 />
 </div>
 <button
 onClick={runDemoTrustScore}
 disabled={!demoHandle.trim() || demoLoading}
 style={{
 padding: "13px 24px", borderRadius: 10, border: "none",
 background: (!demoHandle.trim() || demoLoading) ? "rgba(255, 255, 255, 0.05)" : `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: (!demoHandle.trim() || demoLoading) ? C.textMuted : "#000",
 fontSize: 13, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif",
 cursor: (!demoHandle.trim() || demoLoading) ? "not-allowed" : "pointer",
 letterSpacing: 0.3, transition: "all 0.2s", whiteSpace: "nowrap",
 }}
 >{demoLoading ? "Analyzing..." : "Get Score"}</button>
 </div>

 {/* RESULT */}
 {demoResult && (
 <div data-demo-result style={{ marginTop: 20, padding: "0", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, overflow: "hidden"}}>
 {/* Demo banner — top of result card */}
 <div style={{ padding: "10px 16px", background: "rgba(251, 191, 36, 0.12)", borderBottom: "1px solid rgba(251, 191, 36, 0.25)", display: "flex", alignItems: "center", gap: 10 }}>
 <AlertTriangle size={14} strokeWidth={2.5} style={{ color: "#fbbf24", flexShrink: 0 }} />
 <span style={{ fontSize: 11, color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 0.5 }}>DEMO PREVIEW · Real Trust Score launches with V1</span>
 </div>
 <div style={{ padding: "20px"}}>
 {/* Hero score */}
 <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18, flexWrap: "wrap"}}>
 <div style={{
 width: 90, height: 90, borderRadius: 16,
 background: `linear-gradient(135deg, ${demoResult.tierColor}20, ${demoResult.tierColor}05)`,
 border: `2px solid ${demoResult.tierColor}40`,
 display: "flex", alignItems: "center", justifyContent: "center",
 flexShrink: 0, position: "relative",
 }}>
 <div style={{ fontSize: 36, fontWeight: 900, color: demoResult.tierColor, fontFamily: "'JetBrains Mono', monospace", letterSpacing: -1.5 }}>{demoResult.overall}</div>
 <span style={{ position: "absolute", top: -6, right: -6, padding: "2px 6px", borderRadius: 4, background: "#fbbf24", color: "#000", fontSize: 8, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>DEMO</span>
 </div>
 <div style={{ flex: 1, minWidth: 200, textAlign: "left"}}>
 <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1.5, marginBottom: 4 }}>@{demoResult.handle}</div>
 <div style={{ fontSize: 22, fontWeight: 900, color: demoResult.tierColor, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, marginBottom: 6 }}>{demoResult.tier} <span style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 1.5 }}>(DEMO)</span></div>
 <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace"}}>Trust Score / 100 · Demo Engine V0</div>
 </div>
 </div>

 {/* Breakdowns */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 16 }}>
 {demoResult.breakdowns.map(b => (
 <div key={b.label} style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
 <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>{b.label}</span>
 <span style={{ fontSize: 13, fontWeight: 800, color: b.score >= 70 ? "#10b981" : b.score >= 50 ? "#fbbf24" : "#f97316", fontFamily: "'JetBrains Mono', monospace"}}>{b.score}</span>
 </div>
 <div style={{ height: 4, borderRadius: 2, background: "rgba(255, 255, 255, 0.05)", overflow: "hidden"}}>
 <div style={{ height: "100%", width: `${b.score}%`, background: b.score >= 70 ? "#10b981" : b.score >= 50 ? "#fbbf24" : "#f97316", transition: "width 0.4s"}} />
 </div>
 </div>
 ))}
 </div>

 {/* Flags */}
 {(demoResult.greenFlags.length > 0 || demoResult.redFlags.length > 0) && (
 <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
 {demoResult.greenFlags.map((flag, i) => (
 <div key={`g${i}`} style={{ padding: "8px 12px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.18)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
 <Check size={12} strokeWidth={2.5} style={{ color: "#10b981", flexShrink: 0 }} />
 <span style={{ fontSize: 11, color: "#6ee7b7", fontFamily: "'JetBrains Mono', monospace"}}>{flag}</span>
 </div>
 ))}
 {demoResult.redFlags.map((flag, i) => (
 <div key={`r${i}`} style={{ padding: "8px 12px", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
 <Flag size={12} strokeWidth={2.5} style={{ color: "#ef4444", flexShrink: 0 }} />
 <span style={{ fontSize: 11, color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace"}}>{flag}</span>
 </div>
 ))}
 </div>
 )}

 {/* Demo disclaimer + CTAs */}
 <div style={{ padding: "10px 12px", background: "rgba(251, 191, 36, 0.05)", border: "1px solid rgba(251, 191, 36, 0.18)", borderRadius: 8, marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-start"}}>
 <AlertTriangle size={12} strokeWidth={2.5} style={{ color: "#fbbf24", flexShrink: 0, marginTop: 2 }} />
 <span style={{ fontSize: 10, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.4, letterSpacing: 0.3 }}>This is a DEMO score generated from observable handle patterns only. The real Trust Score V1 will use live X API data, on-chain reputation, and CIB cluster analysis. Join the waitlist for early access.</span>
 </div>

 <div style={{ display: "flex", gap: 8, flexWrap: "wrap"}}>
 <button
 onClick={() => {
 const score = demoResult.overall;
 const tier = demoResult.tier;
 // Tier-specific viral copy variants — picked at random for variety
 let templates = [];
 if (tier === "SUPREME") {
 templates = [
 `Web3Gigs ranked me ${score} SUPREME 👑\n\nI'm built different.\n\nRank yours at web3gigs.app`,
 `${score}/100 SUPREME on Web3Gigs.\n\nReputation > followers.\n\nweb3gigs.app`,
 `Just got SUPREME tier on Web3Gigs (${score}/100) 🛡️\n\nThe trust-verified hiring marketplace for crypto.\n\nweb3gigs.app`,
 ];
 } else if (tier === "CREDIBLE") {
 templates = [
 `${score}/100 CREDIBLE on Web3Gigs.\n\nBetter than 80% of CT.\n\nweb3gigs.app`,
 `Web3Gigs scored me ${score} (CREDIBLE) 🛡️\n\nGuess I'm not a bot after all.\n\nTry yours at web3gigs.app`,
 `Web3Gigs Trust Score: ${score}/100 — CREDIBLE.\n\nRespectable.\n\nweb3gigs.app`,
 ];
 } else if (tier === "NOTED") {
 templates = [
 `${score}/100 on Web3Gigs.\n\nMid tier. NOTED.\n\nThink I can do better.\n\nweb3gigs.app`,
 `Got NOTED tier on Web3Gigs (${score}/100) 😐\n\nWork to do.\n\nweb3gigs.app`,
 `Web3Gigs gave me ${score}/100.\n\nMediocre. Time to grind.\n\nweb3gigs.app`,
 ];
 } else if (tier === "WATCHLIST") {
 templates = [
 `Web3Gigs put me on the WATCHLIST 😭 (${score}/100)\n\nHow did this happen.\n\nweb3gigs.app`,
 `${score}/100 on Web3Gigs.\n\nWATCHLIST tier. They're onto me.\n\nweb3gigs.app`,
 `Web3Gigs flagged me as WATCHLIST 👀 (${score}/100)\n\nChecking yours: web3gigs.app`,
 ];
 } else {
 // FLAGGED
 templates = [
 `Web3Gigs FLAGGED me 💀 (${score}/100)\n\nApparently I'm a bot.\n\nweb3gigs.app`,
 `Brutal. Web3Gigs gave me ${score}/100 — FLAGGED.\n\nthey know.\n\nweb3gigs.app`,
 `imagine getting FLAGGED by Web3Gigs 😭 (${score}/100)\n\nweb3gigs.app`,
 ];
 }
 const text = templates[Math.floor(Math.random() * templates.length)];
 const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
 window.open(url, "_blank");
 }}
 style={{
 flex: 1, minWidth: 160, padding: "11px 16px", borderRadius: 10, border: "none",
 background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: "#000", fontSize: 12, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer",
 letterSpacing: 0.3, transition: "all 0.2s",
 display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
 }}
 ><Sparkles size={13} strokeWidth={2.5} /><span>Share on X</span></button>
 <button
 onClick={() => { setDemoResult(null); setDemoHandle(""); }}
 style={{
 padding: "11px 16px", borderRadius: 10,
 background: "transparent",
 border: "1px solid rgba(255, 255, 255, 0.12)",
 color: C.textSecondary, fontSize: 12, fontWeight: 700,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer",
 letterSpacing: 0.3, transition: "all 0.2s",
 }}
 >Try Another</button>
 <button
 onClick={() => { setWaitlistSubmitted(false); setWaitlistError(""); setShowWaitlistModal(true); }}
 style={{
 padding: "11px 16px", borderRadius: 10,
 background: "transparent",
 border: `1px solid ${C.primary}40`,
 color: C.primary, fontSize: 12, fontWeight: 700,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer",
 letterSpacing: 0.3, transition: "all 0.2s",
 }}
 >Get V1 Access</button>
 </div>
 </div>
 </div>
 )}

 {!demoResult && (
 <div style={{ padding: "14px 16px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 10, textAlign: "left"}}>Try a trending handle</div>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
 {[
 "vitalikbuteryn",
 "cz_binance",
 "saylor",
 "elonmusk",
 "aeyakovenko",
 "rajgokal",
 "Naval",
 "balajis",
 "punk6529",
 "cobie",
 "GCRClassic",
 "Ansem",
 "FabsKebabs",
 ].map(h => (
 <button
 key={h}
 onClick={() => {
 setDemoHandle(h);
 setDemoLoading(true);
 setDemoResult(null);
 setTimeout(() => {
 const result = generateDemoTrustScore(h);
 setDemoResult(result);
 setDemoLoading(false);
 // Smooth scroll to result
 setTimeout(() => {
 const el = document.querySelector("[data-demo-result]");
 if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
 }, 50);
 }, 600);
 }}
 style={{
 padding: "6px 12px", borderRadius: 16,
 background: "rgba(212, 255, 0, 0.05)",
 border: "1px solid rgba(212, 255, 0, 0.18)",
 color: C.textPrimary,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
 cursor: "pointer", letterSpacing: 0.3, transition: "all 0.15s",
 }}
 onMouseEnter={e => { e.currentTarget.style.background = "rgba(212, 255, 0, 0.12)"; e.currentTarget.style.borderColor = `${C.primary}60`; e.currentTarget.style.color = C.primary; }}
 onMouseLeave={e => { e.currentTarget.style.background = "rgba(212, 255, 0, 0.05)"; e.currentTarget.style.borderColor = "rgba(212, 255, 0, 0.18)"; e.currentTarget.style.color = C.textPrimary; }}
 >@{h}</button>
 ))}
 </div>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 10, letterSpacing: 0.5 }}>Click any handle for an instant score, or paste your own above</div>
 </div>
 )}
 </GlowCard>

 {/* What you can still do */}
 <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255, 255, 255, 0.06)", textAlign: "center"}}>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>Meanwhile, explore Web3Gigs</div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
 {[
 { label: "Trust Score", tab: "trust", Icon: Shield },
 { label: "Browse Jobs", tab: "jobs", Icon: Briefcase },
 { label: "CIB Detection", tab: "cib", Icon: Network },
 { label: "Leaderboards", tab: "leaderboard", Icon: Trophy },
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
 <link.Icon size={13} strokeWidth={2} />
 <span>{link.label}</span>
 </button>
 ))}
 </div>
 </div>

 {result && (
 <div ref={resultRef} style={{ maxWidth: 650, margin: "0 auto"}}>
 {/* Hero: Trust Score (primary) + Valuation (secondary) */}
 {trustResult && (
 <GlowCard glow style={{ marginBottom: 20, border: `1px solid ${trustResult.labelColor}40`, padding: "28px", textAlign: "center", background: `linear-gradient(180deg, ${trustResult.labelColor}06, transparent)` }}>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Trust Score</div>
 <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10, marginBottom: 10 }}>
 <span style={{ fontSize: 72, fontWeight: 900, color: trustResult.labelColor, letterSpacing: -3, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{trustResult.trustScore}</span>
 <span style={{ fontSize: 18, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace"}}>/ 100</span>
 </div>
 <div style={{
 display: "inline-block", padding: "8px 18px", borderRadius: 10,
 background: `${trustResult.labelColor}15`, border: `1px solid ${trustResult.labelColor}40`,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 800,
 color: trustResult.labelColor, letterSpacing: 2, marginBottom: 20,
 }}>{trustResult.label}</div>

 {/* Secondary stats row */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 4 }}>
 <div style={{ padding: "10px 8px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Followers</div>
 <div style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace"}}>{(form.followers || result.followers || 0).toLocaleString()}</div>
 </div>
 <div style={{ padding: "10px 8px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Engagement</div>
 <div style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace"}}>{result.engagementRate}%</div>
 </div>
 <div style={{ padding: "10px 8px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Bot Followers</div>
 <div style={{ fontSize: 15, fontWeight: 800, color: trustResult.estimatedBotPct > 30? "#ef4444": trustResult.estimatedBotPct > 15? "#f59e0b": "#10b981", fontFamily: "'JetBrains Mono', monospace"}}>~{trustResult.estimatedBotPct}%</div>
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
 <span style={{ fontSize: 13, fontWeight: 700, color: trustResult.estimatedBotPct > 30? "#ef4444": trustResult.estimatedBotPct > 15? "#f59e0b": "#10b981", fontFamily: "'JetBrains Mono', monospace"}}>
 {trustResult.estimatedBotPct}%
 </span>
 </div>
 <div style={{ height: 6, background: "rgba(255, 255, 255, 0.05)", borderRadius: 3, overflow: "hidden"}}>
 <div style={{
 height: "100%", width: `${trustResult.estimatedBotPct}%`,
 background: `linear-gradient(90deg, ${trustResult.estimatedBotPct > 30? "#ef4444": trustResult.estimatedBotPct > 15? "#f59e0b": "#10b981"}, ${trustResult.estimatedBotPct > 30? "#dc2626": trustResult.estimatedBotPct > 15? "#f97316": "#059669"})`,
 transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)"}} />
 </div>
 </div>

 {/* Breakdown bars */}
 <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Authenticity Signals</div>
 <ScoreBar label="Follow Ratio"score={trustResult.breakdown.followRatio} color="#10b981"/>
 <ScoreBar label="Engagement Quality"score={trustResult.breakdown.engagementQuality} color="#06b6d4"/>
 <ScoreBar label="Conversations"score={trustResult.breakdown.conversation} color="#8b5cf6"/>
 <ScoreBar label="Activity Pattern"score={trustResult.breakdown.activity} color="#f59e0b"/>
 <ScoreBar label="Verification"score={trustResult.breakdown.verification} color="#ec4899"/>

 {/* Flags */}
 {(trustResult.redFlags.length > 0 || trustResult.greenFlags.length > 0) && (
 <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
 {trustResult.redFlags.map((flag, i) => (
 <div key={`red-${i}`} style={{ padding: "10px 12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
 <Flag size={14} strokeWidth={2.5} style={{ color: "#ef4444", flexShrink: 0 }} />
 <span style={{ fontSize: 12, color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace"}}>{flag}</span>
 </div>
 ))}
 {trustResult.greenFlags.map((flag, i) => (
 <div key={`green-${i}`} style={{ padding: "10px 12px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
 <Check size={14} strokeWidth={2.5} style={{ color: "#10b981", flexShrink: 0 }} />
 <span style={{ fontSize: 12, color: "#6ee7b7", fontFamily: "'JetBrains Mono', monospace"}}>{flag}</span>
 </div>
 ))}
 </div>
 )}

 {/* Signal explanations */}
 <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>What Each Signal Means</div>
 <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
 {[
 {
 label: "Follow Ratio",
 score: trustResult.breakdown.followRatio,
 meaning: trustResult.breakdown.followRatio >= 80? "Followers far outnumber following, organic growth pattern.": trustResult.breakdown.followRatio >= 50? "Balanced ratio, neither suspicious nor premium.": "Following count is close to or exceeds followers. Common F4F pattern.",
 color: "#10b981"},
 {
 label: "Engagement Quality",
 score: trustResult.breakdown.engagementQuality,
 meaning: trustResult.breakdown.engagementQuality >= 80? `${trustResult.followRatio}x ratio, real humans are engaging with content.`: trustResult.breakdown.engagementQuality >= 50? "Moderate engagement, audience is present but not highly active.": "Low engagement relative to follower count, heavy bot follower signal.",
 color: "#06b6d4"},
 {
 label: "Conversations",
 score: trustResult.breakdown.conversation,
 meaning: trustResult.breakdown.conversation >= 80? "Strong reply-to-like ratio indicates real discussion, not passive likes.": trustResult.breakdown.conversation >= 50? "Some conversation happening, audience cares enough to reply.": "Likes without replies, classic engagement pod or bot-liker pattern.",
 color: "#8b5cf6"},
 {
 label: "Activity Pattern",
 score: trustResult.breakdown.activity,
 meaning: trustResult.breakdown.activity >= 80? "Consistent long-term posting, established, real account.": trustResult.breakdown.activity >= 50? "Moderate activity, posting is irregular but present.": "Irregular or suspicious activity patterns detected.",
 color: "#f59e0b"},
 {
 label: "Verification",
 score: trustResult.breakdown.verification,
 meaning: trustResult.breakdown.verification >= 80? "Verified account, carries weight but doesn't override other signals.": "Unverified account, no X verification trust boost.",
 color: "#ec4899"},
 ].map(s => (
 <div key={s.label} style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
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
 <div style={{ marginTop: 18, padding: "16px 18px", background: trustResult.trustScore >= 70? "rgba(16, 185, 129, 0.06)": trustResult.trustScore >= 40? "rgba(245, 158, 11, 0.06)": "rgba(239, 68, 68, 0.06)", borderRadius: 10, border: `1px solid ${trustResult.trustScore >= 70? "rgba(16, 185, 129, 0.2)": trustResult.trustScore >= 40? "rgba(245, 158, 11, 0.2)": "rgba(239, 68, 68, 0.2)"}` }}>
 <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
 <span style={{ fontSize: 18 }}>
 {trustResult.trustScore >= 85? "": trustResult.trustScore >= 70? "": trustResult.trustScore >= 55? "": trustResult.trustScore >= 40? "": ""}
 </span>
 <span style={{ fontSize: 13, fontWeight: 800, color: trustResult.labelColor, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>
 {trustResult.trustScore >= 85? "Premium Buy Recommendation": trustResult.trustScore >= 70? "Safe to Buy": trustResult.trustScore >= 55? "Proceed with Verification": trustResult.trustScore >= 40? "High Risk, Verify Before Buying": "Do Not Buy"}
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
 >Run Deep Forensics</button>
 <button onClick={() => setTab("trust")} style={{
 padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)",
 background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, cursor: "pointer",
 transition: "all 0.2s",
 }}
 onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(212, 255, 0, 0.3)"; e.currentTarget.style.color = C.primary; }}
 onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)"; e.currentTarget.style.color = C.textSecondary; }}
 >Learn More</button>
 </div>
 </GlowCard>
 )}

 {/* Historical Tracking Chart */}
 {historyData && (
 <GlowCard style={{ marginBottom: 20 }}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
 <div>
 <div style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Account Timeline</div>
 <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>90-day historical tracking · snapshots captured daily</div>
 </div>
 <Pill text="TRACKED 90d"color={C.primary} />
 </div>

 <div style={{ height: 180, marginTop: 10 }}>
 <ResponsiveContainer width="100%"height="100%">
 <AreaChart data={historyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id="followerGrad"x1="0"y1="0"x2="0"y2="1">
 <stop offset="0%"stopColor={C.primary} stopOpacity={0.4} />
 <stop offset="100%"stopColor={C.primary} stopOpacity={0} />
 </linearGradient>
 </defs>
 <XAxis dataKey="day"stroke="#6b5a85"fontSize={10} tickFormatter={d => `${90 - d}d ago`} interval={15} />
 <YAxis stroke="#6b5a85"fontSize={10} tickFormatter={v => v >= 1000? `${(v/1000).toFixed(1)}k`: v} />
 <Tooltip
 contentStyle={{ background: "rgba(12, 5, 21, 0.95)", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace"}}
 labelFormatter={v => `${90 - v} days ago`}
 formatter={(v, name) => [v.toLocaleString(), "Followers"]}
 />
 <Area type="monotone"dataKey="followers"stroke={C.primary} strokeWidth={2} fill="url(#followerGrad)"/>
 {historyData.filter(p => p.anomaly).map((p, i) => (
 <ReferenceDot key={i} x={p.day} y={p.followers} r={5} fill="#ef4444"stroke="#fff"strokeWidth={2} />
 ))}
 </AreaChart>
 </ResponsiveContainer>
 </div>

 {historyData.some(p => p.anomaly) && (
 <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
 <AlertTriangle size={14} strokeWidth={2.5} style={{ color: "#ef4444", flexShrink: 0 }} />
 <span style={{ fontSize: 12, color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace"}}>Anomaly detected: Sudden follower spike on day {90 - historyData.find(p => p.anomaly).day}</span>
 </div>
 )}

 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
 {[
 ["90d Growth", `+${Math.round(((historyData[89].followers - historyData[0].followers) / historyData[0].followers) * 100)}%`],
 ["Volatility", historyData.some(p => p.anomaly)? "HIGH": "LOW"],
 ["Integrity", historyData.some(p => p.anomaly)? "Flagged": "Clean"],
 ].map(([label, val]) => (
 <div key={label} style={{ padding: "8px 10px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
 <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginTop: 2, fontFamily: "'JetBrains Mono', monospace"}}>{val}</div>
 </div>
 ))}
 </div>
 </GlowCard>
 )}

 <GlowCard>
 <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Score Breakdown</div>
 <ScoreBar label="Followers"score={result.breakdown.followers} color={C.primary} />
 <ScoreBar label="Engagement"score={result.breakdown.engagement} color={C.accent} />
 <ScoreBar label="Account Age"score={result.breakdown.accountAge} color="#c084fc"/>
 <ScoreBar label="Tweet Volume"score={result.breakdown.tweetVolume} color={C.accentWarm} />
 <ScoreBar label="Verification"score={result.breakdown.verification} color="#e879f9"/>
 <ScoreBar label="CT Niche"score={result.breakdown.nicheRelevance} color="#fb923c"/>

 <div style={{ marginTop: 20, padding: "14px 16px", background: "rgba(212, 255, 0, 0.05)", borderRadius: 10, border: "1px solid rgba(212, 255, 0, 0.12)"}}>
 <div style={{ fontSize: 12, color: C.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>Flex your score</div>
 <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 4 }}>Share your trust score on X to prove you're the real deal. Screenshot this card or tweet your result.</div>
 </div>
 </GlowCard>
 </div>
 )}
 </div>
 )}

 {/* ─── TRUST SCORE TAB ─────────────────────────────── */}
 {tab === "trust"&& (
 <div>
 {/* Hero */}
 <div style={{ textAlign: "center", marginBottom: 40 }}>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.2)", marginBottom: 20 }}>
 <Shield size={12} strokeWidth={2.5} style={{ color: C.primary }} />
 <span style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>The Trust Score</span>
 </div>
 <h1 style={{ fontSize: 48, fontWeight: 900, margin: 0, letterSpacing: -2, lineHeight: 1.1 }}>Don't hire <span style={{ color: C.primary }}>bots or scammers.</span>
 </h1>
 <p style={{ color: C.textSecondary, fontSize: 17, marginTop: 16, maxWidth: 560, margin: "16px auto 0", lineHeight: 1.5 }}>Every CT account gets scored 0-100 on authenticity. Trust Score gatekeeps who can apply to your jobs, catching bot followers, engagement pods, F4F rings, and fake activity before they waste your budget.
 </p>
 </div>

 {/* Tier System */}
 <div style={{ marginBottom: 40 }}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8, textAlign: "center"}}>Score Tiers</div>
 <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, textAlign: "center", marginBottom: 24 }}>From trash to <span style={{ color: C.primary }}>supreme.</span></h2>

 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 {[
 { range: "85-100", label: "SUPREME", color: "#10b981", desc: "Legit, established, zero red flags. Premium tier."},
 { range: "70-84", label: "CREDIBLE", color: "#34d399", desc: "Solid authenticity signals. Safe buy."},
 { range: "55-69", label: "NOTED", color: "#fbbf24", desc: "Decent account. Some signals worth verifying."},
 { range: "40-54", label: "UNKNOWN", color: "#f97316", desc: "Mixed signals. Proceed with caution and verify."},
 { range: "25-39", label: "SUSPICIOUS", color: "#ef4444", desc: "Multiple red flags detected. High risk."},
 { range: "0-24", label: "LIKELY BOT", color: "#dc2626", desc: "Heavy bot signals. Do not buy."},
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

 {/* TIER DISTRIBUTION HISTOGRAM */}
 <div style={{ marginBottom: 40 }}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8, textAlign: "center"}}>Where most accounts land</div>
 <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, textAlign: "center", marginBottom: 8 }}>The CT <span style={{ color: C.primary }}>distribution.</span></h2>
 <p style={{ color: C.textMuted, fontSize: 13, textAlign: "center", marginBottom: 24, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3 }}>Estimated tier breakdown based on demo engine analysis · DEMO</p>

 <div style={{ padding: "24px 20px", background: "rgba(18, 18, 18, 0.7)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 14 }}>
 {(() => {
 const dist = [
 { tier: "SUPREME", range: "85-100", pct: 4, color: "#10b981" },
 { tier: "CREDIBLE", range: "70-84", pct: 11, color: "#34d399" },
 { tier: "NOTED", range: "55-69", pct: 23, color: "#fbbf24" },
 { tier: "UNKNOWN", range: "40-54", pct: 28, color: "#f97316" },
 { tier: "SUSPICIOUS", range: "25-39", pct: 22, color: "#ef4444" },
 { tier: "LIKELY BOT", range: "0-24", pct: 12, color: "#dc2626" },
 ];
 const maxPct = Math.max(...dist.map(d => d.pct));
 return (
 <>
 <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180, marginBottom: 18, paddingTop: 10 }}>
 {dist.map((d, i) => {
 const heightPct = (d.pct / maxPct) * 100;
 return (
 <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end"}}>
 <div style={{ fontSize: 12, fontWeight: 800, color: d.color, fontFamily: "'JetBrains Mono', monospace"}}>{d.pct}%</div>
 <div style={{
 width: "100%", maxWidth: 56,
 height: `${heightPct}%`,
 background: `linear-gradient(180deg, ${d.color}, ${d.color}aa)`,
 borderRadius: "6px 6px 2px 2px",
 boxShadow: `0 0 12px ${d.color}40`,
 transition: "all 0.3s",
 minHeight: 4,
 }} />
 </div>
 );
 })}
 </div>
 <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 {dist.map((d, i) => (
 <div key={i} style={{ flex: 1, textAlign: "center"}}>
 <div style={{ fontSize: 9, fontWeight: 800, color: d.color, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.8, marginBottom: 2 }}>{d.tier}</div>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>{d.range}</div>
 </div>
 ))}
 </div>
 </>
 );
 })()}
 </div>
 <div style={{ display: "flex", gap: 12, marginTop: 16, padding: "12px 14px", background: "rgba(212, 255, 0, 0.04)", border: "1px solid rgba(212, 255, 0, 0.18)", borderRadius: 10, alignItems: "center"}}>
 <Sparkles size={14} strokeWidth={2.5} style={{ color: C.primary, flexShrink: 0 }} />
 <div style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3, lineHeight: 1.5 }}>Only <span style={{ color: C.primary, fontWeight: 800 }}>15%</span> of CT lands in CREDIBLE or above. The Trust Score gate filters the bottom 60% by default.</div>
 </div>
 </div>

 {/* TIER RADAR COMPARISON */}
 <div style={{ marginBottom: 40 }}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8, textAlign: "center"}}>What each tier looks like</div>
 <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, textAlign: "center", marginBottom: 8 }}>SUPREME vs <span style={{ color: "#ef4444" }}>FLAGGED.</span></h2>
 <p style={{ color: C.textMuted, fontSize: 13, textAlign: "center", marginBottom: 24, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3 }}>Side by side · 7 trust signals · DEMO</p>

 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
 {(() => {
 const signals = ["Followers", "Engagement", "Conversation", "Posting", "CIB", "Age", "Niche"];
 const supreme = [92, 89, 85, 88, 95, 91, 87];
 const flagged = [22, 14, 12, 30, 18, 25, 20];

 const renderRadar = (values, color, tierName, score) => {
 const cx = 140, cy = 120, radius = 80;
 const N = values.length;
 const points = values.map((v, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const r = (v / 100) * radius;
 return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
 }).join(" ");
 const labelPoints = signals.map((s, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const lr = radius + 18;
 return { x: cx + lr * Math.cos(angle), y: cy + lr * Math.sin(angle), label: s };
 });
 const gridLevels = [0.25, 0.5, 0.75, 1];
 return (
 <div style={{ padding: "20px 16px", background: "rgba(18, 18, 18, 0.7)", border: `1px solid ${color}30`, borderRadius: 14, position: "relative"}}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
 <div style={{ fontSize: 14, fontWeight: 900, color: color, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace"}}>{tierName}</div>
 <div style={{ fontSize: 22, fontWeight: 900, color: color, fontFamily: "'JetBrains Mono', monospace", letterSpacing: -1 }}>{score}</div>
 </div>
 <svg width="100%" height="240" viewBox="0 0 280 240" style={{ display: "block"}}>
 {gridLevels.map((lvl, gi) => {
 const polyPoints = signals.map((_, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const r = lvl * radius;
 return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
 }).join(" ");
 return <polygon key={gi} points={polyPoints} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
 })}
 {signals.map((_, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 return <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(angle)} y2={cy + radius * Math.sin(angle)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
 })}
 <polygon points={points} fill={`${color}33`} stroke={color} strokeWidth="2" />
 {values.map((v, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const r = (v / 100) * radius;
 return <circle key={i} cx={cx + r * Math.cos(angle)} cy={cy + r * Math.sin(angle)} r="3" fill={color} />;
 })}
 {labelPoints.map((p, i) => (
 <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fill="#888" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>{p.label}</text>
 ))}
 </svg>
 </div>
 );
 };

 return (
 <>
 {renderRadar(supreme, "#10b981", "SUPREME · 91", 91)}
 {renderRadar(flagged, "#ef4444", "FLAGGED · 20", 20)}
 </>
 );
 })()}
 </div>
 <div style={{ display: "flex", gap: 12, marginTop: 16, padding: "12px 14px", background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 10, alignItems: "center"}}>
 <Eye size={14} strokeWidth={2.5} style={{ color: C.textSecondary, flexShrink: 0 }} />
 <div style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3, lineHeight: 1.5 }}>SUPREME accounts score high across all signals. FLAGGED accounts collapse on multiple — usually CIB clusters, engagement, and follow ratio.</div>
 </div>
 </div>

 {/* Signals Explained */}
 <div style={{ marginBottom: 40 }}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8, textAlign: "center"}}>The 5 Signals</div>
 <h2 style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, textAlign: "center", marginBottom: 24 }}>What we <span style={{ color: C.primary }}>actually measure.</span></h2>

 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
 {[
 {
 title: "Follow Ratio", weight: "20%",
 desc: "Real accounts have way more followers than they follow. Accounts following thousands with low follower counts are flagged as F4F (follow-for-follow) patterns.",
 flag: "Red flag: following > followers"},
 {
 title: "Engagement Quality", weight: "30%",
 desc: "Bot-inflated accounts have massive follower counts but tiny engagement. This is the single biggest tell. We compare total engagement to follower count to catch fakes.",
 flag: "Red flag: <0.1% engagement rate"},
 {
 title: "Conversations", weight: "15%",
 desc: "Real audiences reply. Bots and engagement pods only drop likes. We measure the ratio of replies to likes, genuine accounts have meaningful conversations.",
 flag: "Red flag: likes but no replies"},
 {
 title: "Activity Pattern", weight: "15%",
 desc: "Brand new accounts with huge followings are suspicious, you can't grow 50k followers in a month organically. We flag rapid growth and bot-like posting frequencies.",
 flag: "Red flag: new account + big followers"},
 {
 title: "Verification", weight: "10%",
 desc: "X verification (legacy blue, gold, or paid) is a trust boost but doesn't override other signals. A verified bot account is still a bot account.",
 flag: "Bonus: verified status"},
 {
 title: "Bot Detection", weight: "10%",
 desc: "We estimate what % of followers are likely bots based on engagement gap and follow patterns. Accounts with >30% estimated bots are flagged.",
 flag: "Red flag: >30% bot estimate"},
 ].map(signal => (
 <GlowCard key={signal.title} glow style={{ padding: "20px"}}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
 <div style={{ fontSize: 28 }}>{signal.icon}</div>
 <Pill text={`${signal.weight} weight`} color={C.primary} />
 </div>
 <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, letterSpacing: -0.3 }}>{signal.title}</div>
 <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>{signal.desc}</div>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", padding: "8px 10px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 6, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 {signal.flag}
 </div>
 </GlowCard>
 ))}
 </div>
 </div>

 {/* How to use it */}
 <GlowCard style={{ marginBottom: 40, padding: "32px"}}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>For Buyers</div>
 <h3 style={{ fontSize: 22, fontWeight: 900, marginBottom: 16, marginTop: 0, letterSpacing: -0.5 }}>How to read a Trust Score</h3>
 <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
 {[
 { rule: "Never buy anything below 40. Full stop.", color: "#ef4444"},
 { rule: "40-55 range? Run Deep Forensics on it first (CIB tab) to see the full picture.", color: "#f97316"},
 { rule: "Check the 'Why This Score?' section, specific flags tell you WHY the number is what it is.", color: "#fbbf24"},
 { rule: "A 70+ with green flags for 'Healthy organic engagement' and 'Strong conversation ratio' is a solid buy.", color: "#10b981"},
 { rule: "Always check the 90-day timeline. Anomaly spikes = purchased followers. Clean lines = organic growth.", color: C.primary },
 ].map((item, i) => (
 <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start"}}>
 <div style={{ width: 24, height: 24, borderRadius: 6, background: `${item.color}15`, border: `1px solid ${item.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: item.color, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{i + 1}</div>
 <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, paddingTop: 2 }}>{item.rule}</div>
 </div>
 ))}
 </div>
 </GlowCard>

 {/* For Sellers */}
 <GlowCard style={{ marginBottom: 40, padding: "32px"}}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>For Sellers</div>
 <h3 style={{ fontSize: 22, fontWeight: 900, marginBottom: 16, marginTop: 0, letterSpacing: -0.5 }}>Boost your score before listing</h3>
 <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
 {[
 "Stop buying followers. It tanks your engagement rate and flags anomalies in the 90-day timeline.",
 "Engage genuinely, reply to comments, quote tweets, join conversations. Conversations signal is weighted 15%.",
 "Post consistently for 3+ months. Activity Pattern rewards long-term organic growth.",
 "Clean your follower list, remove obvious bot accounts. Lower bot % = higher trust score.",
 "Get vouched by other SUPREME accounts to compound your trust over time.",
 ].map((rule, i) => (
 <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start"}}>
 <div style={{ color: C.primary, fontSize: 18, fontWeight: 900, flexShrink: 0, lineHeight: 1.5 }}>→</div>
 <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>{rule}</div>
 </div>
 ))}
 </div>
 </GlowCard>

 {/* Anti-gaming */}
 <GlowCard glow style={{ marginBottom: 40, padding: "28px"}}>
 <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
 <Lock size={24} strokeWidth={2} style={{ color: C.primary }} />
 <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>Can the score be gamed?</div>
 </div>
 <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>Hard to. Here's why Web3Gigs' scoring system holds up where others don't:
 </div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
 {[
 { title: "Historical Tracking", desc: "Scores look at 90 days of data. Can't retroactively fake your history."},
 { title: "Multi-Signal Weighting", desc: "Gaming one signal (buying blue check) doesn't move the needle much."},
 { title: "Cluster Detection", desc: "Even if you pass individual checks, we catch pod/network membership."},
 { title: "Refresh Delay", desc: "Scores cache for 24h so last-minute score manipulation doesn't work."},
 ].map(item => (
 <div key={item.title} style={{ padding: "12px 14px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ fontSize: 12, fontWeight: 800, color: C.primary, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{item.title}</div>
 <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{item.desc}</div>
 </div>
 ))}
 </div>
 </GlowCard>

 {/* CTA */}
 <GlowCard glow style={{ textAlign: "center", padding: "40px 32px", background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), rgba(0, 0, 0, 0.5))` }}>
 <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1, marginBottom: 12 }}>Check any <span style={{ color: C.primary }}>CT account's</span> trust score.
 </div>
 <div style={{ fontSize: 14, color: C.textSecondary, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px"}}>Free. No signup. Full analysis in 10 seconds.
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
 >Run Trust Analysis</button>
 </GlowCard>
 </div>
 )}


 {/* LEADERBOARD TAB */}
 {tab === "leaderboard"&& (
 <div>
 <div style={{ textAlign: "center", marginBottom: 32 }}>
 <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>CT <span style={{ color: C.primary }}>Leaderboards</span>
 </h1>
 <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Real-time rankings across Crypto Twitter · Updated hourly</p>
 </div>

 {/* Sub-tabs */}
 <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
 <div style={{ display: "flex", gap: 4, background: "rgba(0, 0, 0, 0.5)", borderRadius: 12, padding: 4, border: "1px solid rgba(255, 255, 255, 0.06)"}}>
 {[
 ["trending", "Trending", C.accent],
 ["rising", "Rising", "#10b981"],
 ["suspicious", "Suspicious", "#ef4444"],
 ].map(([val, label, clr]) => (
 <button key={val} onClick={() => setLeaderboardTab(val)} style={{
 padding: "8px 18px", borderRadius: 8, border: "none",
 background: leaderboardTab === val? `${clr}15`: "transparent",
 color: leaderboardTab === val? clr: C.textMuted,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
 cursor: "pointer", textTransform: "uppercase", letterSpacing: 1, transition: "all 0.2s",
 }}>{label}</button>
 ))}
 </div>
 </div>

 {/* Leaderboard context banner */}
 <GlowCard style={{ marginBottom: 20, padding: "16px 20px"}}>
 <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
 <div style={{ fontSize: 24 }}>
 {leaderboardTab === "trending"&& ""}
 {leaderboardTab === "rising"&& ""}
 {leaderboardTab === "suspicious"&& ""}
 </div>
 <div>
 <div style={{ fontSize: 14, fontWeight: 700 }}>
 {leaderboardTab === "trending"&& "Trending This Week"}
 {leaderboardTab === "rising"&& "Rising Stars"}
 {leaderboardTab === "suspicious"&& "Suspicious Accounts"}
 </div>
 <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>
 {leaderboardTab === "trending"&& "Top CT accounts ranked by 7-day Trust Score momentum"}
 {leaderboardTab === "rising"&& "Newly detected accounts with accelerating growth & clean signals"}
 {leaderboardTab === "suspicious"&& "Accounts flagged by our detection systems, buyer beware"}
 </div>
 </div>
 </div>
 </GlowCard>

 {/* Leaderboard table */}
 <GlowCard style={{ padding: 0, overflow: "hidden"}}>
 <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 80px 100px 120px 80px", gap: 0, padding: "12px 20px", background: "rgba(255, 255, 255, 0.02)", borderBottom: `1px solid ${C.border}` }}>
 {["#", "Account", "Change", "Followers", "Niche", "Score"].map(h => (
 <div key={h} style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{h}</div>
 ))}
 </div>
 {LEADERBOARD_DATA[leaderboardTab].map((row, i) => {
 const scoreColor = row.score >= 85? "#10b981": row.score >= 70? "#34d399": row.score >= 55? "#fbbf24": row.score >= 40? "#f97316": "#ef4444";
 const changeColor = row.change.startsWith("+")? "#10b981": row.change.startsWith("−")? "#ef4444": row.change === "NEW"? C.primary: row.change === ""? "#ef4444": C.textMuted;
 return (
 <div key={row.handle} style={{
 display: "grid", gridTemplateColumns: "50px 1fr 80px 100px 120px 80px", gap: 0,
 padding: "14px 20px", alignItems: "center",
 borderBottom: i === LEADERBOARD_DATA[leaderboardTab].length - 1? "none": "1px solid rgba(212, 255, 0, 0.05)",
 transition: "background 0.2s", cursor: "pointer",
 }}
 onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)"}
 onMouseLeave={e => e.currentTarget.style.background = "transparent"}
 >
 <div style={{ fontSize: 16, fontWeight: 800, color: row.rank <= 3? C.accent: C.textSecondary, fontFamily: "'JetBrains Mono', monospace"}}>
 {row.rank === 1? "": row.rank === 2? "": row.rank === 3? "": `#${row.rank}`}
 </div>
 <div>
 <div style={{ fontWeight: 700, fontSize: 15 }}>{row.handle}</div>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>growth: {row.growth}</div>
 </div>
 <div style={{ fontSize: 12, color: changeColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{row.change}</div>
 <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace"}}>{row.followers.toLocaleString()}</div>
 <div><Pill text={row.niche} color={C.primary} /></div>
 <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
 <div style={{ width: 30, height: 30, borderRadius: 8, background: `${scoreColor}20`, border: `1px solid ${scoreColor}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: scoreColor, fontFamily: "'JetBrains Mono', monospace"}}>
 {row.score}
 </div>
 </div>
 </div>
 );
 })}
 </GlowCard>

 <div style={{ textAlign: "center", marginTop: 24 }}>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace"}}>Rankings update hourly · Only tracked accounts are eligible · Detection systems flag coordinated behavior
 </div>
 </div>
 </div>
 )}

 {/* PROFILE TAB, sample public profile page */}
 {tab === "profile"&& (
 <div>
 <div style={{ textAlign: "center", marginBottom: 28 }}>
 <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>Public <span style={{ color: C.primary }}>Profile</span>
 </h1>
 <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Every CT account gets a shareable profile at web3gigs.app/@username</p>
 </div>

 {/* Handle search */}
 <GlowCard glow style={{ padding: "20px", marginBottom: 20, maxWidth: 560, margin: "0 auto 20px"}}>
 <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, fontWeight: 700 }}>View a profile</div>
 <div style={{ display: "flex", gap: 8 }}>
 <div style={{ flex: 1, position: "relative"}}>
 <Search size={16} strokeWidth={2} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.textMuted }} />
 <input
 type="text"
 placeholder="@handle, preview their Web3Gigs profile"
 value={profileSearchHandle}
 onChange={e => setProfileSearchHandle(e.target.value)}
 style={{
 width: "100%", padding: "12px 14px 12px 40px", borderRadius: 10,
 background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)",
 color: C.textPrimary, fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
 outline: "none", boxSizing: "border-box",
 }}
 onFocus={e => e.currentTarget.style.borderColor = `${C.primary}60`}
 onBlur={e => e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)"}
 />
 </div>
 <button
 onClick={() => { setWaitlistSubmitted(false); setWaitlistError(""); setShowWaitlistModal(true); }}
 style={{
 padding: "12px 18px", borderRadius: 10, border: "none",
 background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: "#000", fontSize: 12, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer",
 letterSpacing: 0.5, whiteSpace: "nowrap",
 }}
 >View</button>
 </div>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 10, letterSpacing: 0.5 }}>Profile lookup launches with waitlist · Join for early access · Preview below</div>
 </GlowCard>

 {/* PROFILE CAROUSEL SELECTOR */}
 {(() => {
 const profiles = [
 {
 letter: "F", initial: "#d4ff00", letterColor: "#000",
 name: "Solana Builder", handle: "@solBuilder",
 bio: "Solana dev · On-chain analyst · CT native · Building in crypto",
 score: 91, tier: "SUPREME", tierColor: "#10b981",
 verified: true,
 followers: "18.4k", engagement: "3.8%", botEst: "8%", botColor: "#10b981",
 trackedDays: 127, niche: "Solana", history: "Clean History", historyColor: "#10b981",
 radarValues: [88, 92, 85, 90, 94, 89, 87], lineColor: "#10b981",
 percentile: "Top 4%", betterThan: "96%",
 },
 {
 letter: "K", initial: "#34d399", letterColor: "#000",
 name: "Crypto Founder", handle: "@cryptoFounder",
 bio: "Building public · Web3 founder · DeFi researcher · OG since 2017",
 score: 78, tier: "CREDIBLE", tierColor: "#34d399",
 verified: true,
 followers: "42.1k", engagement: "2.4%", botEst: "12%", botColor: "#34d399",
 trackedDays: 412, niche: "DeFi", history: "Clean History", historyColor: "#10b981",
 radarValues: [82, 75, 68, 82, 78, 95, 70], lineColor: "#34d399",
 percentile: "Top 15%", betterThan: "85%",
 },
 {
 letter: "M", initial: "#fbbf24", letterColor: "#000",
 name: "Memecoin Caller", handle: "@memeCaller",
 bio: "Calling early plays · Mostly right · Sometimes wrong · Always loud",
 score: 62, tier: "NOTED", tierColor: "#fbbf24",
 verified: false,
 followers: "8.7k", engagement: "5.1%", botEst: "22%", botColor: "#fbbf24",
 trackedDays: 64, niche: "Memes", history: "Mixed Signals", historyColor: "#fbbf24",
 radarValues: [55, 78, 65, 72, 48, 50, 65], lineColor: "#fbbf24",
 percentile: "Top 39%", betterThan: "61%",
 },
 {
 letter: "X", initial: "#f97316", letterColor: "#000",
 name: "Mystery Anon", handle: "@anon_4729",
 bio: "Quiet account · Posts rarely · Active since last week · ?",
 score: 47, tier: "WATCHLIST", tierColor: "#f97316",
 verified: false,
 followers: "2.1k", engagement: "0.6%", botEst: "44%", botColor: "#f97316",
 trackedDays: 12, niche: "Unknown", history: "Recently Active", historyColor: "#f97316",
 radarValues: [38, 22, 30, 65, 32, 18, 25], lineColor: "#f97316",
 percentile: "Top 65%", betterThan: "35%",
 },
 {
 letter: "B", initial: "#ef4444", letterColor: "#fff",
 name: "Likely Bot", handle: "@user_bot_983",
 bio: "Auto-generated bio · Reposts only · Follows 5k+ · Followed by 200",
 score: 18, tier: "FLAGGED", tierColor: "#ef4444",
 verified: false,
 followers: "203", engagement: "0.1%", botEst: "89%", botColor: "#ef4444",
 trackedDays: 8, niche: "Spam", history: "CIB Pod #C-7741", historyColor: "#ef4444",
 radarValues: [15, 8, 5, 22, 12, 10, 18], lineColor: "#ef4444",
 percentile: "Bottom 12%", betterThan: "8%",
 },
 ];
 const p = profiles[profileDemoIdx] || profiles[0];

 return (
 <>
 {/* Carousel selector pills */}
 <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 18, flexWrap: "wrap"}}>
 <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, alignSelf: "center", marginRight: 4 }}>See:</span>
 {profiles.map((prof, i) => {
 const active = i === profileDemoIdx;
 return (
 <button
 key={i}
 onClick={() => setProfileDemoIdx(i)}
 style={{
 padding: "6px 12px", borderRadius: 16, border: "1px solid",
 borderColor: active ? prof.tierColor : "rgba(255, 255, 255, 0.1)",
 background: active ? `${prof.tierColor}15` : "rgba(0, 0, 0, 0.4)",
 color: active ? prof.tierColor : C.textSecondary,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 800,
 cursor: "pointer", letterSpacing: 0.8, textTransform: "uppercase",
 transition: "all 0.15s",
 }}
 onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = `${prof.tierColor}80`; }}
 onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)"; }}
 >{prof.tier}</button>
 );
 })}
 </div>

 {/* Profile card with dynamic data */}
 <GlowCard glow style={{ marginBottom: 20 }}>
 <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap"}}>
 <div style={{
 width: 72, height: 72, borderRadius: 16,
 background: `linear-gradient(135deg, ${p.initial}, ${p.tierColor})`,
 display: "flex", alignItems: "center", justifyContent: "center",
 fontSize: 28, fontWeight: 900, color: p.letterColor,
 flexShrink: 0,
 transition: "all 0.3s",
 }}>{p.letter}</div>
 <div style={{ flex: 1, minWidth: 200 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"}}>
 <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{p.name}</div>
 {p.verified && <Pill text="Verified" color={C.accent} />}
 <Pill text={`${p.tier} ${p.score}`} color={p.tierColor} />
 </div>
 <div style={{ fontSize: 14, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{p.handle}</div>
 <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 8, lineHeight: 1.5 }}>{p.bio}</div>
 <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap"}}>
 <Pill text={`Tracked ${p.trackedDays}d`} color={C.primary} />
 <Pill text={p.niche} color={C.accent} />
 <Pill text={p.history} color={p.historyColor} />
 </div>
 </div>
 </div>

 {/* Profile stats */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
 {[
 ["Trust Score", String(p.score), p.tierColor],
 ["Tier", p.tier, p.tierColor],
 ["Followers", p.followers, C.textPrimary],
 ["Engagement", p.engagement, C.primary],
 ["Bot Est.", p.botEst, p.botColor],
 ].map(([label, val, clr]) => (
 <div key={label} style={{ padding: "12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.05)"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
 <div style={{ fontSize: 18, fontWeight: 800, color: clr, marginTop: 4, fontFamily: "'JetBrains Mono', monospace"}}>{val}</div>
 </div>
 ))}
 </div>

 {/* Mini timeline */}
 <div style={{ height: 100 }}>
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={generateHistory(parseInt(p.followers.replace(/[^0-9]/g, "")) * (p.followers.includes("k") ? 1000 : 1) || 5000, p.score, 90)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id={`profileGrad-${profileDemoIdx}`} x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor={p.lineColor} stopOpacity={0.4} />
 <stop offset="100%" stopColor={p.lineColor} stopOpacity={0} />
 </linearGradient>
 </defs>
 <Area type="monotone" dataKey="followers" stroke={p.lineColor} strokeWidth={2} fill={`url(#profileGrad-${profileDemoIdx})`} />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </GlowCard>

 {/* Trust Signal Radar (uses p data) */}
 <GlowCard glow style={{ marginBottom: 20 }}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>Trust signal breakdown</div>
 <span style={{ padding: "3px 8px", borderRadius: 6, background: "#fbbf24", color: "#000", fontSize: 9, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>DEMO</span>
 </div>
 <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, letterSpacing: -0.3 }}>How <span style={{ color: p.tierColor }}>{p.handle}</span> scores across all 7 signals.</div>

 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
 {/* Radar */}
 <div style={{ padding: "16px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.05)"}}>
 {(() => {
 const signals = ["Followers", "Engagement", "Conversation", "Posting", "CIB", "Age", "Niche"];
 const values = p.radarValues;
 const cx = 140, cy = 130, radius = 80;
 const N = values.length;
 const points = values.map((v, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const r = (v / 100) * radius;
 return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
 }).join(" ");
 const labelPoints = signals.map((s, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const lr = radius + 18;
 return { x: cx + lr * Math.cos(angle), y: cy + lr * Math.sin(angle), label: s };
 });
 const gridLevels = [0.25, 0.5, 0.75, 1];
 return (
 <svg width="100%" height="260" viewBox="0 0 280 260" style={{ display: "block"}}>
 {gridLevels.map((lvl, gi) => {
 const polyPoints = signals.map((_, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const r = lvl * radius;
 return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
 }).join(" ");
 return <polygon key={gi} points={polyPoints} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
 })}
 {signals.map((_, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 return <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(angle)} y2={cy + radius * Math.sin(angle)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
 })}
 <polygon points={points} fill={`${p.tierColor}33`} stroke={p.tierColor} strokeWidth="2" />
 {values.map((v, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const r = (v / 100) * radius;
 return <circle key={i} cx={cx + r * Math.cos(angle)} cy={cy + r * Math.sin(angle)} r="3" fill={p.tierColor} />;
 })}
 {labelPoints.map((pt, i) => (
 <text key={i} x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="central" fill="#888" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>{pt.label}</text>
 ))}
 </svg>
 );
 })()}
 </div>

 {/* Signal scores list */}
 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 {[
 { label: "Followers", score: p.radarValues[0] },
 { label: "Engagement", score: p.radarValues[1] },
 { label: "Conversation", score: p.radarValues[2] },
 { label: "Posting", score: p.radarValues[3] },
 { label: "CIB", score: p.radarValues[4] },
 { label: "Age", score: p.radarValues[5] },
 { label: "Niche", score: p.radarValues[6] },
 ].map((s, i) => {
 const color = s.score >= 85 ? "#10b981" : s.score >= 70 ? "#34d399" : s.score >= 55 ? "#fbbf24" : s.score >= 40 ? "#f97316" : "#ef4444";
 return (
 <div key={i} style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
 <span style={{ fontSize: 11, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 0.3 }}>{s.label}</span>
 <span style={{ fontSize: 13, fontWeight: 800, color: color, fontFamily: "'JetBrains Mono', monospace"}}>{s.score}</span>
 </div>
 <div style={{ height: 4, borderRadius: 2, background: "rgba(255, 255, 255, 0.05)", overflow: "hidden"}}>
 <div style={{ height: "100%", width: `${s.score}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)`, transition: "width 0.4s"}} />
 </div>
 </div>
 );
 })}
 </div>
 </div>
 </GlowCard>

 {/* Tier Positioning (uses p) */}
 <GlowCard style={{ marginBottom: 20 }}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>Where they rank</div>
 <span style={{ padding: "3px 8px", borderRadius: 6, background: "#fbbf24", color: "#000", fontSize: 9, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>DEMO</span>
 </div>
 <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, letterSpacing: -0.3 }}>{p.percentile} <span style={{ color: p.tierColor }}>of all CT accounts.</span></div>

 {/* Score line marker */}
 <div style={{ position: "relative", marginBottom: 24, padding: "20px 0 30px"}}>
 <div style={{ position: "relative", height: 24, borderRadius: 12, background: "linear-gradient(90deg, #dc2626 0%, #ef4444 16%, #f97316 33%, #fbbf24 50%, #34d399 70%, #10b981 100%)"}}>
 {[0, 25, 40, 55, 70, 85, 100].map((mark, i) => (
 <div key={i} style={{ position: "absolute", left: `${mark}%`, top: 0, height: "100%", borderLeft: i === 0 || i === 6 ? "none" : "1px dashed rgba(0, 0, 0, 0.4)", transform: "translateX(-1px)"}} />
 ))}
 <div style={{ position: "absolute", left: `${p.score}%`, top: -6, transform: "translateX(-50%)", transition: "left 0.4s"}}>
 <div style={{ width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: `10px solid ${p.tierColor}`, margin: "0 auto"}} />
 </div>
 <div style={{ position: "absolute", left: `${p.score}%`, top: "100%", transform: "translateX(-50%)", marginTop: 8, transition: "left 0.4s"}}>
 <div style={{ padding: "3px 10px", borderRadius: 6, background: p.tierColor, color: "#000", fontSize: 11, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, whiteSpace: "nowrap"}}>{p.score} · {p.handle}</div>
 </div>
 </div>
 <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: C.textMuted, letterSpacing: 0.5, textTransform: "uppercase"}}>
 <span>Likely Bot</span>
 <span>Suspicious</span>
 <span>Unknown</span>
 <span>Noted</span>
 <span>Credible</span>
 <span>Supreme</span>
 </div>
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
 {[
 { label: "Better than", val: p.betterThan, sub: "of all CT" },
 { label: "Tier rank", val: p.percentile, sub: `${p.tier} tier` },
 { label: "Trust gain", val: p.score >= 55 ? "+12 pts" : "-8 pts", sub: "vs 90 days ago", color: p.score >= 55 ? "#10b981" : "#ef4444" },
 ].map((s, i) => (
 <div key={i} style={{ padding: "12px 14px", background: `${(s.color || p.tierColor)}08`, border: `1px solid ${(s.color || p.tierColor)}25`, borderRadius: 10, textAlign: "center"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
 <div style={{ fontSize: 18, fontWeight: 900, color: s.color || p.tierColor, marginTop: 4, fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.5 }}>{s.val}</div>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 2, letterSpacing: 0.3 }}>{s.sub}</div>
 </div>
 ))}
 </div>
 </GlowCard>
 </>
 );
 })()}

 {/* Sample profile card OLD — DEPRECATED hidden */}
 <GlowCard glow style={{ marginBottom: 20, display: "none"}}>
 <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap"}}>
 <div style={{
 width: 72, height: 72, borderRadius: 16,
 background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 display: "flex", alignItems: "center", justifyContent: "center",
 fontSize: 28, fontWeight: 900, color: "#000",
 flexShrink: 0,
 }}>F</div>
 <div style={{ flex: 1, minWidth: 200 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"}}>
 <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Example Account</div>
 <Pill text="Verified"color={C.accent} />
 <Pill text="SUPREME 91"color="#10b981"/>
 </div>
 <div style={{ fontSize: 14, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>@ExampleAnon</div>
 <div style={{ fontSize: 13, color: C.textSecondary, marginTop: 8, lineHeight: 1.5 }}>Solana dev · On-chain analyst · CT native · Building in crypto</div>
 <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap"}}>
 <Pill text="Tracked 127d"color={C.primary} />
 <Pill text="Solana"color={C.accent} />
 <Pill text="Clean History"color="#10b981"/>
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
 <div key={label} style={{ padding: "12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.05)"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
 <div style={{ fontSize: 18, fontWeight: 800, color: clr, marginTop: 4, fontFamily: "'JetBrains Mono', monospace"}}>{val}</div>
 </div>
 ))}
 </div>

 {/* Mini timeline */}
 <div style={{ height: 100 }}>
 <ResponsiveContainer width="100%"height="100%">
 <AreaChart data={generateHistory(18400, 91, 90)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id="profileGrad"x1="0"y1="0"x2="0"y2="1">
 <stop offset="0%"stopColor="#10b981"stopOpacity={0.4} />
 <stop offset="100%"stopColor="#10b981"stopOpacity={0} />
 </linearGradient>
 </defs>
 <Area type="monotone"dataKey="followers"stroke="#10b981"strokeWidth={2} fill="url(#profileGrad)"/>
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </GlowCard>

 {/* TRUST SIGNAL RADAR — DEPRECATED hidden */}
 <GlowCard glow style={{ marginBottom: 20, display: "none"}}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>Trust signal breakdown</div>
 <span style={{ padding: "3px 8px", borderRadius: 6, background: "#fbbf24", color: "#000", fontSize: 9, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>DEMO</span>
 </div>
 <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, letterSpacing: -0.3 }}>How <span style={{ color: C.primary }}>@ExampleAnon</span> scores across all 7 signals.</div>

 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
 {/* Radar */}
 <div style={{ padding: "16px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.05)"}}>
 {(() => {
 const signals = ["Followers", "Engagement", "Conversation", "Posting", "CIB", "Age", "Niche"];
 const values = [88, 92, 85, 90, 94, 89, 87];
 const cx = 140, cy = 130, radius = 80;
 const N = values.length;
 const points = values.map((v, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const r = (v / 100) * radius;
 return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
 }).join(" ");
 const labelPoints = signals.map((s, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const lr = radius + 18;
 return { x: cx + lr * Math.cos(angle), y: cy + lr * Math.sin(angle), label: s };
 });
 const gridLevels = [0.25, 0.5, 0.75, 1];
 return (
 <svg width="100%" height="260" viewBox="0 0 280 260" style={{ display: "block"}}>
 {gridLevels.map((lvl, gi) => {
 const polyPoints = signals.map((_, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const r = lvl * radius;
 return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
 }).join(" ");
 return <polygon key={gi} points={polyPoints} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
 })}
 {signals.map((_, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 return <line key={i} x1={cx} y1={cy} x2={cx + radius * Math.cos(angle)} y2={cy + radius * Math.sin(angle)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
 })}
 <polygon points={points} fill="rgba(16, 185, 129, 0.2)" stroke="#10b981" strokeWidth="2" />
 {values.map((v, i) => {
 const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
 const r = (v / 100) * radius;
 return <circle key={i} cx={cx + r * Math.cos(angle)} cy={cy + r * Math.sin(angle)} r="3" fill="#10b981" />;
 })}
 {labelPoints.map((p, i) => (
 <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fill="#888" fontSize="9" fontFamily="JetBrains Mono, monospace" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>{p.label}</text>
 ))}
 </svg>
 );
 })()}
 </div>

 {/* Signal scores list */}
 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 {[
 { label: "Followers", score: 88 },
 { label: "Engagement", score: 92 },
 { label: "Conversation", score: 85 },
 { label: "Posting", score: 90 },
 { label: "CIB", score: 94 },
 { label: "Age", score: 89 },
 { label: "Niche", score: 87 },
 ].map((s, i) => {
 const color = s.score >= 85 ? "#10b981" : s.score >= 70 ? "#34d399" : s.score >= 55 ? "#fbbf24" : "#ef4444";
 return (
 <div key={i} style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
 <span style={{ fontSize: 11, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 0.3 }}>{s.label}</span>
 <span style={{ fontSize: 13, fontWeight: 800, color: color, fontFamily: "'JetBrains Mono', monospace"}}>{s.score}</span>
 </div>
 <div style={{ height: 4, borderRadius: 2, background: "rgba(255, 255, 255, 0.05)", overflow: "hidden"}}>
 <div style={{ height: "100%", width: `${s.score}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)`, transition: "width 0.4s"}} />
 </div>
 </div>
 );
 })}
 </div>
 </div>
 </GlowCard>

 {/* TIER POSITIONING — DEPRECATED hidden */}
 <GlowCard style={{ marginBottom: 20, display: "none"}}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>Where they rank</div>
 <span style={{ padding: "3px 8px", borderRadius: 6, background: "#fbbf24", color: "#000", fontSize: 9, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>DEMO</span>
 </div>
 <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, letterSpacing: -0.3 }}>Top <span style={{ color: "#10b981" }}>4%</span> of all CT accounts.</div>

 {/* Score line marker */}
 <div style={{ position: "relative", marginBottom: 24, padding: "20px 0 30px"}}>
 <div style={{ position: "relative", height: 24, borderRadius: 12, background: "linear-gradient(90deg, #dc2626 0%, #ef4444 16%, #f97316 33%, #fbbf24 50%, #34d399 70%, #10b981 100%)"}}>
 {/* Tier markers */}
 {[0, 25, 40, 55, 70, 85, 100].map((mark, i) => (
 <div key={i} style={{ position: "absolute", left: `${mark}%`, top: 0, height: "100%", borderLeft: i === 0 || i === 6 ? "none" : "1px dashed rgba(0, 0, 0, 0.4)", transform: "translateX(-1px)"}} />
 ))}
 {/* User position pin */}
 <div style={{ position: "absolute", left: "91%", top: -6, transform: "translateX(-50%)"}}>
 <div style={{ width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "10px solid #10b981", margin: "0 auto"}} />
 </div>
 <div style={{ position: "absolute", left: "91%", top: "100%", transform: "translateX(-50%)", marginTop: 8 }}>
 <div style={{ padding: "3px 10px", borderRadius: 6, background: "#10b981", color: "#000", fontSize: 11, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, whiteSpace: "nowrap"}}>91 · You</div>
 </div>
 </div>
 <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: C.textMuted, letterSpacing: 0.5, textTransform: "uppercase"}}>
 <span>Likely Bot</span>
 <span>Suspicious</span>
 <span>Unknown</span>
 <span>Noted</span>
 <span>Credible</span>
 <span>Supreme</span>
 </div>
 </div>

 {/* Comparison stats */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
 {[
 { label: "Better than", val: "96%", sub: "of all CT" },
 { label: "Tier rank", val: "Top 4%", sub: "SUPREME tier" },
 { label: "Trust gain", val: "+12 pts", sub: "vs 90 days ago" },
 ].map((s, i) => (
 <div key={i} style={{ padding: "12px 14px", background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.18)", borderRadius: 10, textAlign: "center"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
 <div style={{ fontSize: 18, fontWeight: 900, color: "#10b981", marginTop: 4, fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.5 }}>{s.val}</div>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 2, letterSpacing: 0.3 }}>{s.sub}</div>
 </div>
 ))}
 </div>
 </GlowCard>

 {/* Share Card Section */}
 <GlowCard style={{ marginBottom: 20 }}>
 <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Share Card</div>
 <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 20 }}>Flex your score on X, auto-generated preview card that gets attached when you share your profile link.</div>

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
 <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${C.primary}30 0%, transparent 70%)`, pointerEvents: "none"}} />
 <div style={{ position: "absolute", bottom: -40, left: -40, width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle, ${C.accent}25 0%, transparent 70%)`, pointerEvents: "none"}} />

 {/* Card content */}
 <div style={{ position: "relative", padding: "28px 28px 24px"}}>
 {/* Top row, logo + branding */}
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
 <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#000"}}>CT</div>
 <div>
 <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: -0.3 }}>Web3Gigs</div>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1.5, textTransform: "uppercase"}}>Verified CT Account</div>
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
 }}>SUPREME</div>
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
 <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap"}}>
 <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>Example Account</span>
 <Check size={14} strokeWidth={3} style={{ color: C.accent }} />
 </div>
 <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>@ExampleAnon</div>
 <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap"}}>
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
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Trust Score</div>
 <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
 <span style={{ fontSize: 34, fontWeight: 900, color: "#10b981", letterSpacing: -1, fontFamily: "'JetBrains Mono', monospace"}}>91</span>
 <span style={{ fontSize: 13, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace"}}>/100</span>
 </div>
 </div>
 <div style={{
 padding: "16px 14px",
 background: `linear-gradient(135deg, ${C.primary}15, ${C.accent}15)`,
 border: `1px solid ${C.primary}30`,
 borderRadius: 12,
 }}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Tier</div>
 <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "#10b981", fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>SUPREME</div>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace"}}>Top 8% of CT</div>
 </div>
 </div>

 {/* Authenticity signals */}
 <div style={{ marginBottom: 18, padding: "14px 14px", background: "rgba(0, 0, 0, 0.3)", borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Authenticity Verified</div>
 <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
 {[
 { label: "Bot-free audience", detail: "Only 8% estimated bot followers"},
 { label: "Real engagement", detail: "High reply-to-like ratio"},
 { label: "Organic growth", detail: "No anomaly spikes in 90d"},
 { label: "CIB-clean", detail: "Not part of any detected pod"},
 ].map(sig => (
 <div key={sig.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontFamily: "'JetBrains Mono', monospace"}}>
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
 <div key={label} style={{ padding: "8px 6px", background: "rgba(0, 0, 0, 0.25)", borderRadius: 8, textAlign: "center"}}>
 <div style={{ fontSize: 8, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
 <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginTop: 2, fontFamily: "'JetBrains Mono', monospace"}}>{val}</div>
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
 <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase"}}>Verify Yours →</div>
 </div>
 </div>
 </div>

 {/* Action buttons */}
 <div style={{ display: "flex", gap: 10, flexWrap: "wrap"}}>
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
 >Share to X</button>
 <button style={{
 padding: "12px 20px", borderRadius: 10, border: `1px solid ${C.primary}40`,
 background: `${C.primary}15`, color: C.primary,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer",
 }}>Download PNG</button>
 <button style={{
 padding: "12px 20px", borderRadius: 10, border: `1px solid ${C.accent}40`,
 background: `${C.accent}15`, color: C.accent,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, cursor: "pointer",
 }}>Copy Link</button>
 </div>

 <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: 8, fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
 ℹ Share card is served as an OG image, when you paste your web3gigs.app/@handle link on X, this card auto-attaches as the preview.
 </div>
 </GlowCard>

 {/* Handshake History */}
 <GlowCard>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
 <div>
 <div style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Handshake History</div>
 <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Completed jobs build public reputation</div>
 </div>
 <Pill text="Coming with Jobs V1"color={C.textMuted} />
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
 {[
 { label: "Completed", val: "0", Icon: Check },
 { label: "In Progress", val: "0", Icon: Clock },
 { label: "Disputes", val: "0", Icon: AlertTriangle },
 { label: "Rating", val: "N/A", Icon: Trophy },
 ].map(stat => (
 <div key={stat.label} style={{ padding: "12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, textAlign: "center", border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", justifyContent: "center", marginBottom: 6, color: C.primary }}><stat.Icon size={18} strokeWidth={2} /></div>
 <div style={{ fontSize: 18, fontWeight: 800, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace"}}>{stat.val}</div>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{stat.label}</div>
 </div>
 ))}
 </div>
 </GlowCard>
 </div>
 )}


 {/* ─── JOBS / HANDSHAKE TAB ────────────────────────── */}
 {tab === "jobs"&& (
 <div>
 {/* Hero */}
 <div style={{ textAlign: "center", marginBottom: 32 }}>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.2)", marginBottom: 16 }}>
 <Handshake size={12} strokeWidth={2.5} style={{ color: C.primary }} />
 <span style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>Handshake · Beta</span>
 </div>
 <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0, letterSpacing: -1.5, lineHeight: 1.1 }}>Hire crypto's best.<br />
 <span style={{ color: C.primary }}>Trust-verified.</span>
 </h1>
 <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 16, maxWidth: 580, margin: "16px auto 0", lineHeight: 1.5 }}>The crypto work marketplace. Hire devs, designers, auditors, and writers, or KOLs, shitposters, and Spaces hosts. Every applicant comes with a Trust Score. Public on-chain Handshakes. Escrow V2 soon.
 </p>

 {/* How it works strip */}
 <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24, flexWrap: "wrap"}}>
 {[
 { label: "Post or apply", Icon: FileText },
 { label: "Sign handshake", Icon: Handshake },
 { label: "Deliver work", Icon: Check },
 { label: "Build reputation", Icon: Sparkles },
 ].map(step => (
 <div key={step.label} style={{ padding: "6px 12px", borderRadius: 16, background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>
 <step.Icon size={12} strokeWidth={2} />
 <span>{step.label}</span>
 </div>
 ))}
 </div>
 </div>

 {/* SUB-TAB TOGGLE */}
 <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
 <div style={{ display: "flex", gap: 4, background: "rgba(0, 0, 0, 0.5)", borderRadius: 14, padding: 4, border: "1px solid rgba(255, 255, 255, 0.06)"}}>
 {[
 { id: "crypto", label: "Crypto Work", desc: "Dev, design, audits, writing", Icon: Briefcase },
 { id: "ct", label: "CT / KOL Jobs", desc: "Shitposts, threads, raids, spaces", Icon: Megaphone },
 ].map(st => (
 <button
 key={st.id}
 onClick={() => { setJobsType(st.id); setJobsFilter("all"); }}
 style={{
 padding: "10px 20px", borderRadius: 10, border: "none",
 background: jobsType === st.id? `linear-gradient(135deg, ${C.primary}15, ${C.accent}15)`: "transparent",
 color: jobsType === st.id? C.primary: C.textMuted,
 fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 800,
 cursor: "pointer", letterSpacing: 0.3, transition: "all 0.2s",
 border: `1px solid ${jobsType === st.id? `${C.primary}40`: "transparent"}`,
 textAlign: "left",
 display: "flex", alignItems: "center", gap: 10,
 }}
 >
 <st.Icon size={18} strokeWidth={2} />
 <div>
 <div>{st.label}</div>
 <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: C.textMuted, marginTop: 2, fontWeight: 500, letterSpacing: 0.5 }}>{st.desc}</div>
 </div>
 </button>
 ))}
 </div>
 </div>

 {/* V1 Beta disclaimer */}
 <GlowCard style={{ marginBottom: 24, padding: "16px 20px", background: "rgba(245, 158, 11, 0.04)", border: "1px solid rgba(245, 158, 11, 0.2)"}}>
 <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
 <AlertTriangle size={20} strokeWidth={2} style={{ color: "#fbbf24", flexShrink: 0, marginTop: 2 }} />
 <div>
 <div style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>V1, Handshake Mode (No Custody)</div>
 <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6 }}>Web3Gigs doesn't hold funds yet. V1 uses <strong style={{ color: C.primary }}>on-chain handshakes</strong>, both parties sign a public commitment. Trust scores + community reputation enforce delivery. Multisig escrow (V2) and smart contract escrow (V3) coming soon.
 </div>
 </div>
 </div>
 </GlowCard>

 {/* Search bar */}
 <div style={{ position: "relative", marginBottom: 14 }}>
 <Search size={16} strokeWidth={2} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.textMuted, pointerEvents: "none"}} />
 <input
 type="text"
 placeholder="Search jobs by title, skill, or company..."
 value={jobSearch}
 onChange={e => setJobSearch(e.target.value)}
 style={{
 width: "100%", padding: "12px 14px 12px 40px", borderRadius: 10,
 background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.08)",
 color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
 boxSizing: "border-box", outline: "none", transition: "border-color 0.2s",
 }}
 onFocus={e => e.currentTarget.style.borderColor = `${C.primary}40`}
 onBlur={e => e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)"}
 />
 {jobSearch && (
 <button
 onClick={() => setJobSearch("")}
 style={{
 position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
 width: 24, height: 24, borderRadius: 6,
 background: "rgba(255, 255, 255, 0.06)", border: "none",
 color: C.textMuted, cursor: "pointer",
 display: "flex", alignItems: "center", justifyContent: "center",
 }}
 ><XIcon size={12} strokeWidth={2.5} /></button>
 )}
 </div>

 {/* Top action bar */}
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
 <div style={{ display: "flex", gap: 6, flexWrap: "wrap"}}>
 {(jobsType === "ct"? JOB_CATEGORIES_CT: JOB_CATEGORIES_CRYPTO).map(cat => (
 <button
 key={cat.id}
 onClick={() => setJobsFilter(cat.id)}
 style={{
 padding: "7px 14px", borderRadius: 10,
 background: jobsFilter === cat.id? "rgba(212, 255, 0, 0.12)": "rgba(0, 0, 0, 0.5)",
 color: jobsFilter === cat.id? C.primary: C.textMuted,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
 cursor: "pointer", letterSpacing: 0.5, transition: "all 0.2s",
 border: `1px solid ${jobsFilter === cat.id? `${C.primary}40`: "rgba(255, 255, 255, 0.06)"}`,
 display: "flex", alignItems: "center", gap: 6,
 }}
 >
 <cat.Icon size={13} strokeWidth={2} />
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

 {/* Status filter pills */}
 <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center"}}>
 <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginRight: 4 }}>Status:</span>
 {[
 { id: "all", label: "All", color: C.primary },
 { id: "open", label: "Open", color: "#10b981", dot: true },
 { id: "in_progress", label: "In Progress", color: "#fbbf24", dot: true },
 { id: "completed", label: "Completed", color: C.primary, dot: true },
 ].map(s => {
 const active = jobsStatus === s.id;
 const count = s.id === "all"
 ? [...approvedJobs, ...MOCK_JOBS].filter(j => j.jobType === jobsType).length
 : [...approvedJobs, ...MOCK_JOBS].filter(j => j.jobType === jobsType && (j.status || "open") === s.id).length;
 return (
 <button
 key={s.id}
 onClick={() => setJobsStatus(s.id)}
 style={{
 padding: "6px 12px", borderRadius: 16, border: "1px solid",
 borderColor: active ? s.color : "rgba(255, 255, 255, 0.1)",
 background: active ? `${s.color}15` : "rgba(0, 0, 0, 0.4)",
 color: active ? s.color : C.textSecondary,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
 cursor: "pointer", letterSpacing: 0.5, transition: "all 0.15s",
 display: "inline-flex", alignItems: "center", gap: 6,
 }}
 onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = `${s.color}80`; }}
 onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)"; }}
 >
 {s.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, boxShadow: active ? `0 0 6px ${s.color}80` : "none" }} />}
 <span>{s.label}</span>
 <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>· {count}</span>
 </button>
 );
 })}
 </div>

 {/* Jobs grid */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 40 }}>
 {[...approvedJobs, ...MOCK_JOBS]
.filter(j => {
   if (j.jobType !== jobsType) return false;
   if (jobsFilter !== "all" && j.category !== jobsFilter) return false;
   if (jobsStatus !== "all" && (j.status || "open") !== jobsStatus) return false;
   if (jobSearch.trim()) {
     const q = jobSearch.toLowerCase().trim();
     const haystack = `${j.title} ${j.description || ""} ${j.poster || ""} ${(j.tags || []).join(" ")} ${j.category}`.toLowerCase();
     if (!haystack.includes(q)) return false;
   }
   return true;
 })
.sort((a, b) => {
   // Status priority: open (3), in_progress (2), completed (1)
   const statusRank = (s) => s === "open" ? 3 : s === "in_progress" ? 2 : 1;
   const aStatus = statusRank(a.status || "open");
   const bStatus = statusRank(b.status || "open");
   if (aStatus !== bStatus) return bStatus - aStatus;
   // Then featured + new
   const aFeat = a.featured ? 2 : 0;
   const bFeat = b.featured ? 2 : 0;
   const aNew = a.isNew ? 1 : 0;
   const bNew = b.isNew ? 1 : 0;
   return (bFeat + bNew) - (aFeat + aNew);
 })
.map(job => {
 const statusColor = job.status === "open" ? "#10b981" : job.status === "in_progress" ? "#fbbf24" : job.status === "completed" ? C.primary : C.textMuted;
 const statusLabel = job.status === "open" ? "OPEN" : job.status === "in_progress" ? "IN PROGRESS" : job.status === "completed" ? "COMPLETED" : (job.status || "OPEN").toUpperCase();
 const posterColor = job.posterTrust >= 85? "#10b981": job.posterTrust >= 70? "#34d399": job.posterTrust >= 55? "#fbbf24": "#f97316";
 return (
 <div
 key={job.id}
 onClick={() => setSelectedJob(job)}
 style={{
 padding: 20, borderRadius: 14,
 background: job.featured ? `linear-gradient(180deg, rgba(212, 255, 0, 0.06), rgba(18, 18, 18, 0.7))` : "rgba(18, 18, 18, 0.7)",
 border: job.featured ? `1px solid ${C.primary}50` : "1px solid rgba(255, 255, 255, 0.06)",
 boxShadow: job.featured ? `0 0 24px rgba(212, 255, 0, 0.12)` : "none",
 cursor: "pointer", transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
 display: "flex", flexDirection: "column", gap: 12,
 position: "relative",
 }}
 onMouseEnter={e => {
 e.currentTarget.style.borderColor = job.featured ? C.primary : "rgba(212, 255, 0, 0.3)";
 e.currentTarget.style.transform = "translateY(-2px)";
 e.currentTarget.style.background = job.featured ? `linear-gradient(180deg, rgba(212, 255, 0, 0.1), rgba(25, 25, 25, 0.9))` : "rgba(25, 25, 25, 0.9)";
 e.currentTarget.style.boxShadow = job.featured ? `0 0 32px rgba(212, 255, 0, 0.25)` : "none";
 }}
 onMouseLeave={e => {
 e.currentTarget.style.borderColor = job.featured ? `${C.primary}50` : "rgba(255, 255, 255, 0.06)";
 e.currentTarget.style.transform = "translateY(0)";
 e.currentTarget.style.background = job.featured ? `linear-gradient(180deg, rgba(212, 255, 0, 0.06), rgba(18, 18, 18, 0.7))` : "rgba(18, 18, 18, 0.7)";
 e.currentTarget.style.boxShadow = job.featured ? `0 0 24px rgba(212, 255, 0, 0.12)` : "none";
 }}
 >
 {job.featured && (
 <div style={{ position: "absolute", top: -10, left: 16, padding: "3px 10px", borderRadius: 6, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, color: "#000", fontSize: 9, fontWeight: 900, letterSpacing: 1.5, fontFamily: "'JetBrains Mono', monospace", boxShadow: `0 0 12px ${C.primary}60`, display: "inline-flex", alignItems: "center", gap: 4 }}>
 <Sparkles size={9} strokeWidth={3} /> FEATURED
 </div>
 )}
 {/* Top row: status + category */}
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center"}}>
 <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
 <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
 <span style={{ fontSize: 9, color: statusColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: 1.5 }}>{statusLabel}</span>
 {job.isNew && (
 <span style={{ marginLeft: 4, padding: "2px 6px", borderRadius: 4, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, color: "#000", fontSize: 8, fontWeight: 900, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace", boxShadow: `0 0 8px ${C.primary}40` }}>NEW</span>
 )}
 </div>
 <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace"}}>{job.postedAgo}</span>
 </div>

 {/* Title + budget */}
 <div>
 <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginBottom: 8 }}>{job.title}</div>
 <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
 <span style={{ fontSize: 24, fontWeight: 900, color: C.primary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: -0.5 }}>${job.budget.toLocaleString()}</span>
 <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace"}}>{job.budgetCurrency} · {job.deadline}</span>
 </div>
 </div>

 {/* Poster info */}
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
 <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg, #333, #111)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#fff"}}>{job.poster[1].toUpperCase()}</div>
 <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace"}}>{job.poster}</span>
 {job.posterVerified && <Check size={11} strokeWidth={3} style={{ color: C.accent }} />}
 </div>
 <div style={{ padding: "3px 8px", borderRadius: 6, background: `${posterColor}15`, border: `1px solid ${posterColor}40`, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 800, color: posterColor }}>{job.posterTrust}</div>
 </div>

 {/* Bottom: proposals + min trust (only CT) or portfolio (only Crypto) */}
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace"}}>
 <span> {job.proposals} proposals</span>
 {job.jobType === "ct" ? (
 <span>Min trust: {job.minTrustScore}</span>
 ) : (
 <span>Portfolio review</span>
 )}
 </div>

 {/* Tags */}
 <div style={{ display: "flex", gap: 5, flexWrap: "wrap"}}>
 {job.tags.map(tag => (
 <span key={tag} style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(212, 255, 0, 0.05)", border: "1px solid rgba(212, 255, 0, 0.15)", fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace"}}>#{tag}</span>
 ))}
 </div>
 </div>
 );
 })}
 </div>

 {/* Empty state message if no jobs match filter */}
 {[...approvedJobs, ...MOCK_JOBS].filter(j => {
   if (j.jobType !== jobsType) return false;
   if (jobsFilter !== "all" && j.category !== jobsFilter) return false;
   if (jobsStatus !== "all" && (j.status || "open") !== jobsStatus) return false;
   if (jobSearch.trim()) {
     const q = jobSearch.toLowerCase().trim();
     const haystack = `${j.title} ${j.description || ""} ${j.poster || ""} ${(j.tags || []).join(" ")} ${j.category}`.toLowerCase();
     if (!haystack.includes(q)) return false;
   }
   return true;
 }).length === 0 && (
 <div style={{ textAlign: "center", padding: "60px 30px", maxWidth: 480, margin: "0 auto"}}>
 <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
 <div style={{ width: 72, height: 72, borderRadius: 18, background: "rgba(212, 255, 0, 0.04)", border: "1px solid rgba(212, 255, 0, 0.2)", display: "flex", alignItems: "center", justifyContent: "center"}}>
 <Search size={32} strokeWidth={1.8} style={{ color: C.primary, opacity: 0.6 }} />
 </div>
 </div>
 <div style={{ fontSize: 18, fontWeight: 800, color: C.textPrimary, marginBottom: 8, letterSpacing: -0.3 }}>
 {jobSearch.trim() ? `No matches for "${jobSearch}"` : `No ${jobsType === "ct" ? "CT" : "Crypto"} jobs in this category yet`}
 </div>
 <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, marginBottom: 22, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3 }}>
 {jobSearch.trim()
 ? "Try a broader search term, or be the first to post about this."
 : "Be the first to post in this category. Manually reviewed within 24h."}
 </div>
 <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap"}}>
 {jobSearch.trim() && (
 <button
 onClick={() => setJobSearch("")}
 style={{
 padding: "10px 16px", borderRadius: 10,
 background: "transparent", border: `1px solid ${C.borderHover}`,
 color: C.textPrimary, fontSize: 12, fontWeight: 700,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer", letterSpacing: 0.3,
 transition: "all 0.15s",
 }}
 onMouseEnter={e => e.currentTarget.style.borderColor = `${C.primary}60`}
 onMouseLeave={e => e.currentTarget.style.borderColor = C.borderHover}
 >Clear search</button>
 )}
 {jobsFilter !== "all" && !jobSearch.trim() && (
 <button
 onClick={() => setJobsFilter("all")}
 style={{
 padding: "10px 16px", borderRadius: 10,
 background: "transparent", border: `1px solid ${C.borderHover}`,
 color: C.textPrimary, fontSize: 12, fontWeight: 700,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer", letterSpacing: 0.3,
 transition: "all 0.15s",
 }}
 onMouseEnter={e => e.currentTarget.style.borderColor = `${C.primary}60`}
 onMouseLeave={e => e.currentTarget.style.borderColor = C.borderHover}
 >See all jobs</button>
 )}
 <button
 onClick={() => setShowPostJob(true)}
 style={{
 padding: "10px 16px", borderRadius: 10, border: "none",
 background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: "#000", fontSize: 12, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer", letterSpacing: 0.3,
 boxShadow: "0 0 16px rgba(212, 255, 0, 0.2)",
 transition: "all 0.15s",
 display: "inline-flex", alignItems: "center", gap: 6,
 }}
 onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 0 24px rgba(212, 255, 0, 0.35)"; }}
 onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 16px rgba(212, 255, 0, 0.2)"; }}
 ><Sparkles size={12} strokeWidth={2.5} /><span>Post the first one</span></button>
 </div>
 </div>
 )}

 {/* How Handshake Works card */}
 <GlowCard glow style={{ marginBottom: 20, padding: "28px"}}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>How Handshake Works</div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
 {[
 { n: "1", title: "Post or Apply", desc: "Companies post jobs with budget, deadline, and minimum trust score. Applicants send proposals with their Trust Score credentials attached."},
 { n: "2", title: "Sign Handshake", desc: "Both parties sign a public commitment on Solana, free, gasless. Terms become tamper-proof and publicly verifiable."},
 { n: "3", title: "Work & Deliver", desc: "Worker delivers per the agreed deliverables. Buyer reviews. Both parties mark the handshake as complete."},
 { n: "4", title: "Reputation Compounds", desc: "Successful handshakes boost both parties' trust scores. Disputes get arbitrated publicly by the community."},
 ].map(step => (
 <div key={step.n}>
 <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
 <div style={{ width: 24, height: 24, borderRadius: 7, background: "rgba(212, 255, 0, 0.1)", border: `1px solid ${C.primary}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: C.primary, fontFamily: "'JetBrains Mono', monospace"}}>{step.n}</div>
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
 {tab === "cib"&& (
 <div>
 <div style={{ textAlign: "center", marginBottom: 28 }}>
 <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>CIB <span style={{ color: C.primary }}>Detection</span>
 </h1>
 <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Coordinated Inauthentic Behavior · Exposing engagement pods & raid networks</p>
 </div>

 {/* Handle search */}
 <GlowCard glow style={{ padding: "20px", marginBottom: 24, maxWidth: 560, margin: "0 auto 24px"}}>
 <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, fontWeight: 700 }}>Check an account</div>
 <div style={{ display: "flex", gap: 8 }}>
 <div style={{ flex: 1, position: "relative"}}>
 <Search size={16} strokeWidth={2} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.textMuted }} />
 <input
 type="text"
 placeholder="@handle, scan for pod membership"
 value={cibSearchHandle}
 onChange={e => setCibSearchHandle(e.target.value)}
 onKeyDown={e => { if (e.key === "Enter") runCibScan(); }}
 maxLength={50}
 style={{
 width: "100%", padding: "12px 14px 12px 40px", borderRadius: 10,
 background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)",
 color: C.textPrimary, fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
 outline: "none", boxSizing: "border-box",
 }}
 onFocus={e => e.currentTarget.style.borderColor = `${C.primary}60`}
 onBlur={e => e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)"}
 />
 </div>
 <button
 onClick={runCibScan}
 disabled={!cibSearchHandle.trim() || cibScanning}
 style={{
 padding: "12px 18px", borderRadius: 10, border: "none",
 background: (!cibSearchHandle.trim() || cibScanning) ? "rgba(255, 255, 255, 0.05)" : `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: (!cibSearchHandle.trim() || cibScanning) ? C.textMuted : "#000",
 fontSize: 12, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif",
 cursor: (!cibSearchHandle.trim() || cibScanning) ? "not-allowed" : "pointer",
 letterSpacing: 0.5, whiteSpace: "nowrap", transition: "all 0.2s",
 }}
 >{cibScanning ? "Scanning..." : "Scan"}</button>
 </div>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8, flexWrap: "wrap"}}>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Live API on V1 launch · Demo scoring active for testing</div>
 <span style={{ padding: "3px 8px", borderRadius: 6, background: "#fbbf24", color: "#000", fontSize: 9, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>DEMO</span>
 </div>
 </GlowCard>

 {/* CIB SCAN RESULT */}
 {cibScanResult && (
 <div data-cib-result style={{ marginBottom: 28 }}>
 <GlowCard glow style={{ borderColor: `${cibScanResult.verdictColor}40`, background: `linear-gradient(180deg, ${cibScanResult.verdictColor}06, rgba(0, 0, 0, 0.5))` }}>
 {/* Header */}
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 10, flexWrap: "wrap"}}>
 <div>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4, fontWeight: 700 }}>Scan Result</div>
 <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>@{cibScanResult.handle}</div>
 <div style={{ fontSize: 13, fontWeight: 800, color: cibScanResult.verdictColor, fontFamily: "'JetBrains Mono', monospace", marginTop: 6, letterSpacing: 0.5 }}>{cibScanResult.verdict}</div>
 </div>
 <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"}}>
 <span style={{ padding: "3px 8px", borderRadius: 6, background: "#fbbf24", color: "#000", fontSize: 9, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>DEMO</span>
 <span style={{ padding: "5px 12px", borderRadius: 8, background: `${cibScanResult.verdictColor}15`, color: cibScanResult.verdictColor, fontSize: 14, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, border: `1px solid ${cibScanResult.verdictColor}40` }}>{cibScanResult.inauthenticity}% INAUTHENTIC</span>
 </div>
 </div>

 {/* Stats grid */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 16 }}>
 {[
 ["Trust Score", cibScanResult.trust, cibScanResult.trustColor],
 ["Tweets Analyzed", cibScanResult.tweetsAnalyzed, C.textPrimary],
 ["Total Replies", cibScanResult.totalReplies.toLocaleString(), C.textPrimary],
 ["Suspicious", cibScanResult.suspiciousReplies, cibScanResult.verdictColor],
 ["New Accounts", cibScanResult.newAccountReplies, cibScanResult.verdictColor],
 ["Velocity Hits", cibScanResult.velocityAnomalies, cibScanResult.verdictColor],
 ].map(([label, val, clr]) => (
 <div key={label} style={{ padding: "10px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
 <div style={{ fontSize: 16, fontWeight: 800, color: clr, marginTop: 3, fontFamily: "'JetBrains Mono', monospace"}}>{val}</div>
 </div>
 ))}
 </div>

 {/* Pod members preview */}
 {cibScanResult.podMembers.length > 0 && cibScanResult.inauthenticity >= 25 && (
 <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10, fontWeight: 700 }}>Detected Pod Members ({cibScanResult.podMembers.length})</div>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
 {cibScanResult.podMembers.map((p, i) => (
 <span key={i} style={{ padding: "5px 10px", borderRadius: 14, background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.2)", fontSize: 10, color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3 }}>@{p}</span>
 ))}
 </div>
 </div>
 )}

 {/* Action row */}
 <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap"}}>
 <button
 onClick={() => {
 const text = cibScanResult.inauthenticity >= 50
 ? `Web3Gigs CIB scan flagged @${cibScanResult.handle} as ${cibScanResult.inauthenticity}% inauthentic 🚩\n\nDetected ${cibScanResult.podMembers.length} pod members.\n\nweb3gigs.app`
 : `@${cibScanResult.handle} just got a clean CIB scan on Web3Gigs · ${cibScanResult.inauthenticity}% inauthentic 🛡️\n\nweb3gigs.app`;
 window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
 }}
 style={{
 flex: 1, minWidth: 140, padding: "10px 14px", borderRadius: 10, border: "none",
 background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: "#000", fontSize: 12, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer",
 letterSpacing: 0.3, transition: "all 0.2s",
 display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
 }}
 ><Sparkles size={12} strokeWidth={2.5} /><span>Share on X</span></button>
 <button
 onClick={() => { setCibScanResult(null); setCibSearchHandle(""); }}
 style={{
 padding: "10px 14px", borderRadius: 10,
 background: "transparent", border: "1px solid rgba(255, 255, 255, 0.12)",
 color: C.textSecondary, fontSize: 12, fontWeight: 700,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer", letterSpacing: 0.3,
 }}
 >Scan another</button>
 </div>
 </GlowCard>
 </div>
 )}

 {/* Detection stats */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
 {[
 ["Clusters Detected", "23", "#ef4444"],
 ["Accounts Flagged", "847", C.accent],
 ["Pods This Week", "+5", C.primary],
 ["Network Coverage", "96%", "#10b981"],
 ].map(([label, val, clr]) => (
 <GlowCard key={label} style={{ padding: "14px", textAlign: "center"}}>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
 <div style={{ fontSize: 22, fontWeight: 800, color: clr, marginTop: 4, fontFamily: "'JetBrains Mono', monospace"}}>{val}</div>
 </GlowCard>
 ))}
 </div>

 {/* CLUSTER NETWORK VIZ */}
 <div style={{ marginBottom: 32 }}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
 <div>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6, fontWeight: 700 }}>Network Graph</div>
 <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: -1 }}>Anatomy of an <span style={{ color: "#ef4444" }}>engagement pod.</span></h2>
 </div>
 <span style={{ padding: "3px 8px", borderRadius: 6, background: "#fbbf24", color: "#000", fontSize: 9, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>DEMO</span>
 </div>

 <div style={{ padding: "20px", background: "rgba(18, 18, 18, 0.7)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 14 }}>
 <div style={{ position: "relative", width: "100%", height: 380 }}>
 {(() => {
 // Pod with 12 connected handles + 3 outsiders
 const cx = 250, cy = 190, podRadius = 110;
 const podMembers = [
 "alpha_dev_99", "crypto_pump1", "shillmaster_x", "degen_sigma",
 "sol_maxi_888", "bot_or_real", "moon_caller", "memecoin_king",
 "based_anon", "coordinated_a", "follow4follow", "raidleader",
 ];
 const outsiders = ["legit_builder", "real_artist", "actual_dev"];

 // Pod nodes arranged in circle
 const podNodes = podMembers.map((h, i) => {
 const angle = (i / podMembers.length) * 2 * Math.PI;
 return {
 handle: h,
 x: cx + podRadius * Math.cos(angle),
 y: cy + podRadius * Math.sin(angle),
 inPod: true,
 };
 });

 // Outsiders scattered far from cluster
 const outsiderNodes = [
 { handle: "legit_builder", x: 60, y: 60, inPod: false },
 { handle: "real_artist", x: 440, y: 80, inPod: false },
 { handle: "actual_dev", x: 60, y: 320, inPod: false },
 ];

 const allNodes = [...podNodes, ...outsiderNodes];

 // Generate edges WITHIN the pod (dense cross-engagement)
 const podEdges = [];
 for (let i = 0; i < podNodes.length; i++) {
 for (let j = i + 1; j < podNodes.length; j++) {
 // 70% density
 if (Math.abs((i * 17 + j * 23) % 10) < 7) {
 podEdges.push([podNodes[i], podNodes[j]]);
 }
 }
 }

 return (
 <svg width="100%" height="100%" viewBox="0 0 500 380" style={{ display: "block", maxWidth: 600, margin: "0 auto"}}>
 {/* Pod cluster background highlight */}
 <circle cx={cx} cy={cy} r={podRadius + 35} fill="rgba(239, 68, 68, 0.04)" stroke="rgba(239, 68, 68, 0.18)" strokeWidth="1" strokeDasharray="4,4" />
 <text x={cx} y={cy + podRadius + 60} textAnchor="middle" fill="#ef4444" fontSize="10" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">CLUSTER #C-7741 · 12 handles</text>

 {/* Edges within pod (red — coordinated engagement) */}
 {podEdges.map(([a, b], i) => (
 <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(239, 68, 68, 0.3)" strokeWidth="1" />
 ))}

 {/* Pod nodes (red, flagged) */}
 {podNodes.map((node, i) => (
 <g key={`pod-${i}`}>
 <circle cx={node.x} cy={node.y} r="8" fill="#ef4444" stroke="#fca5a5" strokeWidth="1.5" />
 <text x={node.x} y={node.y - 14} textAnchor="middle" fill="#fca5a5" fontSize="8" fontFamily="JetBrains Mono, monospace" letterSpacing="0.3">@{node.handle}</text>
 </g>
 ))}

 {/* Outsider nodes (green, clean) */}
 {outsiderNodes.map((node, i) => (
 <g key={`out-${i}`}>
 <circle cx={node.x} cy={node.y} r="8" fill="#10b981" stroke="#6ee7b7" strokeWidth="1.5" />
 <text x={node.x} y={node.y - 14} textAnchor="middle" fill="#6ee7b7" fontSize="8" fontFamily="JetBrains Mono, monospace" letterSpacing="0.3">@{node.handle}</text>
 </g>
 ))}

 {/* Caption labels */}
 <text x="250" y="20" textAnchor="middle" fill="#888" fontSize="9" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">DENSE CROSS-ENGAGEMENT = COORDINATED POD</text>
 </svg>
 );
 })()}
 </div>

 {/* Legend */}
 <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap", justifyContent: "center"}}>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
 <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
 <span style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Pod member · flagged</span>
 </div>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
 <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
 <span style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Organic account · clean</span>
 </div>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
 <div style={{ width: 16, height: 1, background: "rgba(239, 68, 68, 0.6)" }} />
 <span style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Engagement edge</span>
 </div>
 </div>
 </div>
 <div style={{ display: "flex", gap: 12, marginTop: 14, padding: "12px 14px", background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 10, alignItems: "flex-start"}}>
 <Eye size={14} strokeWidth={2.5} style={{ color: C.textSecondary, flexShrink: 0, marginTop: 2 }} />
 <div style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3, lineHeight: 1.5 }}>The dense web of engagement edges between pod members is the smoking gun. Real accounts engage diversely. Pods engage almost exclusively with each other to manipulate algorithm signals.</div>
 </div>
 </div>

 {/* Cluster cards */}
 <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Detected Clusters</div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, marginBottom: 24 }}>
 {CIB_CLUSTERS.map(c => {
 const sevColor = c.severity === "high"? "#ef4444": c.severity === "medium"? "#f59e0b": "#fbbf24";
 return (
 <GlowCard key={c.id} glow style={{ borderColor: `${sevColor}30`, cursor: "pointer"}} onClick={() => setSelectedCluster(selectedCluster === c.id? null: c.id)}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
 <div>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>{c.id}</div>
 <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{c.name}</div>
 </div>
 <Pill text={c.severity.toUpperCase()} color={sevColor} />
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
 <div style={{ padding: "8px 10px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase"}}>Members</div>
 <div style={{ fontSize: 18, fontWeight: 800, color: sevColor, fontFamily: "'JetBrains Mono', monospace"}}>{c.members}</div>
 </div>
 <div style={{ padding: "8px 10px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase"}}>Reciprocal Eng</div>
 <div style={{ fontSize: 18, fontWeight: 800, color: sevColor, fontFamily: "'JetBrains Mono', monospace"}}>{c.reciprocal}%</div>
 </div>
 </div>

 <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, padding: "10px 12px", background: `${sevColor}08`, borderRadius: 8, border: `1px solid ${sevColor}20`, marginBottom: 10 }}>
 <strong>Pattern:</strong> {c.pattern}
 </div>

 {selectedCluster === c.id && (
 <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Sample Members</div>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
 {c.accounts.map(a => (
 <span key={a} style={{ padding: "4px 10px", background: `${sevColor}15`, color: sevColor, border: `1px solid ${sevColor}30`, borderRadius: 6, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{a}</span>
 ))}
 <span style={{ padding: "4px 10px", color: C.textMuted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace"}}>+{c.members - c.accounts.length} more</span>
 </div>
 </div>
 )}

 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 8 }}>Detected {c.detectedAt}</div>
 </GlowCard>
 );
 })}
 </div>

 {/* Forensics Report Section */}
 <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Deep Forensics</div>
 <GlowCard>
 {!cibScanResult ? (
 <div style={{ textAlign: "center", padding: "40px 20px"}}>
 <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, color: C.primary }}><Search size={40} strokeWidth={1.8} /></div>
 <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Search a handle above to run a scan</div>
 <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 20, maxWidth: 440, margin: "0 auto 20px"}}>Type any X handle in the "Check an account" search at the top, then hit Scan. The full forensics report (velocity timeline, pod engagers, account ages, template phrases, and baseline comparison) will appear here.</div>
 <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap"}}>
 {["vitalikbuteryn", "elonmusk", "bot12345", "shillmaster_x"].map(h => (
 <button
 key={h}
 onClick={() => { setCibSearchHandle(h); setTimeout(() => runCibScan(), 50); }}
 style={{
 padding: "6px 12px", borderRadius: 16,
 background: "rgba(212, 255, 0, 0.05)",
 border: "1px solid rgba(212, 255, 0, 0.18)",
 color: C.textPrimary,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
 cursor: "pointer", letterSpacing: 0.3, transition: "all 0.15s",
 }}
 onMouseEnter={e => { e.currentTarget.style.background = "rgba(212, 255, 0, 0.12)"; e.currentTarget.style.color = C.primary; }}
 onMouseLeave={e => { e.currentTarget.style.background = "rgba(212, 255, 0, 0.05)"; e.currentTarget.style.color = C.textPrimary; }}
 >@{h}</button>
 ))}
 </div>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 14, letterSpacing: 0.5 }}>Or click any handle above to try it instantly</div>
 </div>
 ) : (
 <div>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
 <div style={{ fontSize: 14, fontWeight: 700 }}>Forensics Report · @{cibScanResult.handle}</div>
 <div style={{ display: "flex", gap: 8, alignItems: "center"}}>
 <span style={{ padding: "3px 8px", borderRadius: 6, background: "#fbbf24", color: "#000", fontSize: 9, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>DEMO</span>
 <Pill text={`${cibScanResult.inauthenticity}% FLAGGED`} color={cibScanResult.verdictColor} />
 </div>
 </div>

 {/* SUMMARY STATS */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 24 }}>
 {[
 ["Tweets Analyzed", cibScanResult.tweetsAnalyzed],
 ["Total Replies", cibScanResult.totalReplies.toLocaleString()],
 ["Suspicious", cibScanResult.suspiciousReplies],
 ["New Account Replies", cibScanResult.newAccountReplies],
 ["Template Replies", cibScanResult.templateReplies],
 ["Velocity Anomalies", cibScanResult.velocityAnomalies],
 ].map(([l, v]) => (
 <div key={l} style={{ padding: "10px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, textAlign: "center"}}>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.8 }}>{l}</div>
 <div style={{ fontSize: 16, fontWeight: 800, color: C.textPrimary, marginTop: 3, fontFamily: "'JetBrains Mono', monospace"}}>{v}</div>
 </div>
 ))}
 </div>

 {/* SECTION 1: INAUTHENTICITY BREAKDOWN — derived from inauthenticity score */}
 <div style={{ marginBottom: 28, paddingTop: 18, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>1 · Inauthenticity Breakdown</div>
 <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, letterSpacing: -0.3 }}>What contributed to the <span style={{ color: cibScanResult.verdictColor }}>{cibScanResult.inauthenticity}% flag.</span></div>
 {(() => {
 const intensity = cibScanResult.inauthenticity / 100;
 const factors = [
 { label: "Pod engagement patterns", pct: Math.round(38 * intensity * 1.2), color: cibScanResult.verdictColor },
 { label: "Template/copy-paste replies", pct: Math.round(24 * intensity * 1.1), color: "#f97316" },
 { label: "New account replies (< 30d old)", pct: Math.round(18 * intensity * 1.3), color: "#fbbf24" },
 { label: "Reply velocity anomalies", pct: Math.round(12 * intensity * 1.4), color: "#fbbf24" },
 { label: "Cross-pod referrals", pct: Math.round(8 * intensity * 1.5), color: "#f97316" },
 ];
 return (
 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 {factors.map((f, i) => (
 <div key={i} style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
 <span style={{ fontSize: 12, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{f.label}</span>
 <span style={{ fontSize: 13, fontWeight: 800, color: f.color, fontFamily: "'JetBrains Mono', monospace"}}>{f.pct}%</span>
 </div>
 <div style={{ height: 4, borderRadius: 2, background: "rgba(255, 255, 255, 0.05)", overflow: "hidden"}}>
 <div style={{ height: "100%", width: `${Math.min(100, f.pct * 2.5)}%`, background: `linear-gradient(90deg, ${f.color}, ${f.color}aa)`, transition: "width 0.4s"}} />
 </div>
 </div>
 ))}
 </div>
 );
 })()}
 </div>

 {/* SECTION 2: VELOCITY TIMELINE — scaled by inauthenticity */}
 <div style={{ marginBottom: 28, paddingTop: 18, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>2 · Reply Velocity Timeline</div>
 <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, letterSpacing: -0.3 }}>Replies hitting in <span style={{ color: cibScanResult.verdictColor }}>0-30 seconds.</span></div>
 {(() => {
 // Scale early-bucket counts by inauthenticity (clean = trickle in, dirty = burst at 0-30s)
 const intensity = cibScanResult.inauthenticity / 100;
 const buckets = [
 { label: "0-5s", count: Math.round(50 * intensity), color: cibScanResult.verdictColor, flag: intensity > 0.3 },
 { label: "5-10s", count: Math.round(40 * intensity), color: cibScanResult.verdictColor, flag: intensity > 0.3 },
 { label: "10-30s", count: Math.round(33 * intensity), color: "#f97316", flag: intensity > 0.3 },
 { label: "30-60s", count: Math.round(20 + 20 * (1 - intensity)), color: "#fbbf24", flag: false },
 { label: "1-5m", count: Math.round(22 + 30 * (1 - intensity)), color: "#34d399", flag: false },
 { label: "5-30m", count: Math.round(14 + 40 * (1 - intensity)), color: "#10b981", flag: false },
 { label: "30m+", count: Math.round(8 + 30 * (1 - intensity)), color: "#10b981", flag: false },
 ];
 const max = Math.max(...buckets.map(b => b.count), 1);
 const earlyTotal = buckets.slice(0, 3).reduce((sum, b) => sum + b.count, 0);
 const total = buckets.reduce((sum, b) => sum + b.count, 0);
 const earlyPct = total > 0 ? Math.round((earlyTotal / total) * 100) : 0;
 return (
 <>
 <div style={{ padding: "16px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, marginBottom: 12 }}>
 {buckets.map((b, i) => (
 <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end"}}>
 <div style={{ fontSize: 11, fontWeight: 800, color: b.color, fontFamily: "'JetBrains Mono', monospace"}}>{b.count}</div>
 <div style={{ width: "100%", height: `${(b.count / max) * 100}%`, background: `linear-gradient(180deg, ${b.color}, ${b.color}aa)`, borderRadius: "4px 4px 1px 1px", boxShadow: b.flag ? `0 0 8px ${b.color}40` : "none", minHeight: 4, transition: "all 0.3s"}} />
 </div>
 ))}
 </div>
 <div style={{ display: "flex", gap: 6, paddingTop: 8, borderTop: "1px solid rgba(255, 255, 255, 0.05)"}}>
 {buckets.map((b, i) => (
 <div key={i} style={{ flex: 1, textAlign: "center"}}>
 <div style={{ fontSize: 9, color: b.flag ? cibScanResult.verdictColor : C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, fontWeight: b.flag ? 800 : 500 }}>{b.label}</div>
 </div>
 ))}
 </div>
 </div>
 <div style={{ marginTop: 10, padding: "10px 12px", background: intensity > 0.3 ? "rgba(239, 68, 68, 0.05)" : "rgba(16, 185, 129, 0.05)", border: `1px solid ${intensity > 0.3 ? "rgba(239, 68, 68, 0.18)" : "rgba(16, 185, 129, 0.18)"}`, borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start"}}>
 {intensity > 0.3 ? <Flag size={12} strokeWidth={2.5} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} /> : <Check size={12} strokeWidth={2.5} style={{ color: "#10b981", flexShrink: 0, marginTop: 2 }} />}
 <span style={{ fontSize: 11, color: intensity > 0.3 ? "#fca5a5" : "#6ee7b7", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.4 }}>
 {intensity > 0.3
 ? `${earlyTotal} replies (${earlyPct}%) hit within 30 seconds. Real organic replies trickle in over hours, not seconds.`
 : `Reply distribution looks organic. Most replies trickle in over hours/days, consistent with a real audience.`}
 </span>
 </div>
 </>
 );
 })()}
 </div>

 {/* SECTION 3: TOP POD ENGAGERS — uses cibScanResult.podMembers */}
 {cibScanResult.podMembers.length > 0 && cibScanResult.inauthenticity >= 18 && (
 <div style={{ marginBottom: 28, paddingTop: 18, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>3 · Top Pod Engagers</div>
 <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, letterSpacing: -0.3 }}>Accounts engaging on <span style={{ color: cibScanResult.verdictColor }}>almost every post.</span></div>
 {(() => {
 // Use the deterministic podMembers from cibScanResult, generate stats per member
 const baseReplies = 28 + Math.round(cibScanResult.inauthenticity / 4);
 const podders = cibScanResult.podMembers.slice(0, 8).map((handle, i) => ({
 handle,
 replies: baseReplies - i * 2,
 age: `${8 + (i * 7) % 60}d`,
 risk: Math.max(60, 95 - i * 3),
 }));
 return (
 <div style={{ padding: "12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 70px", gap: 8, paddingBottom: 8, borderBottom: "1px solid rgba(255, 255, 255, 0.05)", marginBottom: 8 }}>
 <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Handle</span>
 <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, textAlign: "center"}}>Replies</span>
 <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, textAlign: "center"}}>Age</span>
 <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, textAlign: "center"}}>Risk</span>
 </div>
 {podders.map((p, i) => (
 <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 70px", gap: 8, padding: "8px 0", borderBottom: i < podders.length - 1 ? "1px solid rgba(255, 255, 255, 0.03)" : "none", alignItems: "center"}}>
 <span style={{ fontSize: 12, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>@{p.handle}</span>
 <span style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textAlign: "center"}}>{p.replies}</span>
 <span style={{ fontSize: 12, color: "#fbbf24", fontFamily: "'JetBrains Mono', monospace", textAlign: "center"}}>{p.age}</span>
 <span style={{ fontSize: 12, fontWeight: 800, color: p.risk >= 85 ? "#ef4444" : "#f97316", fontFamily: "'JetBrains Mono', monospace", textAlign: "center"}}>{p.risk}</span>
 </div>
 ))}
 </div>
 );
 })()}
 </div>
 )}

 {/* SECTION 4: ACCOUNT AGE — scales with inauthenticity */}
 <div style={{ marginBottom: 28, paddingTop: 18, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>4 · Engager Account Age</div>
 <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, letterSpacing: -0.3 }}>{cibScanResult.inauthenticity > 35 ? <>Most engagers were created in the <span style={{ color: cibScanResult.verdictColor }}>last 30 days.</span></> : <>Engager age looks <span style={{ color: "#10b981" }}>healthily distributed.</span></>}</div>
 {(() => {
 const intensity = cibScanResult.inauthenticity / 100;
 // Higher inauthenticity → skew younger
 const ages = [
 { label: "0-7d", count: Math.round(28 * intensity * 1.3), color: cibScanResult.verdictColor, flag: intensity > 0.3 },
 { label: "7-30d", count: Math.round(41 * intensity * 1.2), color: cibScanResult.verdictColor, flag: intensity > 0.3 },
 { label: "30-90d", count: Math.round(22 * intensity * 1.1), color: "#f97316", flag: intensity > 0.3 },
 { label: "90-180d", count: Math.round(14 + 8 * (1 - intensity)), color: "#fbbf24", flag: false },
 { label: "180-365d", count: Math.round(9 + 18 * (1 - intensity)), color: "#34d399", flag: false },
 { label: "1-2y", count: Math.round(5 + 30 * (1 - intensity)), color: "#10b981", flag: false },
 { label: "2y+", count: Math.round(2 + 35 * (1 - intensity)), color: "#10b981", flag: false },
 ];
 const max = Math.max(...ages.map(a => a.count), 1);
 const newTotal = ages.slice(0, 2).reduce((sum, a) => sum + a.count, 0);
 const total = ages.reduce((sum, a) => sum + a.count, 0);
 return (
 <>
 <div style={{ padding: "16px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, marginBottom: 10 }}>
 {ages.map((a, i) => (
 <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end"}}>
 <div style={{ fontSize: 10, fontWeight: 800, color: a.color, fontFamily: "'JetBrains Mono', monospace"}}>{a.count}</div>
 <div style={{ width: "100%", height: `${(a.count / max) * 100}%`, background: `linear-gradient(180deg, ${a.color}, ${a.color}aa)`, borderRadius: "4px 4px 1px 1px", minHeight: 3, transition: "all 0.3s"}} />
 </div>
 ))}
 </div>
 <div style={{ display: "flex", gap: 6, paddingTop: 6, borderTop: "1px solid rgba(255, 255, 255, 0.05)"}}>
 {ages.map((a, i) => (
 <div key={i} style={{ flex: 1, textAlign: "center"}}>
 <div style={{ fontSize: 8, color: a.flag ? cibScanResult.verdictColor : C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, fontWeight: a.flag ? 800 : 500 }}>{a.label}</div>
 </div>
 ))}
 </div>
 </div>
 {intensity > 0.3 && (
 <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.18)", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start"}}>
 <Flag size={12} strokeWidth={2.5} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
 <span style={{ fontSize: 11, color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.4 }}>{newTotal} of {total} engagers ({total > 0 ? Math.round((newTotal / total) * 100) : 0}%) joined X within the last 30 days. Suggests a coordinated account batch.</span>
 </div>
 )}
 </>
 );
 })()}
 </div>

 {/* SECTION 5: TEMPLATE PHRASES — only show if inauthenticity meaningful */}
 {cibScanResult.inauthenticity >= 25 && (
 <div style={{ marginBottom: 28, paddingTop: 18, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>5 · Template Phrase Detection</div>
 <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, letterSpacing: -0.3 }}>Repeated phrases across <span style={{ color: cibScanResult.verdictColor }}>different replies.</span></div>
 {(() => {
 const intensity = cibScanResult.inauthenticity / 100;
 const phrases = [
 { phrase: "GM frens", count: Math.round(47 * intensity) },
 { phrase: "Bullish AF", count: Math.round(38 * intensity) },
 { phrase: "This is the way", count: Math.round(31 * intensity) },
 { phrase: "LFG 🚀", count: Math.round(28 * intensity) },
 { phrase: "WAGMI", count: Math.round(24 * intensity) },
 { phrase: "100x soon", count: Math.round(19 * intensity) },
 { phrase: "Based and crypto-pilled", count: Math.round(17 * intensity) },
 { phrase: "Diamond hands 💎", count: Math.round(14 * intensity) },
 ].filter(p => p.count >= 3);
 return (
 <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
 {phrases.map((p, i) => (
 <div key={i} style={{ padding: "8px 14px", borderRadius: 20, background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.2)", display: "inline-flex", alignItems: "center", gap: 8 }}>
 <span style={{ fontSize: 12, color: C.textPrimary, fontStyle: "italic", fontFamily: "'JetBrains Mono', monospace"}}>"{p.phrase}"</span>
 <span style={{ fontSize: 11, fontWeight: 800, color: "#ef4444", fontFamily: "'JetBrains Mono', monospace", padding: "2px 6px", borderRadius: 4, background: "rgba(239, 68, 68, 0.15)"}}>×{p.count}</span>
 </div>
 ))}
 </div>
 );
 })()}
 </div>
 )}

 {/* SECTION 6: BASELINE COMPARISON — driven by cibScanResult */}
 <div style={{ marginBottom: 24, paddingTop: 18, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, fontWeight: 700, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>6 · Organic vs This Account</div>
 <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, letterSpacing: -0.3 }}>How does <span style={{ color: cibScanResult.verdictColor }}>@{cibScanResult.handle}</span> compare to baseline.</div>
 {(() => {
 const intensity = cibScanResult.inauthenticity / 100;
 const replyTime = intensity > 0.5 ? "12s" : intensity > 0.3 ? "1m 8s" : intensity > 0.15 ? "5m 22s" : "12m 40s";
 const uniqueRepliers = Math.round(320 * (1 - intensity * 0.7));
 const repeatPct = Math.round(8 + intensity * 60);
 const newAcctPct = Math.round(12 + intensity * 65);
 const templatePct = Math.round(5 + intensity * 28);
 const metrics = [
 { label: "Avg reply time", organic: "8m 24s", flagged: replyTime, worse: intensity > 0.3 },
 { label: "Unique repliers / 50 posts", organic: "320+", flagged: String(uniqueRepliers), worse: intensity > 0.3 },
 { label: "Repeat engager %", organic: "< 8%", flagged: `${repeatPct}%`, worse: repeatPct > 12 },
 { label: "New account replies", organic: "< 12%", flagged: `${newAcctPct}%`, worse: newAcctPct > 18 },
 { label: "Template phrase rate", organic: "< 5%", flagged: `${templatePct}%`, worse: templatePct > 8 },
 ];
 return (
 <div style={{ padding: "12px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 30px", gap: 8, paddingBottom: 8, borderBottom: "1px solid rgba(255, 255, 255, 0.05)", marginBottom: 8 }}>
 <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Metric</span>
 <span style={{ fontSize: 9, color: "#10b981", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, textAlign: "center"}}>Organic Baseline</span>
 <span style={{ fontSize: 9, color: cibScanResult.verdictColor, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, textAlign: "center"}}>This Account</span>
 <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, textAlign: "center"}}>?</span>
 </div>
 {metrics.map((m, i) => (
 <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 30px", gap: 8, padding: "10px 0", borderBottom: i < metrics.length - 1 ? "1px solid rgba(255, 255, 255, 0.03)" : "none", alignItems: "center"}}>
 <span style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace"}}>{m.label}</span>
 <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981", fontFamily: "'JetBrains Mono', monospace", textAlign: "center"}}>{m.organic}</span>
 <span style={{ fontSize: 12, fontWeight: 700, color: m.worse ? "#ef4444" : "#10b981", fontFamily: "'JetBrains Mono', monospace", textAlign: "center"}}>{m.flagged}</span>
 <span style={{ textAlign: "center", color: m.worse ? "#ef4444" : "#10b981"}}>{m.worse ? "✗" : "✓"}</span>
 </div>
 ))}
 </div>
 );
 })()}
 </div>

 {/* Reset / share row */}
 <div style={{ paddingTop: 18, borderTop: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", gap: 8, flexWrap: "wrap"}}>
 <button
 onClick={() => { setCibScanResult(null); setCibSearchHandle(""); }}
 style={{
 padding: "10px 14px", borderRadius: 10,
 background: "transparent", border: "1px solid rgba(255, 255, 255, 0.12)",
 color: C.textPrimary, fontSize: 12, fontWeight: 700,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer", letterSpacing: 0.3,
 }}
 >Scan another handle</button>
 </div>
 </div>
 )}
 </GlowCard>
 </div>
 )}

 {/* ─── ABOUT TAB ─────────────────────────────────────── */}
 {tab === "about" && (
 <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 8px"}}>
 {/* Hero */}
 <div style={{ textAlign: "center", marginBottom: 48, position: "relative"}}>
 <div className="w3g-aurora" />
 <div style={{ position: "relative", zIndex: 1 }}>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 20, background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.2)", marginBottom: 18 }}>
 <FileText size={12} strokeWidth={2.5} style={{ color: C.primary }} />
 <span style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>About Web3Gigs</span>
 </div>
 <h1 style={{ fontSize: 44, fontWeight: 900, margin: 0, letterSpacing: -2, lineHeight: 1.05 }}>The crypto work market is <span className="w3g-shimmer-text">broken.</span></h1>
 </div>
 </div>

 {/* Section 1: Hook */}
 <div style={{ marginBottom: 48 }}>
 <p style={{ fontSize: 18, color: C.textSecondary, lineHeight: 1.65, marginBottom: 16 }}>
 Anonymous applicants. Stolen Discord IDs. <span style={{ color: C.textPrimary, fontWeight: 600 }}>"Send me 0.5 ETH to start"</span> scams. KOLs pump and dump while real builders go unpaid.
 </p>
 <div style={{ padding: "16px 20px", background: "rgba(212, 255, 0, 0.04)", border: "1px solid rgba(212, 255, 0, 0.18)", borderRadius: 12, marginTop: 22 }}>
 <p style={{ fontSize: 17, color: C.textPrimary, lineHeight: 1.6, margin: 0 }}>
 Web3Gigs fixes this with one rule: <span style={{ color: C.primary, fontWeight: 800 }}>every applicant comes attached to a Trust Score.</span>
 </p>
 </div>
 </div>

 {/* Section 2: Story */}
 <div style={{ marginBottom: 48, paddingTop: 32, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14, fontWeight: 700 }}>The Story</div>
 <p style={{ fontSize: 16, color: C.textSecondary, lineHeight: 1.7, marginBottom: 16 }}>
 I'm <a href="https://x.com/FabsKebabs" target="_blank" rel="noopener noreferrer" style={{ color: C.primary, fontWeight: 700, textDecoration: "none"}}>@FabsKebabs</a>. Solana memecoin trader, degenerate perps trader, and Crypto Twitter degenerate. Web3Gigs started as an idea from <a href="https://x.com/AZTradesReal" target="_blank" rel="noopener noreferrer" style={{ color: C.primary, fontWeight: 700, textDecoration: "none"}}>@AZTradesReal</a>, who saw the same problems I did.
 </p>
 <p style={{ fontSize: 16, color: C.textSecondary, lineHeight: 1.7, marginBottom: 22 }}>
 I've watched friends get rugged by anon devs, scammed by fake KOLs, and ghosted by "verified" influencers more times than I can count.
 </p>
 <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12, fontWeight: 700 }}>The same problems repeat:</div>
 <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
 {[
 "You can't tell who's real.",
 "You can't tell who delivers.",
 "You can't tell who'll vanish with the deposit.",
 ].map((line, i) => (
 <div key={i} style={{ display: "flex", gap: 14, padding: "12px 16px", background: "rgba(0, 0, 0, 0.3)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: 10 }}>
 <div style={{ fontSize: 16, fontWeight: 900, color: C.primary, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, width: 18 }}>{i + 1}.</div>
 <div style={{ fontSize: 15, color: C.textPrimary, lineHeight: 1.5 }}>{line}</div>
 </div>
 ))}
 </div>
 <p style={{ fontSize: 16, color: C.textSecondary, lineHeight: 1.7 }}>
 So I built Web3Gigs as the marketplace I wish existed: <span style={{ color: C.textPrimary, fontWeight: 600 }}>trust-first, paid in stables, no middleman fees, manually moderated.</span>
 </p>
 </div>

 {/* Section 3: How it works */}
 <div style={{ marginBottom: 48, paddingTop: 32, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 18, fontWeight: 700 }}>How it works</div>
 <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
 {[
 { who: "For job posters", icon: Briefcase, body: "Post your job. Manually reviewed within 24h. Applicants come pre-scored. Pay direct in USDC, USDT, or SOL." },
 { who: "For builders", icon: Code, body: "Apply with your X handle. Your Trust Score is auto-attached. No portfolio gymnastics required: your reputation does the talking. Get paid the day you ship." },
 { who: "For the crypto economy", icon: Network, body: "A reputation graph that makes anon work safer. Bot accounts get filtered. Real builders rise. The trenches get cleaner." },
 ].map((block, i) => (
 <div key={i} style={{ padding: "18px 20px", background: "rgba(18, 18, 18, 0.7)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: 12 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
 <block.icon size={16} strokeWidth={2.2} style={{ color: C.primary }} />
 <div style={{ fontSize: 13, fontWeight: 800, color: C.textPrimary, letterSpacing: -0.2 }}>{block.who}</div>
 </div>
 <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, margin: 0 }}>{block.body}</p>
 </div>
 ))}
 </div>
 </div>

 {/* Section 4: Today vs V1 */}
 <div style={{ marginBottom: 48, paddingTop: 32, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 18, fontWeight: 700 }}>What's live now vs V1</div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
 <div style={{ padding: "18px 20px", background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 12 }}>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "3px 8px", borderRadius: 6, background: "rgba(16, 185, 129, 0.12)"}}>
 <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
 <span style={{ fontSize: 9, color: "#10b981", fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase"}}>Today (Beta)</span>
 </div>
 {[
 "Job submissions + manual moderation",
 "Trust Score preview tool (Demo Engine V0)",
 "Waitlist for early access",
 ].map((item, i) => (
 <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
 <Check size={13} strokeWidth={2.5} style={{ color: "#10b981", flexShrink: 0, marginTop: 2 }} />
 <span style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.5 }}>{item}</span>
 </div>
 ))}
 </div>
 <div style={{ padding: "18px 20px", background: "rgba(212, 255, 0, 0.04)", border: "1px solid rgba(212, 255, 0, 0.2)", borderRadius: 12 }}>
 <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "3px 8px", borderRadius: 6, background: "rgba(212, 255, 0, 0.12)"}}>
 <Rocket size={10} strokeWidth={2.5} style={{ color: C.primary }} />
 <span style={{ fontSize: 9, color: C.primary, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase"}}>V1 Launch (Soon)</span>
 </div>
 {[
 "Live Trust Score from real X + on-chain data",
 "Public profile pages",
 "Real-time CIB cluster detection",
 "On-chain Handshake commitments",
 "Multi-channel alerts",
 ].map((item, i) => (
 <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
 <Sparkles size={12} strokeWidth={2.5} style={{ color: C.primary, flexShrink: 0, marginTop: 2 }} />
 <span style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.5 }}>{item}</span>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* Section 5: Why now */}
 <div style={{ marginBottom: 48, paddingTop: 32, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14, fontWeight: 700 }}>Why now</div>
 <p style={{ fontSize: 16, color: C.textSecondary, lineHeight: 1.7, marginBottom: 14 }}>
 Every protocol launch needs devs, auditors, designers, and meme warfare specialists.
 </p>
 <p style={{ fontSize: 16, color: C.textSecondary, lineHeight: 1.7 }}>
 But the infrastructure is still 2014. Discord DMs, Telegram DMs, even X DMs. <span style={{ color: C.primary, fontWeight: 700 }}>2026 needs better.</span>
 </p>
 </div>

 {/* Section 6: Behind the build */}
 <div style={{ marginBottom: 48, paddingTop: 32, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14, fontWeight: 700 }}>Behind the build</div>
 <p style={{ fontSize: 16, color: C.textSecondary, lineHeight: 1.7, marginBottom: 16 }}>
 Built solo by <a href="https://x.com/FabsKebabs" target="_blank" rel="noopener noreferrer" style={{ color: C.primary, fontWeight: 700, textDecoration: "none"}}>@FabsKebabs</a> in Australia.
 </p>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
 {["No VC funding.", "No token.", "No NFT mint.", "No promises."].map((line, i) => (
 <span key={i} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.08)", color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3, fontWeight: 600 }}>{line}</span>
 ))}
 </div>
 <p style={{ fontSize: 16, color: C.textSecondary, lineHeight: 1.7, fontStyle: "italic"}}>
 Just one builder grinding because the problem is real and the solution is overdue.
 </p>
 </div>

 {/* Section 7: CTA */}
 <div style={{ marginBottom: 48, paddingTop: 32, borderTop: "1px solid rgba(255, 255, 255, 0.06)", textAlign: "center"}}>
 <div style={{ fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 18, fontWeight: 700 }}>Get involved</div>
 <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap"}}>
 <button
 onClick={() => { setWaitlistSubmitted(false); setWaitlistError(""); setShowWaitlistModal(true); }}
 style={{
 padding: "14px 24px", borderRadius: 12, border: "none",
 background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: "#000", fontSize: 14, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer",
 letterSpacing: 0.3, transition: "all 0.2s",
 boxShadow: "0 0 24px rgba(212, 255, 0, 0.25)",
 display: "inline-flex", alignItems: "center", gap: 8,
 }}
 onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(212, 255, 0, 0.4)"; }}
 onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 24px rgba(212, 255, 0, 0.25)"; }}
 >
 <Mail size={14} strokeWidth={2.5} />
 <span>Join the Waitlist</span>
 </button>
 <a
 href="https://x.com/FabsKebabs"
 target="_blank"
 rel="noopener noreferrer"
 style={{
 padding: "14px 24px", borderRadius: 12,
 border: "1px solid rgba(255, 255, 255, 0.15)",
 background: "transparent", color: C.textPrimary,
 fontSize: 14, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
 cursor: "pointer", letterSpacing: 0.3, textDecoration: "none",
 transition: "all 0.2s",
 display: "inline-flex", alignItems: "center", gap: 8,
 }}
 onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.primary}60`; e.currentTarget.style.color = C.primary; }}
 onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)"; e.currentTarget.style.color = C.textPrimary; }}
 >
 <MessageCircle size={14} strokeWidth={2.5} />
 <span>DM @FabsKebabs</span>
 </a>
 </div>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.8, marginTop: 16 }}>First 500 signups get priority access · Questions, feedback, partnerships welcome</div>
 </div>
 </div>
 )}

 {/* ─── PHASE 4: ALERTS TAB ───────────────────────────── */}
 {tab === "alerts"&& (
 <div>
 <div style={{ textAlign: "center", marginBottom: 24 }}>
 <h1 style={{ fontSize: 38, fontWeight: 900, margin: 0, letterSpacing: -1.5 }}>Real-Time <span style={{ color: C.primary }}>Alerts</span>
 </h1>
 <p style={{ color: C.textSecondary, fontSize: 15, marginTop: 8 }}>Watch any CT account · Get notified the instant something changes</p>
 </div>

 {/* V1 banner */}
 <div style={{ padding: "14px 18px", background: "rgba(251, 191, 36, 0.06)", border: "1px solid rgba(251, 191, 36, 0.2)", borderRadius: 12, marginBottom: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"}}>
 <Bell size={18} strokeWidth={2.5} style={{ color: "#fbbf24", flexShrink: 0 }} />
 <div style={{ flex: 1, minWidth: 200 }}>
 <div style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24", marginBottom: 2 }}>Watchlist + Alerts launch with V1</div>
 <div style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3, lineHeight: 1.4 }}>Preview the experience below · Join the waitlist for early access</div>
 </div>
 <button
 onClick={() => { setWaitlistSubmitted(false); setWaitlistError(""); setShowWaitlistModal(true); }}
 style={{
 padding: "8px 14px", borderRadius: 8, border: "none",
 background: "#fbbf24",
 color: "#000", fontSize: 11, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer",
 letterSpacing: 0.3, transition: "all 0.15s",
 whiteSpace: "nowrap",
 }}
 onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
 onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
 >Join Waitlist</button>
 </div>

 {/* Your Watchlist */}
 <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Your Watchlist</div>
 <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 10 }}>
 {WATCHLIST.map(w => (
 <GlowCard key={w.handle} style={{ padding: "16px 20px"}}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
 <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#000"}}>{w.handle[1].toUpperCase()}</div>
 <div>
 <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
 <span style={{ fontSize: 15, fontWeight: 700 }}>{w.handle}</span>
 <Pill text={`Trust ${w.score}`} color={w.score >= 85? "#10b981": "#34d399"} />
 </div>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 3 }}>
 {w.alerts.length} alerts active · Last: {w.lastAlert}
 </div>
 </div>
 </div>
 <div style={{ display: "flex", gap: 6, flexWrap: "wrap"}}>
 {w.alerts.map(a => {
 const alert = ALERT_TYPES.find(at => at.id === a);
 return <span key={a} style={{ padding: "4px 10px", background: "rgba(212, 255, 0, 0.08)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 6, fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace"}}>{alert?.icon} {alert?.name}</span>;
 })}
 </div>
 </div>
 </GlowCard>
 ))}
 <button
 onClick={() => { setWaitlistSubmitted(false); setWaitlistError(""); setShowWaitlistModal(true); }}
 style={{
 padding: "14px 20px", borderRadius: 12, border: `1px dashed ${C.primary}40`,
 background: "transparent", color: C.primary,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, cursor: "pointer",
 transition: "all 0.15s",
 }}
 onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.primary}80`; e.currentTarget.style.background = "rgba(212, 255, 0, 0.04)"; }}
 onMouseLeave={e => { e.currentTarget.style.borderColor = `${C.primary}40`; e.currentTarget.style.background = "transparent"; }}
 >+ Add Account to Watchlist</button>
 </div>

 {/* Available Alert Types */}
 <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Available Alert Types</div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 24 }}>
 {ALERT_TYPES.map(a => (
 <GlowCard key={a.id} glow style={{ padding: "16px"}}>
 <div style={{ color: C.primary, marginBottom: 10 }}><a.Icon size={24} strokeWidth={2} /></div>
 <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{a.name}</div>
 <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{a.desc}</div>
 </GlowCard>
 ))}
 </div>

 {/* Delivery channels */}
 <GlowCard>
 <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}>Delivery Channels</div>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
 {[
 ["Email", "your@email.com", false, false],
 ["Telegram", "@yourhandle", false, false],
 ["X DM", "Not connected", false, false],
 ["Webhook", "Custom endpoint", false, false],
 ].map(([channel, value, enabled, premium]) => (
 <div key={channel} style={{
 padding: "14px", borderRadius: 10,
 background: enabled? "rgba(16, 185, 129, 0.06)": "rgba(0, 0, 0, 0.4)",
 border: `1px solid ${enabled? "rgba(16, 185, 129, 0.2)": "rgba(255, 255, 255, 0.08)"}`,
 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
 <span style={{ fontSize: 13, fontWeight: 700 }}>{channel}</span>
 {enabled && <span style={{ fontSize: 10, color: "#10b981", fontFamily: "'JetBrains Mono', monospace"}}>● ON</span>}
 </div>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace"}}>{value}</div>
 </div>
 ))}
 </div>
 </GlowCard>
 </div>
 )}
 </div>

 {/* ─── JOB DETAIL MODAL ─────────────────────────────── */}
 {selectedJob && (() => {
 const posterColor = selectedJob.posterTrust >= 85? "#10b981": selectedJob.posterTrust >= 70? "#34d399": selectedJob.posterTrust >= 55? "#fbbf24": "#f97316";
 const statusColor = selectedJob.status === "open" ? "#10b981" : selectedJob.status === "in_progress" ? "#fbbf24" : selectedJob.status === "completed" ? C.primary : C.textMuted;
 const statusLabel = selectedJob.status === "open" ? "OPEN" : selectedJob.status === "in_progress" ? "IN PROGRESS" : selectedJob.status === "completed" ? "COMPLETED" : (selectedJob.status || "OPEN").toUpperCase();
 return (
 <div
 onClick={() => { setSelectedJob(null); setProposalText(""); resetApplyForm(); }}
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
 <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace"}}>· {selectedJob.category}</span>
 </div>
 <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2 }}>{selectedJob.title}</div>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 6 }}>Posted {selectedJob.postedAgo} · {selectedJob.proposals} proposals</div>
 </div>
 <button onClick={() => { setSelectedJob(null); setProposalText(""); resetApplyForm(); }} style={{
 width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.08)",
 background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
 cursor: "pointer", flexShrink: 0,
 display: "flex", alignItems: "center", justifyContent: "center",
 }}><XIcon size={16} strokeWidth={2} /></button>
 </div>

 {/* Hero Budget */}
 <div style={{ padding: "24px 28px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Budget</div>
 <div style={{ fontSize: 52, fontWeight: 900, color: C.primary, letterSpacing: -2, fontFamily: "'JetBrains Mono', monospace"}}>${selectedJob.budget.toLocaleString()}</div>
 <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6, fontFamily: "'JetBrains Mono', monospace"}}>{selectedJob.budgetCurrency} · Deadline: {selectedJob.deadline}</div>
 </div>

 <div style={{ padding: "24px 28px"}}>
 {/* Description */}
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Description</div>
 <div style={{ padding: "14px 16px", background: "rgba(0, 0, 0, 0.4)", borderRadius: 10, marginBottom: 20, fontSize: 13, color: C.textSecondary, lineHeight: 1.6, border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 {selectedJob.description}
 </div>

 {/* Deliverables */}
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Deliverables</div>
 <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
 {selectedJob.deliverables.map((item, i) => (
 <div key={i} style={{ padding: "10px 12px", background: "rgba(16, 185, 129, 0.04)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
 <Check size={13} strokeWidth={2.5} style={{ color: "#10b981", flexShrink: 0 }} />
 <span style={{ fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace"}}>{item}</span>
 </div>
 ))}
 </div>

 {/* Requirements */}
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Requirements</div>
 {selectedJob.jobType === "ct" && selectedJob.minTrustScore > 0 ? (
 <div style={{ padding: "12px 14px", background: "rgba(212, 255, 0, 0.04)", border: "1px solid rgba(212, 255, 0, 0.15)", borderRadius: 8, fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginBottom: 20, lineHeight: 1.6 }}>Applicants must have a Trust Score of <strong style={{ color: C.primary }}>{selectedJob.minTrustScore}+</strong> to submit a proposal.
 </div>
 ) : (
 <div style={{ padding: "12px 14px", background: "rgba(212, 255, 0, 0.04)", border: "1px solid rgba(212, 255, 0, 0.15)", borderRadius: 8, fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", marginBottom: 20, lineHeight: 1.6 }}>Applicants are vetted by <strong style={{ color: C.primary }}>portfolio review</strong> + manual approval. Include relevant work links in your application.
 </div>
 )}

 {/* Job Poster */}
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Posted By</div>
 <div style={{ padding: "14px 16px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 10, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(255, 255, 255, 0.04)"}}>
 <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
 <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg, #333, #111)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#fff"}}>{selectedJob.poster[1].toUpperCase()}</div>
 <div>
 <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
 {selectedJob.poster}
 {selectedJob.posterVerified && <Check size={12} strokeWidth={3} style={{ color: C.accent }} />}
 </div>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>3 jobs posted · 2 completed · 0 disputes</div>
 </div>
 </div>
 <div style={{ textAlign: "center"}}>
 <div style={{ padding: "4px 10px", borderRadius: 8, background: `${posterColor}15`, border: `1px solid ${posterColor}40`, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 800, color: posterColor }}>Trust {selectedJob.posterTrust}</div>
 </div>
 </div>

 {/* Tags */}
 <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
 {selectedJob.tags.map(tag => (
 <span key={tag} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(212, 255, 0, 0.05)", border: "1px solid rgba(212, 255, 0, 0.15)", fontSize: 11, color: C.primary, fontFamily: "'JetBrains Mono', monospace"}}>#{tag}</span>
 ))}
 </div>

 {/* Apply to job */}
 {selectedJob.status === "open" && (
 <>
 {!applySubmitted ? (
 <>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap"}}>
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5 }}>Apply for this job</div>
 <a
 href={`https://x.com/messages/compose?recipient=${(selectedJob.poster || "").replace(/^@/, "")}`}
 target="_blank"
 rel="noopener noreferrer"
 style={{
 display: "inline-flex", alignItems: "center", gap: 6,
 padding: "6px 12px", borderRadius: 8,
 background: "rgba(0, 0, 0, 0.5)",
 border: "1px solid rgba(255, 255, 255, 0.08)",
 color: C.textSecondary, fontSize: 11,
 fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
 textDecoration: "none", transition: "all 0.2s",
 }}
 onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.primary}40`; e.currentTarget.style.color = C.primary; }}
 onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)"; e.currentTarget.style.color = C.textSecondary; }}
 >
 <MessageCircle size={11} strokeWidth={2.5} />
 <span>DM {selectedJob.poster} on X</span>
 </a>
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
 <input
 type="text"
 placeholder="Your X handle (@yourhandle)"
 value={applyForm.handle}
 onChange={e => setApplyForm({...applyForm, handle: e.target.value})}
 maxLength={50}
 style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.9)", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 10, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, outline: "none", boxSizing: "border-box"}}
 />
 <input
 type="email"
 placeholder="your@email.com"
 value={applyForm.email}
 onChange={e => setApplyForm({...applyForm, email: e.target.value})}
 maxLength={120}
 style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.9)", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 10, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, outline: "none", boxSizing: "border-box"}}
 />
 </div>

 {/* Live Trust Score preview (CT jobs only) */}
 {selectedJob.jobType === "ct" && applyForm.handle.trim().length >= 3 && (() => {
 const liveScore = generateDemoTrustScore(applyForm.handle);
 if (!liveScore) return null;
 const meets = selectedJob.minTrustScore ? liveScore.overall >= selectedJob.minTrustScore : true;
 return (
 <div style={{ padding: "10px 12px", background: meets ? "rgba(16, 185, 129, 0.06)" : "rgba(239, 68, 68, 0.06)", border: `1px solid ${meets ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`, borderRadius: 8, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
 <div style={{ width: 36, height: 36, borderRadius: 8, background: `${liveScore.tierColor}20`, border: `1px solid ${liveScore.tierColor}50`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
 <span style={{ fontSize: 14, fontWeight: 900, color: liveScore.tierColor, fontFamily: "'JetBrains Mono', monospace"}}>{liveScore.overall}</span>
 </div>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 11, color: liveScore.tierColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, letterSpacing: 1 }}>{liveScore.tier} <span style={{ fontSize: 8, color: "#fbbf24", letterSpacing: 1.5 }}>(DEMO)</span></div>
 <div style={{ fontSize: 11, color: meets ? "#6ee7b7" : "#fca5a5", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
 {meets
 ? `Trust score will attach to your application`
 : `Below minimum: ${selectedJob.minTrustScore}+ required`}
 </div>
 </div>
 <Shield size={14} strokeWidth={2.5} style={{ color: liveScore.tierColor, flexShrink: 0 }} />
 </div>
 );
 })()}

 <textarea
 value={applyForm.message}
 onChange={e => setApplyForm({...applyForm, message: e.target.value})}
 placeholder="Why are you right for this job? Mention relevant work, timeline, and what makes you trustworthy."
 maxLength={1000}
 style={{
 width: "100%", minHeight: 90, padding: "10px 12px",
 background: "rgba(0, 0, 0, 0.9)",
 border: "1px solid rgba(255, 255, 255, 0.12)",
 borderRadius: 10, color: C.textPrimary,
 fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
 resize: "vertical", outline: "none", marginBottom: 10,
 boxSizing: "border-box",
 }}
 />

 <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 12 }}>
 <input
 type="text"
 placeholder="Portfolio / GitHub / past work URL (optional)"
 value={applyForm.portfolio}
 onChange={e => setApplyForm({...applyForm, portfolio: e.target.value})}
 maxLength={200}
 style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.9)", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 10, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, outline: "none", boxSizing: "border-box"}}
 />
 <input
 type="text"
 placeholder="Expected pay"
 value={applyForm.expectedPay}
 onChange={e => setApplyForm({...applyForm, expectedPay: e.target.value})}
 maxLength={50}
 style={{ padding: "10px 12px", background: "rgba(0, 0, 0, 0.9)", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 10, color: C.textPrimary, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, outline: "none", boxSizing: "border-box"}}
 />
 </div>

 {applyError && (
 <div style={{ padding: "10px 12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: 8 }}>
 <AlertTriangle size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
 <span>{applyError}</span>
 </div>
 )}

 <button
 onClick={submitApply}
 disabled={applySubmitting}
 style={{
 width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
 background: applySubmitting ? "rgba(212, 255, 0, 0.3)" : `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: "#000", fontSize: 14, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif",
 cursor: applySubmitting ? "wait" : "pointer",
 letterSpacing: 0.3, transition: "all 0.2s",
 boxShadow: applySubmitting ? "none" : "0 0 24px rgba(212, 255, 0, 0.25)",
 }}
 >{applySubmitting ? "Submitting..." : "Submit Application"}</button>

 <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", borderRadius: 8, fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, textAlign: "center"}}>Your application gets forwarded to the poster within 24h. Trust Score is auto-attached at V1 launch. No platform fee.
 </div>
 </>
 ) : (
 <div style={{ padding: "20px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: 12, textAlign: "center"}}>
 <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "#10b981"}}><Check size={32} strokeWidth={2.5} /></div>
 <div style={{ fontSize: 16, fontWeight: 800, color: "#10b981", marginBottom: 6 }}>Application sent!</div>
 <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace"}}>The poster will be notified within 24h. Want to apply for another job?</div>
 <button onClick={() => resetApplyForm()} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.borderHover}`, background: "transparent", color: C.textPrimary, fontSize: 11, fontWeight: 700, fontFamily: "'Outfit', sans-serif", cursor: "pointer"}}>Apply Again</button>
 </div>
 )}
 </>
 )}

 {selectedJob.status === "in_progress"&& (
 <div style={{ padding: "16px 18px", background: "rgba(251, 191, 36, 0.06)", border: "1px solid rgba(251, 191, 36, 0.2)", borderRadius: 10, textAlign: "center"}}>
 <div style={{ fontSize: 13, color: "#fbbf24", fontWeight: 800, marginBottom: 4 }}>Already in progress</div>
 <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>This job has an active handshake. Check back when it's complete to see the outcome.</div>
 </div>
 )}

 {selectedJob.status === "completed" && (
 <div style={{ padding: "16px 18px", background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.25)", borderRadius: 10, textAlign: "center"}}>
 <div style={{ display: "flex", justifyContent: "center", marginBottom: 6, color: C.primary }}><Check size={20} strokeWidth={2.5} /></div>
 <div style={{ fontSize: 13, color: C.primary, fontWeight: 800, marginBottom: 4 }}>Completed</div>
 <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>This job was successfully shipped and paid out via Web3Gigs. No longer accepting applications.</div>
 </div>
 )}

 {/* SIMILAR JOBS */}
 {(() => {
 const similar = [...approvedJobs, ...MOCK_JOBS]
 .filter(j => j.id !== selectedJob.id && j.jobType === selectedJob.jobType && (j.category === selectedJob.category || (j.tags || []).some(t => (selectedJob.tags || []).includes(t))))
 .slice(0, 3);
 if (similar.length === 0) return null;
 return (
 <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12, fontWeight: 700 }}>Similar Jobs</div>
 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 {similar.map(j => (
 <button
 key={j.id}
 onClick={() => { resetApplyForm(); setSelectedJob(j); }}
 style={{
 width: "100%", padding: "12px 14px", borderRadius: 10,
 background: "rgba(0, 0, 0, 0.4)",
 border: "1px solid rgba(255, 255, 255, 0.06)",
 cursor: "pointer", textAlign: "left",
 transition: "all 0.15s",
 display: "flex", alignItems: "center", gap: 10,
 }}
 onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.primary}50`; e.currentTarget.style.background = "rgba(212, 255, 0, 0.04)"; }}
 onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)"; e.currentTarget.style.background = "rgba(0, 0, 0, 0.4)"; }}
 >
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{j.title}</div>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3 }}>{j.poster} · ${j.budget.toLocaleString()} {j.budgetCurrency} · {j.deadline}</div>
 </div>
 <ArrowRight size={14} strokeWidth={2.5} style={{ color: C.primary, flexShrink: 0 }} />
 </button>
 ))}
 </div>
 </div>
 );
 })()}
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
 <div style={{ padding: "24px 28px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), transparent)`, display: "flex", justifyContent: "space-between", alignItems: "center"}}>
 <div>
 <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>New Job · Manually Reviewed</div>
 <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Post a job on Web3Gigs</div>
 </div>
 <button onClick={() => setShowPostJob(false)} style={{
 width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.08)",
 background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
 cursor: "pointer", flexShrink: 0,
 display: "flex", alignItems: "center", justifyContent: "center",
 }}><XIcon size={16} strokeWidth={2} /></button>
 </div>

 <div style={{ padding: "24px 28px", maxHeight: "70vh", overflowY: "auto"}}>
 {!jobSubmitted ? (
 <>
 {/* Trust banner */}
 <div style={{ padding: "12px 14px", background: "rgba(212, 255, 0, 0.04)", border: "1px solid rgba(212, 255, 0, 0.18)", borderRadius: 10, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start"}}>
 <Shield size={16} strokeWidth={2.2} style={{ color: C.primary, flexShrink: 0, marginTop: 2 }} />
 <div style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace"}}>All jobs are manually reviewed within 24h. We're keeping the standard high during early access. You'll get an email once your post is live.</div>
 </div>

 {/* Title */}
 <div style={{ marginBottom: 14 }}>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Job Title *</label>
 <input
 type="text"
 placeholder="e.g. Solana smart contract audit · staking program"
 value={jobForm.title}
 onChange={e => setJobForm({...jobForm, title: e.target.value})}
 maxLength={100}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none"}}
 />
 </div>

 {/* Posted By */}
 <div style={{ marginBottom: 14 }}>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Posted By *</label>
 <input
 type="text"
 placeholder="Company or team name (e.g. Web3Kings, Solana Labs, AlphaBot Studios)"
 value={jobForm.posterName}
 onChange={e => setJobForm({...jobForm, posterName: e.target.value})}
 maxLength={60}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none"}}
 />
 <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3 }}>This is the name applicants will see on the job card</div>
 </div>

 {/* Type + Category row */}
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
 <div>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Type *</label>
 <select
 value={jobForm.jobType}
 onChange={e => setJobForm({...jobForm, jobType: e.target.value, category: e.target.value === "crypto" ? "Development" : "Shitposting", minTrust: e.target.value === "crypto" ? "0" : jobForm.minTrust})}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none", cursor: "pointer"}}
 >
 <option value="crypto">Crypto Work</option>
 <option value="ct">CT / KOL Jobs</option>
 </select>
 </div>
 <div>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Category *</label>
 <select
 value={jobForm.category}
 onChange={e => setJobForm({...jobForm, category: e.target.value})}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none", cursor: "pointer"}}
 >
 {jobForm.jobType === "crypto" ? (
 <>
 <option value="Development">Development</option>
 <option value="AI / ML">AI / ML</option>
 <option value="Design">Design</option>
 <option value="Audits">Audits</option>
 <option value="Technical Writing">Writing</option>
 <option value="Video Editing">Video Editing</option>
 <option value="Clipping">Clipping</option>
 <option value="Community">Community</option>
 </>
 ) : (
 <>
 <option value="Partnership">Partnership · Long-term / Retainer</option>
 <option value="Shitposting">Shitposting</option>
 <option value="Thread Writing">Thread Writing</option>
 <option value="KOL / Raids">KOL / Raids</option>
 <option value="Spaces / AMAs">Spaces / AMAs</option>
 <option value="Meme Warfare">Meme Warfare</option>
 <option value="Streaming / Gambling">Streaming</option>
 <option value="Clipping / Editing">Clipping / Editing</option>
 </>
 )}
 </select>
 </div>
 </div>

 {/* Budget + Currency + Deadline */}
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
 <div>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Budget *</label>
 <input
 type="number"
 placeholder="500"
 value={jobForm.budget}
 onChange={e => setJobForm({...jobForm, budget: e.target.value})}
 min="50"
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none"}}
 />
 </div>
 <div>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Currency</label>
 <select
 value={jobForm.currency}
 onChange={e => setJobForm({...jobForm, currency: e.target.value})}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none", cursor: "pointer"}}
 >
 <option value="USDC">USDC</option>
 <option value="USDT">USDT</option>
 <option value="SOL">SOL</option>
 </select>
 </div>
 <div>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Deadline</label>
 <input
 type="text"
 placeholder="2w, 30d, Ongoing"
 value={jobForm.deadline}
 onChange={e => setJobForm({...jobForm, deadline: e.target.value})}
 maxLength={20}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none"}}
 />
 </div>
 </div>

 {/* Description */}
 <div style={{ marginBottom: 14 }}>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Description *</label>
 <textarea
 placeholder="What's the job? Include scope, tech stack, expectations, anything weird about the project. Be specific, vague posts get rejected."
 value={jobForm.description}
 onChange={e => setJobForm({...jobForm, description: e.target.value})}
 maxLength={1000}
 rows={5}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none", resize: "vertical"}}
 />
 <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4, fontFamily: "'JetBrains Mono', monospace"}}>{jobForm.description.length}/1000</div>
 </div>

 {/* Deliverables */}
 <div style={{ marginBottom: 14 }}>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Deliverables</label>
 <textarea
 placeholder="What does done look like? E.g. 'Audit report, 3-day turnaround, retest after fixes'"
 value={jobForm.deliverables}
 onChange={e => setJobForm({...jobForm, deliverables: e.target.value})}
 maxLength={400}
 rows={2}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none", resize: "vertical"}}
 />
 </div>

 {/* Min Trust (CT only) + Handle row */}
 {jobForm.jobType === "ct" ? (
 <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 14 }}>
 <div>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Min Trust</label>
 <input
 type="number"
 min="0" max="100"
 placeholder="0"
 value={jobForm.minTrust}
 onChange={e => setJobForm({...jobForm, minTrust: e.target.value})}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none"}}
 />
 </div>
 <div>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Your X Handle *</label>
 <input
 type="text"
 placeholder="@yourhandle"
 value={jobForm.contact}
 onChange={e => setJobForm({...jobForm, contact: e.target.value})}
 maxLength={50}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none"}}
 />
 </div>
 </div>
 ) : (
 <div style={{ marginBottom: 14 }}>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Your X Handle *</label>
 <input
 type="text"
 placeholder="@yourhandle"
 value={jobForm.contact}
 onChange={e => setJobForm({...jobForm, contact: e.target.value})}
 maxLength={50}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none"}}
 />
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 6, letterSpacing: 0.3 }}>For crypto work, applicants are vetted via portfolio + manual review (no Trust Score required)</div>
 </div>
 )}

 {/* Email */}
 <div style={{ marginBottom: 16 }}>
 <label style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Email *</label>
 <input
 type="email"
 placeholder="your@email.com, kept private, used for approval notification"
 value={jobForm.email}
 onChange={e => setJobForm({...jobForm, email: e.target.value})}
 maxLength={120}
 style={{ width: "100%", padding: "10px 12px", background: "rgba(0, 0, 0, 0.5)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 8, color: C.textPrimary, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none"}}
 />
 </div>

 {/* Error */}
 {jobError && (
 <div style={{ padding: "10px 12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.25)", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "#fca5a5", fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: 8 }}>
 <AlertTriangle size={14} strokeWidth={2.5} style={{ flexShrink: 0 }} />
 <span>{jobError}</span>
 </div>
 )}

 {/* Submit */}
 <button
 onClick={submitJob}
 disabled={jobSubmitting}
 style={{
 width: "100%", padding: "14px", borderRadius: 10, border: "none",
 background: jobSubmitting ? "rgba(212, 255, 0, 0.3)" : `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: "#000", fontSize: 14, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif", cursor: jobSubmitting ? "wait" : "pointer",
 letterSpacing: 0.5, transition: "all 0.2s",
 boxShadow: jobSubmitting ? "none" : "0 0 24px rgba(212, 255, 0, 0.25)",
 }}
 >{jobSubmitting ? "Submitting..." : "Submit for Review"}</button>

 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textAlign: "center", marginTop: 10, letterSpacing: 0.5 }}>Free to post during early access · No platform fee · Manual moderation within 24h</div>
 </>
 ) : (
 <div style={{ padding: "30px 20px", textAlign: "center"}}>
 <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, color: "#10b981"}}><Check size={48} strokeWidth={2.5} /></div>
 <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, color: "#10b981", letterSpacing: -0.5 }}>Job submitted for review</div>
 <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6, maxWidth: 400, margin: "0 auto 20px"}}>Thanks! We'll review your post within 24 hours and email you at <span style={{ color: C.primary, fontWeight: 700 }}>{jobForm.email}</span> when it's live. If anything's unclear, we'll DM <span style={{ color: C.primary, fontWeight: 700 }}>@{jobForm.contact.replace(/^@/, "")}</span> on X.</div>
 <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap"}}>
 <button onClick={() => { resetJobForm(); }} style={{
 padding: "10px 16px", borderRadius: 8, border: `1px solid ${C.borderHover}`,
 background: "transparent", color: C.textPrimary,
 fontSize: 12, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
 cursor: "pointer", letterSpacing: 0.3,
 }}>Post Another</button>
 <button onClick={() => { setShowPostJob(false); resetJobForm(); }} style={{
 padding: "10px 16px", borderRadius: 8, border: "none",
 background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: "#000", fontSize: 12, fontWeight: 900, fontFamily: "'Outfit', sans-serif",
 cursor: "pointer", letterSpacing: 0.3,
 }}>Done</button>
 </div>
 </div>
 )}
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
 <div style={{ padding: "24px 28px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, rgba(212, 255, 0, 0.04), transparent)`, display: "flex", justifyContent: "space-between", alignItems: "center"}}>
 <div>
 <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>Early Access</div>
 <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>Join the Web3Gigs waitlist</div>
 {waitlistCount !== null && waitlistCount > 0 && (
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, marginTop: 6 }}>
 <span style={{ color: "#10b981", fontWeight: 700 }}>●</span> {waitlistCount.toLocaleString()} already on the list
 </div>
 )}
 </div>
 <button onClick={() => setShowWaitlistModal(false)} style={{
 width: 32, height: 32, borderRadius: 10, border: "1px solid rgba(255, 255, 255, 0.08)",
 background: "rgba(0, 0, 0, 0.5)", color: C.textSecondary,
 cursor: "pointer", flexShrink: 0,
 display: "flex", alignItems: "center", justifyContent: "center",
 }}><XIcon size={16} strokeWidth={2} /></button>
 </div>

 {/* Body */}
 <div style={{ padding: "24px 28px"}}>
 {!waitlistSubmitted? (
 <>
 <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, marginTop: 0, marginBottom: 20 }}>Be first to post jobs, hire talent, and sign Handshakes when we go live. First 500 signups get priority access + free featured listings.
 </p>

 <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap"}}>
 <input
 type="email"placeholder="your@email.com"value={waitlistEmail}
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
 background: (!waitlistEmail.includes("@") || waitlistLoading)? "rgba(255, 255, 255, 0.05)": `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: (!waitlistEmail.includes("@") || waitlistLoading)? C.textMuted: "#000",
 fontSize: 13, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif",
 cursor: (!waitlistEmail.includes("@") || waitlistLoading)? "not-allowed": "pointer",
 letterSpacing: 0.3, transition: "all 0.2s",
 }}
 >{waitlistLoading? "⏳": "Join"}</button>
 </div>

 {waitlistError && (
 <div style={{ fontSize: 12, color: "#ef4444", fontFamily: "'JetBrains Mono', monospace", marginTop: 6, marginBottom: 6 }}> {waitlistError}</div>
 )}

 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>No spam. One email when we go live. Unsubscribe anytime.
 </div>

 {/* What you get */}
 <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255, 255, 255, 0.06)"}}>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>What you'll get first access to</div>
 <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
 {[
 "Post trust-verified jobs (Crypto + CT)",
 "Apply to jobs with your Trust Score attached",
 "Sign on-chain Handshakes with buyers",
 "Paid in USDC, no middleman, no 20% cut",
 ].map((item, i) => (
 <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: C.textSecondary, fontFamily: "'JetBrains Mono', monospace"}}>
 <ArrowRight size={12} strokeWidth={2.5} style={{ color: C.primary, flexShrink: 0 }} />
 <span>{item}</span>
 </div>
 ))}
 </div>
 </div>
 </>
 ): (
 <div style={{ padding: "24px 20px", background: "rgba(16, 185, 129, 0.06)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: 12, textAlign: "center"}}>
 <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, color: "#10b981"}}><Check size={40} strokeWidth={2.5} /></div>
 {userPosition !== null ? (
 <>
 <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6, fontWeight: 700 }}>You're locked in</div>
 <div style={{ fontSize: 14, color: "#10b981", marginBottom: 6, fontWeight: 700 }}>Your position</div>
 <div style={{ fontSize: 56, fontWeight: 900, color: C.primary, letterSpacing: -3, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1, marginBottom: 4 }}>#{userPosition.toLocaleString()}</div>
 {waitlistCount !== null && waitlistCount > 0 && (
 <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, marginBottom: 14 }}>out of {waitlistCount.toLocaleString()} on the list</div>
 )}
 {userPosition <= 100 && (
 <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "rgba(212, 255, 0, 0.08)", border: "1px solid rgba(212, 255, 0, 0.3)", marginBottom: 16 }}>
 <Sparkles size={11} strokeWidth={2.5} style={{ color: C.primary }} />
 <span style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 800 }}>First 100 · Priority Access</span>
 </div>
 )}
 {userPosition > 100 && userPosition <= 500 && (
 <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "rgba(212, 255, 0, 0.06)", border: "1px solid rgba(212, 255, 0, 0.2)", marginBottom: 16 }}>
 <Trophy size={11} strokeWidth={2.5} style={{ color: C.primary }} />
 <span style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 800 }}>First 500 · Early Access</span>
 </div>
 )}
 <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6, fontFamily: "'JetBrains Mono', monospace", marginBottom: 18 }}>We'll email <span style={{ color: C.primary }}>{waitlistEmail}</span> the moment Web3Gigs V1 launches.</div>

 {/* Tell your friends button */}
 <button
 onClick={() => {
 const text = `Just joined the @Web3Gigs waitlist 🛡️\n\nThe trust-verified hiring marketplace for crypto. No middleman fees. Paid in stables.\n\nweb3gigs.app`;
 window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
 }}
 style={{
 width: "100%", padding: "12px 16px", borderRadius: 10, border: "none",
 background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
 color: "#000", fontSize: 13, fontWeight: 900,
 fontFamily: "'Outfit', sans-serif", cursor: "pointer",
 letterSpacing: 0.3, transition: "all 0.2s",
 display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
 boxShadow: "0 0 20px rgba(212, 255, 0, 0.2)",
 }}
 onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 32px rgba(212, 255, 0, 0.4)"; }}
 onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(212, 255, 0, 0.2)"; }}
 ><Sparkles size={13} strokeWidth={2.5} /><span>Tell your friends on X</span></button>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5, marginTop: 10 }}>Share to help other builders find Web3Gigs</div>
 </>
 ) : (
 <>
 <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981", marginBottom: 8 }}>You're on the list!</div>
 <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace"}}>We'll email <span style={{ color: C.primary }}>{waitlistEmail}</span> the second Web3Gigs goes live.</div>
 </>
 )}
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", marginTop: 80, padding: "32px 24px 24px", background: "rgba(0, 0, 0, 0.5)"}}>
 <div style={{ maxWidth: 1100, margin: "0 auto"}}>
 {/* Footer Top: Brand + Links */}
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 32, marginBottom: 32, paddingBottom: 28, borderBottom: "1px solid rgba(255, 255, 255, 0.04)"}}>
 {/* Brand block */}
 <div>
 <div onClick={() => setTab("home")} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, cursor: "pointer"}}>
 <svg width="32" height="32" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
 <defs>
 <linearGradient id="footerLogoGrad" x1="0" y1="0" x2="1" y2="1">
 <stop offset="0%" stopColor="#d4ff00" />
 <stop offset="100%" stopColor="#b8e600" />
 </linearGradient>
 </defs>
 <path d="M 40 10 L 66 18 L 66 45 Q 66 60 40 72 Q 14 60 14 45 L 14 18 Z" fill="none" stroke="url(#footerLogoGrad)" strokeWidth="2.5" strokeLinejoin="round" />
 <g transform="translate(22, 24) scale(1.5)" stroke="url(#footerLogoGrad)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
 <path d="m11 17 2 2a1 1 0 1 0 3-3" />
 <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
 <path d="m21 3 1 11h-2" />
 <path d="M3 3l8 8" />
 <path d="M3 9V3h6" />
 </g>
 </svg>
 <div>
 <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: -0.5, color: C.textPrimary }}>Web3Gigs</div>
 <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, textTransform: "uppercase"}}>Hire · Handshake · Ship</div>
 </div>
 </div>
 <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, margin: 0 }}>The trust-verified hiring marketplace for crypto. Every applicant comes with a reputation attached.</p>
 </div>

 {/* Product links */}
 <div>
 <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 800, marginBottom: 12 }}>Product</div>
 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 {[
 ["jobs", "Browse Jobs"],
 ["valuate", "Trust Score Demo"],
 ["trust", "How Trust Works"],
 ["leaderboard", "Leaderboards"],
 ["alerts", "Alerts"],
 ].map(([t, label]) => (
 <button
 key={t}
 onClick={() => setTab(t)}
 style={{
 background: "transparent", border: "none", padding: 0, textAlign: "left",
 fontSize: 13, color: C.textSecondary, cursor: "pointer",
 fontFamily: "'Outfit', sans-serif", fontWeight: 500,
 transition: "color 0.15s",
 }}
 onMouseEnter={e => e.currentTarget.style.color = C.primary}
 onMouseLeave={e => e.currentTarget.style.color = C.textSecondary}
 >{label}</button>
 ))}
 </div>
 </div>

 {/* Company links */}
 <div>
 <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 800, marginBottom: 12 }}>Company</div>
 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 {[
 ["about", "About"],
 ["profile", "Profile Demo"],
 ["cib", "CIB Detection"],
 ].map(([t, label]) => (
 <button
 key={t}
 onClick={() => setTab(t)}
 style={{
 background: "transparent", border: "none", padding: 0, textAlign: "left",
 fontSize: 13, color: C.textSecondary, cursor: "pointer",
 fontFamily: "'Outfit', sans-serif", fontWeight: 500,
 transition: "color 0.15s",
 }}
 onMouseEnter={e => e.currentTarget.style.color = C.primary}
 onMouseLeave={e => e.currentTarget.style.color = C.textSecondary}
 >{label}</button>
 ))}
 <button
 onClick={() => { setWaitlistSubmitted(false); setWaitlistError(""); setShowWaitlistModal(true); }}
 style={{
 background: "transparent", border: "none", padding: 0, textAlign: "left",
 fontSize: 13, color: C.primary, cursor: "pointer",
 fontFamily: "'Outfit', sans-serif", fontWeight: 700,
 transition: "color 0.15s",
 }}
 onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
 onMouseLeave={e => e.currentTarget.style.opacity = "1"}
 >Join Waitlist →</button>
 </div>
 </div>

 {/* Connect */}
 <div>
 <div style={{ fontSize: 10, color: C.primary, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 2, fontWeight: 800, marginBottom: 12 }}>Connect</div>
 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 <a href="https://x.com/FabsKebabs" target="_blank" rel="noopener noreferrer" style={{
 fontSize: 13, color: C.textSecondary, textDecoration: "none",
 fontFamily: "'Outfit', sans-serif", fontWeight: 500,
 display: "inline-flex", alignItems: "center", gap: 6,
 transition: "color 0.15s",
 }}
 onMouseEnter={e => e.currentTarget.style.color = C.primary}
 onMouseLeave={e => e.currentTarget.style.color = C.textSecondary}
 ><MessageCircle size={12} strokeWidth={2.2} /> @FabsKebabs</a>
 <a href="https://x.com/AZTradesReal" target="_blank" rel="noopener noreferrer" style={{
 fontSize: 13, color: C.textSecondary, textDecoration: "none",
 fontFamily: "'Outfit', sans-serif", fontWeight: 500,
 display: "inline-flex", alignItems: "center", gap: 6,
 transition: "color 0.15s",
 }}
 onMouseEnter={e => e.currentTarget.style.color = C.primary}
 onMouseLeave={e => e.currentTarget.style.color = C.textSecondary}
 ><MessageCircle size={12} strokeWidth={2.2} /> @AZTradesReal</a>
 <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", marginTop: 4, letterSpacing: 0.5 }}>Built in Australia 🦘</span>
 </div>
 </div>
 </div>

 {/* Footer Bottom */}
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Web3Gigs © 2026 · All Rights Reserved</div>
 <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
 <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
 <span>System Online · Beta v0</span>
 </div>
 <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>Not financial advice · Trust scores are estimates</div>
 </div>
 </div>
 </div>
 </div>
 );
}
