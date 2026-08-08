#!/usr/bin/env node
// 🤖 Telegram yönetim komutları — botun veritabanını Telegram'dan sorgular.
//
// Yedekleme ile aynı bot üzerinden çalışır (TELEGRAM_TOKEN). Workflow her
// döngüde bu script'i çağırır; script kısa bir getUpdates long-poll yapar ve
// gelen komutlara veritabanından üretilmiş özetlerle cevap verir.
//
// Komutlar:
//   /yardim   — komut listesi
//   /durum    — genel istatistik (üye, gem, uyarı, kara liste, ses, mesaj, yedek)
//   /top      — en yüksek gem'e sahip ilk 10 üye
//   /uye <id> — tek üyenin detayı + son gem işlemleri
//   /loglar   — son gem işlemleri
//   /uyarilar — son uyarılar
//
// Run başında eski mesajlar sessizce tüketilir (offset sıfırlanınca 24 saatlik
// geçmiş tekrar işlenmesin diye); yalnızca o run sırasında gelen komutlara
// cevap verilir. Çalışma zamanı boyunca offset geçici klasörde tutulur.
//
// Kullanım: node scripts/db-telegram.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'dist', 'data.db');
const REF_PATH = process.env.BACKUP_REF_PATH || path.join(__dirname, '..', '.backup-ref.json');
// Trim: GitHub secret'ına kopyalarken satır sonu/boşluk yapışırsa token bozulur
const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const DISCORD_TOKEN = (process.env.TOKEN || '').trim();
const OFFSET_FILE = path.join(os.tmpdir(), 'db-telegram-offset');
const POLL_TIMEOUT = 5; // saniye — döngüyü uzun tutmadan komutları yakalar

function fail(msg) {
    console.error(`🚨 ${msg}`);
    process.exit(1);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// Bot API isteği; ağ dalgalanmasına karşı 2 deneme.
async function api(pathname, attempts = 2) {
    let lastErr;
    for (let i = 1; i <= attempts; i++) {
        try {
            const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${pathname}`);
            const j = await res.json();
            if (!res.ok || !j.ok) {
                throw new Error(`HTTP ${res.status}: ${(j.description || res.statusText).slice(0, 200)}`);
            }
            return j.result;
        } catch (e) {
            lastErr = e;
            if (i < attempts) await sleep(2000);
        }
    }
    throw lastErr;
}

// ── Sorgu yardımcıları ──────────────────────────────────────────────
function q(db, sql) {
    const r = db.exec(sql);
    return r.length ? r[0].values : [];
}

function getRow(db, sql, params) {
    const stmt = db.prepare(sql);
    try {
        stmt.bind(params);
        return stmt.step() ? stmt.getAsObject() : null;
    } finally {
        stmt.free();
    }
}

function fmtDur(seconds) {
    const s = Number(seconds) || 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h} sa ${m} dk`;
    return `${m} dk`;
}

function fmtDate(d) {
    return d ? String(d).replace('T', ' ').slice(0, 16) : '—';
}

// Discord ad çözümleme — best effort; TOKEN (Discord) varsa dener, yoksa ID gösterilir.
const nameCache = new Map();
async function discordName(userId) {
    if (nameCache.has(userId)) return nameCache.get(userId);
    if (!DISCORD_TOKEN) return null;
    try {
        const res = await fetch(`https://discord.com/api/v10/users/${encodeURIComponent(userId)}`, {
            headers: { Authorization: `Bot ${DISCORD_TOKEN}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        const name = j.username || null;
        nameCache.set(userId, name);
        return name;
    } catch {
        nameCache.set(userId, null);
        return null;
    }
}

async function fmtUser(userId) {
    const name = await discordName(userId);
    return name ? `${name} (${userId})` : String(userId);
}

// ── Komutlar ─────────────────────────────────────────────────────────
function cmdYardim() {
    return [
        '🤖 HelmsDeep Bot — Telegram Komutları',
        '━━━━━━━━━━━━━━━━━━━━',
        '/durum — genel istatistik',
        '/top — en yüksek gem ilk 10',
        '/uye <id> — üye detayı',
        '/loglar — son gem işlemleri',
        '/uyarilar — son uyarılar',
        '/yardim — bu liste',
    ].join('\n');
}

function cmdDurum(db) {
    const [ucount, tgems, twarn, tbl] = q(
        db,
        "SELECT COUNT(*), COALESCE(SUM(gems),0), COALESCE(SUM(warnings),0), COALESCE(SUM(CASE WHEN is_blacklisted THEN 1 ELSE 0 END),0) FROM users"
    )[0] || [0, 0, 0, 0];

    const ranks = q(
        db,
        "SELECT current_rank, COUNT(*) FROM users WHERE current_rank IS NOT NULL GROUP BY current_rank ORDER BY 2 DESC LIMIT 4"
    );
    const vrow = q(db, "SELECT MAX(week_year) FROM voice_activity")[0];
    const vsum = q(db, "SELECT COALESCE(SUM(duration_seconds),0) FROM voice_activity WHERE week_year = (SELECT MAX(week_year) FROM voice_activity)")[0];
    const csum = q(db, "SELECT COALESCE(SUM(message_count),0) FROM chat_activity WHERE week_year = (SELECT MAX(week_year) FROM chat_activity)")[0];

    let ref = null;
    try {
        ref = JSON.parse(fs.readFileSync(REF_PATH, 'utf8'));
    } catch { /* henüz yedek yok */ }

    const lines = [
        '📊 HelmsDeep — Veritabanı Durumu',
        '━━━━━━━━━━━━━━━━━━━━',
        `👥 Üye: ${ucount}`,
        `💎 Toplam gem: ${tgems}`,
        `⚠️ Toplam uyarı: ${twarn}`,
        `🚫 Kara liste: ${tbl}`,
    ];
    if (ranks.length) lines.push(`🏅 Rütbeler: ${ranks.map((r) => `${r[0]}×${r[1]}`).join(', ')}`);
    if (vrow && vsum) lines.push(`🎙️ Ses (${vrow[0]}): ${fmtDur(vsum[0])}`);
    if (csum) lines.push(`💬 Mesaj (son hafta): ${csum[0]}`);
    lines.push(`🗄️ DB: ${fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size + ' bayt' : 'yok'}`);
    lines.push(`☁️ Son yedek: ${ref && ref.date ? fmtDate(ref.date) + ' UTC' : 'henüz yok'}`);
    return lines.join('\n');
}

async function cmdTop(db) {
    const rows = q(db, "SELECT user_id, gems, current_rank FROM users ORDER BY gems DESC LIMIT 10");
    const lines = ['🏆 En Yüksek Gem (Top 10)', '━━━━━━━━━━━━━━━━━━━━'];
    for (const [i, r] of rows.entries()) {
        const u = await fmtUser(r[0]);
        lines.push(`${i + 1}. ${u} — ${r[1]} 💎${r[2] ? ' · ' + r[2] : ''}`);
    }
    return lines.join('\n');
}

async function cmdUye(db, userId) {
    const row = getRow(
        db,
        "SELECT user_id, gems, warnings, rank_downs, current_rank, is_blacklisted FROM users WHERE user_id = ?",
        [userId]
    );
    if (!row) return `❌ Üye bulunamadı: ${userId}`;

    const lines = [
        `👤 Üye: ${await fmtUser(row.user_id)}`,
        `🎖️ Rütbe: ${row.current_rank || '—'}`,
        `💎 Gem: ${row.gems}`,
        `⚠️ Uyarı: ${row.warnings}`,
        `📉 Rütbe düşürme: ${row.rank_downs}`,
        `🚫 Kara liste: ${row.is_blacklisted ? 'Evet' : 'Hayır'}`,
    ];

    // Üyeye ait son 5 işlem (user_id filtreli)
    const stmt = db.prepare("SELECT amount, reason, admin_id, created_at FROM gem_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 5");
    try {
        stmt.bind([userId]);
        const mine = [];
        while (stmt.step()) mine.push(stmt.getAsObject());
        if (mine.length) {
            lines.push('─────────────');
            lines.push('🕐 Son gem işlemleri:');
            for (const g of mine) {
                lines.push(`  ${g.amount > 0 ? '+' : ''}${g.amount} 💎 ${g.reason || ''} — ${g.admin_id || ''} — ${fmtDate(g.created_at)}`);
            }
        }
    } finally {
        stmt.free();
    }
    return lines.join('\n');
}

async function cmdLoglar(db) {
    const rows = q(db, "SELECT user_id, amount, reason, admin_id, created_at FROM gem_log ORDER BY created_at DESC LIMIT 10");
    const lines = ['🕐 Son 10 Gem İşlemi', '━━━━━━━━━━━━━━━━━━━━'];
    for (const r of rows) {
        const u = await fmtUser(r[0]);
        lines.push(`${r[1] > 0 ? '+' : ''}${r[1]} 💎 ${r[2] || ''} — ${u} — ${fmtDate(r[4])}`);
    }
    return lines.length > 1 ? lines.join('\n') : '📭 Henüz gem işlemi yok.';
}

async function cmdUyarilar(db) {
    const rows = q(db, "SELECT user_id, reason, created_at FROM warnings_log ORDER BY created_at DESC LIMIT 10");
    const lines = ['⚠️ Son 10 Uyarı', '━━━━━━━━━━━━━━━━━━━━'];
    for (const r of rows) {
        const u = await fmtUser(r[0]);
        lines.push(`• ${u} — ${r[1] || ''} — ${fmtDate(r[2])}`);
    }
    return lines.length > 1 ? lines.join('\n') : '📭 Henüz uyarı yok.';
}

// ── Komut dağıtımı ───────────────────────────────────────────────────
async function handleCommand(text, db) {
    const cmd = text.replace(/@\w+/, '').trim();
    const parts = cmd.split(/\s+/);
    const name = (parts.shift() || '').toLowerCase();
    const arg = parts.join(' ').trim();

    if (['/start', '/yardim', '/help'].includes(name)) return cmdYardim();
    if (name === '/durum' || name === '/status') return cmdDurum(db);
    if (name === '/top') return cmdTop(db);
    if (name === '/uye') {
        if (!arg) return 'Kullanım: /uye <kullanıcı ID>\nÖrnek: /uye 918541990877089842';
        return cmdUye(db, arg);
    }
    if (name === '/loglar') return cmdLoglar(db);
    if (name === '/uyarilar') return cmdUyarilar(db);
    return `Bilinmeyen komut: ${name}\nKomut listesi için: /yardim`;
}

// ── Ana döngü (tek poll) ─────────────────────────────────────────────
async function main() {
    if (!TOKEN) fail('TELEGRAM_TOKEN ortam değişkeni gerekli.');

    let offset = 0;
    let firstPoll = true;
    try {
        offset = parseInt(fs.readFileSync(OFFSET_FILE, 'utf8'), 10) || 0;
        firstPoll = false;
    } catch { /* run başı — ilk poll */ }

    const updates = await api(`getUpdates?timeout=${POLL_TIMEOUT}&allowed_updates=["message"]&offset=${offset}`);

    let maxId = offset;
    for (const u of updates || []) {
        maxId = Math.max(maxId, u.update_id);
        if (firstPoll) continue; // eski mesajları sessizce tüket (çift cevap olmasın)
        const msg = u.message;
        if (!msg || !msg.text || !msg.chat) continue;
        const text = String(msg.text).trim();
        if (!text.startsWith('/')) continue;

        try {
            let db = null;
            if (fs.existsSync(DB_PATH)) {
                const SQL = await initSqlJs();
                db = new SQL.Database(fs.readFileSync(DB_PATH));
            }
            const reply = await handleCommand(text, db);
            await api(`sendMessage?chat_id=${msg.chat.id}&text=${encodeURIComponent(reply)}`);
            console.log(`📨 ${msg.chat.id}: ${text} → cevap gönderildi (${reply.length} karakter)`);
        } catch (e) {
            console.warn(`Komut işlenemedi (${text}): ${e.message}`);
        }
    }

    if (maxId > offset) {
        fs.writeFileSync(OFFSET_FILE, String(maxId + 1));
    }
}

module.exports = { cmdYardim, cmdDurum, cmdTop, cmdUye, cmdLoglar, cmdUyarilar };

if (require.main === module) {
    main().catch((e) => {
        console.error(`🚨 Telegram komut servisi başarısız: ${e.message}`);
        process.exit(1);
    });
}
