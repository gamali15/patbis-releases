import re

def fuzzy_match_barcode(query, known_uids, threshold=0.6):
    """
    Tırtıklı, silinmiş veya eksik taranan barkodları bilinen barkodlarla eşleştirir.
    Sorguda '*' veya eksik karakterler olabilir.
    """
    if not query or not known_uids:
        return []
        
    query = query.strip().upper()
    matches = []
    
    # 1. Regex Match (Örn: 2103*18347 -> 2103\d*18347)
    if "*" in query:
        regex_pattern = "^" + query.replace("*", ".*") + "$"
        try:
            compiled = re.compile(regex_pattern)
            for uid in known_uids:
                if compiled.match(uid):
                    matches.append((uid, 1.0, "Desen Eşleşmesi"))
        except Exception:
            pass
            
    # 2. Levenshtein Distance (Karakter benzerliği)
    def levenshtein_ratio(s1, s2):
        s1, s2 = s1.lower(), s2.lower()
        rows = len(s1) + 1
        cols = len(s2) + 1
        distance = [[0 for _ in range(cols)] for _ in range(rows)]

        for i in range(1, rows):
            distance[i][0] = i
        for k in range(1, cols):
            distance[0][k] = k

        for col in range(1, cols):
            for row in range(1, rows):
                if s1[row-1] == s2[col-1]:
                    cost = 0
                else:
                    cost = 1
                distance[row][col] = min(
                    distance[row-1][col] + 1,      # Deletion
                    distance[row][col-1] + 1,      # Insertion
                    distance[row-1][col-1] + cost  # Substitution
                )
                
        max_len = max(len(s1), len(s2))
        if max_len == 0:
            return 1.0
        return (max_len - distance[row][col]) / max_len

    # Eğer regex ile sonuç bulamadıysak Levenshtein yapalım
    if not matches:
        for uid in known_uids:
            ratio = levenshtein_ratio(query, uid)
            if ratio >= threshold:
                matches.append((uid, round(ratio, 2), "Mesafe Analizi"))
                
    # Skora göre sırala
    matches.sort(key=lambda x: x[1], reverse=True)
    return matches[:5]


def classify_damage_report(aciklama):
    """
    Helezonik Doğal Dil Analiz Modeli (Kural tabanlı minik NLP).
    Hasarlı ürün fotoğraflarının açıklamasını analiz ederek hasar kategorisini ve ciddiyetini belirler.
    """
    if not aciklama:
        return {"kategori": "Bilinmiyor", "ciddiyet": "Düşük", "skor": 0.0}
        
    aciklama = aciklama.lower()
    
    kategoriler = {
        "Yırtık/Açık Koli": ["yırtık", "yirtik", "açık", "acik", "kesik", "patlak", "açılmış"],
        "Ezilmiş/Deforme Kutu": ["ezik", "ezilmis", "ezilmiş", "darbe", "göçük", "yamuk"],
        "Sıvı Teması": ["islak", "ıslak", "su", "nem", "akmış", "akmis", "sıvı", "sivi"],
        "Etiket Hasarı": ["okunmuyor", "silik", "etiket", "barkod yok", "yıpranmış", "ypranmis"]
    }
    
    en_iyi_kat = "Diğer"
    en_yuksek_skor = 0.0
    
    for kat, anahtarlar in kategoriler.items():
        skor = 0.0
        for anahtar in anahtarlar:
            if anahtar in aciklama:
                skor += 1.0
        if skor > en_yuksek_skor:
            en_yuksek_skor = skor
            en_iyi_kat = kat
            
    # Ciddiyet seviyesi belirle
    ciddiyet = "Düşük"
    if any(w in aciklama for w in ["aşırı", "asiri", "çok", "cok", "tamamen", "kullanılamaz", "mahvolmuş", "ağır", "agir"]):
        ciddiyet = "Yüksek"
    elif any(w in aciklama for w in ["orta", "kısmi", "kismi", "biraz", "hafif"]):
        ciddiyet = "Orta"
        
    # Güven skoru hesapla
    toplam_kelime = len(aciklama.split())
    güven_skoru = min(1.0, 0.4 + (en_yuksek_skor * 0.2)) if en_yuksek_skor > 0 else 0.1
    
    return {
        "kategori": en_iyi_kat if en_yuksek_skor > 0 else "Belirsiz / Genel Hasar",
        "ciddiyet": ciddiyet,
        "skor": round(güven_skoru, 2)
    }
