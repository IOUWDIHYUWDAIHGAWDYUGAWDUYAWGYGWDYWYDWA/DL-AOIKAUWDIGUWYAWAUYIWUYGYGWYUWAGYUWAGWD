#!/usr/bin/env node
// 🔐 Sızıntı koruması — Discord token deseni repo'ya sızmış mı tarar.
// Bulursa çıkış kodu 1 ile durur; push (pre-push hook) ve GitHub Actions
// workflow'u bu yüzden başlamadan önce çalıştırır.
//
// Kullanım:
//   node scripts/check-secrets.js
const fs = require('fs');
const path = require('path');

// Discord bot token deseni: MTA... / NTA... üç parçalı
const TOKEN_PATTERN = /[MN][A-Za-z0-9]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}/g;

// Asla taranmayacak (ve asla push edilmeyecek) klasörler
const IGNORED_DIRS = new Set(['node_modules', '.git', '.freebuff']);

// İkili/ilgisiz dosya uzantıları
const SKIP_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ttf', '.woff', '.woff2', '.db', '.sqlite', '.wasm', '.lock', '.enc']);

const found = [];

function walk(dir) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (SKIP_EXTS.has(ext)) continue;
            let content;
            try {
                content = fs.readFileSync(full, 'utf8');
            } catch {
                continue; // ikili dosya vb.
            }
            const matches = content.match(TOKEN_PATTERN);
            if (matches) found.push({ file: full, count: matches.length });
        }
    }
}

walk('.');

if (found.length > 0) {
    console.error('🚨 SIZINTI TESPIT EDILDI! Discord token deseni şu dosyalarda bulundu:');
    for (const f of found) {
        console.error(`   - ${f.file} (${f.count} eşleşme)`);
    }
    console.error('   Push ENGELlENDI. Token içeren dosyayı temizle:');
    console.error('   - config.json içindeki "token" alanını boşalt');
    console.error('   - .env dosyasını sil (varsa) ve asla commit etme');
    console.error('   - git tarihçesinde kaldıysa: git filter-repo ile temizle');
    process.exit(1);
}

console.log('✅ Sızıntı taraması temiz: hiçbir dosyada Discord token deseni yok.');
