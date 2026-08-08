# 🔒 QBJBXSANFHKEMVNAOCLMBPVQ Bot — 7/24 Bedava Barındırma Rehberi

## Bu repo'da ne var?

Bu **public** repo'da botun **şifrelenmiş (obfuscated) derlemesi** (`dist/`) ve altyapı dosyaları vardır. **Ham kaynak kod repo'da YOKTUR** — yalnızca senin bilgisayarında durur (`.gitignore` ile korunur). Böylece:

- Repo'yu açan biri botun gerçek kodunu göremez (okunması zorlaştırılmış derleme görür).
- Botun gerçek markası kod içinde **şifreli** tutulur (çalışma anında XOR ile çözülür) — repo'da aratılsa bile düz metin olarak bulunamaz.
- Discord token'ı asla kodda yoktur; sadece GitHub secret'ında (şifreli) durur.

> ⚠️ Dürüst not: Kod şifreleme (obfuscation) okumayı **zorlaştırır**, imkânsız kılmaz. Kararlı biri çözmek için uğraşabilir. Gerçek gizlilik = kaynağın yayınlanmamasıdır; bu repo bunu sağlar. Token ise gerçekten şifrelidir (GitHub secrets, geri okunamaz).

## Geliştirme döngüsü (kaynağı düzenlerken)

Kaynak dosyalar (index.js, commands/, utils/ vb.) bilgisayarında durur. Değişiklik yaptıktan sonra:

```bash
npm run obfuscate   # dist/ klasörünü yeniden şifreler
git add dist && git commit -m "güncelleme" && git push
```

Bot her yerde `dist/index.js`'ten çalışır (`npm start`), kaynaktan çalıştırmak için `npm run dev`.

---

## 🥇 Kredi kartı gerektirmeyen: GitHub Actions (public repo)

GitHub, public repo'larda Actions dakikalarını ücretsiz verir (sınırsız). `.github/workflows/bot.yml` hazır:

- Cron her 10 dakikada bir tetikler; `concurrency` kuyruğu sayesinde bot ~5.8 saatlik işler halinde **kesintisiz** koşar (tek iş limiti 6 saattir).
- Veritabanı her **~40 saniyede bir** denetlenir; veri değiştiyse **şifrelenip SADECE Telegram'a** yüklenir (veri kaybı ≤~1 dk). Repo'ya veri düşmez; yalnızca son yedeğin işaretçisi (`.backup-ref.json`) commit edilir — kalp atışı push'u aynı zamanda botu ayakta tutan tetikleyicidir.

### Kurulum

1. **Token'ı sıfırla:** [Discord Developer Portal](https://discord.com/developers/applications) → botun → **Reset Token** → yeni token'ı kopyala. (Eski token herhangi bir yerde göründüyse artık geçersiz sayılır.)
2. **Public repo** hazır (ör. `qbjbxsanfhkemvnaoclmbpvq`). İstersen repo adını da bu rastgele isme çevirebilirsin (Settings → General → Rename; eski adres otomatik yönlendirir).
3. **Secret ekle:** Repo → Settings → Secrets and variables → Actions → `TOKEN` (zorunlu) + `DB_KEY` (zorunlu — veritabanı şifresi) + istersen `CLIENT_ID`, `GUILD_ID`, `ADMIN_ROLE_IDS`, `LOG_CHANNEL_ID`, `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` (Telegram yedeği, aşağıya bak) vb.
   > `DB_KEY` üretmek için: `node scripts/db-crypto.js keygen` (64 hex karakter çıkarır, bu çıktıyı secret'a yapıştır).
   > Token bir kez girilince GitHub onu **geri göstermez** — sadece değiştirilebilir. Yani setup'tan sonra token'ı sen bile okuyamazsın.
4. **Actions** sekmesinden workflow'u elle bir kez başlat; sonrasını cron devralır.
5. Doğrula: run'lar aralıksız sıralanmalı, loglarda başlatma mesajı görünmeli.

### Sınırlar

- Bot her ~6 saatte bir birkaç saniye yeniden bağlanır.
- Pazartesi 00:00'daki haftalık dağıtım tam iş değişimine denk gelirse o hafta kaçabilir.
- Private repo'da 2.000 dk/ay limiti olduğu için 24/7 sadece public'te çalışır.

---

## 🥈 Kartın varsa: Oracle Cloud Always Free (en sağlam)

Gerçek VM, uyumaz, kalıcı disk. Kart ister ama ücret çekilmez (4 ARM çekirdek / 24 GB RAM).

```bash
sudo cp deploy/qbjbxsanfhkemvnaoclmbpvq-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now qbjbxsanfhkemvnaoclmbpvq-bot
```

Docker: `cp .env.example .env` → `docker compose up -d --build` (DB `/app/data/data.db` volume'ünde).

## 🥉 Kendi bilgisayarın (kart yok, en gizli)

Sürekli açık bir PC/Raspberry Pi: `deploy/qbjbxsanfhkemvnaoclmbpvq-bot.service` ile servis olarak çalıştır. Kod hiçbir yere gitmez.

---

## 🗄️ Veritabanı

- Dosya adı: `data.db` — **repo'da HİÇ tutulmaz** (ne düz ne şifreli).
- 30 saniyede bir diske kaydedilir; her **~40 saniyede bir** denetlenir ve veri değiştiyse **şifrelenip (AES-256-GCM, `DB_KEY`) Telegram'a** yüklenir.
- Repo'ya yalnızca son yedeğin Telegram `file_id` işaretçisi (`.backup-ref.json`) işlenir — bu bir veri değildir; klonlayan biri hiçbir şey okuyamaz.
- Runner'lar geçici olduğu için her run başında DB **Telegram'dan indirilip çözülür** (`node scripts/db-restore.js`). Referans yoksa (ilk çalıştırma) mevcut `dist/data.db` ile devam edilir ve ilk 5 dk'da Telegram'a yüklenir.
- Docker'da `/app/data/data.db` (kalıcı volume). Kendi makinende çalışma dizininde durur (yerel `data.db` repoya gitmez).

---

## 🤖 Telegram komutları (veritabanı sorgulama)

Yedekleme için kullandığın Telegram botuna (`TELEGRAM_TOKEN`) doğrudan komut yazabilirsin; bot, veritabanından güncel özetlerle cevap verir (`scripts/db-telegram.js`):

| Komut | Ne gösterir |
|---|---|
| `/durum` | Üye/gem/uyarı/kara liste sayıları, rütbeler, haftalık ses & mesaj, son yedek zamanı |
| `/top` | En yüksek gem'e sahip ilk 10 üye |
| `/uye <id>` | Tek üyenin rütbe, gem, uyarı, kara liste durumu + son gem işlemleri |
| `/loglar` | Son 10 gem işlemi |
| `/uyarilar` | Son 10 uyarı |
| `/yardim` | Komut listesi |

> Üye adları, `TOKEN` (Discord) secret'ı varsa Discord'dan çözülür; yoksa ID görüntülenir.

---

## ☁️ Telegram yedeği (repo dışı, önerilir)

Repo veya GitHub hesabı kaybedilirse (askıya alma, silme) şifreli DB de gider. Bu yüzden bot, her 5 dakikalık yedekte şifreli DB'yi (`data.db.enc`) ayrıca **Telegram'a** yükler: repo'dan bağımsız ikinci bir kopya, telefondan bile indirilebilir. Yedek `scripts/db-backup.js` tarafından yapılır — yeni bağımlılık gerekmez (Node 18+ yerleşik fetch).

1. Telegram'da [@BotFather](https://t.me/BotFather) → `/newbot` → botunu oluştur, çıkan token'ı kopyala (`TELEGRAM_TOKEN`).
2. Botu **özel bir kanala** ekle (veya botla kendi sohbetini aç) ve bir mesaj yazdır.
3. Sohbet ID'sini bul: tarayıcıda `https://api.telegram.org/bot<TOKEN>/getUpdates` aç; mesajının `"chat":{"id":...}` alanındaki sayıyı kopyala. Özel kanal ID'si genelde `-100...` ile başlar (`TELEGRAM_CHAT_ID`).
4. GitHub → Settings → Secrets and variables → Actions → `TELEGRAM_TOKEN` ve `TELEGRAM_CHAT_ID` ekle.

Başka yerde de çalıştırılabilir (Docker, systemd, cron):

```bash
TELEGRAM_TOKEN=... TELEGRAM_CHAT_ID=... node scripts/db-backup.js
```

## 🔐 Güvenlik özeti

| Ne | Nerede |
|---|---|
| Token | Sadece GitHub secret'ında (şifreli, geri okunamaz) |
| Ham kaynak kod | Sadece senin bilgisayarında |
| Public repo içeriği | Şifrelenmiş dist/ + altyapı; botun gerçek adı düz metin olarak YOK |
| Veritabanı | Repo'da YOK — yalnızca Telegram'da şifreli (AES-256); repo'da sadece son yedeğin file_id işaretçisi |
