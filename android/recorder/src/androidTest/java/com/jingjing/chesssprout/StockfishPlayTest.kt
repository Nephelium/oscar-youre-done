package com.jingjing.chesssprout

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.github.bhlangonijr.chesslib.Board
import com.github.bhlangonijr.chesslib.move.Move
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StockfishPlayTest {
    @Test fun allLevelsReturnLegalMovesAndReviewRestoresMultiPv() {
        val engine=StockfishEngine(InstrumentationRegistry.getInstrumentation().targetContext)
        val start=Board().fen
        try {
            for(skill in listOf(0,3,7,12,17,20)) {
                val board=Board()
                val white=engine.play(start,emptyList(),skill,engine.generation.get()).getString("move")
                assertTrue(board.doMove(Move(white,board.sideToMove),true))
                val black=engine.play(start,listOf(white),skill,engine.generation.get()).getString("move")
                assertTrue(board.doMove(Move(black,board.sideToMove),true))
            }
            // A weakened opponent must not leak its search settings into review.
            engine.play(start,emptyList(),0,engine.generation.get())
            val result=engine.analyze(start,600,engine.generation.get())
            assertEquals(3,result.getJSONArray("lines").length())
            assertEquals(3,result.getJSONArray("lines").getJSONObject(0).getJSONArray("wdl").length())
            val promotion="7k/P7/8/8/8/8/8/7K w - - 0 1"
            val move=engine.play(promotion,emptyList(),20,engine.generation.get()).getString("move")
            assertTrue(Board().apply{loadFromFen(promotion)}.doMove(Move(move,com.github.bhlangonijr.chesslib.Side.WHITE),true))
            val token=engine.generation.get();engine.cancel()
            assertTrue(runCatching{engine.play(start,emptyList(),3,token)}.isFailure)
            assertTrue(engine.play(start,emptyList(),3,engine.generation.get()).getString("move").isNotEmpty())
            val limited=engine.analyze(start,2000,engine.generation.get(),12)
            assertTrue(limited.getJSONArray("lines").getJSONObject(0).getInt("depth")<=12)
            var updates=0
            val live=runCatching {engine.analyze(start,200,engine.generation.get(),null,true) {
                assertTrue(it.getJSONArray("lines").length()>0);updates++
                if(updates>=2)engine.cancel()
            }}
            assertTrue(live.isFailure)
            assertEquals(2,updates)
            assertTrue(engine.analyze(start,200,engine.generation.get()).getJSONArray("lines").length()>0)
        } finally {engine.close()}
    }
}
