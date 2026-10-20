package com.jingjing.chesssprout

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

/** Last locally learned artwork. Contains cell features, never a screen image. */
class ThemeStore(context: Context) {
    private val file=AtomicFile(File(context.filesDir,"board-theme-v1.json.gz"))
    fun exists(): Boolean=file.baseFile.isFile
    fun load(): JSONObject?=runCatching {
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
        val output=file.startWrite()
        try {
            val bytes=java.io.ByteArrayOutputStream().also { buffer ->
                GZIPOutputStream(buffer).use { it.write(data.toString().toByteArray(Charsets.UTF_8)) }
            }.toByteArray()
            output.write(bytes);file.finishWrite(output)
        } catch(error: Exception) {file.failWrite(output);throw error}
    }
}
