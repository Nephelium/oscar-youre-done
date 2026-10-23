package com.jingjing.chesssprout

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class StorePolicyTest {
    @Test fun activeImportProtectsOnlyItsOwnRecordUntilFinished() {
        val video=JSONObject().put("state","processing").put("gameId","imported")
        assertThrows(IllegalStateException::class.java) { GameStore.requireEditable("imported",null,video) }
        GameStore.requireEditable("other",null,video)
        video.put("state","done");GameStore.requireEditable("imported",null,video)
        assertThrows(IllegalStateException::class.java) { GameStore.requireEditable("live",JSONObject().put("gameId","live"),video) }
    }
    @Test fun shorterAnalysisCannotOverwriteDeeperSavedEvaluation() {
        fun result(engine: String,depth: Int)=JSONObject("""{"engine":"$engine","lines":[{"depth":$depth,"cp":10}]}""")
        assertFalse(GameStore.shouldReplaceAnalysis(result("SF",20),result("SF",8)))
        assertTrue(GameStore.shouldReplaceAnalysis(result("SF",20),result("SF",21)))
        assertTrue(GameStore.shouldReplaceAnalysis(result("SF",20),result("SF-new",8)))
        assertTrue(GameStore.shouldReplaceAnalysis(null,result("SF",8)))
    }
}
