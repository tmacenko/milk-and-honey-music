// Milk & Honey Music — Client Management
// API: /api/music (music-sheets.js), /api/share (share.js)

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';

// ── Design tokens ─────────────────────────────────────────────────────────────
const G = {
  green: "#3eaa78", greenSubtle: "rgba(62,170,120,0.09)", greenBorder: "rgba(62,170,120,0.3)",
  greenShadow: "0 0 20px rgba(62,170,120,0.18)",
  bg: "#080809", surface: "#111113", surfaceRaised: "#18181b",
  surfaceGlass: "rgba(17,17,19,0.85)",
  surfaceBorder: "#1e1e22", surfaceBorderLight: "#28282d",
  text: "#f4f4f5", textSecondary: "#71717a", textTertiary: "#3f3f46",
  shadow: "0 1px 2px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.35)",
  shadowLg: "0 4px 12px rgba(0,0,0,0.7), 0 20px 60px rgba(0,0,0,0.5)",
  ease: "cubic-bezier(0.4,0,0.2,1)",
  yellow: "#d97706", red: "#dc2626",
};
const ff = "-apple-system,'SF Pro Display','Helvetica Neue',sans-serif";

// ── Country flags (emoji) ─────────────────────────────────────────────────────
const FLAG = {
  "united states": "🇺🇸", "usa": "🇺🇸", "us": "🇺🇸",
  "united kingdom": "🇬🇧", "uk": "🇬🇧", "england": "🇬🇧",
  "canada": "🇨🇦", "australia": "🇦🇺", "germany": "🇩🇪",
  "france": "🇫🇷", "sweden": "🇸🇪", "norway": "🇳🇴",
  "denmark": "🇩🇰", "netherlands": "🇳🇱", "spain": "🇪🇸",
  "italy": "🇮🇹", "brazil": "🇧🇷", "mexico": "🇲🇽",
  "japan": "🇯🇵", "south korea": "🇰🇷", "new zealand": "🇳🇿",
  "ireland": "🇮🇪", "scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "belgium": "🇧🇪",
  "switzerland": "🇨🇭", "austria": "🇦🇹", "portugal": "🇵🇹",
  "south africa": "🇿🇦", "nigeria": "🇳🇬", "ghana": "🇬🇭",
  "jamaica": "🇯🇲", "trinidad": "🇹🇹",
};
const flag = c => FLAG[(c||'').toLowerCase().trim()] || '';

// ── Logo lookups (PRO, Publisher, Label) ──────────────────────────────────────
// Using publicly hosted SVG/PNG logos via CDN
const PRO_LOGOS = {
  "bmi":         "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/BMI_logo.svg/200px-BMI_logo.svg.png",
  "ascap":       "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/ASCAP_logo.svg/200px-ASCAP_logo.svg.png",
  "sesac":       "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/SESAC_logo.svg/200px-SESAC_logo.svg.png",
  "socan":       "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/SOCAN_logo.svg/200px-SOCAN_logo.svg.png",
  "prs":         "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/PRS_for_Music_logo.svg/200px-PRS_for_Music_logo.svg.png",
  "prs for music": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/PRS_for_Music_logo.svg/200px-PRS_for_Music_logo.svg.png",
  "apra amcos":  "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/APRA_AMCOS_logo.svg/200px-APRA_AMCOS_logo.svg.png",
  "sacem":       "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/SACEM_logo.svg/200px-SACEM_logo.svg.png",
};

const PUB_LOGOS = {
  "kobalt":      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Kobalt_Music_Group_logo.svg/200px-Kobalt_Music_Group_logo.svg.png",
  "sony music publishing": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Sony_Music_Publishing_logo.svg/200px-Sony_Music_Publishing_logo.svg.png",
  "sony":        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Sony_Music_Publishing_logo.svg/200px-Sony_Music_Publishing_logo.svg.png",
  "universal music publishing": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Universal_Music_Publishing_Group_logo.svg/200px-Universal_Music_Publishing_Group_logo.svg.png",
  "umpg":        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Universal_Music_Publishing_Group_logo.svg/200px-Universal_Music_Publishing_Group_logo.svg.png",
  "warner chappell": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Warner_Chappell_Music_logo.svg/200px-Warner_Chappell_Music_logo.svg.png",
  "bmg":         "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/BMG_logo_2013.svg/200px-BMG_logo_2013.svg.png",
  "bmg rights":  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/BMG_logo_2013.svg/200px-BMG_logo_2013.svg.png",
  "concord":     "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Concord_Music_Group_logo.svg/200px-Concord_Music_Group_logo.svg.png",
  "primary wave":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Primary_Wave_Music_logo.svg/200px-Primary_Wave_Music_logo.svg.png",
  "peermusic":   "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Peermusic_logo.svg/200px-Peermusic_logo.svg.png",
};

const LABEL_LOGOS = {
  "atlantic":    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Atlantic_Records_logo.svg/200px-Atlantic_Records_logo.svg.png",
  "columbia":    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Columbia_Records_logo.svg/200px-Columbia_Records_logo.svg.png",
  "republic":    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Republic_Records_logo.svg/200px-Republic_Records_logo.svg.png",
  "interscope":  "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Interscope_Records_logo.svg/200px-Interscope_Records_logo.svg.png",
  "def jam":     "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Def_Jam_Recordings_logo.svg/200px-Def_Jam_Recordings_logo.svg.png",
  "rca":         "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/RCA_Records_logo.svg/200px-RCA_Records_logo.svg.png",
  "capitol":     "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Capitol_Records_logo.svg/200px-Capitol_Records_logo.svg.png",
  "epic":        "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Epic_Records_logo.svg/200px-Epic_Records_logo.svg.png",
  "island":      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Island_Records_logo.svg/200px-Island_Records_logo.svg.png",
  "warner":      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Warner_Records_logo.svg/200px-Warner_Records_logo.svg.png",
  "motown":      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Motown_Records_logo.svg/200px-Motown_Records_logo.svg.png",
  "virgin":      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Virgin_Records_logo.svg/200px-Virgin_Records_logo.svg.png",
  "geffen":      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Geffen_Records_logo.svg/200px-Geffen_Records_logo.svg.png",
  "roc nation":  "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Roc_Nation_logo.svg/200px-Roc_Nation_logo.svg.png",
  "empire":      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Empire_Distribution_logo.svg/200px-Empire_Distribution_logo.svg.png",
  "300":         "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/300_Entertainment_logo.svg/200px-300_Entertainment_logo.svg.png",
};

function lookupLogo(map, val) {
  if (!val) return null;
  const key = val.toLowerCase().trim();
  return map[key] || Object.entries(map).find(([k]) => key.includes(k) || k.includes(key))?.[1] || null;
}

// ── Logo badge component ──────────────────────────────────────────────────────
function LogoBadge({ url, label, size = 32 }) {
  const [err, setErr] = useState(false);
  if (!url || err) {
    if (!label) return null;
    return <span style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600, color: G.textSecondary, whiteSpace: "nowrap" }}>{label}</span>;
  }
  return (
    <div style={{ width: size + 8, height: size + 8, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.3)", flexShrink: 0 }}>
      <img src={url} alt={label} onError={() => setErr(true)} style={{ width: size, height: size, objectFit: "contain" }} />
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
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", objectPosition: "top", flexShrink: 0, border: `1.5px solid ${G.surfaceBorderLight}` }} />
  );
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: grad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0, border: `1.5px solid hsl(${hue},55%,58%)` }}>
      {initials}
    </div>
  );
}

// ── Type pill ─────────────────────────────────────────────────────────────────
function TypePill({ type }) {
  return <span style={{ background: G.surfaceRaised, color: G.textSecondary, border: `1px solid ${G.surfaceBorder}`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>{type}</span>;
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
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: G.textTertiary, marginBottom: 14 }}>{title}</div>
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
})))}`;

      const priorMsgs = msgs.filter((m, i) => i > 0 && m.text);
      const history = [
        { role: "user", content: rosterContext },
        { role: "assistant", content: "Got it — I have the full client roster. What do you need?" },
        ...priorMsgs.map(m => ({ role: m.role, content: m.text })),
        { role: "user", content: text },
      ];

      const resp = await fetch("/api/music", {
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
      const resp = await fetch('/api/music', {
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
            <Field label="City"><Input value={form.city} onChange={e => set('city', e.target.value)} /></Field>
            <Field label="State"><Input value={form.state} onChange={e => set('state', e.target.value)} /></Field>
            <div style={{ gridColumn: "1/-1" }}>
              <Field label="Country"><Input value={form.country} onChange={e => set('country', e.target.value)} placeholder="United States" /></Field>
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
function ClientCard({ client: c, onClick }) {
  const [hov, setHov] = useState(false);
  const proLogo = lookupLogo(PRO_LOGOS, c.pro);
  const pubLogo = lookupLogo(PUB_LOGOS, c.publisher);
  const lblLogo = lookupLogo(LABEL_LOGOS, c.label);
  const logos = [
    proLogo && { url: proLogo, label: c.pro },
    pubLogo && { url: pubLogo, label: c.publisher },
    lblLogo && { url: lblLogo, label: c.label },
  ].filter(Boolean);

  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: hov ? G.surfaceRaised : G.surface, border: `1px solid ${hov ? G.surfaceBorderLight : G.surfaceBorder}`, borderRadius: 18, overflow: "hidden", cursor: "pointer", transition: `all 0.2s ${G.ease}`, transform: hov ? "translateY(-2px)" : "none", boxShadow: hov ? G.shadowLg : G.shadow, position: "relative" }}>
      <div style={{ padding: "16px 16px 12px" }}>
        <Avatar name={c.name} photoUrl={c.photoUrl} size={52} />
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: G.text, letterSpacing: "-0.02em", marginBottom: 4 }}>{c.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
            {(c.types || []).map(t => <TypePill key={t} type={t} />)}
          </div>
          {(c.city || c.country) && (
            <div style={{ fontSize: 11, color: G.textTertiary, marginTop: 4 }}>
              {[c.city, c.state].filter(Boolean).join(', ')}
              {c.country && <span style={{ marginLeft: 5 }}>{flag(c.country)}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Logo badges */}
      {logos.length > 0 && (
        <div style={{ position: "absolute", bottom: 46, right: 12, display: "flex", gap: 6 }}>
          {logos.map((l, i) => <LogoBadge key={i} url={l.url} label={l.label} size={28} />)}
        </div>
      )}

      {/* Credits / social */}
      <div style={{ padding: "9px 16px", borderTop: `1px solid ${G.surfaceBorder}` }}>
        {c.credits?.length > 0
          ? <div style={{ fontSize: 11, color: G.textSecondary }}>{c.credits.slice(0, 3).join(', ')}{c.credits.length > 3 ? ` +${c.credits.length - 3}` : ''}</div>
          : c.spotifyMonthly
            ? <div style={{ display: "flex", alignItems: "center", gap: 5 }}><SpotifyIcon size={11} /><span style={{ fontSize: 11, color: G.textSecondary }}>{fmt(c.spotifyMonthly)}</span></div>
            : null
        }
      </div>
    </div>
  );
}

// ── Client detail view ────────────────────────────────────────────────────────
function ClientDetail({ client: c, onBack, onEdit }) {
  const proLogo = lookupLogo(PRO_LOGOS, c.pro);
  const pubLogo = lookupLogo(PUB_LOGOS, c.publisher);
  const lblLogo = lookupLogo(LABEL_LOGOS, c.label);

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      {/* Back */}
      <div style={{ padding: "16px 28px 0" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: G.textSecondary, fontSize: 13, fontWeight: 500, cursor: "pointer", padding: 0, fontFamily: ff, transition: `color 0.15s ${G.ease}` }}
          onMouseEnter={e => e.currentTarget.style.color = G.text} onMouseLeave={e => e.currentTarget.style.color = G.textSecondary}>← Back</button>
      </div>

      {/* Header */}
      <div style={{ padding: "20px 28px 24px", borderBottom: `1px solid ${G.surfaceBorder}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
          <Avatar name={c.name} photoUrl={c.photoUrl} size={80} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: G.text, letterSpacing: "-0.04em", margin: "0 0 8px", lineHeight: 1.1 }}>{c.name}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {(c.types || []).map(t => <TypePill key={t} type={t} />)}
            </div>
            {(c.city || c.country) && (
              <div style={{ fontSize: 13, color: G.textSecondary }}>
                {[c.city, c.state, c.country].filter(Boolean).join(', ')}
                {c.country && <span style={{ marginLeft: 6, fontSize: 16 }}>{flag(c.country)}</span>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {proLogo && <LogoBadge url={proLogo} label={c.pro} size={36} />}
            {pubLogo && <LogoBadge url={pubLogo} label={c.publisher} size={36} />}
            {lblLogo && <LogoBadge url={lblLogo} label={c.label} size={36} />}
          </div>
          <button onClick={onEdit} style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff }}>Edit</button>
        </div>

        {/* Streaming / social stats */}
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          {c.spotifyMonthly && (
            <div style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "14px 18px", minWidth: 90 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: G.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{fmt(c.spotifyMonthly)}</div>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: G.textTertiary, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><SpotifyIcon size={9} /> Monthly</div>
            </div>
          )}
          {[
            { icon: <IgIcon size={9} />, val: null, label: "Instagram", handle: c.instagram, url: c.instagram ? `https://instagram.com/${c.instagram}` : null },
            { icon: <TwIcon size={9} />, val: null, label: "Twitter", handle: c.twitter, url: c.twitter ? `https://x.com/${c.twitter}` : null },
            { icon: <TkIcon size={9} />, val: null, label: "TikTok", handle: c.tiktok, url: c.tiktok ? `https://tiktok.com/@${c.tiktok}` : null },
          ].filter(s => s.handle).map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 12, padding: "14px 18px", textDecoration: "none", cursor: "pointer", transition: `all 0.15s ${G.ease}`, minWidth: 90 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = G.surfaceBorderLight; e.currentTarget.style.background = G.surface; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = G.surfaceBorder; e.currentTarget.style.background = G.surfaceRaised; }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: G.text }}>@{s.handle}</div>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: G.textTertiary, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>{s.icon} {s.label}</div>
            </a>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "24px 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {c.bio && (
          <div style={{ gridColumn: "1/-1" }}>
            <Sec title="Bio"><p style={{ fontSize: 13, color: G.textSecondary, lineHeight: 1.65, margin: 0 }}>{c.bio}</p></Sec>
          </div>
        )}
        {c.credits?.length > 0 && (
          <div style={{ gridColumn: "1/-1" }}>
            <Sec title="Credits / Artists Worked With">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {c.credits.map((cr, i) => <span key={i} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 500, color: G.textSecondary }}>{cr}</span>)}
              </div>
            </Sec>
          </div>
        )}
        <Sec title="Details">
          <IR label="Contact / MH Rep" value={c.contact} />
          <IR label="City" value={[c.city, c.state].filter(Boolean).join(', ')} />
          <IR label="Country" value={c.country ? `${c.country} ${flag(c.country)}` : null} />
          <IR label="PRO" value={c.pro} />
          <IR label="Publisher" value={c.publisher} />
          <IR label="Record Label" value={c.label} />
        </Sec>
        <Sec title="Links">
          {c.spotifyUrl && <div style={{ marginBottom: 8 }}><a href={c.spotifyUrl} target="_blank" rel="noopener noreferrer" style={{ color: G.green, fontSize: 13, textDecoration: "none" }}>Spotify Profile ↗</a></div>}
          {c.appleMusicUrl && <div style={{ marginBottom: 8 }}><a href={c.appleMusicUrl} target="_blank" rel="noopener noreferrer" style={{ color: G.green, fontSize: 13, textDecoration: "none" }}>Apple Music ↗</a></div>}
          {c.soundcloudUrl && <div style={{ marginBottom: 8 }}><a href={c.soundcloudUrl} target="_blank" rel="noopener noreferrer" style={{ color: G.green, fontSize: 13, textDecoration: "none" }}>SoundCloud ↗</a></div>}
          {!c.spotifyUrl && !c.appleMusicUrl && !c.soundcloudUrl && <div style={{ color: G.textTertiary, fontSize: 12 }}>No links added</div>}
        </Sec>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('roster'); // roster | detail
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('roster');
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    fetch('/api/music')
      .then(r => r.json())
      .then(d => { setClients(d.clients || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const types = useMemo(() => {
    const all = new Set();
    clients.forEach(c => (c.types || []).forEach(t => all.add(t)));
    return ['All', ...Array.from(all).sort()];
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

  const tabs = [
    { id: 'roster', label: 'Roster' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'documents', label: 'Documents' },
  ];

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

      {/* Sidebar */}
      {!isMobile && sidebarOpen && (
        <div style={{ width: 200, background: G.surface, borderRight: `1px solid ${G.surfaceBorder}`, display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflow: "hidden", boxShadow: `2px 0 24px rgba(0,0,0,0.3)` }}>
          {/* Logo */}
          <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${G.surfaceBorder}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: G.text, letterSpacing: "-0.02em" }}>Milk & Honey</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: G.green, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>Music</div>
          </div>
          {/* Nav */}
          <div style={{ padding: "12px 10px", flex: 1 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px 9px 12px", borderRadius: 9, border: "none", borderLeft: `2px solid ${activeTab === t.id ? G.green : "transparent"}`, background: activeTab === t.id ? "rgba(62,170,120,0.07)" : "transparent", cursor: "pointer", fontFamily: ff, textAlign: "left", marginBottom: 2, transition: `all 0.18s ${G.ease}` }}>
                <span style={{ fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400, color: activeTab === t.id ? G.text : G.textSecondary }}>{t.label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setSidebarOpen(false)} style={{ padding: "12px 18px", background: "none", border: "none", color: G.textTertiary, cursor: "pointer", fontSize: 11, textAlign: "left", fontFamily: ff }}>‹‹ Collapse</button>
        </div>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div style={{ padding: "20px 28px 16px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {(!sidebarOpen || isMobile) && (
              <button onClick={() => setSidebarOpen(v => !v)} style={{ background: G.surfaceRaised, border: `1px solid ${G.surfaceBorder}`, borderRadius: 9, padding: "7px 10px", cursor: "pointer", color: G.textSecondary, fontFamily: ff }}>☰</button>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 22, color: G.text, letterSpacing: "-0.02em" }}>Client Roster</div>
              <div style={{ fontSize: 12, color: G.textSecondary, marginTop: 2 }}>{clients.length} clients</div>
            </div>
          </div>
          <button onClick={() => setEditing({ ...BLANK })} style={{ background: G.green, color: "#0a0a0a", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: ff }}>+ Add Client</button>
        </div>

        {/* Filters */}
        <div style={{ padding: "14px 28px", borderBottom: `1px solid ${G.surfaceBorder}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..."
            style={{ ...inputBase, width: 240, padding: "8px 12px" }} />
          <div style={{ display: "flex", gap: 6 }}>
            {types.map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${filterType === t ? G.green : G.surfaceBorder}`, background: filterType === t ? G.greenSubtle : G.surfaceRaised, color: filterType === t ? G.green : G.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ff, transition: `all 0.15s ${G.ease}` }}>
                {t}
              </button>
            ))}
          </div>
        </div>

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
            <ClientDetail client={selected} onBack={() => setView('roster')} onEdit={() => setEditing(selected)} />
          )}

          {!loading && !error && view === 'roster' && (
            <div style={{ padding: "20px 28px 48px" }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px 32px", color: G.textTertiary }}>
                  <div style={{ fontSize: 15 }}>{search || filterType !== 'All' ? 'No clients match your filters.' : 'No clients yet. Add your first one.'}</div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                  {filtered.map((c, i) => (
                    <ClientCard key={c.id || i} client={c} onClick={() => { setSelected(c); setView('detail'); }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editing && <ClientForm initial={editing} onSave={saveClient} onCancel={() => setEditing(null)} />}

      {/* Chat */}
      {!loading && <FloatingChat clients={clients} isMobile={isMobile} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
