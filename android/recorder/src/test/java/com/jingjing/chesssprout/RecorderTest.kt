package com.jingjing.chesssprout

import com.github.bhlangonijr.chesslib.Board
import org.junit.Assert.*
import org.junit.Test

class RecorderTest {
    @Test fun confirmationLabelsIncludeBothPlayersAndPromotion() {
        assertEquals("白兵e4 · 黑马f6",CaptureTracker.describeMoves(Board().fen,listOf("e2e4","g8f6")))
        assertEquals("白兵a8升马",CaptureTracker.describeMoves("7k/P7/8/8/8/8/8/7K w - - 0 1",listOf("a7a8n")))
    }
    @Test fun legalRepetitionIsNotMistakenForExerciseRollback() {
        val tracker=CaptureTracker()
        val line=listOf("Nf3","Nf6","Ng1","Ng8")
        for(index in line.indices)assertEquals("move",tracker.accept(placement(*line.take(index+1).toTypedArray())).kind)
        assertEquals(4,tracker.moves.size)
    }
    @Test fun parserKeepsWhiteWdlAndSwapsBlackWithoutLosingDraws() {
        val info="info depth 20 multipv 1 score cp 91 wdl 470 510 20 nodes 100 pv e7e5 g1f3"
        assertEquals(listOf(470,510,20),UciParser.parse(info,true)!!.wdl)
        assertEquals(listOf(20,510,470),UciParser.parse(info,false)!!.wdl)
        for(value in listOf("900 900 0","-1 501 500","400 nope 600","1001 0 0")) {
            assertNull(UciParser.parse(info.replace("470 510 20",value),true)!!.wdl)
        }
        assertNull(UciParser.parse("info depth 10 score cp 10 pv e2e4",true)!!.wdl)
    }
    private fun placement(vararg moves: String): String {val b=Board();moves.forEach{b.doMove(it)};return b.fen.substringBefore(' ')}
    @Test fun tracksDuplicateAndTwoPlyGapAndUndo() {
        val t=CaptureTracker()
        assertEquals("move",t.accept(placement("e4")).kind)
        assertEquals("same",t.accept(placement("e4")).kind)
        assertEquals(listOf("e7e5","g1f3"),t.accept(placement("e4","e5","Nf3")).moves)
        assertEquals("undo",t.accept(placement("e4","e5")).kind)
        assertEquals(listOf("e2e4","e7e5"),t.moves)
    }
    @Test fun doesNotGuessInvalidOrLongMissingHistory() {
        val t=CaptureTracker()
        assertEquals("unmatched",t.accept("8/8/8/8/8/8/8/8").kind)
        assertTrue(t.moves.isEmpty())
        assertEquals("unmatched",t.accept(placement("e4","e5","Nf3","Nc6")).kind)
    }
    @Test fun tracksCastlingEnPassantAndUnderpromotion() {
        val castle=CaptureTracker(moves=listOf("e2e4","e7e5","g1f3","b8c6","f1c4","g8f6"))
        assertEquals(listOf("e1g1"),castle.accept(placement("e4","e5","Nf3","Nc6","Bc4","Nf6","O-O")).moves)
        val ep=CaptureTracker(moves=listOf("e2e4","a7a6","e4e5","d7d5"))
        assertEquals(listOf("e5d6"),ep.accept(placement("e4","a6","e5","d5","exd6")).moves)
        val promotion=CaptureTracker("7k/P7/8/8/8/8/8/7K w - - 0 1")
        assertEquals(listOf("a7a8n"),promotion.accept("N6k/8/8/8/8/8/8/7K").moves)
        for(piece in "qrbn") {
            val tracker=CaptureTracker("7k/P7/8/8/8/8/8/7K w - - 0 1")
            assertEquals(listOf("a7a8$piece"),tracker.accept("${piece.uppercaseChar()}6k/8/8/8/8/8/8/7K").moves)
        }
    }
    @Test fun parserNormalizesBlackAndPreservesMateAndIgnoresBounds() {
        val line=UciParser.parse("info depth 17 multipv 2 score cp 143 nodes 100 pv e7e5 g1f3",false)!!
        assertEquals(-143,line.cp);assertEquals(2,line.rank);assertEquals(17,line.depth)
        assertEquals(3,UciParser.parse("info depth 6 score mate -3 pv h8g8",false)!!.mate)
        assertNull(UciParser.parse("info depth 5 score cp 31 lowerbound pv e2e4",true))
        assertNull(UciParser.parse("info string testing",true))
    }
    @Test fun acceptsOnlyUniqueCheckmateWithExplodingKing() {
        val t=CaptureTracker(moves=listOf("f2f3","e7e5","g2g4"))
        val end=Board().apply {loadFromFen(t.board.fen);doMove("Qh4#")}.fen.substringBefore(' ').replace('K','?')
        assertEquals(listOf("d8h4"),t.accept(end).moves)
        assertTrue(t.board.isMated)
        assertEquals("same",t.accept(end).kind)
        val noMate=CaptureTracker()
        assertEquals("same",noMate.accept(noMate.board.fen.substringBefore(' ').replace('K','?')).kind)
        assertEquals("unmatched",noMate.accept(placement("e4").replace('K','?')).kind)
        assertTrue(noMate.moves.isEmpty())
    }
}
