# Board classifier reference

`duolingo-board-profile.json.gz` contains normalized numeric cell features from
the standard initial board of Duolingo Android 6.102.3, observed in the authorized
emulator test. It contains no account, screen chrome, or personal information.
It is a compatibility reference for local recognition, not a UI piece set.
Duolingo owns its artwork. This app is independent and is not affiliated with it.

Schema 2 requires a complete untouched initial position and validates top/bottom
piece contrast. Schema 1 profiles remain on disk but are not reused because that
version could mislabel moved pawns as empty squares.

The local Android instrumentation test `exportVerifiedReferenceProfile` learns
the reference from `duolingo-auto-initial.png`, verifies the exact standard FEN,
and exports the gzip file. The source capture is kept in local test reports,
outside the public source tree and the main APK. Changes must pass real-board,
black-bottom, delayed-start, practice, rollback and promotion regressions.
