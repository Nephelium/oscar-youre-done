package com.jingjing.chesssprout

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.res.Configuration
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.github.bhlangonijr.chesslib.Board
import com.github.bhlangonijr.chesslib.move.Move
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.Executors

class MainActivity: ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var store: GameStore
    private lateinit var engine: StockfishEngine
    private lateinit var updates: UpdateChecker
    @Volatile private var releasePage=ReleasePolicy.PAGE+"/latest"
    private val executor=Executors.newSingleThreadExecutor()
    private var chooser: ValueCallback<Array<Uri>>?=null
    private var captureOptions="{}"
    private var exporting=false
    private var exportMime="text/plain"
    private var ready=false
    private var destroyed=false
    private val exportFile get()=File(cacheDir,"pending-export.txt")
    private fun systemNight()=(resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES
    @Suppress("DEPRECATION")
    private fun applyAppearance(dark: Boolean) {
        val color=if(dark)0xff162022.toInt() else 0xfffaf8f1.toInt()
        web.setBackgroundColor(color)
        (web.parent as? FrameLayout)?.setBackgroundColor(color)
        window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(color))
        if(Build.VERSION.SDK_INT>=30){
            val mask=WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if(dark)0 else mask,mask)
        }else{
            val mask=android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            window.decorView.systemUiVisibility=if(dark)window.decorView.systemUiVisibility and mask.inv() else window.decorView.systemUiVisibility or mask
        }
    }
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if(ready)emit(JSONObject().put("type","appearance").put("nightMode",systemNight()))
    }
    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store=GameStore(this);engine=StockfishEngine(applicationContext)
        updates=UpdateChecker(this,packageManager.getPackageInfo(packageName,0).versionName?:"1.3.7")
        captureOptions=savedInstanceState?.getString("captureOptions")?:"{}"
        exporting=savedInstanceState?.getBoolean("exporting")?:false
        if(Build.VERSION.SDK_INT>=30)window.setDecorFitsSystemWindows(false)
        else window.decorView.systemUiVisibility=android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE or android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        window.statusBarColor=Color.TRANSPARENT;window.navigationBarColor=Color.TRANSPARENT
        val frame=FrameLayout(this).apply{setBackgroundColor(0xfffaf8f1.toInt())}
        web=WebView(this).apply{setBackgroundColor(0xfffaf8f1.toInt())}
        frame.addView(web,FrameLayout.LayoutParams(-1,-1));setContentView(frame)
        applyAppearance(systemNight())
        frame.setOnApplyWindowInsetsListener { view,insets ->
            if(Build.VERSION.SDK_INT>=30) {
                val safe=insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                view.setPadding(safe.left,safe.top,safe.right,safe.bottom);WindowInsets.CONSUMED
            } else {view.setPadding(insets.systemWindowInsetLeft,insets.systemWindowInsetTop,insets.systemWindowInsetRight,insets.systemWindowInsetBottom);insets.consumeSystemWindowInsets()}
        }
        val loader=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.settings.apply{javaScriptEnabled=true;domStorageEnabled=true;allowFileAccess=false;allowContentAccess=true
            mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW;setSupportZoom(false)}
        web.addJavascriptInterface(Host(),"SproutHost")
        web.webViewClient=object: WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView,request: WebResourceRequest): WebResourceResponse? {
                val uri=request.url
                if(uri.scheme=="https" && uri.host=="appassets.androidplatform.net" && uri.path?.startsWith("/assets/")==true)return loader.shouldInterceptRequest(uri)
                return WebResourceResponse("text/plain","UTF-8",403,"Offline only",emptyMap(),ByteArrayInputStream(byteArrayOf()))
            }
            override fun shouldOverrideUrlLoading(view: WebView,request: WebResourceRequest): Boolean = request.url.toString()!=URL
            override fun onPageFinished(view: WebView,url: String) { ready=url==URL }
        }
        web.webChromeClient=object: WebChromeClient() {
            override fun onShowFileChooser(view: WebView,callback: ValueCallback<Array<Uri>>,params: FileChooserParams): Boolean {
                chooser?.onReceiveValue(null);chooser=callback
                return try {startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type="*/*"},PICK_TEXT);true}
                catch(_: Exception){chooser=null;callback.onReceiveValue(null);false}
            }
        }
        if(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE!=0)WebView.setWebContentsDebuggingEnabled(true)
        web.loadUrl(URL)
        onBackPressedDispatcher.addCallback(this,object: OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {web.evaluateJavascript("window.App && App.back()") {if(it!="true")moveTaskToBack(true)} }
        })
    }
    private fun emit(event: JSONObject) {runOnUiThread {if(!destroyed)web.evaluateJavascript("window.App && App.hostEvent(${event})",null)} }
    private fun message(text: String) {runOnUiThread {Toast.makeText(this,text,Toast.LENGTH_LONG).show()} }
    private fun imageData(bitmap: Bitmap?): String {
        if(bitmap==null)return ""
        return try {val stream=ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,82,stream);"data:image/jpeg;base64,"+Base64.encodeToString(stream.toByteArray(),Base64.NO_WRAP)} finally {bitmap.recycle()}
    }
    private inner class Host {
        @JavascriptInterface fun checkUpdate(force: Boolean) {updates.check(force) { result ->
            if(result.optString("state")=="update")releasePage=result.getString("url")
            emit(JSONObject().put("type","updateCheck").put("result",result))
        }}
        @JavascriptInterface fun openRelease() {runOnUiThread {
            runCatching {startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(releasePage)))}
                .onFailure {message("未找到可用的浏览器")}
        }}
        @JavascriptInterface fun listGames(): String=store.list().toString()
        @JavascriptInterface fun deleteGame(id: String): String=runCatching {
            GameStore.requireEditable(id,CaptureService.instance?.snapshot(),VideoImporter.state)
            store.delete(id);""
        }.getOrElse{it.message?:"删除失败，请重试"}
        @JavascriptInterface fun readLicense(component: String): String {
            val path=when(component){"stockfish"->"licenses/stockfish/Copying.txt";"chesslib"->"licenses/chesslib/LICENSE";else->return ""}
            return assets.open(path).bufferedReader(Charsets.UTF_8).use{it.readText()}
        }
        @JavascriptInterface fun openSource(component: String) {
            val url=when(component){"stockfish19"->"https://github.com/official-stockfish/Stockfish/tree/sf_19";"stockfish16"->"https://f-droid.org/repo/org.petero.droidfish_100_src.tar.gz";else->return}
            runOnUiThread{runCatching{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)))}.onFailure{message("未找到可用的浏览器")}}
        }
        @JavascriptInterface fun status(): String=JSONObject().put("capture",CaptureService.instance?.snapshot()?:JSONObject().put("running",false))
            .put("nightMode",systemNight())
            .put("video",VideoImporter.state).put("engine",engine.name).put("version",packageManager.getPackageInfo(packageName,0).versionName).put("themeReady",ThemeStore(this@MainActivity).exists()).put("moveFeedback",getSharedPreferences("capture",MODE_PRIVATE).getBoolean("moveFeedback",true)).put("overlay",Settings.canDrawOverlays(this@MainActivity)).toString()
        @JavascriptInterface fun setMoveFeedback(enabled: Boolean) {
            getSharedPreferences("capture",MODE_PRIVATE).edit().putBoolean("moveFeedback",enabled).apply()
            if(!enabled)runOnUiThread{CaptureService.instance?.clearFeedback()}
        }
        @JavascriptInterface fun setAppearance(dark: Boolean) { runOnUiThread{applyAppearance(dark)} }
        @JavascriptInterface fun saveGame(content: String): String=runCatching {
            require(content.length<=12*1024*1024)
            val record=JSONObject(content);val moves=record.getJSONArray("moves");require(moves.length()<=6000)
            val active=CaptureService.instance?.snapshot()
            GameStore.requireEditable(record.getString("id"),active,VideoImporter.state)
            val board=Board().apply{loadFromFen(record.getString("initialFen"))}
            for(i in 0 until moves.length()) {val input=moves.getString(i);require(input.matches(Regex("[a-h][1-8][a-h][1-8][qrbn]?")));check(board.doMove(Move(input,board.sideToMove),true))}
            store.save(record);""
        }.getOrElse {it.message?:"保存失败，请重试"}
        @JavascriptInterface fun analyze(request: String,gameId: String,fen: String,budget: Int) {
            if(!request.matches(Regex("[A-Za-z0-9_-]{1,100}")))return
            val token=engine.generation.get()
            executor.execute {
                try {check(CaptureService.instance==null){"请先结束屏幕记录，再开始复盘"};check(VideoImporter.state.optString("state")!="processing"){"请等待录屏识别完成，再开始分析"};val result=engine.analyze(fen,budget,token);if(gameId.isNotEmpty())store.mergeAnalysis(gameId,fen,result)
                    emit(JSONObject().put("type","analysis").put("id",request).put("fen",fen).put("result",result))}
                catch(error: Exception){emit(JSONObject().put("type","analysis").put("id",request).put("error",error.message?:"分析失败"))}
            }
        }
        @JavascriptInterface fun analyzeLive(request: String, gameId: String, fen: String, options: String) {
            if(!request.matches(Regex("[A-Za-z0-9_-]{1,100}")) || options.length>1000)return
            val token=engine.generation.get()
            executor.execute {
                try {
                    check(CaptureService.instance==null){"请先结束屏幕记录"}
                    check(VideoImporter.state.optString("state")!="processing"){"请等待录屏识别完成"}
                    val config=JSONObject(options);val infinite=config.optBoolean("infinite",false)
                    val result=engine.analyze(fen,config.optInt("budget",200).coerceIn(200,5000),token,
                        if(infinite)null else config.optInt("depth",20).coerceIn(1,40),infinite) { partial ->
                        emit(JSONObject().put("type","analysisUpdate").put("id",request).put("fen",fen).put("result",partial))
                    }
                    // The UI retains deeper cached results and saves accepted updates on completion/pause.
                    emit(JSONObject().put("type","analysis").put("id",request).put("fen",fen).put("result",result))
                }catch(error: Exception){emit(JSONObject().put("type","analysis").put("id",request).put("error",error.message?:"分析失败"))}
            }
        }
        @JavascriptInterface fun cancelAnalysis() {engine.cancel()}
        @JavascriptInterface fun playMove(request: String, content: String) {
            if(!request.matches(Regex("[A-Za-z0-9_-]{1,100}")) || content.length>60000)return
            val token=engine.generation.get()
            executor.execute {
                try {
                    check(CaptureService.instance==null){"请先结束屏幕记录"}
                    check(VideoImporter.state.optString("state")!="processing"){"请等待录屏识别完成"}
                    val options=JSONObject(content);val input=options.getJSONArray("moves")
                    val result=engine.play(options.getString("initialFen"),List(input.length()){input.getString(it)},options.getInt("skill"),token)
                    emit(JSONObject().put("type","playMove").put("id",request).put("result",result))
                } catch(error: Exception) {emit(JSONObject().put("type","playMove").put("id",request).put("error",error.message?:"引擎应手失败"))}
            }
        }
        @JavascriptInterface fun startCapture(options: String) {runOnUiThread {
            if(!ready)return@runOnUiThread
            if(CaptureService.instance!=null){message("已有一局正在记录");return@runOnUiThread}
            if(VideoImporter.state.optString("state")=="processing"){message("请先等待或停止录屏识别");return@runOnUiThread}
            captureOptions=options.take(4000)
            try {
                if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),NOTIFY)
                else launchCapture()
            }catch(_: Exception){message("无法打开屏幕采集授权")}
        } }
        @JavascriptInterface fun captureAction(action: String,options: String) {runOnUiThread {
            if(action in listOf("stop","pause","configure") && CaptureService.instance!=null)
                startService(Intent(this@MainActivity,CaptureService::class.java).setAction(action).putExtra("options",options.take(4000)))
        } }
        @JavascriptInterface fun capturePreview(): String=imageData(CaptureService.instance?.preview())
        @JavascriptInterface fun suggestCrop(mode: String,requestId: Int) {executor.execute {
            val bitmap=when(mode){"video"->VideoImporter.previewCopy();"image"->ScreenshotImporter.previewCopy();else->CaptureService.instance?.preview()}
            if(bitmap!=null)try {
                val region=runCatching{BoardRecognizer().locate(bitmap)}.getOrNull()
                if(region!=null)emit(JSONObject().put("type","cropSuggested").put("requestId",requestId)
                    .put("region",JSONObject().put("left",region.left.toDouble()).put("top",region.top.toDouble())
                        .put("right",region.right.toDouble()).put("bottom",region.bottom.toDouble())))
            } finally {bitmap.recycle()}
        }}
        @JavascriptInterface fun openDuolingo() {runOnUiThread {
            val intent=packageManager.getLaunchIntentForPackage("com.duolingo")
            if(intent!=null)runCatching{startActivity(intent)}.onFailure{message("请手动切回多邻国")}
            else message("请先安装多邻国，或从最近任务切回棋盘")
        }}
        @JavascriptInterface fun overlayPermission() {runOnUiThread {runCatching {startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:$packageName")))}.onFailure{message("系统未提供悬浮窗设置，可使用通知栏控制")}}}
        @JavascriptInterface fun selectVideo() {runOnUiThread {
            if(CaptureService.instance!=null){message("请先结束屏幕记录");return@runOnUiThread}
            runCatching {startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type="video/*"},PICK_VIDEO)}.onFailure{message("无法打开文件选择器")}
        } }
        @JavascriptInterface fun videoPreview(): String=imageData(VideoImporter.previewCopy())
        @JavascriptInterface fun seekVideo(time: Long) {executor.execute {
            runCatching {VideoImporter.seek(applicationContext,time)}
                .onSuccess{emit(JSONObject().put("type","videoPreviewUpdated"))}.onFailure{message(it.message?:"无法读取这一帧")}
        }}
        @JavascriptInterface fun prepareVideo(options: String) {executor.execute {
            runCatching {VideoImporter.prepare(applicationContext,JSONObject(options))}
                .onSuccess{emit(it.put("type","videoRecognized"))}.onFailure{emit(JSONObject().put("type","videoError").put("message",it.message?:"无法识别起始局面"))}
        }}
        @JavascriptInterface fun runVideo(options: String) {runCatching {check(CaptureService.instance==null){"请先结束屏幕记录"};VideoImporter.run(applicationContext,JSONObject(options))}.onFailure{message(it.message?:"导入失败")}}
        @JavascriptInterface fun cancelVideo() {VideoImporter.cancel()}
        @JavascriptInterface fun selectImage() {runOnUiThread {
            if(CaptureService.instance!=null || VideoImporter.state.optString("state")=="processing"){message("请先结束当前记录");return@runOnUiThread}
            runCatching {startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {addCategory(Intent.CATEGORY_OPENABLE);type="image/*"},PICK_IMAGE)}.onFailure{message("无法打开图片选择器")}
        }}
        @JavascriptInterface fun imagePreview(): String=imageData(ScreenshotImporter.previewCopy())
        @JavascriptInterface fun recognizeImage(options: String) {executor.execute {
            runCatching {ScreenshotImporter.recognize(applicationContext,JSONObject(options))}
                .onSuccess{emit(it.put("type","imageRecognized"))}.onFailure{emit(JSONObject().put("type","imageError").put("message",it.message?:"图片识别失败"))}
        }}
        @JavascriptInterface fun confirmImage(options: String): String=runCatching {ScreenshotImporter.confirm(applicationContext,JSONObject(options)).toString()}
            .getOrElse{JSONObject().put("error",it.message?:"保存失败").toString()}
        @JavascriptInterface fun evidence(name: String): String {
            if(!name.matches(Regex("[A-Za-z0-9_-]+\\.jpg")))return ""
            val file=File(filesDir,"evidence/$name")
            return if(file.isFile)"data:image/jpeg;base64,"+Base64.encodeToString(file.readBytes(),Base64.NO_WRAP) else ""
        }
        @JavascriptInterface fun exportDocument(filename: String,content: String,mime: String) {runOnUiThread {
            if(!ready || exporting || content.length>12*1024*1024)return@runOnUiThread
            if(filename.contains('/') || filename.contains('\\') || filename.length>150)return@runOnUiThread
            try {exportFile.writeText(content,Charsets.UTF_8);exportMime=when{mime=="application/json"->mime;filename.endsWith(".pgn",true)->"application/x-chess-pgn";else->"text/plain"};exporting=true
                startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type=exportMime;putExtra(Intent.EXTRA_TITLE,filename)},EXPORT)}
            catch(_: Exception){exporting=false;message("无法打开保存位置，请重试")}
        } }
    }
    @Suppress("DEPRECATION")
    private fun launchCapture() {startActivityForResult(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent(),CAPTURE)}
    override fun onRequestPermissionsResult(requestCode: Int,permissions: Array<String>,grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode,permissions,grantResults)
        if(requestCode==NOTIFY)runCatching {launchCapture()}.onFailure {message("无法打开屏幕采集授权")}
    }
    @Deprecated("Legacy result API")
    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int,resultCode: Int,data: Intent?) {
        super.onActivityResult(requestCode,resultCode,data)
        when(requestCode) {
            PICK_IMAGE -> if(resultCode==RESULT_OK && data?.data!=null) {
                val uri=data.data!!
                Thread {runCatching {ScreenshotImporter.select(applicationContext,uri);emit(JSONObject().put("type","imageReady"))}.onFailure{message(it.message?:"图片读取失败")}}.start()
            }
            PICK_TEXT -> {chooser?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data));chooser=null}
            CAPTURE -> {
                if(resultCode==RESULT_OK && data!=null) {
                    try {startForegroundService(Intent(this,CaptureService::class.java).putExtra("result",resultCode).putExtra("data",data).putExtra("options",captureOptions))
                        emit(JSONObject().put("type","captureStarted"))}
                    catch(_: Exception){message("无法启动记录，请重新授权")}
                }else message("已取消记录，随时可以重新开启")
            }
            EXPORT -> {
                exporting=false
                if(resultCode==RESULT_OK && data?.data!=null)Thread {
                    val ok=runCatching {contentResolver.openOutputStream(data.data!!)?.use {out -> exportFile.inputStream().use {it.copyTo(out)}}?:error("无法写入")}.isSuccess
                    message(if(ok)"已保存到选择的位置" else "保存失败，请重新导出")
                }.start()
            }
            PICK_VIDEO -> if(resultCode==RESULT_OK && data?.data!=null) {
                val uri=data.data!!
                emit(JSONObject().put("type","videoLoading"))
                Thread {runCatching {VideoImporter.select(applicationContext,uri);emit(JSONObject().put("type","videoReady"))}
                    .onFailure{emit(JSONObject().put("type","videoLoadError").put("message",it.message?:"无法读取录屏"))}}.start()
            }
        }
    }
    override fun onSaveInstanceState(state: Bundle) {state.putString("captureOptions",captureOptions);state.putBoolean("exporting",exporting);super.onSaveInstanceState(state)}
    override fun onStart() {super.onStart();CaptureService.appVisible=true}
    override fun onStop() {CaptureService.appVisible=false;super.onStop()}
    override fun onPause() {engine.cancel();if(::web.isInitialized){web.evaluateJavascript("window.App && App.pause()",null);web.onPause()};super.onPause()}
    override fun onResume() {super.onResume();if(::web.isInitialized){web.onResume();web.evaluateJavascript("window.App && App.resume()",null)}}
    override fun onDestroy() {destroyed=true;ready=false;chooser?.onReceiveValue(null);updates.close();engine.cancel();executor.shutdownNow();engine.close()
        web.removeJavascriptInterface("SproutHost");web.destroy();super.onDestroy()}
    companion object {const val URL="https://appassets.androidplatform.net/assets/review/index.html";const val PICK_TEXT=20;const val CAPTURE=21;const val EXPORT=22;const val PICK_VIDEO=23;const val NOTIFY=24;const val PICK_IMAGE=25}
}
