# Otobi — İstanbul Canlı Toplu Ulaşım Haritası

Otobi, İstanbul'un toplu ulaşımını **canlı** olarak 3B bir harita üzerinde gösteren bir web uygulamasıdır. İETT otobüslerini gerçek GPS verisiyle takip eder, onları gerçek yol/ray geometrisine oturtur ve veri güncellemeleri arasında akıcı şekilde hareket ettirir. Otobüslerin yanında metro, tramvay, füniküler ve vapurları da gösterir; ayrıca GTFS tarifesine dayalı bir **nereden‑nereye sefer planlayıcısı** içerir.

> ⚠️ Araştırma / hobi projesidir. Tüm veriler İBB / İETT / Metro İstanbul'a aittir (bkz. *Veri ve krediler*). Proje İBB ile bağlı veya onun tarafından onaylanmış değildir.

---

## İçindekiler

- [Özellikler](#özellikler)
- [Teknoloji yığını](#teknoloji-yığını)
- [Kullanılan API'ler ve veri kaynakları](#kullanılan-apiler-ve-veri-kaynakları)
- [Mimari](#mimari)
- [Supabase Edge Function'ları](#supabase-edge-functionları)
- [Veritabanı tabloları ve fonksiyonları](#veritabanı-tabloları-ve-fonksiyonları)
- [Canlı konum mantığı](#canlı-konum-mantığı)
- [Sefer planlayıcısı (GTFS)](#sefer-planlayıcısı-gtfs)
- [Bilinen sınırlamalar ve veri notları](#bilinen-sınırlamalar-ve-veri-notları)
- [Kurulum](#kurulum)
- [Proje yapısı](#proje-yapısı)
- [Veri ve krediler](#veri-ve-krediler)

---

## Özellikler

- **Canlı otobüs takibi** — İETT'nin gerçek zamanlı konum servisinden, hat bazında.
- **Yola oturan hareket** — otobüsler hattının yol geometrisine projekte edilir, böylece binaların üzerinden değil sokaklardan ilerler.
- **Akıcı melez animasyon** — konumlar her sorguda zıplamak yerine güncellemeler arasında sürekli kayar (rota tabanlı interpolasyon + sınırlı ölü hesap / dead‑reckoning).
- **Raylı sistem ve vapur takibi:**
  - **Metro** (M1–M11): güncel Metro İstanbul istasyonlarından çizilir ve hareket eder (örn. M4 Sabiha Gökçen'e kadar gider).
  - **Tramvay (T1/T3/T4), vapur, füniküler:** İBB GTFS'inin **gerçek tarifesinden** hesaplanır.
- **3B harita** — kabartmalı (extruded) otobüs/tren modelleri, hat renkleri, duraklar ve yaklaşan durağa kalan tahmini süre (ETA).
- **Tarife / sefer planlayıcısı** — kalkış/varış durağı + gün + saat seçilerek direkt seferler, kalkış‑varış saatleri ve süre listelenir; sefer haritada çizilir.
- **Gündüz önizleme** — gece metrolar durduğunda, saati gündüze kaydırıp metroları hareket halinde izlemeyi sağlayan mod.
- **Açık/koyu tema** ve **mobil uyumlu** alt‑panel arayüzü.

---

## Teknoloji yığını

- **Önyüz:** React 19, Vite, MapLibre GL (`react-map-gl/maplibre`), Tailwind CSS v4, lucide‑react.
- **Arka uç:** Supabase (Postgres + Row Level Security + Edge Functions/Deno + `pg_cron` + `pg_net`).
- **Veri kaynakları:** İETT SOAP servisleri, Metro İstanbul Mobil API, İBB CKAN açık veri (GTFS), OSRM (yol geometrisi), Nominatim (adres arama).

---

## Kullanılan API'ler ve veri kaynakları

### 1) İETT SOAP servisleri (otobüs) — `api.ibb.gov.tr/iett/...`

| Servis | Metotlar | Kullanım |
|---|---|---|
| `UlasimAnaVeri/HatDurakGuzergah.asmx` | `GetHat`, `GetDurak`, `GetGaraj` | Hatlar, duraklar, garajlar (statik) |
| `FiloDurum/SeferGerceklesme.asmx` | `GetHatOtoKonum_json`, `GetFiloAracKonum_json`, `GetBozukSatih`, `GetKazaLokasyon` | Canlı araç konumları, hız, filo |

> Bu servisler **yalnızca otobüs** içerir (metro/vapur yoktur).

### 2) Metro İstanbul Mobil API — `api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/...`

| Uç nokta | Durum | Kullanım |
|---|---|---|
| `GetLines` | ✅ Çalışıyor | Hat listesi |
| `GetStations` | ✅ Çalışıyor | **Tüm istasyonlar** (koordinat + sıra) — metro geometrisi buradan gelir |
| `GetServiceStatuses` | ✅ Çalışıyor | Canlı hizmet/arıza durumu |
| `GetTimeTable`, `GetStationBetweenTime` | ❌ Bozuk (404) | Tarife saatleri — **kullanılamıyor** |

Tarife uçları kapalı olduğu için metro **zamanlaması tahminidir** (gerçekçi hız + duraklarda bekleme), ama **istasyonlar/geometri gerçektir ve günceldir**.

### 3) İBB CKAN açık veri — GTFS (metro/tramvay/vapur tarifesi)

- **Uç nokta:** `GET https://data.ibb.gov.tr/api/3/action/datastore_search_sql?sql=...`
- **Paket:** "Public Transport GTFS Data" (çok modlu — metro, tramvay, vapur, füniküler, Marmaray, minibüs)

GTFS kaynak (resource) ID'leri:

| Tablo | resource_id |
|---|---|
| routes | `36b554c7-cae0-4b7e-978f-fc6a43664e88` |
| stops | `d1f7c258-bbc1-406f-9ab2-7a7c1797c673` |
| trips | `dcee1700-e59f-4a5f-8009-f602045a4507` |
| stop_times | `ac646b83-3b6f-4ca2-afb4-9071ab44d9af` |
| calendar | `c84ca913-29ac-4f15-87cd-076aef3dccd6` |
| shapes | `83317085-aa56-41b0-9447-ea579567f2cb` |
| frequencies | `a4c86ce6-64da-41e2-9584-5d83b5fb895c` |
| agency | `42ae499d-ae9c-4906-ac5c-96e0c155e00b` |

### 4) Diğer

- **OSRM** — nokta‑nokta yol geometrisi (otobüs rota çizimi, A→B).
- **Nominatim / OpenStreetMap** — adres/konum arama.

---

## Mimari

İşin can alıcı noktası, **hız limitli (rate‑limited) bir API'yi yormadan canlı kalmak**tır. Bu yüzden tüm dış veri **Supabase'e** çekilir; istemci doğrudan İETT/CKAN'ı çağırmaz, kendi hızlı veritabanımızdan okur.

```
                       ┌───────────────────────────┐
   Dış kaynaklar       │        SUPABASE           │       İstemci (React)
 ┌─────────────┐       │  ┌─────────────────────┐  │     ┌──────────────────┐
 │ İETT SOAP   │──────▶│  │ Edge Functions      │  │     │ MapLibre 3B harita│
 │ Metro İst.  │──────▶│  │  + pg_cron / pg_net │  │◀────│ - otobüs katmanı  │
 │ İBB CKAN    │──────▶│  └─────────┬───────────┘  │     │ - raylı katman    │
 │ (GTFS)      │       │            ▼               │     │ - tarife paneli   │
 └─────────────┘       │      Postgres tabloları    │     └──────────────────┘
                       └───────────────────────────┘
```

- **Statik veri** (15k+ durak, ~800 otobüs hattı, GTFS) sunucu tarafında bir kez çekilip Postgres'e yazılır.
- **Canlı veri** zamanlanmış (cron) iş ile periyodik tazelenir; tüm ziyaretçiler tek kaynaktan okur, böylece istemci başına rate‑limit riski kalkar.
- İstemci, raylı/vapur konumlarını hesaplayan `rail-positions` fonksiyonunu birkaç saniyede bir çağırır ve aradaki saniyelerde konumları **yumuşatarak** (tween) gösterir.

---

## Supabase Edge Function'ları

| Fonksiyon | Tetikleyici | Görevi |
|---|---|---|
| `refresh-static` | Haftalık cron | İETT durak + hat listesini Postgres'e yazar |
| `refresh-positions` | Dakikalık cron | İETT canlı otobüs konumlarını `vehicle_positions`'a yazar |
| `line-stops` | İstemciden | Bir hattın sıralı duraklarını (her iki yön) verir |
| `refresh-metro` | Durum 3 dk / istasyon haftalık | Metro İstanbul `GetStations` + `GetServiceStatuses` → `metro_stations` / `metro_status` |
| `import-gtfs` | Manuel / haftalık | CKAN GTFS'i sayfalı çeker, Türkçe encoding düzeltir, `gtfs_*` tablolarına yazar |
| `rail-positions` | İstemciden (~4 sn) | Aktif raylı/vapur araçlarının canlı konumunu GTFS tarifesinden hesaplar |

> `metro-explore` ve `gtfs-probe` yalnızca geliştirme sırasında API keşfi için kullanıldı; şu an devre dışı (410) bırakılmış inert uçlardır.

---

## Veritabanı tabloları ve fonksiyonları

**Otobüs sistemi:** `stops`, `lines`, `vehicle_positions`, `active_lines`, `line_stops`, `poller_state`

**Metro İstanbul (güncel):** `metro_stations` (245 güncel istasyon), `metro_status` (canlı arıza)

**GTFS (tam içe aktarım):**

| Tablo | Satır (yaklaşık) |
|---|---|
| `gtfs_agency` | 8 |
| `gtfs_routes` | 499 |
| `gtfs_stops` | 7.073 |
| `gtfs_calendar` | 49 |
| `gtfs_trips` | 14.389 |
| `gtfs_stop_times` | 199.979 |
| `gtfs_shapes` | 149.845 |
| `gtfs_frequencies` | 2.310 |
| `gtfs_trip_span` | Türetilmiş: her seferin zaman aralığı (hızlı "şu an aktif sefer" sorgusu) |

**Postgres fonksiyonları (RPC):**

- `get_all_stops()` — tüm durakları satır sınırı olmadan döndürür.
- `touch_line(p_line)` — bir hattın canlı tutulmasını işaretler.
- `plan_trip(p_from, p_to, p_weekday, p_after, p_before)` — direkt sefer planlayıcı (aşağıda).
- `search_stops(p_q)` — Türkçe‑duyarsız durak arama.
- `gtfs_norm(t)` — Türkçe karakterleri normalize eder (ı/İ/ş/ğ/ü/ö/ç → ascii).
- `rail_network()` — tramvay/vapur/füniküler/Marmaray hatlarını gerçek GTFS shape'lerinden GeoJSON olarak döndürür.

Tüm tablolarda Row Level Security açık ve yalnızca **okuma** (public read) politikası tanımlıdır; yazma işlemleri sadece sunucu (service_role) Edge Function'larından yapılır.

---

## Canlı konum mantığı

### Otobüs
Her otobüs, hattının yol çizgisine (polyline) projekte edilir ve çizgi üzerinde ilerletilir; konumlar güncellemeler arasında interpolasyon + sınırlı ölü hesapla sürekli akar. İlgili dosyalar: `src/utils/polyline.js`, `src/hooks/useBuses.js`.

### Tramvay / vapur / füniküler / Marmaray (GTFS — gerçek tarife)
`rail-positions` fonksiyonu şu adımları izler:
1. İstanbul saatine (UTC+3) göre o günün geçerli `service_id`'lerini bulur (`calendar` gün bayrakları).
2. `gtfs_trip_span`'den o an **aktif** seferleri (t0 ≤ şimdi ≤ t1) çeker.
3. Her sefer için `stop_times` (gerçek varış/kalkış saatleri) ile mevcut iki durak arasındaki ilerlemeyi hesaplar.
4. Aracı gerçek **shape** (ray geometrisi) üzerine projekte ederek konum + yön + sıradaki durak + ETA üretir.

### Metro (güncel istasyon + tahmini zamanlama)
GTFS metro geometrisi 2023'te donduğu için (bkz. *Sınırlamalar*), metro **güncel Metro İstanbul istasyonlarından** (`metro_stations`) çizilir ve yürütülür: trenler istasyon dizisi boyunca gerçekçi hız + bekleme ile hareket eder, gece servis dışı saatlerde görünmez. İlgili dosya: `src/hooks/useMetroSim.js`.

---

## Sefer planlayıcısı (GTFS)

`plan_trip` fonksiyonunun izlediği mantık:
1. **Gün kontrolü:** seçilen güne göre geçerli `service_id` listesi.
2. **Durak eşleştirme:** kalkış/varış adı Türkçe‑duyarsız aranır (`gtfs_norm`).
3. **Doğru yön:** kalkış durağının `stop_sequence`'i varış durağınınkinden **küçük** olan seferler (A < B).
4. **Saat aralığı:** kalkış saati (`departure_time`) verilen pencerede.
5. **Süre:** Varış − Kalkış (dakika). Sonuçlar hatla birlikte listelenir; seçilen seferin `shape`'i haritada çizilir.

Arayüz: arama kutusundaki **TARİFE** sekmesi (`src/components/Planner.jsx`).

---

## Bilinen sınırlamalar ve veri notları

- **GTFS metro geometrisi 2023'te donmuş.** İBB'nin GTFS feed'inde metro tarafı Mart 2023 verisidir; M4 orada Tavşantepe'de biter, Sabiha Gökçen uzantısı yoktur. Bu yüzden **metro, güncel Metro İstanbul istasyonlarından** çizilir/yürütülür (geometri günceldir, zamanlama tahminidir).
- **Metro tarife API'si kapalı.** `GetTimeTable`/`GetStationBetweenTime` 404 döndürür; bu yüzden metroda **kesin** saat verisi yoktur, zamanlama tahminidir.
- **Marmaray GTFS'te eksik.** Feed'de Marmaray için yalnızca birkaç sefer vardır (TCDD verisi eksik), bu nedenle haritada az görünür. (İleride güncel istasyon/shape ile tahmini moda alınabilir.)
- **GTFS takvim tarihleri geçmiş** (`end_date = 2024‑12‑31`); tarih aralığı yok sayılır, yalnızca haftanın günü bayrağı kullanılır.
- **Planlayıcı yalnızca direkt seferleri** bulur (aktarmalı rota hesaplamaz).

---

## Kurulum

```bash
npm install
cp .env.example .env      # Supabase URL + anon anahtarını gir
npm run dev               # http://localhost:5173
```

`.env` içindeki anahtarlar herkese açık istemci anahtarlarıdır (Row Level Security ile korunur). **`.env` asla commit edilmez**; `.gitignore`'dadır.

Gerekli ortam değişkenleri:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Proje yapısı

```
src/
  components/
    Map.jsx            3B harita, katmanların birleştiği yer
    TransitLayers.jsx  Ağ çizgileri (GTFS shape + güncel metro istasyonları)
    RailLayer.jsx      Canlı raylı/vapur araçları (GTFS + metro birleşik)
    Rail3D.js          3B tren geometrisi + hat renkleri
    Planner.jsx        Nereden‑nereye tarife paneli
    SearchBar.jsx      Hat ara / Rota / Tarife sekmeleri
    BottomPanel.jsx    Hat detay / araç listesi
  hooks/
    useBuses.js        Otobüs hareket motoru (yola oturma + interpolasyon)
    useRailVehicles.js GTFS raylı araç poll + yumuşatma
    useMetroSim.js     Güncel istasyonlardan metro (geometri + tahmini sim)
  services/
    ibbApi.js, supabase.js, gtfs.js, routeData.js, routing.js
  utils/
    polyline.js, distance.js
  context/AppContext.jsx
vite.config.js         Önbellekli + devre kesicili geliştirme proxy'si
```

---

## Veri ve krediler

- Ulaşım verisi: **İBB / İETT / Metro İstanbul Açık Veri** (`api.ibb.gov.tr`, `data.ibb.gov.tr`).
- Rota: **OSRM**. Adres arama: **Nominatim / OpenStreetMap**.
- Görsel ilham: istanbulasim.com.

Bu proje İBB / İETT / Metro İstanbul ile bağlı veya onlar tarafından onaylanmış değildir. Veriler ilgili kurumlara aittir.
