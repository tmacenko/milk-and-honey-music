// Milk & Honey Music — Client Management
// API: /api/sheets (music-sheets.js), /api/share (share.js)

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';

// ── Design tokens ─────────────────────────────────────────────────────────────
const G = {
  green: "#3eaa78", greenSubtle: "rgba(62,170,120,0.09)", greenBorder: "rgba(62,170,120,0.3)",
  greenShadow: "0 0 20px rgba(62,170,120,0.18)",
  bg: "#080809", surface: "#111113", surfaceRaised: "#18181b",
  surfaceGlass: "rgba(17,17,19,0.85)",
  surfaceBorder: "#1e1e22", surfaceBorderLight: "#28282d",
  text: "#f4f4f5", textSecondary: "#b4b4be", textTertiary: "#8a8a98",
  shadow: "0 1px 2px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.35)",
  shadowLg: "0 4px 12px rgba(0,0,0,0.7), 0 20px 60px rgba(0,0,0,0.5)",
  ease: "cubic-bezier(0.4,0,0.2,1)",
  yellow: "#d97706", red: "#dc2626",
};
const ff = "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif";

// Public URL slug for a client, e.g. "Oliver Heldens" -> "oliverheldens".
const slugOf = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// ── Country flags (emoji) ─────────────────────────────────────────────────────
const FLAG = {
  "united states": "🇺🇸", "usa": "🇺🇸", "us": "🇺🇸", "u.s.": "🇺🇸",
  "united kingdom": "🇬🇧", "uk": "🇬🇧", "england": "🇬🇧", "britain": "🇬🇧",
  "canada": "🇨🇦", "australia": "🇦🇺", "germany": "🇩🇪",
  "france": "🇫🇷", "sweden": "🇸🇪", "norway": "🇳🇴",
  "denmark": "🇩🇰", "netherlands": "🇳🇱", "spain": "🇪🇸",
  "italy": "🇮🇹", "brazil": "🇧🇷", "mexico": "🇲🇽",
  "japan": "🇯🇵", "south korea": "🇰🇷", "new zealand": "🇳🇿",
  "ireland": "🇮🇪", "scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "belgium": "🇧🇪",
  "switzerland": "🇨🇭", "austria": "🇦🇹", "portugal": "🇵🇹",
  "south africa": "🇿🇦", "nigeria": "🇳🇬", "ghana": "🇬🇭",
  "jamaica": "🇯🇲", "trinidad": "🇹🇹", "colombia": "🇨🇴",
  "argentina": "🇦🇷", "chile": "🇨🇱", "peru": "🇵🇪",
  "venezuela": "🇻🇪", "cuba": "🇨🇺", "puerto rico": "🇵🇷",
  "dominican republic": "🇩🇴", "haiti": "🇭🇹", "bahamas": "🇧🇸",
  "india": "🇮🇳", "china": "🇨🇳", "philippines": "🇵🇭",
  "indonesia": "🇮🇩", "thailand": "🇹🇭", "vietnam": "🇻🇳",
  "russia": "🇷🇺", "ukraine": "🇺🇦", "poland": "🇵🇱",
  "finland": "🇫🇮", "greece": "🇬🇷", "turkey": "🇹🇷",
  "israel": "🇮🇱", "saudi arabia": "🇸🇦", "uae": "🇦🇪",
  "kenya": "🇰🇪", "ethiopia": "🇪🇹", "tanzania": "🇹🇿",
  "new zealand": "🇳🇿", "singapore": "🇸🇬", "malaysia": "🇲🇾",
};
const flag = c => FLAG[(c||'').toLowerCase().trim()] || '';

// ── Logo lookups (PRO, Publisher, Label) ──────────────────────────────────────
// Using publicly hosted SVG/PNG logos via CDN

function lookupLogo(logos, val) {
  if (!val || !logos) return null;
  const key = val.toLowerCase().trim();
  // Exact match first, then partial
  if (logos[key]) return logos[key].url;
  const match = Object.entries(logos).find(([k]) => key.includes(k) || k.includes(key));
  return match ? match[1].url : null;
}

// ── Logo badge component ──────────────────────────────────────────────────────
function LogoBadge({ url, label, size = 32 }) {
  const [err, setErr] = useState(false);
  const resolvedUrl = (!url || err) ? null
    : (url.startsWith('http') && !url.match(/\.(png|jpg|jpeg|gif|svg|webp)(\?|$)/i))
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}&sz=64`
      : url;
  if (!resolvedUrl) {
    if (!label) return null;
    return <span style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600, color: G.textSecondary, whiteSpace: "nowrap" }}>{label}</span>;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), background: "#fff", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.12)", flexShrink: 0 }}>
      <img src={resolvedUrl} alt={label} onError={() => setErr(true)} style={{ width: "110%", height: "110%", objectFit: "cover", display: "block", margin: "-5%" }} />
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, photoUrl, size = 44 }) {
  const [err, setErr] = useState(false);
  const initials = (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hash = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = (hash * 47) % 360;
  const grad = `linear-gradient(135deg,hsl(${hue},55%,38%),hsl(${hue},55%,52%))`;

  if (photoUrl && !err) return (
    <img src={photoUrl} alt={name} onError={() => setErr(true)}
      referrerPolicy="no-referrer" crossOrigin="anonymous" loading="lazy" decoding="async"
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", objectPosition: "top", flexShrink: 0 }} />
  );
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: grad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0, border: `1.5px solid hsl(${hue},55%,58%)` }}>
      {initials}
    </div>
  );
}

// ── Type pill ─────────────────────────────────────────────────────────────────
function TypePill({ type }) {
  return <span style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 7, padding: "3px 10px", fontSize: 12, fontWeight: 600, letterSpacing: "0.01em", whiteSpace: "nowrap" }}>{type}</span>;
}

// ── Social icons ──────────────────────────────────────────────────────────────
function IgIcon({ size = 13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="5.5" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>; }
function TwIcon({ size = 13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }
function TkIcon({ size = 13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.3 6.3 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.73a4.85 4.85 0 01-1.01-.04z"/></svg>; }
function SpotifyIcon({ size = 13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>; }
function AppleMusicIcon({ size = 13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z"/></svg>; }
function SoundCloudIcon({ size = 13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/></svg>; }
function YtIcon({ size = 13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>; }
function BeatportIcon({ size = 13 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M21.429 17.055a7.114 7.114 0 0 1-.794 3.246 6.917 6.917 0 0 1-2.181 2.492 6.698 6.698 0 0 1-3.063 1.163 6.653 6.653 0 0 1-3.239-.434 6.796 6.796 0 0 1-2.668-1.932 7.03 7.03 0 0 1-1.481-2.983 7.124 7.124 0 0 1 .049-3.345 7.015 7.015 0 0 1 1.566-2.937l-4.626 4.73-2.421-2.479 5.201-5.265a3.791 3.791 0 0 0 1.066-2.675V0h3.41v6.613a7.172 7.172 0 0 1-.519 2.794 7.02 7.02 0 0 1-1.559 2.353l-.153.156a6.768 6.768 0 0 1 3.49-1.725 6.687 6.687 0 0 1 3.845.5 6.873 6.873 0 0 1 2.959 2.564 7.118 7.118 0 0 1 1.118 3.8Zm-3.089 0a3.89 3.89 0 0 0-.611-2.133 3.752 3.752 0 0 0-1.666-1.424 3.65 3.65 0 0 0-2.158-.233 3.704 3.704 0 0 0-1.92 1.037 3.852 3.852 0 0 0-1.031 1.955 3.908 3.908 0 0 0 .205 2.213c.282.7.76 1.299 1.374 1.721a3.672 3.672 0 0 0 2.076.647 3.637 3.637 0 0 0 2.635-1.096c.347-.351.622-.77.81-1.231.188-.461.285-.956.286-1.456Z"/></svg>; }

function fmt(n) {
  if (!n) return null;
  const s = String(n).trim();
  if (/[KkMmBb]$/i.test(s)) return s.toUpperCase();
  const num = parseInt(s.replace(/[^0-9]/g, ''));
  if (isNaN(num) || num === 0) return null;
  if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(num);
}

// ── Form helpers ──────────────────────────────────────────────────────────────
const inputBase = { background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 9, padding: "9px 12px", fontSize: 13, color: G.text, fontFamily: ff, outline: "none", width: "100%" };
const labelStyle = { fontSize: 11, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "block" };

function Field({ label, children }) {
  return <div style={{ marginBottom: 16 }}><label style={labelStyle}>{label}</label>{children}</div>;
}
function Input({ value, onChange, placeholder, type = "text" }) {
  return <input type={type} value={value || ''} onChange={onChange} placeholder={placeholder || ''} style={inputBase} />;
}
function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return <textarea value={value || ''} onChange={onChange} placeholder={placeholder || ''} rows={rows} style={{ ...inputBase, resize: "vertical", lineHeight: 1.6 }} />;
}

// ── Blank client template ─────────────────────────────────────────────────────
const BLANK = {
  public: false,
  name: '', types: [], contact: '', city: '', state: '', country: '',
  pro: '', publisher: '', label: '', credits: [], supporters: [], keyShows: [], bio: '', photoUrl: '',
  instagram: '', twitter: '', tiktok: '', youtube: '', beatport: '', spotifyMonthly: '',
  spotifyUrl: '', appleMusicUrl: '', soundcloudUrl: '', notes: '', spotifyId: '',
};

// ── Info row ──────────────────────────────────────────────────────────────────
function IR({ label, value }) {
  if (!value || value === '—') return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${G.surfaceBorder}` }}>
      <span style={{ fontSize: 12, color: G.textSecondary, fontWeight: 400 }}>{label}</span>
      <span style={{ fontSize: 13, color: G.text, fontWeight: 500, textAlign: "right", marginLeft: 24 }}>{value}</span>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Sec({ title, children }) {
  return (
    <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 16, padding: "18px 20px" }}>
      {title && <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 14 }}>{title}</div>}
      {children}
    </div>
  );
}

// ── Chat component ────────────────────────────────────────────────────────────
// Minimal markdown renderer for chat bubbles — headings, bold, bullet and
// numbered lists, paragraph spacing. React elements only (no innerHTML).
function chatInline(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4
      ? <strong key={i} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong> : p);
}
function ChatText({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let list = null;
  const flush = () => { if (list) { blocks.push(list); list = null; } };
  lines.forEach((ln) => {
    const bullet = ln.match(/^\s*[-•*]\s+(.*)/);
    const num = ln.match(/^\s*\d+[.)]\s+(.*)/);
    const head = ln.match(/^\s*(#{1,4})\s+(.*)/);
    if (bullet) { if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; } list.items.push(bullet[1]); return; }
    if (num) { if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] }; } list.items.push(num[1]); return; }
    flush();
    if (head) blocks.push({ head: head[1].length, text: head[2] });
    else blocks.push({ p: ln });
  });
  flush();
  return <div>{blocks.map((b, i) => {
    if (b.items) {
      const Tag = b.ordered ? 'ol' : 'ul';
      return <Tag key={i} style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{b.items.map((it, j) => <li key={j} style={{ marginBottom: 3 }}>{chatInline(it)}</li>)}</Tag>;
    }
    if (b.head) return <div key={i} style={{ fontWeight: 800, fontSize: b.head <= 2 ? 14 : 13, margin: '10px 0 4px' }}>{chatInline(b.text)}</div>;
    if (!String(b.p).trim()) return <div key={i} style={{ height: 6 }} />;
    return <div key={i} style={{ marginBottom: 2 }}>{chatInline(b.p)}</div>;
  })}</div>;
}

function FloatingChat({ isMobile }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = open ? 'hidden' : '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open, isMobile]);
  const [msgs, setMsgs] = useState([{ role: "assistant", text: "Hey — ask me anything across Milk & Honey: music clients, sports athletes (teams, depth charts, socials, growth), the recruiting board, NFL team contacts, or state registrations. I can also draft pitches and outreach." }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatPdfMsg, setChatPdfMsg] = useState(null);
  const bottomRef = useRef();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMsgs(m => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const systemPrompt = `You are the internal assistant for Milk & Honey, a talent agency with two sides: Music (songwriters, producers, artists) and Sports (NFL, College, and High School football athletes).

The full internal dataset is provided in your context: both rosters, staff, the recruiting board, NFL front-office contacts, and state NIL/agent registrations. Sports data notes: depth "1" means starter (from Ourlads); teams/heights/weights sync daily from ESPN; follower counts refresh from IG/X/TikTok, and growth7d is the 7-day follower change.

Use the data to answer questions, find patterns, suggest brand/collab matches, and draft outreach. Never invent people, credits, or numbers not in the data — if something isn't in the data, say so.

OUTPUT FORMAT:
1. CONVERSATIONAL: plain answers, analysis, recommendations.
2. DOCUMENT: for pitches, briefs, proposals -- wrap in [DOC] and [/DOC] tags. Start with a ## heading. End with a closing offer outside the tags.
3. CSV EXPORT: ONLY when explicitly asked. Respond with ONLY: {"export":true,"filename":"name.csv","rows":[{"Col":"val"}]}

Today: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
Do not include a footer line in documents -- the PDF template adds one automatically.`;

      const priorMsgs = msgs.filter((m, i) => i > 0 && m.text);
      const history = [
        ...priorMsgs.map(m => ({ role: m.role, content: m.text })),
        { role: "user", content: text },
      ];

      const resp = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", fullContext: true, stream: true, system: systemPrompt, messages: history }),
      });
      // Errors (and any non-streaming environment) come back as JSON.
      if ((resp.headers.get('content-type') || '').includes('json')) {
        const data = await resp.json();
        setMsgs(m => [...m, { role: "assistant", text: data.error ? "Error: " + data.error : (data.text || "No response.") }]);
        setLoading(false);
        return;
      }
      // Stream the reply into the bubble as it generates.
      setMsgs(m => [...m, { role: "assistant", text: "" }]);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let raw = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += dec.decode(value, { stream: true });
        const shown = raw; // capture for the state updater
        setMsgs(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], text: shown }; return c; });
      }
      if (!raw.trim()) raw = "No response.";
      // Post-process the finished text: CSV export or [DOC] splitting.
      const clean = raw.replace(/```(?:json)?/gi, '').trim();
      let handled = false;
      if (clean.startsWith('{') && clean.includes('"export"')) {
        try {
          const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
          if (parsed.export === true && Array.isArray(parsed.rows) && parsed.rows.length) {
            const keys = Object.keys(parsed.rows[0]);
            const csv = [keys.join(','), ...parsed.rows.map(r => keys.map(k => '"' + String(r[k] == null ? '' : r[k]).replace(/"/g, '""') + '"').join(','))].join('\n');
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
            const a = document.createElement('a'); a.href = url; a.download = parsed.filename || 'export.csv'; a.click();
            setMsgs(m => { const c = [...m]; c[c.length - 1] = { role: "assistant", text: `Exported ${parsed.rows.length} rows as ${parsed.filename || 'export.csv'}.` }; return c; });
            handled = true;
          }
        } catch { /* fall through to plain text */ }
      }
      if (!handled) {
        const docStart = raw.indexOf("[DOC]"), docEnd = raw.indexOf("[/DOC]");
        if (docStart !== -1 && docEnd > docStart) {
          const pre = raw.slice(0, docStart).trim();
          const doc = raw.slice(docStart + 5, docEnd).trim();
          const post = raw.slice(docEnd + 6).trim();
          const msgs2 = [];
          if (pre) msgs2.push({ role: "assistant", text: pre, msgType: "preamble" });
          if (doc) msgs2.push({ role: "assistant", text: doc, msgType: "doc" });
          if (post) msgs2.push({ role: "assistant", text: post, msgType: "closer" });
          setMsgs(m => [...m.slice(0, -1), ...msgs2]);
        }
        // plain text: already in place from streaming
      }
    } catch(e) { setMsgs(m => [...m, { role: "assistant", text: "Error: " + e.message }]); }
    setLoading(false);
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{ position: "fixed", bottom: 24, right: 24, width: 52, height: 52, borderRadius: 26, background: G.green, border: "none", cursor: "pointer", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 20px rgba(62,170,120,0.45)`, transition: `all 0.22s ${G.ease}` }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  );

  return (
    <>
      <style>{`@keyframes chatDot{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
      {chatPdfMsg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(20px)", zIndex: 2001, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: G.surfaceGlass, backdropFilter: "blur(24px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 22, width: "100%", maxWidth: 900, height: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: G.shadowLg }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: G.text }}>PDF Preview</span>
              <div style={{ display: "flex", gap: 9 }}>
                <button onClick={() => { const f = buildChatHtml(chatPdfMsg.text); const w = window.open('','_blank','width=900'); w.document.write(f); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 500); }}
                  style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Download PDF</button>
                <button onClick={() => setChatPdfMsg(null)} style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "9px 14px", fontSize: 14, cursor: "pointer", fontFamily: ff }}>✕</button>
              </div>
            </div>
            <iframe ref={el => { if (!el) return; const doc = el.contentDocument; doc.open(); doc.write(buildChatHtml(chatPdfMsg.text)); doc.close(); }} style={{ flex: 1, border: "none" }} />
          </div>
        </div>
      )}
      <div style={{ position: "fixed", ...(isMobile ? { inset: 0, borderRadius: 0 } : { bottom: 86, right: 24, width: 380, height: 520, borderRadius: 18 }), background: G.surfaceGlass, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: `1px solid ${G.surfaceBorderLight}`, display: "flex", flexDirection: "column", zIndex: 999, boxShadow: G.shadow, overflow: "hidden", transition: `all 0.2s ${G.ease}` }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: G.green }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: G.text }}>Roster Assistant</span>
          </div>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: G.textSecondary, cursor: "pointer", fontSize: 18, padding: "2px 6px", fontFamily: ff }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "88%", padding: "9px 13px", borderRadius: m.role === "user" ? "14px 14px 3px 14px" : "14px 14px 14px 3px", background: m.role === "user" ? G.green : G.surfaceRaised, color: m.role === "user" ? "#0a0a0a" : G.text, fontSize: 13, lineHeight: 1.55 }}>
                {m.role === "assistant" ? <ChatText text={m.text} /> : m.text}
                {m.msgType === "doc" && (
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => setChatPdfMsg(m)} style={{ background: "none", border: `1px solid ${G.surfaceBorder}`, borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: G.textTertiary, cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center", gap: 5 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = G.green; e.currentTarget.style.color = G.green; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = G.surfaceBorder; e.currentTarget.style.color = G.textTertiary; }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                      Open PDF
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <div style={{ display: "flex", justifyContent: "flex-start" }}><div style={{ padding: "10px 14px", borderRadius: "14px 14px 14px 3px", background: G.surfaceRaised, display: "flex", gap: 4, alignItems: "center" }}>{[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: G.textTertiary, display: "inline-block", animation: `chatDot 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}</div></div>}
          <div ref={bottomRef} />
        </div>
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${G.surfaceBorder}`, display: "flex", gap: 8, flexShrink: 0 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about your clients..." style={{ flex: 1, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "9px 12px", fontSize: isMobile ? 16 : 13, color: G.text, fontFamily: ff, outline: "none" }} />
          <button onClick={send} disabled={!input.trim() || loading} style={{ background: input.trim() && !loading ? G.green : G.surfaceRaised, color: input.trim() && !loading ? "#0a0a0a" : G.textTertiary, border: "none", borderRadius: 10, width: 36, height: 36, cursor: input.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: `all .15s` }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
      {!isMobile && (
        <button onClick={() => setOpen(false)} style={{ position: "fixed", bottom: 24, right: 24, width: 52, height: 52, borderRadius: 26, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, cursor: "pointer", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", transition: `all 0.22s ${G.ease}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke={G.textSecondary} strokeWidth="2.2" strokeLinecap="round"/></svg>
        </button>
      )}
    </>
  );
}

// ── PDF builder for chat exports ──────────────────────────────────────────────
function buildChatHtml(msgText) {
  const lines = (msgText || '').split('\n');
  const processed = []; const tables = {};
  let i = 0; let ti = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) block.push(lines[i++]);
      const isSep = r => r.replace(/[\s|:\-=]/g,'') === '';
      const header = block[0].split('|').slice(1,-1).map(c => c.trim());
      const rows = block.filter(r => !isSep(r)).slice(1);
      const key = `__T${ti++}__`;
      tables[key] = `<table><thead><tr>${header.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.split('|').slice(1,-1).map(c=>`<td>${c.trim()}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      processed.push(key); continue;
    }
    processed.push(line); i++;
  }
  let body = processed.join('\n')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^#### (.+)$/gm,'<h4>$1</h4>').replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/^---+$/gm,'<hr>').replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>')
    .replace(/^[·\-\*] (.+)$/gm,'<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g,m=>`<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm,'<li>$1</li>').replace(/\n/g,'<br>');
  Object.entries(tables).forEach(([k,v]) => { body = body.replace(k, v); });
  const d = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    html,body{margin:0;padding:0;font-family:-apple-system,"Helvetica Neue",sans-serif;font-size:13px;color:#1a1a1a;line-height:1.5}
    @page{margin:0;size:letter portrait}
    .wrap{min-height:100vh;display:flex;flex-direction:column}
    .hdr{background:#0a0a0a;padding:22px 64px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #5BC898;position:relative;overflow:hidden;flex-shrink:0}
    .hdr::after{content:"";position:absolute;top:0;right:0;width:35%;height:100%;background:linear-gradient(to left,rgba(91,200,152,.15),transparent)}
    .logo{font-size:10px;font-weight:700;color:#5BC898;letter-spacing:.14em;text-transform:uppercase;position:relative;z-index:1}
    .dt{font-size:9px;color:#777;position:relative;z-index:1}
    .body{padding:36px 64px 48px;flex:1}
    .ftr{background:#0a0a0a;padding:9px 64px;display:flex;justify-content:space-between;align-items:center}
    .fl{color:#5BC898;font-size:8px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
    .fr{color:#444;font-size:8px}
    h1{font-size:22px;font-weight:800;margin:0 0 6px;color:#0a0a0a;letter-spacing:-.02em}
    h2{font-size:16px;font-weight:700;margin:20px 0 8px;color:#0a0a0a;border-bottom:1px solid #e5e5e5;padding-bottom:5px}
    h3{font-size:10px;font-weight:700;color:#3eaa78;text-transform:uppercase;letter-spacing:.1em;margin:16px 0 6px}
    h4{font-size:13px;font-weight:700;margin:12px 0 4px;color:#0a0a0a}
    hr{border:none;border-top:1px solid #e5e5e5;margin:16px 0}
    ul{padding-left:0;list-style:none;margin:6px 0}
    li{display:flex;gap:8px;margin:3px 0}
    li::before{content:"·";color:#3eaa78;font-weight:700;flex-shrink:0}
    blockquote{border-left:3px solid #3eaa78;padding-left:12px;margin:10px 0;color:#555;font-style:italic}
    table{border-collapse:collapse;width:100%;margin:12px 0;font-size:11px}
    thead tr{background:#f5f5f5;border-bottom:2px solid #3eaa78}
    th{padding:7px 12px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#3eaa78}
    td{padding:7px 12px;border-bottom:1px solid #e5e5e5;vertical-align:top}
    tbody tr:nth-child(even){background:#fafafa}
    strong{font-weight:700}em{font-style:italic}
  </style></head><body>
    <div class="wrap">
      <div class="hdr"><span class="logo">Milk &amp; Honey Music</span><span class="dt">${d}</span></div>
      <div class="body">${body}</div>
      <div class="ftr"><span class="fl">Milk &amp; Honey Music</span><span class="fr">${new Date().getFullYear()}</span></div>
    </div>
  </body></html>`;
}

// Searchable multi-select for the edit form: options come straight from the
// sheet data (alphabetical), type to filter, click to toggle. Value is stored
// as the sheet's comma-separated string.
function MultiSelectCombo({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef();
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(''); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const selected = (value || '').split(',').map(s => s.trim()).filter(Boolean);
  // Keep any already-saved values selectable even if they're not in the sheet list.
  const all = Array.from(new Set([...options, ...selected])).sort((a, b) => a.localeCompare(b));
  const ql = q.trim().toLowerCase();
  const list = ql ? all.filter(o => o.toLowerCase().includes(ql)) : all;
  const toggle = (name) => {
    const next = selected.includes(name) ? selected.filter(x => x !== name) : [...selected, name];
    onChange(next.join(', '));
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: G.surfaceRaised, border: `1px solid ${open ? G.green : G.surfaceBorder}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", minHeight: 40, boxSizing: "border-box" }}>
        <span style={{ fontSize: 13, color: selected.length ? G.text : G.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected.length ? selected.join(', ') : placeholder}
        </span>
        <span style={{ fontSize: 9, color: G.textTertiary, flexShrink: 0 }}>▾</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: G.surfaceGlass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 12, zIndex: 60, boxShadow: G.shadowLg, overflow: "hidden" }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${G.surfaceBorder}` }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Type to search..."
              style={{ width: "100%", boxSizing: "border-box", background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: G.text, fontFamily: ff, outline: "none" }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto", padding: 4 }}>
            {list.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: G.textTertiary }}>No matches.</div>}
            {list.map(o => {
              const on = selected.includes(o);
              return (
                <button key={o} onClick={() => toggle(o)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: ff, fontSize: 13, fontWeight: on ? 700 : 400, color: on ? G.green : G.text, textAlign: "left" }}
                  onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o}</span>
                  {on && <span style={{ color: G.green, fontSize: 12, flexShrink: 0 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Client edit form ──────────────────────────────────────────────────────────
function ClientForm({ initial, onSave, onCancel, staff, clients }) {
  const [form, setForm] = useState({ ...BLANK, ...initial });
  const [saving, setSaving] = useState(false);
  const [photoHint, setPhotoHint] = useState(false);
  const [open, setOpen] = useState({ basics: true });
  // Locations: show only the ones in use (min 1); "+" reveals up to 3.
  const [locCount, setLocCount] = useState(() => {
    if (initial.city3 || initial.state3 || initial.country3) return 3;
    if (initial.city2 || initial.state2 || initial.country2) return 2;
    return 1;
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isNew = !initial._rowIndex;

  // Freeze the page behind the modal (no background scroll).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Dropdown options pulled straight from the sheet data, alphabetical.
  const staffNames = useMemo(() => Object.values(staff || {}).map(s => s.name).sort((a, b) => a.localeCompare(b)), [staff]);
  const optionsFrom = (key) => Array.from(new Set(
    (clients || []).flatMap(c => String(c[key] || '').split(',').map(s => s.trim()).filter(Boolean))
  )).sort((a, b) => a.localeCompare(b));
  const proOptions = useMemo(() => optionsFrom('pro'), [clients]);
  const publisherOptions = useMemo(() => optionsFrom('publisher'), [clients]);
  const labelOptions = useMemo(() => optionsFrom('label'), [clients]);

  const save = async () => {
    if (!form.name.trim()) return alert('Name is required');
    setSaving(true);
    try {
      const resp = await fetch('/api/sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isNew ? 'create' : 'save', client: form }),
      });
      const data = await resp.json();
      if (data.success) onSave({ ...form, photoUrl: (form.photoUrlOverride || '').trim() || form.photoUrl }, { created: isNew });
      else throw new Error(data.error || 'Save failed');
    } catch(e) { alert('Save failed: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    if (!window.confirm(`Remove ${initial.name} from the roster? This deletes their row from the sheet.`)) return;
    setSaving(true);
    try {
      const resp = await fetch('/api/sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-client', row: initial._rowIndex, name: initial.name }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Delete failed');
      onSave(null, { deleted: true, name: initial.name });
    } catch (e) { alert('Delete failed: ' + e.message); setSaving(false); }
  };

  const typeOptions = ['Artist', 'Producer', 'Songwriter', 'Composer', 'Mixer', 'Remixer'];
  // No overflow:hidden here — the combo dropdowns must be able to spill past
  // the section boundary; the header button rounds its own corners instead.
  const section = (id, title, children) => (
    <div style={{ border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, marginBottom: 10 }}>
      <button onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: G.surfaceRaised, border: "none", borderRadius: open[id] ? "11px 11px 0 0" : 11, cursor: "pointer", fontFamily: ff }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: open[id] ? G.text : G.textSecondary }}>{title}</span>
        <span style={{ color: G.textTertiary, fontSize: 11, transform: open[id] ? 'rotate(180deg)' : 'none', transition: `transform 0.15s ${G.ease}` }}>▼</span>
      </button>
      {open[id] && <div style={{ padding: "14px 14px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>{children}</div>}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {/* Solid panel — stacked backdrop blurs made scrolling this modal janky. */}
      <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 22, width: "100%", maxWidth: 600, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: G.shadowLg }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: G.text }}>{isNew ? 'Add Client' : 'Edit Client'}</span>
          <button onClick={onCancel} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "7px 12px", fontSize: 14, fontFamily: ff }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "20px 24px" }}>
          <div style={{ marginBottom: 14 }}>
            <div onClick={() => set('public', !form.public)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: form.public ? G.greenSubtle : G.surfaceRaised, border: `1px solid ${form.public ? G.green : G.surfaceBorder}`, borderRadius: 12, padding: "12px 16px", cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: form.public ? G.green : G.text }}>Public on roster</div>
                <div style={{ fontSize: 12, color: G.textSecondary, marginTop: 2 }}>{form.public ? 'Visible on the public site.' : 'Hidden — internal only.'}</div>
              </div>
              <div style={{ width: 44, height: 26, borderRadius: 20, background: form.public ? G.green : G.surfaceBorderLight, position: "relative", flexShrink: 0, transition: `background 0.15s ${G.ease}` }}>
                <div style={{ position: "absolute", top: 3, left: form.public ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: `left 0.15s ${G.ease}` }} />
              </div>
            </div>
          </div>

          {section('basics', 'Basics', <>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Name"><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Type">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {typeOptions.map(t => {
                    const on = (form.types || []).includes(t);
                    return <button key={t} onClick={() => set('types', on ? form.types.filter(x => x !== t) : [...(form.types||[]), t])}
                      style={{ flex: 1, minWidth: 84, padding: "8px 0", border: `1px solid ${on ? G.green : G.surfaceBorder}`, borderRadius: 9, background: on ? G.greenSubtle : G.surfaceRaised, color: on ? G.green : G.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff, transition: `all 0.15s ${G.ease}`, whiteSpace: "nowrap" }}>
                      {t}
                    </button>;
                  })}
                </div>
              </Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Contact / MH Rep">
                <MultiSelectCombo value={form.contact} onChange={v => set('contact', v)} options={staffNames} placeholder="Select rep(s)..." />
              </Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.1em" }}>Location{locCount > 1 ? 's' : ''}</div>
                {locCount < 3 && (
                  <button onClick={() => setLocCount(n => Math.min(3, n + 1))}
                    style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, color: G.textSecondary, cursor: "pointer", padding: "4px 10px", fontSize: 12, fontWeight: 600, fontFamily: ff }}>+ Add location</button>
                )}
              </div>
              {[['','',''],['2','2','2'],['3','3','3']].slice(0, locCount).map(([s1,s2,s3],i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px", marginBottom: 8 }}>
                  <Field label={`City ${i+1}`}><Input value={form[`city${s1}`] || ''} onChange={e => set(`city${s1}`, e.target.value)} /></Field>
                  <Field label={`State ${i+1}`}><Input value={form[`state${s2}`] || ''} onChange={e => set(`state${s2}`, e.target.value)} /></Field>
                  <Field label={`Country ${i+1}`}><Input value={form[`country${s3}`] || ''} onChange={e => set(`country${s3}`, e.target.value)} placeholder="United States" /></Field>
                </div>
              ))}
            </div>
          </>)}

          {section('affiliations', 'Affiliations', <>
            <Field label="PRO">
              <MultiSelectCombo value={form.pro} onChange={v => set('pro', v)} options={proOptions} placeholder="BMI, ASCAP, SESAC..." />
            </Field>
            <Field label="Publisher">
              <MultiSelectCombo value={form.publisher} onChange={v => set('publisher', v)} options={publisherOptions} placeholder="Kobalt, Warner Chappell..." />
            </Field>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Record Label">
                <MultiSelectCombo value={form.label} onChange={v => set('label', v)} options={labelOptions} placeholder="Atlantic, Republic..." />
              </Field>
            </div>
          </>)}

          {section('bio', 'Bio & photo', <>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Bio"><Textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={4} /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                Profile Photo URL
                <span onClick={() => setPhotoHint(v => !v)} title="Overrides Spotify profile image" style={{ color: G.green, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>*</span>
              </div>
              <Input value={form.photoUrlOverride ?? ''} onChange={e => set('photoUrlOverride', e.target.value)} placeholder="Auto from Spotify — paste a URL to override" />
              {photoHint && <div style={{ fontSize: 11, color: G.textSecondary, marginTop: 5, marginBottom: 12 }}>Overrides the Spotify profile image.</div>}
            </div>
            <div style={{ gridColumn: "1/-1", marginTop: photoHint ? 0 : 12 }}>
              <Field label="Notes (internal)"><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} /></Field>
            </div>
          </>)}

          {section('credits', 'Credits & shows', <>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Artists / Credits (comma-separated)"><Input value={(form.credits||[]).join(', ')} onChange={e => set('credits', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Drake, Post Malone, Billie Eilish..." /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Supporters (comma-separated)"><Input value={(form.supporters||[]).join(', ')} onChange={e => set('supporters', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Tiësto, John Summit, Vintage Culture..." /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Key Shows (comma-separated)"><Input value={(form.keyShows||[]).join(', ')} onChange={e => set('keyShows', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="EDC, Red Rocks, Coachella..." /></Field>
            </div>
          </>)}

          {section('socials', 'Social media', <>
            <Field label="Instagram"><Input value={form.instagram} onChange={e => set('instagram', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            <Field label="Twitter / X"><Input value={form.twitter} onChange={e => set('twitter', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            <Field label="TikTok"><Input value={form.tiktok} onChange={e => set('tiktok', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            <Field label="YouTube URL"><Input value={form.youtube} onChange={e => set('youtube', e.target.value)} placeholder="https://youtube.com/@..." /></Field>
          </>)}

          {section('music', 'Music profiles', <>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Spotify URL"><Input value={form.spotifyUrl} onChange={e => set('spotifyUrl', e.target.value)} placeholder="https://open.spotify.com/artist/..." /></Field>
            </div>
            <Field label="Spotify Monthly Listeners"><Input value={form.spotifyMonthly} onChange={e => set('spotifyMonthly', e.target.value)} placeholder="4.5M" /></Field>
            <Field label="Apple Music URL"><Input value={form.appleMusicUrl} onChange={e => set('appleMusicUrl', e.target.value)} placeholder="https://music.apple.com/..." /></Field>
            <Field label="SoundCloud URL"><Input value={form.soundcloudUrl} onChange={e => set('soundcloudUrl', e.target.value)} placeholder="https://soundcloud.com/..." /></Field>
            <Field label="Beatport URL"><Input value={form.beatport} onChange={e => set('beatport', e.target.value)} placeholder="https://www.beatport.com/artist/..." /></Field>
          </>)}
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${G.surfaceBorder}`, display: "flex", gap: 10, flexShrink: 0 }}>
          {!isNew && (
            <button onClick={del} disabled={saving} style={{ background: "transparent", border: `1px solid ${G.red}`, borderRadius: 12, padding: "11px 16px", color: G.red, fontWeight: 600, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: ff }}>Delete</button>
          )}
          <button onClick={onCancel} style={{ flex: 1, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "11px", color: G.textSecondary, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, background: saving ? G.surfaceRaised : G.green, border: "none", borderRadius: 12, padding: "11px", color: saving ? G.textTertiary : "#0a0a0a", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: ff }}>
            {saving ? 'Saving...' : isNew ? 'Add Client' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Athlete edit form (sports) ────────────────────────────────────────────────
// Identity fields write to the athlete's level tab; enrichment fields write to
// AppData (matched by name server-side). Mirrors the music ClientForm UX.
function AthleteForm({ initial, onSave, onCancel, staffNames }) {
  const [form, setForm] = useState({ ...initial });
  const [saving, setSaving] = useState(false);
  const [photoHint, setPhotoHint] = useState(false);
  // Auto-pulled fields render locked; unlocking asks for confirmation because a
  // manual value overrides the nightly sync from that point on.
  const [unlocked, setUnlocked] = useState({});
  const [open, setOpen] = useState({ basics: true });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isNFL = form.level === 'NFL';
  const isHS = form.level === 'High School';
  const teamKey = isNFL ? 'nflTeam' : 'college';
  const teamEdited = String(form[teamKey] || '').trim() !== String(initial[teamKey] || '').trim();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const save = async () => {
    if (!String(form.name || '').trim()) return alert('Name is required');
    setSaving(true);
    try {
      const payload = { ...form };
      // Editing the team box IS the override — no separate input needed.
      if (teamEdited) payload.teamOverride = String(form[teamKey] || '').trim();
      const levelChanged = form.level !== initial.level;
      const resp = await fetch('/api/athletes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athlete: payload, originalName: initial.name, prevLevel: initial.level }),
      });
      const data = await resp.json();
      if (data.success) onSave({ ...payload, photoUrl: (form.photoUrlOverride || '').trim() || form.photoUrl }, { levelChanged, created: !initial._rowIndex });
      else throw new Error(data.error || 'Save failed');
    } catch (e) { alert('Save failed: ' + e.message); }
    setSaving(false);
  };

  const del = async () => {
    if (!window.confirm(`Remove ${initial.name} from the roster? This deletes their row from the sheet.`)) return;
    setSaving(true);
    try {
      const resp = await fetch('/api/athletes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-athlete', level: initial.level, row: initial._rowIndex, name: initial.name }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Delete failed');
      onSave(null, { deleted: true });
    } catch (e) { alert('Delete failed: ' + e.message); setSaving(false); }
  };

  const statusOptions = ['Active', 'Free Agent', 'Rookie', 'Inactive', 'Retired'];
  const levelOptions = ['High School', 'College', 'NFL'];
  const unlock = (k) => {
    if (unlocked[k]) return;
    if (window.confirm('This field auto-populates nightly. Are you sure you want to edit it? Your manual value will override the auto sync.')) {
      setUnlocked(u => ({ ...u, [k]: true }));
    }
  };
  const lockLabel = (k, label) => (
    <span onClick={() => unlock(k)} title={unlocked[k] ? 'Editing manually — overrides the auto sync' : 'Auto-pulled nightly — click the lock to edit'}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", color: unlocked[k] ? G.green : undefined }}>
      {label}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        {unlocked[k]
          ? <path d="M7 11V7a5 5 0 019.9-1M4 11h16v10H4z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M7 11V7a5 5 0 0110 0v4M4 11h16v10H4z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </span>
  );
  const lockInput = (k, label, formKey, placeholder, sanitize) => (
    <Field label={lockLabel(k, label)}>
      <div onClick={() => { if (!unlocked[k]) unlock(k); }}>
        <input type="text" value={form[formKey] || ''} disabled={!unlocked[k]}
          onChange={e => set(formKey, sanitize ? sanitize(e.target.value) : e.target.value)}
          placeholder={placeholder}
          style={{ ...inputBase, ...(unlocked[k] ? {} : { opacity: 0.55, cursor: "pointer" }) }} />
      </div>
    </Field>
  );
  const section = (id, title, children) => (
    <div style={{ border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      <button onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: G.surfaceRaised, border: "none", cursor: "pointer", fontFamily: ff }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: open[id] ? G.text : G.textSecondary }}>{title}</span>
        <span style={{ color: G.textTertiary, fontSize: 11, transform: open[id] ? 'rotate(180deg)' : 'none', transition: `transform 0.15s ${G.ease}` }}>▼</span>
      </button>
      {open[id] && <div style={{ padding: "14px 14px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>{children}</div>}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {/* Solid panel — stacked backdrop blurs made scrolling this modal janky. */}
      <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 22, width: "100%", maxWidth: 600, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: G.shadowLg }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: G.text }}>Edit Athlete</span>
          <button onClick={onCancel} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "7px 12px", fontSize: 14, fontFamily: ff }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "20px 24px" }}>
          <div style={{ marginBottom: 14 }}>
            <div onClick={() => set('public', !form.public)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: form.public ? G.greenSubtle : G.surfaceRaised, border: `1px solid ${form.public ? G.green : G.surfaceBorder}`, borderRadius: 12, padding: "12px 16px", cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: form.public ? G.green : G.text }}>Public on roster</div>
                <div style={{ fontSize: 12, color: G.textSecondary, marginTop: 2 }}>{form.public ? 'Visible on the public site.' : 'Hidden — internal only.'}</div>
              </div>
              <div style={{ width: 44, height: 26, borderRadius: 20, background: form.public ? G.green : G.surfaceBorderLight, position: "relative", flexShrink: 0, transition: `background 0.15s ${G.ease}` }}>
                <div style={{ position: "absolute", top: 3, left: form.public ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: `left 0.15s ${G.ease}` }} />
              </div>
            </div>
          </div>

          {section('basics', 'Basics', <>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Name"><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Level">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {levelOptions.map(lv => {
                    const on = form.level === lv;
                    return <button key={lv} onClick={() => set('level', lv)}
                      style={{ flex: 1, minWidth: 90, padding: "8px 0", border: `1px solid ${on ? G.green : G.surfaceBorder}`, borderRadius: 9, background: on ? G.greenSubtle : G.surfaceRaised, color: on ? G.green : G.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff, transition: `all 0.15s ${G.ease}`, whiteSpace: "nowrap" }}>
                      {lv}
                    </button>;
                  })}
                </div>
                {form.level !== initial.level && (
                  <div style={{ fontSize: 11, color: G.red, marginTop: 6 }}>Saving moves them to the {form.level} roster tab.</div>
                )}
              </Field>
            </div>
            {isNFL && (
              <div style={{ gridColumn: "1/-1" }}>
                <Field label="Status">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {statusOptions.map(s => {
                      const on = form.status === s;
                      return <button key={s} onClick={() => set('status', s)}
                        style={{ flex: 1, minWidth: 80, padding: "8px 0", border: `1px solid ${on ? G.green : G.surfaceBorder}`, borderRadius: 9, background: on ? G.greenSubtle : G.surfaceRaised, color: on ? G.green : G.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff, transition: `all 0.15s ${G.ease}`, whiteSpace: "nowrap" }}>
                        {s}
                      </button>;
                    })}
                  </div>
                </Field>
              </div>
            )}
            <Field label="Position"><Input value={form.position} onChange={e => set('position', e.target.value)} placeholder="QB, WR, LB..." /></Field>
            <div>
              <Field label={isNFL ? 'Team' : 'School'}>
                <Input value={form[teamKey] || ''} onChange={e => set(teamKey, e.target.value)} placeholder={isNFL ? 'Kansas City Chiefs' : 'Michigan'} />
              </Field>
              {teamEdited && <div style={{ fontSize: 11, color: G.textTertiary, marginTop: -10, marginBottom: 12 }}>Overrides the auto team sync until it catches up.</div>}
            </div>
            <Field label="Lead Agent">
              <select value={form.agentAssigned || ''} onChange={e => set('agentAssigned', e.target.value)} style={{ ...inputBase, cursor: "pointer" }}>
                <option value="">—</option>
                {form.agentAssigned && !(staffNames || []).includes(form.agentAssigned) && <option value={form.agentAssigned}>{form.agentAssigned}</option>}
                {(staffNames || []).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Birthday"><Input value={form.birthday} onChange={e => set('birthday', e.target.value)} placeholder="6/14/2007" /></Field>
            {isHS && <Field label="Class Of"><Input value={form.classOf} onChange={e => set('classOf', e.target.value)} placeholder="2027" /></Field>}
            {isHS && (
              <Field label="Commitment"><Input value={form.committedTo} onChange={e => set('committedTo', e.target.value)} placeholder="Blank if uncommitted" /></Field>
            )}
          </>)}

          {section('bio', 'Bio & photos', <>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Bio"><Textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={4} /></Field>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                Profile Photo URL
                <span onClick={() => setPhotoHint(v => !v)} title="Overrides ESPN headshot" style={{ color: G.green, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>*</span>
              </div>
              <Input value={form.photoUrlOverride ?? ''} onChange={e => set('photoUrlOverride', e.target.value)} placeholder="Auto from ESPN — paste a URL to override" />
              {photoHint && <div style={{ fontSize: 11, color: G.textSecondary, marginTop: 5 }}>Overrides the ESPN headshot.</div>}
            </div>
            <Field label="Hero Image URL"><Input value={form.heroImageUrl} onChange={e => set('heroImageUrl', e.target.value)} placeholder="https://..." /></Field>
            <Field label="Hometown"><Input value={form.hometown} onChange={e => set('hometown', e.target.value)} placeholder="Cincinnati, OH" /></Field>
            {lockInput('jersey', 'Jersey #', 'jerseyNumber', '12')}
            {lockInput('height', 'Height', 'height', `6' 2"`)}
            {lockInput('weight', 'Weight', 'weight', '215')}
          </>)}

          {section('socials', 'Social media', <>
            <Field label="Instagram"><Input value={form.instagram} onChange={e => set('instagram', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            {lockInput('igFollowers', 'IG Followers', 'igFollowers', 'Auto-refreshed nightly')}
            <Field label="Twitter / X"><Input value={form.twitter} onChange={e => set('twitter', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            {lockInput('twitterFollowers', 'X Followers', 'twitterFollowers', 'Auto-refreshed nightly')}
            <Field label="TikTok"><Input value={form.tiktok} onChange={e => set('tiktok', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            {lockInput('tiktokFollowers', 'TikTok Followers', 'tiktokFollowers', 'Auto-refreshed nightly')}
          </>)}

          {section('contract', 'Contract', <>
            {isNFL ? (
              <div style={{ gridColumn: "1/-1" }}>
                {lockInput('contract', 'Contract ($ / year)', 'contractYearly', 'Auto-pulled from Spotrac')}
                <div style={{ fontSize: 11, color: G.textTertiary, marginTop: -10, marginBottom: 12 }}>NFL terms sync nightly from Spotrac. A manual value overrides them.</div>
              </div>
            ) : (
              <div style={{ gridColumn: "1/-1" }}>
                <Field label="Contract ($ / year)"><Input value={form.contractYearly} onChange={e => set('contractYearly', e.target.value)} placeholder="450000" /></Field>
              </div>
            )}
          </>)}

          {section('sizes', 'Sizes & interests', <>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Sizes">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px 12px" }}>
                  {[['shirtSize', 'Shirt'], ['hoodieSize', 'Hoodie'], ['shortsSize', 'Shorts'], ['sweatpantsSize', 'Pants'], ['shoeSize', 'Shoes'], ['glovesSize', 'Gloves']].map(([k, lab]) => (
                    <input key={k} type="text" value={form[k] || ''} onChange={e => set(k, e.target.value)} placeholder={lab} style={inputBase} />
                  ))}
                </div>
              </Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Gaming System"><Input value={form.gamingSystem} onChange={e => set('gamingSystem', e.target.value)} placeholder="PS5, Xbox..." /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Brands Worked With (comma-separated)"><Input value={(form.brands||[]).join(', ')} onChange={e => set('brands', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Nike, Gatorade..." /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Interests (comma-separated)"><Input value={(form.interests||[]).join(', ')} onChange={e => set('interests', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Gaming, Fashion, Music..." /></Field>
            </div>
          </>)}

          {section('autosync', 'Auto-sync', <>
            {lockInput('espnId', 'ESPN ID', 'espnId', 'Auto-found nightly', v => v.replace(/\D/g, ''))}
            {isHS && (
              <div style={{ gridColumn: "1/-1" }}>
                {lockInput('url247', '247Sports profile URL', 'profileUrl247', 'Auto-discovered nightly for HS players')}
              </div>
            )}
          </>)}
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${G.surfaceBorder}`, display: "flex", gap: 10, flexShrink: 0 }}>
          {initial._rowIndex ? (
            <button onClick={del} disabled={saving} style={{ background: "transparent", border: `1px solid ${G.red}`, borderRadius: 12, padding: "11px 16px", color: G.red, fontWeight: 600, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: ff }}>Delete</button>
          ) : null}
          <button onClick={onCancel} style={{ flex: 1, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "11px", color: G.textSecondary, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, background: saving ? G.surfaceRaised : G.green, border: "none", borderRadius: 12, padding: "11px", color: saving ? G.textTertiary : "#0a0a0a", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: ff }}>
            {saving ? 'Saving...' : initial._rowIndex ? 'Save Changes' : 'Add Athlete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Client card ───────────────────────────────────────────────────────────────
function ClientCard({ client: c, logos, isMobile, onClick }) {
  const [hov, setHov] = useState(false);
  const logoList = [
    ...(c.pro ? c.pro.split(',').map(v => v.trim()).filter(Boolean).map(v => ({ url: lookupLogo(logos, v), label: v })) : []),
    ...(c.publisher ? c.publisher.split(',').map(v => v.trim()).filter(Boolean).map(v => ({ url: lookupLogo(logos, v), label: v })) : []),
    ...(c.label ? c.label.split(',').map(v => v.trim()).filter(Boolean).map(v => ({ url: lookupLogo(logos, v), label: v })) : []),
  ].filter(Boolean);

  // Deduplicate flags
  const seenFlags = new Set();
  const dedupedFlags = [c.country, c.country2, c.country3].filter(Boolean).filter(co => {
    const f = flag(co); if (!f || seenFlags.has(f)) return false; seenFlags.add(f); return true;
  });

  if (isMobile) {
    return (
      <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: `1px solid ${G.surfaceBorder}`, background: hov ? G.surfaceRaised : "transparent", cursor: "pointer", transition: `background 0.15s ${G.ease}` }}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
        <Avatar name={c.name} photoUrl={c.photoUrl} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: G.text, letterSpacing: "-0.02em", marginBottom: 4 }}>{c.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {dedupedFlags.length > 0 && <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{dedupedFlags.map(co => flag(co)).join(' ')}</span>}
            {(c.types || []).length > 0 && <span style={{ fontSize: 13, color: G.textSecondary, fontWeight: 500 }}>{[...(c.types || [])].sort((a,b) => a==='Artist'?-1:b==='Artist'?1:a.localeCompare(b)).join(' · ')}</span>}
          </div>
          {logoList.length > 0 && (
            <div style={{ display: "flex", gap: 5, marginBottom: 6, flexWrap: "wrap" }}>
              {logoList.slice(0,5).map((l, i) => <LogoBadge key={i} url={l.url} label={l.label} size={26} />)}
            </div>
          )}
          {(() => {
            const txt = c.credits?.length ? c.credits.slice(0,4).join(' · ') + (c.credits.length > 4 ? ` +${c.credits.length-4}` : '') : null;
            return txt ? <div style={{ fontSize: 11, color: G.textTertiary, lineHeight: 1.4 }}>{txt}</div> : null;
          })()}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke={G.textTertiary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    );
  }

  const sortedTypes = [...(c.types || [])].sort((a,b) => a==='Artist'?-1:b==='Artist'?1:a.localeCompare(b));
  const topLogos = logoList.slice(0, 5);

  // Bottom content -- credits
  const bottomContent = (() => {
    if (c.credits?.length) {
      const shown = c.credits.slice(0, 6);
      return shown.join(' · ') + (c.credits.length > 6 ? ` +${c.credits.length - 6}` : '');
    }
    return null;
  })();

  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? G.surfaceRaised : G.surface, border: `1px solid ${hov ? G.surfaceBorderLight : G.surfaceBorder}`, borderRadius: 18, overflow: "hidden", cursor: "pointer", transition: `all 0.2s ${G.ease}`, transform: hov ? "translateY(-2px)" : "none", boxShadow: hov ? G.shadowLg : G.shadow }}>

      <div style={{ padding: "18px 18px 16px" }}>
        {/* Top row: avatar left, logos right, same vertical center */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Avatar name={c.name} photoUrl={c.photoUrl} size={80} />
          {topLogos.length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {topLogos.map((l, i) => <LogoBadge key={i} url={l.url} label={l.label} size={38} />)}
            </div>
          )}
        </div>

        {/* Name */}
        <div style={{ fontWeight: 800, fontSize: 20, color: G.text, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 6 }}>{c.name}</div>

        {/* Flag + types as plain text with dots */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: bottomContent ? 10 : 0 }}>
          {dedupedFlags.length > 0 && <span style={{ fontSize: 15, lineHeight: 1 }}>{dedupedFlags.map(co => flag(co)).join(' ')}</span>}
          {dedupedFlags.length > 0 && sortedTypes.length > 0 && <span style={{ color: G.textTertiary, fontSize: 13 }}>·</span>}
          <span style={{ fontSize: 13, color: G.textSecondary, fontWeight: 500 }}>{sortedTypes.join(' · ')}</span>
        </div>

        {/* Bottom -- credits or top tracks */}
        {bottomContent && (
          <div style={{ fontSize: 12, color: G.textTertiary, lineHeight: 1.5 }}>
            {bottomContent}
          </div>
        )}
      </div>
    </div>
  );
}

// Rich roster card — mirrors the "detailed" (1×4) PDF: avatar, name, socials,
// bio, label/PRO logos, supporters, key shows. No releases. Full-width band.
function DetailedClientCard({ client: c, logos, isMobile, onClick }) {
  const [hov, setHov] = useState(false);
  const sortedTypes = [...(c.types || [])].sort((a, b) => a === 'Artist' ? -1 : b === 'Artist' ? 1 : a.localeCompare(b));
  const seenFlags = new Set();
  const flags = [c.country, c.country2, c.country3].filter(Boolean).map(flag).filter(f => f && !seenFlags.has(f) && seenFlags.add(f));
  const loc = [c.city, c.state].filter(Boolean).join(', ');
  const logoItems = [c.pro, c.publisher, c.label].filter(Boolean)
    .flatMap(v => String(v).split(',').map(s => s.trim())).filter(Boolean)
    .map(name => ({ url: lookupLogo(logos, name), label: name }));
  const socials = [
    c.instagram && { icon: <IgIcon size={18} />, url: `https://instagram.com/${c.instagram}` },
    c.twitter && { icon: <TwIcon size={16} />, url: `https://x.com/${c.twitter}` },
    c.tiktok && { icon: <TkIcon size={16} />, url: `https://tiktok.com/@${c.tiktok}` },
    c.spotifyUrl && { icon: <SpotifyIcon size={17} />, url: c.spotifyUrl },
    c.appleMusicUrl && { icon: <AppleMusicIcon size={17} />, url: c.appleMusicUrl },
    c.soundcloudUrl && { icon: <SoundCloudIcon size={19} />, url: c.soundcloudUrl },
    c.youtube && { icon: <YtIcon size={19} />, url: c.youtube },
    c.beatport && { icon: <BeatportIcon size={16} />, url: c.beatport },
  ].filter(Boolean);
  const chips = (label, items) => items?.length > 0 && (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {items.map((it, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 500, color: "#fff", whiteSpace: "nowrap" }}>{it}</span>)}
      </div>
    </div>
  );
  const av = isMobile ? 60 : 76;
  const hasBody = c.bio || c.supporters?.length > 0 || c.keyShows?.length > 0;
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? G.surfaceRaised : G.surface, border: `1px solid ${hov ? G.surfaceBorderLight : G.surfaceBorder}`, borderRadius: 18, padding: isMobile ? 16 : 20, cursor: "pointer", transition: `all 0.18s ${G.ease}`, boxShadow: hov ? G.shadowLg : G.shadow }}>
      {/* Header: avatar + name/roles/socials, logos far right */}
      <div style={{ display: "flex", gap: isMobile ? 14 : 18, alignItems: "flex-start" }}>
        <Avatar name={c.name} photoUrl={c.photoUrl} size={av} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: isMobile ? 18 : 21, color: G.text, letterSpacing: "-0.03em", lineHeight: 1.2 }}>{c.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
            {flags.length > 0 && <span style={{ fontSize: 14, lineHeight: 1 }}>{flags.join(' ')}</span>}
            <span style={{ fontSize: 13, color: G.textSecondary, fontWeight: 500 }}>{sortedTypes.join(' · ')}</span>
            {loc && <><span style={{ color: G.textTertiary, fontSize: 12 }}>·</span><span style={{ fontSize: 13, color: G.textTertiary }}>{loc}</span></>}
          </div>
          {(socials.length > 0 || c.credits?.length > 0) && (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              {socials.length > 0 && (
                <div style={{ display: "flex", gap: 14, alignItems: "center", color: G.textSecondary }}>
                  {socials.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ color: "inherit", display: "flex", transition: `color 0.15s ${G.ease}` }}
                      onMouseEnter={e => e.currentTarget.style.color = G.text} onMouseLeave={e => e.currentTarget.style.color = "inherit"}>
                      {s.icon}
                    </a>
                  ))}
                </div>
              )}
              {c.credits?.map((cr, i) => (
                <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 500, color: G.textSecondary, whiteSpace: "nowrap" }}>{cr}</span>
              ))}
            </div>
          )}
        </div>
        {logoItems.length > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            {logoItems.slice(0, 4).map((l, i) => <LogoBadge key={i} url={l.url} label={l.label} size={34} />)}
          </div>
        )}
      </div>
      {/* Divider, then full-width bio + chips (never left of the photo) */}
      {hasBody && <div style={{ height: 1, background: G.surfaceBorder, margin: "18px 0 0" }} />}
      {c.bio && <div style={{ fontSize: 13, color: G.textSecondary, lineHeight: 1.6, marginTop: 16, display: "-webkit-box", WebkitLineClamp: 8, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.bio}</div>}
      {chips('Supporters', c.supporters)}
      {chips('Key Shows', c.keyShows)}
    </div>
  );
}

// ── Client detail view ────────────────────────────────────────────────────────
// ── Socials module (music client profile, company view) ──────────────────────
// Same card as the sports profile: per-platform follower rows with an up/down
// change arrow (7-day window from the music SocialHistory tab) + total reach.
function MusicSocialsModule({ client: c }) {
  const hist = useAdminTab('socialhistory', 'sheets');
  const key = String(c.name || '').toLowerCase().trim();
  const series = useMemo(() => seriesFromHistory(hist.data?.rows)[key] || [], [hist.data, key]);
  const { pd, days } = useMemo(() => {
    const arr = series;
    const last = arr[arr.length - 1];
    if (!last) return { pd: null, days: 0 };
    const target = last.dt.getTime() - 7 * 86400000;
    let base = arr[0];
    for (const r of arr) if (r !== last && Math.abs(r.dt - target) < Math.abs(base.dt - target)) base = r;
    if (base === last) return { pd: null, days: 0 };
    return {
      pd: {
        ig: base.ig > 0 ? last.ig - base.ig : 0,
        x: base.x > 0 ? last.x - base.x : 0,
        tk: base.tk > 0 ? last.tk - base.tk : 0,
      },
      days: Math.max(1, Math.round((last.dt - base.dt) / 86400000)),
    };
  }, [series]);
  const rows = [
    c.instagram && { icon: <IgIcon size={18} />, platform: 'Instagram', user: `@${c.instagram}`, url: `https://instagram.com/${c.instagram}`, count: c.igFollowers, d: pd?.ig },
    c.twitter && { icon: <TwIcon size={16} />, platform: 'X', user: `@${c.twitter}`, url: `https://x.com/${c.twitter}`, count: c.twitterFollowers, d: pd?.x },
    c.tiktok && { icon: <TkIcon size={16} />, platform: 'TikTok', user: `@${c.tiktok}`, url: `https://tiktok.com/@${c.tiktok}`, count: c.tiktokFollowers, d: pd?.tk },
  ].filter(Boolean);
  if (rows.length === 0) return null;
  const totReach = rows.reduce((s, r) => s + countFrom(r.count), 0);
  const totD = pd ? (pd.ig + pd.x + pd.tk) : null;
  return (
    <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary }}>Social media</div>
        {pd ? <div style={{ fontSize: 11, color: G.textTertiary }}>{days}-day change</div> : null}
      </div>
      {rows.map((r, i) => (
        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < rows.length - 1 ? `1px solid ${G.surfaceBorder}` : "none", textDecoration: "none", color: "#fff" }}>
          {r.icon}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: G.text }}>{r.platform}</div>
            <div style={{ fontSize: 12, color: G.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.user}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>{r.count || '—'}</div>
            {r.d != null && r.d !== 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, color: r.d > 0 ? G.green : G.red }}>{r.d > 0 ? '↑' : '↓'} {bigNum(Math.abs(r.d))}</div>
            )}
          </div>
        </a>
      ))}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 10, marginTop: 2, borderTop: `1px solid ${G.surfaceBorder}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: G.text }}>Total reach</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>{totReach ? bigNum(totReach) : '—'}</div>
          {totD != null && totD !== 0 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: totD > 0 ? G.green : G.red }}>{totD > 0 ? '↑' : '↓'} {bigNum(Math.abs(totD))}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientDetail({ client: c, logos, staff, onBack, onEdit, isMobile, isAdmin }) {
  const proLogo = lookupLogo(logos, c.pro);
  const pubLogo = lookupLogo(logos, c.publisher);
  const lblLogo = lookupLogo(logos, c.label);

  // Build deduplicated location string -- one flag per country, cities separated by bullet
  const typesText = [...(c.types || [])].sort((a,b) => a==='Artist'?-1:b==='Artist'?1:a.localeCompare(b)).join(' \u00b7 ');
  const locationParts = (() => {
    const locs = [
      { city: c.city, state: c.state, country: c.country },
      { city: c.city2, state: c.state2, country: c.country2 },
      { city: c.city3, state: c.state3, country: c.country3 },
    ].filter(l => l.city || l.country);
    if (!locs.length) return null;
    const seen = new Set();
    const flags = locs.map(l => flag(l.country)).filter(f => { if (!f || seen.has(f)) return false; seen.add(f); return true; });
    const cities = locs.map(l => [l.city, l.state].filter(Boolean).join(', ')).filter(Boolean);
    return { flags: flags.join(' '), cities: cities.join(' \u00b7 ') };
  })();
  const locationEl = locationParts && (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {locationParts.flags && <span style={{ fontSize: 16 }}>{locationParts.flags}</span>}
      <span style={{ fontSize: 14, color: "#fff" }}>{locationParts.cities}</span>
    </div>
  );
  const creditsPills = c.credits?.length > 0 && (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {c.credits.map((cr, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 500, color: G.textSecondary, whiteSpace: "nowrap" }}>{cr}</span>)}
    </div>
  );

  // Chip sections for the artist "Supporters" and "Key Shows" lists.
  const chipSection = (label, items) => items?.length > 0 && (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 11 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((it, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 500, color: "#fff", whiteSpace: "nowrap" }}>{it}</span>)}
      </div>
    </div>
  );
  const supportersEl = chipSection('Supporters', c.supporters);
  const keyShowsEl = chipSection('Key Shows', c.keyShows);

  // Action buttons row
  const actionBtn = (content, href, green = false) => href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 7, background: green ? G.greenSubtle : G.surfaceRaised, border: `1px solid ${green ? G.green : G.surfaceBorder}`, borderRadius: 10, padding: "9px 16px", textDecoration: "none", transition: `all 0.15s ${G.ease}`, flexShrink: 0 }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = green ? G.green : G.surfaceBorderLight; e.currentTarget.style.background = green ? "rgba(62,170,120,0.15)" : G.surface; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = green ? G.green : G.surfaceBorder; e.currentTarget.style.background = green ? G.greenSubtle : G.surfaceRaised; }}>
      {content}
    </a>
  ) : null;

  const [bioExpanded, setBioExpanded] = useState(false);

  // Resolve contact name(s) to email(s)
  const contactEmails = (() => {
    if (!c.contact) return [];
    return c.contact.split(',').map(name => {
      const key = name.trim().toLowerCase();
      return staff[key] || { name: name.trim(), email: null };
    });
  })();
  const contactMailto = contactEmails.length
    ? 'mailto:' + contactEmails.filter(s => s.email).map(s => s.email).join(',')
    : 'mailto:';

  // Logo strip -- split comma-separated values so each gets its own cell
  const logoItems = [
    ...(c.pro ? c.pro.split(',').map(v => v.trim()).filter(Boolean).map(v => ({ logo: lookupLogo(logos, v), name: v })) : []),
    ...(c.publisher ? c.publisher.split(',').map(v => v.trim()).filter(Boolean).map(v => ({ logo: lookupLogo(logos, v), name: v })) : []),
    ...(c.label ? c.label.split(',').map(v => v.trim()).filter(Boolean).map(v => ({ logo: lookupLogo(logos, v), name: v })) : []),
  ];

  const BIO_LIMIT = 280;
  const bioTruncated = c.bio && c.bio.length > BIO_LIMIT && !bioExpanded;
  const bioText = bioTruncated ? c.bio.slice(0, BIO_LIMIT).trimEnd() + '...' : c.bio;

  const socialBtns = [
    c.instagram && { icon: <IgIcon size={21} />, url: `https://instagram.com/${c.instagram}` },
    c.twitter && { icon: <TwIcon size={19} />, url: `https://x.com/${c.twitter}` },
    c.tiktok && { icon: <TkIcon size={19} />, url: `https://tiktok.com/@${c.tiktok}` },
    c.spotifyUrl && { icon: <SpotifyIcon size={20} />, url: c.spotifyUrl },
    c.appleMusicUrl && { icon: <AppleMusicIcon size={20} />, url: c.appleMusicUrl },
    c.soundcloudUrl && { icon: <SoundCloudIcon size={22} />, url: c.soundcloudUrl },
    c.youtube && { icon: <YtIcon size={22} />, url: c.youtube },
    c.beatport && { icon: <BeatportIcon size={19} />, url: c.beatport },
  ].filter(Boolean);

  if (isMobile) return (
    <div style={{ flex: 1, overflow: "visible", paddingBottom: 24, position: "relative" }}>
      {c.headerUrl && (
        <div style={{ position: "sticky", top: 0, height: 200, overflow: "hidden", zIndex: 0, pointerEvents: "none" }}>
          <img src={c.headerUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, rgba(8,8,9,0.25) 0%, rgba(8,8,9,0.1) 30%, rgba(8,8,9,0.72) 76%, ${G.bg} 100%)` }} />
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1, marginTop: c.headerUrl ? -200 : 0 }}>
        <div style={{ padding: c.headerUrl ? "120px 16px 16px" : "20px 16px 16px", borderBottom: `1px solid ${G.surfaceBorder}` }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flexShrink: 0, width: 90, height: 90, borderRadius: "50%", overflow: "hidden", border: `2px solid ${G.surfaceBorderLight}` }}>
            <Avatar name={c.name} photoUrl={c.photoUrl} size={90} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", margin: 0, lineHeight: 1.1, flex: 1 }}>{c.name}</h1>
              {c.contact && (
                <a href={contactMailto} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: G.greenSubtle, border: `1.5px solid ${G.green}`, borderRadius: 10, padding: "8px 10px", textDecoration: "none", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke={G.green} strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke={G.green} strokeWidth="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke={G.green} strokeWidth="2" strokeLinecap="round"/></svg>
                </a>
              )}
            </div>
            {typesText && <div style={{ fontSize: 14, color: "#fff", fontWeight: 500 }}>{typesText}</div>}
            {socialBtns.length > 0 && (
              <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                {socialBtns.map((btn, i) => (
                  <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", textDecoration: "none", color: "#fff", transition: "opacity 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 0.65}
                    onMouseLeave={e => e.currentTarget.style.opacity = 1}>
                    {btn.icon}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        {(locationEl || creditsPills) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {locationEl}
            {creditsPills}
          </div>
        )}
        </div>
        <div style={{ padding: "18px 16px", display: "flex", flexDirection: "column", gap: 18, background: G.bg }}>
        {c.bio && (
          <div>
            <p style={{ fontSize: 15, color: G.textSecondary, lineHeight: 1.65, margin: 0 }}>{bioText}</p>
            {c.bio.length > BIO_LIMIT && (
              <button onClick={() => setBioExpanded(v => !v)}
                style={{ background: "none", border: "none", color: G.green, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 0 0", fontFamily: ff, display: "flex", alignItems: "center", gap: 4 }}>
                {bioExpanded ? 'View less' : 'View more'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transform: bioExpanded ? "rotate(90deg)" : "none", transition: `transform 0.2s ${G.ease}` }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
          </div>
        )}
        {supportersEl}
        {keyShowsEl}
        {logoItems.length > 0 && (
          <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 16, display: "grid", gridTemplateColumns: `repeat(${Math.min(logoItems.length, 3)}, 1fr)`, overflow: "hidden" }}>
            {logoItems.map((item, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 12px", borderLeft: i > 0 ? `1px solid ${G.surfaceBorder}` : "none" }}>
                {item.logo && <LogoBadge url={item.logo} label={item.name} size={44} />}
                <span style={{ fontSize: 13, fontWeight: 600, color: G.text, textAlign: "center", marginTop: 2 }}>{item.name}</span>
              </div>
            ))}
          </div>
        )}
        {c.spotifyTopTracks?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 10 }}>Popular</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {c.spotifyTopTracks.map((s, i) => (
                <a key={i} href={s.url || undefined} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", minWidth: 0 }}>
                  {s.artwork
                    ? <img src={s.artwork} alt={s.title} style={{ width: "100%", aspectRatio: "1", borderRadius: 8, objectFit: "cover", display: "block" }} />
                    : <div style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: G.surfaceRaised, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: G.textTertiary }}>♪</div>}
                  <div style={{ fontSize: 10, fontWeight: 600, color: G.text, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                  <div style={{ fontSize: 9, color: G.textTertiary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.artist}</div>
                </a>
              ))}
            </div>
          </div>
        )}
        {!c.spotifyTopTracks?.length && c.spotifyRecentReleases?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 10 }}>Recent Releases</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {c.spotifyRecentReleases.map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", minWidth: 0 }}>
                  {r.artwork && <img src={r.artwork} alt={r.name} style={{ width: "100%", aspectRatio: "1", borderRadius: 8, objectFit: "cover", display: "block" }} />}
                  <div style={{ fontSize: 10, fontWeight: 600, color: G.text, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ fontSize: 9, color: G.textTertiary, marginTop: 1 }}>{r.releaseDate?.slice(0,4)}</div>
                </a>
              ))}
            </div>
          </div>
        )}
        {c.spotifySongCredits?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 10 }}>Songs Worked On</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {c.spotifySongCredits.map((s, i) => (
                <a key={i} href={s.url || undefined} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", minWidth: 0 }}>
                  {s.artwork && <img src={s.artwork} alt={s.title} style={{ width: "100%", aspectRatio: "1", borderRadius: 8, objectFit: "cover", display: "block" }} />}
                  <div style={{ fontSize: 10, fontWeight: 600, color: G.text, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                  <div style={{ fontSize: 9, color: G.textTertiary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.artist}</div>
                </a>
              ))}
            </div>
          </div>
        )}

      </div>
        </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: "visible", position: "relative" }}>
      {c.headerUrl && (
        <div style={{ position: "sticky", top: 0, height: 340, overflow: "hidden", zIndex: 0, pointerEvents: "none" }}>
          <img src={c.headerUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, rgba(8,8,9,0.25) 0%, rgba(8,8,9,0.1) 35%, rgba(8,8,9,0.7) 78%, ${G.bg} 100%)` }} />
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1, marginTop: c.headerUrl ? -340 : 0 }}>
        <div style={{ padding: c.headerUrl ? "220px 32px 24px" : "28px 32px 24px", borderBottom: `1px solid ${G.surfaceBorder}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
          <div style={{ flexShrink: 0, width: 120, height: 120, borderRadius: "50%", overflow: "hidden", border: `2px solid ${G.surfaceBorderLight}` }}>
            <Avatar name={c.name} photoUrl={c.photoUrl} size={120} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
              <h1 style={{ fontSize: 38, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", margin: 0, lineHeight: 1.05, flex: 1 }}>{c.name}</h1>
              {c.contact && (
                <a href={contactMailto} style={{ display: "flex", alignItems: "center", gap: 7, background: G.greenSubtle, border: `1.5px solid ${G.green}`, borderRadius: 10, padding: "9px 14px", textDecoration: "none", flexShrink: 0, marginTop: 4 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke={G.green} strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke={G.green} strokeWidth="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke={G.green} strokeWidth="2" strokeLinecap="round"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 600, color: G.green }}>Contact Rep</span>
                </a>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 4 }}>
              {typesText && <span style={{ fontSize: 15, color: "#fff", fontWeight: 500 }}>{typesText}</span>}
              {locationEl}
            </div>
            <div style={{ display: "flex", gap: 22, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              {socialBtns.length > 0 && (
                <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                  {socialBtns.map((btn, i) => (
                    <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", textDecoration: "none", color: "#fff", transition: "opacity 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 0.65}
                      onMouseLeave={e => e.currentTarget.style.opacity = 1}>
                      {btn.icon}
                    </a>
                  ))}
                </div>
              )}
              {creditsPills}
            </div>
          </div>
        </div>
        </div>
        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20, background: G.bg }}>
        {c.bio && <p style={{ fontSize: 14, color: G.textSecondary, lineHeight: 1.7, margin: 0 }}>{c.bio}</p>}
        {supportersEl}
        {keyShowsEl}
        {logoItems.length > 0 && (
          <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 16, display: "flex", overflow: "hidden" }}>
            {logoItems.map((item, i) => (
              <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "20px 16px", borderLeft: i > 0 ? `1px solid ${G.surfaceBorder}` : "none" }}>
                {item.logo && <LogoBadge url={item.logo} label={item.name} size={40} />}
                <span style={{ fontSize: 15, fontWeight: 600, color: G.text }}>{item.name}</span>
              </div>
            ))}
          </div>
        )}
        {c.spotifyTopTracks?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 10 }}>Popular</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10 }}>
              {c.spotifyTopTracks.map((s, i) => (
                <a key={i} href={s.url || undefined} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", minWidth: 0 }}>
                  {s.artwork
                    ? <img src={s.artwork} alt={s.title} style={{ width: "100%", maxWidth: "100%", aspectRatio: "1", borderRadius: 8, objectFit: "cover", display: "block" }} />
                    : <div style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: G.surfaceRaised, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: G.textTertiary }}>♪</div>}
                  <div style={{ fontSize: 11, fontWeight: 600, color: G.text, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: G.textTertiary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.artist}</div>
                </a>
              ))}
            </div>
          </div>
        )}
        {!c.spotifyTopTracks?.length && c.spotifyRecentReleases?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 10 }}>Recent Releases</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10 }}>
              {c.spotifyRecentReleases.map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", minWidth: 0 }}>
                  {r.artwork && <img src={r.artwork} alt={r.name} style={{ width: "100%", maxWidth: "100%", aspectRatio: "1", borderRadius: 8, objectFit: "cover", display: "block" }} />}
                  <div style={{ fontSize: 11, fontWeight: 600, color: G.text, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: G.textTertiary, marginTop: 1, textTransform: "capitalize" }}>{r.releaseDate?.slice(0,4)}</div>
                </a>
              ))}
            </div>
          </div>
        )}
        {c.spotifySongCredits?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 10 }}>Songs Worked On</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10 }}>
              {c.spotifySongCredits.map((s, i) => (
                <a key={i} href={s.url || undefined} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block", minWidth: 0 }}>
                  {s.artwork && <img src={s.artwork} alt={s.title} style={{ width: "100%", maxWidth: "100%", aspectRatio: "1", borderRadius: 8, objectFit: "cover", display: "block" }} />}
                  <div style={{ fontSize: 11, fontWeight: 600, color: G.text, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: G.textTertiary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.artist}</div>
                </a>
              ))}
            </div>
          </div>
        )}
        {isAdmin && <MusicSocialsModule client={c} />}

        {((isAdmin && c.spotifyMonthly) || c.spotifyFollowers > 0 || c.spotifyPopularity != null) && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {/* Listener counts are internal-only for now — company sessions see
                them, the b2b login doesn't. */}
            {isAdmin && c.spotifyMonthly && (
              <div style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{fmt(c.spotifyMonthly)}</div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: G.textTertiary, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><SpotifyIcon size={9} /> Monthly Listeners</div>
              </div>
            )}
            {c.spotifyFollowers > 0 && (
              <div style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{fmt(c.spotifyFollowers)}</div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: G.textTertiary, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><SpotifyIcon size={9} /> Followers</div>
              </div>
            )}
            {c.spotifyPopularity != null && (
              <div style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{c.spotifyPopularity}<span style={{ fontSize: 12, color: G.textTertiary }}>/100</span></div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: G.textTertiary, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><SpotifyIcon size={9} /> Popularity</div>
              </div>
            )}
          </div>
        )}

        {c.spotifyGenres?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {c.spotifyGenres.map((g, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 500, color: G.textSecondary, textTransform: "capitalize" }}>{g}</span>)}
          </div>
        )}

        {BOX_DOCS_ENABLED && isAdmin && <DocsModule person={c.name} kind="music" />}


        </div>
      </div>
    </div>
  );
}

function ClientFiltersDropdown({ filterContact, setFilterContact, filterLabel, setFilterLabel, filterCountry, setFilterCountry, contacts, labels, countries, activeCount }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const hasActive = activeCount > 0;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: hasActive ? G.greenSubtle : G.surface, border: `1px solid ${hasActive ? G.green : G.surfaceBorder}`, borderRadius: 10, fontFamily: ff, fontSize: 13, fontWeight: hasActive ? 700 : 500, color: hasActive ? G.green : G.textSecondary, cursor: "pointer", transition: `all 0.18s ${G.ease}`, whiteSpace: "nowrap" }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        Filters{hasActive ? ` (${activeCount})` : ""}
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: G.surfaceGlass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 14, padding: 16, zIndex: 500, minWidth: 240, boxShadow: G.shadowLg }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Filters</span>
            {hasActive && <button onClick={() => { setFilterContact("All"); setFilterLabel("All"); setFilterCountry("All"); }} style={{ background: "none", border: "none", color: G.green, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0 }}>Clear all</button>}
          </div>
          {/* Contact */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Contact</div>
            <select value={filterContact} onChange={e => setFilterContact(e.target.value)} style={{ width: "100%", background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: G.text, outline: "none", fontFamily: ff, cursor: "pointer" }}>
              {contacts.map(c => <option key={c} value={c}>{c === "All" ? "All Contacts" : c}</option>)}
            </select>
          </div>
          {/* Record Label */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Record Label</div>
            <select value={filterLabel} onChange={e => setFilterLabel(e.target.value)} style={{ width: "100%", background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: G.text, outline: "none", fontFamily: ff, cursor: "pointer" }}>
              {labels.map(l => <option key={l} value={l}>{l === "All" ? "All Labels" : l}</option>)}
            </select>
          </div>
          {/* Country */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Country</div>
            <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} style={{ width: "100%", background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: G.text, outline: "none", fontFamily: ff, cursor: "pointer" }}>
              {countries.map(c => <option key={c} value={c}>{c === "All" ? "All Countries" : c}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientSortDropdown({ clientSort, setClientSort, compact }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef();
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // Fixed-position menu (anchored to the trigger) so it never gets clipped by a
  // horizontally-scrolling header row.
  const toggle = () => { if (!open && ref.current) { const r = ref.current.getBoundingClientRect(); setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 188)) }); } setOpen(v => !v); };
  const SORTS = [["default","Roster Order"], ["alpha","A – Z"]];
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={toggle}
        style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 6, padding: compact ? "8px 10px" : "8px 14px", background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, fontFamily: ff, fontSize: 13, fontWeight: 500, color: G.textSecondary, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M4 4h8M6 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        {!compact && 'Sort'}
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>
      {open && pos && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, background: G.surfaceGlass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 12, padding: 6, zIndex: 500, minWidth: 180, boxShadow: G.shadowLg }}>
          {SORTS.map(([val, label]) => (
            <button key={val} onClick={() => { setClientSort(val); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: ff, fontSize: 13, fontWeight: clientSort === val ? 700 : 400, color: clientSort === val ? G.green : G.text, textAlign: "left" }}
              onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {label}
              {clientSort === val && <span style={{ color: G.green, fontSize: 12 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Consolidated "View:" dropdown — type multi-select + Custom Group, in one box.
function ViewFilterDropdown({ types, filterTypes, onToggleType, onAll, customCount, onOpenCustom, compact, depthOptions, depthValue, onDepth, mineOn, onMine }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef();
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = () => { if (!open && ref.current) { const r = ref.current.getBoundingClientRect(); setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 228)) }); } setOpen(v => !v); };
  const depthActive = !!depthValue && depthValue !== 'All';
  const active = customCount > 0 || filterTypes.length > 0 || depthActive || !!mineOn;
  const label = customCount > 0 ? `Custom · ${customCount}`
    : ([mineOn ? 'My clients' : null, ...filterTypes, depthActive ? depthValue : null].filter(Boolean).join(', ') || 'All');
  const typeOpts = types.filter(t => t !== 'All');
  const item = (on, content, onClick) => (
    <button onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 12px", background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: ff, fontSize: 13, fontWeight: on ? 700 : 400, color: on ? G.green : G.text, textAlign: "left" }}
      onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {content}
      {on && <span style={{ color: G.green, fontSize: 12 }}>✓</span>}
    </button>
  );
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={toggle}
        style={{ display: "flex", alignItems: "center", gap: compact ? 5 : 7, padding: compact ? "8px 10px" : "8px 14px", background: active ? G.greenSubtle : G.surface, border: `1px solid ${active ? G.green : G.surfaceBorder}`, borderRadius: 10, fontFamily: ff, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? G.green : G.textSecondary, cursor: "pointer", whiteSpace: "nowrap", maxWidth: 280, flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        {/* On mobile (compact) show just the filter icon + caret so the whole
            control row fits without scrolling; the selection lives in the open
            menu, and the box turns green when a filter is active. */}
        {!compact && <span style={{ color: active ? G.green : G.textTertiary, fontWeight: 500, flexShrink: 0 }}>View:</span>}
        {!compact && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
        <span style={{ fontSize: 9, opacity: 0.6, flexShrink: 0 }}>▾</span>
      </button>
      {open && pos && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: 220, background: G.surfaceGlass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 12, padding: 6, zIndex: 500, boxShadow: G.shadowLg }}>
          {item(filterTypes.length === 0 && customCount === 0 && !depthActive && !mineOn, 'All', () => onAll())}
          {onMine && (
            <>
              {item(customCount === 0 && !!mineOn, 'My clients', () => onMine())}
              <div style={{ height: 1, background: G.surfaceBorder, margin: "6px 8px" }} />
            </>
          )}
          {typeOpts.map(t => item(customCount === 0 && filterTypes.includes(t), t, () => onToggleType(t)))}
          {depthOptions && (
            <>
              <div style={{ height: 1, background: G.surfaceBorder, margin: "6px 8px" }} />
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, padding: "6px 12px 3px" }}>Depth chart</div>
              {depthOptions.map(o => item(customCount === 0 && depthValue === o, o, () => onDepth(o)))}
            </>
          )}
          <div style={{ height: 1, background: G.surfaceBorder, margin: "6px 8px" }} />
          {item(customCount > 0, (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Custom Group {customCount > 0 && <span style={{ color: G.green }}>· {customCount}</span>}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
          ), () => { onOpenCustom(); setOpen(false); })}
        </div>
      )}
    </div>
  );
}

// ── Universal filter window (roster / contracts / recruiting) ────────────────
// Level chips live OUTSIDE this menu on each page; the menu holds the rest as
// accordion sections: [{ id, title, value, rows: [{ on, label, onClick }] }].
const POS_SIDES = { Offense: ['QB', 'RB', 'WR', 'TE', 'OL'], Defense: ['DL', 'LB', 'DB'], Specialists: ['ST'] };
const ALL_LEVELS = ['NFL', 'College', 'High School'];
function FilterMenu({ compact, sections, active, label, onAll, mineOn, onMine, mineLabel, customCount = 0, onOpenCustom }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef();
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = () => { if (!open && ref.current) { const r = ref.current.getBoundingClientRect(); setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 278)) }); } setOpen(v => !v); };
  const item = (on, content, onClick, indent) => (
    <button onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: indent ? "7px 12px 7px 28px" : "9px 12px", background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: ff, fontSize: indent ? 12.5 : 13, fontWeight: on ? 700 : 400, color: on ? G.green : G.text, textAlign: "left" }}
      onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {content}
      {on && <span style={{ color: G.green, fontSize: 12 }}>✓</span>}
    </button>
  );
  const divider = () => <div style={{ height: 1, background: G.surfaceBorder, margin: "6px 8px" }} />;
  // Accordion sections — collapsed by default so the menu stays short; click a
  // section (Level / Agent / Position) to reveal its choices.
  const [expanded, setExpanded] = useState('');
  const secHead = (id, title, value) => (
    <button onClick={() => setExpanded(e => e === id ? '' : id)}
      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 12px", background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: ff, fontSize: 13, fontWeight: 600, color: G.text, textAlign: "left" }}
      onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {title}
      <span style={{ display: "flex", alignItems: "center", gap: 6, color: value && value !== 'All' ? G.green : G.textTertiary, fontSize: 12, fontWeight: value && value !== 'All' ? 700 : 500, minWidth: 0 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{value || 'All'}</span>
        <span style={{ fontSize: 9, opacity: 0.7, transform: expanded === id ? 'rotate(180deg)' : 'none', transition: `transform 0.15s ${G.ease}` }}>▾</span>
      </span>
    </button>
  );
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={toggle}
        style={{ display: "flex", alignItems: "center", gap: compact ? 5 : 7, padding: compact ? "8px 10px" : "8px 14px", background: active ? G.greenSubtle : G.surface, border: `1px solid ${active ? G.green : G.surfaceBorder}`, borderRadius: 10, fontFamily: ff, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? G.green : G.textSecondary, cursor: "pointer", whiteSpace: "nowrap", maxWidth: 280, flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        {!compact && <span style={{ color: active ? G.green : G.textTertiary, fontWeight: 500, flexShrink: 0 }}>View:</span>}
        {!compact && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
        <span style={{ fontSize: 9, opacity: 0.6, flexShrink: 0 }}>▾</span>
      </button>
      {open && pos && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: 250, maxHeight: "72vh", overflowY: "auto", background: G.surfaceGlass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 12, padding: 6, zIndex: 500, boxShadow: G.shadowLg }}>
          {item(!active, 'All', () => onAll())}
          {onMine && item(customCount === 0 && !!mineOn, mineLabel || 'My clients', () => onMine())}
          {divider()}
          {(sections || []).map(s => (
            <div key={s.id}>
              {secHead(s.id, s.title, s.value)}
              {expanded === s.id && s.rows.map((r, i) => item(customCount === 0 && r.on, r.label, r.onClick, true))}
            </div>
          ))}
          {onOpenCustom && (
            <>
              {divider()}
              {item(customCount > 0, (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Custom Group {customCount > 0 && <span style={{ color: G.green }}>· {customCount}</span>}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              ), () => { onOpenCustom(); setOpen(false); })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Session-sticky page state: pages unmount when you open an athlete, so their
// filter/sort state lives here and survives the back button (until reload).
const pageStateCache = {};
function useCachedState(key, initial) {
  const [v, setV] = useState(() => (key in pageStateCache ? pageStateCache[key] : initial));
  const set = useCallback((nv) => setV(prev => {
    const next = typeof nv === 'function' ? nv(prev) : nv;
    pageStateCache[key] = next;
    return next;
  }), [key]);
  return [v, set];
}

// Shared level chips (multi-select on roster/contracts; exclusive on recruiting).
function levelChipBtn(on, label, onClick) {
  return (
    <button key={label} onClick={onClick}
      style={{ padding: "7px 13px", border: `1px solid ${on ? G.green : G.surfaceBorder}`, borderRadius: 9, background: on ? G.greenSubtle : G.surfaceRaised, color: on ? G.green : G.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>
      {label}
    </button>
  );
}

// ── Internal login ────────────────────────────────────────────────────────────
function LoginModal({ onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!password || busy) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (r.ok) { window.location.reload(); return; }
      const d = await r.json().catch(() => ({}));
      setError(d.error || 'Incorrect password.'); setBusy(false);
    } catch { setError('Something went wrong. Try again.'); setBusy(false); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: G.shadowLg }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: G.text, marginBottom: 6 }}>Internal login</div>
        <div style={{ fontSize: 13, color: G.textSecondary, marginBottom: 18 }}>Enter the team password to manage the roster.</div>
        <input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Password"
          style={{ width: "100%", background: G.surfaceRaised, border: `1px solid ${error ? G.red : G.surfaceBorder}`, borderRadius: 10, padding: "11px 14px", fontSize: 15, color: G.text, fontFamily: ff, outline: "none", boxSizing: "border-box" }} />
        {error && <div style={{ fontSize: 12, color: G.red, marginTop: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "11px", color: G.textSecondary, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>Cancel</button>
          <button onClick={submit} disabled={busy || !password} style={{ flex: 2, background: busy || !password ? G.surfaceRaised : G.green, border: "none", borderRadius: 10, padding: "11px", color: busy || !password ? G.textTertiary : "#0a0a0a", fontWeight: 700, fontSize: 14, cursor: busy || !password ? "not-allowed" : "pointer", fontFamily: ff }}>{busy ? 'Checking…' : 'Log in'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Sports (athletes) ─────────────────────────────────────────────────────────
const LEVEL_COLORS = { 'NFL': '#3eaa78', 'College': '#3b82f6', 'High School': '#d97706' };
const levelColor = l => LEVEL_COLORS[l] || G.textSecondary;
const LEAGUE_RANK = { 'NFL': 0, 'College': 1, 'High School': 2 };
const parseReach = v => {
  if (!v) return 0;
  const s = String(v).trim().toUpperCase();
  const n = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
  if (s.includes('M')) return n * 1e6;
  if (s.includes('K')) return n * 1e3;
  return n;
};
const athleteReach = a => parseReach(a.igFollowers) + parseReach(a.twitterFollowers) + parseReach(a.tiktokFollowers);

// ── Marketability score (50–100) — internal only ─────────────────────────────
// Absolute scales (an athlete's score never depends on teammates). Every
// athlete starts at 50; Reach +24 · Role +15 (depth chart / 247 pedigree,
// weighted by position — a starting LT outranks a 3rd-string QB) ·
// Team +7 (league-tilted: NFL ≥ top college brands) · Momentum +3 · Trajectory +2.
// Weighting philosophy: proven audience is direct EVIDENCE of marketability,
// so it carries the most weight; role/position/program are predictive proxies
// that matter most for athletes whose audience hasn't arrived yet. Momentum
// is a bonus, never a drag.
// College program points by conference: SEC / Big Ten / Notre Dame on top
// (with an elite cut above the rest), then ACC / Big 12 (their elites match
// standard SEC/B1G programs but not the Ohio States), then other FBS.
const CONF_TIERS = [
  // 10 — elite SEC / Big Ten brands + Notre Dame
  [10, ['georgia', 'alabama', 'ohio state', 'michigan', 'texas', 'lsu', 'oregon', 'penn state', 'usc', 'oklahoma', 'tennessee', 'notre dame', 'florida', 'indiana']],
  // 8 — rest of SEC + Big Ten, and elite ACC / Big 12 programs
  [8, ['auburn', 'texas a&m', 'arkansas', 'kentucky', 'missouri', 'mississippi state', 'ole miss', 'south carolina', 'vanderbilt',
    'illinois', 'iowa', 'maryland', 'michigan state', 'minnesota', 'nebraska', 'northwestern', 'purdue', 'rutgers', 'ucla', 'washington', 'wisconsin',
    'clemson', 'florida state', 'miami', 'texas tech', 'colorado', 'utah', 'byu']],
  // 6 — rest of ACC + Big 12
  [6, ['boston college', 'california', 'cal', 'duke', 'georgia tech', 'louisville', 'nc state', 'north carolina', 'pittsburgh', 'pitt', 'smu', 'stanford', 'syracuse', 'virginia', 'virginia tech', 'wake forest',
    'arizona', 'arizona state', 'baylor', 'cincinnati', 'houston', 'iowa state', 'kansas', 'kansas state', 'oklahoma state', 'tcu', 'ucf', 'west virginia']],
];
function collegeProgramPts(name, hasLogo) {
  const k = String(name || '').toLowerCase().trim();
  if (!k) return 3;
  for (const [pts, list] of CONF_TIERS) if (list.includes(k)) return pts;
  return hasLogo ? 5 : 3; // recognized G5 / other FBS · unknown or small school
}
const MARQUEE_NFL = new Set(['kansas city chiefs', 'dallas cowboys', 'san francisco 49ers', 'philadelphia eagles', 'green bay packers', 'pittsburgh steelers', 'new york giants', 'new york jets', 'chicago bears', 'denver broncos']);
// Position multiplier inside the role factor: QBs sell, specialists don't.
const POS_FACTOR = { QB: 1, WR: 0.85, RB: 0.85, TE: 0.7, DB: 0.55, DL: 0.55, LB: 0.55, OL: 0.55, ST: 0.25 };
function computeMarketability(a, series, s247) {
  const c01 = v => Math.max(0, Math.min(1, v));
  const lc = s => String(s || '').toLowerCase().trim();
  const reach = 24 * c01((Math.log10(Math.max(athleteReach(a), 1)) - 3) / 4); // 1K → 0 · 10M+ → max
  const pct = Math.max(0, parseFloat(a.growth7dPct) || 0);
  const momentum = 2 * c01(pct / 3) + 1 * c01((a.growth7d || 0) / 25000); // 3%/wk or +25K/wk → max
  const fa = /free agent|retired/i.test(String(a.status || '')) || /free agent/i.test(String(a.nflTeam || ''));
  const posF = POS_FACTOR[contractPosGroup(a.position)] ?? 0.5;
  let role;
  if (a.level === 'High School') {
    const stars = Math.round(parseFloat(s247?.stars) || 0);
    const starF = [0.1, 0.15, 0.3, 0.55, 0.85, 1][Math.max(0, Math.min(5, stars))];
    role = 15 * starF * (0.55 + 0.45 * posF);
  } else {
    const depthF = a.depthRank === 1 ? 1 : a.depthRank === 2 ? 0.65 : a.depthRank === 3 ? 0.4 : a.depthRank > 3 ? 0.28 : 0.22;
    role = 15 * depthF * (0.55 + 0.45 * posF);
    if (fa) role = Math.min(role, 3);
  }
  // Team points carry a slight league tilt: any NFL team ≥ the best college
  // brands (Georgia 6 < Cowboys 7), and HS commitments inherit at 80%.
  const PROG_SCALE = { 10: 6, 8: 5, 6: 4, 5: 3, 3: 2 };
  let program = 2;
  if (a.level === 'NFL') program = fa ? 2 : MARQUEE_NFL.has(lc(a.nflTeam)) ? 7 : 6;
  else if (a.level === 'College') program = PROG_SCALE[collegeProgramPts(a.college, !!a.teamLogo)] || 2;
  else program = a.committedTo ? Math.max(2, Math.round((PROG_SCALE[collegeProgramPts(a.committedTo, true)] || 2) * 0.8)) : 2;
  // Trajectory: did this week's follower gain beat last week's?
  let trajectory = 0;
  if (series && series.length >= 3) {
    const at = t => { let best = series[0]; for (const p of series) if (Math.abs(p.dt - t) < Math.abs(best.dt - t)) best = p; return best; };
    const last = series[series.length - 1];
    const w1 = at(last.dt.getTime() - 7 * 86400000), w2 = at(last.dt.getTime() - 14 * 86400000);
    if (w1 !== last && w2 !== w1) {
      const cur = last.total - w1.total, prev = w1.total - w2.total;
      if (cur > prev) trajectory = 2 * c01((cur - prev) / Math.max(prev, 500));
    }
  }
  const parts = [
    ['Reach', Math.round(reach), 24],
    [a.level === 'High School' ? 'Pedigree' : 'Role', Math.round(role), 15],
    ['Team', Math.round(program), 7],
    ['Momentum', Math.round(momentum), 3],
    ['Trajectory', Math.round(trajectory), 2],
  ];
  return { score: Math.min(100, 50 + parts.reduce((s, p) => s + p[1], 0)), parts };
}
// Latest 247 snapshot per athlete from the StatHistory tab (later rows win).
function latest247From(rows) {
  const out = {};
  for (const r of rows || []) {
    const c = r.cells || [];
    const k = String(c[1] || '').toLowerCase().trim();
    if (k && (c[4] || c[5] || c[6] || c[7])) out[k] = { rating: c[4], stars: c[5], nat: c[6], pos: c[7] };
  }
  return out;
}

// Team logo in a white rounded tile, matching the music favicon badges.
function TeamLogo({ url, size = 38 }) {
  if (!url) return null;
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.12)", flexShrink: 0 }}>
      <img src={url} alt="" referrerPolicy="no-referrer" style={{ width: "82%", height: "82%", objectFit: "contain", display: "block" }} />
    </div>
  );
}

function SportsCard({ athlete: a, isMobile, onClick, showDepth }) {
  const [hov, setHov] = useState(false);
  const team = a.nflTeam || a.college || '';
  const meta = [a.position, a.jerseyNumber && `#${a.jerseyNumber}`, team].filter(Boolean).join(' · ');
  // Employee-only depth tag ("RT1" = starting right tackle, per Ourlads).
  const depthTag = showDepth && a.depthRank > 0 ? (
    <span style={{ fontSize: 10, fontWeight: 700, color: a.depthRank === 1 ? G.green : G.textSecondary, background: a.depthRank === 1 ? G.greenSubtle : G.surfaceRaised, border: `1px solid ${a.depthRank === 1 ? G.greenBorder : G.surfaceBorder}`, borderRadius: 6, padding: "1px 6px", marginLeft: 7, whiteSpace: "nowrap", verticalAlign: "middle" }}>
      {a.depthPos}{a.depthRank}
    </span>
  ) : null;
  if (isMobile) return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: `1px solid ${G.surfaceBorder}`, background: hov ? G.surfaceRaised : "transparent", cursor: "pointer", transition: `background 0.15s ${G.ease}` }}>
      <Avatar name={a.name} photoUrl={a.photoUrl} size={56} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: G.text, letterSpacing: "-0.02em", marginBottom: 4 }}>{a.name}</div>
        <div style={{ fontSize: 13, color: G.textSecondary }}>{meta}{depthTag}</div>
      </div>
      <TeamLogo url={a.teamLogo} size={30} />
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke={G.textTertiary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  );
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? G.surfaceRaised : G.surface, border: `1px solid ${hov ? G.surfaceBorderLight : G.surfaceBorder}`, borderRadius: 18, overflow: "hidden", cursor: "pointer", transition: `all 0.2s ${G.ease}`, transform: hov ? "translateY(-2px)" : "none", boxShadow: hov ? G.shadowLg : G.shadow }}>
      <div style={{ padding: "18px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Avatar name={a.name} photoUrl={a.photoUrl} size={80} />
          <TeamLogo url={a.teamLogo} size={38} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, color: G.text, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 6 }}>{a.name}</div>
        <div style={{ fontSize: 14, color: G.textSecondary }}>{meta}{depthTag}</div>
      </div>
    </div>
  );
}

// Rich roster card for athletes — mirrors the music DetailedClientCard:
// header (avatar + name + position/team + socials, team logo top-right), a
// divider, then full-width bio, Brands and Interests. No releases.
function DetailedAthleteCard({ athlete: a, isMobile, onClick }) {
  const [hov, setHov] = useState(false);
  const team = a.nflTeam || a.college || '';
  const meta = [a.position, a.jerseyNumber && `#${a.jerseyNumber}`, team].filter(Boolean).join(' · ');
  const socials = [
    a.instagram && { icon: <IgIcon size={18} />, url: `https://instagram.com/${a.instagram}`, count: a.igFollowers },
    a.twitter && { icon: <TwIcon size={16} />, url: `https://x.com/${a.twitter}`, count: a.twitterFollowers },
    a.tiktok && { icon: <TkIcon size={16} />, url: `https://tiktok.com/@${a.tiktok}`, count: a.tiktokFollowers },
  ].filter(Boolean);
  const chips = (label, items) => items?.length > 0 && (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {items.map((it, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 500, color: "#fff", whiteSpace: "nowrap" }}>{it}</span>)}
      </div>
    </div>
  );
  const av = isMobile ? 60 : 76;
  const hasBody = a.bio || a.brands?.length > 0 || a.interests?.length > 0;
  return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? G.surfaceRaised : G.surface, border: `1px solid ${hov ? G.surfaceBorderLight : G.surfaceBorder}`, borderRadius: 18, padding: isMobile ? 16 : 20, cursor: "pointer", transition: `all 0.18s ${G.ease}`, boxShadow: hov ? G.shadowLg : G.shadow }}>
      <div style={{ display: "flex", gap: isMobile ? 14 : 18, alignItems: "flex-start" }}>
        <Avatar name={a.name} photoUrl={a.photoUrl} size={av} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: isMobile ? 18 : 21, color: G.text, letterSpacing: "-0.03em", lineHeight: 1.2 }}>{a.name}</div>
          {meta && <div style={{ fontSize: 13, color: G.textSecondary, fontWeight: 500, marginTop: 5 }}>{meta}</div>}
          {socials.length > 0 && (
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 12, color: G.textSecondary }}>
              {socials.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  style={{ display: "flex", alignItems: "center", gap: 6, color: "inherit", textDecoration: "none", transition: `color 0.15s ${G.ease}` }}
                  onMouseEnter={e => e.currentTarget.style.color = G.text} onMouseLeave={e => e.currentTarget.style.color = "inherit"}>
                  {s.icon}{s.count && <span style={{ fontSize: 12, fontWeight: 700 }}>{s.count}</span>}
                </a>
              ))}
            </div>
          )}
        </div>
        {a.teamLogo && <TeamLogo url={a.teamLogo} size={44} />}
      </div>
      {hasBody && <div style={{ height: 1, background: G.surfaceBorder, margin: "16px 0 0" }} />}
      {a.bio && <div style={{ fontSize: 13, color: G.textSecondary, lineHeight: 1.6, marginTop: 14, display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.bio}</div>}
      {chips('Brands', a.brands)}
      {chips('Interests', a.interests)}
    </div>
  );
}

// 247Sports rating chip for HS roster players (company view only) — reads the
// latest StatHistory snapshot: stars, national rank, position rank.
function Rank247Chip({ name, position }) {
  const hist = useAdminTab('stathistory');
  const info = useMemo(() => {
    const rows = hist.data?.rows || [];
    const k = String(name || '').toLowerCase().trim();
    // Cols: date | name | depthRank | depthPos | rating247 | stars247 | natRank247 | posRank247 | stateRank247
    for (let i = rows.length - 1; i >= 0; i--) {
      const c = rows[i].cells || [];
      if (String(c[1] || '').toLowerCase().trim() === k && (c[5] || c[6] || c[7])) {
        return { stars: c[5], nat: c[6], pos: c[7] };
      }
    }
    return null;
  }, [hist.data, name]);
  if (!info) return null;
  const chips = [
    info.stars && `${info.stars}★`,
    info.nat && `#${info.nat} National`,
    info.pos && `#${info.pos} ${position || 'Position'}`,
  ].filter(Boolean);
  if (!chips.length) return null;
  return (
    <>
      {chips.map(c => (
        <span key={c} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: G.green, background: G.greenSubtle, border: `1px solid ${G.greenBorder}`, borderRadius: 7, padding: "3px 9px", whiteSpace: "nowrap" }}>
          {c}
        </span>
      ))}
    </>
  );
}

// Roster search: matches name, position, team/school, commitment, or agent.
function athleteSearchMatch(a, q) {
  return [a.name, a.position, a.nflTeam, a.college, a.committedTo, a.agentAssigned]
    .some(v => String(v || '').toLowerCase().includes(q));
}

// ── Documents module (Box-backed) ─────────────────────────────────────────────
// Per-person folder in the company Box (Athletes/<name> or Clients/<name>).
// The server hands back a token scoped to just that one folder, so uploads go
// browser → Box directly and never hit the serverless body-size ceiling.
//
const BOX_DOCS_ENABLED = true;
function DocsModule({ person, kind }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef();
  const load = useCallback(() => {
    fetch(`/api/box?person=${encodeURIComponent(person)}&kind=${kind}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setErr(''); })
      .catch(e => setErr(e.message));
  }, [person, kind]);
  useEffect(() => { setData(null); setErr(''); load(); }, [load]);
  const uploadFiles = async (files) => {
    if (!data || !files?.length || busy) return;
    setBusy(true);
    try {
      for (const f of files) {
        const form = new FormData();
        form.append('attributes', JSON.stringify({ name: f.name, parent: { id: String(data.folderId) } }));
        form.append('file', f);
        let r = await fetch('https://upload.box.com/api/2.0/files/content', { method: 'POST', headers: { Authorization: `Bearer ${data.token}` }, body: form });
        if (r.status === 409) {
          // Same filename already in the folder — save as a new version instead.
          const conflict = await r.json().catch(() => null);
          const existingId = conflict?.context_info?.conflicts?.id;
          if (existingId) {
            const vf = new FormData();
            vf.append('attributes', JSON.stringify({ name: f.name }));
            vf.append('file', f);
            r = await fetch(`https://upload.box.com/api/2.0/files/${existingId}/content`, { method: 'POST', headers: { Authorization: `Bearer ${data.token}` }, body: vf });
          }
        }
        if (!r.ok) throw new Error(`Upload failed for ${f.name}`);
      }
      load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };
  const download = async (id) => {
    try {
      const d = await (await fetch(`/api/box?download=${encodeURIComponent(id)}`)).json();
      if (d.url) window.open(d.url, '_blank');
      else throw new Error(d.error || 'Download failed');
    } catch (e) { alert(e.message); }
  };
  // Click a row → Box's hosted preview (shared modal).
  const [preview, setPreview] = useState(null);
  const del = async (f) => {
    if (!window.confirm(`Delete ${f.name}? It moves to the Box trash.`)) return;
    setBusy(true);
    try {
      const d = await (await fetch('/api/box', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', fileId: f.id }) })).json();
      if (d.error) throw new Error(d.error);
      load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };
  const fmtSize = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
  return (
    <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); uploadFiles([...e.dataTransfer.files]); }}
      style={{ background: G.surface, border: drag ? `1px dashed ${G.green}` : `1px solid ${G.surfaceBorder}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary }}>Documents</div>
        <button onClick={() => fileRef.current?.click()} disabled={!data || busy}
          style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, color: data && !busy ? G.green : G.textTertiary, cursor: data && !busy ? "pointer" : "default", padding: "5px 11px", fontSize: 12, fontWeight: 600, fontFamily: ff }}>
          {busy ? 'Working…' : '+ Upload'}
        </button>
        <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => { uploadFiles([...e.target.files]); e.target.value = ''; }} />
      </div>
      {err ? <div style={{ fontSize: 13, color: G.textTertiary }}>{err}</div>
        : !data ? <div style={{ fontSize: 13, color: G.textTertiary }}>Loading…</div>
        : data.items.length === 0 ? <div style={{ fontSize: 13, color: G.textTertiary }}>No documents yet — drop files here or hit Upload.</div>
        : data.items.map((f, i, arr) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${G.surfaceBorder}` }}>
            <div onClick={() => setPreview(f)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: G.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
              <div style={{ fontSize: 11, color: G.textTertiary, marginTop: 1 }}>
                {fmtSize(f.size)}{f.modifiedAt ? ` · ${new Date(f.modifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
              </div>
            </div>
            <button onClick={() => download(f.id)} title="Download"
              style={{ background: "transparent", border: "none", color: G.textSecondary, cursor: "pointer", padding: 4, display: "flex" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button onClick={() => del(f)} title="Delete"
              style={{ background: "transparent", border: "none", color: G.textTertiary, cursor: "pointer", padding: 4, fontSize: 13, fontFamily: ff }}>✕</button>
          </div>
        ))}

      {preview && <BoxPreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// Box preview in a modal — fetches an expiring embed link (~60 min) for the
// file and frames Box's hosted renderer. Pass { id, name }.
function BoxPreviewModal({ file, onClose }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let dead = false;
    fetch(`/api/box?preview=${encodeURIComponent(file.id)}`)
      .then(r => r.json())
      .then(d => { if (!dead) { if (d.url) setUrl(d.url); else throw new Error(d.error || 'Preview failed'); } })
      .catch(e => { if (!dead) { onClose(); alert(e.message); } });
    return () => { dead = true; };
  }, [file.id]);
  const download = async () => {
    try {
      const d = await (await fetch(`/api/box?download=${encodeURIComponent(file.id)}`)).json();
      if (d.url) window.open(d.url, '_blank');
      else throw new Error(d.error || 'Download failed');
    } catch (e) { alert(e.message); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: G.surface, border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 16, width: "100%", maxWidth: 1000, height: "86vh", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalIn .18s ease" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: G.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
          <button onClick={download}
            style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 9, color: G.green, cursor: "pointer", padding: "6px 12px", fontSize: 12, fontWeight: 600, fontFamily: ff }}>Download</button>
          <button onClick={onClose}
            style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 9, color: G.textSecondary, cursor: "pointer", padding: "6px 11px", fontSize: 13, fontFamily: ff }}>✕</button>
        </div>
        {url
          ? <iframe title={file.name} src={url} allowFullScreen style={{ flex: 1, width: "100%", border: "none", background: "#0a0a0a" }} />
          : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: G.textTertiary, fontSize: 13 }}>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: 8 }}>⟳</span> Loading preview…
            </div>}
      </div>
    </div>
  );
}

function SportsDetail({ athlete: a, isMobile, hideContact, companyView }) {
  const [bioExp, setBioExp] = useState(false);
  const team = a.nflTeam || a.college || '';
  const typeLine = [a.position, a.jerseyNumber && `#${a.jerseyNumber}`, team].filter(Boolean).join('  ·  ');
  const socialBtns = [
    a.instagram && { icon: <IgIcon size={isMobile ? 20 : 22} />, url: `https://instagram.com/${a.instagram}`, count: a.igFollowers },
    a.twitter && { icon: <TwIcon size={isMobile ? 18 : 20} />, url: `https://x.com/${a.twitter}`, count: a.twitterFollowers },
    a.tiktok && { icon: <TkIcon size={isMobile ? 18 : 20} />, url: `https://tiktok.com/@${a.tiktok}`, count: a.tiktokFollowers },
  ].filter(Boolean);
  // Facts that read as prose beneath the bio.
  const weightTxt = a.weight && (/^\d+(\.\d+)?$/.test(String(a.weight).trim()) ? `${a.weight} lbs` : a.weight);
  const meta = [
    (a.height || weightTxt) && ['Height/Weight', [a.height, weightTxt].filter(Boolean).join(' · ')],
    a.hometown && ['Hometown', a.hometown],
    a.classOf && ['Class of', a.classOf],
    a.committedTo && ['Committed', a.committedTo],
    (a.draftYear || a.draftRound || a.draftPick) && ['Draft', [a.draftYear, a.draftRound && `R${a.draftRound}`, a.draftPick && `P${a.draftPick}`].filter(Boolean).join(' ')],
  ].filter(Boolean);
  const banner = a.heroImageUrl;
  const bannerH = isMobile ? 200 : 340;
  const avSize = isMobile ? 90 : 120;
  const pad = isMobile ? 16 : 32;
  const BIO_LIMIT = 280;
  const bioTrunc = a.bio && a.bio.length > BIO_LIMIT && !bioExp;
  const bioText = bioTrunc ? a.bio.slice(0, BIO_LIMIT).trimEnd() + '...' : a.bio;

  return (
    <div style={{ flex: 1, overflow: "visible", position: "relative" }}>
      {banner && (
        <div style={{ position: "sticky", top: 0, height: bannerH, overflow: "hidden", zIndex: 0, pointerEvents: "none" }}>
          <img src={banner} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, rgba(8,8,9,0.25) 0%, rgba(8,8,9,0.1) 35%, rgba(8,8,9,0.72) 78%, ${G.bg} 100%)` }} />
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1, marginTop: banner ? -bannerH : 0 }}>
        <div style={{ position: "relative", padding: banner ? `${bannerH - avSize / 2}px ${pad}px 20px` : `${pad}px ${pad}px 20px`, borderBottom: `1px solid ${G.surfaceBorder}` }}>
          <div style={{ display: "flex", gap: isMobile ? 16 : 24, alignItems: "flex-end" }}>
            <div style={{ flexShrink: 0, width: avSize, height: avSize, borderRadius: "50%", overflow: "hidden", border: `2px solid ${G.surfaceBorderLight}` }}>
              <Avatar name={a.name} photoUrl={a.photoUrl} size={avSize} />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
              {/* Name + Contact button on one line (mirrors the music detail page). */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <h1 style={{ fontSize: isMobile ? 28 : 38, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", margin: 0, lineHeight: 1.05, flex: 1, minWidth: 0 }}>{a.name}</h1>
                {!hideContact && (
                  <a href={`mailto:marketing@milkhoneysports.com?subject=${encodeURIComponent('Partnership inquiry — ' + a.name)}`}
                    style={{ display: "flex", alignItems: "center", gap: 7, background: G.greenSubtle, border: `1.5px solid ${G.green}`, borderRadius: 10, padding: isMobile ? "8px 10px" : "9px 14px", textDecoration: "none", flexShrink: 0, marginTop: 4 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" stroke={G.green} strokeWidth="2"/><path d="m22 6-10 7L2 6" stroke={G.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {!isMobile && <span style={{ fontSize: 13, fontWeight: 600, color: G.green }}>Contact</span>}
                  </a>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7, flexWrap: "wrap" }}>
                <TeamLogo url={a.teamLogo} size={26} />
                {typeLine && <span style={{ fontSize: isMobile ? 14 : 15, color: "#fff", fontWeight: 500 }}>{typeLine}</span>}
                {companyView && a.depthRank > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: a.depthRank === 1 ? G.green : G.textSecondary, background: a.depthRank === 1 ? G.greenSubtle : "rgba(255,255,255,0.07)", border: `1px solid ${a.depthRank === 1 ? G.greenBorder : "rgba(255,255,255,0.18)"}`, borderRadius: 7, padding: "3px 9px", whiteSpace: "nowrap" }}>
                    {a.depthRank === 1 ? 'Starter' : a.depthRank === 2 ? '2nd string' : a.depthRank === 3 ? '3rd string' : `${a.depthRank}th string`}{a.depthPos ? ` · ${a.depthPos}` : ''}
                  </span>
                )}
                {companyView && a.level === 'High School' && <Rank247Chip name={a.name} position={a.position} />}
              </div>
              {/* Company view keeps the icons but the counts live in the socials module below. */}
              {socialBtns.length > 0 && (
                <div style={{ display: "flex", gap: isMobile ? 16 : 24, marginTop: 13, alignItems: "center", flexWrap: "wrap" }}>
                  {socialBtns.map((b, i) => (
                    <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 7, color: "#fff", textDecoration: "none", transition: "opacity 0.15s" }} onMouseEnter={e => e.currentTarget.style.opacity = 0.65} onMouseLeave={e => e.currentTarget.style.opacity = 1}>
                      {b.icon}
                      {!companyView && b.count && <span style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: "#fff" }}>{b.count}</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ padding: `24px ${pad}px`, display: "flex", flexDirection: "column", gap: 20, background: G.bg }}>
          {a.bio && (
            <div>
              <p style={{ fontSize: isMobile ? 15 : 14, color: G.textSecondary, lineHeight: 1.7, margin: 0 }}>{isMobile ? bioText : a.bio}</p>
              {isMobile && a.bio.length > BIO_LIMIT && <button onClick={() => setBioExp(v => !v)} style={{ background: "none", border: "none", color: G.green, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 0 0", fontFamily: ff }}>{bioExp ? 'View less' : 'View more'}</button>}
            </div>
          )}
          {(meta.length > 0 || a.agentAssigned) && (
            <div style={{ fontSize: isMobile ? 15 : 14, color: G.textSecondary, lineHeight: 1.7, marginTop: a.bio ? -8 : 0 }}>
              {a.agentAssigned && (
                <div style={{ margin: "2px 0 10px" }}>
                  <span style={{ display: "inline-block", fontSize: 12, fontWeight: 600, color: G.text, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, padding: "5px 11px" }}>
                    <span style={{ color: G.textTertiary }}>Agent · </span>{a.agentAssigned}
                  </span>
                </div>
              )}
              {meta.map(([label, value], i) => (
                <div key={i}><span style={{ color: G.textTertiary }}>{label} · </span>{value}</div>
              ))}
            </div>
          )}
          {companyView && <SocialContractModules athlete={a} isMobile={isMobile} />}
          {companyView && <BrandDealsModule athlete={a} />}
          {(() => {
            // Up to four chip modules side by side: worked-with + interests are
            // partner-visible; targets + music tastes are company-only intel.
            const chipCard = (title, items) => (items?.length > 0 ? (
              <div key={title} style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 11 }}>{title}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {items.map((v, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 500, color: "#fff", whiteSpace: "nowrap" }}>{v}</span>)}
                </div>
              </div>
            ) : null);
            const cards = [
              chipCard('Brands worked with', a.brands),
              chipCard('Interests', a.interests),
              companyView && chipCard('Brand targets', a.brandTargets),
              companyView && chipCard('Music artists', a.musicArtists),
            ].filter(Boolean);
            if (!cards.length) return null;
            return (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(cards.length, 4)}, 1fr)`, gap: 12 }}>
                {cards}
              </div>
            );
          })()}
          {companyView && (() => {
            const sizes = [['Shirt', a.shirtSize], ['Hoodie', a.hoodieSize], ['Shorts', a.shortsSize], ['Pants', a.sweatpantsSize], ['Shoes', a.shoeSize], ['Gloves', a.glovesSize], ['Gaming', a.gamingSystem]]
              .filter(([, v]) => String(v || '').trim());
            return (
              <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 11 }}>Apparel & gear</div>
                {sizes.length === 0
                  ? <div style={{ fontSize: 13, color: G.textTertiary }}>No sizes on file yet.</div>
                  : (
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: "14px 12px" }}>
                      {sizes.map(([l, v]) => (
                        <div key={l}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: G.textTertiary }}>{l}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: G.text, marginTop: 3 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            );
          })()}
          {a.profileUrl247 && (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <a href={a.profileUrl247} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: G.green, textDecoration: "none", fontWeight: 600 }}>247Sports profile →</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Search-and-add picker for building a custom group of clients/athletes.
function CustomGroupPicker({ items, selected, groupTitle, onToggle, onClear, onClose, onSmartSearch, domain, isAdmin }) {
  const [q, setQ] = useState('');
  const [ai, setAi] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const ql = q.trim().toLowerCase();
  const list = ql ? items.filter(it => it.name.toLowerCase().includes(ql) || (it.subtitle || '').toLowerCase().includes(ql)) : items;
  const runAi = async () => {
    const query = ai.trim();
    if (!query || aiBusy || !onSmartSearch) return;
    setAiBusy(true); setAiError('');
    try { await onSmartSearch(query); }
    catch (e) { setAiError(e.message || 'Search failed'); }
    setAiBusy(false);
  };
  const aiPlaceholder = domain === 'sports' ? "e.g. defensive players in the Midwest" : "e.g. producers signed to BMI";
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "rgba(18,18,20,0.98)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 24, width: "100%", maxWidth: 460, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: G.shadowLg, overflow: "hidden" }}>
        <div style={{ padding: "20px 22px 14px", borderBottom: `1px solid ${G.surfaceBorder}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: G.text }}>Custom group {selected.length > 0 && <span style={{ color: G.green }}>· {selected.length}</span>}</div>
            <button onClick={onClose} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "6px 12px", fontSize: 14, fontFamily: ff }}>Done</button>
          </div>
          {/* AI smart search — natural language → group (admins only; sees full sheet data) */}
          {isAdmin && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={ai} onChange={e => { setAi(e.target.value); setAiError(''); }} onKeyDown={e => e.key === 'Enter' && runAi()}
                    placeholder={aiPlaceholder}
                    style={{ ...inputBase, padding: "11px 14px", fontSize: 14, border: `1px solid ${G.greenBorder}` }} />
                  <button onClick={runAi} disabled={aiBusy || !ai.trim()}
                    style={{ background: aiBusy || !ai.trim() ? G.surfaceRaised : G.green, color: aiBusy || !ai.trim() ? G.textTertiary : "#0a0a0a", border: "none", borderRadius: 10, padding: "0 16px", fontWeight: 700, fontSize: 13, cursor: aiBusy || !ai.trim() ? "default" : "pointer", fontFamily: ff, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                    {aiBusy ? <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span> : '✨'} Find
                  </button>
                </div>
                <div style={{ fontSize: 11, color: G.textTertiary, marginTop: 6 }}>Describe a group in plain English — AI builds it from the full roster.</div>
                {aiError && <div style={{ fontSize: 12, color: G.red, marginTop: 6 }}>{aiError}</div>}
                {groupTitle && !aiError && <div style={{ fontSize: 12, color: G.green, marginTop: 6, fontWeight: 600 }}>✓ {groupTitle} · {selected.length}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 12px" }}>
                <div style={{ flex: 1, height: 1, background: G.surfaceBorder }} />
                <span style={{ fontSize: 10, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.08em" }}>or add manually</span>
                <div style={{ flex: 1, height: 1, background: G.surfaceBorder }} />
              </div>
            </>
          )}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search to add…"
            style={{ ...inputBase, padding: "11px 14px", fontSize: 14 }} />
        </div>
        <div style={{ overflowY: "auto", padding: "8px 10px", flex: 1 }}>
          {list.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: G.textTertiary, fontSize: 13 }}>No matches.</div>
          ) : list.map((it, i) => {
            const on = selected.includes(it.name);
            return (
              <div key={it.name || i} onClick={() => onToggle(it.name)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 12, cursor: "pointer", background: on ? G.greenSubtle : "transparent" }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = G.surfaceRaised; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                <Avatar name={it.name} photoUrl={it.photoUrl} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: G.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                  {it.subtitle && <div style={{ fontSize: 12, color: G.textTertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.subtitle}</div>}
                </div>
                <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on ? G.green : "transparent", border: `1.5px solid ${on ? G.green : G.surfaceBorderLight}`, color: "#0a0a0a", fontSize: 15, fontWeight: 700 }}>
                  {on ? '✓' : <span style={{ color: G.textTertiary, fontWeight: 400 }}>+</span>}
                </div>
              </div>
            );
          })}
        </div>
        {selected.length > 0 && (
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${G.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={onClear} style={{ background: "none", border: "none", color: G.textSecondary, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Clear all</button>
            <button onClick={onClose} style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff }}>View {selected.length}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Unified export control: Download PDF (Simple/Detailed) + hosted share link.
function ExportMenu({ view, count, isAdmin, pdfBusy, onPdf, linkUrl, linkLoading, onLink, onClearLink, iconOnly }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [expiry, setExpiry] = useState('90');
  const [copied, setCopied] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const menuW = Math.min(280, window.innerWidth - 32);
      const right = Math.max(8, Math.min(window.innerWidth - r.right, window.innerWidth - menuW - 8));
      setPos({ top: r.bottom + 6, right });
    }
    setOpen(v => !v);
  };
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={toggle} title="Export"
        style={iconOnly
          ? { background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center" }
          : { background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center", gap: 6 }}>
        <svg width={iconOnly ? 18 : 14} height={iconOnly ? 18 : 14} viewBox="0 0 24 24" fill="none"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        {!iconOnly && 'Export'}
      </button>
      {open && pos && (
        <div style={{ position: "fixed", top: pos.top, right: pos.right, width: 280, maxWidth: "calc(100vw - 32px)", background: G.surfaceGlass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 16, padding: 14, zIndex: 500, boxShadow: G.shadowLg }}>
          {/* PDF matches the current layout (List → 3×5, Detailed → 1×4). */}
          <button onClick={() => { onPdf(); setOpen(false); }} disabled={pdfBusy}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${G.surfaceBorder}`, background: G.surfaceRaised, cursor: pdfBusy ? "wait" : "pointer", fontFamily: ff }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: G.text }}>Download PDF</span>
            <span style={{ fontSize: 11, color: G.textTertiary }}>{view === 'detailed' ? 'Detailed' : 'Simple'} · {count}</span>
          </button>
          {isAdmin && (
            <>
              <div style={{ height: 1, background: G.surfaceBorder, margin: "12px 0" }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Share link</div>
              {linkUrl ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 9, padding: "9px 11px", fontSize: 12, color: G.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{linkUrl}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { navigator.clipboard.writeText(linkUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                      style={{ flex: 1, background: copied ? G.green : "transparent", color: copied ? "#0a0a0a" : G.green, border: `1.5px solid ${G.green}`, borderRadius: 9, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff }}>{copied ? '✓ Copied' : 'Copy link'}</button>
                    <button onClick={() => onClearLink()} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 9, padding: "9px 12px", color: G.textSecondary, fontSize: 13, cursor: "pointer", fontFamily: ff }}>New</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {[['30', '30d'], ['90', '90d'], ['180', '6mo'], ['never', '∞']].map(([val, lbl]) => (
                      <button key={val} onClick={() => setExpiry(val)}
                        style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${expiry === val ? G.green : G.surfaceBorder}`, background: expiry === val ? G.greenSubtle : G.surfaceRaised, color: expiry === val ? G.green : G.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>{lbl}</button>
                    ))}
                  </div>
                  <button onClick={() => onLink(expiry)} disabled={linkLoading}
                    style={{ width: "100%", background: linkLoading ? G.surfaceRaised : G.green, color: linkLoading ? G.textTertiary : "#0a0a0a", border: "none", borderRadius: 9, padding: "10px", fontWeight: 700, fontSize: 13, cursor: linkLoading ? "wait" : "pointer", fontFamily: ff }}>{linkLoading ? 'Generating…' : 'Generate link'}</button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Per-artist export menu on the detail page: Download PDF (everyone) + a
// generated unique share link for this person (admins only) — the same token
// flow as the roster share link, so it never exposes the gated app.
function DetailExportMenu({ onPdf, pdfBusy, isAdmin, iconOnly, linkUrl, linkLoading, onLink, onClearLink }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [expiry, setExpiry] = useState('90');
  const [copied, setCopied] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const menuW = Math.min(280, window.innerWidth - 32);
      // Right-anchor to the button, but never let the menu run off the left edge.
      const right = Math.max(8, Math.min(window.innerWidth - r.right, window.innerWidth - menuW - 8));
      setPos({ top: r.bottom + 6, right });
    }
    setOpen(v => !v);
  };
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={toggle} title="Export" disabled={pdfBusy}
        style={iconOnly
          ? { background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "10px 12px", cursor: pdfBusy ? "wait" : "pointer", fontFamily: ff, display: "flex", alignItems: "center" }
          : { background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: pdfBusy ? "wait" : "pointer", fontFamily: ff, display: "flex", alignItems: "center", gap: 6 }}>
        {pdfBusy
          ? <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 14 }}>⟳</span>
          : <svg width={iconOnly ? 18 : 14} height={iconOnly ? 18 : 14} viewBox="0 0 24 24" fill="none"><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        {!iconOnly && 'Share'}
      </button>
      {open && pos && (
        <div style={{ position: "fixed", top: pos.top, right: pos.right, width: 280, maxWidth: "calc(100vw - 32px)", background: G.surfaceGlass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 16, padding: 14, zIndex: 500, boxShadow: G.shadowLg }}>
          <button onClick={() => { onPdf(); setOpen(false); }} disabled={pdfBusy}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${G.surfaceBorder}`, background: G.surfaceRaised, cursor: pdfBusy ? "wait" : "pointer", fontFamily: ff }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: G.text }}>Download PDF</span>
            <span style={{ fontSize: 11, color: G.textTertiary }}>One-sheet</span>
          </button>
          {isAdmin && (
            <>
              <div style={{ height: 1, background: G.surfaceBorder, margin: "12px 0" }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Share link</div>
              {linkUrl ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 9, padding: "9px 11px", fontSize: 12, color: G.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{linkUrl}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { navigator.clipboard.writeText(linkUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                      style={{ flex: 1, background: copied ? G.green : "transparent", color: copied ? "#0a0a0a" : G.green, border: `1.5px solid ${G.green}`, borderRadius: 9, padding: "9px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff }}>{copied ? '✓ Copied' : 'Copy link'}</button>
                    <button onClick={() => onClearLink()} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 9, padding: "9px 12px", color: G.textSecondary, fontSize: 13, cursor: "pointer", fontFamily: ff }}>New</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {[['30', '30d'], ['90', '90d'], ['180', '6mo'], ['never', '∞']].map(([val, lbl]) => (
                      <button key={val} onClick={() => setExpiry(val)}
                        style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1px solid ${expiry === val ? G.green : G.surfaceBorder}`, background: expiry === val ? G.greenSubtle : G.surfaceRaised, color: expiry === val ? G.green : G.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff }}>{lbl}</button>
                    ))}
                  </div>
                  <button onClick={() => onLink(expiry)} disabled={linkLoading}
                    style={{ width: "100%", background: linkLoading ? G.surfaceRaised : G.green, color: linkLoading ? G.textTertiary : "#0a0a0a", border: "none", borderRadius: 9, padding: "10px", fontWeight: 700, fontSize: 13, cursor: linkLoading ? "wait" : "pointer", fontFamily: ff }}>{linkLoading ? 'Generating…' : 'Generate link'}</button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Landing gate ──────────────────────────────────────────────────────────────
// Front door: pick Music or Sports, then enter the shared site password.
// Separate from the internal/admin login (which unlocks editing).
const SITE_PASSWORD = 'beverlyhills';

function GateBtn({ label, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        padding: "13px 34px", borderRadius: 999, cursor: "pointer", fontFamily: ff,
        fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
        color: h ? "#fff" : "rgba(255,255,255,0.82)",
        background: h ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)",
        border: `1px solid ${h ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.14)"}`,
        transition: `background-color 0.18s ${G.ease}, border-color 0.18s ${G.ease}, color 0.18s ${G.ease}, transform 0.18s ${G.ease}`,
        transform: h ? "translateY(-1px)" : "none", willChange: "transform",
      }}>
      {label}
    </button>
  );
}

function Landing({ onEnter }) {
  const [pending, setPending] = useState(null); // 'music' | 'sports' once a section is chosen
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (pending && inputRef.current) inputRef.current.focus(); }, [pending]);

  const submit = async () => {
    const pw = password.trim();
    if (!pw || busy) return;
    // Public site password → enter as a viewer.
    if (pw.toLowerCase() === SITE_PASSWORD) { onEnter(pending); return; }
    // Otherwise try the employee/admin password (validated server-side). On
    // success the auth cookie is set; reload so the app boots into the full
    // dashboard on the chosen side.
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      if (r.ok) {
        try { localStorage.setItem('mh_gate', '1'); } catch { /* ignore */ }
        window.location.href = pending === 'sports' ? '/sports' : '/';
        return;
      }
      setError('Incorrect password.'); setBusy(false);
    } catch { setError('Something went wrong. Try again.'); setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ff, zIndex: 5000 }}>
      <style>{`@keyframes mhLandIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}`}</style>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", padding: 24, animation: `mhLandIn 0.6s ${G.ease}` }}>
        <img src="https://www.milkhoneyla.com/wp-content/uploads/2024/05/cropped-MH-Logo.png" alt="Milk & Honey" style={{ height: 96, maxWidth: "80vw", objectFit: "contain", marginBottom: 44 }} />

        {!pending ? (
          <div style={{ display: "flex", gap: 16 }}>
            <GateBtn label="Music" onClick={() => { setPending('music'); setError(''); }} />
            <GateBtn label="Sports" onClick={() => { setPending('sports'); setError(''); }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: 300, maxWidth: "82vw", animation: `mhLandIn 0.35s ${G.ease}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>{pending === 'sports' ? 'Sports' : 'Music'}</div>
            <input ref={inputRef} type="password" value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Password"
              style={{ width: "100%", boxSizing: "border-box", textAlign: "center", background: "rgba(30,32,34,0.72)", border: `1px solid ${error ? G.red : "rgba(255,255,255,0.16)"}`, borderRadius: 12, padding: "13px 16px", fontSize: 15, color: "#fff", fontFamily: ff, outline: "none" }} />
            {error && <div style={{ fontSize: 12, color: G.red }}>{error}</div>}
            <button onClick={submit} disabled={!password || busy}
              style={{ width: "100%", background: password && !busy ? G.green : "rgba(255,255,255,0.08)", color: password && !busy ? "#0a0a0a" : "rgba(255,255,255,0.4)", border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14, cursor: password && !busy ? "pointer" : "not-allowed", fontFamily: ff, transition: `all 0.2s ${G.ease}` }}>
              {busy ? 'Entering…' : 'Enter'}
            </button>
            <button onClick={() => { setPending(null); setPassword(''); setError(''); }}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer", fontFamily: ff, marginTop: 2 }}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sports employee dashboard ─────────────────────────────────────────────────
// Admin-only landing page for the Sports side: headline numbers plus recent
// signings and this week's birthdays, computed from the roster the app already
// loads. Public/b2b sessions never render this (and their API responses never
// include the internal fields it reads).
const countFrom = (s) => {
  const t = String(s == null ? '' : s).trim().replace(/,/g, '');
  const m = t.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return 0;
  return Math.round(n * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1));
};
const bigNum = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(n);
// Music-side helpers, shared by the roster filters and the music dashboard.
const parseListeners = v => {
  if (!v) return 0;
  const s = String(v).trim().toUpperCase();
  if (s.endsWith('M')) return parseFloat(s) * 1e6;
  if (s.endsWith('K')) return parseFloat(s) * 1e3;
  return parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
};
const isUKClient = (c) => [c.country, c.country2, c.country3]
  .some(v => ['uk', 'united kingdom', 'england', 'britain', 'scotland', 'wales'].includes(String(v || '').toLowerCase().trim()));
const clientReach = (c) => countFrom(c.igFollowers) + countFrom(c.twitterFollowers) + countFrom(c.tiktokFollowers);
// Tolerant sheet-date parser: "6/15/2001", "2001-06-15", "June 15, 2001", or a
// year-less "6/15" (birthdays) -> { month, day, year|null }.
const parseSheetDate = (s) => {
  const t = String(s || '').trim();
  if (!t) return null;
  const ymd = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return { year: +ymd[1], month: +ymd[2], day: +ymd[3] };
  const mdy = t.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (mdy) {
    let year = mdy[3] ? parseInt(mdy[3], 10) : null;
    if (year != null && year < 100) year += year > 30 ? 1900 : 2000;
    return { month: +mdy[1], day: +mdy[2], year };
  }
  const d = new Date(t);
  return isNaN(d) ? null : { month: d.getMonth() + 1, day: d.getDate(), year: d.getFullYear() };
};
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
// Does a sheet agent cell ("Seth", "Seth Karlins") belong to this user's
// agent key? Loose containment both ways, case-insensitive.
const agentMatch = (agent, key) => {
  const a = String(agent || '').toLowerCase().trim(), k = String(key || '').toLowerCase().trim();
  return !!a && !!k && (a === k || a.includes(k) || k.includes(a));
};

// ── Growth board ──────────────────────────────────────────────────────────────
// Full-roster follower-growth view behind the dashboard's "Hot this week" tile.
// Totals come from the synced growth columns; the per-platform split is computed
// from the raw SocialHistory snapshots.
// Snapshot dates are date-only strings — parse as LOCAL days so US timezones
// don't show them a day early.
const parseSnapDay = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
};

// Parse SocialHistory rows into per-athlete daily series (sorted, totals + per-platform).
function seriesFromHistory(rows) {
  const byName = {};
  (rows || []).forEach(r => {
    const [d, n, ig, x, tk] = r.cells || [];
    const k = String(n || '').toLowerCase().trim();
    const dt = parseSnapDay(d);
    if (!k || isNaN(dt)) return;
    const igN = +String(ig).replace(/,/g, '') || 0, xN = +String(x).replace(/,/g, '') || 0, tkN = +String(tk).replace(/,/g, '') || 0;
    (byName[k] = byName[k] || []).push({ dt, ig: igN, x: xN, tk: tkN, total: igN + xN + tkN });
  });
  for (const arr of Object.values(byName)) arr.sort((a, b) => a.dt - b.dt);
  return byName;
}


// ── Growth board (full page — lives under Marketing) ─────────────────────────
// Universal-style: level chips + filter window + search, and a sortable column
// table with per-platform followers (change underneath), total, and growth.
function GrowthBoardSection({ athletes, staff, onOpenAthlete, isMobile }) {
  const hist = useAdminTab('socialhistory');
  const hist247 = useAdminTab('stathistory');
  const [levels, setLevels] = useCachedState('growth.levels', [...ALL_LEVELS]);
  const toggleLevel = (l) => setLevels(prev => {
    const next = prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l];
    return next.length ? next : [...ALL_LEVELS];
  });
  const [agent, setAgent] = useCachedState('growth.agent', 'All');
  const [side, setSide] = useCachedState('growth.side', 'All');
  const [group, setGroup] = useCachedState('growth.group', 'All');
  const [q, setQ] = useCachedState('growth.q', '');
  const [sortCol, setSortCol] = useCachedState('growth.sortCol', 'score');
  const [sortDir, setSortDir] = useCachedState('growth.sortDir', 'desc');
  const seriesByName = useMemo(() => seriesFromHistory(hist.data?.rows), [hist.data]);
  const platDelta = useMemo(() => {
    const out = {};
    for (const [k, arr] of Object.entries(seriesByName)) {
      const last = arr[arr.length - 1];
      if (!last) continue;
      const target = last.dt.getTime() - 7 * 86400000;
      let base = arr[0];
      for (const r of arr) if (r !== last && Math.abs(r.dt - target) < Math.abs(base.dt - target)) base = r;
      // Only platforms present in the baseline count — new handles aren't growth.
      if (base !== last) out[k] = {
        ig: base.ig > 0 ? last.ig - base.ig : 0,
        x: base.x > 0 ? last.x - base.x : 0,
        tk: base.tk > 0 ? last.tk - base.tk : 0,
      };
    }
    return out;
  }, [seriesByName]);
  const s247map = useMemo(() => latest247From(hist247.data?.rows), [hist247.data]);
  const scoreOf = (a) => {
    const k = a.name.toLowerCase().trim();
    return computeMarketability(a, seriesByName[k], s247map[k]).score;
  };
  const valOf = {
    ig: a => parseReach(a.igFollowers), x: a => parseReach(a.twitterFollowers), tt: a => parseReach(a.tiktokFollowers),
    total: a => athleteReach(a), growth: a => (a.growth7d || 0), score: scoreOf,
  };
  const sorted = athletes
    .filter(a => athleteReach(a) > 0 || (a.growth7d || 0) !== 0)
    .filter(a => levels.includes(a.level))
    .filter(a => agent === 'All' || String(a.agentAssigned || '').toLowerCase().includes(agent.toLowerCase()))
    .filter(a => { if (side === 'All') return true; const g = contractPosGroup(a.position); return POS_SIDES[side].includes(g) && (group === 'All' || g === group); })
    .filter(a => !q.trim() || athleteSearchMatch(a, q.trim().toLowerCase()))
    .sort((a, b) => {
      const cmp = (valOf[sortCol] ? valOf[sortCol](a) - valOf[sortCol](b) : a.name.localeCompare(b.name)) || a.name.localeCompare(b.name);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  const posValue = side === 'All' ? 'All' : (group !== 'All' ? group : side);
  const sections = [
    (staff || []).length > 0 && {
      id: 'agent', title: 'Agent', value: agent,
      rows: [
        { on: agent === 'All', label: 'All agents', onClick: () => setAgent('All') },
        ...(staff || []).map(n => ({ on: agent === n, label: n, onClick: () => setAgent(agent === n ? 'All' : n) })),
      ],
    },
    {
      id: 'position', title: 'Position', value: posValue,
      rows: [
        { on: side === 'All', label: 'All positions', onClick: () => { setSide('All'); setGroup('All'); } },
        ...Object.keys(POS_SIDES).flatMap(s => [
          { on: side === s && group === 'All', label: s, onClick: () => { setSide(side === s ? 'All' : s); setGroup('All'); } },
          ...(side === s && POS_SIDES[s].length > 1 ? POS_SIDES[s].map(g => ({ on: group === g, label: `· ${g}`, onClick: () => setGroup(group === g ? 'All' : g) })) : []),
        ]),
      ],
    },
  ].filter(Boolean);
  const filterActive = agent !== 'All' || side !== 'All';
  const filterLabel = [agent !== 'All' ? agent : null, posValue !== 'All' ? posValue : null].filter(Boolean).join(', ') || 'All';
  const platCell = (count, d, tdStyle) => (
    <td style={tdStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, color: count ? G.text : G.textTertiary }}>{count ? bigNum(count) : '—'}</div>
      {d != null && d !== 0 && <div style={{ fontSize: 11.5, fontWeight: 700, color: d > 0 ? G.green : G.red, marginTop: 1 }}>{d > 0 ? '↑' : '↓'} {bigNum(Math.abs(d))}</div>}
    </td>
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {ALL_LEVELS.map(l => levelChipBtn(levels.includes(l), l, () => toggleLevel(l)))}
        <div style={{ width: 10 }} />
        <FilterMenu compact={isMobile} sections={sections} active={filterActive} label={filterLabel}
          onAll={() => { setLevels([...ALL_LEVELS]); setAgent('All'); setSide('All'); setGroup('All'); }} />
        <div style={{ flex: 1 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search athletes..."
          style={{ ...inputBase, width: isMobile ? 140 : 200, padding: "7px 11px", fontSize: 12 }} />
      </div>
      <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, overflow: "hidden" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: "34px 0", textAlign: "center", color: G.textTertiary, fontSize: 13 }}>No follower data matches these filters.</div>
        ) : (
          <div className="mh-hscroll" style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                {[['player', 'Player'], ['ig', 'Instagram'], ['x', 'X'], ['tt', 'TikTok'], ['total', 'Total'], ['growth', 'Growth'], ['score', 'Score']].map(([key, h]) => (
                  <th key={key}
                    onClick={() => { if (sortCol === key) setSortDir(dd => dd === 'asc' ? 'desc' : 'asc'); else { setSortCol(key); setSortDir(key === 'player' ? 'asc' : 'desc'); } }}
                    style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: sortCol === key ? G.green : G.textTertiary, borderBottom: `1px solid ${G.surfaceBorder}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}>
                    {h}{sortCol === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {sorted.map((a, i) => {
                  const pd = platDelta[a.name.toLowerCase().trim()];
                  const growth = a.growth7d || 0;
                  const td = { padding: "10px 16px", fontSize: 13, color: G.textSecondary, borderBottom: i < sorted.length - 1 ? `1px solid ${G.surfaceBorder}` : "none", whiteSpace: "nowrap", verticalAlign: "middle" };
                  return (
                    <tr key={a.id || i} onClick={() => onOpenAthlete(a)} style={{ cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ ...td, color: G.text, fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={a.name} photoUrl={a.photoUrl} size={30} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                        </div>
                      </td>
                      {platCell(parseReach(a.igFollowers), pd?.ig, td)}
                      {platCell(parseReach(a.twitterFollowers), pd?.x, td)}
                      {platCell(parseReach(a.tiktokFollowers), pd?.tk, td)}
                      <td style={{ ...td, color: G.text, fontWeight: 700 }}>{bigNum(athleteReach(a))}</td>
                      <td style={{ ...td, fontWeight: 700, color: growth > 0 ? G.green : growth < 0 ? G.red : G.textTertiary }}>
                        {growth === 0 ? '—' : <>{growth > 0 ? '+' : ''}{bigNum(growth)}{a.growth7dPct ? <span style={{ color: G.textTertiary, fontWeight: 500 }}> · {a.growth7dPct}%</span> : null}</>}
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: G.green }}>{scoreOf(a)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Socials + contract modules (athlete profile, company view only) ──────────
// Side-by-side cards: per-platform follower rows with an up/down change arrow
// (7-day window from SocialHistory), and the contract terms.
function SocialContractModules({ athlete: a, isMobile }) {
  const hist = useAdminTab('socialhistory');
  const hist247 = useAdminTab('stathistory');
  const key = String(a.name || '').toLowerCase().trim();
  const series = useMemo(() => seriesFromHistory(hist.data?.rows)[key] || [], [hist.data, key]);
  const s247 = useMemo(() => latest247From(hist247.data?.rows)[key], [hist247.data, key]);
  const mkt = computeMarketability(a, series, s247);
  const { pd, days } = useMemo(() => {
    const arr = series;
    const last = arr[arr.length - 1];
    if (!last) return { pd: null, days: 0 };
    const target = last.dt.getTime() - 7 * 86400000;
    let base = arr[0];
    for (const r of arr) if (r !== last && Math.abs(r.dt - target) < Math.abs(base.dt - target)) base = r;
    if (base === last) return { pd: null, days: 0 };
    return {
      pd: {
        ig: base.ig > 0 ? last.ig - base.ig : 0,
        x: base.x > 0 ? last.x - base.x : 0,
        tk: base.tk > 0 ? last.tk - base.tk : 0,
      },
      days: Math.max(1, Math.round((last.dt - base.dt) / 86400000)),
    };
  }, [series]);
  const money = (v) => {
    const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
    if (!n) return String(v);
    return n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, '')}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;
  };
  const rows = [
    a.instagram && { icon: <IgIcon size={18} />, platform: 'Instagram', user: `@${a.instagram}`, url: `https://instagram.com/${a.instagram}`, count: a.igFollowers, d: pd?.ig },
    a.twitter && { icon: <TwIcon size={16} />, platform: 'X', user: `@${a.twitter}`, url: `https://x.com/${a.twitter}`, count: a.twitterFollowers, d: pd?.x },
    a.tiktok && { icon: <TkIcon size={16} />, platform: 'TikTok', user: `@${a.tiktok}`, url: `https://tiktok.com/@${a.tiktok}`, count: a.tiktokFollowers, d: pd?.tk },
  ].filter(Boolean);
  const contract = a.contractYearly
    ? { main: `${money(a.contractYearly)} / yr`, rows: [] }
    : a.contractAav
      ? { main: `${money(a.contractAav)} / yr`, rows: [
          a.contractYears && ['Years', a.contractYears],
          a.contractTotal && ['Total value', money(a.contractTotal)],
          a.contractGuaranteed && ['Guaranteed', money(a.contractGuaranteed)],
        ].filter(Boolean) }
      : null;
  const mod = { background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, padding: 16 };
  const head = (label, right) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary }}>{label}</div>
      {right ? <div style={{ fontSize: 11, color: G.textTertiary }}>{right}</div> : null}
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : (BOX_DOCS_ENABLED ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr"), gap: 12 }}>
      <div style={mod}>
        {head('Social media', pd ? `${days}-day change` : '')}
        {rows.length === 0 ? <div style={{ fontSize: 13, color: G.textTertiary, padding: "8px 0" }}>No socials on file.</div>
          : rows.map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < rows.length - 1 ? `1px solid ${G.surfaceBorder}` : "none", textDecoration: "none", color: "#fff" }}>
              {r.icon}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: G.text }}>{r.platform}</div>
                <div style={{ fontSize: 12, color: G.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.user}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>{r.count || '—'}</div>
                {r.d != null && r.d !== 0 && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: r.d > 0 ? G.green : G.red }}>{r.d > 0 ? '↑' : '↓'} {bigNum(Math.abs(r.d))}</div>
                )}
              </div>
            </a>
          ))}
        {rows.length > 0 && (() => {
          const totReach = rows.reduce((s, r) => s + countFrom(r.count), 0);
          const totD = pd ? (pd.ig + pd.x + pd.tk) : null;
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 10, marginTop: 2, borderTop: `1px solid ${G.surfaceBorder}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: G.text }}>Total reach</div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>{totReach ? bigNum(totReach) : '—'}</div>
                {totD != null && totD !== 0 && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: totD > 0 ? G.green : G.red }}>{totD > 0 ? '↑' : '↓'} {bigNum(Math.abs(totD))}</div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
      <div style={mod}>
        {head('Contract', contract && !a.contractYearly
          ? <a href={a.contractUrl || `https://www.spotrac.com/search?q=${encodeURIComponent(a.name)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: G.green, fontWeight: 600, textDecoration: "none" }}>View Spotrac page →</a>
          : '')}
        {!contract ? <div style={{ fontSize: 13, color: G.textTertiary, padding: "8px 0" }}>No contract on file yet.</div>
          : (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, color: G.text, letterSpacing: "-0.02em" }}>{contract.main}</div>
              {contract.rows.map(([l, v], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < contract.rows.length - 1 ? `1px solid ${G.surfaceBorder}` : "none", fontSize: 13, marginTop: i === 0 ? 10 : 0 }}>
                  <span style={{ color: G.textTertiary }}>{l}</span><span style={{ color: G.text, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </>
          )}
      </div>
      <div style={mod}>
        {head('Marketability', '')}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: G.green, letterSpacing: "-0.02em", lineHeight: 1 }}>{mkt.score}</span>
          <span style={{ fontSize: 12, color: G.textTertiary }}>/ 100</span>
        </div>
        <div style={{ marginTop: 12 }}>
          {mkt.parts.map(([l, v, max]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <span style={{ fontSize: 11, color: G.textTertiary, width: 68, flexShrink: 0 }}>{l}</span>
              <div style={{ flex: 1, height: 4, background: G.surfaceRaised, borderRadius: 2 }}>
                <div style={{ width: `${Math.round((v / max) * 100)}%`, height: "100%", background: G.green, borderRadius: 2, opacity: 0.85 }} />
              </div>
              <span style={{ fontSize: 11, color: G.textSecondary, width: 38, textAlign: "right", flexShrink: 0 }}>{v}/{max}</span>
            </div>
          ))}
        </div>
      </div>
      {BOX_DOCS_ENABLED && <DocsModule person={a.name} kind="sports" />}
    </div>
  );
}

function SportsDashboard({ athletes, isMobile, onOpenAthlete, onGoRoster, onShowStarters, onShowMine, onGoMarketing, onGoRecruiting, user, decks }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Agents see THEIR book everywhere: every stat and tile computes over their
  // clients when they have any. The house login (no user) stays roster-wide.
  const mineList = useMemo(
    () => (user?.agentKey ? athletes.filter(a => agentMatch(a.agentAssigned, user.agentKey)) : []),
    [athletes, user]);
  const personal = mineList.length > 0;
  const scoped = personal ? mineList : athletes;
  // Agents see their top 4 by reach; the house/admin view gets the roster-wide top 4.
  const topClients = useMemo(
    () => [...(personal ? mineList : athletes)].sort((a, b) => athleteReach(b) - athleteReach(a)).slice(0, 4),
    [personal, mineList, athletes]);
  const s = useMemo(() => {
    const levels = { 'NFL': 0, 'College': 0, 'High School': 0 };
    let ig = 0, tt = 0, x = 0, starters = 0, nflStarters = 0, collegeStarters = 0;
    for (const a of scoped) {
      if (levels[a.level] != null) levels[a.level]++;
      ig += countFrom(a.igFollowers); tt += countFrom(a.tiktokFollowers); x += countFrom(a.twitterFollowers);
      if (a.depthRank === 1) { starters++; if (a.level === 'NFL') nflStarters++; else if (a.level === 'College') collegeStarters++; }
    }
    const reach = ig + tt + x;
    const pct = (n) => reach ? Math.round((n / reach) * 100) : 0;
    // Contract $ under management: manual yearly ($/yr) wins, else Spotrac AAV.
    const moneyNum = (v) => {
      const str = String(v == null ? '' : v).trim();
      if (!str) return 0;
      const n = parseFloat(str.replace(/[^0-9.]/g, ''));
      if (!isFinite(n) || n <= 0) return 0;
      return /m/i.test(str) ? n * 1e6 : /k/i.test(str) ? n * 1e3 : n;
    };
    let contractSum = 0, contractDeals = 0;
    for (const a of scoped) {
      const yr = moneyNum(a.contractYearly) || moneyNum(a.contractAav);
      if (yr) { contractSum += yr; contractDeals++; }
    }
    const bdays = scoped.map(a => {
      const d = parseSheetDate(a.birthday);
      if (!d) return null;
      let next = new Date(today.getFullYear(), d.month - 1, d.day);
      if (next < today) next = new Date(today.getFullYear() + 1, d.month - 1, d.day);
      return { a, date: next };
    }).filter(Boolean).sort((p, q) => p.date - q.date);
    // Profiles missing the info we care most about — the nudge to go edit.
    const missingOf = (a) => {
      const m = [];
      if (!a.photoUrl) m.push('Photo');
      if (!a.birthday) m.push('Birthday');
      if (!a.agentAssigned) m.push('Agent');
      if (!a.instagram && !a.twitter && !a.tiktok) m.push('Socials');
      if (!a.height || !a.weight) m.push('Ht/Wt');
      if (!(a.shirtSize || a.hoodieSize || a.shoeSize)) m.push('Sizes');
      if (a.level === 'High School' && !a.profileUrl247) m.push('247 link');
      const noDeal = /free agent|retired/i.test(String(a.status || '')) || /free agent/i.test(String(a.nflTeam || ''));
      if (a.level !== 'High School' && !noDeal && !(a.contractYearly || a.contractAav)) m.push('Contract $');
      return m;
    };
    const incomplete = scoped.map(a => ({ a, missing: missingOf(a) }))
      .filter(x2 => x2.missing.length)
      .sort((p, q) => q.missing.length - p.missing.length);
    // 7-day movers, from the socials job's growth columns. Until a week of
    // snapshots exists, growth7dPct is blank everywhere → sample mode.
    const hasGrowthData = scoped.some(a => a.growth7dPct !== '' && a.growth7dPct != null);
    const hot = hasGrowthData
      ? scoped.filter(a => (a.growth7d || 0) > 0)
        .sort((p, q) => (q.growth7d || 0) - (p.growth7d || 0)).slice(0, 5)
        .map(a => ({ a, delta: a.growth7d, pct: a.growth7dPct }))
      : [...scoped].sort((a, b) => athleteReach(b) - athleteReach(a)).slice(0, 4)
        .map((a, i) => ({ a, delta: [12400, 8100, 4700, 2300][i] || 1500, pct: ['2.1', '1.4', '0.9', '0.6'][i] || '0.4', sample: true }));
    return {
      levels, reach, starters, nflStarters, collegeStarters, mine: mineList.length, bdays, incomplete,
      hot, hasGrowthData, contractSum, contractDeals,
      splits: { ig: pct(ig), tt: pct(tt), x: pct(x) },
      upcoming: bdays.filter(b => (b.date - today) / 86400000 <= 30),
    };
  }, [scoped, mineList]);
  const [showIncomplete, setShowIncomplete] = useState(false);
  // Manual to-dos (shared Todos sheet tab) + a standing nudge when fresh
  // onboarding submissions arrived this week.
  const todosTab = useAdminTab('todos');
  const onboardTab = useAdminTab('onboarding');
  const [addingTodo, setAddingTodo] = useState(false);
  const [todoText, setTodoText] = useState('');
  const todoItems = useMemo(() => {
    const d = todosTab.data;
    if (!d) return [];
    const ti = d.headers.indexOf('text'), di = d.headers.indexOf('done');
    if (ti < 0) return [];
    return d.rows
      .filter(r => String(r.cells[ti] || '').trim() && !/true/i.test(String(di >= 0 ? r.cells[di] : '')))
      .map(r => ({ row: r._row, text: r.cells[ti] }));
  }, [todosTab.data]);
  const [showOnboards, setShowOnboards] = useState(false);
  const recentOnboards = useMemo(() => {
    const d = onboardTab.data;
    if (!d) return [];
    const hi = (n) => d.headers.indexOf(n);
    const si = hi('submittedAt'), ni = hi('name'), ti = hi('type'), li = hi('level');
    if (si < 0 || ni < 0) return [];
    const cutoff = Date.now() - 7 * 86400000;
    return d.rows
      .map(r => ({ name: String(r.cells[ni] || '').trim(), type: String((ti >= 0 && r.cells[ti]) || 'client'), level: li >= 0 ? (r.cells[li] || '') : '', at: new Date(r.cells[si] || 0) }))
      .filter(x => x.name && !isNaN(x.at) && x.at.getTime() > cutoff)
      .sort((a, b) => b.at - a.at);
  }, [onboardTab.data]);
  const newOnboards = recentOnboards.length;
  const postTodos = async (body) => {
    try {
      await fetch('/api/athletes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      todosTab.reload();
    } catch { /* next reload will show the truth */ }
  };
  const addTodo = () => {
    const t = todoText.trim();
    if (!t) { setAddingTodo(false); return; }
    setTodoText(''); setAddingTodo(false);
    postTodos({ action: 'tab-append', tab: 'todos', values: { text: t, createdBy: (user?.name || 'Team'), createdAt: new Date().toISOString().slice(0, 10), done: '' } });
  };
  const completeTodo = (row) => postTodos({ action: 'tab-update', tab: 'todos', row, values: { done: 'TRUE' } });
  const fmtMoney = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
  const seasonLabel = `${now.getFullYear()}/${String((now.getFullYear() + 1) % 100).padStart(2, '0')} season`;

  const card = { background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, padding: 16 };
  const statLabel = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: G.green, marginTop: 7 };
  const statSub = { fontSize: 11, color: G.textSecondary, marginTop: 4 };
  const tileHead = (label, range) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary }}>{label}</div>
      <div style={{ fontSize: 11, color: G.textTertiary }}>{range}</div>
    </div>
  );
  const row = (a, sub, right, key, last) => (
    <div key={key} onClick={() => onOpenAthlete(a)}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: last ? "none" : `1px solid ${G.surfaceBorder}`, cursor: "pointer" }}>
      <div style={{ fontSize: 13, color: G.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {a.name} <span style={{ color: G.textTertiary, fontSize: 12 }}>· {sub}</span>
      </div>
      <div style={{ fontSize: 12, color: G.textSecondary, flexShrink: 0 }}>{right}</div>
    </div>
  );
  const empty = (msg) => <div style={{ fontSize: 13, color: G.textTertiary, padding: "14px 0 6px" }}>{msg}</div>;
  const firstName = (user?.name || '').split(' ')[0];
  const greeting = (now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening') + (firstName ? `, ${firstName}` : '');

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: isMobile ? "20px 16px 80px" : "28px 24px 60px" }}>
      <div style={{ fontSize: isMobile ? 21 : 25, fontWeight: 800, letterSpacing: "-0.03em", color: G.text }}>{greeting}</div>
      <div style={{ fontSize: 13, color: G.textTertiary, marginTop: 4 }}>
        {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginTop: 20 }}>
        {personal ? (
          <div style={{ ...card, cursor: "pointer" }} onClick={onShowMine}>
            <div style={{ fontSize: 26, fontWeight: 700, color: G.green, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.mine}</div>
            <div style={statLabel}>My clients</div>
            <div style={statSub}>of {athletes.length} on the roster</div>
          </div>
        ) : (
          <div style={{ ...card, cursor: "pointer" }} onClick={onGoRoster}>
            <div style={{ fontSize: 26, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{athletes.length}</div>
            <div style={statLabel}>Total athletes</div>
            <div style={statSub}>{s.levels['NFL']} NFL · {s.levels['College']} College · {s.levels['High School']} HS</div>
          </div>
        )}
        <div style={card}>
          <div style={{ fontSize: 26, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.contractSum ? fmtMoney(s.contractSum) : '—'}</div>
          <div style={statLabel}>Total contract value</div>
          <div style={statSub}>{s.contractSum ? seasonLabel : 'No contract data yet'}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 26, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{bigNum(s.reach)}</div>
          <div style={statLabel}>{personal ? "My clients' social reach" : 'Combined social reach'}</div>
          <div style={statSub}>{s.reach ? `IG ${s.splits.ig}% · TikTok ${s.splits.tt}% · X ${s.splits.x}%` : 'No follower data yet'}</div>
        </div>
        {(decks || []).length > 0 ? (
          <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center", gap: 34 }}>
            {decks.slice(0, 2).map(d => (
              <a key={d.title} href={d.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textDecoration: "none", width: 62 }}>
                <svg width="38" height="31" viewBox="0 0 36 30" aria-hidden="true">
                  <path d="M2 6c0-1.7 1.3-3 3-3h8l3 3h15c1.7 0 3 1.3 3 3v15c0 1.7-1.3 3-3 3H5c-1.7 0-3-1.3-3-3V6z" fill={G.surfaceRaised} stroke={G.textTertiary} strokeWidth="1.5" />
                </svg>
                <div style={{ ...statLabel, marginTop: 0, textAlign: "center", lineHeight: 1.5 }}>{d.title.split(' ').map((w, i) => <div key={i}>{w}</div>)}</div>
              </a>
            ))}
          </div>
        ) : (
          <div style={{ ...card, cursor: "pointer" }} onClick={onShowStarters}>
            <div style={{ fontSize: 26, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.starters}</div>
            <div style={statLabel}>{personal ? 'My starters' : 'Starters'}</div>
            <div style={statSub}>{s.nflStarters} NFL · {s.collegeStarters} College</div>
          </div>
        )}
      </div>

      {topClients.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
            {topClients.map((a, i) => (
              <SportsCard key={a.id || i} athlete={a} isMobile={false} showDepth onClick={() => onOpenAthlete(a)} />
            ))}
          </div>
          <button onClick={personal ? onShowMine : onGoRoster}
            style={{ marginTop: 10, background: "none", border: "none", color: G.green, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0 }}>
            {personal ? 'View my clients →' : 'View full roster →'}
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
        <div style={card}>
          {tileHead(s.hasGrowthData
            ? (() => { const d = Math.max(0, ...s.hot.map(x2 => x2.a.growthDays || 0)); return d >= 7 ? 'Social growth leaders (this week)' : d > 0 ? `Social growth leaders (last ${d} days)` : 'Social growth leaders'; })()
            : 'Social growth leaders', s.hasGrowthData ? '' : 'Sample preview')}
          {s.hot.length === 0 ? empty('Quiet week — no gains to show yet.')
            : s.hot.map((x2, i, arr) => row(x2.a, x2.a.level,
              <span style={{ color: G.green, fontWeight: 700 }}>+{bigNum(x2.delta)} <span style={{ color: G.textTertiary, fontWeight: 500 }}>· {x2.pct}%</span></span>,
              x2.a.id || i, i === arr.length - 1))}
          {!s.hasGrowthData && <div style={{ fontSize: 11, color: G.textTertiary, paddingTop: 8 }}>Sample numbers — daily snapshots start tonight; real growth appears within a week.</div>}
          {s.hasGrowthData && (
            <button onClick={onGoMarketing} style={{ marginTop: 8, background: "none", border: "none", color: G.green, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0 }}>
              View full growth board →
            </button>
          )}
        </div>
        <div style={card}>
          {tileHead('Upcoming events', '')}
          {s.upcoming.length === 0
            ? (s.bdays.length === 0 ? empty('No birthdays on file yet.') : empty('Nothing on the calendar in the next 30 days.'))
            : s.upcoming.slice(0, 6).map((b, i, arr) =>
              row(b.a, 'Birthday', b.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), b.a.id || i, i === arr.length - 1))}
        </div>
        <div style={card}>
          {tileHead('To do', (
            <button onClick={() => setAddingTodo(v => !v)} title="Add a to-do"
              style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 7, color: G.green, width: 22, height: 22, fontSize: 14, fontWeight: 700, lineHeight: 1, cursor: "pointer", fontFamily: ff, padding: 0 }}>+</button>
          ))}
          {addingTodo && (
            <input autoFocus value={todoText} onChange={e => setTodoText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTodo(); if (e.key === 'Escape') { setAddingTodo(false); setTodoText(''); } }}
              placeholder="Type and press Enter"
              style={{ ...inputBase, marginBottom: 8, padding: "8px 10px", fontSize: 13 }} />
          )}
          {s.incomplete.length > 0 && (
            <div onClick={() => setShowIncomplete(true)}
              style={{ fontSize: 13, color: G.red, fontWeight: 600, cursor: "pointer", padding: "6px 0" }}>
              Incomplete profiles: {s.incomplete.length} players
            </div>
          )}
          {newOnboards > 0 && (
            <div onClick={() => setShowOnboards(true)}
              style={{ fontSize: 13, color: G.red, fontWeight: 600, cursor: "pointer", padding: "6px 0" }}>
              Check new onboarding ({newOnboards})
            </div>
          )}
          {todoItems.map(t => (
            <div key={t.row} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0" }}>
              <button onClick={() => completeTodo(t.row)} title="Mark complete"
                style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${G.textTertiary}`, background: "transparent", cursor: "pointer", flexShrink: 0, padding: 0 }} />
              <span style={{ fontSize: 13, color: G.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.text}</span>
            </div>
          ))}
          {s.incomplete.length === 0 && newOnboards === 0 && todoItems.length === 0 && !addingTodo && (
            <div style={{ fontSize: 13, color: G.green, padding: "6px 0" }}>All clear ✓</div>
          )}
        </div>
      </div>

      {showOnboards && (
        <div onClick={() => setShowOnboards(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: G.surface, border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "80vh", overflowY: "auto", padding: 20, animation: "modalIn .18s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: G.text, letterSpacing: "-0.02em" }}>New onboarding</div>
              <button onClick={() => setShowOnboards(false)} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "6px 11px", fontSize: 14, fontFamily: ff }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: G.textTertiary, marginBottom: 10 }}>Submitted in the last 7 days</div>
            {recentOnboards.map((o, i, arr) => {
              const match = athletes.find(a => a.name.toLowerCase().trim() === o.name.toLowerCase());
              return (
                <div key={i} onClick={() => { setShowOnboards(false); if (match) onOpenAthlete(match); else onGoRecruiting(); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${G.surfaceBorder}`, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {match ? <Avatar name={match.name} photoUrl={match.photoUrl} size={30} /> : <Avatar name={o.name} size={30} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: G.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</div>
                      <div style={{ fontSize: 11.5, color: G.textTertiary }}>{[/recruit/i.test(o.type) ? 'Recruit' : 'Client', o.level || (match && match.level)].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: G.textSecondary, flexShrink: 0 }}>{o.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showIncomplete && (
        <div onClick={() => setShowIncomplete(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: G.surface, border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "80vh", overflowY: "auto", padding: 20, animation: "modalIn .18s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: G.text, letterSpacing: "-0.02em" }}>Incomplete profiles</div>
              <button onClick={() => setShowIncomplete(false)} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "6px 11px", fontSize: 14, fontFamily: ff }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: G.textTertiary, marginBottom: 10 }}>{s.incomplete.length} of {scoped.length} need info — click a name, then Edit to fill the gaps.</div>
            {s.incomplete.map((x2, i, arr) => (
              <div key={x2.a.id || i} onClick={() => { setShowIncomplete(false); onOpenAthlete(x2.a); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${G.surfaceBorder}`, cursor: "pointer" }}>
                <div style={{ fontSize: 13, color: G.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {x2.a.name} <span style={{ color: G.textTertiary, fontSize: 12 }}>· {[x2.a.level, x2.a.position].filter(Boolean).join(' · ')}</span>
                </div>
                <div style={{ fontSize: 12, color: G.red, fontWeight: 600, flexShrink: 0 }}>
                  {x2.missing.slice(0, 3).join(' · ')}{x2.missing.length > 3 ? ` +${x2.missing.length - 3}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Music dashboard (employee home) ───────────────────────────────────────────
// Same layout language as the sports dashboard — stat callouts, key clients,
// tiles — built from what the music sheet actually tracks (types, reps,
// countries, Spotify listeners/releases). Gated to Tyler's login while it's
// broken in.
function MusicDashboard({ clients, isMobile, user, onOpenClient, onGoRoster, onFilterType, onGoMarketing }) {
  const now = new Date();
  const s = useMemo(() => {
    const typeCounts = {};
    let listeners = 0, listenerProfiles = 0, uk = 0;
    const collaborators = new Set();
    for (const c of clients) {
      (c.types || []).forEach(t => { typeCounts[t] = (typeCounts[t] || 0) + 1; });
      const l = parseListeners(c.spotifyMonthly);
      if (l > 0) { listeners += l; listenerProfiles++; }
      if (isUKClient(c)) uk++;
      (c.credits || []).forEach(cr => collaborators.add(cr.toLowerCase().trim()));
    }
    // Profiles missing the info we care most about — the nudge to go edit.
    const missingOf = (c) => {
      const m = [];
      if (!c.photoUrl) m.push('Photo');
      if (!(c.types || []).length) m.push('Type');
      if (!c.contact) m.push('Rep');
      if (!c.country) m.push('Location');
      if (!c.spotifyUrl) m.push('Spotify link');
      if (!c.instagram && !c.twitter && !c.tiktok) m.push('Socials');
      return m;
    };
    const incomplete = clients.map(c => ({ c, missing: missingOf(c) }))
      .filter(x => x.missing.length)
      .sort((p, q) => q.missing.length - p.missing.length);
    // Newest releases across the whole roster (Spotify sync refreshes weekly).
    const allReleases = clients
      .flatMap(c => (c.spotifyRecentReleases || []).map(r => ({ c, r, at: new Date(r.releaseDate || 0) })))
      .filter(x => x.r.name && !isNaN(x.at.getTime()) && x.at.getFullYear() > 1971)
      .sort((a, b) => b.at - a.at);
    const releases = allReleases.slice(0, 6);
    const weekReleases = allReleases.filter(x => now - x.at <= 7 * 86400000);
    // Key clients: ranked by Spotify listeners when that column has data;
    // until then the sheet's own order leads with the marquee names.
    const top = listenerProfiles > 0
      ? [...clients].sort((a, b) => parseListeners(b.spotifyMonthly) - parseListeners(a.spotifyMonthly)).slice(0, 4)
      : clients.slice(0, 4);
    // 7-day movers, from the music socials job's growth columns.
    const hasGrowthData = clients.some(c => c.growth7dPct !== '' && c.growth7dPct != null);
    const hot = clients.filter(c => (c.growth7d || 0) > 0)
      .sort((p, q) => (q.growth7d || 0) - (p.growth7d || 0)).slice(0, 5);
    return { typeCounts, listeners, listenerProfiles, uk, collaborators: collaborators.size, incomplete, releases, weekReleases, top, hot, hasGrowthData };
  }, [clients]);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [showReleases, setShowReleases] = useState(false);
  // Manual to-dos — the same shared Todos tab the sports dashboard uses, so
  // there is one company to-do list no matter which home you're on.
  const todosTab = useAdminTab('todos');
  const [addingTodo, setAddingTodo] = useState(false);
  const [todoText, setTodoText] = useState('');
  const todoItems = useMemo(() => {
    const d = todosTab.data;
    if (!d) return [];
    const ti = d.headers.indexOf('text'), di = d.headers.indexOf('done');
    if (ti < 0) return [];
    return d.rows
      .filter(r => String(r.cells[ti] || '').trim() && !/true/i.test(String(di >= 0 ? r.cells[di] : '')))
      .map(r => ({ row: r._row, text: r.cells[ti] }));
  }, [todosTab.data]);
  const postTodos = async (body) => {
    try {
      await fetch('/api/athletes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      todosTab.reload();
    } catch { /* next reload will show the truth */ }
  };
  const addTodo = () => {
    const t = todoText.trim();
    if (!t) { setAddingTodo(false); return; }
    setTodoText(''); setAddingTodo(false);
    postTodos({ action: 'tab-append', tab: 'todos', values: { text: t, createdBy: (user?.name || 'Team'), createdAt: new Date().toISOString().slice(0, 10), done: '' } });
  };
  const completeTodo = (row) => postTodos({ action: 'tab-update', tab: 'todos', row, values: { done: 'TRUE' } });

  const card = { background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, padding: 16 };
  const statLabel = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: G.green, marginTop: 7 };
  const statSub = { fontSize: 11, color: G.textSecondary, marginTop: 4 };
  const tileHead = (label, range) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary }}>{label}</div>
      <div style={{ fontSize: 11, color: G.textTertiary }}>{range}</div>
    </div>
  );
  const row = (c, sub, right, key, last) => (
    <div key={key} onClick={() => onOpenClient(c)}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: last ? "none" : `1px solid ${G.surfaceBorder}`, cursor: "pointer" }}>
      <div style={{ fontSize: 13, color: G.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {c.name} {sub && <span style={{ color: G.textTertiary, fontSize: 12 }}>· {sub}</span>}
      </div>
      <div style={{ fontSize: 12, color: G.textSecondary, flexShrink: 0 }}>{right}</div>
    </div>
  );
  const empty = (msg) => <div style={{ fontSize: 13, color: G.textTertiary, padding: "14px 0 6px" }}>{msg}</div>;
  const relDate = (d) => d.getFullYear() === now.getFullYear()
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const firstName = (user?.name || '').split(' ')[0];
  const greeting = (now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening') + (firstName ? `, ${firstName}` : '');

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: isMobile ? "20px 16px 80px" : "28px 24px 60px" }}>
      <div style={{ fontSize: isMobile ? 21 : 25, fontWeight: 800, letterSpacing: "-0.03em", color: G.text }}>{greeting}</div>
      <div style={{ fontSize: 13, color: G.textTertiary, marginTop: 4 }}>
        {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginTop: 20 }}>
        <div style={{ ...card, cursor: "pointer" }} onClick={onGoRoster}>
          <div style={{ fontSize: 26, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{clients.length}</div>
          <div style={statLabel}>Total clients</div>
          <div style={statSub}>{['Songwriter', 'Producer', 'Artist'].map(t => `${s.typeCounts[t] || 0} ${t}s`).join(' · ')}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 26, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.listeners ? bigNum(Math.round(s.listeners)) : '—'}</div>
          <div style={statLabel}>Monthly listeners</div>
          <div style={statSub}>{s.listeners ? `Spotify · ${s.listenerProfiles} artist profiles` : 'No listener data yet'}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 26, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.collaborators || '—'}</div>
          <div style={statLabel}>Artists worked with</div>
          <div style={statSub}>Unique collaborators on file</div>
        </div>
        <div style={{ ...card, cursor: "pointer" }} onClick={() => onFilterType('UK Client')}>
          <div style={{ fontSize: 26, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.uk}</div>
          <div style={statLabel}>UK clients</div>
          <div style={statSub}>Based in the United Kingdom</div>
        </div>
      </div>

      {s.top.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
            {s.top.map((c, i) => (
              <div key={c.id || i} onClick={() => onOpenClient(c)}
                onMouseEnter={e => { e.currentTarget.style.background = G.surfaceRaised; }}
                onMouseLeave={e => { e.currentTarget.style.background = G.surface; }}
                style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 18, padding: "18px 18px 16px", cursor: "pointer", transition: `background 0.2s ${G.ease}` }}>
                <Avatar name={c.name} photoUrl={c.photoUrl} size={80} />
                <div style={{ fontWeight: 800, fontSize: 20, color: G.text, letterSpacing: "-0.03em", lineHeight: 1.2, margin: "14px 0 6px" }}>{c.name}</div>
                <div style={{ fontSize: 13, color: G.textSecondary, fontWeight: 500 }}>
                  {[...(c.types || [])].sort((a, b) => a === 'Artist' ? -1 : b === 'Artist' ? 1 : a.localeCompare(b)).join(' · ')}
                </div>
              </div>
            ))}
          </div>
          <button onClick={onGoRoster}
            style={{ marginTop: 10, background: "none", border: "none", color: G.green, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0 }}>
            View full roster →
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
        <div style={card}>
          {tileHead(s.hasGrowthData
            ? (() => { const d = Math.max(0, ...s.hot.map(x => x.growthDays || 0)); return d >= 7 ? 'Social growth leaders (this week)' : d > 0 ? `Social growth leaders (last ${d} days)` : 'Social growth leaders'; })()
            : 'Social growth leaders', '')}
          {!s.hasGrowthData ? empty('First follower snapshots land tonight.')
            : s.hot.length === 0 ? empty('Quiet week — no gains to show yet.')
            : s.hot.map((c, i, arr) => row(c, (c.types || [])[0] || 'Client',
                <span style={{ color: G.green, fontWeight: 700 }}>+{bigNum(c.growth7d)} <span style={{ color: G.textTertiary, fontWeight: 500 }}>· {c.growth7dPct}%</span></span>,
                c.id || i, i === arr.length - 1))}
          {s.hasGrowthData && (
            <button onClick={onGoMarketing} style={{ marginTop: 8, background: "none", border: "none", color: G.green, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff, padding: 0 }}>
              View full growth board →
            </button>
          )}
        </div>
        <div style={card}>
          {tileHead('Artist recent releases', (
            <span onClick={() => setShowReleases(true)} style={{ color: G.green, fontWeight: 600, cursor: "pointer" }}>This week →</span>
          ))}
          {s.releases.length === 0 ? empty('No releases synced yet.')
            : s.releases.map((x, i, arr) => row(x.c, x.r.name, relDate(x.at), `${x.c.id || x.c.name}-${i}`, i === arr.length - 1))}
        </div>
        <div style={card}>
          {tileHead('To do', (
            <button onClick={() => setAddingTodo(v => !v)} title="Add a to-do"
              style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 7, color: G.green, width: 22, height: 22, fontSize: 14, fontWeight: 700, lineHeight: 1, cursor: "pointer", fontFamily: ff, padding: 0 }}>+</button>
          ))}
          {addingTodo && (
            <input autoFocus value={todoText} onChange={e => setTodoText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTodo(); if (e.key === 'Escape') { setAddingTodo(false); setTodoText(''); } }}
              placeholder="Type and press Enter"
              style={{ ...inputBase, marginBottom: 8, padding: "8px 10px", fontSize: 13 }} />
          )}
          {s.incomplete.length > 0 && (
            <div onClick={() => setShowIncomplete(true)}
              style={{ fontSize: 13, color: G.red, fontWeight: 600, cursor: "pointer", padding: "6px 0" }}>
              Incomplete profiles: {s.incomplete.length} clients
            </div>
          )}
          {todoItems.map(t => (
            <div key={t.row} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0" }}>
              <button onClick={() => completeTodo(t.row)} title="Mark complete"
                style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${G.textTertiary}`, background: "transparent", cursor: "pointer", flexShrink: 0, padding: 0 }} />
              <span style={{ fontSize: 13, color: G.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.text}</span>
            </div>
          ))}
          {s.incomplete.length === 0 && todoItems.length === 0 && !addingTodo && (
            <div style={{ fontSize: 13, color: G.green, padding: "6px 0" }}>All clear ✓</div>
          )}
        </div>
      </div>

      {showReleases && (
        <div onClick={() => setShowReleases(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: G.surface, border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "80vh", overflowY: "auto", padding: 20, animation: "modalIn .18s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: G.text, letterSpacing: "-0.02em" }}>Artist recent releases</div>
              <button onClick={() => setShowReleases(false)} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "6px 11px", fontSize: 14, fontFamily: ff }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: G.textTertiary, marginBottom: 10 }}>Released in the last 7 days</div>
            {s.weekReleases.length === 0 && <div style={{ fontSize: 13, color: G.textTertiary, padding: "10px 0" }}>No releases this week.</div>}
            {s.weekReleases.map((x, i, arr) => (
              <a key={i} href={x.r.url || undefined} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${G.surfaceBorder}`, textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {x.r.artwork
                    ? <img src={x.r.artwork} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                    : <div style={{ width: 34, height: 34, borderRadius: 6, background: G.surfaceRaised, flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: G.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.r.name}</div>
                    <div style={{ fontSize: 11.5, color: G.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "capitalize" }}>{[x.c.name, x.r.type].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: G.textSecondary, flexShrink: 0 }}>{relDate(x.at)}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {showIncomplete && (
        <div onClick={() => setShowIncomplete(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: G.surface, border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "80vh", overflowY: "auto", padding: 20, animation: "modalIn .18s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: G.text, letterSpacing: "-0.02em" }}>Incomplete profiles</div>
              <button onClick={() => setShowIncomplete(false)} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "6px 11px", fontSize: 14, fontFamily: ff }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: G.textTertiary, marginBottom: 10 }}>{s.incomplete.length} of {clients.length} need info — click a name, then Edit to fill the gaps.</div>
            {s.incomplete.map((x, i, arr) => (
              <div key={x.c.id || i} onClick={() => { setShowIncomplete(false); onOpenClient(x.c); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${G.surfaceBorder}`, cursor: "pointer" }}>
                <div style={{ fontSize: 13, color: G.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {x.c.name} <span style={{ color: G.textTertiary, fontSize: 12 }}>· {(x.c.types || []).join(' · ') || 'No type'}</span>
                </div>
                <div style={{ fontSize: 12, color: G.red, fontWeight: 600, flexShrink: 0 }}>
                  {x.missing.slice(0, 3).join(' · ')}{x.missing.length > 3 ? ` +${x.missing.length - 3}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Onboarding link chooser ───────────────────────────────────────────────────
// One link for signed clients (merges into the roster), one for recruits
// (data collected in the Onboarding tab only). Copy or open either.
const ONBOARD_URL = 'https://www.milkhoneysports.app/onboard';
function OnboardLinksModal({ onClose }) {
  const [copied, setCopied] = useState('');
  const options = [
    { key: 'client', title: 'Client onboarding', desc: 'For signed athletes — fills their roster profile.', url: ONBOARD_URL },
    { key: 'recruit', title: 'Recruit onboarding', desc: 'For unsigned kids — collects info without touching the roster.', url: `${ONBOARD_URL}?recruit=1` },
  ];
  const copy = async (o) => {
    try { await navigator.clipboard.writeText(o.url); setCopied(o.key); setTimeout(() => setCopied(''), 1800); } catch { /* ignore */ }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: G.surface, border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 16, width: "100%", maxWidth: 460, padding: 20, animation: "modalIn .18s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: G.text, letterSpacing: "-0.02em" }}>Onboarding links</div>
          <button onClick={onClose} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "6px 11px", fontSize: 14, fontFamily: ff }}>✕</button>
        </div>
        {options.map(o => (
          <div key={o.key} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>{o.title}</div>
            <div style={{ fontSize: 12, color: G.textSecondary, margin: "3px 0 10px" }}>{o.desc}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => copy(o)}
                style={{ flex: 1, background: copied === o.key ? G.greenSubtle : G.surface, border: `1px solid ${copied === o.key ? G.green : G.surfaceBorder}`, borderRadius: 9, padding: "8px 0", color: copied === o.key ? G.green : G.text, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff }}>
                {copied === o.key ? 'Copied ✓' : 'Copy link'}
              </button>
              <a href={o.url} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 9, padding: "8px 0", color: G.textSecondary, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff, textAlign: "center", textDecoration: "none" }}>
                Open
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Admin section pages (Recruiting / Marketing / Resources) ──────────────────
// These render raw sheet tabs served by /api/athletes?tab=… so the UI always
// matches whatever columns the sheet actually has.
const adminTabCache = {};
function useAdminTab(key, api = 'athletes') {
  // Serve the last fetch instantly on remount (no loading flash when hopping
  // between pages) and refresh quietly in the background. `api` picks the
  // endpoint: 'athletes' (sports sheet tabs) or 'sheets' (music sheet tabs).
  const ck = `${api}:${key}`;
  const [data, setData] = useState(() => adminTabCache[ck] || null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(!adminTabCache[ck]);
  const load = useCallback(() => {
    if (!adminTabCache[ck]) setLoading(true);
    fetch(`/api/${api}?tab=${key}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); adminTabCache[ck] = d; setData(d); setErr(null); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [key, api, ck]);
  useEffect(() => { load(); }, [load]);
  return { data, err, loading, reload: load };
}

function SheetTable({ headers, rows, onRowClick, emptyMsg, renderCell }) {
  if (!rows.length) return <div style={{ padding: "28px 16px", color: G.textTertiary, fontSize: 13, textAlign: "center" }}>{emptyMsg || 'Nothing here yet.'}</div>;
  return (
    <div className="mh-hscroll" style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>
          {headers.map((h, i) => (
            <th key={i} style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: G.textTertiary, borderBottom: `1px solid ${G.surfaceBorder}`, whiteSpace: "nowrap" }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._row} onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default" }}
              onMouseEnter={e => { e.currentTarget.style.background = G.surfaceRaised; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
              {r.cells.map((c, j) => (
                <td key={j} style={{ padding: "10px 14px", fontSize: 13, color: j === 0 ? G.text : G.textSecondary, fontWeight: j === 0 ? 600 : 400, borderBottom: `1px solid ${G.surfaceBorder}`, whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{renderCell ? renderCell(c, headers[j]) : c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Edit/add modal for a sheet-tab row: one field per column, notes get a textarea.
function TabRowForm({ headers, initial, onSave, onDelete, onCancel, title }) {
  const [vals, setVals] = useState(() => {
    const o = {};
    headers.forEach((h, i) => { o[h] = initial ? (initial.cells[i] || '') : ''; });
    return o;
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const save = async () => {
    setBusy(true);
    try { await onSave(vals); } catch (e) { alert(e.message || 'Save failed'); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm("Remove this row from the sheet? This can't be undone.")) return;
    setBusy(true);
    try { await onDelete(); } catch (e) { alert(e.message || 'Remove failed'); } finally { setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: G.surface, border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "86vh", overflowY: "auto", padding: 20, animation: "modalIn .18s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: G.text, letterSpacing: "-0.02em" }}>{title}</div>
          <button onClick={onCancel} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "6px 11px", fontSize: 14, fontFamily: ff }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {headers.map(h => {
            const isNote = /note|comment/i.test(h);
            return (
              <div key={h} style={{ gridColumn: isNote ? "1 / -1" : "auto" }}>
                <label style={labelStyle}>{h}</label>
                {isNote
                  ? <textarea value={vals[h]} onChange={e => setVals(v => ({ ...v, [h]: e.target.value }))} rows={3} style={{ ...inputBase, resize: "vertical" }} />
                  : <input value={vals[h]} onChange={e => setVals(v => ({ ...v, [h]: e.target.value }))} style={inputBase} />}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          {initial && onDelete && (
            <button onClick={del} disabled={busy} style={{ background: "transparent", border: "1px solid rgba(220,38,38,0.4)", borderRadius: 12, padding: "11px 14px", color: G.red, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Remove</button>
          )}
          <button onClick={onCancel} style={{ flex: 1, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "11px", color: G.textSecondary, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ flex: 2, background: busy ? G.surfaceRaised : G.green, border: "none", borderRadius: 12, padding: "11px", color: busy ? G.textTertiary : "#0a0a0a", fontWeight: 700, fontSize: 14, cursor: busy ? "wait" : "pointer", fontFamily: ff }}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function RecruitingBoard({ isMobile, user, athletes, staff, onPromoted }) {
  const { data, err, loading, reload } = useAdminTab('recruiting');
  const sub = useAdminTab('onboarding');
  const [promoting, setPromoting] = useState('');
  const [justPromoted, setJustPromoted] = useState({});
  const rosterNames = useMemo(() => new Set((athletes || []).map(a => a.name.toLowerCase().trim())), [athletes]);
  // Latest recruit-type submission per person, newest first.
  const recruitSubs = useMemo(() => {
    if (!sub.data) return [];
    const h = sub.data.headers;
    const gi = (n) => h.indexOf(n);
    const ti = gi('type'), ni = gi('name'), si = gi('submittedAt');
    const seen = new Set();
    return sub.data.rows
      .filter(r => (r.cells[ti] || '') === 'recruit' && (r.cells[ni] || '').trim())
      .sort((a, b) => String(b.cells[si] || '').localeCompare(String(a.cells[si] || '')))
      .filter(r => { const k = r.cells[ni].toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; });
  }, [sub.data]);
  // Replay a recruit's submission through the signed onboarding path — the
  // exact same merge that a client filling the form gets (Public stays unset
  // until staff reviews, like any new signee).
  const promote = async (r) => {
    const h = sub.data.headers;
    const cell = (n) => { const i = h.indexOf(n); return i >= 0 ? (r.cells[i] || '') : ''; };
    const split = (v) => v ? v.split(',').map(x => x.trim()).filter(Boolean) : [];
    const name = cell('name');
    setPromoting(name);
    try {
      const resp = await fetch('/api/onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, level: cell('level') || 'College', position: cell('position'), schoolOrTeam: cell('schoolOrTeam'),
          classOf: cell('classOf'), jerseyNumber: cell('jerseyNumber'), birthday: cell('birthday'),
          hometown: cell('hometown'), address: cell('address'),
          instagram: cell('instagram'), twitter: cell('twitter'), tiktok: cell('tiktok'),
          shirt: cell('shirt'), hoodie: cell('hoodie'), shorts: cell('shorts'), pants: cell('pants'),
          shoes: cell('shoes'), gloves: cell('gloves'), gamingSystem: cell('gamingSystem'),
          musicArtists: split(cell('musicArtists')), interests: split(cell('interests')), brands: split(cell('brandTargets')),
        }),
      });
      const d = await resp.json();
      if (!resp.ok || !d.success) throw new Error(d.error || 'Promote failed');
      setJustPromoted(p => ({ ...p, [name.toLowerCase().trim()]: true }));
      if (onPromoted) onPromoted();
    } catch (e) {
      alert(e.message || 'Promote failed');
    } finally {
      setPromoting('');
    }
  };
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const post = async (body) => {
    const r = await fetch('/api/athletes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || 'Save failed');
  };
  const headers = data?.headers || [];
  const agentCol = headers.findIndex(h => /agent/i.test(h));
  // Universal filters: multi-select level chips + the shared filter window.
  const [recLevels, setRecLevels] = useCachedState('recruiting.levels', ['High School', 'College']);
  const toggleRecLevel = (l) => setRecLevels(prev => {
    const next = prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l];
    return next.length ? next : ['High School', 'College'];
  });
  const [side, setSide] = useCachedState('recruiting.side', 'All');
  const [group, setGroup] = useCachedState('recruiting.group', 'All');
  const [agent, setAgent] = useCachedState('recruiting.agent', 'All');
  const [klass, setKlass] = useCachedState('recruiting.klass', 'All');
  const [sortCol, setSortCol] = useCachedState('recruiting.sortCol', 'rating');
  const [sortDir, setSortDir] = useCachedState('recruiting.sortDir', 'desc');
  const hFind = (re) => headers.findIndex(h => re.test(h));
  const nameI = hFind(/name/i), schoolI = hFind(/school/i), levelI = hFind(/^level/i),
    posI = hFind(/position/i), rankI = hFind(/rank/i), classI = hFind(/class|year/i);
  const cellOf = (r, i) => (i >= 0 ? (r.cells[i] || '') : '');
  const starsOf = (r) => { const m = String(cellOf(r, rankI)).match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  const classes = useMemo(() => [...new Set((data?.rows || []).filter(r => recLevels.includes(cellOf(r, levelI).trim())).map(r => cellOf(r, classI).trim()).filter(Boolean))].sort(), [data, classI, levelI, recLevels]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = (data?.rows || [])
    .filter(r => !q || r.cells.some(c => c.toLowerCase().includes(q.toLowerCase())))
    .filter(r => recLevels.includes(cellOf(r, levelI).trim()))
    .filter(r => { if (side === 'All') return true; const g = contractPosGroup(cellOf(r, posI)); return POS_SIDES[side].includes(g) && (group === 'All' || g === group); })
    .filter(r => agent === 'All' || String(agentCol >= 0 ? (r.cells[agentCol] || '') : '').toLowerCase().includes(agent.toLowerCase()))
    .filter(r => klass === 'All' || cellOf(r, classI).trim() === klass)
    .sort((a, b) => {
      // Default view floats the logged-in agent's own recruits to the top.
      if (sortCol === 'rating' && user?.agentKey && agentCol >= 0) {
        const m = (agentMatch(b.cells[agentCol], user.agentKey) ? 1 : 0) - (agentMatch(a.cells[agentCol], user.agentKey) ? 1 : 0);
        if (m) return m;
      }
      const SORT_COLS = { player: nameI, position: posI, school: schoolI, class: classI, agent: agentCol };
      const cmp = sortCol === 'rating'
        ? (starsOf(a) - starsOf(b)) || cellOf(a, nameI).localeCompare(cellOf(b, nameI))
        : cellOf(a, SORT_COLS[sortCol]).localeCompare(cellOf(b, SORT_COLS[sortCol]), undefined, { numeric: true, sensitivity: 'base' }) || cellOf(a, nameI).localeCompare(cellOf(b, nameI));
      return sortDir === 'desc' ? -cmp : cmp;
    });
  const posValue = side === 'All' ? 'All' : (group !== 'All' ? group : side);
  const sections = [
    (staff || []).length > 0 && {
      id: 'agent', title: 'Agent', value: agent,
      rows: [
        { on: agent === 'All', label: 'All agents', onClick: () => setAgent('All') },
        ...(staff || []).map(n => ({ on: agent === n, label: n, onClick: () => setAgent(agent === n ? 'All' : n) })),
      ],
    },
    {
      id: 'class', title: 'Class', value: klass,
      rows: [
        { on: klass === 'All', label: 'All classes', onClick: () => setKlass('All') },
        ...classes.map(c => ({ on: klass === c, label: c, onClick: () => setKlass(klass === c ? 'All' : c) })),
      ],
    },
    {
      id: 'position', title: 'Position', value: posValue,
      rows: [
        { on: side === 'All', label: 'All positions', onClick: () => { setSide('All'); setGroup('All'); } },
        ...Object.keys(POS_SIDES).flatMap(s => [
          { on: side === s && group === 'All', label: s, onClick: () => { setSide(side === s ? 'All' : s); setGroup('All'); } },
          ...(side === s && POS_SIDES[s].length > 1 ? POS_SIDES[s].map(g => ({ on: group === g, label: `· ${g}`, onClick: () => setGroup(group === g ? 'All' : g) })) : []),
        ]),
      ],
    },
  ].filter(Boolean);
  const filterActive = agent !== 'All' || side !== 'All' || klass !== 'All';
  const filterLabel = [agent !== 'All' ? agent : null, posValue !== 'All' ? posValue : null, klass !== 'All' ? klass : null].filter(Boolean).join(', ') || 'All';
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "18px 16px 80px" : "28px 24px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ fontSize: isMobile ? 20 : 23, fontWeight: 800, letterSpacing: "-0.03em", color: G.text }}>Recruiting</div>
        <div style={{ flex: 1 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search recruits..." style={{ ...inputBase, width: isMobile ? 140 : 200 }} />
        <button onClick={() => setEditing('new')} style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap" }}>+ Add</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {['High School', 'College'].map(lv => levelChipBtn(recLevels.includes(lv), lv, () => { toggleRecLevel(lv); setKlass('All'); }))}
        <div style={{ width: 10 }} />
        <FilterMenu compact={isMobile} sections={sections} active={filterActive} label={filterLabel}
          onAll={() => { setAgent('All'); setSide('All'); setGroup('All'); setKlass('All'); }} />
      </div>
      <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, overflow: "hidden" }}>
        {loading ? <div style={{ padding: 40, textAlign: "center", color: G.textTertiary, fontSize: 13 }}>Loading…</div>
          : err ? <div style={{ padding: 40, textAlign: "center", color: G.red, fontSize: 13 }}>{err}</div>
          : rows.length === 0 ? <div style={{ padding: "34px 16px", textAlign: "center", color: G.textTertiary, fontSize: 13 }}>{q || filterActive ? 'No recruits match these filters.' : 'No recruits yet — add the first one.'}</div>
          : (
            <div className="mh-hscroll" style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  {[['player', 'Player'], ['position', 'Position'], ['school', 'School'], ['class', 'Class'], ['agent', 'Agent'], ['rating', 'Rating']].map(([key, h]) => (
                    <th key={key}
                      onClick={() => { if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(key); setSortDir(key === 'rating' ? 'desc' : 'asc'); } }}
                      style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: sortCol === key ? G.green : G.textTertiary, borderBottom: `1px solid ${G.surfaceBorder}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}>
                      {h}{sortCol === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const td = { padding: "11px 16px", fontSize: 13, color: G.textSecondary, borderBottom: i < rows.length - 1 ? `1px solid ${G.surfaceBorder}` : "none", whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" };
                    return (
                      <tr key={r._row} onClick={() => setEditing(r)} style={{ cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ ...td, color: G.text, fontWeight: 600 }}>{cellOf(r, nameI)}</td>
                        <td style={td}>{cellOf(r, posI)}</td>
                        <td style={td}>{cellOf(r, schoolI)}</td>
                        <td style={td}>{cellOf(r, classI)}</td>
                        <td style={td}>{cellOf(r, agentCol)}</td>
                        <td style={{ ...td, color: starsOf(r) >= 4 ? G.green : G.textSecondary, fontWeight: 700 }}>{cellOf(r, rankI)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {recruitSubs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary }}>Recruit submissions</div>
            <div style={{ fontSize: 11, color: G.textTertiary }}>From the recruit onboarding link</div>
          </div>
          <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, overflow: "hidden" }}>
            {recruitSubs.map((r, idx) => {
              const h = sub.data.headers;
              const cell = (n) => { const i = h.indexOf(n); return i >= 0 ? (r.cells[i] || '') : ''; };
              const name = cell('name');
              const onRoster = rosterNames.has(name.toLowerCase().trim()) || justPromoted[name.toLowerCase().trim()];
              const meta = [cell('level'), cell('schoolOrTeam'), cell('position')].filter(Boolean).join(' · ');
              return (
                <div key={r._row} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: idx < recruitSubs.length - 1 ? `1px solid ${G.surfaceBorder}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>{name}</div>
                    <div style={{ fontSize: 12, color: G.textSecondary, marginTop: 2 }}>{meta}{meta ? ' · ' : ''}submitted {String(cell('submittedAt')).slice(0, 10)}</div>
                  </div>
                  {onRoster ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: G.green, flexShrink: 0 }}>On roster ✓</span>
                  ) : (
                    <button onClick={() => promote(r)} disabled={promoting === name}
                      style={{ background: promoting === name ? G.surfaceRaised : G.greenSubtle, border: `1px solid ${promoting === name ? G.surfaceBorder : G.green}`, borderRadius: 9, padding: "7px 12px", color: promoting === name ? G.textTertiary : G.green, fontWeight: 700, fontSize: 12, cursor: promoting === name ? 'wait' : 'pointer', fontFamily: ff, flexShrink: 0, whiteSpace: "nowrap" }}>
                      {promoting === name ? 'Promoting…' : 'Promote to client'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: G.textTertiary, marginTop: 8 }}>
            Promoting creates their roster profile from their submission — hidden from the public site until you review and flip Public.
          </div>
        </div>
      )}
      {editing && (
        <TabRowForm headers={headers} initial={editing === 'new' ? null : editing}
          title={editing === 'new' ? 'Add recruit' : (editing.cells[0] || 'Edit recruit')}
          onCancel={() => setEditing(null)}
          onSave={async (vals) => {
            await post(editing === 'new'
              ? { action: 'tab-append', tab: 'recruiting', values: vals }
              : { action: 'tab-update', tab: 'recruiting', row: editing._row, values: vals });
            setEditing(null); reload();
          }}
          onDelete={editing === 'new' ? null : async () => {
            await post({ action: 'tab-delete', tab: 'recruiting', row: editing._row });
            setEditing(null); reload();
          }} />
      )}
    </div>
  );
}

function MarketingPage({ isMobile, athletes, staff, onOpenAthlete }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "18px 16px 80px" : "28px 24px 60px" }}>
      <div style={{ fontSize: isMobile ? 20 : 23, fontWeight: 800, letterSpacing: "-0.03em", color: G.text, marginBottom: 18 }}>Marketing</div>
      <GrowthBoardSection athletes={athletes} staff={staff} onOpenAthlete={onOpenAthlete} isMobile={isMobile} />
    </div>
  );
}

// ── Music marketing page (company only — lives in the left nav) ──────────────
// Same growth board as sports, music flavored: per-platform followers with the
// 7-day change underneath, total reach, and growth — sortable columns.
function MusicMarketingPage({ isMobile, clients, onOpenClient }) {
  const hist = useAdminTab('socialhistory', 'sheets');
  const [q, setQ] = useCachedState('mgrowth.q', '');
  const [sortCol, setSortCol] = useCachedState('mgrowth.sortCol', 'total');
  const [sortDir, setSortDir] = useCachedState('mgrowth.sortDir', 'desc');
  const seriesByName = useMemo(() => seriesFromHistory(hist.data?.rows), [hist.data]);
  const platDelta = useMemo(() => {
    const out = {};
    for (const [k, arr] of Object.entries(seriesByName)) {
      const last = arr[arr.length - 1];
      if (!last) continue;
      const target = last.dt.getTime() - 7 * 86400000;
      let base = arr[0];
      for (const r of arr) if (r !== last && Math.abs(r.dt - target) < Math.abs(base.dt - target)) base = r;
      if (base !== last) out[k] = {
        ig: base.ig > 0 ? last.ig - base.ig : 0,
        x: base.x > 0 ? last.x - base.x : 0,
        tk: base.tk > 0 ? last.tk - base.tk : 0,
      };
    }
    return out;
  }, [seriesByName]);
  const valOf = {
    ig: c => countFrom(c.igFollowers), x: c => countFrom(c.twitterFollowers), tt: c => countFrom(c.tiktokFollowers),
    total: c => clientReach(c), growth: c => (c.growth7d || 0),
  };
  const ql = q.trim().toLowerCase();
  const sorted = clients
    .filter(c => clientReach(c) > 0 || (c.growth7d || 0) !== 0)
    .filter(c => !ql || c.name.toLowerCase().includes(ql) || (c.types || []).join(' ').toLowerCase().includes(ql) || String(c.contact || '').toLowerCase().includes(ql))
    .sort((a, b) => {
      const cmp = (valOf[sortCol] ? valOf[sortCol](a) - valOf[sortCol](b) : a.name.localeCompare(b.name)) || a.name.localeCompare(b.name);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  const platCell = (count, d, tdStyle) => (
    <td style={tdStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, color: count ? G.text : G.textTertiary }}>{count ? bigNum(count) : '—'}</div>
      {d != null && d !== 0 && <div style={{ fontSize: 11.5, fontWeight: 700, color: d > 0 ? G.green : G.red, marginTop: 1 }}>{d > 0 ? '↑' : '↓'} {bigNum(Math.abs(d))}</div>}
    </td>
  );
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "18px 16px 80px" : "28px 24px 60px" }}>
      <div style={{ fontSize: isMobile ? 20 : 23, fontWeight: 800, letterSpacing: "-0.03em", color: G.text, marginBottom: 18 }}>Marketing</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div style={{ flex: 1 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients..."
          style={{ ...inputBase, width: isMobile ? 140 : 200, padding: "7px 11px", fontSize: 12 }} />
      </div>
      <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, overflow: "hidden" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: "34px 0", textAlign: "center", color: G.textTertiary, fontSize: 13 }}>No follower data yet.</div>
        ) : (
          <div className="mh-hscroll" style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                {[['client', 'Client'], ['ig', 'Instagram'], ['x', 'X'], ['tt', 'TikTok'], ['total', 'Total'], ['growth', 'Growth']].map(([key, h]) => (
                  <th key={key}
                    onClick={() => { if (sortCol === key) setSortDir(dd => dd === 'asc' ? 'desc' : 'asc'); else { setSortCol(key); setSortDir(key === 'client' ? 'asc' : 'desc'); } }}
                    style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: sortCol === key ? G.green : G.textTertiary, borderBottom: `1px solid ${G.surfaceBorder}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}>
                    {h}{sortCol === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {sorted.map((c, i) => {
                  const pd = platDelta[c.name.toLowerCase().trim()];
                  const growth = c.growth7d || 0;
                  const td = { padding: "10px 16px", fontSize: 13, color: G.textSecondary, borderBottom: i < sorted.length - 1 ? `1px solid ${G.surfaceBorder}` : "none", whiteSpace: "nowrap", verticalAlign: "middle" };
                  return (
                    <tr key={c.id || i} onClick={() => onOpenClient(c)} style={{ cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ ...td, color: G.text, fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={c.name} photoUrl={c.photoUrl} size={30} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                        </div>
                      </td>
                      {platCell(countFrom(c.igFollowers), pd?.ig, td)}
                      {platCell(countFrom(c.twitterFollowers), pd?.x, td)}
                      {platCell(countFrom(c.tiktokFollowers), pd?.tk, td)}
                      <td style={{ ...td, color: G.text, fontWeight: 700 }}>{bigNum(clientReach(c))}</td>
                      <td style={{ ...td, fontWeight: 700, color: growth > 0 ? G.green : growth < 0 ? G.red : G.textTertiary }}>
                        {growth === 0 ? '—' : <>{growth > 0 ? '+' : ''}{bigNum(growth)}{c.growth7dPct ? <span style={{ color: G.textTertiary, fontWeight: 500 }}> · {c.growth7dPct}%</span> : null}</>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Brand deal tracker (company only — lives in the left nav) ────────────────
const BRAND_DEAL_CATEGORIES = ['Public Appearance', 'Trading Card', 'Social Post', 'In Game Activation', 'Memorabilia Signing', 'Photo Shoot'];
// Deal value → dollars when parseable ("$5,000", "$1.2M", "7500"); product-only
// deals ("3 pairs of cleats") count as 0 in the money stats but still show.
const dealMoney = (v) => {
  const s = String(v || '').trim();
  if (!s) return 0;
  const m = s.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?/) || (/^[\d,]+(?:\.\d+)?$/.test(s) ? [s, s, ''] : null);
  if (!m) return 0;
  const n = parseFloat(String(m[1]).replace(/,/g, ''));
  if (!isFinite(n)) return 0;
  const suf = (m[2] || '').toLowerCase();
  return Math.round(n * (suf === 'm' ? 1e6 : suf === 'k' ? 1e3 : 1));
};
const parseDeals = (d) => {
  if (!d) return [];
  const hi = (n) => d.headers.findIndex(h => h.toLowerCase() === n.toLowerCase());
  const c = { company: hi('company'), clients: hi('clients'), category: hi('category'), value: hi('value'), deliverables: hi('deliverables'), date: hi('dateSubmitted'), fileId: hi('fileId'), fileName: hi('fileName') };
  return d.rows.map(r => ({
    _row: r._row,
    company: c.company >= 0 ? r.cells[c.company] || '' : '',
    clients: (c.clients >= 0 ? r.cells[c.clients] || '' : '').split(',').map(s => s.trim()).filter(Boolean),
    category: c.category >= 0 ? r.cells[c.category] || '' : '',
    value: c.value >= 0 ? r.cells[c.value] || '' : '',
    deliverables: c.deliverables >= 0 ? r.cells[c.deliverables] || '' : '',
    dateSubmitted: c.date >= 0 ? r.cells[c.date] || '' : '',
    fileId: c.fileId >= 0 ? r.cells[c.fileId] || '' : '',
    fileName: c.fileName >= 0 ? r.cells[c.fileName] || '' : '',
  })).filter(x => x.company || x.clients.length);
};

// Add / edit one deal. The optional file uploads straight to the FIRST tagged
// player's Box folder, then copies land in every other tagged player's folder.
function BrandDealForm({ initial, athleteNames, user, onDone, onCancel }) {
  const editing = !!(initial && initial._row);
  const [form, setForm] = useState(() => ({
    company: initial?.company || '', clients: (initial?.clients || []).join(', '),
    category: initial?.category || '', value: initial?.value || '', deliverables: initial?.deliverables || '',
  }));
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const post = (body) => fetch('/api/athletes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const save = async () => {
    const names = form.clients.split(',').map(s => s.trim()).filter(Boolean);
    if (!form.company.trim()) return alert('Company is required');
    if (!names.length) return alert('Tag at least one client');
    setBusy(true);
    try {
      const values = { company: form.company.trim(), clients: names.join(', '), category: form.category, value: form.value, deliverables: form.deliverables };
      if (!editing) {
        values.dateSubmitted = new Date().toISOString().slice(0, 10);
        values.createdBy = user?.name || 'Team';
      }
      if (file) {
        // Upload into the first tagged player's folder, then copy to the rest.
        const meta = await (await fetch(`/api/box?person=${encodeURIComponent(names[0])}&kind=sports`)).json();
        if (meta.error) throw new Error(meta.error);
        const fd = new FormData();
        fd.append('attributes', JSON.stringify({ name: file.name, parent: { id: String(meta.folderId) } }));
        fd.append('file', file);
        let r = await fetch('https://upload.box.com/api/2.0/files/content', { method: 'POST', headers: { Authorization: `Bearer ${meta.token}` }, body: fd });
        let uploaded = null;
        if (r.status === 409) {
          const conflict = await r.json().catch(() => null);
          const existingId = conflict?.context_info?.conflicts?.id;
          if (existingId) {
            const vf = new FormData();
            vf.append('attributes', JSON.stringify({ name: file.name }));
            vf.append('file', file);
            r = await fetch(`https://upload.box.com/api/2.0/files/${existingId}/content`, { method: 'POST', headers: { Authorization: `Bearer ${meta.token}` }, body: vf });
          }
        }
        if (!r.ok) throw new Error('File upload failed');
        uploaded = (await r.json()).entries?.[0];
        values.fileId = uploaded?.id || '';
        values.fileName = file.name;
        for (const n of names.slice(1)) {
          await fetch('/api/box', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'copy', fileId: values.fileId, person: n, kind: 'sports' }) }).catch(() => {});
        }
      }
      const resp = editing
        ? await post({ action: 'tab-update', tab: 'branddeals', row: initial._row, values })
        : await post({ action: 'tab-append', tab: 'branddeals', values });
      if (resp.error) throw new Error(resp.error);
      onDone();
    } catch (e) { alert('Save failed: ' + e.message); }
    setBusy(false);
  };
  const del = async () => {
    if (!window.confirm('Remove this deal? Files already in player folders stay in Box.')) return;
    setBusy(true);
    try {
      const resp = await post({ action: 'tab-delete', tab: 'branddeals', row: initial._row });
      if (resp.error) throw new Error(resp.error);
      onDone();
    } catch (e) { alert('Remove failed: ' + e.message); setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: G.surface, border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 22, width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: G.shadowLg }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: G.text }}>{editing ? 'Edit Brand Deal' : 'Add Brand Deal'}</span>
          <button onClick={onCancel} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "7px 12px", fontSize: 14, fontFamily: ff }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "20px 24px" }}>
          <Field label="Company"><Input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Nike" /></Field>
          <Field label="Client(s)">
            <MultiSelectCombo value={form.clients} onChange={v => set('clients', v)} options={athleteNames} placeholder="Tag one or more players..." />
          </Field>
          <Field label="Category">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {BRAND_DEAL_CATEGORIES.map(cat => {
                const on = form.category === cat;
                return <button key={cat} onClick={() => set('category', on ? '' : cat)}
                  style={{ padding: "8px 12px", border: `1px solid ${on ? G.green : G.surfaceBorder}`, borderRadius: 9, background: on ? G.greenSubtle : G.surfaceRaised, color: on ? G.green : G.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap" }}>
                  {cat}
                </button>;
              })}
            </div>
          </Field>
          <Field label="Value"><Input value={form.value} onChange={e => set('value', e.target.value)} placeholder="$5,000 — or product, e.g. 3 pairs of cleats" /></Field>
          <Field label="Deliverables"><Textarea value={form.deliverables} onChange={e => set('deliverables', e.target.value)} rows={3} placeholder="2 IG posts + 1 appearance at store opening" /></Field>
          <div style={{ marginBottom: 4 }}>
            <label style={labelStyle}>Deal file</label>
            <div onClick={() => fileRef.current?.click()}
              style={{ ...inputBase, cursor: "pointer", color: file || initial?.fileName ? G.text : G.textTertiary }}>
              {file ? file.name : initial?.fileName ? `${initial.fileName} — click to replace` : 'Attach a file (goes to each tagged player’s Box folder)'}
            </div>
            <input ref={fileRef} type="file" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${G.surfaceBorder}`, display: "flex", gap: 10, flexShrink: 0 }}>
          {editing && (
            <button onClick={del} disabled={busy} style={{ background: "transparent", border: `1px solid ${G.red}`, borderRadius: 12, padding: "11px 16px", color: G.red, fontWeight: 600, fontSize: 14, cursor: busy ? "not-allowed" : "pointer", fontFamily: ff }}>Delete</button>
          )}
          <button onClick={onCancel} style={{ flex: 1, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "11px", color: G.textSecondary, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ flex: 2, background: busy ? G.surfaceRaised : G.green, border: "none", borderRadius: 12, padding: "11px", color: busy ? G.textTertiary : "#0a0a0a", fontWeight: 700, fontSize: 14, cursor: busy ? "wait" : "pointer", fontFamily: ff }}>
            {busy ? 'Saving…' : editing ? 'Save Changes' : 'Add Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BrandDealsPage({ isMobile, athletes, staff, user, onOpenAthlete }) {
  const tab = useAdminTab('branddeals');
  const deals = useMemo(() => parseDeals(tab.data), [tab.data]);
  const [q, setQ] = useCachedState('bdeals.q', '');
  const [cat, setCat] = useCachedState('bdeals.cat', 'All');
  const [agent, setAgent] = useCachedState('bdeals.agent', 'All');
  const [sortCol, setSortCol] = useCachedState('bdeals.sortCol', 'date');
  const [sortDir, setSortDir] = useCachedState('bdeals.sortDir', 'desc');
  const [editing, setEditing] = useState(null); // {} = new, deal = edit
  const [previewFile, setPreviewFile] = useState(null);
  const athleteByName = useMemo(() => {
    const m = {};
    athletes.forEach(a => { m[a.name.toLowerCase().trim()] = a; });
    return m;
  }, [athletes]);
  const athleteNames = useMemo(() => athletes.map(a => a.name).sort((a, b) => a.localeCompare(b)), [athletes]);
  const ql = q.trim().toLowerCase();
  const filtered = deals
    .filter(d => cat === 'All' || d.category === cat)
    .filter(d => agent === 'All' || d.clients.some(n => String(athleteByName[n.toLowerCase()]?.agentAssigned || '').toLowerCase().includes(agent.toLowerCase())))
    .filter(d => !ql || d.company.toLowerCase().includes(ql) || d.clients.join(' ').toLowerCase().includes(ql) || d.category.toLowerCase().includes(ql) || d.deliverables.toLowerCase().includes(ql));
  const sorted = [...filtered].sort((a, b) => {
    const sv = { company: x => x.company.toLowerCase(), clients: x => (x.clients[0] || '').toLowerCase(), category: x => x.category.toLowerCase() };
    const nv = { value: x => dealMoney(x.value), date: x => Date.parse(x.dateSubmitted) || 0 };
    let cmp;
    if (nv[sortCol]) cmp = nv[sortCol](a) - nv[sortCol](b);
    else { const f = sv[sortCol] || sv.company; cmp = f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0; }
    return (sortDir === 'desc' ? -1 : 1) * (cmp || a.company.localeCompare(b.company));
  });
  const sections = [
    {
      id: 'category', title: 'Category', value: cat === 'All' ? 'All' : cat,
      rows: [
        { on: cat === 'All', label: 'All categories', onClick: () => setCat('All') },
        ...BRAND_DEAL_CATEGORIES.map(c => ({ on: cat === c, label: c, onClick: () => setCat(cat === c ? 'All' : c) })),
      ],
    },
    (staff || []).length > 0 && {
      id: 'agent', title: 'Agent', value: agent,
      rows: [
        { on: agent === 'All', label: 'All agents', onClick: () => setAgent('All') },
        ...(staff || []).map(n => ({ on: agent === n, label: n, onClick: () => setAgent(agent === n ? 'All' : n) })),
      ],
    },
  ].filter(Boolean);
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "18px 16px 80px" : "28px 24px 60px" }}>
      <div style={{ fontSize: isMobile ? 20 : 23, fontWeight: 800, letterSpacing: "-0.03em", color: G.text, marginBottom: 18 }}>Brand Deals</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <FilterMenu compact={isMobile} sections={sections} active={cat !== 'All' || agent !== 'All'}
          label={[cat !== 'All' ? cat : null, agent !== 'All' ? agent : null].filter(Boolean).join(', ') || 'All'}
          onAll={() => { setCat('All'); setAgent('All'); }} />
        <div style={{ flex: 1 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search deals..."
          style={{ ...inputBase, width: isMobile ? 120 : 200, padding: "7px 11px", fontSize: 12 }} />
        <button onClick={() => setEditing({})}
          style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap" }}>
          + Add Deal
        </button>
      </div>
      <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, overflow: "hidden" }}>
        {tab.loading && !tab.data ? (
          <div style={{ padding: "34px 0", textAlign: "center", color: G.textTertiary, fontSize: 13 }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: "34px 0", textAlign: "center", color: G.textTertiary, fontSize: 13 }}>{deals.length === 0 ? 'No brand deals yet — add the first one.' : 'No deals match these filters.'}</div>
        ) : (
          <div className="mh-hscroll" style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                {[['company', 'Company'], ['clients', 'Client(s)'], ['category', 'Category'], ['value', 'Value'], ['date', 'Submitted'], ['deliverables', 'Deliverables'], ['file', 'File']].map(([key, h]) => (
                  <th key={key}
                    onClick={() => { if (key === 'deliverables' || key === 'file') return; if (sortCol === key) setSortDir(dd => dd === 'asc' ? 'desc' : 'asc'); else { setSortCol(key); setSortDir(key === 'company' || key === 'clients' ? 'asc' : 'desc'); } }}
                    style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: sortCol === key ? G.green : G.textTertiary, borderBottom: `1px solid ${G.surfaceBorder}`, whiteSpace: "nowrap", cursor: key === 'deliverables' || key === 'file' ? "default" : "pointer", userSelect: "none" }}>
                    {h}{sortCol === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {sorted.map((d, i) => {
                  const td = { padding: "10px 14px", fontSize: 13, color: G.textSecondary, borderBottom: i < sorted.length - 1 ? `1px solid ${G.surfaceBorder}` : "none", whiteSpace: "nowrap", verticalAlign: "middle" };
                  return (
                    <tr key={d._row} onClick={() => setEditing(d)} style={{ cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ ...td, color: G.text, fontWeight: 600 }}>{d.company}</td>
                      <td style={td}>
                        {d.clients.map((n, j) => {
                          const a = athleteByName[n.toLowerCase()];
                          return (
                            <span key={j}>
                              {j > 0 && <span style={{ color: G.textTertiary }}> · </span>}
                              <span onClick={a ? (e) => { e.stopPropagation(); onOpenAthlete(a); } : undefined}
                                style={a ? { color: G.text, cursor: "pointer", textDecoration: "underline", textDecorationColor: G.surfaceBorderLight, textUnderlineOffset: 3 } : {}}>{n}</span>
                            </span>
                          );
                        })}
                      </td>
                      <td style={td}>{d.category || '—'}</td>
                      <td style={{ ...td, color: G.text, fontWeight: 600 }}>{d.value || '—'}</td>
                      <td style={td}>{d.dateSubmitted || '—'}</td>
                      <td style={{ ...td, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{d.deliverables || '—'}</td>
                      <td style={td}>
                        {d.fileId ? (
                          <button onClick={(e) => { e.stopPropagation(); setPreviewFile({ id: d.fileId, name: d.fileName || 'file' }); }} title={d.fileName}
                            style={{ background: "transparent", border: "none", color: G.green, cursor: "pointer", padding: 2, display: "flex" }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2l7 7M13 2v7h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <BrandDealForm initial={editing._row ? editing : null} athleteNames={athleteNames} user={user}
          onDone={() => { setEditing(null); tab.reload(); }} onCancel={() => setEditing(null)} />
      )}
      {previewFile && <BoxPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}

// Brand deals card on the player profile (company view) — this player's deals.
function BrandDealsModule({ athlete: a }) {
  const tab = useAdminTab('branddeals');
  const key = a.name.toLowerCase().trim();
  const deals = useMemo(() => parseDeals(tab.data).filter(d => d.clients.some(n => n.toLowerCase().trim() === key)), [tab.data, key]);
  const [previewFile, setPreviewFile] = useState(null);
  return (
    <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 11 }}>Brand deals</div>
      {deals.length === 0 ? <div style={{ fontSize: 13, color: G.textTertiary }}>No brand deals yet.</div>
        : deals.map((d, i, arr) => (
          <div key={d._row} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${G.surfaceBorder}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: G.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.company}{d.value ? <span style={{ color: G.green, fontWeight: 700 }}> · {d.value}</span> : null}
              </div>
              <div style={{ fontSize: 11.5, color: G.textTertiary, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[d.category, d.dateSubmitted, d.deliverables].filter(Boolean).join(' · ')}
              </div>
            </div>
            {d.fileId && (
              <button onClick={() => setPreviewFile({ id: d.fileId, name: d.fileName || 'file' })} title={d.fileName}
                style={{ background: "transparent", border: "none", color: G.green, cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2l7 7M13 2v7h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
          </div>
        ))}
      {previewFile && <BoxPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}

// ── Contracts page (company only — lives in the left nav) ────────────────────
// Every athlete with a deal (Spotrac NFL terms or the manual college $/yr),
// ranked by yearly value, filterable by league / position group / team.
function contractPosGroup(pos) {
  const p = String(pos || '').toUpperCase().trim();
  if (/^QB/.test(p)) return 'QB';
  if (/^(RB|FB|HB)/.test(p)) return 'RB';
  if (/^WR/.test(p)) return 'WR';
  if (/^TE/.test(p)) return 'TE';
  if (/^(OT|OG|OL)/.test(p) || /^(C|G|T)$/.test(p)) return 'OL';
  if (/^(DT|DE|DL|NT|EDGE)/.test(p)) return 'DL';
  if (/^(LB|ILB|OLB|MLB)/.test(p)) return 'LB';
  if (/^(CB|DB|FS|SS|S)/.test(p)) return 'DB';
  if (/^(K|P|LS|PK)/.test(p)) return 'ST';
  return '';
}
function ContractsPage({ isMobile, athletes, staff, onOpenAthlete }) {
  const [levels, setLevels] = useCachedState('contracts.levels', ['NFL', 'College']);
  const toggleLevel = (l) => setLevels(prev => {
    const next = prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l];
    return next.length ? next : ['NFL', 'College'];
  });
  const [agent, setAgent] = useCachedState('contracts.agent', 'All');
  const [side, setSide] = useCachedState('contracts.side', 'All');
  const [group, setGroup] = useCachedState('contracts.group', 'All');
  const [team, setTeam] = useCachedState('contracts.team', 'All');
  const [q, setQ] = useCachedState('contracts.q', '');
  const [sortCol, setSortCol] = useCachedState('contracts.sortCol', 'yearly');
  const [sortDir, setSortDir] = useCachedState('contracts.sortDir', 'desc');
  const moneyNum = (v) => {
    const str = String(v == null ? '' : v).trim();
    if (!str) return 0;
    const n = parseFloat(str.replace(/[^0-9.]/g, ''));
    if (!isFinite(n) || n <= 0) return 0;
    return /m/i.test(str) ? n * 1e6 : /k/i.test(str) ? n * 1e3 : n;
  };
  const fmt = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
  const deals = useMemo(() => athletes
    .map(a => {
      const yearly = moneyNum(a.contractYearly) || moneyNum(a.contractAav);
      if (!yearly) return null;
      return { a, yearly, team: a.nflTeam || a.college || '', manual: !!moneyNum(a.contractYearly) };
    })
    .filter(Boolean)
    .sort((x, y) => y.yearly - x.yearly), [athletes]);
  const teams = useMemo(() => [...new Set(deals.map(d => d.team).filter(Boolean))].sort(), [deals]);
  const list = deals.filter(d => {
    const g = contractPosGroup(d.a.position);
    return levels.includes(d.a.level) &&
      (agent === 'All' || String(d.a.agentAssigned || '').toLowerCase().includes(agent.toLowerCase())) &&
      (side === 'All' || (POS_SIDES[side].includes(g) && (group === 'All' || g === group))) &&
      (team === 'All' || d.team === team) &&
      (!q.trim() || athleteSearchMatch(d.a, q.trim().toLowerCase()));
  });
  const sum = list.reduce((s, d) => s + d.yearly, 0);
  const numOf = { yearly: d => d.yearly, total: d => moneyNum(d.a.contractTotal), gtd: d => moneyNum(d.a.contractGuaranteed) };
  const sorted = [...list].sort((x, y) => {
    const cmp = (numOf[sortCol] ? numOf[sortCol](x) - numOf[sortCol](y)
      : sortCol === 'position' ? String(x.a.position || '').localeCompare(String(y.a.position || ''))
      : sortCol === 'team' ? x.team.localeCompare(y.team)
      : sortCol === 'years' ? String(x.a.contractYears || '').localeCompare(String(y.a.contractYears || ''))
      : x.a.name.localeCompare(y.a.name)) || x.a.name.localeCompare(y.a.name);
    return sortDir === 'desc' ? -cmp : cmp;
  });
  const posValue = side === 'All' ? 'All' : (group !== 'All' ? group : side);
  const sections = [
    (staff || []).length > 0 && {
      id: 'agent', title: 'Agent', value: agent,
      rows: [
        { on: agent === 'All', label: 'All agents', onClick: () => setAgent('All') },
        ...(staff || []).map(n => ({ on: agent === n, label: n, onClick: () => setAgent(agent === n ? 'All' : n) })),
      ],
    },
    {
      id: 'position', title: 'Position', value: posValue,
      rows: [
        { on: side === 'All', label: 'All positions', onClick: () => { setSide('All'); setGroup('All'); } },
        ...Object.keys(POS_SIDES).flatMap(s => [
          { on: side === s && group === 'All', label: s, onClick: () => { setSide(side === s ? 'All' : s); setGroup('All'); } },
          ...(side === s && POS_SIDES[s].length > 1 ? POS_SIDES[s].map(g => ({ on: group === g, label: `· ${g}`, onClick: () => setGroup(group === g ? 'All' : g) })) : []),
        ]),
      ],
    },
    {
      id: 'team', title: 'Team', value: team,
      rows: [
        { on: team === 'All', label: 'All teams', onClick: () => setTeam('All') },
        ...teams.map(t => ({ on: team === t, label: t, onClick: () => setTeam(team === t ? 'All' : t) })),
      ],
    },
  ].filter(Boolean);
  const filterActive = agent !== 'All' || side !== 'All' || team !== 'All';
  const filterLabel = [agent !== 'All' ? agent : null, posValue !== 'All' ? posValue : null, team !== 'All' ? team : null].filter(Boolean).join(', ') || 'All';
  const card = { background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, padding: 16 };
  const statLabel = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: G.green, marginTop: 7 };
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "18px 16px 80px" : "28px 24px 60px" }}>
      <div style={{ fontSize: isMobile ? 20 : 23, fontWeight: 800, letterSpacing: "-0.03em", color: G.text, marginBottom: 18 }}>Contracts</div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 24, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{sum ? `${fmt(sum)}` : '—'}</div>
          <div style={statLabel}>Total / year</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 24, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{list.length}</div>
          <div style={statLabel}>Deals</div>
        </div>
        {!isMobile && (
          <div style={card}>
            <div style={{ fontSize: 24, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{list.length ? fmt(sum / list.length) : '—'}</div>
            <div style={statLabel}>Average / year</div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {['NFL', 'College'].map(lv => levelChipBtn(levels.includes(lv), lv, () => toggleLevel(lv)))}
        <div style={{ width: 10 }} />
        <FilterMenu compact={isMobile} sections={sections} active={filterActive} label={filterLabel}
          onAll={() => { setLevels(['NFL', 'College']); setAgent('All'); setSide('All'); setGroup('All'); setTeam('All'); }} />
        <div style={{ flex: 1 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search contracts..."
          style={{ ...inputBase, width: isMobile ? 140 : 200, padding: "7px 11px", fontSize: 12 }} />
      </div>
      <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, overflow: "hidden" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: "34px 16px", textAlign: "center", color: G.textTertiary, fontSize: 13 }}>
            No contracts match these filters.
          </div>
        ) : (
          <div className="mh-hscroll" style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                {[['player', 'Player'], ['position', 'Position'], ['team', 'Team'], ['yearly', '$ / Year'], ['years', 'Years'], ['total', 'Total'], ['gtd', 'Guaranteed']].map(([key, h]) => (
                  <th key={key}
                    onClick={() => { if (sortCol === key) setSortDir(dd => dd === 'asc' ? 'desc' : 'asc'); else { setSortCol(key); setSortDir(['yearly', 'total', 'gtd'].includes(key) ? 'desc' : 'asc'); } }}
                    style={{ textAlign: "left", padding: "10px 16px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: sortCol === key ? G.green : G.textTertiary, borderBottom: `1px solid ${G.surfaceBorder}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}>
                    {h}{sortCol === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {sorted.map((d, i) => {
                  const a = d.a;
                  const td = { padding: "10px 16px", fontSize: 13, color: G.textSecondary, borderBottom: i < sorted.length - 1 ? `1px solid ${G.surfaceBorder}` : "none", whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" };
                  const tot = moneyNum(a.contractTotal), gtd = moneyNum(a.contractGuaranteed);
                  return (
                    <tr key={a.id || i} onClick={() => onOpenAthlete(a)} style={{ cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ ...td, color: G.text, fontWeight: 600 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={a.name} photoUrl={a.photoUrl} size={30} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                        </div>
                      </td>
                      <td style={td}>{a.position}</td>
                      <td style={td}>{d.team}</td>
                      <td style={{ ...td, color: G.text, fontWeight: 700 }}>{fmt(d.yearly)}</td>
                      <td style={td}>{d.manual ? '—' : (a.contractYears || '—')}</td>
                      <td style={td}>{tot ? fmt(tot) : '—'}</td>
                      <td style={td}>{gtd ? fmt(gtd) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Gifting page (company only) — sizes + addresses for sending merch ────────
function GiftingPage({ isMobile, athletes, staff, onOpenAthlete }) {
  const [levels, setLevels] = useCachedState('gifting.levels', [...ALL_LEVELS]);
  const toggleLevel = (l) => setLevels(prev => {
    const next = prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l];
    return next.length ? next : [...ALL_LEVELS];
  });
  const [agent, setAgent] = useCachedState('gifting.agent', 'All');
  const [side, setSide] = useCachedState('gifting.side', 'All');
  const [group, setGroup] = useCachedState('gifting.group', 'All');
  const [q, setQ] = useCachedState('gifting.q', '');
  const [sortCol, setSortCol] = useCachedState('gifting.sortCol', 'player');
  const [sortDir, setSortDir] = useCachedState('gifting.sortDir', 'asc');
  const COLS = [
    ['player', 'Player', a => a.name],
    ['shirt', 'Shirt', a => a.shirtSize || ''],
    ['hoodie', 'Hoodie', a => a.hoodieSize || ''],
    ['shorts', 'Shorts', a => a.shortsSize || ''],
    ['pants', 'Pants', a => a.sweatpantsSize || ''],
    ['shoes', 'Shoes', a => a.shoeSize || ''],
    ['gloves', 'Gloves', a => a.glovesSize || ''],
    ['gaming', 'Gaming', a => a.gamingSystem || ''],
    ['address', 'Address', a => a.address || ''],
  ];
  const colOf = Object.fromEntries(COLS.map(([k, , fn]) => [k, fn]));
  const sorted = athletes
    .filter(a => levels.includes(a.level))
    .filter(a => agent === 'All' || String(a.agentAssigned || '').toLowerCase().includes(agent.toLowerCase()))
    .filter(a => { if (side === 'All') return true; const g = contractPosGroup(a.position); return POS_SIDES[side].includes(g) && (group === 'All' || g === group); })
    .filter(a => !q.trim() || athleteSearchMatch(a, q.trim().toLowerCase()))
    .sort((a, b) => {
      const va = String(colOf[sortCol](a) || ''), vb = String(colOf[sortCol](b) || '');
      // Blanks always sink to the bottom regardless of direction.
      if (!va.trim() !== !vb.trim()) return va.trim() ? -1 : 1;
      const cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  const posValue = side === 'All' ? 'All' : (group !== 'All' ? group : side);
  const sections = [
    (staff || []).length > 0 && {
      id: 'agent', title: 'Agent', value: agent,
      rows: [
        { on: agent === 'All', label: 'All agents', onClick: () => setAgent('All') },
        ...(staff || []).map(n => ({ on: agent === n, label: n, onClick: () => setAgent(agent === n ? 'All' : n) })),
      ],
    },
    {
      id: 'position', title: 'Position', value: posValue,
      rows: [
        { on: side === 'All', label: 'All positions', onClick: () => { setSide('All'); setGroup('All'); } },
        ...Object.keys(POS_SIDES).flatMap(s => [
          { on: side === s && group === 'All', label: s, onClick: () => { setSide(side === s ? 'All' : s); setGroup('All'); } },
          ...(side === s && POS_SIDES[s].length > 1 ? POS_SIDES[s].map(g => ({ on: group === g, label: `· ${g}`, onClick: () => setGroup(group === g ? 'All' : g) })) : []),
        ]),
      ],
    },
  ].filter(Boolean);
  const filterActive = agent !== 'All' || side !== 'All';
  const filterLabel = [agent !== 'All' ? agent : null, posValue !== 'All' ? posValue : null].filter(Boolean).join(', ') || 'All';
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "18px 16px 80px" : "28px 24px 60px" }}>
      <div style={{ fontSize: isMobile ? 20 : 23, fontWeight: 800, letterSpacing: "-0.03em", color: G.text, marginBottom: 18 }}>Gifting</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {ALL_LEVELS.map(l => levelChipBtn(levels.includes(l), l, () => toggleLevel(l)))}
        <div style={{ width: 10 }} />
        <FilterMenu compact={isMobile} sections={sections} active={filterActive} label={filterLabel}
          onAll={() => { setLevels([...ALL_LEVELS]); setAgent('All'); setSide('All'); setGroup('All'); }} />
        <div style={{ flex: 1 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search athletes..."
          style={{ ...inputBase, width: isMobile ? 140 : 200, padding: "7px 11px", fontSize: 12 }} />
      </div>
      <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, overflow: "hidden" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: "34px 16px", textAlign: "center", color: G.textTertiary, fontSize: 13 }}>No athletes match these filters.</div>
        ) : (
          <div className="mh-hscroll" style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                {COLS.map(([key, h]) => (
                  <th key={key}
                    onClick={() => { if (sortCol === key) setSortDir(dd => dd === 'asc' ? 'desc' : 'asc'); else { setSortCol(key); setSortDir('asc'); } }}
                    style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: sortCol === key ? G.green : G.textTertiary, borderBottom: `1px solid ${G.surfaceBorder}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}>
                    {h}{sortCol === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {sorted.map((a, i) => {
                  const td = { padding: "10px 14px", fontSize: 13, color: G.textSecondary, borderBottom: i < sorted.length - 1 ? `1px solid ${G.surfaceBorder}` : "none", whiteSpace: "nowrap" };
                  return (
                    <tr key={a.id || i} onClick={() => onOpenAthlete(a)} style={{ cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = G.surfaceRaised}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ ...td, color: G.text, fontWeight: 600, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={a.name} photoUrl={a.photoUrl} size={28} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                        </div>
                      </td>
                      {COLS.slice(1, 8).map(([key, , fn]) => <td key={key} style={td}>{String(fn(a) || '').trim() || '—'}</td>)}
                      <td style={{ ...td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }} title={a.address || ''}>{String(a.address || '').trim() || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// NFL Team Info is block-shaped in the sheet: a team-name row, a Training
// Facility row (address in col B), a Name/Title/Email header, then contacts.
function parseNflTeams(data) {
  if (!data) return [];
  const seq = [data.headers, ...data.rows.map(r => r.cells)];
  const teams = [];
  let cur = null;
  for (const c of seq) {
    const a = (c[0] || '').trim(), b = (c[1] || '').trim(), e = (c[2] || '').trim();
    if (!a) continue;
    if (/^training facility$/i.test(a)) { if (cur) cur.address = b; continue; }
    if (/^name$/i.test(a) && /^title$/i.test(b)) continue;
    if (!b && !e) { cur = { team: a, address: '', contacts: [] }; teams.push(cur); continue; }
    if (cur) cur.contacts.push({ name: a, title: b, email: e });
  }
  return teams;
}

function ResourcesPage({ isMobile, decks }) {
  const nfl = useAdminTab('nflteams');
  const regs = useAdminTab('stateregs');
  const [q, setQ] = useState('');
  const [openTeam, setOpenTeam] = useState(null);
  const teams = useMemo(() => parseNflTeams(nfl.data), [nfl.data]);
  const qq = q.toLowerCase();
  const matches = teams.filter(t => !qq || t.team.toLowerCase().includes(qq) || t.contacts.some(c => c.name.toLowerCase().includes(qq)));
  const shell = (node) => <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, overflow: "hidden" }}>{node}</div>;
  const stateOf = (t) => t.loading ? <div style={{ padding: 32, textAlign: "center", color: G.textTertiary, fontSize: 13 }}>Loading…</div>
    : t.err ? <div style={{ padding: 32, textAlign: "center", color: G.red, fontSize: 13 }}>{t.err}</div> : null;
  const heading = (txt) => <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary }}>{txt}</div>;
  // State-registration cells: live links + colored statuses.
  const regCell = (c) => {
    if (/^https?:\/\//i.test(c)) return <a href={c} target="_blank" rel="noreferrer" style={{ color: G.green, fontWeight: 600, textDecoration: "none" }}>Open ↗</a>;
    if (/^active$/i.test(c)) return <span style={{ color: G.green, fontWeight: 600 }}>{c}</span>;
    if (/^(pending|in process)$/i.test(c)) return <span style={{ color: G.textSecondary, fontWeight: 600 }}>{c}</span>;
    return c;
  };
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "18px 16px 80px" : "28px 24px 60px" }}>
      <div style={{ fontSize: isMobile ? 20 : 23, fontWeight: 800, letterSpacing: "-0.03em", color: G.text, marginBottom: 18 }}>Resources</div>
      <div style={{ marginBottom: 10 }}>{heading('Decks')}</div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 24 }}>
        {(decks || DECKS).map(d => <DeckCard key={d.title} deck={d} />)}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        {heading('NFL team directory')}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search teams or contacts..." style={{ ...inputBase, width: isMobile ? 170 : 220 }} />
      </div>
      {shell(stateOf(nfl) || (matches.length === 0
        ? <div style={{ padding: "28px 16px", color: G.textTertiary, fontSize: 13, textAlign: "center" }}>No teams match.</div>
        : matches.map((t, ti) => {
          const open = qq ? true : openTeam === t.team;
          return (
            <div key={t.team} style={{ borderBottom: ti < matches.length - 1 ? `1px solid ${G.surfaceBorder}` : "none" }}>
              <button onClick={() => setOpenTeam(open ? null : t.team)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: ff, textAlign: "left" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: G.text, flex: 1 }}>{t.team}</span>
                <span style={{ fontSize: 11, color: G.textTertiary }}>{t.contacts.length} contact{t.contacts.length === 1 ? '' : 's'}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", color: G.textTertiary }}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {open && (
                <div style={{ padding: "0 16px 14px" }}>
                  {t.address && <div style={{ fontSize: 12, color: G.textSecondary, marginBottom: 10 }}><span style={{ color: G.textTertiary }}>Training facility · </span>{t.address}</div>}
                  <div className="mh-hscroll" style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <tbody>
                        {t.contacts.map((c, i) => (
                          <tr key={i}>
                            <td style={{ padding: "6px 14px 6px 0", fontSize: 13, color: G.text, fontWeight: 600, whiteSpace: "nowrap" }}>{c.name}</td>
                            <td style={{ padding: "6px 14px 6px 0", fontSize: 12, color: G.textSecondary, whiteSpace: "nowrap" }}>{c.title}</td>
                            <td style={{ padding: "6px 0", fontSize: 12, whiteSpace: "nowrap" }}>{c.email ? <a href={`mailto:${c.email}`} style={{ color: G.green, textDecoration: "none" }}>{c.email}</a> : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })))}
      <div style={{ margin: "24px 0 10px" }}>{heading('State registrations')}</div>
      {shell(stateOf(regs) || <SheetTable headers={regs.data?.headers || []} rows={regs.data?.rows || []} emptyMsg="Nothing here yet." renderCell={regCell} />)}
    </div>
  );
}

// Live Box links — the PDFs behind them get updated, the links stay the same.
// The API adds a live cover `thumb` for each; this is the thumbnail-less fallback.
const DECKS = [
  { title: 'Sports deck', desc: 'Company overview — always the latest version.', url: 'https://milkhoneyla.box.com/s/mbtbvud2p7rgjloiq49tygxn4az1zkie' },
  { title: 'NIL deck', desc: 'NIL-specific pitch — always the latest version.', url: 'https://milkhoneyla.box.com/s/415ekwg8iukftyr28bp924zfm5wp3rox' },
];

function DeckCard({ deck: d }) {
  return (
    <a href={d.url} target="_blank" rel="noopener noreferrer"
      style={{ display: "block", background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, overflow: "hidden", textDecoration: "none" }}>
      {d.thumb && (
        <div style={{ height: 150, background: "#0a0a0a", overflow: "hidden" }}>
          <img src={d.thumb} alt={`${d.title} cover`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
        </div>
      )}
      <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>{d.title}</div>
          <div style={{ fontSize: 12, color: G.textSecondary, marginTop: 2 }}>{d.desc}</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: G.green, flexShrink: 0 }}>Open ↗</div>
      </div>
    </a>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [clients, setClients] = useState([]);
  const [logos, setLogos] = useState({});
  const [staff, setStaff] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  // Individual identity for per-person logins ({ name, agentKey, userRole })
  // — null for the house admin password and for public sessions.
  const [currentUser, setCurrentUser] = useState(null);
  // True once /api/sheets has answered who this session is. Sports rendering
  // waits on it so employees never see a roster flash before the dashboard.
  const [authKnown, setAuthKnown] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  // Front-door gate (shared site password). No URL bypasses it — typing
  // /{anything} lands on the gate like everywhere else. External sharing goes
  // through unique hosted links (/roster/{id} · /share/{id}), which are static
  // pages outside this app and therefore not gated.
  const [gateUnlocked, setGateUnlocked] = useState(() => {
    try {
      if (localStorage.getItem('mh_gate') === '1') return true;
    } catch { /* ignore */ }
    return false;
  });
  // Sports domain: music lives at "/" + "/{slug}", sports at "/sports" + "/sports/{slug}".
  const [athletes, setAthletes] = useState([]);
  const [athletesLoaded, setAthletesLoaded] = useState(false);
  // Staff directory (names only) from /api/athletes — feeds the Lead Agent dropdown.
  const [sportsStaff, setSportsStaff] = useState([]);
  // Decks with live Box cover thumbnails (API-resolved); DECKS is the fallback.
  const [sportsDecks, setSportsDecks] = useState(null);
  const [sportsLevels, setSportsLevels] = useState([...ALL_LEVELS]);
  const toggleSportsLevel = (l) => setSportsLevels(prev => {
    const next = prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l];
    return next.length ? next : [...ALL_LEVELS]; // never let the roster go empty
  });
  // Depth chart filter (employee-only control): All / Starters / Backups / Not on chart.
  const [depthFilter, setDepthFilter] = useState('All');
  const [agentFilter, setAgentFilter] = useState('All');
  const [posSide, setPosSide] = useState('All');
  const [posGroup, setPosGroup] = useState('All');
  // "My clients" filter for individual logins (matched on Lead Agent).
  const parseUrl = () => {
    const parts = decodeURIComponent(window.location.pathname).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    if (parts[0] === 'sports') return { domain: 'sports', slug: parts[1] || '' };
    return { domain: 'music', slug: parts[0] || '' };
  };
  const [domain, setDomainState] = useState(() => parseUrl().domain);
  const pathFor = (d, slug) => d === 'sports' ? (slug ? `/sports/${slug}` : '/sports') : (slug ? `/${slug}` : '/');
  const resolveItem = (list, dslug) => {
    const s = slugOf(dslug != null ? dslug : parseUrl().slug);
    if (s) { const hit = list.find(c => slugOf(c.name) === s); if (hit) return hit; }
    const id = new URLSearchParams(window.location.search).get('client');
    return id ? list.find(c => c.id === id) || null : null;
  };
  const [view, setViewState] = useState(() => (parseUrl().slug || window.location.search.includes('client=')) ? 'detail' : 'roster');
  const [selected, setSelected] = useState(null);
  // Sports employee section: 'home' (default) / 'roster' / 'recruiting' /
  // 'marketing' / 'resources'. Rendering gates on isAdmin, so public/b2b
  // sessions always get the roster regardless.
  const [sportsPage, setSportsPage] = useState(() => new URLSearchParams(window.location.search).get('page') || 'home');
  // History-aware page switch so the browser back/forward buttons walk the
  // sidebar sections instead of leaving the site. URL carries ?page= so a
  // refresh lands back on the same section.
  const goSportsPage = (key) => {
    if (key === sportsPage) return;
    window.history.pushState({ view: 'roster', domain: 'sports', sportsPage: key }, '', key === 'home' ? '/sports' : `/sports?page=${key}`);
    setSportsPage(key);
  };
  // Music employee section (Tyler-only while it's broken in): 'home' / 'roster'.
  const [musicPage, setMusicPage] = useState(() => new URLSearchParams(window.location.search).get('page') || 'home');
  const goMusicPage = (key) => {
    if (key === musicPage) return;
    window.history.pushState({ view: 'roster', domain: 'music', musicPage: key }, '', key === 'home' ? '/' : `/?page=${key}`);
    setMusicPage(key);
  };

  const setView = (v, item) => {
    if (v === 'detail' && item) {
      window.history.pushState({ view: 'detail', slug: slugOf(item.name), domain }, '', pathFor(domain, slugOf(item.name)));
      setSelected(item);
      setViewState('detail');
    } else {
      if (window.history.state?.view === 'detail') {
        window.history.back();
      } else {
        window.history.replaceState({ view: 'roster', domain }, '', pathFor(domain));
        setSelected(null);
        setViewState('roster');
      }
    }
  };
  const setDomain = (d) => {
    if (d === domain) return;
    setDomainState(d);
    setSelected(null);
    setViewState('roster');
    setSearch('');
    window.history.pushState({ view: 'roster', domain: d }, '', pathFor(d));
  };
  // Called by the landing gate once the site password is accepted.
  const enterSite = (d) => {
    try { localStorage.setItem('mh_gate', '1'); } catch { /* ignore */ }
    setGateUnlocked(true);
    setDomain(d);
  };
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  // Roster display: 'list' (compact cards / 3x5 PDF) or 'detailed' (rich cards / 1x4 PDF).
  const [rosterView, setRosterView] = useState('list');
  // Custom group: a hand-picked set of names. When non-empty it becomes the roster,
  // overriding the type/other filters (search still narrows within it). Works for both domains.
  const [customGroup, setCustomGroup] = useState([]);
  const [customGroupOpen, setCustomGroupOpen] = useState(false);
  const [customGroupTitle, setCustomGroupTitle] = useState(''); // AI-generated title, when a smart group is active
  const inCustomGroup = (name) => customGroup.includes(name);
  // Manual edits invalidate the AI title so the export label never mislabels the set.
  const toggleCustomMember = (name) => { setCustomGroupTitle(''); setCustomGroup(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]); };
  const clearCustomGroup = () => { setCustomGroup([]); setCustomGroupTitle(''); };
  // Multi-select type filter. Empty array = show all; otherwise a client matches
  // if it has ANY selected type (so "Producer" + "Songwriter" shows both).
  const [filterTypes, setFilterTypes] = useState([]);
  const toggleFilterType = (t) => {
    if (t === 'All') { setFilterTypes([]); return; }
    setFilterTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };
  const typeActive = (t) => t === 'All' ? filterTypes.length === 0 : filterTypes.includes(t);
  const [filterContact, setFilterContact] = useState('All');
  const [filterLabel, setFilterLabel] = useState('All');
  const [filterCountry, setFilterCountry] = useState('All');
  const [clientSort, setClientSort] = useState('default');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Handle browser back/forward (domain-aware)
  useEffect(() => {
    const onPop = (e) => {
      const { domain: d, slug } = parseUrl();
      setDomainState(d);
      setSportsPage(e.state?.sportsPage || new URLSearchParams(window.location.search).get('page') || 'home');
      setMusicPage(e.state?.musicPage || new URLSearchParams(window.location.search).get('page') || 'home');
      const list = d === 'sports' ? athletes : clients;
      if (list.length && slug) {
        const it = resolveItem(list, slug);
        if (it) { setSelected(it); setViewState('detail'); return; }
      }
      setSelected(null);
      setViewState('roster');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [clients, athletes]);

  // Lazily load the Sports roster the first time the Sports domain is shown.
  useEffect(() => {
    if (!gateUnlocked || domain !== 'sports' || athletesLoaded) return;
    fetch('/api/athletes')
      .then(r => r.json())
      .then(d => { setAthletes(d.athletes || []); setSportsStaff(d.staff || []); if (d.decks) setSportsDecks(d.decks); setAthletesLoaded(true); })
      .catch(() => setAthletesLoaded(true));
  }, [gateUnlocked, domain, athletesLoaded]);

  // Cmd/Ctrl+F focuses the roster search instead of the browser's native find.
  const searchRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        // Search lives on the roster, so return there first if we're on a detail.
        if (window.history.state?.view === 'detail') window.history.back();
        setSelected(null);
        setViewState('roster');
        if (isMobile) setMobileSearchOpen(true);
        setTimeout(() => { searchRef.current?.focus(); searchRef.current?.select?.(); }, 90);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile]);

  // On load, resolve a deep-linked /{slug} or /sports/{slug} once data loads.
  useEffect(() => {
    const { domain: d, slug } = parseUrl();
    const list = d === 'sports' ? athletes : clients;
    if (!slug || !list.length) return;
    const it = resolveItem(list, slug);
    if (it) { setSelected(it); setViewState('detail'); }
    else { window.history.replaceState({ view: 'roster', domain: d }, '', pathFor(d)); setViewState('roster'); }
  }, [clients, athletes]);

  // Reflect the current view in the browser tab title.
  useEffect(() => {
    const brand = `Milk & Honey ${domain === 'sports' ? 'Sports' : 'Music'}`;
    document.title = (view === 'detail' && selected) ? `${selected.name} — ${brand}` : brand;
  }, [view, selected, domain]);
  // Hosted share-link state (generated from the current filtered roster via the Export menu).
  const [shareRosterUrl, setShareRosterUrl] = useState(null);
  const [shareRosterLoading, setShareRosterLoading] = useState(false);

  useEffect(() => {
    // Don't fetch/parse the (large) roster JSON until the visitor is past the
    // landing gate — otherwise that main-thread work makes the gate feel laggy.
    if (!gateUnlocked) return;
    fetch('/api/sheets')
      .then(r => r.json())
      .then(d => { setClients(d.clients || []); setLogos(d.logos || {}); setStaff(d.staff || {}); setIsAdmin(!!d.isAdmin); setCurrentUser(d.user || null); setAuthConfigured(!!d.authConfigured); setLoading(false); setAuthKnown(true); })
      .catch(e => { setError(e.message); setLoading(false); setAuthKnown(true); });
  }, [gateUnlocked]);

  // Log out / exit → back to the landing gate. Ends the admin session when
  // signed in, and always clears the front-door gate so both viewers (public)
  // and employees (admin) land back on the gate.
  const doLogout = async () => {
    if (isAdmin && authConfigured) {
      try { await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); } catch {}
    }
    try { localStorage.removeItem('mh_gate'); } catch {}
    window.location.href = '/';
  };

  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPdf = async (payload, filename) => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const r = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('PDF failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) { alert('Could not generate the PDF. Please try again.'); }
    setPdfBusy(false);
  };
  const rosterTitle = () => customGroup.length ? (customGroupTitle || 'Milk & Honey — Custom Group') : (domain === 'sports' ? 'Milk & Honey Sports' : 'Milk & Honey Music');
  // AI-powered custom group: send a compact roster + a plain-English query,
  // get back the matching names and a descriptive title.
  const smartGroup = async (query) => {
    // Send EVERY field the sheet has (admins only), minus heavy media blobs that
    // don't help filtering but bloat tokens. This gives the AI full context —
    // addresses, reps, NIL, brand targets, sizes, notes, followers, everything.
    const HEAVY = new Set(['id', 'photoUrl', 'headerUrl', 'teamLogo', 'heroImageUrl', 'logoUrl',
      'spotifyTopTracks', 'spotifyRecentReleases', 'spotifySongCredits']);
    const strip = (o, extra) => {
      const out = {};
      for (const k in o) if (!HEAVY.has(k) && o[k] != null && o[k] !== '') out[k] = o[k];
      return { ...out, ...extra };
    };
    const roster = (domain === 'sports' ? athletes : clients).map(x =>
      domain === 'sports' ? strip(x, { socialReach: athleteReach(x) }) : strip(x));
    const r = await fetch('/api/smart-group', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, query, roster }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'AI search failed');
    setCustomGroup(d.names || []);
    setCustomGroupTitle(d.title || '');
    return { count: (d.names || []).length, title: d.title };
  };
  // Export the current filtered roster. Detailed = rich 1×4 (mirrors the detailed cards);
  // Simple = compact 3×5. Defaults to the on-screen view mode.
  const downloadRosterPdf = (layout) => {
    const detailed = layout ? layout === 'detailed' : rosterView === 'detailed';
    const base = slugOf(rosterTitle()) || 'roster';
    if (domain === 'sports') {
      if (detailed) {
        return downloadPdf({
          action: 'roster-pdf', layout: 'detailed', title: rosterTitle(), pathPrefix: 'sports/',
          clients: filteredAthletes.map(a => {
            const team = a.nflTeam || a.college || '';
            return {
              name: a.name, photoUrl: a.photoUrl, headerUrl: a.heroImageUrl,
              types: [a.position, team].filter(Boolean),
              instagram: a.instagram, twitter: a.twitter, tiktok: a.tiktok,
              bio: a.bio, logoUrls: [a.teamLogo].filter(Boolean),
              sections: [['Brands', a.brands], ['Interests', a.interests]],
            };
          }),
        }, `${base}-detailed.pdf`);
      }
      return downloadPdf({
        action: 'roster-pdf', title: rosterTitle(), pathPrefix: 'sports/',
        clients: filteredAthletes.map(a => ({ name: a.name, types: [a.position].filter(Boolean), photoUrl: a.photoUrl, label: (a.nflTeam || a.college || ''), logoUrls: [a.teamLogo].filter(Boolean) })),
      }, `${base}.pdf`);
    }
    if (detailed) {
      return downloadPdf({
        action: 'roster-pdf', layout: 'detailed', title: rosterTitle(), logos,
        clients: filtered.map(c => ({
          name: c.name, types: c.types, photoUrl: c.photoUrl, headerUrl: c.headerUrl,
          country: c.country, city: c.city, state: c.state,
          instagram: c.instagram, twitter: c.twitter, tiktok: c.tiktok,
          spotifyUrl: c.spotifyUrl, appleMusicUrl: c.appleMusicUrl, soundcloudUrl: c.soundcloudUrl,
          youtube: c.youtube, beatport: c.beatport,
          bio: c.bio, credits: c.credits, supporters: c.supporters, keyShows: c.keyShows,
          pro: c.pro, publisher: c.publisher, label: c.label, contact: c.contact,
          contactEmail: (c.contact || '').split(',').map(n => staff[n.trim().toLowerCase()]?.email).filter(Boolean).join(','),
        })),
      }, `${base}-detailed.pdf`);
    }
    return downloadPdf({
      action: 'roster-pdf', title: rosterTitle(),
      clients: filtered.map(c => ({
        name: c.name, types: c.types, photoUrl: c.photoUrl, label: c.label, pro: c.pro, country: c.country,
        logoUrls: [c.pro, c.publisher, c.label].filter(Boolean)
          .flatMap(v => String(v).split(',').map(s => s.trim())).filter(Boolean)
          .map(n => lookupLogo(logos, n)).filter(Boolean),
      })),
    }, `${base}.pdf`);
  };
  const downloadClientPdf = (c) => {
    const contactEmail = (c.contact || '').split(',').map(n => staff[n.trim().toLowerCase()]?.email).filter(Boolean).join(',');
    return downloadPdf({ action: 'client-pdf', client: { ...c, contactEmail }, logos }, `${slugOf(c.name)}.pdf`);
  };
  const downloadAthletePdf = (a) => downloadPdf({ action: 'athlete-pdf', athlete: a }, `${slugOf(a.name)}.pdf`);

  // Map one athlete / client into the hosted share-page shape.
  const mapAthleteForShare = (a) => {
    const team = a.nflTeam || a.college || '';
    return {
      name: a.name, level: a.level || 'Athlete', photoUrl: a.photoUrl, headerUrl: a.heroImageUrl,
      logoUrl: a.teamLogo, types: [a.position, team].filter(Boolean),
      position: a.position, team, bio: a.bio,
      instagram: a.instagram, twitter: a.twitter, tiktok: a.tiktok,
      igFollowers: a.igFollowers, twitterFollowers: a.twitterFollowers, tiktokFollowers: a.tiktokFollowers,
      brands: a.brands, interests: a.interests,
      height: a.height, weight: a.weight, jerseyNumber: a.jerseyNumber, hometown: a.hometown,
    };
  };
  const mapClientForShare = (c) => ({
    name: c.name, types: c.types, level: (c.types || [])[0] || 'Client',
    photoUrl: c.photoUrl, headerUrl: c.headerUrl,
    supporters: c.supporters, keyShows: c.keyShows,
    logoUrl: lookupLogo(logos, c.pro) || lookupLogo(logos, c.publisher) || lookupLogo(logos, c.label),
    proLogos: (c.pro || '').split(',').map(v => v.trim()).filter(Boolean).map(v => ({ name: v, url: lookupLogo(logos, v) })),
    pubLogos: (c.publisher || '').split(',').map(v => v.trim()).filter(Boolean).map(v => ({ name: v, url: lookupLogo(logos, v) })),
    labelLogos: (c.label || '').split(',').map(v => v.trim()).filter(Boolean).map(v => ({ name: v, url: lookupLogo(logos, v) })),
    pro: c.pro, publisher: c.publisher, label: c.label,
    city: c.city, state: c.state, country: c.country,
    city2: c.city2, state2: c.state2, country2: c.country2,
    city3: c.city3, state3: c.state3, country3: c.country3,
    credits: c.credits, bio: c.bio, contact: c.contact,
    contactEmail: (c.contact || '').split(',').map(n => staff[n.trim().toLowerCase()]?.email).filter(Boolean).join(','),
    instagram: c.instagram, twitter: c.twitter, tiktok: c.tiktok,
    appleMusicUrl: c.appleMusicUrl, soundcloudUrl: c.soundcloudUrl,
    spotifyUrl: c.spotifyUrl, spotifyMonthly: c.spotifyMonthly,
    spotifyRecentReleases: c.spotifyRecentReleases || null,
    spotifySongCredits: c.spotifySongCredits || null,
    spotifyTopTracks: c.spotifyTopTracks || null,
  });

  // POST a set of mapped people to /api/share and return the unique hosted URL.
  const createShareLink = async (mapped, title, expiry) => {
    const expiresAt = expiry !== 'never' ? new Date(Date.now() + parseInt(expiry) * 864e5).toISOString() : null;
    const resp = await fetch('/api/share', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'roster-share', title, athletes: mapped, expiresAt }),
    });
    const data = await resp.json();
    if (!data.url) throw new Error(data.error || 'Failed');
    return data.url;
  };

  // Generate a hosted interactive share link from the current filtered roster.
  const generateShareLink = async (expiry) => {
    setShareRosterLoading(true); setShareRosterUrl(null);
    try {
      const mapped = domain === 'sports' ? filteredAthletes.map(mapAthleteForShare) : filtered.map(mapClientForShare);
      setShareRosterUrl(await createShareLink(mapped, rosterTitle(), expiry));
    } catch (e) { alert('Share failed: ' + e.message); }
    setShareRosterLoading(false);
  };

  // Generate a unique hosted share link for ONE person (the open detail page) —
  // same token flow as the roster link, so it never exposes the gated app.
  const [shareDetailUrl, setShareDetailUrl] = useState(null);
  const [shareDetailLoading, setShareDetailLoading] = useState(false);
  useEffect(() => { setShareDetailUrl(null); }, [selected]);
  const generateDetailShareLink = async (expiry) => {
    if (!selected) return;
    setShareDetailLoading(true); setShareDetailUrl(null);
    try {
      const mapped = [domain === 'sports' ? mapAthleteForShare(selected) : mapClientForShare(selected)];
      const title = `${selected.name} — Milk & Honey ${domain === 'sports' ? 'Sports' : 'Music'}`;
      setShareDetailUrl(await createShareLink(mapped, title, expiry));
    } catch (e) { alert('Share failed: ' + e.message); }
    setShareDetailLoading(false);
  };

  // Fixed order per the team's preference; any type in the data that isn't
  // listed still shows (after the known ones), and "UK Client" is a
  // location-based pseudo-type.
  const types = useMemo(() => {
    const ORDER = ['Songwriter', 'Producer', 'Artist', 'Mixer', 'Composer', 'Remixer'];
    const all = new Set();
    clients.forEach(c => (c.types || []).forEach(t => all.add(t)));
    const extra = Array.from(all).filter(t => !ORDER.includes(t)).sort();
    return ['All', ...ORDER, ...extra, 'UK Client'];
  }, [clients]);
  const contacts = useMemo(() => ['All', ...Array.from(new Set(
    clients.flatMap(c => (c.contact || '').split(',').map(s => s.trim()).filter(Boolean))
  )).sort()], [clients]);

  const labels = useMemo(() => ['All', ...Array.from(new Set(
    clients.map(c => c.label).filter(Boolean)
  )).sort()], [clients]);

  const countries = useMemo(() => ['All', ...Array.from(new Set(
    clients.map(c => c.country).filter(Boolean)
  )).sort()], [clients]);

  const filtered = useMemo(() => {
    // A custom group overrides the type/contact/label/country filters (search still narrows).
    if (customGroup.length > 0) {
      const q = search.toLowerCase();
      return clients
        .filter(c => customGroup.includes(c.name))
        .filter(c => !search || c.name.toLowerCase().includes(q))
        .sort((a, b) => customGroup.indexOf(a.name) - customGroup.indexOf(b.name));
    }
    const list = clients.filter(c => {
      if (filterTypes.length > 0 && !filterTypes.some(t => t === 'UK Client' ? isUKClient(c) : (c.types || []).includes(t))) return false;
      if (filterContact !== 'All' && !(c.contact || '').split(',').map(s => s.trim()).includes(filterContact)) return false;
      if (filterLabel !== 'All' && c.label !== filterLabel) return false;
      if (filterCountry !== 'All' && c.country !== filterCountry) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) ||
          (c.credits || []).some(cr => cr.toLowerCase().includes(q)) ||
          (c.city || '').toLowerCase().includes(q) ||
          (c.country || '').toLowerCase().includes(q) ||
          (c.pro || '').toLowerCase().includes(q) ||
          (c.publisher || '').toLowerCase().includes(q);
      }
      return true;
    });
    if (clientSort === 'alpha') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (clientSort === 'label') return [...list].sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    if (clientSort === 'listeners') return [...list].sort((a, b) => parseListeners(b.spotifyMonthly) - parseListeners(a.spotifyMonthly));
    if (clientSort === 'type') return [...list].sort((a, b) => (a.types?.[0] || '').localeCompare(b.types?.[0] || ''));
    return list;
  }, [clients, filterTypes, filterContact, filterLabel, filterCountry, search, clientSort, customGroup]);

  const filteredAthletes = useMemo(() => {
    if (customGroup.length > 0) {
      const q = search.toLowerCase();
      return athletes
        .filter(a => customGroup.includes(a.name))
        .filter(a => !search || athleteSearchMatch(a, q))
        .sort((a, b) => customGroup.indexOf(a.name) - customGroup.indexOf(b.name));
    }
    const list = athletes.filter(a => {
      if (!sportsLevels.includes(a.level)) return false;
      if (depthFilter === 'Starters' && a.depthRank !== 1) return false;
      if (depthFilter === 'Backups' && !(a.depthRank >= 2)) return false;
      if (depthFilter === 'Not on chart' && (a.depthRank > 0 || a.level === 'High School')) return false;
      if (agentFilter !== 'All' && !String(a.agentAssigned || '').toLowerCase().includes(agentFilter.toLowerCase())) return false;
      if (posSide !== 'All') {
        const g = contractPosGroup(a.position);
        if (!POS_SIDES[posSide].includes(g)) return false;
        if (posGroup !== 'All' && g !== posGroup) return false;
      }
      if (search) return athleteSearchMatch(a, search.toLowerCase());
      return true;
    });
    if (clientSort === 'alpha') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    // Default (Roster Order): by league (NFL → College → HS); within a league,
    // free agents sink to the bottom, then rank by social reach.
    return [...list].sort((a, b) => {
      const lr = (LEAGUE_RANK[a.level] ?? 9) - (LEAGUE_RANK[b.level] ?? 9);
      if (lr !== 0) return lr;
      const fa = (a.status === 'Free Agent' ? 1 : 0) - (b.status === 'Free Agent' ? 1 : 0);
      if (fa !== 0) return fa;
      return athleteReach(b) - athleteReach(a);
    });
  }, [athletes, sportsLevels, depthFilter, agentFilter, posSide, posGroup, currentUser, search, customGroup, clientSort]);

  const saveClient = (updatedClient, opts) => {
    if (opts && (opts.deleted || opts.created)) {
      // Rows were added/removed in the sheet, so cached row indexes are
      // stale — close out and refetch the roster.
      setEditing(null);
      if (opts.deleted) { setClients(prev => prev.filter(c => c.name !== opts.name)); if (view === 'detail') setView('roster'); }
      // A brand-new client gets an immediate follower pull for the handles
      // they came in with, instead of waiting for tonight's cron.
      if (opts.created && updatedClient?.name) {
        fetch(`/api/refresh-music-socials?name=${encodeURIComponent(updatedClient.name.trim())}&platforms=ig,x,tiktok`).catch(() => {});
      }
      fetch('/api/sheets')
        .then(r => r.json())
        .then(d => { setClients(d.clients || []); setLogos(d.logos || {}); })
        .catch(() => { /* next full load will catch up */ });
      return;
    }
    setClients(prev => {
      const idx = prev.findIndex(c => c.name === updatedClient.name);
      if (idx >= 0) { const next = [...prev]; next[idx] = updatedClient; return next; }
      return [...prev, updatedClient];
    });
    setEditing(null);
    if (view === 'detail') setSelected(updatedClient);
  };

  const [editingAthlete, setEditingAthlete] = useState(null);
  const saveAthlete = (updated, opts) => {
    if (opts && (opts.levelChanged || opts.created || opts.deleted)) {
      // Rows were added/removed/moved in the sheet, so cached row indexes are
      // stale — close out and refetch the roster.
      setEditingAthlete(null);
      if (view === 'detail') setView('roster');
      setAthletesLoaded(false);
      // A brand-new athlete gets the same one-player enrichment pass the
      // onboarding flow runs (ESPN id, 247 link, contracts, follower counts)
      // instead of waiting for tonight's crons; refetch again when it lands.
      if (opts.created && updated?.name) {
        const nm = encodeURIComponent(updated.name.trim());
        Promise.allSettled([
          fetch(`/api/refresh-depth?task=all&name=${nm}`),
          fetch(`/api/refresh-socials?name=${nm}&platforms=ig,x,tiktok`),
        ]).then(() => setAthletesLoaded(false));
      }
      return;
    }
    setAthletes(prev => prev.map(a => (a.level === updated.level && a._rowIndex === updated._rowIndex) ? updated : a));
    setEditingAthlete(null);
    if (view === 'detail') setSelected(updated);
  };

  // Log out / exit control. Login happens on the landing page now, so there is
  // no "Log in" button — this always reads "Log out" and returns to the gate,
  // for both public viewers and signed-in employees.
  const authBtn = (
    <button onClick={doLogout} title="Log out"
      style={{ background: "transparent", border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff, color: G.textSecondary, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      Log out
    </button>
  );

  // Compact icon-only version for the mobile top row.
  const authBtnMobile = (
    <button onClick={doLogout} title="Log out"
      style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", color: G.textSecondary, display: "flex", alignItems: "center", flexShrink: 0 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  );

  // Download-PDF button (available to everyone, public + admin).
  const pdfBtn = (onClick, label) => (
    <button onClick={onClick} disabled={pdfBusy} title="Download PDF"
      style={{ background: "transparent", border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: label ? "8px 14px" : "8px 10px", fontWeight: 600, fontSize: 13, cursor: pdfBusy ? "wait" : "pointer", fontFamily: ff, color: G.textSecondary, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      {pdfBusy
        ? <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 13 }}>⟳</span>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {label && <span>{label}</span>}
    </button>
  );

  // Music / Sports domain toggle (header).
  const domainToggle = (
    <div style={{ display: "flex", background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
      {['music', 'sports'].map(d => (
        <button key={d} onClick={() => setDomain(d)}
          style={{ padding: "8px 10px", border: "none", background: domain === d ? G.greenSubtle : "transparent", color: domain === d ? G.green : G.textSecondary, fontWeight: domain === d ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: ff, textTransform: "capitalize", whiteSpace: "nowrap" }}>
          {d}
        </button>
      ))}
    </div>
  );
  // Employee nav (sports side): left sidebar on desktop, pill strip on mobile.
  // Per-division config so Music can get its own menu later.
  const NAV_SPORTS = [
    { key: 'home', label: 'Home', icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10' },
    { key: 'roster', label: 'Roster', icon: 'M4 6h16M4 12h16M4 18h16' },
    { key: 'contracts', label: 'Contracts', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
    { key: 'recruiting', label: 'Recruiting', icon: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6' },
    {
      key: 'marketing-group', label: 'Marketing', icon: 'M3 11l18-8-8 18-2-8-8-2z',
      children: [
        { key: 'branddeals', label: 'Brand Deals', icon: 'M4 7h16v13H4zM8 7V5a2 2 0 012-2h4a2 2 0 012 2v2' },
        { key: 'marketing', label: 'Social', icon: 'M3 11l18-8-8 18-2-8-8-2z' },
        { key: 'gifting', label: 'Gifting', icon: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z' },
      ],
    },
    { key: 'resources', label: 'Resources', icon: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z' },
    { key: 'onboardlink', label: 'Onboard', icon: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71', modal: true },
  ];
  const NAV_MUSIC = [
    { key: 'home', label: 'Home', icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10' },
    { key: 'roster', label: 'Roster', icon: 'M4 6h16M4 12h16M4 18h16' },
    { key: 'marketing', label: 'Marketing', icon: 'M3 11l18-8-8 18-2-8-8-2z' },
  ];
  const [onboardLinksOpen, setOnboardLinksOpen] = useState(false);
  // Expand/collapse state for sidebar groups; a group with the active page
  // inside starts open.
  const [openNavGroups, setOpenNavGroups] = useState({});
  const navClick = (it) => {
    if (it.modal) { setOnboardLinksOpen(true); return; }
    if (domain === 'music') { goMusicPage(it.key); return; }
    // Clicking Roster in the nav always shows the full roster — the "my
    // clients" scope only applies via the dashboard link.
    if (it.key === 'roster') setAgentFilter('All');
    goSportsPage(it.key);
  };
  const navActive = domain === 'sports' && isAdmin && view !== 'detail';
  // The music home is Tyler-only while it's broken in — everyone else lands on
  // the roster exactly as before.
  const isTyler = /^tyler\b/i.test(currentUser?.name || '');
  const musicNavActive = domain === 'music' && isAdmin && isTyler && view !== 'detail';
  const navItems = domain === 'sports' ? NAV_SPORTS : NAV_MUSIC;
  const navPage = domain === 'sports' ? sportsPage : musicPage;
  // Roster search/filter/export controls only make sense on the roster itself
  // (and always for public sessions). Both domains wait for the auth answer so
  // employees land straight on the dashboard with no roster flash.
  const rosterControlsOn = authKnown && (!navActive || sportsPage === 'roster') && (!musicNavActive || musicPage === 'roster');
  const sidebar = ((navActive || musicNavActive) && !isMobile) ? (
    <div style={{ width: 176, flexShrink: 0, borderRight: `1px solid ${G.surfaceBorder}`, padding: "18px 10px", position: "sticky", top: 62, alignSelf: "flex-start", maxHeight: "calc(100vh - 62px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
      {navItems.map(it => {
        if (it.children) {
          const childActive = it.children.some(c => navPage === c.key);
          const open = openNavGroups[it.key] !== undefined ? openNavGroups[it.key] : childActive;
          return (
            <div key={it.key}>
              <button onClick={() => setOpenNavGroups(o => ({ ...o, [it.key]: !open }))}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", background: "transparent", border: "none", borderRadius: 9, color: childActive ? G.green : G.textSecondary, fontWeight: childActive ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: ff, textAlign: "left", width: "100%" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d={it.icon} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ flex: 1 }}>{it.label}</span>
                <span style={{ fontSize: 9, color: G.textTertiary, transform: open ? 'rotate(180deg)' : 'none', transition: `transform 0.15s ${G.ease}` }}>▼</span>
              </button>
              {open && it.children.map(c => {
                const on = navPage === c.key;
                return (
                  <button key={c.key} onClick={() => navClick(c)}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 11px 8px 27px", background: on ? G.greenSubtle : "transparent", border: "none", borderRadius: 9, color: on ? G.green : G.textSecondary, fontWeight: on ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: ff, textAlign: "left", width: "100%" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d={c.icon} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span style={{ flex: 1 }}>{c.label}</span>
                  </button>
                );
              })}
            </div>
          );
        }
        const on = navPage === it.key;
        return (
          <button key={it.key} onClick={() => navClick(it)}
            style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", background: on ? G.greenSubtle : "transparent", border: "none", borderRadius: 9, color: on ? G.green : G.textSecondary, fontWeight: on ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: ff, textAlign: "left", width: "100%" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d={it.icon} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.soon && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: G.textTertiary, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 6, padding: "2px 5px" }}>Soon</span>}
          </button>
        );
      })}
    </div>
  ) : null;
  const mobileNavStrip = (
    <div className="mh-hscroll" style={{ display: "flex", gap: 4, alignItems: "center", overflowX: "auto" }}>
      {domainToggle}
      <div style={{ display: "flex", background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
        {navItems.flatMap(it => it.children || [it]).map((it, i) => (
          <button key={it.key} onClick={() => navClick(it)}
            style={{ padding: "8px 10px", border: "none", borderLeft: i > 0 ? `1px solid ${G.surfaceBorder}` : "none", background: navPage === it.key ? G.greenSubtle : "transparent", color: navPage === it.key ? G.green : G.textSecondary, fontWeight: navPage === it.key ? 700 : 500, fontSize: 12, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap" }}>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
  // Level chips — always visible above the roster grid, multi-select.
  const sportsLevelBar = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: isMobile ? "12px 16px 14px" : "0 0 14px" }}>
      {ALL_LEVELS.map(l => levelChipBtn(sportsLevels.includes(l), l, () => toggleSportsLevel(l)))}
    </div>
  );

  // List / Detailed view toggle (both domains).
  const viewToggle = (
    <div style={{ display: "flex", background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
      {[['list', 'M4 6h16M4 12h16M4 18h16'], ['detailed', 'M4 5h16v6H4zM4 15h16v4H4z']].map(([v, d], i) => (
        <button key={v} onClick={() => setRosterView(v)} title={v === 'list' ? 'List view' : 'Detailed view'}
          style={{ padding: "8px 8px", border: "none", borderLeft: i > 0 ? `1px solid ${G.surfaceBorder}` : "none", cursor: "pointer", background: rosterView === v ? G.greenSubtle : "transparent", color: rosterView === v ? G.green : G.textSecondary, display: "flex", alignItems: "center" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      ))}
    </div>
  );
  // Consolidated View dropdown: multi-select types (music) or single-select level
  // (sports), plus a Custom Group entry — same component for both domains.
  const posValue = posSide === 'All' ? 'All' : (posGroup !== 'All' ? posGroup : posSide);
  const rosterSections = domain !== 'sports' ? [] : [
    (isAdmin && sportsStaff.length > 0) && {
      id: 'agent', title: 'Agent', value: agentFilter,
      rows: [
        { on: agentFilter === 'All', label: 'All agents', onClick: () => { clearCustomGroup(); setAgentFilter('All'); } },
        ...sportsStaff.map(n => ({ on: agentFilter === n, label: n, onClick: () => { clearCustomGroup(); setAgentFilter(agentFilter === n ? 'All' : n); } })),
      ],
    },
    {
      id: 'position', title: 'Position', value: posValue,
      rows: [
        { on: posSide === 'All', label: 'All positions', onClick: () => { clearCustomGroup(); setPosSide('All'); setPosGroup('All'); } },
        ...Object.keys(POS_SIDES).flatMap(s => [
          { on: posSide === s && posGroup === 'All', label: s, onClick: () => { clearCustomGroup(); setPosSide(posSide === s ? 'All' : s); setPosGroup('All'); } },
          ...(posSide === s && POS_SIDES[s].length > 1 ? POS_SIDES[s].map(g => ({ on: posGroup === g, label: `· ${g}`, onClick: () => { clearCustomGroup(); setPosGroup(posGroup === g ? 'All' : g); } })) : []),
        ]),
      ],
    },
    isAdmin && {
      id: 'depth', title: 'Depth chart', value: depthFilter,
      rows: ['Starters', 'Backups', 'Not on chart'].map(o => ({ on: depthFilter === o, label: o, onClick: () => { clearCustomGroup(); setDepthFilter(depthFilter === o ? 'All' : o); } })),
    },
  ].filter(Boolean);
  const rosterFilterActive = customGroup.length > 0 || agentFilter !== 'All' || posSide !== 'All' || depthFilter !== 'All';
  const rosterFilterLabel = customGroup.length > 0 ? `Custom · ${customGroup.length}`
    : ([agentFilter !== 'All' ? agentFilter : null, posValue !== 'All' ? posValue : null, depthFilter !== 'All' ? depthFilter : null].filter(Boolean).join(', ') || 'All');
  const viewFilter = domain === 'sports' ? (
    <FilterMenu compact={isMobile} sections={rosterSections} active={rosterFilterActive} label={rosterFilterLabel}
      onAll={() => { clearCustomGroup(); setSportsLevels([...ALL_LEVELS]); setDepthFilter('All'); setAgentFilter('All'); setPosSide('All'); setPosGroup('All'); }}
      customCount={customGroup.length} onOpenCustom={() => setCustomGroupOpen(true)} />
  ) : (
    <ViewFilterDropdown compact={isMobile} types={types} filterTypes={filterTypes}
      onToggleType={(t) => { clearCustomGroup(); toggleFilterType(t); }}
      onAll={() => { clearCustomGroup(); setFilterTypes([]); }}
      customCount={customGroup.length} onOpenCustom={() => setCustomGroupOpen(true)} />
  );
  const exportControl = (iconOnly = false) => (
    <ExportMenu iconOnly={iconOnly} view={rosterView} count={domain === 'sports' ? filteredAthletes.length : filtered.length} isAdmin={isAdmin} pdfBusy={pdfBusy}
      onPdf={downloadRosterPdf} linkUrl={shareRosterUrl} linkLoading={shareRosterLoading}
      onLink={generateShareLink} onClearLink={() => setShareRosterUrl(null)} />
  );
  const customItems = (domain === 'sports' ? athletes : clients).map(x => ({
    name: x.name, photoUrl: x.photoUrl,
    subtitle: domain === 'sports' ? [x.position, x.nflTeam || x.college].filter(Boolean).join(' · ') : (x.types || []).join(' · '),
  }));

  if (!gateUnlocked) return <Landing onEnter={enterSite} />;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: G.bg, color: G.text, fontFamily: ff }}>
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      {onboardLinksOpen && <OnboardLinksModal onClose={() => setOnboardLinksOpen(false)} />}
      <style>{`
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes chatDot{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
        @keyframes modalIn{from{opacity:0;transform:translateY(10px) scale(0.98)}to{opacity:1;transform:none}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        *{-webkit-font-smoothing:antialiased}
        input,textarea,select{caret-color:${G.green}}
        input:focus,textarea:focus,select:focus{border-color:${G.green}!important;outline:none}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${G.surfaceBorderLight};border-radius:2px}
        .mh-hscroll{scrollbar-width:none;-ms-overflow-style:none}
        .mh-hscroll::-webkit-scrollbar{display:none}
      `}</style>



      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        {isMobile ? (
          // ── Mobile header ─────────────────────────────────────────────────
          view === 'detail' ? (
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
              {selected && <DetailExportMenu iconOnly pdfBusy={pdfBusy}
                onPdf={() => domain === 'sports' ? downloadAthletePdf(selected) : downloadClientPdf(selected)}
                isAdmin={isAdmin} linkUrl={shareDetailUrl} linkLoading={shareDetailLoading}
                onLink={generateDetailShareLink} onClearLink={() => setShareDetailUrl(null)} />}
              {authBtn}
              {isAdmin && selected && <button onClick={() => domain === 'sports' ? setEditingAthlete(selected) : setEditing(selected)} style={{ background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Edit</button>}
              <button onClick={() => setView('roster')} style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 12px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>✕</button>
            </div>
          ) : (
            <div style={{ flexShrink: 0, position: "sticky", top: 0, zIndex: 40, background: G.bg }}>
              {/* Row 1: logo (left) + export + profile (right) — always just these three */}
              <div style={{ padding: "14px 16px 10px", display: "flex", gap: 8, alignItems: "center" }}>
                <img src="https://www.milkhoneyla.com/wp-content/uploads/2024/05/cropped-MH-Logo.png" alt="Milk & Honey" onClick={() => setView('roster')} style={{ height: 28, objectFit: "contain", flexShrink: 0, cursor: "pointer" }} />
                <div style={{ flex: 1 }} />
                {rosterControlsOn && exportControl(true)}
                {authBtnMobile}
              </div>
              {/* Row 2: domain + view + sort + layout + search — one line (scrolls if tight) */}
              <div style={{ padding: "0 16px 12px" }}>
                {!rosterControlsOn ? ((navActive || musicNavActive) ? mobileNavStrip : <div style={{ display: "flex", gap: 4, alignItems: "center" }}>{domainToggle}</div>) : mobileSearchOpen ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: G.surfaceRaised, border: `1px solid ${G.green}`, borderRadius: 12, padding: "10px 14px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke={G.textTertiary} strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke={G.textTertiary} strokeWidth="2" strokeLinecap="round"/></svg>
                    <input ref={searchRef} autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder={domain === 'sports' ? "Search athletes..." : "Search clients..."}
                      style={{ background: "none", border: "none", outline: "none", fontSize: 16, color: G.text, fontFamily: ff, flex: 1, minWidth: 0 }} />
                    <button onClick={() => { setMobileSearchOpen(false); setSearch(''); }} style={{ background: "none", border: "none", color: G.textSecondary, cursor: "pointer", fontSize: 16, padding: 0, fontFamily: ff }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {domainToggle}
                    {isAdmin && (domain === 'sports' || isTyler) && (
                      <button onClick={() => domain === 'sports' ? goSportsPage('home') : goMusicPage('home')} title="Home"
                        style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 9px", cursor: "pointer", color: G.textSecondary, display: "flex", alignItems: "center", flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    )}
                    {viewFilter}
                    <ClientSortDropdown clientSort={clientSort} setClientSort={setClientSort} compact />
                    {viewToggle}
                    <div style={{ flex: 1, minWidth: 0 }} />
                    <button onClick={() => setMobileSearchOpen(true)} title="Search"
                      style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 11px", cursor: "pointer", color: G.textSecondary, display: "flex", alignItems: "center", flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                )}
              </div>
              <div style={{ height: 1, background: G.surfaceBorder }} />
            </div>
          )
        ) : (
          // ── Desktop header ────────────────────────────────────────────────
          <div style={{ padding: "12px 24px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0, position: view === 'detail' ? "static" : "sticky", top: 0, zIndex: 40, background: G.bg }}>
            <img src="https://www.milkhoneyla.com/wp-content/uploads/2024/05/cropped-MH-Logo.png" alt="Milk & Honey" onClick={() => setView('roster')} style={{ height: 28, objectFit: "contain", flexShrink: 0, cursor: "pointer" }} />
            <div style={{ width: 1, height: 18, background: G.surfaceBorder, flexShrink: 0 }} />
            {domainToggle}
            {view === 'detail' ? (
              <>
                <div style={{ flex: 1 }} />
                {selected && <DetailExportMenu pdfBusy={pdfBusy}
                  onPdf={() => domain === 'sports' ? downloadAthletePdf(selected) : downloadClientPdf(selected)}
                  isAdmin={isAdmin} linkUrl={shareDetailUrl} linkLoading={shareDetailLoading}
                  onLink={generateDetailShareLink} onClearLink={() => setShareDetailUrl(null)} />}
                {authBtn}
                {isAdmin && selected && <button onClick={() => domain === 'sports' ? setEditingAthlete(selected) : setEditing(selected)} style={{ background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Edit</button>}
                <button onClick={() => setView('roster')} style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 12px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>✕</button>
              </>
            ) : !rosterControlsOn ? (
              <>
                <div style={{ flex: 1 }} />
                {authBtn}
              </>
            ) : (
              <>
                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder={domain === 'sports' ? "Search athletes..." : "Search clients..."}
                  style={{ ...inputBase, width: 220, padding: "8px 12px", flexShrink: 0 }} />
                <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap", alignItems: "center" }}>
                  {viewFilter}
                  <ClientSortDropdown clientSort={clientSort} setClientSort={setClientSort} />
                  {viewToggle}
                </div>
                {isAdmin && (
                  <button onClick={() => domain === 'sports'
                    ? setEditingAthlete({ level: 'College', name: '', position: '', public: false, brands: [], interests: [] })
                    : setEditing({})}
                    style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap", flexShrink: 0 }}>
                    + Add
                  </button>
                )}
                {exportControl()}
                {authBtn}
              </>
            )}
          </div>
        )}

        {/* Content (sidebar + page) */}
        <div style={{ flex: 1, display: "flex", minWidth: 0, alignItems: "stretch" }}>
        {sidebar}
        <div style={{ flex: 1, overflow: "visible", minWidth: 0 }}>
          {(domain === 'sports' ? (!athletesLoaded || !authKnown) : loading) && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 14 }}>
              <span style={{ fontSize: 24, animation: "spin 1s linear infinite", display: "inline-block", color: G.textTertiary }}>⟳</span>
              <span style={{ fontSize: 13, color: G.textTertiary }}>Loading {domain === 'sports' ? 'athletes' : 'clients'}...</span>
            </div>
          )}
          {error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 10, textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 22, color: G.red }}>!</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: G.text }}>Could not load {domain === 'sports' ? 'athletes' : 'clients'}</div>
              <div style={{ fontSize: 13, color: G.textSecondary }}>{error}</div>
            </div>
          )}

          {domain === 'sports' ? (
            <>
              {!error && athletesLoaded && view === 'detail' && selected && (
                <SportsDetail athlete={selected} isMobile={isMobile} hideContact={isAdmin} companyView={isAdmin} />
              )}
              {!error && athletesLoaded && view === 'roster' && navActive && sportsPage === 'home' && (
                <SportsDashboard athletes={athletes} isMobile={isMobile} user={currentUser} decks={sportsDecks || DECKS}
                  onOpenAthlete={(a) => setView('detail', a)}
                  onGoRoster={() => goSportsPage('roster')}
                  onShowStarters={() => { clearCustomGroup(); setSportsLevels([...ALL_LEVELS]); setDepthFilter('Starters'); goSportsPage('roster'); }}
                  onShowMine={() => { clearCustomGroup(); setSportsLevels([...ALL_LEVELS]); setDepthFilter('All'); setAgentFilter(currentUser?.name || 'All'); goSportsPage('roster'); }}
                  onGoMarketing={() => goSportsPage('marketing')}
                  onGoRecruiting={() => goSportsPage('recruiting')} />
              )}
              {view === 'roster' && navActive && sportsPage === 'contracts' && <ContractsPage isMobile={isMobile} athletes={athletes} staff={sportsStaff} onOpenAthlete={(a) => setView('detail', a)} />}
              {view === 'roster' && navActive && sportsPage === 'branddeals' && <BrandDealsPage isMobile={isMobile} athletes={athletes} staff={sportsStaff} user={currentUser} onOpenAthlete={(a) => setView('detail', a)} />}
              {view === 'roster' && navActive && sportsPage === 'recruiting' && <RecruitingBoard isMobile={isMobile} user={currentUser} athletes={athletes} staff={sportsStaff} onPromoted={() => setAthletesLoaded(false)} />}
              {view === 'roster' && navActive && sportsPage === 'marketing' && <MarketingPage isMobile={isMobile} athletes={athletes} staff={sportsStaff} onOpenAthlete={(a) => setView('detail', a)} />}
              {view === 'roster' && navActive && sportsPage === 'gifting' && <GiftingPage isMobile={isMobile} athletes={athletes} staff={sportsStaff} onOpenAthlete={(a) => setView('detail', a)} />}
              {view === 'roster' && navActive && sportsPage === 'resources' && <ResourcesPage isMobile={isMobile} decks={sportsDecks || DECKS} />}
              {!error && athletesLoaded && view === 'roster' && rosterControlsOn && (
                <div style={{ padding: isMobile ? "0 0 80px" : "20px 24px 48px" }}>
                  {sportsLevelBar}
                  {filteredAthletes.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "80px 32px", color: G.textTertiary }}>
                      <div style={{ fontSize: 15 }}>{search || sportsLevels.length < ALL_LEVELS.length ? 'No athletes match your filters.' : 'No athletes to show yet.'}</div>
                    </div>
                  ) : rosterView === 'detailed' ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
                      {filteredAthletes.map((a, i) => (
                        <DetailedAthleteCard key={a.id || i} athlete={a} isMobile={isMobile} onClick={() => setView('detail', a)} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: isMobile ? 0 : 14 }}>
                      {filteredAthletes.map((a, i) => (
                        <SportsCard key={a.id || i} athlete={a} isMobile={isMobile} showDepth={isAdmin} onClick={() => setView('detail', a)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {!loading && !error && view === 'detail' && selected && (
                <ClientDetail client={selected} logos={logos} staff={staff} isMobile={isMobile} isAdmin={isAdmin} onBack={() => setView('roster')} onEdit={() => setEditing(selected)} />
              )}
              {!loading && !error && view === 'roster' && musicNavActive && musicPage === 'home' && (
                <MusicDashboard clients={clients} isMobile={isMobile} user={currentUser}
                  onOpenClient={(c) => setView('detail', c)}
                  onGoRoster={() => { clearCustomGroup(); setFilterTypes([]); goMusicPage('roster'); }}
                  onFilterType={(t) => { clearCustomGroup(); setFilterTypes([t]); goMusicPage('roster'); }}
                  onGoMarketing={() => goMusicPage('marketing')} />
              )}
              {!loading && !error && view === 'roster' && musicNavActive && musicPage === 'marketing' && (
                <MusicMarketingPage isMobile={isMobile} clients={clients} onOpenClient={(c) => setView('detail', c)} />
              )}
              {!loading && !error && view === 'roster' && rosterControlsOn && (
                <div style={{ padding: isMobile ? "0 0 80px" : "20px 24px 48px" }}>
                  {filtered.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "80px 32px", color: G.textTertiary }}>
                      <div style={{ fontSize: 15 }}>{search || filterTypes.length > 0 || filterContact !== 'All' || filterLabel !== 'All' || filterCountry !== 'All' ? 'No clients match your filters.' : 'No clients yet. Add your first one.'}</div>
                    </div>
                  ) : rosterView === 'detailed' ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
                      {filtered.map((c, i) => (
                        <DetailedClientCard key={c.id || i} client={c} logos={logos} isMobile={isMobile} onClick={() => setView('detail', c)} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: isMobile ? 0 : 14 }}>
                      {filtered.map((c, i) => (
                        <ClientCard key={c.id || i} client={c} logos={logos} isMobile={isMobile} onClick={() => setView('detail', c)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </div>


      {/* Custom group picker */}
      {customGroupOpen && (
        <CustomGroupPicker items={customItems} selected={customGroup} groupTitle={customGroupTitle}
          onToggle={toggleCustomMember} onClear={clearCustomGroup} onClose={() => setCustomGroupOpen(false)}
          onSmartSearch={smartGroup} domain={domain} isAdmin={isAdmin} />
      )}

      {/* Edit modal */}
      {editing && <ClientForm initial={editing} onSave={saveClient} onCancel={() => setEditing(null)} staff={staff} clients={clients} />}

      {/* Athlete edit modal (sports) */}
      {editingAthlete && <AthleteForm initial={editingAthlete} staffNames={sportsStaff} onSave={saveAthlete} onCancel={() => setEditingAthlete(null)} />}

      {/* Internal AI chat — company sessions only (context spans both rosters + all tabs). */}
      {!loading && isAdmin && authKnown && <FloatingChat isMobile={isMobile} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<><App /><Analytics /></>);
