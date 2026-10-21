package com.jingjing.chesssprout

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.RectF
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import org.json.JSONObject

class RecognizerSamplingTest {
    @Test fun featureValuesAndDominantColorTiesRemainBitExact() {
        val old=ReferenceBoardRecognizer();val fresh=BoardRecognizer()
        val oldMethod=old.javaClass.declaredMethods.single{it.name=="features"}.apply{isAccessible=true}
        val newMethod=fresh.javaClass.declaredMethods.single{it.name=="features"}.apply{isAccessible=true}
        val random=java.util.Random(135)
        for((w,h) in listOf(64 to 64,137 to 203)) {
            val image=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888)
            try {
                val colors=IntArray(w*h){0xff000000.toInt() or (random.nextInt(256) shl 16) or (random.nextInt(256) shl 8) or random.nextInt(256)}
                image.setPixels(colors,0,w,0,0,w,h)
                for(box in listOf(RectF(0f,0f,1f,1f),RectF(.123f,.07f,.91f,.82f),RectF(-.001f,0f,1.001f,1f))) {
                    @Suppress("UNCHECKED_CAST") val a=oldMethod.invoke(old,image,box,null) as List<FloatArray>
                    @Suppress("UNCHECKED_CAST") val b=newMethod.invoke(fresh,image,box,null) as List<FloatArray>
                    for(i in 0..63)assertArrayEquals("$w x $h $box cell $i",a[i],b[i],0f)
                }
            }finally{image.recycle()}
        }
    }
    @Test fun croppedCopiesAndCachedCoordinatesMatchOriginalRecognizer() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val assets=instrumentation.context.assets
        val images=assets.list("")!!.filter{it=="duolingo-auto-initial.png" || it.matches(Regex("duolingo-game-\\d\\d.png"))}
            .sorted().map{name->assets.open(name).use{BitmapFactory.decodeStream(it)}}.toMutableList()
        val external=instrumentation.targetContext.getExternalFilesDir(null)!!
        listOf("official-day.jpg","official-night.jpg").forEach{name->
            images.add(requireNotNull(BitmapFactory.decodeFile(File(external,name).absolutePath)))
        }
        assertTrue(images.size>10)
        var oldNs=0L;var newNs=0L;var comparisons=0
        try {
            val old=ReferenceBoardRecognizer();val fresh=BoardRecognizer()
            val profile=ThemeStore(instrumentation.targetContext).bundled()!!
            assertTrue(old.loadProfile(profile));assertTrue(fresh.loadProfile(profile))
            for(round in 0..2)for(original in images) {
                val image=if(round==1)Bitmap.createScaledBitmap(original,537,maxOf(1,original.height*537/original.width),false) else original
                old.region=null;fresh.region=null
                repeat(2) {
                    val before=System.nanoTime();val a=old.recognize(image);oldNs+=System.nanoTime()-before
                    val start=System.nanoTime();val b=fresh.recognize(image);newNs+=System.nanoTime()-start
                    assertEquals(a?.placement,b?.placement)
                    if(a!=null)assertEquals(a.confidence,b!!.confidence,0.0)
                    assertEquals(old.classifiedFrames,fresh.classifiedFrames)
                    assertEquals(old.reusedFrames,fresh.reusedFrames)
                    comparisons++
                }
                old.blackBottom=!old.blackBottom;fresh.blackBottom=!fresh.blackBottom
                assertEquals(old.recognize(image)?.placement,fresh.recognize(image)?.placement)
                if(image!==original)image.recycle()
            }
            // Reuse a known grid to measure steady-state sampling, excluding localization.
            val original=images.first()
            old.calibrate(original);fresh.calibrate(original)
            assertEquals(old.profile().toString(),fresh.profile().toString())
            var oldSteady=0L;var newSteady=0L
            repeat(80) {
                var start=System.nanoTime();old.recognize(original);oldSteady+=System.nanoTime()-start
                start=System.nanoTime();fresh.recognize(original);newSteady+=System.nanoTime()-start
            }
            File(external,"v135-recognizer-sampling.json").writeText(JSONObject().put("comparisons",comparisons)
                .put("oldMs",oldNs/1e6).put("newMs",newNs/1e6)
                .put("oldSteadyMsPerFrame",oldSteady/80e6).put("newSteadyMsPerFrame",newSteady/80e6).toString(2))
        } finally {images.forEach{it.recycle()}}
    }
}
