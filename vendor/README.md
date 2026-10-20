# Third-party components

- chess.js 0.12.0: BSD-2-Clause, upstream https://github.com/jhlywa/chess.js .
- chesslib 1.3.7: unmodified vendored Java, Apache-2.0, https://github.com/bhlangonijr/chesslib/tree/1.3.7 .
- ARM64 Stockfish 19: unmodified official Android universal executable, renamed libstockfish.so for packaging. https://github.com/official-stockfish/Stockfish/releases/tag/sf_19 .
- x86_64 Stockfish 16.1 and NNUE: extracted unchanged from F-Droid DroidFish 1.90 (versionCode 100). Exact published build source: https://f-droid.org/repo/org.petero.droidfish_100_src.tar.gz .
- Both Stockfish variants are GPLv3. Corresponding source archives are attached to the v1.1.0 Release; Settings also links to them upstream. The hash manifest retains upstream download filenames, including archives supplied as Release assets rather than duplicated in this checkout.
- Twelve geometric chess piece SVGs are original project artwork. The Oscar-derived launcher icon has separate character rights, described in NOTICE and review/assets/README.md.
