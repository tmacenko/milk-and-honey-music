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
function ViewFilterDropdown({ types, filterTypes, onToggleType, onAll, customCount, onOpenCustom, compact }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef();
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = () => { if (!open && ref.current) { const r = ref.current.getBoundingClientRect(); setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 228)) }); } setOpen(v => !v); };
  const active = customCount > 0 || filterTypes.length > 0;
  const label = customCount > 0 ? `Custom · ${customCount}` : (filterTypes.length ? filterTypes.join(', ') : 'All');
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
          {item(filterTypes.length === 0 && customCount === 0, 'All', () => onAll())}
          {typeOpts.map(t => item(customCount === 0 && filterTypes.includes(t), t, () => onToggleType(t)))}
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
          <div style={{ display: "flex", gap: isMobile ? 16 : 24, alignItems: "flex-end" }}>
            <div style={{ flexShrink: 0, width: avSize, height: avSize, borderRadius: "50%", overflow: "hidden", border: `2px solid ${G.surfaceBorderLight}` }}>
              <Avatar name={a.name} photoUrl={a.photoUrl} size={avSize} />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
              {/* Name + Contact button on one line (mirrors the music detail page). */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <h1 style={{ fontSize: isMobile ? 28 : 38, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", margin: 0, lineHeight: 1.05, flex: 1, minWidth: 0 }}>{a.name}</h1>
                <a href={`mailto:marketing@milkhoneysports.com?subject=${encodeURIComponent('Partnership inquiry — ' + a.name)}`}
                  style={{ display: "flex", alignItems: "center", gap: 7, background: G.greenSubtle, border: `1.5px solid ${G.green}`, borderRadius: 10, padding: isMobile ? "8px 10px" : "9px 14px", textDecoration: "none", flexShrink: 0, marginTop: 4 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" stroke={G.green} strokeWidth="2"/><path d="m22 6-10 7L2 6" stroke={G.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  {!isMobile && <span style={{ fontSize: 13, fontWeight: 600, color: G.green }}>Contact</span>}
                </a>
              </div>
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
  const toggle = () => { if (!open && ref.current) { const r = ref.current.getBoundingClientRect(); setPos({ top: r.bottom + 6, right: window.innerWidth - r.right }); } setOpen(v => !v); };
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
  const glowRef = useRef(null);
  const inputRef = useRef(null);

  // Only devices with a real pointer (mouse) get the cursor-trailing glow; on
  // touch it's meaningless and the per-frame blurred-layer composite is what made
  // the page lag on phones.
  const canHover = useMemo(() => typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches, []);

  // Soft glow that trails the cursor, eased toward the pointer each frame.
  useEffect(() => {
    if (!canHover) return;
    let raf, tx = window.innerWidth * 0.5, ty = window.innerHeight * 0.5, cx = tx, cy = ty;
    const onMove = e => { tx = e.clientX; ty = e.clientY; };
    window.addEventListener('pointermove', onMove);
    const tick = () => {
      cx += (tx - cx) * 0.045; cy += (ty - cy) * 0.045;
      if (glowRef.current) glowRef.current.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, [canHover]);

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

  // The animated background never changes with pending/password/error state,
  // so build it once — React bails out of reconciling it on every keystroke.
  const background = useMemo(() => {
    // Keep the blur radius SMALL — big blur() radii force per-frame rasterization
    // that blocks the main thread (laggy hover/typing). The radial gradients are
    // already soft, so a light blur is all that's needed to blend them.
    const blob = (extra) => ({
      position: "absolute", borderRadius: "50%", filter: "blur(14px)",
      willChange: "transform", backfaceVisibility: "hidden", pointerEvents: "none", ...extra,
    });
    return (
      <>
        <style>{`
          @keyframes mhGrad1{0%,100%{transform:translate3d(-6vw,-4vw,0)}50%{transform:translate3d(10vw,8vw,0)}}
          @keyframes mhGrad2{0%,100%{transform:translate3d(8vw,10vw,0)}50%{transform:translate3d(-9vw,-7vw,0)}}
          @keyframes mhGrad3{0%,100%{transform:translate3d(7vw,-8vw,0)}50%{transform:translate3d(-10vw,9vw,0)}}
          @keyframes mhLandIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        `}</style>
        {/* Free-flowing gradient field — translate-only animation stays on the GPU compositor */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={blob({ width: "60vw", height: "60vw", top: "-12vw", left: "-8vw", background: "radial-gradient(circle, rgba(62,170,120,0.5), transparent 62%)", animation: "mhGrad1 26s ease-in-out infinite" })} />
          <div style={blob({ width: "64vw", height: "64vw", bottom: "-18vw", right: "-14vw", background: "radial-gradient(circle, rgba(52,150,110,0.55), transparent 60%)", animation: "mhGrad2 32s ease-in-out infinite" })} />
          {/* Third blob + cursor glow only on hover-capable devices — keeps phones light. */}
          {canHover && <div style={blob({ width: "44vw", height: "44vw", top: "28vh", left: "34vw", background: "radial-gradient(circle, rgba(46,120,96,0.4), transparent 64%)", animation: "mhGrad3 29s ease-in-out infinite" })} />}
        </div>
        {canHover && <div ref={glowRef} style={{ position: "absolute", top: 0, left: 0, width: "38vw", height: "38vw", borderRadius: "50%", filter: "blur(18px)", pointerEvents: "none", background: "radial-gradient(circle, rgba(62,170,120,0.28), transparent 62%)", willChange: "transform" }} />}
        {/* Vignette to keep edges black */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)", pointerEvents: "none" }} />
      </>
    );
  }, [canHover]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ff, zIndex: 5000 }}>
      {background}

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
  // Front-door gate (shared site password). Deep links to a one-sheet bypass it so
  // public share links keep working; otherwise it persists once unlocked.
  const [gateUnlocked, setGateUnlocked] = useState(() => {
    try {
      if (localStorage.getItem('mh_gate') === '1') return true;
    } catch { /* ignore */ }
    const parts = decodeURIComponent(window.location.pathname).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    return parts[0] === 'sports' ? !!parts[1] : !!parts[0];
  });
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
      .then(d => { setAthletes(d.athletes || []); setAthletesLoaded(true); })
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
      .then(d => { setClients(d.clients || []); setLogos(d.logos || {}); setStaff(d.staff || {}); setIsAdmin(!!d.isAdmin); setAuthConfigured(!!d.authConfigured); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
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

  // Generate a hosted interactive share link from the current filtered roster.
  const generateShareLink = async (expiry) => {
    setShareRosterLoading(true); setShareRosterUrl(null);
    try {
      const mapped = domain === 'sports' ? filteredAthletes.map(a => {
        const team = a.nflTeam || a.college || '';
        return {
          name: a.name, level: a.level || 'Athlete', photoUrl: a.photoUrl,
          logoUrl: a.teamLogo, types: [a.position, team].filter(Boolean),
          position: a.position, team, bio: a.bio,
          instagram: a.instagram, twitter: a.twitter, tiktok: a.tiktok,
          igFollowers: a.igFollowers, twitterFollowers: a.twitterFollowers, tiktokFollowers: a.tiktokFollowers,
          brands: a.brands, interests: a.interests,
        };
      }) : filtered.map(c => ({
        name: c.name, types: c.types, level: (c.types || [])[0] || 'Client',
        photoUrl: c.photoUrl,
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
      }));
      const expiresAt = expiry !== 'never' ? new Date(Date.now() + parseInt(expiry) * 864e5).toISOString() : null;
      const resp = await fetch('/api/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'roster-share', title: rosterTitle(), athletes: mapped, expiresAt }),
      });
      const data = await resp.json();
      if (data.url) setShareRosterUrl(data.url);
      else throw new Error(data.error || 'Failed');
    } catch (e) { alert('Share failed: ' + e.message); }
    setShareRosterLoading(false);
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
    // A custom group overrides the type/contact/label/country filters (search still narrows).
    if (customGroup.length > 0) {
      const q = search.toLowerCase();
      return clients
        .filter(c => customGroup.includes(c.name))
        .filter(c => !search || c.name.toLowerCase().includes(q))
        .sort((a, b) => customGroup.indexOf(a.name) - customGroup.indexOf(b.name));
    }
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
  }, [clients, filterTypes, filterContact, filterLabel, filterCountry, search, clientSort, customGroup]);

  const filteredAthletes = useMemo(() => {
    if (customGroup.length > 0) {
      const q = search.toLowerCase();
      return athletes
        .filter(a => customGroup.includes(a.name))
        .filter(a => !search || a.name.toLowerCase().includes(q))
        .sort((a, b) => customGroup.indexOf(a.name) - customGroup.indexOf(b.name));
    }
    const list = athletes.filter(a => {
      if (sportsLevel !== 'All' && a.level !== sportsLevel) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || (a.position || '').toLowerCase().includes(q) ||
          (a.nflTeam || '').toLowerCase().includes(q) || (a.college || '').toLowerCase().includes(q);
      }
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
  }, [athletes, sportsLevel, search, customGroup, clientSort]);

  const saveClient = (updatedClient) => {
    setClients(prev => {
      const idx = prev.findIndex(c => c.name === updatedClient.name);
      if (idx >= 0) { const next = [...prev]; next[idx] = updatedClient; return next; }
      return [...prev, updatedClient];
    });
    setEditing(null);
    if (view === 'detail') setSelected(updatedClient);
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
  const viewFilter = domain === 'sports' ? (
    <ViewFilterDropdown compact={isMobile} types={['All', 'NFL', 'College', 'High School']}
      filterTypes={sportsLevel === 'All' ? [] : [sportsLevel]}
      onToggleType={(t) => { clearCustomGroup(); setSportsLevel(prev => prev === t ? 'All' : t); }}
      onAll={() => { clearCustomGroup(); setSportsLevel('All'); }}
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
              {selected && pdfBtn(() => domain === 'sports' ? downloadAthletePdf(selected) : downloadClientPdf(selected), null)}
              {authBtn}
              {domain === 'music' && isAdmin && <button onClick={() => setEditing(selected)} style={{ background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Edit</button>}
              <button onClick={() => setView('roster')} style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 12px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>✕</button>
            </div>
          ) : (
            <div style={{ flexShrink: 0, position: "sticky", top: 0, zIndex: 40, background: G.bg }}>
              {/* Row 1: logo (left) + export + profile (right) — always just these three */}
              <div style={{ padding: "14px 16px 10px", display: "flex", gap: 8, alignItems: "center" }}>
                <img src="https://www.milkhoneyla.com/wp-content/uploads/2024/05/cropped-MH-Logo.png" alt="Milk & Honey" onClick={() => setView('roster')} style={{ height: 28, objectFit: "contain", flexShrink: 0, cursor: "pointer" }} />
                <div style={{ flex: 1 }} />
                {exportControl(true)}
                {authBtnMobile}
              </div>
              {/* Row 2: domain + view + sort + layout + search — one line (scrolls if tight) */}
              <div style={{ padding: "0 16px 12px" }}>
                {mobileSearchOpen ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: G.surfaceRaised, border: `1px solid ${G.green}`, borderRadius: 12, padding: "10px 14px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke={G.textTertiary} strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke={G.textTertiary} strokeWidth="2" strokeLinecap="round"/></svg>
                    <input ref={searchRef} autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder={domain === 'sports' ? "Search athletes..." : "Search clients..."}
                      style={{ background: "none", border: "none", outline: "none", fontSize: 16, color: G.text, fontFamily: ff, flex: 1, minWidth: 0 }} />
                    <button onClick={() => { setMobileSearchOpen(false); setSearch(''); }} style={{ background: "none", border: "none", color: G.textSecondary, cursor: "pointer", fontSize: 16, padding: 0, fontFamily: ff }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {domainToggle}
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
                {selected && pdfBtn(() => domain === 'sports' ? downloadAthletePdf(selected) : downloadClientPdf(selected), 'PDF')}
                {authBtn}
                {domain === 'music' && isAdmin && <button onClick={() => setEditing(selected)} style={{ background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Edit</button>}
                <button onClick={() => setView('roster')} style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 12px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>✕</button>
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
                {exportControl()}
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
                  ) : rosterView === 'detailed' ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
                      {filteredAthletes.map((a, i) => (
                        <DetailedAthleteCard key={a.id || i} athlete={a} isMobile={isMobile} onClick={() => setView('detail', a)} />
                      ))}
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


      {/* Custom group picker */}
      {customGroupOpen && (
        <CustomGroupPicker items={customItems} selected={customGroup} groupTitle={customGroupTitle}
          onToggle={toggleCustomMember} onClear={clearCustomGroup} onClose={() => setCustomGroupOpen(false)}
          onSmartSearch={smartGroup} domain={domain} isAdmin={isAdmin} />
      )}

      {/* Edit modal */}
      {editing && <ClientForm initial={editing} onSave={saveClient} onCancel={() => setEditing(null)} />}

      {/* Chat — temporarily disabled (component kept; re-enable by uncommenting) */}
      {/* {!loading && <FloatingChat clients={clients} isMobile={isMobile} />} */}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
