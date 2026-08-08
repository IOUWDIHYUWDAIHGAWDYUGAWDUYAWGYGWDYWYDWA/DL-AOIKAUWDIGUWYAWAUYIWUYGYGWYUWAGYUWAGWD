#!/usr/bin/env node
// 🔍 Yerel bilgi menüsü — bilgisayarında çalıştır:
//     node scripts/info-menu.js
//
// Neler yapabilirsin:
//   1) Botun GitHub'daki canlı durumunu gösterir
//   2) Son veritabanı yedeklerini gösterir
//   3) Botu yerelde (kaynak kod) başlatır
//   4) Slash komutlarını Discord'a eşitler
//   5) Sistemin nasıl çalıştığını özetler
const readline = require('readline');
const { execSync, spawn } = require('child_process');

// Marka şifreli modülden gelir; repo'da düz metin yok. Bulunamazsa genel ad kullan.
let BRAND = 'Bot';
try {
    ({ BRAND } = require('../utils/brand'));
} catch (e) {
    /* kaynak ağaçta utils/brand.js yoksa (ör. sadece repo klonu) genel adla devam et */
}

// GitHub repo'su yerel git remote'undan türetilir — repo adı değişirse de çalışır
function getRepo() {
    try {
        const url = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
        const m = url.match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/);
        if (m) return `${m[1]}/${m[2]}`;
    } catch (e) { /* origin yok */ }
    return null;
}

async function getJson(url) {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'info-menu' } });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

function hasToken() {
    try {
        execSync('node -e "require(\'./config.js\')"', { stdio: 'ignore', timeout: 15000 });
        return true;
    } catch (e) {
        return false;
    }
}

async function showStatus() {
    const repo = getRepo();
    if (!repo) {
        console.log("  ⚠️  git remote (origin) tanımlı değil — önce GitHub repo'sunu bağla.");
        return;
    }
    console.log(`\n  📡 ${repo} — son run'lar:`);
    const j = await getJson(`https://api.github.com/repos/${repo}/actions/runs?per_page=5`);
    if (!j || !j.workflow_runs) {
        console.log('  ⚠️  GitHub API yanıtı alınamadı (rate limit?).');
        return;
    }
    for (const r of j.workflow_runs.slice(0, 5)) {
        const state = r.status === 'in_progress' ? '🟢 ÇALIŞIYOR' : `🔴 ${r.conclusion || 'bitti'}`;
        console.log(`  ${state} | sha:${r.head_sha.slice(0, 7)} | ${r.created_at}`);
    }
    console.log('');
}

function showBackups() {
    try {
        execSync('git fetch origin -q', { stdio: 'ignore' });
    } catch (e) { /* offline olabilir */ }
    console.log("\n  💾 Son veritabanı yedek commit'leri (5 dk'da bir gelir):");
    try {
        const out = execSync('git log origin/main --oneline --grep="veritabanı yedeği" -6', { encoding: 'utf8' }).trim();
        console.log(out ? out.split('\n').map((l) => '  ' + l).join('\n') : '  (henüz yedek yok)');
    } catch (e) {
        console.log('  (henüz yedek yok — bot yeni başlamış olabilir)');
    }
    console.log('');
}

function startLocal() {
    if (!hasToken()) {
        console.log('\n  ❌ Token bulunamadı. Önce:\n');
        console.log('     cp .env.example .env');
        console.log("     (not defteriyle .env aç, TOKEN= satırına Discord token'ını yaz)");
        console.log('');
        return;
    }
    console.log("\n  ⚠️  GitHub Actions'ta bot şu an çalışıyorsa, yerelde başlatmak onun");
    console.log('      bağlantısını koparır. Devam etmek istiyorsan önce Actions run\'ını');
    console.log('      iptal et (GitHub → Actions → Cancel run).\n');
    console.log('  ▶️  Bot başlatılıyor (kaynak kod). Durdurmak için Ctrl+C...\n');
    const child = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true });
    return new Promise((resolve) => child.on('exit', resolve));
}

function deployCommands() {
    if (!hasToken()) {
        console.log('\n  ❌ Token bulunamadı. Önce .env dosyasını hazırla (bkz. 3. seçenek).\n');
        return Promise.resolve();
    }
    console.log("\n  ⚙️  Slash komutları Discord'a eşitleniyor...\n");
    const child = spawn('node', ['deploy-commands.js'], { stdio: 'inherit', shell: true });
    return new Promise((resolve) => child.on('exit', resolve));
}

function showHelp() {
    console.log(`
  ℹ️  Sistem nasıl çalışır:

  • Bot asıl olarak GitHub Actions'ta 7/24 koşar (public repo = ücretsiz dakika).
    Her ~5.8 saatte bir iş yenilenir; veritabanı 5 dakikada bir repo'ya
    commit edilir (veri kaybı ≤5 dk).
  • Public repo'da yalnızca şifrelenmiş (obfuscated) dist/ vardır; ham kaynak
    kod bu bilgisayarda durur ve repo'ya asla girmez.
  • Botun markası kodda şifreli tutulur, çalışma anında çözülür; repo'da
    aratılsa bile düz metin bulunamaz.
  • Token sadece GitHub secret'ında (TOKEN) ya da yerel .env dosyasındadır.

  Yerelde çalıştırmak için:
    cp .env.example .env   → .env'e TOKEN=... yaz
    npm install            → bağımlılıkları kur (bir kez)
    npm run dev            → kaynak koddan başlat
    npm run obfuscate      → dist/ (şifreli derleme) üret
    npm start              → dist'ten başlat

  Değişiklik yapınca GitHub'a göndermek için:
    npm run obfuscate && git add dist && git commit -m "güncelleme" && git push
`);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function loop() {
    console.log('\n┌──────────────────────────────────────────────┐');
    console.log(`│  🔍 ${BRAND} — Yerel Bilgi Menüsü            │`);
    console.log('└──────────────────────────────────────────────┘');
    console.log('  1) 📊 Bot durumu (GitHub)');
    console.log('  2) 💾 Son veritabanı yedekleri');
    console.log('  3) ▶️  Botu yerelde başlat (kaynak kod)');
    console.log('  4) ⚙️  Slash komutlarını eşitle');
    console.log('  5) ❓ Yardım / sistem bilgisi');
    console.log('  q) Çıkış');
    rl.question('\n  Seçim: ', async (ans) => {
        switch (ans.trim().toLowerCase()) {
            case '1': await showStatus(); break;
            case '2': showBackups(); break;
            case '3': await startLocal(); break;
            case '4': await deployCommands(); break;
            case '5': showHelp(); break;
            case 'q':
            case 'ç':
                console.log('  👋 Görüşürüz!');
                rl.close();
                return;
            default:
                console.log('  ❓ Geçersiz seçim.');
        }
        loop();
    });
}

loop();
