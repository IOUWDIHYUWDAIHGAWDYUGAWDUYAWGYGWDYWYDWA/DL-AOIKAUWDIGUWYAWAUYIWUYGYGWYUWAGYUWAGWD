#!/usr/bin/env node
// ☁️ Harici veritabanı yedeği — Telegram Bot API (repo'da veri TUTULMAZ).
//
// Veritabanı her 5 dk'da bir şifrelenip (AES-256, DB_KEY) Telegram'a yüklenir;
// repo'ya yalnızca son yedeğin işaretçisi gider (.backup-ref.json → file_id).
// Böylece repo/hesap kaybedilse bile DB Telegram'da kalır; repoyu klonlayan
// biri veri görmez (referans yalnızca Telegram file_id'si — veri değil).
//
// Kurulum (bir kez):
//   1) Telegram'da @BotFather → /newbot → token al → TELEGRAM_TOKEN secret'ı
//   2) Botu özel bir kanala ekle (veya kendine yazdır) → sohbet ID'si lazım
//   3) ID'yi bul: https://api.telegram.org/bot<TOKEN>/getUpdates
//      (mesajı attıktan sonra "chat":{"id":...} alanı) → TELEGRAM_CHAT_ID secret'ı
//   4) GitHub → Settings → Secrets and variables → Actions →
//      TELEGRAM_TOKEN + TELEGRAM_CHAT_ID + DB_KEY ekle
//
// Kullanım:
//   node scripts/db-backup.js                      # dist/data.db'yi şifreleyip yükler
//   DB_PATH=/app/data/data.db node scripts/db-backup.js
//
// Aynı veri tekrar yüklenmez: run boyunca son hash geçici klasörde tutulur;
// her Actions run'ı taze başladığı için ilk yedek her zaman alınır.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { encryptToBuffer } = require('./db-crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'dist', 'data.db');
const REF_PATH = process.env.BACKUP_REF_PATH || path.join(__dirname, '..', '.backup-ref.json');
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
// Son yüklenen verinin hash'i — her platformda gerçek geçici klasör (Linux: /tmp)
const STATE_FILE = path.join(os.tmpdir(), 'db-backup-last-hash');

function fail(msg) {
    console.error(msg);
    process.exit(1);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// Telegram'a dosya yükle; ağ dalgalanmasına karşı 3 deneme, 3 sn ara.
// Başarılıysa yanıttaki file_id'yi döner (geri yükleme için işaretçi olur).
async function upload(buffer, filename) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendDocument`;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const form = new FormData();
            form.append('chat_id', CHAT_ID);
            form.append('document', new Blob([buffer], { type: 'application/octet-stream' }), filename);
            const res = await fetch(url, { method: 'POST', body: form });
            const j = await res.json();
            if (!res.ok || !j.ok) {
                throw new Error(`HTTP ${res.status}: ${(j.description || '').slice(0, 300)}`);
            }
            const fileId = j.result && j.result.document && j.result.document.file_id;
            if (!fileId) throw new Error('Yanıtta file_id yok.');
            return fileId;
        } catch (err) {
            lastErr = err;
            console.warn(`⚠️  Deneme ${attempt}/3 başarısız: ${err.message}`);
            if (attempt < 3) await sleep(3000);
        }
    }
    throw lastErr;
}

async function main() {
    if (!TOKEN || !CHAT_ID) {
        fail('🚨 TELEGRAM_TOKEN ve TELEGRAM_CHAT_ID ortam değişkenleri gerekli.');
    }
    if (!fs.existsSync(DB_PATH)) {
        fail(`🚨 Veritabanı bulunamadı: ${DB_PATH}`);
    }

    const plain = fs.readFileSync(DB_PATH);
    const hash = crypto.createHash('sha256').update(plain).digest('hex');

    // Aynı veri zaten yüklendiyse tekrar yükleme (5 dk'da bir boşa istek atma)
    let last = null;
    try {
        last = fs.readFileSync(STATE_FILE, 'utf8').trim();
    } catch {
        /* ilk çalıştırma */
    }
    if (last === hash) {
        console.log('⏭️  Veritabanı değişmemiş — yedek atlandı.');
        process.exit(0);
    }

    // 🔒 Önce şifrele (DB_KEY ile; db-crypto.js formatı: iv+tag+ciphertext)
    const { buffer } = encryptToBuffer(DB_PATH);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db-${stamp}.enc`;

    const fileId = await upload(buffer, filename);

    // İşaretçiyi yaz: repo'ya veri değil, yalnızca Telegram file_id'si gider.
    // db-restore.js bunu okuyup yedeği Telegram'dan indirir.
    const ref = { file_id: fileId, date: new Date().toISOString(), sha256: hash };
    fs.writeFileSync(REF_PATH, JSON.stringify(ref, null, 2));
    console.log(`✅ Telegram yedeği tamam: ${filename} (${buffer.length} bayt, ${hash.slice(0, 12)}…)`);
    console.log(`   İşaretçi yazıldı: ${REF_PATH}`);
}

main().catch((err) => {
    console.error(`🚨 Telegram yedeği başarısız: ${err.message}`);
    process.exit(1);
});
