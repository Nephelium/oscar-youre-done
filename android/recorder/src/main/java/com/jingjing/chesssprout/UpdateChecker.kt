package com.jingjing.chesssprout

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

object ReleasePolicy {
    const val PAGE = "https://github.com/Nephelium/oscar-youre-done/releases"
    const val API = "https://api.github.com/repos/Nephelium/oscar-youre-done/releases/latest"
    private fun version(value: String): List<Int> {
        require(value.matches(Regex("v?\\d{1,6}\\.\\d{1,6}\\.\\d{1,6}"))) { "版本信息暂不可用" }
        return value.removePrefix("v").split('.').map { it.toInt() }
    }
    fun newer(remote: String, local: String): Boolean {
        val a=version(remote);val b=version(local)
        for(i in a.indices)if(a[i]!=b[i])return a[i]>b[i]
        return false
    }
    fun due(now: Long,last: Long,interval: Long)=last<=0L || now<last || now-last>=interval
    fun evaluate(release: JSONObject,current: String): JSONObject {
        require(!release.optBoolean("draft") && !release.optBoolean("prerelease")) { "正式版本暂不可用" }
        val tag=release.getString("tag_name");val isNew=newer(tag,current)
        val assets=release.optJSONArray("assets")
        val hasApk=assets!=null && (0 until assets.length()).any { i ->
            val asset=assets.optJSONObject(i)
            val name=asset?.optString("name")?:""
            name.matches(Regex("[A-Za-z0-9._-]+\\.apk")) && asset?.optString("state")=="uploaded" &&
                asset.optLong("size")>0 && asset.optString("browser_download_url")=="$PAGE/download/$tag/$name"
        }
        require(!isNew || hasApk) { "新版安装包尚未准备好，请稍后检查" }
        return JSONObject().put("state",if(isNew)"update" else "latest").put("version",tag.removePrefix("v"))
            .put("currentVersion",current).put("url","$PAGE/tag/$tag")
    }
}

/** Only release metadata is requested. Game data never enters this client. */
class UpdateChecker(context: Context,private val current: String) : AutoCloseable {
    private val prefs=context.applicationContext.getSharedPreferences("updates",Context.MODE_PRIVATE)
    private val executor=Executors.newSingleThreadExecutor()
    private val checking=AtomicBoolean(false)
    @Volatile private var closed=false
    @Volatile private var connection: HttpURLConnection?=null
    fun check(force: Boolean,callback: (JSONObject)->Unit) {
        if(closed || !checking.compareAndSet(false,true))return
        executor.execute {
            try {
                val now=System.currentTimeMillis()
                val checked=prefs.getLong("checked",0)
                val cached=runCatching { JSONObject(prefs.getString("release",null)?:"") }.getOrNull()
                val result=if(!force && cached!=null && !ReleasePolicy.due(now,checked,24*60*60*1000L)) {
                    ReleasePolicy.evaluate(cached,current).put("checkedAt",checked).put("cached",true)
                } else if(!force && !ReleasePolicy.due(now,prefs.getLong("attempt",0),15*60*1000L)) {
                    JSONObject().put("state","error").put("message","暂时无法连接 GitHub，可稍后手动检查。")
                } else {
                    prefs.edit().putLong("attempt",now).apply()
                    val release=fetch()
                    val evaluated=ReleasePolicy.evaluate(release,current)
                    prefs.edit().putString("release",release.toString()).putLong("checked",now).apply()
                    evaluated.put("checkedAt",now).put("cached",false)
                }
                if(!closed)callback(result)
            } catch(_: Exception) {
                if(!closed)callback(JSONObject().put("state","error").put("message","暂时无法检查更新，请确认网络后重试。"))
            } finally {checking.set(false)}
        }
    }
    private fun fetch(): JSONObject {
        val conn=URL(ReleasePolicy.API).openConnection() as HttpURLConnection
        connection=conn
        try {
            conn.connectTimeout=8000;conn.readTimeout=8000;conn.instanceFollowRedirects=false
            conn.setRequestProperty("Accept","application/vnd.github+json")
            conn.setRequestProperty("User-Agent","Oscar-Youre-Done/$current")
            conn.setRequestProperty("X-GitHub-Api-Version","2022-11-28")
            check(conn.responseCode==200)
            val body=conn.inputStream.use { input ->
                val bytes=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
                while(true){val count=input.read(buffer);if(count<0)break;check(bytes.size()+count<=256*1024);bytes.write(buffer,0,count)}
                bytes.toString("UTF-8")
            }
            return JSONObject(body)
        } finally {conn.disconnect();connection=null}
    }
    override fun close(){closed=true;connection?.disconnect();executor.shutdownNow()}
}
