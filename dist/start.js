#!/usr/bin/env node
// 🔓 Şifreli derleme çalıştırıcısı.
//
// Repo'da kaynak kod DÜZ METİN olarak yoktur; her dosya AES-256-GCM ile
// şifrelenmiş halde dist/**/*.js.enc olarak durur. Bu çalıştırıcı:
//   1) SOURCE_KEY ortam değişkenini okur (32 byte = 64 hex karakter),
//   2) tüm *.js.enc dosyalarını çözüp aynı yere *.js olarak yazar,
//   3) istenen giriş dosyasını çalıştırır (varsayılan: index.js),
//   4) çıkışta çözülen dosyaları siler.
//
// İçinde SIR YOKTUR — anahtar SOURCE_KEY'tir ve yalnızca ortam değişkeninden
// gelir. Repoyu klonlayan biri anahtara sahip olmadığı için kodu ne okuyabilir
// ne çalıştırabilir.
//
// Kullanım:
//   SOURCE_KEY=<64 hex> node dist/start.js                 # botu başlat
//   SOURCE_KEY=<64 hex> node dist/start.js deploy-commands.js
//   SOURCE_KEY=<64 hex> node dist/start.js --check         # sadece çözümü dene
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const DIST = __dirname;

function getKey() {
    const hex = (process.env.SOURCE_KEY || '').trim();
    if (!hex) {
        console.error('🚨 SOURCE_KEY ortam değişkeni gerekli (32 byte = 64 hex karakter).');
        console.error('   Üretmek için: node scripts/db-crypto.js keygen');
        console.error('   GitHub: Settings → Secrets and variables → Actions → SOURCE_KEY');
        console.error('   Yerel .env: SOURCE_KEY=<üretilen anahtar>');
        process.exit(1);
    }
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        console.error('🚨 SOURCE_KEY geçersiz: tam olarak 64 hex karakter olmalı (0-9a-f, 32 byte AES-256 anahtarı).');
        process.exit(1);
    }
    return Buffer.from(hex, 'hex');
}

// dist altındaki tüm *.js.enc dosyalarını bul (data.db.enc'e dokunmaz)
function listEnc(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listEnc(full));
        } else if (entry.name.endsWith('.js.enc')) {
            out.push(full);
        }
    }
    return out;
}

// iv(12) + authTag(16) + ciphertext → düz metni aynı yola yazar (uzantıdan .enc düşer)
function decryptFile(encPath, key) {
    const data = fs.readFileSync(encPath);
    if (data.length < IV_LEN + TAG_LEN) {
        throw new Error(`${path.relative(DIST, encPath)} geçersiz şifreli blok.`);
    }
    const iv = data.subarray(0, IV_LEN);
    const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = data.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    fs.writeFileSync(encPath.slice(0, -4), plain);
}

let encFiles;
try {
    const key = getKey();
    encFiles = listEnc(DIST);
    if (encFiles.length === 0) {
        console.error('🚨 dist/ içinde şifreli dosya (*.js.enc) bulunamadı.');
        console.error('   Derleme eksik: SOURCE_KEY=<64 hex> npm run build');
        process.exit(1);
    }
    for (const f of encFiles) {
        decryptFile(f, key);
    }
} catch (e) {
    console.error('🚨 Şifre çözme başarısız:', e.message);
    console.error('   Anahtar yanlış olabilir — SOURCE_KEY değerini kontrol et.');
    process.exit(1);
}

// Çözülen dosyaları çıkışta temizle (disk'te düz metin kalmasın)
const decrypted = encFiles.map((f) => f.slice(0, -4));
process.on('exit', () => {
    for (const f of decrypted) {
        try { fs.rmSync(f, { force: true }); } catch { /* yok say */ }
    }
});

if (process.argv[2] === '--check') {
    console.log(`✅ ${encFiles.length} dosya çözüldü ve doğrulandı. (Anahtar geçerli)`);
    process.exit(0);
}

const entry = process.argv[2] || 'index.js';
const entryPath = path.join(DIST, entry);
if (!fs.existsSync(entryPath)) {
    console.error(`🚨 Giriş dosyası bulunamadı: ${entry}`);
    console.error('   Kullanım: node dist/start.js [index.js|deploy-commands.js|--check]');
    process.exit(1);
}

require(entryPath);
