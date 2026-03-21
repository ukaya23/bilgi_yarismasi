# Bilgi Yarismasi - Manuel Test Senaryolari

Sunucu: http://localhost:3000
Varsayilan Admin: admin / admin123

---

## Test 1: Aktivite Akisi (Canli Log)

### Adimlar:
1. `http://localhost:3000/admin-login` adresine git, giris yap
2. Sol menuden **Dashboard** sayfasinda en altta "Son Aktiviteler" kartini gor
3. Sol menuden **Aktivite** sekmesine tikla → bos feed gorunmeli
4. Yeni bir tarayici sekmesinde `http://localhost:3000` ac → yarismaci olarak giris yap
5. Admin paneline don → Aktivite sekmesinde "PLAYER_CONNECTED" eventi gorunmeli
6. Dashboard'daki mini feed'de de ayni event gorunmeli
7. Yarismaci sekmesini kapat → "PLAYER_DISCONNECTED" eventi gelmeli

### Beklenen Sonuc:
- Eventler anlik olarak (sayfa yenilemeden) geliyor
- Her event'te zaman, tur etiketi ve aciklama var
- Farkli event turleri farkli renklerde gosteriliyor

---

## Test 2: Yonetmen Modu

### Onkosul:
- Admin panelinde giris yapilmis olmali
- Ayri bir tarayici sekmesinde `http://localhost:3000/screen` acik olmali

### Adimlar:

#### 2a - Bekleme Ekrani
1. Admin'de sol menuden **Yonetmen Modu** sekmesine git
2. "Bekleme Ekrani" butonuna tikla
3. Screen sekmesine bak → idle/bekleme ekrani gorunmeli

#### 2b - Siralama Tablosu
1. "Siralama Tablosu" butonuna tikla
2. Screen'de siralama tablosu tam ekran gorunmeli (yarismacilarin skorlari ile)

#### 2c - Ozel Metin
1. "Ozel Metin Goster" bolumune git
2. Ana metin: "Merhaba Dunya" / Alt metin: "Test mesaji"
3. "Ekranda Goster" tikla
4. Screen'de buyuk mor-yesil gradient metin gorunmeli

#### 2d - Gorsel Goster
1. "Gorsel Goster" bolumune git
2. URL: `/uploads/` altindaki bir gorsel (veya herhangi bir URL)
3. "Ekranda Goster" tikla
4. Screen'de tam ekran gorsel gorunmeli

#### 2e - Kursu
1. "Kursu Goster" butonuna tikla
2. Screen'de podium (1.-2.-3.) gorunmeli

### Beklenen Sonuc:
- Her buton screen'i anlik olarak degistiriyor
- Gecisler animasyonlu
- Tekrar "Bekleme Ekrani"na donebiliyoruz

---

## Test 3: Toplu Soru Ice/Disa Aktarma

### Adimlar:

#### 3a - Sablon Indir
1. Admin'de sol menuden **Sorular** sekmesine git
2. "Sablon Indir" butonuna tikla
3. `soru_sablonu.xlsx` dosyasi indirilmeli
4. Excel'de ac → 2 ornek satir ve baslik satirlari gorunmeli:
   `content | type | options | correct_keys | points | duration | category`

#### 3b - Soru Yukle
1. Indirilen sablonu ac, 2-3 yeni soru ekle:
   - Satirlar: content (zorunlu), type (MULTIPLE_CHOICE veya OPEN_ENDED)
   - Coktan secmeli icin options: `A;B;C;D` (noktali virgul ile ayir)
   - correct_keys: `B` veya `Cevap metni`
2. Kaydet (xlsx olarak)
3. Admin'de "Ice Aktar" butonuna tikla → dosyayi sec
4. Import sonuc modali acilmali:
   - Toplam satir, basarili ve hatali sayilari
   - Her satirin durumu tablo halinde

#### 3c - Hata Testi
1. Sablonda bir satirin `content` alanini bos birak
2. Tekrar yukle
3. O satir "Soru metni bos" hatasi ile gosterilmeli, diger satirlar basarili olmali

#### 3d - Disa Aktar
1. "Disa Aktar" butonuna tikla
2. `sorular.xlsx` dosyasi indirilmeli
3. Excel'de ac → tum sorular listeli olmali

### Beklenen Sonuc:
- Sablon dogru formatta
- Toplu yukleme calisiyorsa sorular tabloda gorunuyor
- Hatali satirlar raporlaniyor, basarilar ekleniyor
- Disa aktarma tum sorulari iceriyor

---

## Test 4: Medya Kutuphanesi

### Adimlar:

#### 4a - Resim Yukleme
1. Admin'de **Sorular** → "Yeni Soru" butonuna tikla
2. Soru formunda "Medya yuklemek icin tiklayin" alanini gor
3. Bir resim dosyasi sec (JPEG/PNG)
4. Resim onizlemesi gorunmeli
5. Soruyu kaydet

#### 4b - Ses Yukleme
1. Yeni soru ac
2. Bir MP3 dosyasi sec
3. Audio player onizlemesi gorunmeli (play/pause kontrolleri ile)
4. Soruyu kaydet

#### 4c - Video Yukleme
1. Yeni soru ac
2. Bir MP4 dosyasi sec
3. Video player onizlemesi gorunmeli
4. Soruyu kaydet

#### 4d - Galeriden Secim
1. Yeni soru ac
2. "Galeriden Sec" butonuna tikla
3. Galeri modali acilmali
4. Filtreleme butonlari: Tumunu / Resimler / Sesler / Videolar
5. Bir medyaya tikla → otomatik secilip form'a eklenmeli
6. Modal kapanmali, onizleme gorunmeli

#### 4e - Ekranda Gosterim
1. Medyali (resim/ses/video) bir soruyu baslat
2. Screen sekmesine bak:
   - Resimli soru: gorsel buyuk gosteriliyor
   - Sesli soru: audio player gorunuyor, otomatik basliyor
   - Videolu soru: video player gorunuyor, otomatik basliyor

#### 4f - Silme Korumasi
1. Bir soruya atanmis medyayi silmeye calis (API uzerinden veya ileride silindiginde)
2. "Bu dosya X soruda kullaniliyor" hatasi donmeli

### Beklenen Sonuc:
- Resim, ses ve video yukleniyor
- Galeri tum medyalari listeliyor, filtreleme calisiyor
- Ekranda dogru player (img/audio/video) render ediliyor
- Kullanilan medya silinemiyor

---

## Hizli Kontrol Listesi

| Test | Sonuc |
|------|-------|
| Admin giris | [ ] |
| Aktivite eventi gorunuyor | [ ] |
| Yonetmen: Metin goster | [ ] |
| Yonetmen: Siralama goster | [ ] |
| Yonetmen: Idle'a don | [ ] |
| Sablon indir | [ ] |
| Excel import (basarili) | [ ] |
| Excel import (hatali satir) | [ ] |
| Excel export | [ ] |
| Resim yukleme + onizleme | [ ] |
| Ses yukleme + onizleme | [ ] |
| Galeriden secim | [ ] |
| Screen'de medya render | [ ] |
