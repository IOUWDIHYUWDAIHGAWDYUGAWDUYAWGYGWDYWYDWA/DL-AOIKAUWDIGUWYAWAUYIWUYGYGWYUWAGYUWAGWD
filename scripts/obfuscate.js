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
// Not: controlFlowFlattening kapalı — canvas çizimini 4-6 sn'ye çıkarıp
// Discord'da 10062 "Unknown interaction" hatasına yol açıyordu. Tüm string'ler
// yine base64'lü (stringArrayThreshold: 1), marka ayrıca XOR modülünde şifreli.
const OPTIONS = {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 1,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
};

// Görsel çizim (render) sıcak yolu: ağır obfuscation bu dosyayı 10 sn'ye kadar
// yavaşlatıyordu (drawText iç döngüsündeki her string erişimi fonksiyon çağrısı).
// Bu dosyada gizli veri YOK — marka (HelmsDeep) ayrı utils/brand.js'te XOR'lu.
// O yüzden hafif obfuscation kullanılır: hex tanımlayıcılar + compact, string
// dizisi yok → render ~50-100ms'ye döner, gizlilik kaybı olmaz.
const LIGHT_OPTIONS = {
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: false,
    controlFlowFlattening: false,
    unicodeEscapeSequence: false,
};

const LIGHT_FILES = new Set(['utils/imagePanel.js']);

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
    const opts = LIGHT_FILES.has(rel) ? LIGHT_OPTIONS : OPTIONS;
    const obfuscated = JavaScriptObfuscator.obfuscate(src, opts).getObfuscatedCode();
    fs.writeFileSync(path.join(DIST, rel), obfuscated);
}

// Çalışma zamanı için gerekli config.json'u kopyala ama GİZLİ alanları mutlaka boşalt.
// Token/voiceToken/resetPassword/ownerPanelCode gibi değerler YALNIZCA ortam
// değişkenlerinden (GitHub Actions secret'ları) gelmeli — repo'ya asla düşmemeli.
// (Geçmişte resetPassword bu kopyalama yüzünden public dist/config.json'a sızmıştı.)
const SECRET_CONFIG_KEYS = ['token', 'voiceToken', 'resetPassword', 'ownerPanelCode'];
function copySanitizedConfig() {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
    for (const key of SECRET_CONFIG_KEYS) {
        if (key in raw) raw[key] = '';
    }
    fs.writeFileSync(path.join(DIST, 'config.json'), JSON.stringify(raw, null, 2));
}
copySanitizedConfig();

console.log(`✅ dist/ oluşturuldu — ${SOURCE_FILES.length} dosya şifrelendi.`);
