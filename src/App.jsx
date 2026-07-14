// Milk & Honey Music — Client Management
// API: /api/sheets (music-sheets.js), /api/share (share.js)

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';

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
function FloatingChat({ clients, isMobile }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = open ? 'hidden' : '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open, isMobile]);
  const [msgs, setMsgs] = useState([{ role: "assistant", text: "Hey — ask me anything about your music clients. I can help with brand matching, finding collaboration patterns, drafting outreach, or answering questions about the roster." }]);
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
      const systemPrompt = `You are a strategic internal assistant for Milk & Honey Music, representing songwriters, producers, and artists.

You have access to the full client roster provided at the start of this conversation. Use it to answer questions about clients, find patterns, suggest collaborations, match clients to brands or sync opportunities, and draft outreach.

OUTPUT FORMAT:
1. CONVERSATIONAL: plain answers, analysis, recommendations.
2. DOCUMENT: for pitches, briefs, proposals -- wrap in [DOC] and [/DOC] tags. Start with a ## heading. End with a closing offer outside the tags.
3. CSV EXPORT: ONLY when explicitly asked. Respond with ONLY: {"export":true,"filename":"name.csv","rows":[{"Col":"val"}]}

Today: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
Never invent clients or credits not in the data. Do not include a footer line in documents -- the PDF template adds one automatically.`;

      const rosterContext = `MUSIC CLIENTS (${clients.length} total):
${JSON.stringify(clients.map(c => ({
  name: c.name, types: c.types, contact: c.contact,
  city: c.city, state: c.state, country: c.country,
  pro: c.pro, publisher: c.publisher, label: c.label,
  credits: c.credits, bio: c.bio ? c.bio.slice(0, 200) : null,
  instagram: c.instagram, twitter: c.twitter, tiktok: c.tiktok,
  spotifyMonthly: c.spotifyMonthly,
  spotifyFollowers: c.spotifyFollowers,
  spotifyPopularity: c.spotifyPopularity,
  spotifyGenres: c.spotifyGenres,
})))}`;

      const priorMsgs = msgs.filter((m, i) => i > 0 && m.text);
      const history = [
        { role: "user", content: rosterContext },
        { role: "assistant", content: "Got it — I have the full client roster. What do you need?" },
        ...priorMsgs.map(m => ({ role: m.role, content: m.text })),
        { role: "user", content: text },
      ];

      const resp = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", system: systemPrompt, messages: history }),
      });
      const data = await resp.json();
      if (data.export) {
        const blob = new Blob([data.csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = data.filename; a.click();
        setMsgs(m => [...m, { role: "assistant", text: `Exported ${data.rowCount} rows as ${data.filename}.` }]);
      } else {
        const raw = data.text || "No response.";
        const docStart = raw.indexOf("[DOC]"), docEnd = raw.indexOf("[/DOC]");
        if (docStart !== -1 && docEnd > docStart) {
          const pre = raw.slice(0, docStart).trim();
          const doc = raw.slice(docStart + 5, docEnd).trim();
          const post = raw.slice(docEnd + 6).trim();
          const msgs2 = [];
          if (pre) msgs2.push({ role: "assistant", text: pre, msgType: "preamble" });
          if (doc) msgs2.push({ role: "assistant", text: doc, msgType: "doc" });
          if (post) msgs2.push({ role: "assistant", text: post, msgType: "closer" });
          setMsgs(m => [...m, ...msgs2]);
        } else {
          setMsgs(m => [...m, { role: "assistant", text: raw }]);
        }
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
                {m.text}
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

// ── Client edit form ──────────────────────────────────────────────────────────
function ClientForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...BLANK, ...initial });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isNew = !initial._rowIndex;

  const save = async () => {
    if (!form.name.trim()) return alert('Name is required');
    setSaving(true);
    try {
      const resp = await fetch('/api/sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isNew ? 'create' : 'save', client: form }),
      });
      const data = await resp.json();
      if (data.success) onSave(form);
      else throw new Error(data.error || 'Save failed');
    } catch(e) { alert('Save failed: ' + e.message); }
    setSaving(false);
  };

  const typeOptions = ['Artist', 'Producer', 'Songwriter', 'Composer', 'Mixer', 'Remixer'];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(20px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: G.surfaceGlass, backdropFilter: "blur(24px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 22, width: "100%", maxWidth: 600, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: G.shadowLg }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: G.text }}>{isNew ? 'Add Client' : 'Edit Client'}</span>
          <button onClick={onCancel} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "7px 12px", fontSize: 14, fontFamily: ff }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <div style={{ gridColumn: "1/-1", marginBottom: 16 }}>
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
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Name"><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Type">
                <div style={{ display: "flex", gap: 8 }}>
                  {typeOptions.map(t => {
                    const on = (form.types || []).includes(t);
                    return <button key={t} onClick={() => set('types', on ? form.types.filter(x => x !== t) : [...(form.types||[]), t])}
                      style={{ flex: 1, padding: "8px 0", border: `1px solid ${on ? G.green : G.surfaceBorder}`, borderRadius: 9, background: on ? G.greenSubtle : G.surfaceRaised, color: on ? G.green : G.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff, transition: `all 0.15s ${G.ease}` }}>
                      {t}
                    </button>;
                  })}
                </div>
              </Field>
            </div>
            <Field label="Contact / MH Rep"><Input value={form.contact} onChange={e => set('contact', e.target.value)} placeholder="Agent name" /></Field>
            <Field label="Photo URL"><Input value={form.photoUrl} onChange={e => set('photoUrl', e.target.value)} placeholder="https://..." /></Field>
            <div style={{ gridColumn: "1/-1" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: G.textTertiary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Locations (up to 3)</div>
              {[['','',''],['2','2','2'],['3','3','3']].map(([s1,s2,s3],i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px", marginBottom: 8 }}>
                  <Field label={`City ${i+1}`}><Input value={form[`city${s1}`] || ''} onChange={e => set(`city${s1}`, e.target.value)} /></Field>
                  <Field label={`State ${i+1}`}><Input value={form[`state${s2}`] || ''} onChange={e => set(`state${s2}`, e.target.value)} /></Field>
                  <Field label={`Country ${i+1}`}><Input value={form[`country${s3}`] || ''} onChange={e => set(`country${s3}`, e.target.value)} placeholder="United States" /></Field>
                </div>
              ))}
            </div>
            <Field label="PRO"><Input value={form.pro} onChange={e => set('pro', e.target.value)} placeholder="BMI, ASCAP, SESAC..." /></Field>
            <Field label="Publisher"><Input value={form.publisher} onChange={e => set('publisher', e.target.value)} placeholder="Kobalt, Warner Chappell..." /></Field>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Record Label"><Input value={form.label} onChange={e => set('label', e.target.value)} placeholder="Atlantic, Republic..." /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Artists / Credits (comma-separated)"><Input value={(form.credits||[]).join(', ')} onChange={e => set('credits', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Drake, Post Malone, Billie Eilish..." /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Supporters (comma-separated)"><Input value={(form.supporters||[]).join(', ')} onChange={e => set('supporters', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Tiësto, John Summit, Vintage Culture..." /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Key Shows (comma-separated)"><Input value={(form.keyShows||[]).join(', ')} onChange={e => set('keyShows', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="EDC, Red Rocks, Coachella..." /></Field>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Bio"><Textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={4} /></Field>
            </div>
            <Field label="Instagram"><Input value={form.instagram} onChange={e => set('instagram', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            <Field label="Twitter / X"><Input value={form.twitter} onChange={e => set('twitter', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            <Field label="TikTok"><Input value={form.tiktok} onChange={e => set('tiktok', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            <Field label="YouTube URL"><Input value={form.youtube} onChange={e => set('youtube', e.target.value)} placeholder="https://youtube.com/@..." /></Field>
            <Field label="Beatport URL"><Input value={form.beatport} onChange={e => set('beatport', e.target.value)} placeholder="https://www.beatport.com/artist/..." /></Field>
            <Field label="Spotify URL"><Input value={form.spotifyUrl} onChange={e => set('spotifyUrl', e.target.value)} placeholder="https://open.spotify.com/artist/..." /></Field>
            <Field label="Apple Music URL"><Input value={form.appleMusicUrl} onChange={e => set('appleMusicUrl', e.target.value)} placeholder="https://music.apple.com/..." /></Field>
            <Field label="SoundCloud URL"><Input value={form.soundcloudUrl} onChange={e => set('soundcloudUrl', e.target.value)} placeholder="https://soundcloud.com/..." /></Field>
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${G.surfaceBorder}`, display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={onCancel} style={{ flex: 1, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "11px", color: G.textSecondary, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, background: saving ? G.surfaceRaised : G.green, border: "none", borderRadius: 12, padding: "11px", color: saving ? G.textTertiary : "#0a0a0a", fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: ff }}>
            {saving ? 'Saving...' : isNew ? 'Add Client' : 'Save Changes'}
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
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
            {dedupedFlags.length > 0 && <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{dedupedFlags.map(co => flag(co)).join(' ')}</span>}
            {[...(c.types || [])].sort((a,b) => a==='Artist'?-1:b==='Artist'?1:a.localeCompare(b)).map(t => <TypePill key={t} type={t} />)}
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

// ── Client detail view ────────────────────────────────────────────────────────
function ClientDetail({ client: c, logos, staff, onBack, onEdit, isMobile }) {
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
        {(c.spotifyMonthly || c.spotifyFollowers || c.spotifyPopularity != null) && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {c.spotifyMonthly && (
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

function ClientSortDropdown({ clientSort, setClientSort }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const SORTS = [["default","Roster Order"], ["alpha","A – Z"], ["label","Record Label"], ["listeners","Monthly Listeners"], ["type","Type"]];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, fontFamily: ff, fontSize: 13, fontWeight: 500, color: G.textSecondary, cursor: "pointer", whiteSpace: "nowrap" }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M4 4h8M6 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        Sort
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: G.surfaceGlass, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 12, padding: 6, zIndex: 500, minWidth: 180, boxShadow: G.shadowLg }}>
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
        <div style={{ fontSize: 13, color: G.textSecondary, marginBottom: 18 }}>Enter the team passphrase to manage the roster.</div>
        <input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Passphrase"
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

// Team logo in a white rounded tile, matching the music favicon badges.
function TeamLogo({ url, size = 38 }) {
  if (!url) return null;
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.12)", flexShrink: 0 }}>
      <img src={url} alt="" referrerPolicy="no-referrer" style={{ width: "82%", height: "82%", objectFit: "contain", display: "block" }} />
    </div>
  );
}

function SportsCard({ athlete: a, isMobile, onClick }) {
  const [hov, setHov] = useState(false);
  const team = a.nflTeam || a.college || '';
  const meta = [a.position, a.jerseyNumber && `#${a.jerseyNumber}`, team].filter(Boolean).join(' · ');
  if (isMobile) return (
    <div onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: `1px solid ${G.surfaceBorder}`, background: hov ? G.surfaceRaised : "transparent", cursor: "pointer", transition: `background 0.15s ${G.ease}` }}>
      <Avatar name={a.name} photoUrl={a.photoUrl} size={56} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: G.text, letterSpacing: "-0.02em", marginBottom: 4 }}>{a.name}</div>
        <div style={{ fontSize: 13, color: G.textSecondary }}>{meta}</div>
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
        <div style={{ fontSize: 14, color: G.textSecondary }}>{meta}</div>
      </div>
    </div>
  );
}

function SportsDetail({ athlete: a, isMobile }) {
  const [bioExp, setBioExp] = useState(false);
  const team = a.nflTeam || a.college || '';
  const typeLine = [a.position, team].filter(Boolean).join('  ·  ');
  const espnUrl = a.espnId ? `https://www.espn.com/${a.espnSport === 'college' ? 'college-football' : 'nfl'}/player/_/id/${a.espnId}` : '';
  const socialBtns = [
    a.instagram && { icon: <IgIcon size={isMobile ? 20 : 22} />, url: `https://instagram.com/${a.instagram}`, count: a.igFollowers },
    a.twitter && { icon: <TwIcon size={isMobile ? 18 : 20} />, url: `https://x.com/${a.twitter}`, count: a.twitterFollowers },
    a.tiktok && { icon: <TkIcon size={isMobile ? 18 : 20} />, url: `https://tiktok.com/@${a.tiktok}`, count: a.tiktokFollowers },
  ].filter(Boolean);
  const info = [
    a.height && { label: 'Height', value: a.height },
    a.weight && { label: 'Weight', value: a.weight },
    a.jerseyNumber && { label: 'Jersey', value: `#${a.jerseyNumber}` },
    a.hometown && { label: 'Hometown', value: a.hometown },
    a.classOf && { label: 'Class of', value: a.classOf },
    a.committedTo && { label: 'Committed', value: a.committedTo },
    (a.draftYear || a.draftRound || a.draftPick) && { label: 'Draft', value: [a.draftYear, a.draftRound && `R${a.draftRound}`, a.draftPick && `P${a.draftPick}`].filter(Boolean).join(' ') },
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
          <a href={`mailto:marketing@milkhoneysports.com?subject=${encodeURIComponent('Partnership inquiry — ' + a.name)}`}
            style={{ position: "absolute", top: banner ? 16 : pad, right: pad, display: "flex", alignItems: "center", gap: 7, background: G.greenSubtle, border: `1.5px solid ${G.green}`, borderRadius: 10, padding: isMobile ? "8px 10px" : "9px 14px", textDecoration: "none", zIndex: 3 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" stroke={G.green} strokeWidth="2"/><path d="m22 6-10 7L2 6" stroke={G.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {!isMobile && <span style={{ fontSize: 13, fontWeight: 600, color: G.green }}>Contact</span>}
          </a>
          <div style={{ display: "flex", gap: isMobile ? 16 : 24, alignItems: "flex-end" }}>
            <div style={{ flexShrink: 0, width: avSize, height: avSize, borderRadius: "50%", overflow: "hidden", border: `2px solid ${G.surfaceBorderLight}` }}>
              <Avatar name={a.name} photoUrl={a.photoUrl} size={avSize} />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
              <h1 style={{ fontSize: isMobile ? 28 : 38, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", margin: 0, lineHeight: 1.05 }}>{a.name}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7, flexWrap: "wrap" }}>
                <TeamLogo url={a.teamLogo} size={26} />
                {typeLine && <span style={{ fontSize: isMobile ? 14 : 15, color: "#fff", fontWeight: 500 }}>{typeLine}</span>}
              </div>
              {socialBtns.length > 0 && (
                <div style={{ display: "flex", gap: isMobile ? 16 : 24, marginTop: 13, alignItems: "center", flexWrap: "wrap" }}>
                  {socialBtns.map((b, i) => (
                    <a key={i} href={b.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 7, color: "#fff", textDecoration: "none", transition: "opacity 0.15s" }} onMouseEnter={e => e.currentTarget.style.opacity = 0.65} onMouseLeave={e => e.currentTarget.style.opacity = 1}>
                      {b.icon}
                      {b.count && <span style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: "#fff" }}>{b.count}</span>}
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
          {a.brands?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 11 }}>Brands worked with</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {a.brands.map((b, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 500, color: "#fff", whiteSpace: "nowrap" }}>{b}</span>)}
              </div>
            </div>
          )}
          {a.interests?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 11 }}>Interests</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {a.interests.map((it, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 500, color: "#fff", whiteSpace: "nowrap" }}>{it}</span>)}
              </div>
            </div>
          )}
          {info.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 10 }}>
              {info.map((s, i) => (
                <div key={i} style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: G.textTertiary }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: G.text, marginTop: 3 }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {espnUrl && <a href={espnUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: G.green, textDecoration: "none", fontWeight: 600 }}>ESPN profile →</a>}
            {a.profileUrl247 && <a href={a.profileUrl247} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: G.green, textDecoration: "none", fontWeight: 600 }}>247Sports profile →</a>}
          </div>
        </div>
      </div>
    </div>
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
  const [authConfigured, setAuthConfigured] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  // Sports domain: music lives at "/" + "/{slug}", sports at "/sports" + "/sports/{slug}".
  const [athletes, setAthletes] = useState([]);
  const [athletesLoaded, setAthletesLoaded] = useState(false);
  const [sportsLevel, setSportsLevel] = useState('All');
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
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
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
    if (domain !== 'sports' || athletesLoaded) return;
    fetch('/api/athletes')
      .then(r => r.json())
      .then(d => { setAthletes(d.athletes || []); setAthletesLoaded(true); })
      .catch(() => setAthletesLoaded(true));
  }, [domain, athletesLoaded]);

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
  const [shareRosterOpen, setShareRosterOpen] = useState(false);
  const [shareRosterUrl, setShareRosterUrl] = useState(null);
  const [shareRosterCopied, setShareRosterCopied] = useState(false);
  const [shareRosterLoading, setShareRosterLoading] = useState(false);
  const [shareRosterTitle, setShareRosterTitle] = useState('Milk & Honey Music');
  const [shareRosterTypes, setShareRosterTypes] = useState([]); // empty = All (like the main filter)
  const [shareRosterSort, setShareRosterSort] = useState('default');
  const [shareRosterExpiry, setShareRosterExpiry] = useState('90');
  const [shareRosterShowLogos, setShareRosterShowLogos] = useState(true);
  const [shareRosterShowCredits, setShareRosterShowCredits] = useState(true);
  const [shareRosterShowBio, setShareRosterShowBio] = useState(true);
  const [shareRosterShowContact, setShareRosterShowContact] = useState(true);
  const [shareRosterShowMusic, setShareRosterShowMusic] = useState(true);
  const [shareFeaturesOpen, setShareFeaturesOpen] = useState(false);

  useEffect(() => {
    fetch('/api/sheets')
      .then(r => r.json())
      .then(d => { setClients(d.clients || []); setLogos(d.logos || {}); setStaff(d.staff || {}); setIsAdmin(!!d.isAdmin); setAuthConfigured(!!d.authConfigured); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const doLogout = async () => {
    try { await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); } catch {}
    window.location.reload();
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
  const downloadRosterPdf = () => downloadPdf({
    action: 'roster-pdf',
    title: 'Milk & Honey Music',
    clients: filtered.map(c => ({ name: c.name, types: c.types, photoUrl: c.photoUrl, label: c.label, pro: c.pro, country: c.country, logoUrl: lookupLogo(logos, c.label || c.pro || c.publisher) })),
  }, 'Milk-and-Honey-Roster.pdf');
  const downloadClientPdf = (c) => {
    const contactEmail = (c.contact || '').split(',').map(n => staff[n.trim().toLowerCase()]?.email).filter(Boolean).join(',');
    return downloadPdf({ action: 'client-pdf', client: { ...c, contactEmail }, logos }, `${slugOf(c.name)}.pdf`);
  };

  const types = useMemo(() => {
    const all = new Set();
    clients.forEach(c => (c.types || []).forEach(t => all.add(t)));
    const sorted = Array.from(all).sort((a, b) => {
      if (a === 'Artist') return -1; if (b === 'Artist') return 1;
      return a.localeCompare(b);
    });
    return ['All', ...sorted];
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

  const parseListeners = v => {
    if (!v) return 0;
    const s = String(v).trim().toUpperCase();
    if (s.endsWith('M')) return parseFloat(s) * 1e6;
    if (s.endsWith('K')) return parseFloat(s) * 1e3;
    return parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
  };

  const filtered = useMemo(() => {
    const list = clients.filter(c => {
      if (filterTypes.length > 0 && !filterTypes.some(t => (c.types || []).includes(t))) return false;
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
  }, [clients, filterTypes, filterContact, filterLabel, filterCountry, search, clientSort]);

  const filteredAthletes = useMemo(() => {
    const list = athletes.filter(a => {
      if (sportsLevel !== 'All' && a.level !== sportsLevel) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || (a.position || '').toLowerCase().includes(q) ||
          (a.nflTeam || '').toLowerCase().includes(q) || (a.college || '').toLowerCase().includes(q);
      }
      return true;
    });
    // Default sort: by league (NFL → College → HS), then by social reach.
    return [...list].sort((a, b) => {
      const lr = (LEAGUE_RANK[a.level] ?? 9) - (LEAGUE_RANK[b.level] ?? 9);
      if (lr !== 0) return lr;
      return athleteReach(b) - athleteReach(a);
    });
  }, [athletes, sportsLevel, search]);

  const saveClient = (updatedClient) => {
    setClients(prev => {
      const idx = prev.findIndex(c => c.name === updatedClient.name);
      if (idx >= 0) { const next = [...prev]; next[idx] = updatedClient; return next; }
      return [...prev, updatedClient];
    });
    setEditing(null);
    if (view === 'detail') setSelected(updatedClient);
  };

  // Login / logout control (only once auth is configured on the server).
  const authBtn = authConfigured ? (
    <button onClick={() => isAdmin ? doLogout() : setLoginOpen(true)}
      style={{ background: "transparent", border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff, color: G.textSecondary, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d={isAdmin ? "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" : "M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      {isAdmin ? 'Log out' : 'Log in'}
    </button>
  ) : null;

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
          style={{ padding: "7px 14px", border: "none", background: domain === d ? G.greenSubtle : "transparent", color: domain === d ? G.green : G.textSecondary, fontWeight: domain === d ? 700 : 500, fontSize: 12, cursor: "pointer", fontFamily: ff, textTransform: "capitalize" }}>
          {d}
        </button>
      ))}
    </div>
  );
  // Sports level filter (All / NFL / College / High School).
  const sportsLevels = ['All', 'NFL', 'College', 'High School'];
  const sportsLevelBar = (
    <div style={{ display: "flex", background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
      {sportsLevels.map((l, i) => (
        <button key={l} onClick={() => setSportsLevel(l)}
          style={{ padding: "8px 14px", border: "none", borderLeft: i > 0 ? `1px solid ${G.surfaceBorder}` : "none", fontFamily: ff, fontSize: 12, fontWeight: sportsLevel === l ? 700 : 500, cursor: "pointer", background: sportsLevel === l ? G.greenSubtle : "transparent", color: sportsLevel === l ? G.green : G.textSecondary, whiteSpace: "nowrap" }}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: G.bg, color: G.text, fontFamily: ff }}>
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
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
      `}</style>



      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        {isMobile ? (
          // ── Mobile header ─────────────────────────────────────────────────
          view === 'detail' ? (
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
              {domain === 'music' && selected && pdfBtn(() => downloadClientPdf(selected), null)}
              {authBtn}
              {domain === 'music' && isAdmin && <button onClick={() => setEditing(selected)} style={{ background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Edit</button>}
              <button onClick={() => setView('roster')} style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 12px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>✕</button>
            </div>
          ) : (
            <div style={{ flexShrink: 0, position: "sticky", top: 0, zIndex: 40, background: G.bg }}>
              {/* Logo + Search icon + Share + Add row */}
              <div style={{ padding: "14px 16px 10px", display: "flex", gap: 8, alignItems: "center" }}>
                <img src="https://www.milkhoneyla.com/wp-content/uploads/2024/05/cropped-MH-Logo.png" alt="Milk & Honey" onClick={() => setView('roster')} style={{ height: 28, objectFit: "contain", flexShrink: 0, cursor: "pointer" }} />
                {mobileSearchOpen ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: G.surfaceRaised, border: `1px solid ${G.green}`, borderRadius: 12, padding: "10px 14px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke={G.textTertiary} strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke={G.textTertiary} strokeWidth="2" strokeLinecap="round"/></svg>
                    <input ref={searchRef} autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..."
                      style={{ background: "none", border: "none", outline: "none", fontSize: 15, color: G.text, fontFamily: ff, flex: 1 }} />
                    <button onClick={() => { setMobileSearchOpen(false); setSearch(''); }} style={{ background: "none", border: "none", color: G.textSecondary, cursor: "pointer", fontSize: 16, padding: 0, fontFamily: ff }}>✕</button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => setMobileSearchOpen(true)}
                      style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "10px 14px", cursor: "pointer", color: G.textSecondary, display: "flex", alignItems: "center" }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                    <div style={{ flex: 1 }} />
                    {domain === 'music' && isAdmin && <button onClick={() => { setShareRosterOpen(true); setShareRosterUrl(null); }}
                      style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "10px 16px", cursor: "pointer", color: G.text, fontFamily: ff, display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      Share
                    </button>}
                    {domain === 'music' && isAdmin && <button onClick={() => setEditing({ ...BLANK })} style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 12, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap" }}>+ Add</button>}
                    {domain === 'music' && pdfBtn(downloadRosterPdf, null)}
                    {authBtn}
                  </>
                )}
              </div>
              {/* Domain toggle + filters */}
              <div style={{ margin: "0 16px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {domainToggle}
                {domain === 'sports' ? sportsLevelBar : (
                  <>
                    <div style={{ display: "flex", background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 9, overflow: "hidden", flexShrink: 0 }}>
                      {types.map((t, i) => (
                        <button key={t} onClick={() => toggleFilterType(t)}
                          style={{ padding: "7px 10px", border: "none", borderLeft: i > 0 ? `1px solid ${G.surfaceBorder}` : "none", fontFamily: ff, fontSize: 11, fontWeight: typeActive(t) ? 700 : 500, cursor: "pointer", background: typeActive(t) ? G.greenSubtle : "transparent", color: typeActive(t) ? G.green : G.textSecondary, whiteSpace: "nowrap" }}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <ClientFiltersDropdown
                      filterContact={filterContact} setFilterContact={setFilterContact}
                      filterLabel={filterLabel} setFilterLabel={setFilterLabel}
                      filterCountry={filterCountry} setFilterCountry={setFilterCountry}
                      contacts={contacts} labels={labels} countries={countries}
                      activeCount={(filterContact !== 'All' ? 1 : 0) + (filterLabel !== 'All' ? 1 : 0) + (filterCountry !== 'All' ? 1 : 0)}
                    />
                    <ClientSortDropdown clientSort={clientSort} setClientSort={setClientSort} />
                  </>
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
                {domain === 'music' && selected && pdfBtn(() => downloadClientPdf(selected), 'PDF')}
                {authBtn}
                {domain === 'music' && isAdmin && <button onClick={() => setEditing(selected)} style={{ background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Edit</button>}
                <button onClick={() => setView('roster')} style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 12px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>✕</button>
              </>
            ) : (
              <>
                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder={domain === 'sports' ? "Search athletes..." : "Search clients..."}
                  style={{ ...inputBase, width: 220, padding: "8px 12px", flexShrink: 0 }} />
                <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap", alignItems: "center" }}>
                  {domain === 'sports' ? sportsLevelBar : (
                    <>
                      <div style={{ display: "flex", background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, overflow: "hidden" }}>
                        {types.map((t, i) => (
                          <button key={t} onClick={() => toggleFilterType(t)}
                            style={{ padding: "8px 16px", border: "none", borderLeft: i > 0 ? `1px solid ${G.surfaceBorder}` : "none", fontFamily: ff, fontSize: 13, fontWeight: typeActive(t) ? 700 : 500, cursor: "pointer", background: typeActive(t) ? G.greenSubtle : "transparent", color: typeActive(t) ? G.green : G.textSecondary, transition: `all 0.18s ${G.ease}`, whiteSpace: "nowrap" }}>
                            {t}
                          </button>
                        ))}
                      </div>
                      <ClientFiltersDropdown
                        filterContact={filterContact} setFilterContact={setFilterContact}
                        filterLabel={filterLabel} setFilterLabel={setFilterLabel}
                        filterCountry={filterCountry} setFilterCountry={setFilterCountry}
                        contacts={contacts} labels={labels} countries={countries}
                        activeCount={(filterContact !== 'All' ? 1 : 0) + (filterLabel !== 'All' ? 1 : 0) + (filterCountry !== 'All' ? 1 : 0)}
                      />
                      <ClientSortDropdown clientSort={clientSort} setClientSort={setClientSort} />
                    </>
                  )}
                </div>
                {domain === 'music' && pdfBtn(downloadRosterPdf, 'PDF')}
                {domain === 'music' && isAdmin && <button onClick={() => { setShareRosterOpen(true); setShareRosterUrl(null); }}
                  style={{ background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Share
                </button>}
                {domain === 'music' && isAdmin && <button onClick={() => setEditing({ ...BLANK })} style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff, flexShrink: 0 }}>+ Add Client</button>}
                {authBtn}
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflow: "visible" }}>
          {(domain === 'sports' ? !athletesLoaded : loading) && (
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
                <SportsDetail athlete={selected} isMobile={isMobile} />
              )}
              {!error && athletesLoaded && view === 'roster' && (
                <div style={{ padding: isMobile ? "0 0 80px" : "20px 24px 48px" }}>
                  {filteredAthletes.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "80px 32px", color: G.textTertiary }}>
                      <div style={{ fontSize: 15 }}>{search || sportsLevel !== 'All' ? 'No athletes match your filters.' : 'No athletes to show yet.'}</div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: isMobile ? 0 : 14 }}>
                      {filteredAthletes.map((a, i) => (
                        <SportsCard key={a.id || i} athlete={a} isMobile={isMobile} onClick={() => setView('detail', a)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {!loading && !error && view === 'detail' && selected && (
                <ClientDetail client={selected} logos={logos} staff={staff} isMobile={isMobile} onBack={() => setView('roster')} onEdit={() => setEditing(selected)} />
              )}
              {!loading && !error && view === 'roster' && (
                <div style={{ padding: isMobile ? "0 0 80px" : "20px 24px 48px" }}>
                  {filtered.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "80px 32px", color: G.textTertiary }}>
                      <div style={{ fontSize: 15 }}>{search || filterTypes.length > 0 || filterContact !== 'All' || filterLabel !== 'All' || filterCountry !== 'All' ? 'No clients match your filters.' : 'No clients yet. Add your first one.'}</div>
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

      {/* Share Roster Modal */}
      {shareRosterOpen && (() => {
        const doShare = async () => {
          setShareRosterLoading(true); setShareRosterUrl(null);
          try {
            let filtered = clients.filter(c =>
              shareRosterTypes.length === 0 || (c.types||[]).some(t => shareRosterTypes.includes(t))
            );
            if (shareRosterSort === 'alpha') filtered = [...filtered].sort((a,b) => (a.name||'').localeCompare(b.name||''));
            const mapped = filtered.map(c => ({
              name: c.name, types: c.types, level: (c.types||[])[0] || 'Client',
              photoUrl: c.photoUrl,
              logoUrl: lookupLogo(logos, c.pro) || lookupLogo(logos, c.publisher) || lookupLogo(logos, c.label),
              proLogoUrl: shareRosterShowLogos ? lookupLogo(logos, c.pro) : null,
              pubLogoUrl: shareRosterShowLogos ? lookupLogo(logos, c.publisher) : null,
              labelLogoUrl: shareRosterShowLogos ? lookupLogo(logos, c.label) : null,
              // Per-company logo maps for multi-value fields
              proLogos: shareRosterShowLogos ? (c.pro||'').split(',').map(v=>v.trim()).filter(Boolean).map(v=>({name:v,url:lookupLogo(logos,v)})) : [],
              pubLogos: shareRosterShowLogos ? (c.publisher||'').split(',').map(v=>v.trim()).filter(Boolean).map(v=>({name:v,url:lookupLogo(logos,v)})) : [],
              labelLogos: shareRosterShowLogos ? (c.label||'').split(',').map(v=>v.trim()).filter(Boolean).map(v=>({name:v,url:lookupLogo(logos,v)})) : [],
              pro: shareRosterShowLogos ? c.pro : null,
              publisher: shareRosterShowLogos ? c.publisher : null,
              label: shareRosterShowLogos ? c.label : null,
              city: c.city, state: c.state, country: c.country,
              city2: c.city2, state2: c.state2, country2: c.country2,
              city3: c.city3, state3: c.state3, country3: c.country3,
              credits: shareRosterShowCredits ? c.credits : null,
              bio: shareRosterShowBio ? c.bio : null,
              contact: shareRosterShowContact ? c.contact : null,
              contactEmail: (shareRosterShowContact && c.contact)
                ? c.contact.split(',').map(n => staff[n.trim().toLowerCase()]).filter(Boolean).map(s => s.email).filter(Boolean).join(',')
                : null,
              instagram: c.instagram, twitter: c.twitter, tiktok: c.tiktok,
              appleMusicUrl: c.appleMusicUrl, soundcloudUrl: c.soundcloudUrl,
              spotifyUrl: c.spotifyUrl, spotifyMonthly: c.spotifyMonthly,
              spotifyRecentReleases: shareRosterShowMusic ? (c.spotifyRecentReleases || null) : null,
              spotifySongCredits: shareRosterShowMusic ? (c.spotifySongCredits || null) : null,
              spotifyTopTracks: shareRosterShowMusic ? (c.spotifyTopTracks || null) : null,
            }));
            const expiresAt = shareRosterExpiry !== 'never'
              ? new Date(Date.now() + parseInt(shareRosterExpiry) * 24*60*60*1000).toISOString() : null;
            const resp = await fetch('/api/share', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'roster-share', title: shareRosterTitle, athletes: mapped, expiresAt }),
            });
            const data = await resp.json();
            if (data.url) { setShareRosterUrl(data.url); window.open(data.url, '_blank'); }
            else throw new Error(data.error || 'Failed');
          } catch(e) { alert('Share failed: ' + e.message); }
          setShareRosterLoading(false);
        };
        // Same model as the main-page filter: 'All' (empty) or a multi-select of types.
        const shareTypeOptions = ['All', ...types.filter(t => t !== 'All')];
        const PLURALS = { Artist: 'Artists', Producer: 'Producers', Songwriter: 'Songwriters', Composer: 'Composers', Mixer: 'Mixers', Remixer: 'Remixers' };
        const deriveTitle = sel => {
          if (sel.length === 1) return `Milk & Honey ${PLURALS[sel[0]] || sel[0] + 's'}`;
          return 'Milk & Honey Music';
        };
        const toggleShareType = t => {
          const next = t === 'All' ? [] : (shareRosterTypes.includes(t) ? shareRosterTypes.filter(x => x !== t) : [...shareRosterTypes, t]);
          setShareRosterTypes(next);
          setShareRosterTitle(deriveTitle(next));
        };
        const shareTypeActive = t => t === 'All' ? shareRosterTypes.length === 0 : shareRosterTypes.includes(t);


        const Toggle = ({ val, set, label }) => (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: G.textSecondary }}>{label}</span>
            <div onClick={() => set(v => !v)} style={{ width: 34, height: 19, borderRadius: 10, background: val ? G.green : G.surfaceBorderLight, position: "relative", cursor: "pointer", flexShrink: 0, transition: `background 0.2s ${G.ease}` }}>
              <div style={{ position: "absolute", top: 3, left: val ? 17 : 3, width: 13, height: 13, borderRadius: "50%", background: "#fff", transition: `left 0.2s ${G.ease}`, boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />
            </div>
          </div>
        );
        const DropBox = ({ label, value, children, open, onToggle }) => (
          <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column" }}>
            <div onClick={onToggle} style={{ background: G.surfaceRaised, border: `1px solid ${open ? G.green : G.surfaceBorder}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", transition: `border-color 0.15s ${G.ease}`, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: G.text, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: open ? "rotate(180deg)" : "none", transition: `transform 0.2s ${G.ease}`, flexShrink: 0 }}><path d="M6 9l6 6 6-6" stroke={G.textTertiary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
            {open && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: G.surfaceGlass, backdropFilter: "blur(16px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 12, padding: "10px 14px", zIndex: 10, boxShadow: G.shadowLg, display: "flex", flexDirection: "column", gap: 10 }}>
                {children}
              </div>
            )}
          </div>
        );

        return (
          <div onClick={e => { if (e.target === e.currentTarget) { setShareRosterOpen(false); setShareRosterUrl(null); setShareFeaturesOpen(false); } }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(20px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div style={{ background: "rgba(18,18,20,0.96)", backdropFilter: "blur(24px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 28, width: "100%", maxWidth: 520, boxShadow: G.shadowLg, overflow: "visible" }}>

              {/* Close */}
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 16px 0" }}>
                <button onClick={() => { setShareRosterOpen(false); setShareRosterUrl(null); setShareFeaturesOpen(false); }}
                  style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, color: G.textSecondary, cursor: "pointer", padding: "8px 14px", fontSize: 15, fontFamily: ff, lineHeight: 1 }}>✕</button>
              </div>

              <div style={{ padding: "12px 24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Title */}
                <input value={shareRosterTitle} onChange={e => setShareRosterTitle(e.target.value)}
                  style={{ ...inputBase, fontSize: 18, fontWeight: 600, padding: "14px 16px", borderRadius: 14, background: G.surfaceRaised }} />

                {/* Type toggles -- All + multi-select, same as the main roster filter */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {shareTypeOptions.map(t => {
                    const on = shareTypeActive(t);
                    return <button key={t} onClick={() => toggleShareType(t)}
                      style={{ padding: "9px 18px", border: `1.5px solid ${on ? G.green : G.surfaceBorder}`, borderRadius: 12, background: on ? G.greenSubtle : "transparent", color: on ? G.green : G.textSecondary, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, transition: `all 0.15s ${G.ease}` }}>
                      {t}
                    </button>;
                  })}
                </div>

                {/* Three dropboxes */}
                <div style={{ display: "flex", gap: 10, position: "relative", alignItems: "stretch" }}>
                  <DropBox label="Features" value="" open={shareFeaturesOpen === 'features'} onToggle={() => setShareFeaturesOpen(v => v === 'features' ? false : 'features')}>
                    <Toggle label="Logos" val={shareRosterShowLogos} set={setShareRosterShowLogos} />
                    <Toggle label="Credits" val={shareRosterShowCredits} set={setShareRosterShowCredits} />
                    <Toggle label="Bio" val={shareRosterShowBio} set={setShareRosterShowBio} />
                    <Toggle label="Contact" val={shareRosterShowContact} set={setShareRosterShowContact} />
                    <Toggle label="Music" val={shareRosterShowMusic} set={setShareRosterShowMusic} />
                  </DropBox>
                  <DropBox label="Sort" value="" open={shareFeaturesOpen === 'sort'} onToggle={() => setShareFeaturesOpen(v => v === 'sort' ? false : 'sort')}>
                    {[['default','Default'],['alpha','A--Z']].map(([val, lbl]) => (
                      <div key={val} onClick={() => { setShareRosterSort(val); setShareFeaturesOpen(false); }}
                        style={{ padding: "6px 0", fontSize: 13, fontWeight: shareRosterSort === val ? 700 : 400, color: shareRosterSort === val ? G.green : G.textSecondary, cursor: "pointer" }}>{lbl}</div>
                    ))}
                  </DropBox>
                  <DropBox label="Expires" value="" open={shareFeaturesOpen === 'expires'} onToggle={() => setShareFeaturesOpen(v => v === 'expires' ? false : 'expires')}>
                    {[['30','30 Days'],['90','90 Days'],['180','6 Months'],['never','Never']].map(([val, lbl]) => (
                      <div key={val} onClick={() => { setShareRosterExpiry(val); setShareFeaturesOpen(false); }}
                        style={{ padding: "6px 0", fontSize: 13, fontWeight: shareRosterExpiry === val ? 700 : 400, color: shareRosterExpiry === val ? G.green : G.textSecondary, cursor: "pointer" }}>{lbl}</div>
                    ))}
                  </DropBox>
                </div>

                {/* URL / Generate */}
                {shareRosterUrl ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                    <div style={{ flex: 1, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 14, padding: "14px 16px", fontSize: 13, color: G.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shareRosterUrl}</div>
                    <button onClick={() => { navigator.clipboard.writeText(shareRosterUrl); setShareRosterCopied(true); setTimeout(() => setShareRosterCopied(false), 2000); }}
                      style={{ background: shareRosterCopied ? G.green : "transparent", color: shareRosterCopied ? "#0a0a0a" : G.green, border: `1.5px solid ${G.green}`, borderRadius: 14, padding: "14px 22px", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap", transition: `all 0.2s ${G.ease}` }}>
                      {shareRosterCopied ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <button onClick={doShare} disabled={shareRosterLoading}
                    style={{ background: shareRosterLoading ? G.surfaceRaised : G.green, color: shareRosterLoading ? G.textTertiary : "#0a0a0a", border: "none", borderRadius: 14, padding: "14px", fontWeight: 700, fontSize: 15, cursor: shareRosterLoading ? "not-allowed" : "pointer", fontFamily: ff, transition: `all 0.2s ${G.ease}` }}>
                    {shareRosterLoading ? "Generating..." : "Generate Share Link"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit modal */}
      {editing && <ClientForm initial={editing} onSave={saveClient} onCancel={() => setEditing(null)} />}

      {/* Chat — temporarily disabled (component kept; re-enable by uncommenting) */}
      {/* {!loading && <FloatingChat clients={clients} isMobile={isMobile} />} */}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
