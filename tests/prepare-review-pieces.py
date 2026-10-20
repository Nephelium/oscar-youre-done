"""Generate original, self-contained vector chess sets; no external assets."""
from pathlib import Path
root = Path(__file__).resolve().parents[1] / "review/assets/pieces"
root.mkdir(parents=True, exist_ok=True)
rounded = {
    "p": '<path d="M41 44C39 58 28 62 28 72c0 18 44 18 44 0 0-10-11-14-13-28Z"/><circle cx="50" cy="31" r="15"/>',
    "n": '<path d="M29 78c2-17 18-21 17-35l-12 8c-5 3-13-2-13-8l14-20 9-6 1-9 12 10c22 4 23 19 19 34l-9 26Z"/><path d="M30 38l10-3M53 27c9 5 11 13 7 21" fill="none"/><circle cx="44" cy="28" r="2.7" fill="var(--edge)" stroke="none"/>',
    "b": '<path d="M40 46c1 13-9 19-10 30h40c-1-11-11-17-10-30"/><path d="M50 12C41 20 32 29 32 38c0 18 36 18 36 0 0-9-9-18-18-26Z"/><path d="m50 22 9 12" fill="none"/><circle cx="50" cy="11" r="5"/>',
    "r": '<path d="M34 42 30 77h40l-4-35"/><path d="M26 17h12v13h8V17h9v13h8V17h12v28H26Z"/><path d="M36 52h28" fill="none"/>',
    "q": '<path d="M33 48 28 76c6 12 38 12 44 0l-5-28"/><path d="m25 27 8 29h34l8-29-16 12-9-22-9 22Z"/><circle cx="24" cy="24" r="6"/><circle cx="50" cy="14" r="6"/><circle cx="76" cy="24" r="6"/><path d="M35 64h30" fill="none"/>',
    "k": '<path d="M34 62c-5-13-16-18-16-31 0-18 21-20 32-9 11-11 32-9 32 9 0 13-11 18-16 31l5 15c-7 13-35 13-42 0Z"/><path d="M44 8h12v9h9v11h-9v9H44v-9h-9V17h9Z" fill="var(--shine)"/><path d="M36 64c8 5 20 5 28 0" fill="none"/>'
}
geometric = {
    "p": '<circle cx="50" cy="28" r="13"/><path d="m42 45-12 32h40L58 45Z"/>',
    "n": '<path d="M29 76 43 49 29 53 21 41 39 21l5-12 14 10 14 11 5 24-10 22Z"/><path d="m44 29 8-2M59 36l4 12-9 17" fill="none"/>',
    "b": '<path d="m50 9 19 27-12 19 14 22H29l14-22-12-19Z"/><path d="m50 24 9 13" fill="none"/>',
    "r": '<path d="M29 16h12v12h18V16h12v28l-8 9 6 24H31l6-24-8-9Z"/><path d="M37 44h26" fill="none"/>',
    "q": '<path d="m23 24 14 14 13-24 13 24 14-14-10 32H33Z"/><path d="m37 59-7 18h40l-7-18Z"/><circle cx="23" cy="20" r="4"/><circle cx="50" cy="11" r="4"/><circle cx="77" cy="20" r="4"/>',
    "k": '<path d="M45 8h10v10h10v10H55v12H45V28H35V18h10Z"/><path d="m28 43 22-8 22 8-12 16 10 18H30l10-18Z"/>'
}
for theme, shapes in [("duo", rounded), ("mono", geometric)]:
    for side in "wb":
        fill, edge, shine = (("#dce8ee", "#8da3af", "#ffffff") if side == "w" else ("#555b62", "#353b42", "#89929a")) if theme == "duo" else (("#fff7df", "#4d6171", "#ffffff") if side == "w" else ("#334b61", "#172c40", "#6b8d9f"))
        for kind, shape in shapes.items():
            base = '<path d="M30 78h40c6 0 10 4 10 9H20c0-5 4-9 10-9Z"/>' if theme == "mono" else ('<ellipse cx="50" cy="83" rx="21" ry="8"/>' if kind in "pk" else '<path d="M31 76h38c7 0 10 4 10 10H21c0-6 3-10 10-10Z"/>')
            highlight = '<path d="M38 71c6 5 18 5 24 0" fill="none" stroke="var(--shine)" stroke-width="5"/>' if theme == "duo" and kind == "p" else ""
            svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="--edge:{edge};--shine:{shine}"><ellipse cx="50" cy="89" rx="28" ry="5" fill="#24333e" opacity=".10"/><g fill="{fill}" stroke="{edge}" stroke-width="{4.3 if theme=="duo" else 3}" stroke-linecap="round" stroke-linejoin="round">{base}{shape}{highlight}</g></svg>\n'
            (root/f"{theme}-{side}{kind}.svg").write_text(svg, encoding="utf-8", newline="\n")
print("Generated 24 original SVG pieces.")
