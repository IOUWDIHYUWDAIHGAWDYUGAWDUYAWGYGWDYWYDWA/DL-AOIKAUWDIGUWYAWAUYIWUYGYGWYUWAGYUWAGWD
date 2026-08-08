#!/usr/bin/env node
// 🔒 Kaynak kodu şifreler (obfuscate) ve dist/ klasörüne yazar.
// Public repo'ya SADECE dist/ gider; ham kaynak repo'ya girmez.
//
// Kullanım (repo kökünde):
//   npm run obfuscate
// Kaynak kodu değiştirdikten sonra tekrar çalıştır ve dist'i commit et.
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function listJs(dir) {
    return fs
        .readdirSync(path.join(ROOT, dir))
        .filter((f) => f.endsWith('.js'))
        .map((f) => `${dir}/${f}`);
}

const SOURCE_FILES = [
    'index.js',
    'config.js',
    'database.js',
    'deploy-commands.js',
    ...listJs('commands'),
    ...listJs('events'),
    ...listJs('utils'),
];

// Orta düzey şifreleme: çalışma davranışını bozmadan okunmayı zorlaştırır.
// (selfDefending/renameGlobals kapalı — runtime'ı kırmasın diye.)
const OPTIONS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
};

// dist/ temizle (Windows kilitliyse üzerine yazarak devam et)
try {
    fs.rmSync(DIST, { recursive: true, force: true });
} catch (e) {
    console.warn('⚠️ dist/ silinemedi, üzerine yazılıyor:', e.message);
}
for (const dir of ['commands', 'events', 'utils']) {
    fs.mkdirSync(path.join(DIST, dir), { recursive: true });
}

for (const rel of SOURCE_FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const obfuscated = JavaScriptObfuscator.obfuscate(src, OPTIONS).getObfuscatedCode();
    fs.writeFileSync(path.join(DIST, rel), obfuscated);
}

// Çalışma zamanı için gerekli, gizli olmayan dosyaları kopyala
fs.copyFileSync(path.join(ROOT, 'config.json'), path.join(DIST, 'config.json'));

console.log(`✅ dist/ oluşturuldu — ${SOURCE_FILES.length} dosya şifrelendi.`);
