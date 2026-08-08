# 🔒 QBJBXSANFHKEMVNAOCLMBPVQ Bot — 7/24 Bedava Barındırma Rehberi

## Bu repo'da ne var?

Bu **public** repo'da botun **şifrelenmiş (obfuscated) derlemesi** (`dist/`) ve altyapı dosyaları vardır. **Ham kaynak kod repo'da YOKTUR** — yalnızca senin bilgisayarında durur (`.gitignore` ile korunur). Böylece:

- Repo'yu açan biri botun gerçek kodunu göremez (okunması zorlaştırılmış derleme görür).
- Botun adı, log mesajları ve görsellerdeki marka **QBJBXSANFHKEMVNAOCLMBPVQ** — anlamsız rastgele harfler, hiçbir şeyle ilişkilendirilemez.
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
- `dist/data.db` her 5 dakikada bir commit edilir → veri kaybı ≤5 dk, ayrıca repo aktivitesi cron'u 60 gün kuralından korur.

### Kurulum

1. **Token'ı sıfırla:** [Discord Developer Portal](https://discord.com/developers/applications) → botun → **Reset Token** → yeni token'ı kopyala. (Eski token herhangi bir yerde göründüyse artık geçersiz sayılır.)
2. **Public repo** hazır (ör. `qbjbxsanfhkemvnaoclmbpvq`). İstersen repo adını da bu rastgele isme çevirebilirsin (Settings → General → Rename; eski adres otomatik yönlendirir).
3. **Secret ekle:** Repo → Settings → Secrets and variables → Actions → `TOKEN` (zorunlu) + istersen `CLIENT_ID`, `GUILD_ID`, `ADMIN_ROLE_IDS`, `LOG_CHANNEL_ID` vb.
   > Token bir kez girilince GitHub onu **geri göstermez** — sadece değiştirilebilir. Yani setup'tan sonra token'ı sen bile okuyamazsın.
4. **Actions** sekmesinden workflow'u elle bir kez başlat; sonrasını cron devralır.
5. Doğrula: run'lar aralıksız sıralanmalı, loglarda `🛡️ QBJBXSANFHKEMVNAOCLMBPVQ Bot başlatıldı!` görünmeli.

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

- Dosya adı: `data.db`.
- 30 saniyede bir kaydedilir; GitHub Actions'ta 5 dakikada bir repo'ya commit edilir.
- Docker'da `/app/data/data.db` (kalıcı volume). Kendi makinende çalışma dizininde durur.

## 🔐 Güvenlik özeti

| Ne | Nerede |
|---|---|
| Token | Sadece GitHub secret'ında (şifreli, geri okunamaz) |
| Ham kaynak kod | Sadece senin bilgisayarında |
| Public repo içeriği | Şifrelenmiş dist/ + altyapı (marka: QBJBXSANFHKEMVNAOCLMBPVQ) |
| Veritabanı | Repo'da şifrelenmemiş ama yalnızca bot verisi (ID'ler/puanlar) |
