#!/usr/bin/env node
// 🔓 Veritabanını Telegram'dan geri yükle — veri repo'da TUTULMAZ.
//
// GitHub Actions runner'ları geçicidir; her run taze başlar. Repo'da veri
// olmadığı için DB'nin run başında Telegram'dan indirilip çözülmesi gerekir.
//
// Akış:
//   1) .backup-ref.json varsa (son yedek dosyasının file_id'si) → Telegram'dan
//      indir, DB_KEY ile çöz, DB_PATH'e yaz.
//   2) Referans yoksa ama eski repo yedeği (dist/data.db.enc) duruyorsa →
//      geçiş amaçlı onu çöz (eski sistemden bu sisteme ilk geçiş).
//   3) Hiçbiri yoksa → ilk çalıştırma; yeni veritabanıyla başlanır (exit 0).
//
// Referans VAR ama indirme/çözme başarısız olursa exit 1 döner — workflow botu
// BAŞLATMAMALI (boş DB ile başlayıp iyi verinin üstüne yazmamak için).
//
// Kullanım:
//   node scripts/db-restore.js
//   DB_PATH=/app/data/data.db node scripts/db-restore.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { decryptBuffer } = require('./db-crypto');

const REF_PATH = process.env.BACKUP_REF_PATH || path.join(__dirname, '..', '.backup-ref.json');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'dist', 'data.db');
const LEGACY_PATH = process.env.LEGACY_DB_PATH || path.join(__dirname, '..', 'dist', 'data.db.enc');
// Trim: GitHub secret'ına kopyalarken satır sonu/boşluk yapışırsa token bozulur
const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();

function fail(msg) {
    console.error(`🚨 ${msg}`);
    process.exit(1);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// Bot API isteği; ağ dalgalanmasına karşı 3 deneme, 2 sn ara.
async function api(pathname, attempts = 3) {
    let lastErr;
    for (let i = 1; i <= attempts; i++) {
        try {
            const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${pathname}`);
            const j = await res.json();
            if (!res.ok || !j.ok) {
                throw new Error(`HTTP ${res.status}: ${(j.description || res.statusText).slice(0, 200)}`);
            }
            return j;
        } catch (e) {
            lastErr = e;
            console.warn(`⚠️  Telegram isteği başarısız (deneme ${i}/${attempts}): ${e.message}`);
            if (i < attempts) await sleep(2000);
        }
    }
    throw lastErr;
}

async function main() {
    if (!TOKEN) fail('TELEGRAM_TOKEN ortam değişkeni gerekli.');

    // 2) Eski repo yedeğinden geçiş (referans henüz yokken)
    if (!fs.existsSync(REF_PATH)) {
        if (fs.existsSync(LEGACY_PATH)) {
            try {
                const plain = decryptBuffer(fs.readFileSync(LEGACY_PATH));
                fs.writeFileSync(DB_PATH, plain);
                console.log(`♻️  Eski repo yedeğinden geçiş: ${LEGACY_PATH} → ${DB_PATH} (${plain.length} bayt).`);
                console.log('    İlk 5 dk\'da bu veri Telegram\'a yüklenecek; artık repo\'da veri kalmayacak.');
                return;
            } catch (e) {
                fail(`Eski repo yedeği çözülemedi (DB_KEY uyumsuz olabilir): ${e.message}`);
            }
        }
        console.log('ℹ️  Yedek referansı yok — ilk çalıştırma, yeni veritabanıyla başlanıyor.');
        return;
    }

    // 1) Referans var → Telegram'dan indir + çöz
    let ref;
    try {
        ref = JSON.parse(fs.readFileSync(REF_PATH, 'utf8'));
    } catch {
        fail(`.backup-ref.json okunamadı (${REF_PATH}).`);
    }
    if (!ref.file_id) fail('Referansta file_id yok.');

    const g = await api(`getFile?file_id=${encodeURIComponent(ref.file_id)}`);
    const filePath = g.result && g.result.file_path;
    if (!filePath) fail(`getFile beklenmedik yanıt: ${JSON.stringify(g.result).slice(0, 200)}`);

    const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${filePath}`);
    if (!res.ok) fail(`Dosya indirilemedi: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    let plain;
    try {
        plain = decryptBuffer(buf);
    } catch (e) {
        fail(`Yedek çözülemedi (DB_KEY uyumsuz mu?): ${e.message}`);
    }

    // Bütünlük kontrolü — yedek bozuksa botu boş DB ile başlatma
    if (ref.sha256) {
        const h = crypto.createHash('sha256').update(plain).digest('hex');
        if (h !== ref.sha256) {
            fail('Bütünlük uyuşmazlığı: indirilen yedek bozuk (sha256 eşleşmiyor).');
        }
    }

    fs.writeFileSync(DB_PATH, plain);
    console.log(`✅ Veritabanı Telegram'dan geri yüklendi: ${DB_PATH} (${plain.length} bayt, ref: ${ref.date || '?'}).`);
}

main().catch((e) => {
    console.error(`🚨 Geri yükleme başarısız: ${e.message}`);
    process.exit(1);
});
