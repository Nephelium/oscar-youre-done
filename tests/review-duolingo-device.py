"""ADB helpers for the explicitly requested Duolingo emulator acceptance run."""
from pathlib import Path
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding="utf-8")
ADB = str(Path.home() / "AppData/Local/Android/Sdk/platform-tools/adb.exe")
OUT = Path(__file__).resolve().parent.parent / "android/recorder/build/reports"


def run(*args):
    return subprocess.check_output([ADB, *args], timeout=25)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "tap":
        run("shell", "input", "tap", sys.argv[2], sys.argv[3])
    elif len(sys.argv) > 1 and sys.argv[1] == "key":
        run("shell", "input", "keyevent", sys.argv[2])
    elif len(sys.argv) > 1 and sys.argv[1] == "chess":
        move=sys.argv[2]
        assert len(move)==4 and all(move[i] in "abcdefgh" for i in (0,2)) and all(move[i] in "12345678" for i in (1,3))
        for square in (move[:2],move[2:]):
            run("shell","input","tap",str(round((ord(square[0])-97+.5)*135)),str(round(844+(8-int(square[1])+.5)*135)))
            time.sleep(.35)
    else:
        name = sys.argv[1] if len(sys.argv) > 1 else "duolingo-current"
        for attempt in range(4):
            result = run("shell", "uiautomator", "dump", "/sdcard/chesssprout-ui.xml")
            if b"UI hierchary dumped" in result:
                break
            if attempt == 3:
                raise RuntimeError("No fresh Android UI hierarchy")
            time.sleep(0.7)
        xml = run("exec-out", "cat", "/sdcard/chesssprout-ui.xml")
        (OUT / (name + ".xml")).write_bytes(xml)
        (OUT / (name + ".png")).write_bytes(run("exec-out", "screencap", "-p"))
        for node in ET.fromstring(xml).iter("node"):
            text = node.get("text") or node.get("content-desc")
            if text:
                print(text, node.get("bounds"))
