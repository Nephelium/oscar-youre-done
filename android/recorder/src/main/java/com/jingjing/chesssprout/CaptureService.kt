package com.jingjing.chesssprout

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.SystemClock
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView
import org.json.JSONObject

class CaptureService : Service() {
    private val thread=HandlerThread("chesssprout-capture")
    private lateinit var handler: Handler
    private var projection: MediaProjection?=null
    private var display: VirtualDisplay?=null
    private var reader: ImageReader?=null
    private var pipeline: CapturePipeline?=null
    private var overlay: TextView?=null
    private var feedbackView: TextView?=null
    private var feedbackToast: android.widget.Toast?=null
    private val mainHandler=Handler(android.os.Looper.getMainLooper())
    private var feedbackSeen=0
    private val hideFeedback=Runnable {clearFeedback()}
    @Volatile private var paused=false
    @Volatile private var stopping=false
    private var frameEligible=false
    private var decodedFrames=0
    private var repeatedFrames=0
    private val frameConverter=ScreenFrameConverter()
    private var conversionNs=0L
    private var lastConversionMs=0.0
    private var processingError: String?=null
    private var lastNotify=0L
    @Volatile private var latest: Bitmap?=null
    private var finishMessage="已保存，可以复盘"
    override fun onBind(intent: Intent?): IBinder?=null
    override fun onCreate() { super.onCreate();thread.start();handler=Handler(thread.looper);instance=this }
    @Suppress("DEPRECATION")
    override fun onStartCommand(intent: Intent?,flags: Int,startId: Int): Int {
        when(intent?.action) {
            "stop" -> { stopSelf();return START_NOT_STICKY }
            "pause" -> { paused=!paused;updateNotification();return START_NOT_STICKY }
            "configure" -> { handler.post { synchronized(this) { runCatching {pipeline?.configure(JSONObject(intent.getStringExtra("options")?:"{}"))} } };return START_NOT_STICKY }
        }
        if(projection!=null)return START_NOT_STICKY
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL,"棋局记录",NotificationManager.IMPORTANCE_LOW))
        if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        else startForeground(NOTIFICATION,notification())
        try {
            val data=if(Build.VERSION.SDK_INT>=33)intent?.getParcelableExtra("data",Intent::class.java) else intent?.getParcelableExtra("data")
            require(data!=null)
            val options=JSONObject(intent?.getStringExtra("options")?:"{}")
            pipeline=CapturePipeline(this,options,"屏幕记录")
            val mp=requireNotNull(getSystemService(MediaProjectionManager::class.java).getMediaProjection(intent!!.getIntExtra("result",0),data))
            projection=mp
            mp.registerCallback(object: MediaProjection.Callback() {
                override fun onStop() { finishMessage="屏幕采集已结束，已保留记录";stopSelf() }
                override fun onCapturedContentResize(width: Int,height: Int) { if(Build.VERSION.SDK_INT>=34) handler.post { resize(width,height) } }
            },Handler(mainLooper))
            val wm=getSystemService(WindowManager::class.java)
            val size=if(Build.VERSION.SDK_INT>=30)wm.maximumWindowMetrics.bounds else android.graphics.Rect(0,0,resources.displayMetrics.widthPixels,resources.displayMetrics.heightPixels)
            val r=makeReader(size.width(),size.height())
            display=mp.createVirtualDisplay("ChessSprout",size.width(),size.height(),resources.displayMetrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,r.surface,null,handler)
            handler.post(pump)
            if(options.optBoolean("overlay") && Settings.canDrawOverlays(this))showOverlay()
        } catch(_: Exception) { finishMessage="无法开始屏幕采集，请重新授权";stopSelf() }
        return START_NOT_STICKY
    }
    private fun makeReader(width: Int,height: Int): ImageReader {
        val r=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,2)
        reader=r
        return r
    }
    // Surface producers need not send duplicate static frames. Poll the latest
    // queue entry, then re-observe that unchanged screen at a bounded cadence.
    private val pump=object: Runnable {
        override fun run() {
            if(stopping)return
            val cycleStart=SystemClock.elapsedRealtime()
            val image=runCatching {reader?.acquireLatestImage()}.getOrNull()
            try {
                if(paused || appVisible) {
                    frameEligible=false
                    synchronized(this@CaptureService){pipeline?.onInterrupted()}
                    return
                }
                if(image!=null) {
                val before=System.nanoTime()
                val plane=image.planes[0]
                synchronized(this@CaptureService) {
                    latest=frameConverter.convert(plane.buffer,image.width,image.height,plane.rowStride,plane.pixelStride)
                    frameEligible=true;decodedFrames++
                    val elapsed=System.nanoTime()-before
                    conversionNs+=elapsed;lastConversionMs=elapsed/1e6
                }
                } else if(frameEligible)repeatedFrames++
                synchronized(this@CaptureService) {if(frameEligible)latest?.let {pipeline?.process(it)}}
                pipeline?.let {p->if(p.feedbackSerial!=feedbackSeen) {
                    feedbackSeen=p.feedbackSerial
                    val text=p.feedback;mainHandler.post{showFeedback(text)}
                }}
                processingError=null
            } catch(error: Exception) {
                processingError="这帧未能识别，正在重试"
                android.util.Log.w("ChessSprout","Capture processing failed: ${error.javaClass.simpleName}")
            } finally {
                image?.close()
                val now=SystemClock.elapsedRealtime()
                if(now-lastNotify>1800) {lastNotify=now;Handler(mainLooper).post {updateNotification()} }
                // A target period includes processing time. Do not append another
                // 200 ms after a slow frame and silently halve the capture rate.
                if(!stopping)handler.postDelayed(this,maxOf(16L,120L-(SystemClock.elapsedRealtime()-cycleStart)))
            }
        }
    }
    private fun showFeedback(text: String) {
        if(stopping || appVisible || !getSharedPreferences("capture",MODE_PRIVATE).getBoolean("moveFeedback",true))return
        clearFeedback()
        if(Settings.canDrawOverlays(this)) {
            val density=resources.displayMetrics.density
            val view=TextView(this).apply {
                this.text=text;setTextColor(0xffffffff.toInt());textSize=14f;gravity=Gravity.CENTER
                maxWidth=(320*density).toInt();setPadding((18*density).toInt(),(12*density).toInt(),(18*density).toInt(),(12*density).toInt())
                background=android.graphics.drawable.GradientDrawable().apply{setColor(0xf0315629.toInt());cornerRadius=18*density}
            }
            runCatching {
                getSystemService(WindowManager::class.java).addView(view,WindowManager.LayoutParams(-2,-2,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,PixelFormat.TRANSLUCENT).apply {
                    gravity=Gravity.TOP or Gravity.CENTER_HORIZONTAL;y=(100*density).toInt()
                    // Android 12+ requires pass-through overlays to stay within this opacity.
                    alpha=0.8f
                })
                feedbackView=view;mainHandler.postDelayed(hideFeedback,1800)
            }.onFailure {showSystemFeedback(text)}
        }else showSystemFeedback(text)
    }
    private fun showSystemFeedback(text: String) {
        feedbackToast=android.widget.Toast.makeText(this,text,android.widget.Toast.LENGTH_SHORT).also {it.show()}
    }
    fun clearFeedback() {
        mainHandler.removeCallbacks(hideFeedback)
        feedbackView?.let {view->runCatching{getSystemService(WindowManager::class.java).removeView(view)}}
        feedbackView=null;feedbackToast?.cancel();feedbackToast=null
    }
    private fun resize(width: Int,height: Int) {
        if(width<=0 || height<=0 || display==null)return
        if(reader?.width==width && reader?.height==height)return
        val old=reader;val current=makeReader(width,height)
        synchronized(this){pipeline?.onResize();frameEligible=false}
        display?.resize(width,height,resources.displayMetrics.densityDpi);display?.surface=current.surface;old?.close()
    }
    private fun action(action: String)=PendingIntent.getService(this,if(action=="stop")2 else 3,Intent(this,CaptureService::class.java).setAction(action),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun open()=PendingIntent.getActivity(this,1,Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun notification(): Notification=Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_sprout).setContentTitle(if(paused)"奥斯卡你完了 · 已暂停" else "奥斯卡你完了 · 正在记录")
        .setContentText(processingError?:pipeline?.message?:"等待棋盘").setContentIntent(open()).setOngoing(true).setOnlyAlertOnce(true)
        .addAction(Notification.Action.Builder(null,if(paused)"继续" else "暂停",action("pause")).build())
        .addAction(Notification.Action.Builder(null,"结束记录",action("stop")).build()).build()
    private fun updateNotification() {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION,notification())
        overlay?.text=when{paused->"Ⅱ 已暂停";processingError!=null->"◌ 正在重试";pipeline?.awaitingPosition==true->if(pipeline?.pendingFen==null)"◌ 识别题目" else "◌ 请确认局面";pipeline?.game?.getJSONObject("capture")?.optString("state")!="recording"->"◌ 寻找棋盘";pipeline?.message?.contains("校对")==true->"◌ 需校对";pipeline?.tracker?.moves?.isEmpty()!=false->"● 已就绪";else->"● ${pipeline?.confirmedPlies} 步"}
    }
    private fun showOverlay() {
        val density=resources.displayMetrics.density
        overlay=TextView(this).apply {text="● 奥斯卡你完了";setTextColor(0xff315629.toInt());textSize=13f
            setPadding((14*density).toInt(),(11*density).toInt(),(14*density).toInt(),(11*density).toInt())
            background=android.graphics.drawable.GradientDrawable().apply{setColor(0xffeef5d9.toInt());cornerRadius=24*density;setStroke((2*density).toInt(),0xff71904f.toInt())}
            contentDescription="打开奥斯卡你完了记录控制";setOnClickListener { open().send() }
        }
        runCatching {getSystemService(WindowManager::class.java).addView(overlay,WindowManager.LayoutParams(-2,-2,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,PixelFormat.TRANSLUCENT).apply{gravity=Gravity.TOP or Gravity.END;y=(50*density).toInt();x=(8*density).toInt()})}
    }
    fun snapshot(): JSONObject=synchronized(this) {JSONObject().put("running",true).put("paused",paused).put("gameId",pipeline?.game?.optString("id"))
        .put("message",if(paused)"记录已暂停" else processingError?:pipeline?.message).put("plies",pipeline?.confirmedPlies?:0).put("calibrated",pipeline?.game?.getJSONObject("capture")?.optString("state")=="recording").put("pendingFen",pipeline?.pendingFen).put("awaitingPosition",pipeline?.awaitingPosition?:false)
        .put("decodedFrames",decodedFrames).put("repeatedFrames",repeatedFrames).put("ownAppVisible",appVisible)
        .put("conversionMs",lastConversionMs).put("conversionTotalMs",conversionNs/1e6)
        .put("processMs",pipeline?.lastProcessMs?:0).put("classifiedFrames",pipeline?.recognizer?.classifiedFrames?:0)
        .put("reusedFrames",pipeline?.recognizer?.reusedFrames?:0)
        .put("feedbackSerial",pipeline?.feedbackSerial?:0).put("lastFeedback",pipeline?.feedback?:"")}
    fun preview(): Bitmap?=synchronized(this) {latest?.copy(Bitmap.Config.ARGB_8888,false)}
    override fun onDestroy() {
        stopping=true
        clearFeedback()
        handler.removeCallbacks(pump)
        runCatching {overlay?.let {getSystemService(WindowManager::class.java).removeView(it)}}
        // The ImageReader owns the native memory currently read by the capture callback.
        // Close it on that same handler only after an in-flight copy has completed.
        handler.post {
            try {
                synchronized(this) {pipeline?.finish(finishMessage);latest=null;frameConverter.close()}
            } catch(error: Exception) {android.util.Log.e("ChessSprout","Could not persist final recording",error)}
            finally {
                reader?.setOnImageAvailableListener(null,null)
                display?.release();reader?.close();projection?.stop()
                instance=null;thread.quitSafely()
            }
        }
        super.onDestroy()
    }
    companion object {
        @Volatile var appVisible=false
        const val CHANNEL="chesssprout-capture";const val NOTIFICATION=401
        @Volatile private var active: java.lang.ref.WeakReference<CaptureService>?=null
        var instance: CaptureService?
            get()=active?.get()
            private set(value){active=value?.let{java.lang.ref.WeakReference(it)}}
    }
}
