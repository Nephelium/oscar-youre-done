package com.jingjing.chesssprout

import android.content.ClipboardManager
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class ClipboardExportTest {
    private fun webView(view: View): WebView? {
        if(view is WebView)return view
        if(view is ViewGroup)for(i in 0 until view.childCount)webView(view.getChildAt(i))?.let{return it}
        return null
    }
    private fun evaluate(scenario: ActivityScenario<MainActivity>,script: String): String {
        val done=CountDownLatch(1)
        var result=""
        scenario.onActivity {activity->webView(activity.window.decorView)!!.evaluateJavascript(script){result=it;done.countDown()}}
        assertTrue("WebView callback timed out",done.await(10,TimeUnit.SECONDS))
        return result
    }
    @Test fun exportButtonsWriteExactPgnAndSanToSystemClipboard() {
        ActivityScenario.launch(MainActivity::class.java).use {scenario->
            var ready=false
            for(i in 0 until 100){
                if(evaluate(scenario,"!!(window.App && window.SproutHost)")=="true"){ready=true;break}
                Thread.sleep(100)
            }
            assertTrue("Shared UI did not load",ready)
            val pgn="[Event \"原生复制验证\"]\n\n1. e4 e5 2. Nf3 Nc6 *"
            assertEquals("true",evaluate(scenario,"""(()=>{while(App.back()){};const r=Sprout.importText(${JSONObject.quote(pgn)})[0];const error=SproutHost.saveGame(JSON.stringify(r));if(error)throw Error(error);App.resume();document.querySelector('[data-route="games"]').click();document.querySelector('[data-act="notebook"][data-book="game"]').click();document.querySelector('[data-open="'+r.id+'"]').click();return true;})()"""))
            for(format in listOf("San","Pgn")){
                val expected=org.json.JSONTokener(evaluate(scenario,"Sprout.to$format(App.state.current)")).nextValue() as String
                evaluate(scenario,"document.querySelector('[data-act=export]').click();document.querySelector('[data-act=copy$format]').click();")
                assertEquals("false",evaluate(scenario,"document.querySelector('#modal').open"))
                scenario.onActivity {activity->
                    val clipboard=activity.getSystemService(ClipboardManager::class.java)
                    assertEquals(expected,clipboard.primaryClip!!.getItemAt(0).text.toString())
                }
            }
        }
    }
}
