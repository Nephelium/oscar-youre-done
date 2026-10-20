package com.jingjing.chesssprout

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

/** Last locally learned artwork. Contains cell features, never a screen image. */
class ThemeStore(private val context: Context) {
    private val file=AtomicFile(File(context.filesDir,"board-theme-v1.json.gz"))
    fun exists(): Boolean=file.baseFile.isFile || runCatching {
        context.assets.open("review/assets/duolingo-board-profile.json").use { };true
    }.getOrDefault(false)
    fun load(): JSONObject? {
        val base=bundled()
        val local=loadLocal()?.takeIf{it.optInt("schema")==2}?:return base
        return combine(base,local)
    }
    private fun combine(base: JSONObject?,profile: JSONObject): JSONObject {
        val merged=mutableMapOf<String,JSONObject>()
        fun add(data: JSONObject?) {
            if(data==null)return
            val copy=JSONObject(data.toString());copy.remove("alternate")
            merged[copy.optString("appearance","light")]=copy
            data.optJSONObject("alternate")?.let { alt ->
                val extra=JSONObject(alt.toString());extra.remove("alternate")
                merged[extra.optString("appearance","light")]=extra
            }
        }
        add(base);add(profile)
        val mode=profile.optString("appearance","light")
        return merged.getValue(mode).also { result->merged.filterKeys{it!=mode}.values.firstOrNull()?.let{result.put("alternate",it)} }
    }
    fun bundled(): JSONObject? {
        val day=asset("duolingo-board-profile")?:return null
        return asset("duolingo-night-profile")?.let{combine(day,it)}?:day
    }
    private fun asset(name: String): JSONObject?=runCatching {
        // AAPT expands *.gz assets and strips the suffix while packaging.
        context.assets.open("review/assets/$name.json").use { raw ->
            raw.bufferedReader().use { JSONObject(it.readText()) }
        }
    }.getOrNull()
    private fun loadLocal(): JSONObject?=runCatching {
        require(file.baseFile.length() in 1..2_000_000)
        val bytes=GZIPInputStream(file.openRead()).use { input ->
            val buffer=java.io.ByteArrayOutputStream();val chunk=ByteArray(8192)
            while(buffer.size()<=4_000_000) {val count=input.read(chunk);if(count<0)break;buffer.write(chunk,0,count)}
            buffer.toByteArray()
        }
        require(bytes.size<=4_000_000)
        JSONObject(bytes.toString(Charsets.UTF_8))
    }.getOrNull()
    fun save(data: JSONObject) {
        val combined=combine(load(),data)
        val output=file.startWrite()
        try {
            val bytes=java.io.ByteArrayOutputStream().also { buffer ->
                GZIPOutputStream(buffer).use { it.write(combined.toString().toByteArray(Charsets.UTF_8)) }
            }.toByteArray()
            output.write(bytes);file.finishWrite(output)
        } catch(error: Exception) {file.failWrite(output);throw error}
    }
}
