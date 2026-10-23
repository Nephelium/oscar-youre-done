package com.jingjing.chesssprout

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class GameStore(context: Context) {
    private val directory = File(context.filesDir, "games").apply { mkdirs() }
    private val evidence=File(context.filesDir,"evidence")
    private fun file(id: String): File { require(id.matches(Regex("[A-Za-z0-9_-]{1,80}"))); return File(directory, "$id.json") }
    fun read(id: String): JSONObject? = synchronized(lock) {
        runCatching { JSONObject(AtomicFile(file(id)).openRead().bufferedReader(Charsets.UTF_8).use { it.readText() }) }.getOrNull()
    }
    fun list(): JSONArray = synchronized(lock) {
        JSONArray(directory.listFiles()?.filter { it.name.endsWith(".json") }?.mapNotNull { read(it.nameWithoutExtension) }
            ?.sortedByDescending { it.optLong("updatedAt") } ?: emptyList<JSONObject>())
    }
    fun save(game: JSONObject) = synchronized(lock) {
        require(game.optJSONArray("moves") != null)
        val bytes = game.toString().toByteArray(Charsets.UTF_8)
        require(bytes.size <= 12 * 1024 * 1024)
        val atomic = AtomicFile(file(game.getString("id")))
        val output = atomic.startWrite()
        try { output.write(bytes); atomic.finishWrite(output) } catch (error: Exception) { atomic.failWrite(output); throw error }
    }
    fun mergeAnalysis(id: String, fen: String, result: JSONObject) = synchronized(lock) {
        val game = read(id) ?: return@synchronized
        val analyses = game.optJSONObject("analysis") ?: JSONObject()
        if (shouldReplaceAnalysis(analyses.optJSONObject(fen),result)) {
            analyses.put(fen, result); game.put("analysis", analyses); save(game)
        }
    }
    fun delete(id: String) = synchronized(lock) {
        val target=file(id)
        AtomicFile(target).delete()
        require(!target.exists()) {"删除失败，请重试"}
        evidence.listFiles()?.filter{it.isFile && it.name.startsWith("$id-") && it.name.matches(Regex("[A-Za-z0-9_-]+\\.jpg"))}?.forEach {require(it.delete()){ "校对图片未能删除，请重试" }}
    }
    companion object {
        private val lock = Any()
        fun requireEditable(id: String, capture: JSONObject?, video: JSONObject) {
            check(capture?.optString("gameId")!=id) { "请先结束这篇手记的屏幕记录" }
            check(video.optString("state")!="processing" || video.optString("gameId")=="" || video.optString("gameId")!=id) {
                "请先停止录屏导入或等待完成，再编辑这篇手记"
            }
        }
        fun shouldReplaceAnalysis(previous: JSONObject?, next: JSONObject): Boolean {
            if(previous==null || previous.optString("engine")!=next.optString("engine"))return true
            val oldDepth=previous.optJSONArray("lines")?.optJSONObject(0)?.optInt("depth")?:0
            val newDepth=next.optJSONArray("lines")?.optJSONObject(0)?.optInt("depth")?:0
            return newDepth>=oldDepth
        }
    }
}
