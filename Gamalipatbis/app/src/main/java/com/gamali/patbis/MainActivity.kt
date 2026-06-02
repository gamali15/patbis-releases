package com.gamali.patbis

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.*
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.Executors
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    companion object {
        const val GS = '\u001D' // GS (Group Separator) — CK65 AI ayracı

        // ── OTURUM PREFS KEY'LERİ ──────────────────────────────────────
        // Her depo için: "session_33-2019-00422" altında şu key'ler saklanır:
        //   gs1_indexed   → Set<String> ("0|barkod", "1|barkod" ...)
        //   other_indexed → Set<String>
        //   kullanici     → String
        //   kullanim      → String
        //   tarih         → String
        //   aktif         → Boolean (oturum devam ediyor mu)
        fun depoSessionKey(depo: String, field: String) = "session_${depo}_$field"

        private const val EXPORT_KAYDET  = 0 // Oturumu canlı bırak
        private const val EXPORT_TEMIZLE = 1 // Oturumu sil + listeyi temizle
    }

    // ── CİHAZ TESPİTİ ────────────────────────────────────────────────
    private val isHoneywell: Boolean by lazy {
        Build.MANUFACTURER.contains("Honeywell", ignoreCase = true) ||
                Build.BRAND.contains("Honeywell", ignoreCase = true)
    }

    // ── DEPO TANIMI ──────────────────────────────────────────────────
    private val depoList = listOf(
        "33-2019-00419", "33-2019-00422", "33-2019-00425",
        "33-2019-00428", "33-2019-00454", "33-2019-00457"
    )
    private val QR_PREFIX = "GAMALI_DEPO_"
    private val DISPLAY_PREFIX = "OZALTIN "
    private val shortCodeMap = mapOf(
        "419" to "33-2019-00419", "422" to "33-2019-00422",
        "425" to "33-2019-00425", "428" to "33-2019-00428",
        "454" to "33-2019-00454", "457" to "33-2019-00457"
    )

    // ── UI ───────────────────────────────────────────────────────────
    private lateinit var tvCount: TextView
    private lateinit var tvLastScan: TextView
    private lateinit var tvDepoInfo: TextView
    private lateinit var listView: ListView
    private lateinit var btnDepo: Button
    private lateinit var btnCamera: Button
    private lateinit var btnClear: Button
    private lateinit var btnExport: Button
    private lateinit var btnShare: Button
    private lateinit var btnCikis: Button
    private lateinit var etManualInput: EditText
    private lateinit var btnManualEkle: Button
    private lateinit var viewFinder: PreviewView
    private lateinit var statusBar: View

    // ── VERİ ─────────────────────────────────────────────────────────
    private val gs1List   = mutableListOf<String>()
    private val otherList = mutableListOf<String>()
    private var secilenDepo  = ""
    private var kullaniciAdi = ""
    private var kullanimYeri = ""
    private var sayimTarihi  = ""

    // ── SUNUCU VE OTURUM VERİLERİ ──────────────────────────────────────
    private var activeServerUrl    = ""
    private var loggedInPersonelId   = -1
    private var loggedInPersonelAd   = ""
    private var loggedInPersonelUnvan = ""
    private var sessionToken        = ""

    private lateinit var adapter: BarcodeListAdapter
    private lateinit var prefs: SharedPreferences
    private var isCameraOpen     = false
    private var isDepoScanMode   = false
    private var lastCameraScanTime = 0L
    private val toneGen = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)

    // ── LAUNCHER'LAR ─────────────────────────────────────────────────
    private val exportLauncher =
        registerForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
            uri?.let { saveToFile(it) }
        }
    private val cameraPermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
            if (ok) startCamera()
            else Toast.makeText(this, "Kamera izni gerekli!", Toast.LENGTH_SHORT).show()
        }
    private var lastCapturedPhotoUri: Uri? = null
    private var photoTargetUid: String = ""
    private val takePhotoLauncher =
        registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
            if (success) {
                lastCapturedPhotoUri?.let { uri ->
                    showDamageDescriptionDialog(photoTargetUid, uri)
                }
            } else {
                Toast.makeText(this, "Fotoğraf çekimi iptal edildi.", Toast.LENGTH_SHORT).show()
            }
        }

    // ── HONEYWELL BROADCAST ──────────────────────────────────────────
    private val scanReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            intent?.let {
                android.util.Log.d("PATBIS_SCAN", "Action: ${it.action}")
                it.extras?.keySet()?.forEach { k ->
                    android.util.Log.d("PATBIS_SCAN", "  Key: $k = ${it.extras!!.get(k)}")
                }

                var barcode: String? = null
                val keys = arrayOf(
                    "data",
                    "com.honeywell.decode_results",
                    "com.honeywell.intent.extra.SCAN_DATA_STRING",
                    "barcode_string",
                    "scannerdata",
                    "SCAN_RESULT"
                )
                for (key in keys) {
                    barcode = it.getStringExtra(key)
                        ?: it.getByteArrayExtra(key)?.let { b -> String(b) }
                    if (barcode != null) break
                }
                if (barcode == null) {
                    it.extras?.keySet()?.forEach { key ->
                        val v = it.extras!!.get(key)
                        if (v is String && v.isNotEmpty() &&
                            !key.contains("version", true) &&
                            !key.contains("source", true)) {
                            barcode = v; return@forEach
                        } else if (v is ByteArray) {
                            barcode = String(v); return@forEach
                        }
                    }
                }
                barcode?.let { b -> processBarcode(b) }
            }
        }
    }

    // ── LIFECYCLE ────────────────────────────────────────────────────
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences("patbis_prefs", Context.MODE_PRIVATE)

        activeServerUrl = prefs.getString("active_server_url", "") ?: ""
        loggedInPersonelId = prefs.getInt("logged_in_personel_id", -1)
        loggedInPersonelAd = prefs.getString("logged_in_personel_ad", "") ?: ""
        loggedInPersonelUnvan = prefs.getString("logged_in_personel_unvan", "") ?: ""
        sessionToken = prefs.getString("session_token", "") ?: ""

        tvCount       = findViewById(R.id.tvCount)
        tvLastScan    = findViewById(R.id.tvLastScan)
        tvDepoInfo    = findViewById(R.id.tvDepoInfo)
        listView      = findViewById(R.id.listView)
        btnDepo       = findViewById(R.id.btnDepo)
        btnCamera     = findViewById(R.id.btnCamera)
        btnClear      = findViewById(R.id.btnClear)
        btnExport     = findViewById(R.id.btnExport)
        btnShare      = findViewById(R.id.btnShare)
        btnCikis      = findViewById(R.id.btnCikis)
        etManualInput = findViewById(R.id.etManualInput)
        btnManualEkle = findViewById(R.id.btnManualEkle)
        viewFinder    = findViewById(R.id.viewFinder)
        statusBar     = findViewById(R.id.statusBar)

        adapter = BarcodeListAdapter(this, gs1List, otherList)
        listView.adapter = adapter

        // Eski tek-oturum sistemiyle gelen yarım sayım varsa taşı
        migrateOldSession()

        btnDepo.setOnClickListener { showDepoDialog() }

        btnCamera.setOnClickListener {
            if (isCameraOpen) closeCamera()
            else openCamera(depoMode = false)
        }

        val manualEkleAction = {
            val girdi = etManualInput.text.toString().trim()
            if (girdi.isNotEmpty()) {
                manualGirisIsle(girdi)
                etManualInput.text.clear()
            }
        }
        btnManualEkle.setOnClickListener { manualEkleAction() }
        etManualInput.setOnEditorActionListener { _, actionId, event ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE ||
                (event?.keyCode == android.view.KeyEvent.KEYCODE_ENTER &&
                        event.action == android.view.KeyEvent.ACTION_DOWN)) {
                manualEkleAction(); true
            } else false
        }

        btnClear.setOnClickListener {
            if (gs1List.isEmpty() && otherList.isEmpty()) return@setOnClickListener
            AlertDialog.Builder(this)
                .setTitle("Listeyi Temizle")
                .setMessage("${gs1List.size + otherList.size} barkod silinecek.\n\n⚠ Bu deponun kayıtlı oturumu da silinir!")
                .setPositiveButton("Evet, Temizle") { _, _ -> clearAll() }
                .setNegativeButton("Hayır", null).show()
        }

        btnShare.setOnClickListener { shareFile() }
        btnCikis.setOnClickListener { cikisYap() }

        btnExport.setOnClickListener {
            if (gs1List.isEmpty() && otherList.isEmpty()) {
                Toast.makeText(this, "Liste boş!", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (secilenDepo.isEmpty()) {
                Toast.makeText(this, "Önce depo seçin!", Toast.LENGTH_SHORT).show()
                showDepoDialog(); return@setOnClickListener
            }
            showExportDialog()
        }

        listView.setOnItemLongClickListener { _, _, position, _ ->
            val item = getDisplayItem(position)
            val cleanItem = item.replace("⚡ ", "").trim()

            if (activeServerUrl.isNotEmpty() && loggedInPersonelId != -1) {
                AlertDialog.Builder(this)
                    .setTitle("📦 Ürün İşlemleri")
                    .setMessage(cleanItem)
                    .setPositiveButton("📷 Hasar Raporu Ekle") { _, _ ->
                        initiateDamageCapture(cleanItem)
                    }
                    .setNegativeButton("🗑 Stoktan Sil") { _, _ ->
                        AlertDialog.Builder(this)
                            .setTitle("Silme Onayı")
                            .setMessage("Bu barkod sunucu stokundan düşülecek. Emin misiniz?\n\n$cleanItem")
                            .setPositiveButton("Evet, Sil") { _, _ ->
                                deleteBarcodeFromServer(cleanItem, position)
                            }
                            .setNegativeButton("İptal", null).show()
                    }
                    .setNeutralButton("İptal", null)
                    .show()
            } else {
                AlertDialog.Builder(this)
                    .setTitle("Sil")
                    .setMessage("Bu barkodu kaldır?\n\n$item")
                    .setPositiveButton("Sil") { _, _ ->
                        removeItemAt(position)
                        saveDepoSession(secilenDepo)
                        updateUI()
                    }
                    .setNegativeButton("İptal", null).show()
            }
            true
        }

        findViewById<TextView>(R.id.btnAbout).setOnClickListener { showAboutDialog() }

        updateUI()

        // Açılışta depo seçilmemişse dialog aç
        if (secilenDepo.isEmpty()) {
            Handler(Looper.getMainLooper()).postDelayed({ showDepoDialog() }, 400)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ── OTURUM YÖNETİMİ ────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Deponun aktif (kayıtlı) oturumu var mı kontrol et.
     */
    private fun hasActiveSession(depo: String): Boolean {
        val aktif = prefs.getBoolean(depoSessionKey(depo, "aktif"), false)
        val gs1   = prefs.getStringSet(depoSessionKey(depo, "gs1_indexed"), null)
        if (aktif && !gs1.isNullOrEmpty()) return true

        // JSON dosya yedek kontrolü
        try {
            val backupFile = java.io.File(filesDir, "session_${depo}_backup.json")
            if (backupFile.exists()) {
                val jsonStr = backupFile.readText(Charsets.UTF_8)
                val json = JSONObject(jsonStr)
                val fileGs1Arr = json.optJSONArray("gs1_list")
                val fileOtherArr = json.optJSONArray("other_list")
                val fileCount = (fileGs1Arr?.length() ?: 0) + (fileOtherArr?.length() ?: 0)
                if (json.optBoolean("aktif", false) && fileCount > 0) {
                    return true
                }
            }
        } catch (e: Exception) {
            // ignore
        }
        return false
    }

    /**
     * Seçilen depoya geç. Eğer o depoda aktif oturum varsa devam et mi sor.
     * Mevcut depodaki listeyi otomatik kaydet.
     */
    private fun switchDepo(yeniDepo: String) {
        // Mevcut oturumu kaydet — ama sadece farklı bir depoya geçiyorsak
        // (aynı depoya geçişte liste önce clear edilir, boş kayıt yazılır)
        if (secilenDepo.isNotEmpty() && secilenDepo != yeniDepo &&
            (gs1List.isNotEmpty() || otherList.isNotEmpty())) {
            saveDepoSession(secilenDepo)
        }

        if (hasActiveSession(yeniDepo)) {
            // Bu depoda kayıtlı oturum var → seçenek sun
            val freshPrefs = getSharedPreferences("patbis_prefs", Context.MODE_PRIVATE)
            val gs1Saved   = freshPrefs.getStringSet(depoSessionKey(yeniDepo, "gs1_indexed"), emptySet())!!
            val otherSaved = freshPrefs.getStringSet(depoSessionKey(yeniDepo, "other_indexed"), emptySet())!!
            val tarihSaved = freshPrefs.getString(depoSessionKey(yeniDepo, "tarih"), "") ?: ""
            
            // JSON yedeği de hesaba katarak en güncel adeti gösterelim
            val toplamSaved = getSessionCount(yeniDepo)

            AlertDialog.Builder(this)
                .setTitle("📦 $DISPLAY_PREFIX$yeniDepo")
                .setMessage(
                    "Bu depoda kayıtlı sayım var:\n\n" +
                            "🗓 Tarih  : $tarihSaved\n" +
                            "📊 Adet  : $toplamSaved barkod\n\n" +
                            "Ne yapmak istersiniz?"
                )
                .setPositiveButton("▶ Devam Et") { _, _ ->
                    loadDepoSession(yeniDepo)
                }
                .setNegativeButton("🆕 Yeni Sayım") { _, _ ->
                    // Eski oturumu sil, temiz başla
                    clearDepoSession(yeniDepo)
                    gs1List.clear(); otherList.clear()
                    secilenDepo  = yeniDepo
                    kullaniciAdi = ""
                    kullanimYeri = ""
                    sayimTarihi  = ""
                    adapter.notifyDataSetChanged()
                    updateUI()
                    Toast.makeText(this, "Yeni sayım başlatıldı: $DISPLAY_PREFIX$yeniDepo", Toast.LENGTH_SHORT).show()
                }
                .setCancelable(false)
                .show()
        } else {
            // Oturum yok, direkt geç
            gs1List.clear(); otherList.clear()
            secilenDepo  = yeniDepo
            kullaniciAdi = prefs.getString(depoSessionKey(yeniDepo, "kullanici"), "") ?: ""
            kullanimYeri = prefs.getString(depoSessionKey(yeniDepo, "kullanim"), "") ?: ""
            sayimTarihi  = ""
            adapter.notifyDataSetChanged()
            updateUI()
            Toast.makeText(this, "✓ $DISPLAY_PREFIX$secilenDepo", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Deponun oturumunu hem prefs'e hem de ikincil JSON yedek dosyasına kaydet.
     */
    private fun saveDepoSession(depo: String) {
        if (depo.isEmpty()) return

        // Mevcut tarihi belirle (ilk kez kaydediliyorsa şimdiki zaman)
        val tarihYaz = sayimTarihi.ifEmpty {
            SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(Date())
                .also { sayimTarihi = it }
        }

        val gs1Set   = gs1List.mapIndexed   { i, v -> "$i|$v" }.toSet()
        val otherSet = otherList.mapIndexed { i, v -> "$i|$v" }.toSet()

        // Adım 1: Eski Set key'lerini sil (önbellek temizlenir)
        prefs.edit().apply {
            remove(depoSessionKey(depo, "gs1_indexed"))
            remove(depoSessionKey(depo, "other_indexed"))
            commit() // apply() yerine commit() — senkron, hemen geçerli
        }

        // Adım 2: Yeni değerleri yaz
        prefs.edit().apply {
            putStringSet(depoSessionKey(depo, "gs1_indexed"),   gs1Set)
            putStringSet(depoSessionKey(depo, "other_indexed"), otherSet)
            putString(depoSessionKey(depo, "kullanici"), kullaniciAdi)
            putString(depoSessionKey(depo, "kullanim"),  kullanimYeri)
            putString(depoSessionKey(depo, "tarih"),     tarihYaz)
            putBoolean(depoSessionKey(depo, "aktif"), gs1List.isNotEmpty() || otherList.isNotEmpty())
            commit()
        }

        android.util.Log.d("PATBIS_SESSION",
            "Kaydedildi: $depo — gs1=${gs1List.size}, other=${otherList.size}")

        // Adım 3: İkincil JSON Yedek Dosyasına Kaydet
        saveDepoSessionJsonBackup(depo)
    }

    /**
     * İkincil JSON yedek dosyasını oluşturur/günceller.
     */
    private fun saveDepoSessionJsonBackup(depo: String) {
        if (depo.isEmpty()) return
        try {
            val backupFile = java.io.File(filesDir, "session_${depo}_backup.json")
            val json = JSONObject().apply {
                put("depo", depo)
                put("kullanici", kullaniciAdi)
                put("kullanim", kullanimYeri)
                put("tarih", sayimTarihi)
                val gs1Arr = org.json.JSONArray()
                gs1List.forEach { gs1Arr.put(it) }
                put("gs1_list", gs1Arr)
                val otherArr = org.json.JSONArray()
                otherList.forEach { otherArr.put(it) }
                put("other_list", otherArr)
                put("aktif", gs1List.isNotEmpty() || otherList.isNotEmpty())
            }
            backupFile.writeText(json.toString(), Charsets.UTF_8)
            android.util.Log.d("PATBIS_BACKUP", "JSON backup saved for $depo")
        } catch (e: Exception) {
            android.util.Log.e("PATBIS_BACKUP", "JSON backup failed: ${e.message}")
        }
    }

    /**
     * Kaydedilmiş bir oturumun toplam barkod sayısını hem Prefs hem de JSON yedeğinden sorgular,
     * en güncel/büyük olan adeti döner.
     */
    private fun getSessionCount(depo: String): Int {
        var count = 0
        // SharedPreferences kontrolü
        val freshPrefs = getSharedPreferences("patbis_prefs", Context.MODE_PRIVATE)
        val gs1Saved = freshPrefs.getStringSet(depoSessionKey(depo, "gs1_indexed"), emptySet()) ?: emptySet()
        val otherSaved = freshPrefs.getStringSet(depoSessionKey(depo, "other_indexed"), emptySet()) ?: emptySet()
        count = gs1Saved.size + otherSaved.size

        // JSON dosya yedek kontrolü
        try {
            val backupFile = java.io.File(filesDir, "session_${depo}_backup.json")
            if (backupFile.exists()) {
                val jsonStr = backupFile.readText(Charsets.UTF_8)
                val json = JSONObject(jsonStr)
                val fileGs1Arr = json.optJSONArray("gs1_list")
                val fileOtherArr = json.optJSONArray("other_list")
                val fileGs1Size = fileGs1Arr?.length() ?: 0
                val fileOtherSize = fileOtherArr?.length() ?: 0
                val fileCount = fileGs1Size + fileOtherSize
                if (fileCount > count) {
                    count = fileCount
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("PATBIS_BACKUP", "Failed to check JSON backup count: ${e.message}")
        }
        return count
    }

    /**
     * Deponun oturumunu prefs'ten veya JSON yedek dosyasından yükler (veri kurtarma / fallback).
     */
    private fun loadDepoSession(depo: String) {
        // Önbellek sorununu aşmak için fresh instance
        val freshPrefs = getSharedPreferences("patbis_prefs", Context.MODE_PRIVATE)

        val gs1Saved   = freshPrefs.getStringSet(depoSessionKey(depo, "gs1_indexed"),   emptySet())!!
            .toSet() // defensive copy — Set referansını kopyala
        val otherSaved = freshPrefs.getStringSet(depoSessionKey(depo, "other_indexed"), emptySet())!!
            .toSet()

        android.util.Log.d("PATBIS_SESSION",
            "Yükleniyor: $depo — gs1=${gs1Saved.size}, other=${otherSaved.size}")

        var gs1Loaded = mutableListOf<String>()
        var otherLoaded = mutableListOf<String>()
        var kullanici = freshPrefs.getString(depoSessionKey(depo, "kullanici"), "") ?: ""
        var kullanim = freshPrefs.getString(depoSessionKey(depo, "kullanim"), "") ?: ""
        var tarih = freshPrefs.getString(depoSessionKey(depo, "tarih"), "") ?: ""

        gs1Saved.sortedBy { it.substringBefore("|").toIntOrNull() ?: 0 }
            .forEach { gs1Loaded.add(it.substringAfter("|")) }
        otherSaved.sortedBy { it.substringBefore("|").toIntOrNull() ?: 0 }
            .forEach { otherLoaded.add(it.substringAfter("|")) }

        // SharedPreferences verisi eksikse veya boşsa, JSON yedek dosyasından kurtarma yap
        val backupFile = java.io.File(filesDir, "session_${depo}_backup.json")
        if (backupFile.exists()) {
            try {
                val jsonStr = backupFile.readText(Charsets.UTF_8)
                val json = JSONObject(jsonStr)
                val fileGs1Arr = json.optJSONArray("gs1_list")
                val fileOtherArr = json.optJSONArray("other_list")
                val fileGs1 = mutableListOf<String>()
                val fileOther = mutableListOf<String>()
                if (fileGs1Arr != null) {
                    for (i in 0 until fileGs1Arr.length()) {
                        fileGs1.add(fileGs1Arr.getString(i))
                    }
                }
                if (fileOtherArr != null) {
                    for (i in 0 until fileOtherArr.length()) {
                        fileOther.add(fileOtherArr.getString(i))
                    }
                }

                val totalPrefs = gs1Loaded.size + otherLoaded.size
                val totalFile = fileGs1.size + fileOther.size

                if (totalFile > totalPrefs) {
                    android.util.Log.w("PATBIS_BACKUP", "SharedPreferences veri kaybı tespit edildi! Veriler JSON yedek dosyasından kurtarılıyor (Dosya: $totalFile, Prefs: $totalPrefs)")
                    gs1Loaded = fileGs1
                    otherLoaded = fileOther
                    kullanici = json.optString("kullanici", kullanici)
                    kullanim = json.optString("kullanim", kullanim)
                    tarih = json.optString("tarih", tarih)
                }
            } catch (e: Exception) {
                android.util.Log.e("PATBIS_BACKUP", "Failed to parse JSON backup: ${e.message}")
            }
        }

        gs1List.clear()
        gs1List.addAll(gs1Loaded)
        otherList.clear()
        otherList.addAll(otherLoaded)

        secilenDepo  = depo
        kullaniciAdi = kullanici
        kullanimYeri = kullanim
        sayimTarihi  = tarih

        adapter.notifyDataSetChanged()
        updateUI()

        val toplam = gs1List.size + otherList.size
        Toast.makeText(
            this,
            "✓ $DISPLAY_PREFIX$depo — $toplam barkod yüklendi",
            Toast.LENGTH_SHORT
        ).show()
    }

    /**
     * Deponun oturum verilerini prefs'ten ve JSON yedek dosyasından tamamen sil.
     */
    private fun clearDepoSession(depo: String) {
        prefs.edit().apply {
            remove(depoSessionKey(depo, "gs1_indexed"))
            remove(depoSessionKey(depo, "other_indexed"))
            remove(depoSessionKey(depo, "kullanici"))
            remove(depoSessionKey(depo, "kullanim"))
            remove(depoSessionKey(depo, "tarih"))
            remove(depoSessionKey(depo, "aktif"))
            commit()
        }
        try {
            val backupFile = java.io.File(filesDir, "session_${depo}_backup.json")
            if (backupFile.exists()) {
                backupFile.delete()
                android.util.Log.d("PATBIS_BACKUP", "JSON backup file deleted for $depo")
            }
        } catch (e: Exception) {
            android.util.Log.e("PATBIS_BACKUP", "Failed to delete backup file: ${e.message}")
        }
    }

    /**
     * Eski tek-oturum sistem prefs'i (gs1_indexed, other_indexed, depo ...) varsa
     * yeni çok-depo sistemine taşı, sonra sil.
     */
    private fun migrateOldSession() {
        val oldGs1   = prefs.getStringSet("gs1_indexed", null)
        val oldDepo  = prefs.getString("depo", "") ?: ""
        if (!oldGs1.isNullOrEmpty() && oldDepo.isNotEmpty()) {
            val oldOther = prefs.getStringSet("other_indexed", emptySet()) ?: emptySet()
            val oldTarih = prefs.getString("tarih", "") ?: ""
            // Yeni sistemde kaydet
            prefs.edit().apply {
                putStringSet(depoSessionKey(oldDepo, "gs1_indexed"), oldGs1)
                putStringSet(depoSessionKey(oldDepo, "other_indexed"), oldOther)
                putString(depoSessionKey(oldDepo, "kullanici"), prefs.getString("kullanici", "") ?: "")
                putString(depoSessionKey(oldDepo, "kullanim"),  prefs.getString("kullanim", "") ?: "")
                putString(depoSessionKey(oldDepo, "tarih"), oldTarih)
                putBoolean(depoSessionKey(oldDepo, "aktif"), true)
                // Eski key'leri temizle
                remove("gs1_indexed"); remove("other_indexed")
                remove("depo"); remove("kullanici"); remove("kullanim"); remove("tarih")
                apply()
            }
            android.util.Log.d("PATBIS", "Eski oturum taşındı → $oldDepo (${oldGs1.size} barkod)")
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ── DEPO DIALOG ────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════

    private fun showDepoDialog() {
        // Her deponun oturum durumunu göster
        val displayItems = depoList.map { depo ->
            if (hasActiveSession(depo)) {
                val adet = getSessionCount(depo)
                "📦 $DISPLAY_PREFIX$depo  (${adet} kayıt ▶)"
            } else {
                "○  $DISPLAY_PREFIX$depo"
            }
        }.toTypedArray()

        AlertDialog.Builder(this)
            .setTitle("Depo Seç")
            .setItems(arrayOf("📷  QR Kod Okut", "✏️  Elle Gir")) { _, which ->
                when (which) {
                    0 -> {
                        isDepoScanMode = true
                        if (isHoneywell) {
                            Toast.makeText(this, "Tetik tuşuna basarak depo QR kodunu okutun", Toast.LENGTH_LONG).show()
                        } else {
                            openCamera(depoMode = true)
                            Toast.makeText(this, "Depo QR kodunu kameraya gösterin", Toast.LENGTH_LONG).show()
                        }
                    }
                    1 -> showManualDepoInput(displayItems)
                }
            }.show()
    }

    private fun showManualDepoInput(displayItems: Array<String>) {
        AlertDialog.Builder(this)
            .setTitle("Depo Seç")
            .setItems(displayItems) { _, which ->
                switchDepo(depoList[which])
            }
            .setNeutralButton("Kısa Kod Gir") { _, _ ->
                val et = EditText(this).apply {
                    hint = "Depo no (örn: 454)"
                    inputType = android.text.InputType.TYPE_CLASS_NUMBER
                    setPadding(40, 20, 40, 20)
                }
                AlertDialog.Builder(this)
                    .setTitle("Depo Numarası Girin")
                    .setView(et)
                    .setPositiveButton("Tamam") { _, _ ->
                        val input = et.text.toString().trim()
                        val fullCode = shortCodeMap[input] ?: input
                        if (depoList.contains(fullCode)) {
                            switchDepo(fullCode)
                        } else {
                            Toast.makeText(this, "Geçersiz depo: $input", Toast.LENGTH_LONG).show()
                        }
                    }
                    .setNegativeButton("İptal", null).show()
            }
            .setNegativeButton("İptal", null).show()
    }

    // ═══════════════════════════════════════════════════════════════════
    // ── EXPORT — ÇOK SEÇENEKLI DIALOG ─────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════

    private fun showExportDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(60, 30, 60, 20)
        }

        fun label(text: String) = TextView(this).apply {
            this.text = text; textSize = 12f
            setTextColor(Color.parseColor("#888888"))
            setPadding(0, 14, 0, 4)
        }

        val etKullanici = EditText(this).apply {
            hint = "Kullanıcı Adı"
            setText(kullaniciAdi)
        }
        val etKullanim = EditText(this).apply {
            hint = "Kullanım Yeri (örn: T3 Tüneli)"
            setText(kullanimYeri)
        }

        layout.addView(TextView(this).apply {
            text = "$DISPLAY_PREFIX$secilenDepo"
            textSize = 14f
            setTextColor(Color.parseColor("#4CAF50"))
            setPadding(0, 0, 0, 12)
        })
        layout.addView(label("Kullanıcı Adı"))
        layout.addView(etKullanici)
        layout.addView(label("Kullanım Yeri"))
        layout.addView(etKullanim)

        // Diğer depolarda aktif oturum var mı?
        val aktifDiger = depoList.filter { it != secilenDepo && hasActiveSession(it) }

        AlertDialog.Builder(this)
            .setTitle("Dışa Aktarma")
            .setView(layout)
            .setPositiveButton("💾 Aktar ve Depoya Kaydet") { _, _ ->
                // Bilgileri güncelle
                kullaniciAdi = etKullanici.text.toString().trim().ifEmpty { "-" }
                kullanimYeri = etKullanim.text.toString().trim().ifEmpty { "-" }

                val tarih    = SimpleDateFormat("yyyyMMdd_HHmm", Locale.getDefault()).format(Date())
                val safeDepo = secilenDepo.replace("-", "_")
                val fileName = "ozaltin_${safeDepo}_$tarih.txt"

                // Oturumu kaydet ama SİLME — aktif kalacak
                saveDepoSession(secilenDepo)

                exportLauncher.launch(fileName)
                // saveToFile içinde "temizle mi?" sorusu ÇIKACAK ama biz sormayacağız
                // → exportMode flag ile yönetiyoruz
                exportMode = EXPORT_KAYDET
            }
            .setNeutralButton("🗑 Aktar ve Temizle") { _, _ ->
                kullaniciAdi = etKullanici.text.toString().trim().ifEmpty { "-" }
                kullanimYeri = etKullanim.text.toString().trim().ifEmpty { "-" }

                val tarih    = SimpleDateFormat("yyyyMMdd_HHmm", Locale.getDefault()).format(Date())
                val safeDepo = secilenDepo.replace("-", "_")
                val fileName = "ozaltin_${safeDepo}_$tarih.txt"
                exportMode = EXPORT_TEMIZLE
                exportLauncher.launch(fileName)
            }
            .setNegativeButton("İptal", null)
            .show()
    }

    // Export sonrası ne yapılacak?
    private var exportMode = EXPORT_KAYDET

    // ═══════════════════════════════════════════════════════════════════
    // ── DOSYA KAYIT / PAYLAŞ ────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════

    private fun buildTxtContent(): String {
        val toplam      = gs1List.size + otherList.size
        val tarihGoster = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(Date())
        val sb = StringBuilder()
        sb.appendLine("Depo: $DISPLAY_PREFIX$secilenDepo")
        sb.appendLine("Kullanici: $kullaniciAdi")
        sb.appendLine("Kullanim_Yeri: $kullanimYeri")
        sb.appendLine("Tarih: $tarihGoster")
        sb.appendLine("Adet: $toplam")
        sb.appendLine("GS1: ${gs1List.size}")
        sb.appendLine("Manuel: ${otherList.size}")
        sb.appendLine()
        sb.appendLine("Barcode")
        gs1List.forEach  { sb.appendLine(it) }
        otherList.forEach { sb.appendLine(it) }
        return sb.toString()
    }

    private fun saveToFile(uri: Uri) {
        try {
            val content = buildTxtContent()
            val toplam  = gs1List.size + otherList.size

            contentResolver.openOutputStream(uri)?.use { outputStream ->
                outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(content) }
            }

            Toast.makeText(this, "✓ $toplam barkod dosyaya yazıldı", Toast.LENGTH_LONG).show()

            when (exportMode) {
                EXPORT_KAYDET -> {
                    // Oturum canlı kalıyor, sadece bilgi ver
                    AlertDialog.Builder(this)
                        .setTitle("✅ Aktarım Tamam")
                        .setMessage(
                            "$toplam barkod aktarıldı.\n\n" +
                                    "📦 $DISPLAY_PREFIX$secilenDepo oturumu canlı tutuluyor.\n" +
                                    "İstediğinizde bu depoyu seçip kaldığınız yerden devam edebilirsiniz."
                        )
                        .setPositiveButton("Tamam", null)
                        .show()
                    // Oturumu güncelle (sayım tarihi vb. güncel kalsın)
                    saveDepoSession(secilenDepo)
                }
                EXPORT_TEMIZLE -> {
                    // Oturumu sil + listeyi temizle
                    AlertDialog.Builder(this)
                        .setTitle("✅ Aktarım Tamam")
                        .setMessage("$toplam barkod aktarıldı.\nListe ve oturum temizlendi.")
                        .setPositiveButton("Tamam") { _, _ -> clearAll() }
                        .show()
                }
            }

        } catch (e: Exception) {
            Toast.makeText(this, "Aktarım Hatası: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun shareFile() {
        if (gs1List.isEmpty() && otherList.isEmpty()) {
            Toast.makeText(this, "Liste boş!", Toast.LENGTH_SHORT).show()
            return
        }
        if (secilenDepo.isEmpty()) {
            Toast.makeText(this, "Önce depo seçin!", Toast.LENGTH_SHORT).show()
            showDepoDialog(); return
        }

        try {
            val tarih    = SimpleDateFormat("yyyyMMdd_HHmm", Locale.getDefault()).format(Date())
            val safeDepo = secilenDepo.replace("-", "_")
            val fileName = "ozaltin_${safeDepo}_$tarih.txt"
            val content  = buildTxtContent()

            val cacheFile = java.io.File(cacheDir, fileName)
            cacheFile.writeText(content, Charsets.UTF_8)

            val shareUri = androidx.core.content.FileProvider.getUriForFile(
                this, "${packageName}.provider", cacheFile
            )
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_STREAM, shareUri)
                putExtra(Intent.EXTRA_SUBJECT, fileName)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(shareIntent, "Dosyayı Paylaş"))

        } catch (e: Exception) {
            Toast.makeText(this, "Paylaşım Hatası: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ── BARKOD İŞLEME ──────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════

    private fun processBarcode(barcode: String) {
        val raw      = barcode.trim()
        val rawNoGs  = raw.replace(GS.toString(), "")

        // Sunucu Senkronizasyon QR Kontrolü
        if (rawNoGs.startsWith("PATBIS_SYNC|")) {
            runOnUiThread {
                isDepoScanMode = false
                closeCamera()
                handleServerSyncQR(rawNoGs)
            }
            return
        }

        // Depo QR kontrolü
        if (rawNoGs.startsWith(QR_PREFIX)) {
            val depoKod = rawNoGs.removePrefix(QR_PREFIX)
            runOnUiThread {
                isDepoScanMode = false
                closeCamera()
                switchDepo(depoKod) // Yeni oturum sistemiyle geç
            }
            return
        }

        if (isDepoScanMode) return

        val formatted = formatToGS1(raw)
        val isGs1     = formatted.startsWith("(90)") || formatted.contains("(250)")

        if (activeServerUrl.isNotEmpty() && loggedInPersonelId != -1) {
            // Online Sync Mode
            sendBarcodeToServer(formatted, isGs1)
        } else {
            // Offline Mode
            val allItems  = gs1List + otherList

            if (allItems.contains(formatted)) {
                runOnUiThread { beepError(); flashStatus("#F44336"); showDuplicate(formatted) }
                return
            }

            runOnUiThread {
                if (isGs1) gs1List.add(0, formatted)
                else otherList.add(formatted)
                adapter.notifyDataSetChanged()
                tvLastScan.text = formatted
                flashStatus("#4CAF50")
                beepSuccess()
                saveDepoSession(secilenDepo) // Depo bazlı kaydet
                updateUI()
            }
        }
    }

    // ── MANüEL GİRİŞ ─────────────────────────────────────────────────
    private fun buildUidMap(): Map<String, String> {
        val map = mutableMapOf<String, String>()
        for (barcode in gs1List) {
            val m = Regex("""\(250\)([A-Za-z0-9]{1,20})""").find(barcode)
            if (m != null) map[m.groupValues[1]] = barcode
        }
        return map
    }

    private fun manualGirisIsle(girdi: String) {
        if (girdi.startsWith("(90)") || girdi.startsWith("90") ||
            girdi.startsWith("INSI") || girdi.length > 15) {
            processBarcode(girdi); return
        }
        val uidMap    = buildUidMap()
        val tamBarkod = uidMap[girdi]
        when {
            tamBarkod != null -> {
                val allItems = gs1List + otherList
                if (allItems.contains(tamBarkod)) {
                    beepError(); flashStatus("#F44336"); showDuplicate(tamBarkod)
                } else {
                    gs1List.add(0, tamBarkod)
                    adapter.notifyDataSetChanged()
                    tvLastScan.text = tamBarkod
                    flashStatus("#4CAF50"); beepSuccess()
                    saveDepoSession(secilenDepo); updateUI()
                    Toast.makeText(this, "✓ UID $girdi eşleştirildi", Toast.LENGTH_SHORT).show()
                }
            }
            else -> {
                val rawEntry = "(250)$girdi"
                val allItems = gs1List + otherList
                if (allItems.contains(rawEntry)) {
                    beepError(); flashStatus("#F44336"); showDuplicate(rawEntry)
                } else {
                    otherList.add(rawEntry)
                    adapter.notifyDataSetChanged()
                    tvLastScan.text = rawEntry
                    flashStatus("#FF9100"); beepSuccess()
                    saveDepoSession(secilenDepo); updateUI()
                    Toast.makeText(this, "✓ UID $girdi eklendi", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    // ── GS1 FORMATTER (değişmedi) ─────────────────────────────────────
    private fun formatToGS1(raw: String): String {
        if (raw.startsWith("(") || raw.startsWith("INSI")) return raw
        val parantezIndex = raw.indexOf('(')
        val hamKisim      = if (parantezIndex > 0) raw.substring(0, parantezIndex) else raw
        val parantezliKisim = if (parantezIndex > 0) raw.substring(parantezIndex) else ""
        if (GS in raw) {
            val segs = raw.split(GS)
            val sb = StringBuilder()
            segs.forEachIndexed { idx, seg ->
                val s = seg.trim(); if (s.isEmpty()) return@forEachIndexed
                val pIdx = s.indexOf('(')
                if (idx == 0) {
                    val base = if (pIdx > 0) s.substring(0, pIdx) else s
                    val tail = if (pIdx > 0) s.substring(pIdx) else ""
                    if (base.length >= 7 && base[0].isDigit() && base[1].isDigit()) {
                        sb.append("(${base.substring(0, 2)})${base.substring(2, 7)}")
                        sb.append(tail)
                    } else {
                        if (pIdx > 0) { sb.append(parseSingleAI(s.substring(0, pIdx))); sb.append(s.substring(pIdx)) }
                        else sb.append(parseSingleAI(s))
                    }
                } else {
                    if (pIdx > 0) { sb.append(parseSingleAI(s.substring(0, pIdx))); sb.append(s.substring(pIdx)) }
                    else sb.append(parseSingleAI(s))
                }
            }
            return sb.toString()
        }
        return parseAllInOne(hamKisim) + parantezliKisim
    }

    private fun parseSingleAI(seg: String): String {
        val n = seg.length
        return when {
            seg.startsWith("250") && n >= 3  -> "(250)${seg.substring(3)}"
            seg.startsWith("240") && n >= 3  -> "(240)${seg.substring(3)}"
            seg.startsWith("3100") && n >= 4 -> "(3100)${seg.substring(4)}"
            seg.startsWith("3101") && n >= 4 -> "(3101)${seg.substring(4)}"
            seg.startsWith("3103") && n >= 4 -> "(3103)${seg.substring(4)}"
            seg.startsWith("3301") && n >= 4 -> "(3301)${seg.substring(4)}"
            seg.startsWith("20") && n >= 2   -> "(20)${seg.substring(2)}"
            seg.startsWith("37") && n >= 2   -> "(37)${seg.substring(2)}"
            seg.startsWith("30") && n >= 2   -> "(30)${seg.substring(2)}"
            else -> seg
        }
    }

    private fun parseAllInOne(raw: String): String {
        val sb = StringBuilder(); var i = 0; val n = raw.length
        while (i < n) {
            val r = raw.substring(i)
            when {
                i == 0 && n >= 7 && raw[0].isDigit() && raw[1].isDigit() -> {
                    sb.append("(${raw.substring(0, 2)})${raw.substring(2, 7)}"); i = 7
                }
                r.startsWith("250") && i + 14 <= n -> { sb.append("(250)${raw.substring(i+3, i+14)}"); i += 14 }
                r.startsWith("240") && i + 6  <= n -> { sb.append("(240)${raw.substring(i+3, i+6)}"); i += 6 }
                r.startsWith("3100") && i + 10 <= n -> { sb.append("(3100)${raw.substring(i+4, i+10)}"); i += 10 }
                r.startsWith("3103") && i + 10 <= n -> { sb.append("(3103)${raw.substring(i+4, i+10)}"); i += 10 }
                r.startsWith("3101") && i + 10 <= n -> { sb.append("(3101)${raw.substring(i+4, i+10)}"); i += 10 }
                r.startsWith("3301") && i + 10 <= n -> { sb.append("(3301)${raw.substring(i+4, i+10)}"); i += 10 }
                r.startsWith("20") && i + 4 <= n -> { sb.append("(20)${raw.substring(i+2, i+4)}"); i += 4 }
                r.startsWith("37") && i + 4 <= n -> { sb.append("(37)${raw.substring(i+2, i+4)}"); i += 4 }
                r.startsWith("30") && i + 2 <= n -> {
                    sb.append("(30)"); i += 2
                    val stop = listOf("37", "310", "330", "240", "20", "30")
                    var e = i
                    while (e < n && stop.none { raw.startsWith(it, e) }) e++
                    sb.append(raw.substring(i, e)); i = e
                }
                else -> break
            }
        }
        return sb.toString()
    }

    // ── TEMİZLE ───────────────────────────────────────────────────────
    private fun clearAll() {
        if (secilenDepo.isNotEmpty()) clearDepoSession(secilenDepo)
        gs1List.clear(); otherList.clear()
        secilenDepo = ""; kullaniciAdi = ""; kullanimYeri = ""; sayimTarihi = ""
        adapter.notifyDataSetChanged()
        updateUI()
        tvLastScan.text = "Bekleniyor..."
        flashStatus("#555555")
    }

    // ── UI ────────────────────────────────────────────────────────────
    private fun updateUI() {
        val toplam = gs1List.size + otherList.size
        tvCount.text = toplam.toString()

        // Aktif oturumu olan diğer depo sayısını da göster
        val aktifDepoSayisi = depoList.count { it != secilenDepo && hasActiveSession(it) }

        var statusText = ""
        if (secilenDepo.isNotEmpty()) {
            val aktifBilgi = if (aktifDepoSayisi > 0) " • $aktifDepoSayisi depo aktif" else ""
            statusText = "$DISPLAY_PREFIX$secilenDepo$aktifBilgi"
        } else {
            statusText = if (aktifDepoSayisi > 0) "$aktifDepoSayisi depo aktif — seçin" else "Depo seçilmedi"
        }

        if (activeServerUrl.isNotEmpty()) {
            val serverIp = activeServerUrl.substringAfter("://")
            val userText = if (loggedInPersonelId != -1) " ($loggedInPersonelAd)" else " (Giriş yapılmadı)"
            statusText += "\n🔗 $serverIp$userText"
            tvDepoInfo.setTextColor(Color.parseColor("#00E676")) // Premium Siberpunk Yeşil
        } else {
            tvDepoInfo.setTextColor(Color.parseColor(if (secilenDepo.isNotEmpty()) "#4CAF50" else "#F44336"))
        }
        tvDepoInfo.text = statusText
    }

    private fun getDisplayItem(position: Int): String =
        if (position < gs1List.size) gs1List[position]
        else otherList[position - gs1List.size]

    private fun removeItemAt(position: Int) {
        if (position < gs1List.size) gs1List.removeAt(position)
        else otherList.removeAt(position - gs1List.size)
        adapter.notifyDataSetChanged()
    }

    private fun flashStatus(color: String) {
        statusBar.setBackgroundColor(Color.parseColor(color))
        Handler(Looper.getMainLooper()).postDelayed({
            statusBar.setBackgroundColor(Color.parseColor("#4CAF50"))
        }, 600)
    }

    private fun showDuplicate(barcode: String) {
        runOnUiThread {
            val d = AlertDialog.Builder(this)
                .setTitle("⚠ Mükerrer Okuma!")
                .setMessage("Bu barkod zaten listede:\n\n$barcode")
                .create()
            d.show()
            Handler(Looper.getMainLooper()).postDelayed({ if (d.isShowing) d.dismiss() }, 2500)
        }
    }

    // ── SES & TİTREŞİM ───────────────────────────────────────────────
    private fun beepSuccess() {
        try { toneGen.startTone(ToneGenerator.TONE_PROP_BEEP, 80) } catch (_: Exception) {}
        val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            v.vibrate(VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE))
        else v.vibrate(60)
    }

    private fun beepError() {
        try { toneGen.startTone(ToneGenerator.TONE_PROP_NACK, 300) } catch (_: Exception) {}
        val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 200, 100, 200), -1))
        else v.vibrate(500)
    }

    // ── KAMERA ───────────────────────────────────────────────────────
    private fun openCamera(depoMode: Boolean) {
        isDepoScanMode = depoMode
        viewFinder.visibility = View.VISIBLE
        btnCamera.text = "📷 Kapat"
        isCameraOpen = true
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) startCamera()
        else cameraPermLauncher.launch(Manifest.permission.CAMERA)
    }

    @OptIn(ExperimentalGetImage::class)
    private fun startCamera() {
        val fut = ProcessCameraProvider.getInstance(this)
        fut.addListener({
            val cp = fut.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(viewFinder.surfaceProvider)
            }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            val scanner = BarcodeScanning.getClient()
            analysis.setAnalyzer(Executors.newSingleThreadExecutor()) { proxy ->
                val mediaImage = proxy.image
                if (mediaImage != null) {
                    val image = InputImage.fromMediaImage(mediaImage, proxy.imageInfo.rotationDegrees)
                    scanner.process(image)
                        .addOnSuccessListener { codes ->
                            codes.forEach { bc ->
                                val now   = System.currentTimeMillis()
                                val delay = if (isDepoScanMode) 500L else 1500L
                                if (now - lastCameraScanTime > delay) {
                                    bc.rawValue?.let { processBarcode(it); lastCameraScanTime = now }
                                }
                            }
                        }
                        .addOnCompleteListener { proxy.close() }
                } else proxy.close()
            }
            try {
                cp.unbindAll()
                cp.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            } catch (_: Exception) {}
        }, ContextCompat.getMainExecutor(this))
    }

    private fun closeCamera() {
        ProcessCameraProvider.getInstance(this).addListener({
            ProcessCameraProvider.getInstance(this).get().unbindAll()
            runOnUiThread {
                viewFinder.visibility = View.GONE
                btnCamera.text = "📷 Kamera"
                isCameraOpen = false
                isDepoScanMode = false
            }
        }, ContextCompat.getMainExecutor(this))
    }

    // ── RECEIVER ─────────────────────────────────────────────────────
    override fun onResume() {
        super.onResume()
        val filter = IntentFilter().apply {
            addAction("com.honeywell.intent.action.SCAN")
            addAction("com.honeywell.action.BARCODE_DATA")
            addAction("com.honeywell.decode_results")
            addAction("device.intent.action.SCANNER_RESULT")
            addAction("com.android.server.scannerservice.broadcast")
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            registerReceiver(scanReceiver, filter, Context.RECEIVER_EXPORTED)
        else ContextCompat.registerReceiver(this, scanReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
    }

    override fun onPause() {
        super.onPause()
        // Uygulama arka plana geçince aktif oturumu kaydet
        // Liste doluysa kaydet — boşsa oturuma dokunma (silinmiş olabilir)
        if (secilenDepo.isNotEmpty() && (gs1List.isNotEmpty() || otherList.isNotEmpty())) {
            saveDepoSession(secilenDepo)
        }
        try { unregisterReceiver(scanReceiver) } catch (_: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        try { toneGen.release() } catch (_: Exception) {}
    }

    // ═══════════════════════════════════════════════════════════════════
    // ── ÇIKIŞ YAP — Tüm Oturumları Servera Gönder ──────────────────────
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Tüm aktif depo oturumlarını toplar, sunucu bağlıysa TXT olarak gönderir,
     * değilse kaydet/paylaş seçeneği sunar.
     */
    private fun cikisYap() {
        // ── 1. Mevcut oturumu kaydet ──
        if (secilenDepo.isNotEmpty() && (gs1List.isNotEmpty() || otherList.isNotEmpty())) {
            saveDepoSession(secilenDepo)
        }

        // ── 2. Tüm aktif oturumları topla ──
        data class OturumBilgi(
            val depo: String,
            val gs1:  List<String>,
            val other: List<String>,
            val tarih: String,
        )

        val aktifOturumlar = mutableListOf<OturumBilgi>()
        val freshPrefs = getSharedPreferences("patbis_prefs", MODE_PRIVATE)

        for (depo in depoList) {
            val aktif = freshPrefs.getBoolean(depoSessionKey(depo, "aktif"), false)
            if (!aktif) continue

            val gs1Set   = freshPrefs.getStringSet(depoSessionKey(depo, "gs1_indexed"), emptySet())!!.toSet()
            val otherSet = freshPrefs.getStringSet(depoSessionKey(depo, "other_indexed"), emptySet())!!.toSet()
            if (gs1Set.isEmpty() && otherSet.isEmpty()) continue

            val gs1Parsed = gs1Set.sortedBy { it.substringBefore("|").toIntOrNull() ?: 0 }
                .map { it.substringAfter("|") }
            val otherParsed = otherSet.sortedBy { it.substringBefore("|").toIntOrNull() ?: 0 }
                .map { it.substringAfter("|") }
            val tarih = freshPrefs.getString(depoSessionKey(depo, "tarih"), "") ?: ""

            aktifOturumlar.add(OturumBilgi(depo, gs1Parsed, otherParsed, tarih))
        }

        if (aktifOturumlar.isEmpty()) {
            Toast.makeText(this, "Gönderilecek aktif oturum yok!", Toast.LENGTH_SHORT).show()
            return
        }

        val toplamBarkod = aktifOturumlar.sumOf { it.gs1.size + it.other.size }
        val serverBagli  = activeServerUrl.isNotEmpty() && loggedInPersonelId != -1

        // ── 3. Özet dialog ──
        val ozet = buildString {
            appendLine("Aktif oturumlar servera gönderilecek:\n")
            aktifOturumlar.forEach { o ->
                appendLine("📦 $DISPLAY_PREFIX${o.depo}")
                appendLine("   ${o.gs1.size + o.other.size} barkod  •  ${o.tarih}")
            }
            appendLine("\nToplam: $toplamBarkod barkod")
            if (!serverBagli) {
                appendLine("\n⚠ Sunucu bağlantısı yok!")
                appendLine("TXT dosyaları paylaşım ile gönderilebilir.")
            }
        }

        AlertDialog.Builder(this)
            .setTitle("🚪 Çıkış Yap")
            .setMessage(ozet)
            .setPositiveButton(if (serverBagli) "✓ Servera Gönder" else "📤 TXT Paylaş") { _, _ ->
                if (serverBagli) {
                    gonderServera(aktifOturumlar.map { Triple(it.depo, it.gs1, it.other) })
                } else {
                    aktifOturumlar.forEach { o ->
                        // Her oturum için ayrı paylaşım başlat
                        val eski = Pair(secilenDepo, Pair(gs1List.toList(), otherList.toList()))
                        gs1List.clear(); otherList.clear()
                        gs1List.addAll(o.gs1); otherList.addAll(o.other)
                        secilenDepo  = o.depo
                        kullaniciAdi = freshPrefs.getString(depoSessionKey(o.depo, "kullanici"), "") ?: ""
                        kullanimYeri = freshPrefs.getString(depoSessionKey(o.depo, "kullanim"),  "") ?: ""
                        shareFile()
                        // Geri yükle
                        gs1List.clear(); otherList.clear()
                        gs1List.addAll(eski.second.first)
                        otherList.addAll(eski.second.second)
                        secilenDepo = eski.first
                    }
                }
            }
            .setNegativeButton("İptal", null)
            .show()
    }

    /**
     * Aktif oturumları TXT dosyası olarak sunucuya POST /txt_gonder ile gönderir.
     * Her depo için ayrı TXT oluşturulur ve multipart olarak iletilir.
     */
    private fun gonderServera(oturumlar: List<Triple<String, List<String>, List<String>>>) {
        val progress = AlertDialog.Builder(this)
            .setTitle("📡 Sunucuya Gönderiliyor")
            .setMessage("TXT dosyaları hazırlanıp gönderiliyor...\nLütfen bekleyin.")
            .setCancelable(false)
            .create()
        progress.show()

        Executors.newSingleThreadExecutor().execute {
            val tarihGoster = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault()).format(java.util.Date())
            var toplamBasarili = 0
            var toplamMukerrer = 0
            var toplamGecersiz = 0
            val hataMesajlari  = mutableListOf<String>()

            for ((depo, gs1, other) in oturumlar) {
                try {
                    // ── TXT içeriğini oluştur ──
                    val toplam  = gs1.size + other.size
                    val sb = StringBuilder()
                    sb.appendLine("Depo: $DISPLAY_PREFIX$depo")
                    sb.appendLine("Kullanici: ${kullaniciAdi.ifEmpty { loggedInPersonelAd }}")
                    sb.appendLine("Kullanim_Yeri: ${kullanimYeri.ifEmpty { "-" }}")
                    sb.appendLine("Tarih: $tarihGoster")
                    sb.appendLine("Adet: $toplam")
                    sb.appendLine("GS1: ${gs1.size}")
                    sb.appendLine("Manuel: ${other.size}")
                    sb.appendLine()
                    sb.appendLine("Barcode")
                    gs1.forEach  { sb.appendLine(it) }
                    other.forEach { sb.appendLine(it) }
                    val txtContent = sb.toString()

                    // ── Multipart POST ──
                    val boundary  = "PATBiS-${System.currentTimeMillis()}"
                    val url       = java.net.URL("$activeServerUrl/txt_gonder")
                    val conn      = url.openConnection() as java.net.HttpURLConnection
                    conn.connectTimeout = 10000
                    conn.readTimeout    = 30000
                    conn.requestMethod  = "POST"
                    conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                    conn.doOutput = true

                    val os     = conn.outputStream
                    val writer = os.bufferedWriter(Charsets.UTF_8)

                    fun field(name: String, value: String) {
                        writer.write("--$boundary\r\n")
                        writer.write("Content-Disposition: form-data; name=\"$name\"\r\n\r\n")
                        writer.write("$value\r\n")
                    }
                    fun fileField(name: String, filename: String, content: String) {
                        writer.write("--$boundary\r\n")
                        writer.write("Content-Disposition: form-data; name=\"$name\"; filename=\"$filename\"\r\n")
                        writer.write("Content-Type: text/plain; charset=utf-8\r\n\r\n")
                        writer.write(content)
                        writer.write("\r\n")
                    }

                    field("depo_adi",    "$DISPLAY_PREFIX$depo")
                    field("personel_id", loggedInPersonelId.toString())
                    field("personel_ad", loggedInPersonelAd.ifEmpty { "Android Terminal" })
                    field("session_token", sessionToken)

                    val safeDepo = depo.replace("-", "_")
                    val tarihDosya = SimpleDateFormat("yyyyMMdd_HHmm", Locale.getDefault()).format(java.util.Date())
                    fileField("txt_dosya", "ozaltin_${safeDepo}_$tarihDosya.txt", txtContent)

                    writer.write("--$boundary--\r\n")
                    writer.flush(); writer.close()

                    val code = conn.responseCode
                    if (code == 200) {
                        val resp = conn.inputStream.bufferedReader().use { it.readText() }
                        val json = org.json.JSONObject(resp)
                        if (json.optBoolean("basarili")) {
                            toplamBasarili += json.optJSONObject("sonuclar")?.optInt("basarili", 0) ?: toplam
                            toplamMukerrer += json.optJSONObject("sonuclar")?.optInt("mukerrer", 0) ?: 0
                            toplamGecersiz += json.optJSONObject("sonuclar")?.optInt("gecersiz", 0) ?: 0
                        } else {
                            hataMesajlari.add("$DISPLAY_PREFIX$depo: ${json.optString("mesaj")}")
                        }
                    } else {
                        hataMesajlari.add("$DISPLAY_PREFIX$depo: HTTP $code")
                    }
                    conn.disconnect()

                } catch (e: Exception) {
                    hataMesajlari.add("$DISPLAY_PREFIX$depo: ${e.localizedMessage}")
                }
            }

            // ── Sonuç göster ──
            runOnUiThread {
                progress.dismiss()

                val sonucMesaj = buildString {
                    appendLine("✅ Başarılı : $toplamBasarili barkod")
                    if (toplamMukerrer > 0) appendLine("⚠ Mükerrer  : $toplamMukerrer (zaten stokta)")
                    if (toplamGecersiz > 0) appendLine("❌ Geçersiz : $toplamGecersiz (FEEM'de yok)")
                    if (hataMesajlari.isNotEmpty()) {
                        appendLine("\nHatalar:")
                        hataMesajlari.forEach { appendLine("• $it") }
                    }
                    appendLine("\n${oturumlar.size} depo oturumu gönderildi.")
                }

                val basarili = hataMesajlari.isEmpty()
                if (basarili) beepSuccess() else beepError()
                flashStatus(if (basarili) "#4CAF50" else "#F44336")

                AlertDialog.Builder(this)
                    .setTitle(if (basarili) "✅ Gönderim Tamamlandı" else "⚠ Kısmi Başarı")
                    .setMessage(sonucMesaj)
                    .setPositiveButton("Oturumları Temizle") { _, _ ->
                        // Tüm gönderilen oturumları sil
                        oturumlar.forEach { (depo, _, _) -> clearDepoSession(depo) }
                        if (oturumlar.any { it.first == secilenDepo }) {
                            gs1List.clear(); otherList.clear()
                            adapter.notifyDataSetChanged()
                        }
                        updateUI()
                        Toast.makeText(this, "Oturumlar temizlendi.", Toast.LENGTH_SHORT).show()
                    }
                    .setNegativeButton("Oturumları Koru", null)
                    .show()
            }
        }
    }

    private fun showAboutDialog() {
        val dialog = android.app.Dialog(this)
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        dialog.setContentView(R.layout.dialog_about)
        dialog.window?.setLayout(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        val tvLocalVersion: TextView = dialog.findViewById(R.id.tvAboutLocalVersion)
        val tvCurrentVersion: TextView = dialog.findViewById(R.id.tvAboutCurrentVersion)
        val btnClose: TextView = dialog.findViewById(R.id.btnAboutClose)
        val btnUpdateCheck: Button = dialog.findViewById(R.id.btnAboutUpdateCheck)
        val layoutUpdateStatus: View = dialog.findViewById(R.id.layoutUpdateStatus)
        val pbUpdateLoading: View = dialog.findViewById(R.id.pbUpdateLoading)
        val tvUpdateStatusMessage: TextView = dialog.findViewById(R.id.tvUpdateStatusMessage)

        // Mevcut sürüm bilgisini al
        val localVersion = try {
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
            } else {
                packageManager.getPackageInfo(packageName, 0)
            }
            packageInfo.versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }

        tvLocalVersion.text = "SÜRÜM v$localVersion"
        tvCurrentVersion.text = "Mevcut sürüm: v$localVersion"

        btnClose.setOnClickListener { dialog.dismiss() }
        btnUpdateCheck.setOnClickListener {
            checkUpdate(btnUpdateCheck, layoutUpdateStatus, pbUpdateLoading, tvUpdateStatusMessage)
        }

        dialog.show()
    }

    private fun checkUpdate(
        btnUpdate: Button,
        layoutStatus: View,
        progressBar: View,
        tvStatus: TextView
    ) {
        btnUpdate.isEnabled = false
        layoutStatus.visibility = View.VISIBLE
        progressBar.visibility = View.VISIBLE
        tvStatus.text = "Güncelleme kontrol ediliyor..."
        tvStatus.setTextColor(Color.parseColor("#F1F5F9"))

        val executor = Executors.newSingleThreadExecutor()
        val handler = Handler(Looper.getMainLooper())

        executor.execute {
            var resultMessage = ""
            var success = false
            var updateAvailable = false
            var remoteVersionStr = ""

            try {
                val url = java.net.URL("https://raw.githubusercontent.com/gamali15/patbis-releases/main/version.json")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.requestMethod = "GET"
                conn.useCaches = false

                if (conn.responseCode == 200) {
                    val response = conn.inputStream.bufferedReader().use { it.readText() }
                    val jsonObject = JSONObject(response)
                    val remoteVersion = jsonObject.optString("surum", jsonObject.optString("version", "0.0.0"))
                    remoteVersionStr = remoteVersion

                    // Mevcut sürüm bilgisini al
                    val localVersion = try {
                        val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
                        } else {
                            packageManager.getPackageInfo(packageName, 0)
                        }
                        packageInfo.versionName ?: "1.0.0"
                    } catch (e: Exception) {
                        "1.0.0"
                    }

                    val parseVersion = { v: String ->
                        val parts = v.split(".").map { it.toIntOrNull() ?: 0 }
                        Triple(parts.getOrNull(0) ?: 0, parts.getOrNull(1) ?: 0, parts.getOrNull(2) ?: 0)
                    }

                    val (ma, mi, pa) = parseVersion(localVersion)
                    val (ua, ui, up) = parseVersion(remoteVersion)

                    updateAvailable = ua > ma || (ua == ma && ui > mi) || (ua == ma && ui == mi && up > pa)
                    success = true
                } else {
                    resultMessage = "HTTP Hata: ${conn.responseCode}"
                }
            } catch (e: Exception) {
                e.printStackTrace()
                resultMessage = "Bağlantı hatası: ${e.localizedMessage}"
            }

            handler.post {
                btnUpdate.isEnabled = true
                progressBar.visibility = View.GONE
                if (success) {
                    if (updateAvailable) {
                        tvStatus.text = "v$remoteVersionStr mevcut! Lütfen yöneticinizle iletişime geçin."
                        tvStatus.setTextColor(Color.parseColor("#FBBF24")) // Sarı renk
                    } else {
                        val localVersion = try {
                            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
                            } else {
                                packageManager.getPackageInfo(packageName, 0)
                            }
                            packageInfo.versionName ?: "1.0.0"
                        } catch (e: Exception) {
                            "1.0.0"
                        }
                        tvStatus.text = "v$localVersion — En güncel sürümdesiniz."
                        tvStatus.setTextColor(Color.parseColor("#4ADE80")) // Yeşil renk
                    }
                } else {
                    tvStatus.text = "Güncelleme sunucusuna ulaşılamadı. ($resultMessage)"
                    tvStatus.setTextColor(Color.parseColor("#F87171")) // Kırmızı renk
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // ── SUNUCU VE ÇEVRİMİÇİ SENKRONİZASYON METOTLARI ───────────────────
    // ═══════════════════════════════════════════════════════════════════

    private fun makeHttpPost(urlStr: String, jsonBody: JSONObject, callback: (Boolean, JSONObject?) -> Unit) {
        Executors.newSingleThreadExecutor().execute {
            var conn: java.net.HttpURLConnection? = null
            try {
                val url = java.net.URL(urlStr)
                conn = url.openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 4000
                conn.readTimeout = 4000
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                conn.doOutput = true

                val os = conn.outputStream
                os.write(jsonBody.toString().toByteArray(Charsets.UTF_8))
                os.close()

                val responseCode = conn.responseCode
                if (responseCode == 200) {
                    val response = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(response)
                    runOnUiThread { callback(true, json) }
                } else {
                    val errorStream = conn.errorStream ?: conn.inputStream
                    val response = errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                    val json = try { JSONObject(response) } catch(_: Exception) { JSONObject().put("mesaj", "HTTP $responseCode") }
                    runOnUiThread { callback(false, json) }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                runOnUiThread {
                    val errJson = JSONObject().put("mesaj", e.localizedMessage ?: "Bağlantı hatası")
                    callback(false, errJson)
                }
            } finally {
                conn?.disconnect()
            }
        }
    }

    private fun makeHttpGet(urlStr: String, callback: (Boolean, JSONObject?) -> Unit) {
        Executors.newSingleThreadExecutor().execute {
            var conn: java.net.HttpURLConnection? = null
            try {
                val url = java.net.URL(urlStr)
                conn = url.openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 3000
                conn.readTimeout = 3000
                conn.requestMethod = "GET"

                val responseCode = conn.responseCode
                if (responseCode == 200) {
                    val response = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(response)
                    runOnUiThread { callback(true, json) }
                } else {
                    runOnUiThread { callback(false, null) }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                runOnUiThread { callback(false, null) }
            } finally {
                conn?.disconnect()
            }
        }
    }

    private fun handleServerSyncQR(qrStr: String) {
        val urls = qrStr.split("|").drop(1).filter { it.startsWith("http") }
        if (urls.isEmpty()) {
            Toast.makeText(this, "Geçersiz Senkronizasyon QR kodu!", Toast.LENGTH_SHORT).show()
            return
        }

        val progress = AlertDialog.Builder(this)
            .setTitle("Sunucu Senkronizasyonu")
            .setMessage("Sunucu IP adresleri test ediliyor...\nLütfen bekleyin.")
            .setCancelable(false)
            .create()
        progress.show()

        val executor = Executors.newSingleThreadExecutor()
        executor.execute {
            var foundUrl: String? = null
            for (url in urls) {
                val pingUrl = "${url.trimEnd('/')}/api/saglik"
                try {
                    val connection = java.net.URL(pingUrl).openConnection() as java.net.HttpURLConnection
                    connection.connectTimeout = 2000
                    connection.readTimeout = 2000
                    connection.requestMethod = "GET"
                    val code = connection.responseCode
                    if (code == 200) {
                        val response = connection.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(response)
                        if (json.optString("durum") == "OK") {
                            foundUrl = url.trimEnd('/')
                            break
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            runOnUiThread {
                progress.dismiss()
                if (foundUrl != null) {
                    activeServerUrl = foundUrl
                    prefs.edit().putString("active_server_url", activeServerUrl).apply()
                    beepSuccess()
                    flashStatus("#4CAF50")
                    Toast.makeText(this, "✓ Bağlantı Kuruldu: $activeServerUrl", Toast.LENGTH_LONG).show()
                    updateUI()
                    showPinLoginDialog()
                } else {
                    beepError()
                    flashStatus("#F44336")
                    AlertDialog.Builder(this)
                        .setTitle("Bağlantı Başarısız")
                        .setMessage("Okutulan IP adreslerine erişilemedi:\n${urls.joinToString("\n")}\n\nLütfen Wi-Fi ve Tailscale bağlantılarınızı kontrol edin.")
                        .setPositiveButton("Tamam", null)
                        .show()
                }
            }
        }
    }

    private fun showPinLoginDialog() {
        if (activeServerUrl.isEmpty()) {
            Toast.makeText(this, "Önce sunucu bağlantısı kurun!", Toast.LENGTH_SHORT).show()
            return
        }

        val progress = AlertDialog.Builder(this)
            .setTitle("Personel Listesi")
            .setMessage("Aktif personeller sunucudan yükleniyor...")
            .setCancelable(false)
            .create()
        progress.show()

        makeHttpGet("$activeServerUrl/api/personeller") { ok, response ->
            progress.dismiss()
            if (ok && response != null) {
                val jsonArr = response.optJSONArray("personeller")
                if (jsonArr == null || jsonArr.length() == 0) {
                    Toast.makeText(this, "Sunucuda aktif personel bulunamadı!", Toast.LENGTH_LONG).show()
                    return@makeHttpGet
                }

                val userList = mutableListOf<Pair<Int, String>>()
                val displayList = mutableListOf<String>()
                for (i in 0 until jsonArr.length()) {
                    val obj = jsonArr.getJSONObject(i)
                    val id = obj.getInt("id")
                    val ad = obj.getString("ad_soyad")
                    val unvan = obj.optString("unvan", "Depo Görevlisi")
                    userList.add(Pair(id, ad))
                    displayList.add("$ad ($unvan)")
                }

                val loginLayout = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(60, 40, 60, 40)
                }

                val tvLabelUser = TextView(this).apply {
                    text = "Personel Seçin:"
                    textSize = 14f
                    setTextColor(Color.parseColor("#CCCCCC"))
                    setPadding(0, 0, 0, 10)
                }

                val spinner = Spinner(this).apply {
                    val adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_item, displayList)
                    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                    this.adapter = adapter
                }

                val tvLabelPin = TextView(this).apply {
                    text = "PIN Kodu:"
                    textSize = 14f
                    setTextColor(Color.parseColor("#CCCCCC"))
                    setPadding(0, 20, 0, 10)
                }

                val etPin = EditText(this).apply {
                    hint = "4-8 Haneli PIN"
                    inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
                    textSize = 16f
                    setPadding(20, 20, 20, 20)
                }

                loginLayout.addView(tvLabelUser)
                loginLayout.addView(spinner)
                loginLayout.addView(tvLabelPin)
                loginLayout.addView(etPin)

                val dialog = AlertDialog.Builder(this)
                    .setTitle("🔑 Personel Girişi")
                    .setView(loginLayout)
                    .setCancelable(false)
                    .setPositiveButton("Giriş Yap", null)
                    .setNegativeButton("Çevrimdışı Mod") { d, _ ->
                        d.dismiss()
                        Toast.makeText(this, "Çevrimdışı modda devam ediliyor.", Toast.LENGTH_SHORT).show()
                    }
                    .create()

                dialog.show()

                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val selectedIdx = spinner.selectedItemPosition
                    val selectedUser = userList[selectedIdx]
                    val pin = etPin.text.toString().trim()

                    if (pin.isEmpty()) {
                        etPin.error = "PIN girin"
                        return@setOnClickListener
                    }

                    val loginProgress = AlertDialog.Builder(this)
                        .setMessage("Doğrulanıyor...")
                        .setCancelable(false)
                        .create()
                    loginProgress.show()

                    val loginBody = JSONObject().apply {
                        put("personel_id", selectedUser.first)
                        put("pin", pin)
                    }

                    makeHttpPost("$activeServerUrl/api/giris", loginBody) { success, loginRes ->
                        loginProgress.dismiss()
                        if (success && loginRes != null && loginRes.optBoolean("basarili", false)) {
                            sessionToken = loginRes.getString("session_token")
                            val userObj = loginRes.getJSONObject("kullanici")
                            loggedInPersonelId = userObj.getInt("id")
                            loggedInPersonelAd = userObj.getString("ad_soyad")
                            loggedInPersonelUnvan = userObj.optString("unvan", "")

                            prefs.edit().apply {
                                putString("session_token", sessionToken)
                                putInt("logged_in_personel_id", loggedInPersonelId)
                                putString("logged_in_personel_ad", loggedInPersonelAd)
                                putString("logged_in_personel_unvan", loggedInPersonelUnvan)
                                apply()
                            }

                            dialog.dismiss()
                            beepSuccess()
                            flashStatus("#4CAF50")
                            Toast.makeText(this@MainActivity, "Hoş geldiniz, $loggedInPersonelAd!", Toast.LENGTH_LONG).show()
                            updateUI()
                        } else {
                            beepError()
                            flashStatus("#F44336")
                            val msg = loginRes?.optString("mesaj") ?: "Hatalı PIN kodu!"
                            etPin.error = msg
                            Toast.makeText(this@MainActivity, "Giriş Başarısız: $msg", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            } else {
                Toast.makeText(this, "Bağlantı hatası! Personel listesi alınamadı.", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun sendBarcodeToServer(barcode: String, isGs1: Boolean) {
        val body = JSONObject().apply {
            put("uid", barcode)
            put("personel_id", loggedInPersonelId)
            put("personel_ad", loggedInPersonelAd)
        }

        makeHttpPost("$activeServerUrl/api/tarama_kaydet", body) { ok, response ->
            if (ok && response != null) {
                if (response.optBoolean("basarili", false)) {
                    runOnUiThread {
                        val allItems = gs1List + otherList
                        if (!allItems.contains(barcode)) {
                            if (isGs1) gs1List.add(0, barcode)
                            else otherList.add(barcode)
                            adapter.notifyDataSetChanged()
                        }
                        tvLastScan.text = barcode
                        flashStatus("#4CAF50")
                        beepSuccess()
                        saveDepoSession(secilenDepo)
                        updateUI()
                    }
                } else {
                    val errorType = response.optString("hata_tipi")
                    val msg = response.optString("mesaj", "Bilinmeyen sunucu hatası")
                    runOnUiThread {
                        beepError()
                        flashStatus("#F44336")
                        if (errorType == "MUKERRER") {
                            showDuplicate(barcode)
                        } else if (errorType == "GECERSIZ_BARKOD") {
                            AlertDialog.Builder(this@MainActivity)
                                .setTitle("⚠️ Geçersiz Barkod!")
                                .setMessage(msg)
                                .setPositiveButton("Tamam", null)
                                .show()
                        } else {
                            Toast.makeText(this@MainActivity, msg, Toast.LENGTH_LONG).show()
                        }
                    }
                }
            } else {
                runOnUiThread {
                    beepError()
                    flashStatus("#F44336")
                    Toast.makeText(this@MainActivity, "Sunucuya bağlanılamadı! Barkod yerel listeye çevrimdışı eklendi.", Toast.LENGTH_LONG).show()

                    val allItems = gs1List + otherList
                    if (!allItems.contains(barcode)) {
                        if (isGs1) gs1List.add(0, barcode)
                        else otherList.add(barcode)
                        adapter.notifyDataSetChanged()
                        tvLastScan.text = barcode
                        saveDepoSession(secilenDepo)
                        updateUI()
                    }
                }
            }
        }
    }

    private fun deleteBarcodeFromServer(barcode: String, position: Int) {
        val body = JSONObject().apply {
            put("uid", barcode)
            put("personel_id", loggedInPersonelId)
            put("personel_ad", loggedInPersonelAd)
        }

        val progress = AlertDialog.Builder(this)
            .setMessage("Stoktan düşülüyor...")
            .setCancelable(false)
            .create()
        progress.show()

        makeHttpPost("$activeServerUrl/api/tarama_sil", body) { ok, response ->
            progress.dismiss()
            if (ok && response != null && response.optBoolean("basarili", false)) {
                beepSuccess()
                flashStatus("#4CAF50")
                Toast.makeText(this, "✓ Ürün başarıyla silindi ve loglandı.", Toast.LENGTH_LONG).show()
                removeItemAt(position)
                saveDepoSession(secilenDepo)
                updateUI()
            } else {
                beepError()
                flashStatus("#F44336")
                val msg = response?.optString("mesaj") ?: "Sunucudan silme başarısız!"
                Toast.makeText(this, "Silme Başarısız: $msg", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun initiateDamageCapture(uid: String) {
        if (activeServerUrl.isEmpty() || loggedInPersonelId == -1) {
            Toast.makeText(this, "Hasar raporu göndermek için sunucuya giriş yapmalısınız!", Toast.LENGTH_LONG).show()
            return
        }

        photoTargetUid = uid
        try {
            val photoFile = java.io.File(cacheDir, "damage_temp_${System.currentTimeMillis()}.jpg")
            val uri = androidx.core.content.FileProvider.getUriForFile(
                this, "${packageName}.provider", photoFile
            )
            lastCapturedPhotoUri = uri
            takePhotoLauncher.launch(uri)
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Kamera başlatılamadı: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun showDamageDescriptionDialog(uid: String, photoUri: Uri) {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(60, 40, 60, 40)
        }

        val tvInfo = TextView(this).apply {
            text = "Barkod: $uid\nLütfen hasar detaylarını açıklayın:"
            textSize = 14f
            setTextColor(Color.parseColor("#CCCCCC"))
            setPadding(0, 0, 0, 10)
        }

        val etDescription = EditText(this).apply {
            hint = "örn: Paket ezik ve ambalaj yırtık."
            inputType = android.text.InputType.TYPE_CLASS_TEXT
            textSize = 16f
            setPadding(20, 20, 20, 20)
        }

        layout.addView(tvInfo)
        layout.addView(etDescription)

        AlertDialog.Builder(this)
            .setTitle("📝 Hasar Raporu Ekle")
            .setView(layout)
            .setCancelable(false)
            .setPositiveButton("Raporu Gönder") { _, _ ->
                val desc = etDescription.text.toString().trim().ifEmpty { "Hasarlı Ürün Raporu" }
                uploadDamageReport(uid, photoUri, desc)
            }
            .setNegativeButton("İptal", null)
            .show()
    }

    private fun uploadDamageReport(uid: String, photoUri: Uri, desc: String) {
        val progress = AlertDialog.Builder(this)
            .setTitle("Hasar Raporu")
            .setMessage("Görsel ve açıklama sunucuya yükleniyor...")
            .setCancelable(false)
            .create()
        progress.show()

        Executors.newSingleThreadExecutor().execute {
            var conn: java.net.HttpURLConnection? = null
            try {
                val boundary = "Boundary-" + System.currentTimeMillis()
                val url = java.net.URL("$activeServerUrl/api/sorun_gorseli")
                conn = url.openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 15000
                conn.readTimeout = 15000
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                conn.doOutput = true

                val os = conn.outputStream
                val writer = os.bufferedWriter(Charsets.UTF_8)

                val addFormField = { name: String, value: String ->
                    writer.write("--$boundary\r\n")
                    writer.write("Content-Disposition: form-data; name=\"$name\"\r\n\r\n")
                    writer.write("$value\r\n")
                }

                addFormField("uid", uid)
                addFormField("aciklama", desc)
                addFormField("personel_ad", loggedInPersonelAd.ifEmpty { "Saha Personeli" })
                writer.flush()

                writer.write("--$boundary\r\n")
                writer.write("Content-Disposition: form-data; name=\"foto\"; filename=\"damage_$uid.jpg\"\r\n")
                writer.write("Content-Type: image/jpeg\r\n\r\n")
                writer.flush()

                contentResolver.openInputStream(photoUri)?.use { inputStream ->
                    inputStream.copyTo(os)
                }
                os.flush()

                writer.write("\r\n--$boundary--\r\n")
                writer.flush()
                writer.close()
                os.close()

                val code = conn.responseCode
                if (code == 200) {
                    val response = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(response)
                    runOnUiThread {
                        progress.dismiss()
                        if (json.optBoolean("basarili", false)) {
                            beepSuccess()
                            flashStatus("#4CAF50")
                            Toast.makeText(this@MainActivity, "✓ Hasar raporu başarıyla yüklendi!", Toast.LENGTH_LONG).show()
                        } else {
                            beepError()
                            flashStatus("#F44336")
                            Toast.makeText(this@MainActivity, "Yükleme başarısız: ${json.optString("mesaj")}", Toast.LENGTH_LONG).show()
                        }
                    }
                } else {
                    runOnUiThread {
                        progress.dismiss()
                        beepError()
                        flashStatus("#F44336")
                        Toast.makeText(this@MainActivity, "Sunucu Hatası: HTTP $code", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                runOnUiThread {
                    progress.dismiss()
                    beepError()
                    flashStatus("#F44336")
                    Toast.makeText(this@MainActivity, "Bağlantı Hatası: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
                }
            } finally {
                conn?.disconnect()
            }
        }
    }

    // ── ADAPTER ──────────────────────────────────────────────────────
    inner class BarcodeListAdapter(
        ctx: Context,
        private val gs1: List<String>,
        private val other: List<String>
    ) : BaseAdapter() {
        override fun getCount() = gs1.size + other.size
        override fun getItem(position: Int) =
            if (position < gs1.size) gs1[position] else other[position - gs1.size]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val ctx = this@MainActivity
            val row = convertView as? LinearLayout ?: LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(12, 8, 12, 8)
            }
            row.removeAllViews()
            val isOther = position >= gs1.size
            val item    = getItem(position)
            val tvNr = TextView(ctx).apply {
                text = "${position + 1}"
                textSize = 10f
                setTextColor(Color.parseColor("#555555"))
                minWidth = 52
                setPadding(0, 0, 8, 0)
                gravity = android.view.Gravity.CENTER_VERTICAL
            }
            val tvBarcode = TextView(ctx).apply {
                text = if (isOther) "⚡ $item" else item
                textSize = 11f
                setTextColor(if (isOther) Color.parseColor("#FF9800") else Color.parseColor("#CCCCCC"))
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            row.addView(tvNr)
            row.addView(tvBarcode)
            row.setBackgroundColor(
                when {
                    isOther -> Color.parseColor("#1A1200")
                    position % 2 == 0 -> Color.parseColor("#0D0D0D")
                    else -> Color.parseColor("#111111")
                }
            )
            return row
        }
    }
}
