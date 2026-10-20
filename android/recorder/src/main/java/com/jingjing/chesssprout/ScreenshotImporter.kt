package com.jingjing.chesssprout

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.RectF
import android.media.ExifInterface
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** A user-selected screenshot stays in memory. Only the confirmed board crop is saved. */
object ScreenshotImporter {
    private var image: Bitmap?=null
    private var region: RectF?=null
    private var pendingFen: String?=null
    @Synchronized fun select(context: Context,uri: Uri) {
        val bounds=BitmapFactory.Options().apply {inJustDecodeBounds=true}
        context.contentResolver.openInputStream(uri).use {BitmapFactory.decodeStream(it,null,bounds)}
        require(bounds.outWidth>0 && bounds.outHeight>0 && bounds.outWidth.toLong()*bounds.outHeight<=60_000_000){"请选择清晰的棋盘截图"}
        var sample=1;while(maxOf(bounds.outWidth,bounds.outHeight)/sample>3000)sample*=2
        val decoded=context.contentResolver.openInputStream(uri).use {BitmapFactory.decodeStream(it,null,BitmapFactory.Options().apply{inSampleSize=sample;inPreferredConfig=Bitmap.Config.ARGB_8888})}?:error("无法读取图片")
        val orientation=runCatching {context.contentResolver.openInputStream(uri).use {ExifInterface(it!!).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL)}}.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val matrix=Matrix().apply {when(orientation){ExifInterface.ORIENTATION_ROTATE_90->postRotate(90f);ExifInterface.ORIENTATION_ROTATE_180->postRotate(180f);ExifInterface.ORIENTATION_ROTATE_270->postRotate(270f);ExifInterface.ORIENTATION_FLIP_HORIZONTAL->postScale(-1f,1f);ExifInterface.ORIENTATION_FLIP_VERTICAL->postScale(1f,-1f);ExifInterface.ORIENTATION_TRANSPOSE->{postRotate(90f);postScale(-1f,1f)};ExifInterface.ORIENTATION_TRANSVERSE->{postRotate(270f);postScale(-1f,1f)}}}
        val oriented=Bitmap.createBitmap(decoded,0,0,decoded.width,decoded.height,matrix,true)
        val factor=minOf(1f,2400f/maxOf(oriented.width,oriented.height))
        val result=Bitmap.createScaledBitmap(oriented,(oriented.width*factor).toInt(),(oriented.height*factor).toInt(),true)
        if(decoded!==oriented && decoded!==result)decoded.recycle();if(oriented!==result)oriented.recycle()
        image?.recycle();image=result;region=null;pendingFen=null
    }
    @Synchronized fun previewCopy(): Bitmap?=image?.copy(Bitmap.Config.ARGB_8888,false)
    @Synchronized fun recognize(context: Context,options: JSONObject): JSONObject {
        val original=image?:error("请重新选择截图")
        val factor=minOf(1f,720f/original.width)
        val frame=Bitmap.createScaledBitmap(original,(original.width*factor).toInt(),(original.height*factor).toInt(),true)
        try {
            val recognizer=BoardRecognizer(options.optString("side")=="b")
            val requested=options.optJSONObject("region")?.let{CapturePipeline.rect(it)}
            recognizer.region=requested
            val store=ThemeStore(context)
            val learned=store.load()?.let{recognizer.loadProfile(it)}?:false
            var modelUpdated=!learned
            if(!learned)require(recognizer.calibrate(frame)){"请先在标准初始棋盘准备一次棋子样式，再导入练习截图"}
            var observation=recognizer.recognize(frame)
            if(observation==null || '?' in observation.placement) {
                recognizer.reset(requested)
                require(recognizer.calibrate(frame)){"棋子或标记未能识别清楚，请重新框选，或先准备当前主题的初始棋盘"}
                modelUpdated=true
                observation=recognizer.recognize(frame)
            }
            val placement=observation?.placement?:error("未能识别棋盘，请重新框选")
            require('?' !in placement && placement.count{it=='K'}==1 && placement.count{it=='k'}==1){"请导入包含双方王的清晰局面"}
            if(modelUpdated)store.save(recognizer.profile())
            region=recognizer.region;pendingFen="$placement w - - 0 1"
            return JSONObject().put("fen",pendingFen)
        } finally {if(frame!==original)frame.recycle()}
    }
    @Synchronized fun confirm(context: Context,options: JSONObject): JSONObject {
        val fen=options.getString("fen");require(fen.substringBefore(' ')==pendingFen?.substringBefore(' ')){"请先识别截图中的局面"}
        val board=CaptureTracker(fen).board
        val original=image?:error("请重新选择截图");val rect=region?:error("请先框选棋盘")
        val id="g"+UUID.randomUUID().toString().replace("-","");val now=System.currentTimeMillis()
        val fileName="$id-source.jpg";val folder=File(context.filesDir,"evidence").apply{mkdirs()}
        val x=(rect.left*original.width).toInt().coerceIn(0,original.width-1);val y=(rect.top*original.height).toInt().coerceIn(0,original.height-1)
        val crop=Bitmap.createBitmap(original,x,y,(rect.width()*original.width).toInt().coerceIn(1,original.width-x),(rect.height()*original.height).toInt().coerceIn(1,original.height-y))
        try {File(folder,fileName).outputStream().use{crop.compress(Bitmap.CompressFormat.JPEG,90,it)}}finally{if(crop!==original)crop.recycle()}
        val game=JSONObject().put("schema",1).put("id",id).put("title","截图里的练习").put("source","截图").put("notebook","practice")
            .put("createdAt",now).put("updatedAt",now).put("initialFen",board.fen).put("moves",JSONArray()).put("result","*").put("side",options.optString("side","w"))
            .put("analysis",JSONObject()).put("branches",JSONArray()).put("issues",JSONArray()).put("capture",JSONObject().put("mode","position").put("state","image").put("image",fileName))
        GameStore(context).save(game);pendingFen=null;return game
    }
}
