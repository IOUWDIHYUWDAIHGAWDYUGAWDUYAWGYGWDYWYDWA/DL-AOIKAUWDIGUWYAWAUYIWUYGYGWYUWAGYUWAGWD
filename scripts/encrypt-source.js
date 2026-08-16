#!/usr/bin/env node
// 🔒 Kaynak kodunu repo'da GERÇEKTEN şifreli tutar (AES-256-GCM, 32 byte anahtar).
//
// obfuscate.js dist/'i ürettikten sonra bu script çalışır:
//   her dist/**/*.js dosyasını SOURCE_KEY ile şifreler → dist/**/*.js.enc
//   ve düz metin .js dosyalarını SİLER. Repo'da yalnızca:
//     - dist/**/*.js.enc  (AES-256-GCM blokları — anahtarsız okunamaz)
//     - dist/start.js     (küçük şifre çözücü/başlatıcı, içinde sır YOK)
//     - dist/config.json  (sır içermeyen ayarlar; gizli alanlar obfuscate.js'te boşaltılır)
//   kalır.
//
// Anahtar (SOURCE_KEY) yalnızca ortam değişkeninde durur — repoyu klonlayan biri
// kodu ne okuyabilir ne çalıştırabilir. (obfuscation'ın aksine bu "kolayca
// geri çevrilebilir" değildir: anahtarsız AES-256-GCM kırılamaz.)
//
// Kullanım (repo kökünde):
//   SOURCE_KEY=<64 hex> npm run build        # obfuscate + encrypt
//   SOURCE_KEY üretmek için: node scripts/db-crypto.js keygen   (aynı 64-hex formatı)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
    // Trim: GitHub secret'ına kopyalarken satır sonu/boşluk yapışırsa anahtar bozulur
    const hex = (process.env.SOURCE_KEY || '').trim();
    if (!hex) {
        console.error('🚨 SOURCE_KEY ortam değişkeni gerekli (32 byte = 64 hex karakter).');
        console.error('   Üretmek için: node scripts/db-crypto.js keygen');
        console.error('   Sonra GitHub repo secret\'larına SOURCE_KEY olarak ekle.');
        process.exit(1);
    }
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        console.error('🚨 SOURCE_KEY geçersiz: tam olarak 64 hex karakter olmalı (0-9a-f, 32 byte AES-256 anahtarı).');
        process.exit(1);
    }
    return Buffer.from(hex, 'hex');
}

// dist altındaki tüm .js dosyalarını bul (start.js hariç — o sır içermez, açık kalır)
function listJs(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listJs(full));
        } else if (entry.name.endsWith('.js') && entry.name !== 'start.js') {
            out.push(full);
        }
    }
    return out;
}

// Format: iv(12) + authTag(16) + ciphertext — db-crypto.js ile aynı düzen
function encryptFile(file, key) {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const plain = fs.readFileSync(file);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    fs.writeFileSync(file + '.enc', Buffer.concat([iv, tag, enc]));
    fs.rmSync(file, { force: true }); // düz metni diskten kaldır
    return { plainSize: plain.length, encSize: enc.length + IV_LEN + TAG_LEN };
}

const key = getKey();
const files = listJs(DIST);
if (files.length === 0) {
    console.error('🚨 dist/ içinde şifrelenecek .js dosyası bulunamadı.');
    console.error('   Önce npm run obfuscate çalıştır (build: npm run build).');
    process.exit(1);
}

for (const file of files) {
    const { plainSize, encSize } = encryptFile(file, key);
    console.log(`🔒 ${path.relative(ROOT, file)} → .enc (${plainSize} → ${encSize} bayt)`);
}

// Çalıştırıcıyı (start.js) kopyala — sır içermez, repo'da açık durur.
const template = path.join(__dirname, 'start-template.js');
if (fs.existsSync(template)) {
    fs.copyFileSync(template, path.join(DIST, 'start.js'));
} else {
    console.warn('⚠️ scripts/start-template.js bulunamadı — dist/start.js yazılmadı!');
}

console.log(`✅ ${files.length} dosya AES-256-GCM ile şifrelendi. Repo'da yalnızca .enc blokları var.`);
