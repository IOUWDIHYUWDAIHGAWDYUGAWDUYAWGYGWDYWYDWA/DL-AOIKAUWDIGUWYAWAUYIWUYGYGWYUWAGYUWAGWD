#!/usr/bin/env node
// 🔐 Veritabanı şifreleme/çözme aracı.
//
// Public repo'ya ASLA düz veri gitmemesi için: workflow, data.db'yi commit
// etmeden önce bu script ile şifreler ve yalnızca data.db.enc'i repo'ya koyar.
// Anahtar (DB_KEY) yalnızca GitHub Actions secret'ında durur — repoyu klonlayan
// biri yalnızca şifreli blok görür, çözemez.
//
// Kullanım:
//   node scripts/db-crypto.js keygen                          # yeni anahtar üret
//   node scripts/db-crypto.js encrypt <giriş> <çıkış>         # şifrele
//   node scripts/db-crypto.js decrypt <giriş> <çıkış>         # çöz
//
// Anahtar 32 byte (64 hex karakter) AES-256 anahtarıdır; DB_KEY env'inden okunur.
// Şifreli dosya formatı: iv(12) + authTag(16) + ciphertext
const crypto = require('crypto');
const fs = require('fs');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
    // Trim: GitHub secret'ına kopyalarken satır sonu/boşluk yapışırsa anahtar bozulur
    const hex = (process.env.DB_KEY || '').trim();
    if (!hex) {
        console.error('🚨 DB_KEY ortam değişkeni gerekli (32 byte = 64 hex karakter).');
        console.error('   Üretmek için: node scripts/db-crypto.js keygen');
        console.error('   Sonra GitHub repo secret\'larına DB_KEY olarak ekle.');
        process.exit(1);
    }
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        console.error('🚨 DB_KEY geçersiz: tam olarak 64 hex karakter olmalı (0-9a-f, 32 byte AES-256 anahtarı).');
        console.error('   Üretmek için: node scripts/db-crypto.js keygen');
        console.error('   Sonra GitHub → Settings → Secrets and variables → Actions → DB_KEY olarak ekle.');
        process.exit(1);
    }
    return Buffer.from(hex, 'hex');
}

// Şifreli veriyi dosyaya yazmadan buffer olarak üretir. db-backup.js gibi harici
// yedek script'leri aynı formatı kullanabilsin diye dışa açılır.
function encryptToBuffer(inputPath) {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const plain = fs.readFileSync(inputPath);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { buffer: Buffer.concat([iv, tag, enc]), plainSize: plain.length };
}

function encrypt(inputPath, outputPath) {
    const { buffer, plainSize } = encryptToBuffer(inputPath);
    fs.writeFileSync(outputPath, buffer);
    console.log(`🔒 ${inputPath} → ${outputPath} (${plainSize} → ${buffer.length} bayt)`);
}

// Şifreli buffer'ı çözüp düz veriyi döner. db-restore.js (Telegram'dan geri
// yükleme) aynı mantığı kullanabilsin diye dışa açılır.
function decryptBuffer(data) {
    const key = getKey();
    if (data.length < IV_LEN + TAG_LEN) {
        throw new Error('Dosya çok kısa — geçerli şifreli veri değil.');
    }
    const iv = data.subarray(0, IV_LEN);
    const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = data.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]);
}

function decrypt(inputPath, outputPath) {
    try {
        const plain = decryptBuffer(fs.readFileSync(inputPath));
        fs.writeFileSync(outputPath, plain);
        console.log(`🔓 ${inputPath} → ${outputPath} (${plain.length} bayt)`);
    } catch (e) {
        console.error(`🚨 ${e.message}`);
        process.exit(1);
    }
}

module.exports = { encrypt, decrypt, encryptToBuffer, decryptBuffer, getKey };

// CLI olarak çağrıldığında çalışır; require edilince yalnızca fonksiyonları verir.
if (require.main === module) {
    const [mode, input, output] = process.argv.slice(2);
    if (mode === 'keygen') {
        console.log(crypto.randomBytes(32).toString('hex'));
    } else if (mode === 'encrypt' && input && output) {
        encrypt(input, output);
    } else if (mode === 'decrypt' && input && output) {
        decrypt(input, output);
    } else {
        console.error('Kullanım: node scripts/db-crypto.js <keygen|encrypt <giriş> <çıkış>|decrypt <giriş> <çıkış>>');
        process.exit(1);
    }
}
