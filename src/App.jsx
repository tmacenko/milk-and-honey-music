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
      referrerPolicy="no-referrer" crossOrigin="anonymous"
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
  name: '', types: [], contact: '', city: '', state: '', country: '',
  pro: '', publisher: '', label: '', credits: [], bio: '', photoUrl: '',
  instagram: '', twitter: '', tiktok: '', spotifyMonthly: '',
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
  spotifyTopTracks: c.spotifyTopTracks?.map(t => t.name),
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
      <div style={{ position: "fixed", ...(isMobile ? { inset: 0 } : { bottom: 86, right: 24, width: 380, height: 520, borderRadius: 18 }), background: G.surfaceGlass, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: `1px solid ${G.surfaceBorderLight}`, display: "flex", flexDirection: "column", zIndex: 999, boxShadow: G.shadow, overflow: "hidden", transition: `all 0.2s ${G.ease}` }}>
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
            placeholder="Ask about your clients..." style={{ flex: 1, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, color: G.text, fontFamily: ff, outline: "none" }} />
          <button onClick={send} disabled={!input.trim() || loading} style={{ background: input.trim() && !loading ? G.green : G.surfaceRaised, color: input.trim() && !loading ? "#0a0a0a" : G.textTertiary, border: "none", borderRadius: 10, width: 36, height: 36, cursor: input.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: `all .15s` }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
      <button onClick={() => setOpen(false)} style={{ position: "fixed", bottom: 24, right: 24, width: 52, height: 52, borderRadius: 26, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, cursor: "pointer", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", transition: `all 0.22s ${G.ease}` }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke={G.textSecondary} strokeWidth="2.2" strokeLinecap="round"/></svg>
      </button>
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

  const typeOptions = ['Songwriter', 'Producer', 'Artist'];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(20px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: G.surfaceGlass, backdropFilter: "blur(24px)", border: `1px solid ${G.surfaceBorderLight}`, borderRadius: 22, width: "100%", maxWidth: 600, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: G.shadowLg }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: G.text }}>{isNew ? 'Add Client' : 'Edit Client'}</span>
          <button onClick={onCancel} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, color: G.textSecondary, cursor: "pointer", padding: "7px 12px", fontSize: 14, fontFamily: ff }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "20px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
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
              <Field label="Bio"><Textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={4} /></Field>
            </div>
            <Field label="Instagram"><Input value={form.instagram} onChange={e => set('instagram', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            <Field label="Twitter / X"><Input value={form.twitter} onChange={e => set('twitter', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            <Field label="TikTok"><Input value={form.tiktok} onChange={e => set('tiktok', e.target.value.replace(/^@/,''))} placeholder="handle" /></Field>
            <Field label="Spotify Monthly Listeners"><Input value={form.spotifyMonthly} onChange={e => set('spotifyMonthly', e.target.value)} placeholder="1.2M" /></Field>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Spotify Artist ID"><Input value={form.spotifyId} onChange={e => set('spotifyId', e.target.value)} placeholder="For future API pulls" /></Field>
            </div>
            <Field label="Spotify URL"><Input value={form.spotifyUrl} onChange={e => set('spotifyUrl', e.target.value)} placeholder="https://open.spotify.com/artist/..." /></Field>
            <Field label="Apple Music URL"><Input value={form.appleMusicUrl} onChange={e => set('appleMusicUrl', e.target.value)} placeholder="https://music.apple.com/..." /></Field>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Notes (internal)"><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></Field>
            </div>
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
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {dedupedFlags.length > 0 && <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{dedupedFlags.map(co => flag(co)).join(' ')}</span>}
            {[...(c.types || [])].sort((a,b) => a==='Artist'?-1:b==='Artist'?1:a.localeCompare(b)).map(t => <TypePill key={t} type={t} />)}
          </div>
          {logoList.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {logoList.map((l, i) => <LogoBadge key={i} url={l.url} label={l.label} size={28} />)}
            </div>
          )}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke={G.textTertiary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    );
  }

  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? G.surfaceRaised : G.surface, border: `1px solid ${hov ? G.surfaceBorderLight : G.surfaceBorder}`, borderRadius: 18, overflow: "hidden", cursor: "pointer", transition: `all 0.2s ${G.ease}`, transform: hov ? "translateY(-2px)" : "none", boxShadow: hov ? G.shadowLg : G.shadow, display: "flex", flexDirection: "column", position: "relative" }}>

      <div style={{ padding: "18px 18px 14px", flex: 1 }}>
        <Avatar name={c.name} photoUrl={c.photoUrl} size={80} />
        <div style={{ fontWeight: 800, fontSize: 20, color: G.text, letterSpacing: "-0.03em", marginTop: 14, marginBottom: 8, lineHeight: 1.2 }}>{c.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {dedupedFlags.length > 0 && <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{dedupedFlags.map(co => flag(co)).join(' ')}</span>}
          {[...(c.types || [])].sort((a,b) => a==='Artist'?-1:b==='Artist'?1:a.localeCompare(b)).map(t => <TypePill key={t} type={t} />)}
        </div>
        {logoList.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {logoList.map((l, i) => <LogoBadge key={i} url={l.url} label={l.label} size={42} />)}
          </div>
        )}
        {c.spotifyLatestRelease?.artwork && (
          <div style={{ position: "absolute", bottom: 14, right: 14 }}>
            <img src={c.spotifyLatestRelease.artwork} alt={c.spotifyLatestRelease.name}
              style={{ width: 42, height: 42, borderRadius: 6, objectFit: "cover", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }} />
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
  const locationEl = (() => {
    const locs = [
      { city: c.city, state: c.state, country: c.country },
      { city: c.city2, state: c.state2, country: c.country2 },
      { city: c.city3, state: c.state3, country: c.country3 },
    ].filter(l => l.city || l.country);
    if (!locs.length) return null;
    const seen = new Set();
    // Collect unique flags
    const flags = locs.map(l => flag(l.country)).filter(f => { if (!f || seen.has(f)) return false; seen.add(f); return true; });
    // All city strings
    const cities = locs.map(l => [l.city, l.state].filter(Boolean).join(', ')).filter(Boolean);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        {flags.length > 0 && <span style={{ fontSize: 16 }}>{flags.join(' ')}</span>}
        <span style={{ fontSize: 14, color: G.textSecondary }}>{cities.join(' \u00b7 ')}</span>
      </div>
    );
  })();

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
    c.instagram && { icon: <IgIcon size={isMobile ? 18 : 14} />, label: `@${c.instagram}`, url: `https://instagram.com/${c.instagram}` },
    c.twitter && { icon: <TwIcon size={isMobile ? 18 : 14} />, label: `@${c.twitter}`, url: `https://x.com/${c.twitter}` },
    c.tiktok && { icon: <TkIcon size={isMobile ? 18 : 14} />, label: `@${c.tiktok}`, url: `https://tiktok.com/@${c.tiktok}` },
    c.spotifyUrl && { icon: <SpotifyIcon size={isMobile ? 18 : 14} />, label: 'Spotify', url: c.spotifyUrl },
    c.appleMusicUrl && { icon: <svg width={isMobile ? 18 : 14} height={isMobile ? 18 : 14} viewBox="0 0 24 24" fill="currentColor"><path d="M23.997 6.124c0-.738-.065-1.47-.24-2.19-.317-1.307-1.062-2.31-2.18-3.043C21.003.517 20.373.285 19.7.164c-.517-.093-1.043-.137-1.568-.152-.038-.002-.076-.01-.114-.013H5.981c-.152.01-.303.017-.454.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208A5.49 5.49 0 00.05 5.09C.035 5.694.03 6.3.03 6.907v10.276c0 .681-.01 1.364.018 2.045.055 1.516.56 2.797 1.578 3.847.01.01.017.024.027.033.02.023.04.047.06.07.45.503.987.908 1.582 1.21.704.35 1.46.508 2.244.55.464.026.927.03 1.393.03H18.55c.37 0 .74-.005 1.112-.02 1.23-.045 2.327-.39 3.25-1.164.94-.79 1.547-1.79 1.842-2.97.135-.535.185-1.084.196-1.632.013-.594.01-1.19.01-1.784V6.124zm-6.003 7.858c0 .658-.528 1.19-1.18 1.19H7.166c-.652 0-1.18-.532-1.18-1.19V9.158c0-.658.528-1.19 1.18-1.19H16.8c.657 0 1.185.532 1.185 1.19l.01 4.824zm-5.03-6.93L9.2 8.698v2.046l3.764-1.542V6.053zm0 2.456L9.2 10.065v2.045l3.764-1.542V8.51zm0 2.456L9.2 12.52v2.046l3.764-1.542v-2.057z"/></svg>, label: 'Apple Music', url: c.appleMusicUrl },
    c.soundcloudUrl && { icon: <svg width={isMobile ? 18 : 14} height={isMobile ? 18 : 14} viewBox="0 0 24 24" fill="currentColor"><path d="M11.56 8.87V17h8.76c1-.09 1.68-.64 1.68-1.54 0-.8-.63-1.46-1.43-1.5-.2 0-.4.04-.57.1-.1-2.17-1.9-3.91-4.1-3.91-.65 0-1.27.15-1.82.44-.28-1.46-1.58-2.57-3.12-2.57-.99 0-1.88.43-2.5 1.12A3.2 3.2 0 006.5 9C4.57 9 3 10.57 3 12.5S4.57 16 6.5 16h5.06V8.87h0z"/></svg>, label: 'SoundCloud', url: c.soundcloudUrl },
  ].filter(Boolean);

  if (isMobile) return (
    <div style={{ flex: 1, overflow: "auto", paddingBottom: 24 }}>
      <div style={{ padding: "20px 16px 16px", borderBottom: `1px solid ${G.surfaceBorder}` }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flexShrink: 0, width: 90, height: 90, borderRadius: "50%", overflow: "hidden", border: `2px solid ${G.surfaceBorderLight}` }}>
            <Avatar name={c.name} photoUrl={c.photoUrl} size={90} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: G.text, letterSpacing: "-0.03em", margin: "0 0 8px", lineHeight: 1.1 }}>{c.name}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {[...(c.types || [])].sort((a,b) => a==='Artist'?-1:b==='Artist'?1:a.localeCompare(b)).map(t => <TypePill key={t} type={t} />)}
            </div>
            {locationEl}
          </div>
        </div>
        {socialBtns.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
            {socialBtns.map((btn, i) => (
              <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "12px 16px", textDecoration: "none" }}>
                <span style={{ color: G.textSecondary, display: "flex" }}>{btn.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: G.text }}>{btn.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: "18px 16px", display: "flex", flexDirection: "column", gap: 18 }}>
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
        {c.credits?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {c.credits.map((cr, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 20, padding: "7px 16px", fontSize: 14, fontWeight: 500, color: G.textSecondary }}>{cr}</span>)}
          </div>
        )}
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
        {c.contact && (
          <a href={contactMailto} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "transparent", border: `1.5px solid ${G.green}`, borderRadius: 14, padding: "16px", textDecoration: "none", marginTop: 4 }}>
            <span style={{ color: G.green, display: "flex" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></span>
            <span style={{ fontSize: 15, fontWeight: 700, color: G.green }}>Contact Milk &amp; Honey Rep ({c.contact})</span>
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <div style={{ padding: "28px 32px 24px", borderBottom: `1px solid ${G.surfaceBorder}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
          <div style={{ flexShrink: 0, width: 120, height: 120, borderRadius: "50%", overflow: "hidden", border: `2px solid ${G.surfaceBorderLight}` }}>
            <Avatar name={c.name} photoUrl={c.photoUrl} size={120} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 38, fontWeight: 800, color: G.text, letterSpacing: "-0.04em", margin: "0 0 10px", lineHeight: 1.05 }}>{c.name}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
              {[...(c.types || [])].sort((a,b) => a==='Artist'?-1:b==='Artist'?1:a.localeCompare(b)).map(t => <TypePill key={t} type={t} />)}
            </div>
            {locationEl}
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              {socialBtns.map((btn, i) => actionBtn(
                <><span style={{ color: G.textSecondary, display:"flex" }}>{btn.icon}</span><span style={{ fontSize: 13, fontWeight: 600, color: G.text }}>{btn.label}</span></>,
                btn.url, false
              ))}
              {c.contact && actionBtn(
                <><span style={{ color: G.green, display:"flex" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></span>
                <span style={{ fontSize: 13, fontWeight: 600, color: G.green }}>Contact Milk &amp; Honey Rep ({c.contact})</span></>,
                contactMailto, true
              )}
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
        {c.bio && <p style={{ fontSize: 14, color: G.textSecondary, lineHeight: 1.7, margin: 0 }}>{c.bio}</p>}
        {c.credits?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {c.credits.map((cr, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, padding: "5px 14px", fontSize: 13, fontWeight: 500, color: G.textSecondary }}>{cr}</span>)}
          </div>
        )}
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

        {c.spotifyLatestRelease && (
          <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 12 }}>Latest Release</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {c.spotifyLatestRelease.artwork && <img src={c.spotifyLatestRelease.artwork} alt={c.spotifyLatestRelease.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>{c.spotifyLatestRelease.name}</div>
                <div style={{ fontSize: 12, color: G.textSecondary, marginTop: 3, textTransform: "capitalize" }}>{c.spotifyLatestRelease.type} · {c.spotifyLatestRelease.releaseDate?.slice(0,4)}</div>
                {c.spotifyLatestRelease.url && <a href={c.spotifyLatestRelease.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: G.green, textDecoration: "none", marginTop: 4, display: "inline-block" }}>Listen on Spotify ↗</a>}
              </div>
            </div>
          </div>
        )}

        {c.spotifyTopTracks?.length > 0 && (
          <div style={{ background: G.surface, border: `1px solid ${G.surfaceBorder}`, borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 12 }}>Top Tracks</div>
            {c.spotifyTopTracks.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < c.spotifyTopTracks.length - 1 ? `1px solid ${G.surfaceBorder}` : "none" }}>
                <span style={{ fontSize: 11, color: G.textTertiary, fontWeight: 600, width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                {t.artwork && <img src={t.artwork} alt={t.album} style={{ width: 34, height: 34, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: G.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: G.textSecondary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.album}</div>
                </div>
                {t.url && <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ color: G.textTertiary, textDecoration: "none", flexShrink: 0, display: "flex" }} onMouseEnter={e=>e.currentTarget.style.color=G.green} onMouseLeave={e=>e.currentTarget.style.color=G.textTertiary}><SpotifyIcon size={14} /></a>}
              </div>
            ))}
          </div>
        )}

        {c.spotifyGenres?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {c.spotifyGenres.map((g, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 500, color: G.textSecondary, textTransform: "capitalize" }}>{g}</span>)}
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
  // URL-based navigation -- persist state across refresh and enable browser back
  const getClientFromUrl = (clients) => {
    const id = new URLSearchParams(window.location.search).get('client');
    return id ? clients.find(c => c.id === id) || null : null;
  };
  const [view, setViewState] = useState(() => window.location.search.includes('client=') ? 'detail' : 'roster');
  const [selected, setSelected] = useState(null);

  const setView = (v, client) => {
    if (v === 'detail' && client) {
      window.history.pushState({ view: 'detail', clientId: client.id }, '', `?client=${client.id}`);
      setSelected(client);
      setViewState('detail');
    } else {
      window.history.pushState({ view: 'roster' }, '', window.location.pathname);
      setViewState('roster');
    }
  };
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const onPop = (e) => {
      const id = new URLSearchParams(window.location.search).get('client');
      if (id && clients.length) {
        const c = clients.find(c => c.id === id);
        if (c) { setSelected(c); setViewState('detail'); return; }
      }
      setViewState('roster');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [clients]);

  // On load, if URL has a client param, select it once clients load
  useEffect(() => {
    if (!clients.length) return;
    const id = new URLSearchParams(window.location.search).get('client');
    if (id) {
      const c = clients.find(c => c.id === id);
      if (c) { setSelected(c); setViewState('detail'); }
    }
  }, [clients]);
  const [shareRosterOpen, setShareRosterOpen] = useState(false);
  const [shareRosterUrl, setShareRosterUrl] = useState(null);
  const [shareRosterCopied, setShareRosterCopied] = useState(false);
  const [shareRosterLoading, setShareRosterLoading] = useState(false);
  const [shareRosterTitle, setShareRosterTitle] = useState('Milk & Honey Music — Client Roster');
  const [shareRosterTypes, setShareRosterTypes] = useState(['Songwriter','Producer','Artist']);
  const [shareRosterSort, setShareRosterSort] = useState('default');
  const [shareRosterExpiry, setShareRosterExpiry] = useState('90');
  const [shareRosterShowLogos, setShareRosterShowLogos] = useState(true);
  const [shareRosterShowCredits, setShareRosterShowCredits] = useState(true);
  const [shareRosterShowBio, setShareRosterShowBio] = useState(true);
  const [shareFeaturesOpen, setShareFeaturesOpen] = useState(false);

  useEffect(() => {
    fetch('/api/sheets')
      .then(r => r.json())
      .then(d => { setClients(d.clients || []); setLogos(d.logos || {}); setStaff(d.staff || {}); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const types = useMemo(() => {
    const all = new Set();
    clients.forEach(c => (c.types || []).forEach(t => all.add(t)));
    const sorted = Array.from(all).sort((a, b) => {
      if (a === 'Artist') return -1; if (b === 'Artist') return 1;
      return a.localeCompare(b);
    });
    return ['All', ...sorted];
  }, [clients]);

  const filtered = useMemo(() => {
    return clients.filter(c => {
      if (filterType !== 'All' && !(c.types || []).includes(filterType)) return false;
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
  }, [clients, filterType, search]);

  const saveClient = (updatedClient) => {
    setClients(prev => {
      const idx = prev.findIndex(c => c.name === updatedClient.name);
      if (idx >= 0) { const next = [...prev]; next[idx] = updatedClient; return next; }
      return [...prev, updatedClient];
    });
    setEditing(null);
    if (view === 'detail') setSelected(updatedClient);
  };



  return (
    <div style={{ display: "flex", minHeight: "100vh", background: G.bg, color: G.text, fontFamily: ff }}>
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
              <button onClick={() => setEditing(selected)} style={{ background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Edit</button>
              <button onClick={() => setView('roster')} style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 12px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>✕</button>
            </div>
          ) : (
            <div style={{ flexShrink: 0 }}>
              {/* Logo centered */}
              <div style={{ display: "flex", justifyContent: "center", padding: "16px 16px 12px" }}>
                <img src="https://www.milkhoneyla.com/wp-content/uploads/2024/05/cropped-MH-Logo.png" alt="Milk & Honey" style={{ height: 36, objectFit: "contain" }} />
              </div>
              {/* Search + filter icon */}
              <div style={{ padding: "0 16px 10px", display: "flex", gap: 8 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "10px 14px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke={G.textTertiary} strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke={G.textTertiary} strokeWidth="2" strokeLinecap="round"/></svg>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..."
                    style={{ background: "none", border: "none", outline: "none", fontSize: 15, color: G.text, fontFamily: ff, flex: 1 }} />
                </div>
                <button onClick={() => { setShareRosterOpen(true); setShareRosterUrl(null); }}
                  style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "10px 14px", cursor: "pointer", color: G.textSecondary, fontFamily: ff, display: "flex", alignItems: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
                <button onClick={() => setEditing({ ...BLANK })} style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 12, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap" }}>+ Add</button>
              </div>
              {/* Type filters scrollable row */}
              <div style={{ overflowX: "auto", display: "flex", gap: 8, padding: "0 16px 12px", scrollbarWidth: "none" }}>
                {types.map(t => (
                  <button key={t} onClick={() => setFilterType(t)}
                    style={{ padding: "8px 16px", borderRadius: 20, border: `1.5px solid ${filterType === t ? G.green : G.surfaceBorder}`, background: filterType === t ? G.greenSubtle : "transparent", color: filterType === t ? G.green : G.textSecondary, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: ff, whiteSpace: "nowrap", flexShrink: 0, transition: `all 0.15s ${G.ease}` }}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ height: 1, background: G.surfaceBorder }} />
            </div>
          )
        ) : (
          // ── Desktop header ────────────────────────────────────────────────
          <div style={{ padding: "12px 24px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
            <img src="https://www.milkhoneyla.com/wp-content/uploads/2024/05/cropped-MH-Logo.png" alt="Milk & Honey" style={{ height: 28, objectFit: "contain", flexShrink: 0 }} />
            <div style={{ width: 1, height: 18, background: G.surfaceBorder, flexShrink: 0 }} />
            {view === 'detail' ? (
              <>
                <div style={{ flex: 1 }} />
                <button onClick={() => setEditing(selected)} style={{ background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Edit</button>
                <button onClick={() => setView('roster')} style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 12px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: ff }}>✕</button>
              </>
            ) : (
              <>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..."
                  style={{ ...inputBase, width: 220, padding: "8px 12px", flexShrink: 0 }} />
                <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
                  {types.map(t => (
                    <button key={t} onClick={() => setFilterType(t)}
                      style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${filterType === t ? G.green : G.surfaceBorder}`, background: filterType === t ? G.greenSubtle : G.surfaceRaised, color: filterType === t ? G.green : G.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff, transition: `all 0.15s ${G.ease}` }}>
                      {t}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setShareRosterOpen(true); setShareRosterUrl(null); }}
                  style={{ background: G.surfaceRaised, color: G.text, border: `1px solid ${G.surfaceBorder}`, borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: ff, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Share
                </button>
                <button onClick={() => setEditing({ ...BLANK })} style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff, flexShrink: 0 }}>+ Add Client</button>
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 14 }}>
              <span style={{ fontSize: 24, animation: "spin 1s linear infinite", display: "inline-block", color: G.textTertiary }}>⟳</span>
              <span style={{ fontSize: 13, color: G.textTertiary }}>Loading clients...</span>
            </div>
          )}
          {error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 10, textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 22, color: G.red }}>!</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: G.text }}>Could not load clients</div>
              <div style={{ fontSize: 13, color: G.textSecondary }}>{error}</div>
            </div>
          )}

          {!loading && !error && view === 'detail' && selected && (
            <ClientDetail client={selected} logos={logos} staff={staff} isMobile={isMobile} onBack={() => setView('roster')} onEdit={() => setEditing(selected)} />
          )}

          {!loading && !error && view === 'roster' && (
            <div style={{ padding: isMobile ? "0 0 80px" : "20px 24px 48px" }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px 32px", color: G.textTertiary }}>
                  <div style={{ fontSize: 15 }}>{search || filterType !== 'All' ? 'No clients match your filters.' : 'No clients yet. Add your first one.'}</div>
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
              instagram: c.instagram, twitter: c.twitter, tiktok: c.tiktok,
              spotifyUrl: c.spotifyUrl, spotifyMonthly: c.spotifyMonthly,
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
        const allTypes = ['Artist','Songwriter','Producer','Composer','Mixer'];


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

                {/* Type pills */}
                <div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {allTypes.map(t => {
                      const on = shareRosterTypes.includes(t);
                      return <button key={t} onClick={() => {
                        const next = on ? shareRosterTypes.filter(x => x !== t) : [...shareRosterTypes, t];
                        if (next.length > 0) setShareRosterTypes(next);
                      }} style={{ padding: "10px 20px", border: `1.5px solid ${on ? G.green : G.surfaceBorder}`, borderRadius: 12, background: on ? G.greenSubtle : "transparent", color: on ? G.green : G.textSecondary, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: ff, transition: `all 0.15s ${G.ease}` }}>
                        {t}
                      </button>;
                    })}
                  </div>

                </div>

                {/* Three dropboxes */}
                <div style={{ display: "flex", gap: 10, position: "relative", alignItems: "stretch" }}>
                  <DropBox label="Features" value="" open={shareFeaturesOpen === 'features'} onToggle={() => setShareFeaturesOpen(v => v === 'features' ? false : 'features')}>
                    <Toggle label="Logos" val={shareRosterShowLogos} set={setShareRosterShowLogos} />
                    <Toggle label="Credits" val={shareRosterShowCredits} set={setShareRosterShowCredits} />
                    <Toggle label="Bio" val={shareRosterShowBio} set={setShareRosterShowBio} />
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

      {/* Chat */}
      {!loading && <FloatingChat clients={clients} isMobile={isMobile} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
