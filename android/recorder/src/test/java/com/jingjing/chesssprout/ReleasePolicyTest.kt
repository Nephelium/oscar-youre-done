package com.jingjing.chesssprout

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ReleasePolicyTest {
    private fun release(tag: String="v1.3.8")=JSONObject("""{"tag_name":"$tag","draft":false,"prerelease":false,"assets":[{"name":"oscar.apk","state":"uploaded","size":10,"browser_download_url":"${ReleasePolicy.PAGE}/download/$tag/oscar.apk"}]}""")
    @Test fun versionsAreComparedNumericallyAndOnlyStableReleasesAreAccepted() {
        assertTrue(ReleasePolicy.newer("v1.10.0","1.9.9"));assertFalse(ReleasePolicy.newer("v1.3.7","1.3.7"))
        assertFalse(ReleasePolicy.newer("v1.3.6","1.3.7"));assertTrue(ReleasePolicy.newer("v2.0.0","1.99.99"))
        for(tag in listOf("v1.3.8-beta.1","bad","v999999999999.0.0"))assertThrows(Exception::class.java){ReleasePolicy.newer(tag,"1.3.7")}
        for(key in listOf("draft","prerelease"))assertThrows(Exception::class.java){ReleasePolicy.evaluate(release().put(key,true),"1.3.7")}
    }
    @Test fun updateRequiresOfficialUploadedApkAndNeverTrustsRemotePageUrl() {
        val r=release().put("html_url","https://example.com/malicious")
        val result=ReleasePolicy.evaluate(r,"1.3.7")
        assertEquals("update",result.getString("state"));assertEquals(ReleasePolicy.PAGE+"/tag/v1.3.8",result.getString("url"))
        assertEquals("latest",ReleasePolicy.evaluate(release("v1.3.6"),"1.3.7").getString("state"))
        for(key in listOf("state","browser_download_url","name")) {
            val invalid=release();invalid.getJSONArray("assets").getJSONObject(0).put(key,"invalid")
            assertThrows(Exception::class.java){ReleasePolicy.evaluate(invalid,"1.3.7")}
        }
        assertThrows(Exception::class.java){ReleasePolicy.evaluate(release().put("assets",null),"1.3.7")}
    }
    @Test fun cooldownHandlesFirstRunExpiryAndClockRollback() {
        assertTrue(ReleasePolicy.due(1000,0,500));assertFalse(ReleasePolicy.due(1000,900,500))
        assertTrue(ReleasePolicy.due(1000,500,500));assertTrue(ReleasePolicy.due(1000,1200,500))
    }
}
