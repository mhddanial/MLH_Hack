"""Prepare 16 curated PCB sample images in public/samples/ and sample_data/labels.json.

Combines:
1. 12 annotated bare-PCB defect images from dataset/PCB_DATASET (2 per PKU class, resized <=1400px JPEG, with XML bounding boxes parsed into quadrant location hints).
2. 2 clean golden reference boards from dataset/PCB_DATASET/PCB_USED (expected 'pass' candidate).
3. 4 high-contrast SMT assembly defect macro cards (missing_component, polarity_error, tombstoning, component_shift) rendered onto a realistic green solder-mask crop so all 6 MVP defect classes are demonstrable offline and live!
"""
from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET_ROOT = PROJECT_ROOT.parent / "dataset" / "PCB_DATASET"
PUBLIC_SAMPLES_DIR = PROJECT_ROOT / "public" / "samples"
SAMPLE_DATA_DIR = PROJECT_ROOT / "sample_data"
LABELS_PATH = SAMPLE_DATA_DIR / "labels.json"

PUBLIC_SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
SAMPLE_DATA_DIR.mkdir(parents=True, exist_ok=True)

MAX_SIDE = 1400

PKU_SAMPLES = [
    ("pku_short_01", "Short", "01_short_01.jpg", "01_short_01.xml", "solder_bridge", "high", "BAT-PCBA-101"),
    ("pku_short_02", "Short", "04_short_01.jpg", "04_short_01.xml", "solder_bridge", "high", "BAT-PCBA-104"),
    ("pku_open_01", "Open_circuit", "01_open_circuit_01.jpg", "01_open_circuit_01.xml", "uncertain_or_other", "high", "BAT-PCBA-102"),
    ("pku_open_02", "Open_circuit", "04_open_circuit_01.jpg", "04_open_circuit_01.xml", "uncertain_or_other", "high", "BAT-PCBA-105"),
    ("pku_missing_hole_01", "Missing_hole", "01_missing_hole_01.jpg", "01_missing_hole_01.xml", "uncertain_or_other", "medium", "BAT-PCBA-103"),
    ("pku_missing_hole_02", "Missing_hole", "04_missing_hole_01.jpg", "04_missing_hole_01.xml", "uncertain_or_other", "medium", "BAT-PCBA-106"),
    ("pku_mouse_bite_01", "Mouse_bite", "01_mouse_bite_01.jpg", "01_mouse_bite_01.xml", "uncertain_or_other", "medium", "BAT-PCBA-107"),
    ("pku_spur_01", "Spur", "01_spur_01.jpg", "01_spur_01.xml", "uncertain_or_other", "medium", "BAT-PCBA-108"),
    ("pku_spurious_copper_01", "Spurious_copper", "01_spurious_copper_01.jpg", "01_spurious_copper_01.xml", "uncertain_or_other", "low", "BAT-PCBA-109"),
    ("pku_spurious_copper_02", "Spurious_copper", "04_spurious_copper_01.jpg", "04_spurious_copper_01.xml", "uncertain_or_other", "low", "BAT-PCBA-110"),
]

GOLDEN_SAMPLES = [
    ("golden_clean_01", "01.JPG", "BAT-PCBA-GOLD-01"),
    ("golden_clean_02", "04.JPG", "BAT-PCBA-GOLD-04"),
]


def quadrant_from_bbox(xmin: int, ymin: int, xmax: int, ymax: int, w: int, h: int) -> str:
    cx = (xmin + xmax) / 2.0 / max(w, 1)
    cy = (ymin + ymax) / 2.0 / max(h, 1)
    vert = "upper" if cy < 0.42 else ("lower" if cy > 0.58 else "center")
    horiz = "left" if cx < 0.42 else ("right" if cx > 0.58 else "center")
    if vert == "center" and horiz == "center":
        return "center region"
    if vert == "center":
        return f"center-{horiz} region"
    if horiz == "center":
        return f"{vert}-center region"
    return f"{vert}-{horiz} quadrant"


def parse_xml_bboxes(xml_path: Path):
    if not xml_path.exists():
        return [], 1, 1
    tree = ET.parse(xml_path)
    root = tree.getroot()
    size_el = root.find("size")
    w = int(size_el.find("width").text) if size_el is not None else 1
    h = int(size_el.find("height").text) if size_el is not None else 1
    boxes = []
    for obj in root.findall("object"):
        name = obj.find("name").text if obj.find("name") is not None else "defect"
        bb = obj.find("bndbox")
        if bb is None:
            continue
        xmin = int(bb.find("xmin").text)
        ymin = int(bb.find("ymin").text)
        xmax = int(bb.find("xmax").text)
        ymax = int(bb.find("ymax").text)
        boxes.append({
            "orig_label": name,
            "bbox_norm": [
                round(xmin / w, 4),
                round(ymin / h, 4),
                round(xmax / w, 4),
                round(ymax / h, 4),
            ],
            "quadrant": quadrant_from_bbox(xmin, ymin, xmax, ymax, w, h),
        })
    return boxes, w, h


def resize_and_save(src: Path, dst: Path) -> tuple[int, int]:
    with Image.open(src) as im:
        im = im.convert("RGB")
        w, h = im.size
        scale = min(1.0, MAX_SIDE / float(max(w, h)))
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        if scale < 1.0:
            im = im.resize((nw, nh), Image.Resampling.LANCZOS)
        im.save(dst, format="JPEG", quality=88, optimize=True)
        return nw, nh


def create_smt_macro_card(sample_id: str, defect_class: str, title: str, board_id: str) -> dict:
    w, h = 1000, 750
    img = Image.new("RGB", (w, h), (16, 78, 48))
    draw = ImageDraw.Draw(img)

    # Subtle PCB grid and copper traces
    for x in range(0, w, 50):
        draw.line([(x, 0), (x, h)], fill=(20, 90, 56), width=1)
    for y in range(0, h, 50):
        draw.line([(0, y), (w, y)], fill=(20, 90, 56), width=1)

    # Copper traces under solder mask
    for y_trace in [180, 360, 540]:
        draw.line([(80, y_trace), (920, y_trace)], fill=(34, 120, 74), width=10)

    # Header silkscreen banner on PCB
    draw.rectangle([40, 30, 960, 95], outline=(235, 240, 235), width=2)
    draw.text((60, 48), f"BOARD ID: {board_id}   REV: A   STATION: SMT-L1   INSPECTION MACRO", fill=(240, 245, 240))

    # Draw normal reference components so the board looks like an SMT assembly
    # Normal Resistor R10 (upper-left)
    draw.rectangle([130, 150, 310, 230], outline=(230, 230, 230), width=2)
    draw.text((135, 125), "R10 (10k)", fill=(245, 245, 245))
    draw.rectangle([145, 165, 185, 215], fill=(195, 200, 205))  # left pad + solder
    draw.rectangle([255, 165, 295, 215], fill=(195, 200, 205))  # right pad + solder
    draw.rectangle([175, 170, 265, 210], fill=(28, 28, 32), outline=(210, 210, 210), width=2)
    draw.text((205, 182), "103", fill=(240, 240, 240))

    if defect_class == "missing_component":
        # Center-right footprint R12 with empty shiny pads and no component body
        draw.rectangle([520, 290, 760, 410], outline=(245, 245, 245), width=3)
        draw.text((525, 260), "R12 (MISSING COMPONENT AT FOOTPRINT)", fill=(255, 255, 255))
        # Empty bare tinned solder pads
        draw.rectangle([545, 315, 605, 385], fill=(210, 215, 220), outline=(160, 165, 170), width=2)
        draw.rectangle([675, 315, 735, 385], fill=(210, 215, 220), outline=(160, 165, 170), width=2)
        # Empty dark green mask gap in between where component should sit
        draw.rectangle([606, 325, 674, 375], fill=(12, 62, 38))
        loc_hint = "center-right region, footprint R12"
        severity = "high"

    elif defect_class == "polarity_error":
        # Polarized Diode D3 with cathode stripe opposite to silkscreen cathode bar
        draw.rectangle([480, 280, 820, 430], outline=(245, 245, 245), width=3)
        # Silkscreen cathode bar on LEFT side with '-' mark
        draw.rectangle([462, 280, 474, 430], fill=(250, 250, 250))
        draw.text((480, 248), "D3  |<-- CATHODE MARK ON LEFT (POLARITY REVERSED)", fill=(255, 255, 255))
        # Pads
        draw.rectangle([500, 315, 560, 395], fill=(200, 205, 210))
        draw.rectangle([740, 315, 800, 395], fill=(200, 205, 210))
        # Diode body placed with white cathode stripe on RIGHT side (wrong!)
        draw.rectangle([540, 305, 760, 405], fill=(24, 24, 28), outline=(200, 200, 200), width=2)
        draw.rectangle([715, 307, 745, 403], fill=(245, 245, 245))
        draw.text((575, 345), "DIODE D3 (STRIPE RIGHT)", fill=(235, 235, 235))
        loc_hint = "center-right region, diode D3"
        severity = "high"

    elif defect_class == "tombstoning":
        # Capacitor C7 lifted vertically on left pad, right pad open
        draw.rectangle([480, 280, 780, 430], outline=(245, 245, 245), width=3)
        draw.text((485, 248), "C7 (TOMBSTONING — CHIP LIFTED OFF RIGHT PAD)", fill=(255, 255, 255))
        # Left pad with tilted/standing ceramic chip capacitor
        draw.rectangle([510, 320, 580, 400], fill=(205, 210, 215))
        # Right pad bare/open
        draw.rectangle([680, 320, 750, 400], fill=(210, 215, 220), outline=(150, 155, 160), width=2)
        draw.text((685, 408), "OPEN PAD", fill=(255, 230, 180))
        # Standing chip body angled upward from left pad
        draw.polygon([(525, 385), (575, 395), (620, 220), (570, 210)], fill=(155, 105, 55), outline=(240, 240, 240))
        loc_hint = "center-right region, capacitor C7"
        severity = "medium"

    else:  # component_shift
        # Resistor R5 shifted & rotated off its pads
        draw.rectangle([480, 280, 780, 430], outline=(245, 245, 245), width=3)
        draw.text((485, 248), "R5 (COMPONENT SHIFT / MISALIGNMENT OFF PADS)", fill=(255, 255, 255))
        draw.rectangle([510, 320, 575, 395], fill=(205, 210, 215))
        draw.rectangle([685, 320, 750, 395], fill=(205, 210, 215))
        # Shifted & angled component body missing the right pad
        draw.polygon([(535, 285), (715, 245), (730, 315), (550, 355)], fill=(28, 28, 34), outline=(240, 240, 240))
        draw.text((595, 290), "R5 SHIFTED", fill=(245, 245, 245))
        loc_hint = "center-right region, resistor R5"
        severity = "medium"

    dst = PUBLIC_SAMPLES_DIR / f"{sample_id}.jpg"
    img.save(dst, format="JPEG", quality=90)
    return {
        "id": sample_id,
        "title": title,
        "category": "SMT Reference Card",
        "orig_defect_class": defect_class,
        "expected_defect_class": defect_class,
        "expected_severity": severity,
        "expected_disposition": "quarantine" if defect_class == "polarity_error" else "rework",
        "board_id": board_id,
        "image_url": f"/samples/{sample_id}.jpg",
        "width": w,
        "height": h,
        "location_hint": loc_hint,
        "bboxes": [{"orig_label": defect_class, "bbox_norm": [0.48, 0.35, 0.80, 0.58], "quadrant": loc_hint}],
        "is_golden": False,
        "description": f"Procedural SMT inspection test card illustrating {defect_class.replace('_', ' ')} ({loc_hint}).",
    }


def main():
    samples = []

    # 1. Process PKU PCB_DATASET defect images
    for sample_id, folder, img_name, xml_name, mapped_class, severity, board_id in PKU_SAMPLES:
        src_img = DATASET_ROOT / "images" / folder / img_name
        src_xml = DATASET_ROOT / "Annotations" / folder / xml_name
        if not src_img.exists():
            print(f"Skipping missing {src_img}")
            continue
        dst_img = PUBLIC_SAMPLES_DIR / f"{sample_id}.jpg"
        nw, nh = resize_and_save(src_img, dst_img)
        boxes, _, _ = parse_xml_bboxes(src_xml)
        quads = sorted(list({b["quadrant"] for b in boxes}))
        loc_hint = ", ".join(quads) if quads else "board surface"
        samples.append({
            "id": sample_id,
            "title": f"{folder.replace('_', ' ')} ({img_name.split('_')[0]})",
            "category": f"PKU {folder.replace('_', ' ')}",
            "orig_defect_class": folder.lower(),
            "expected_defect_class": mapped_class,
            "expected_severity": severity,
            "expected_disposition": "rework" if mapped_class == "solder_bridge" else "requires_human_verification",
            "board_id": board_id,
            "image_url": f"/samples/{sample_id}.jpg",
            "width": nw,
            "height": nh,
            "location_hint": loc_hint,
            "bboxes": boxes,
            "is_golden": False,
            "description": f"Kaggle/PKU bare-PCB sample with {len(boxes)} annotated {folder.lower().replace('_', ' ')} anomaly(s) in {loc_hint}.",
        })

    # 2. Process Clean Golden Boards (PCB_USED)
    for sample_id, img_name, board_id in GOLDEN_SAMPLES:
        src_img = DATASET_ROOT / "PCB_USED" / img_name
        if not src_img.exists():
            continue
        dst_img = PUBLIC_SAMPLES_DIR / f"{sample_id}.jpg"
        nw, nh = resize_and_save(src_img, dst_img)
        samples.append({
            "id": sample_id,
            "title": f"Golden Reference Board ({img_name})",
            "category": "Golden Sample (Defect-Free)",
            "orig_defect_class": "none",
            "expected_defect_class": "none",
            "expected_severity": "low",
            "expected_disposition": "pass",
            "board_id": board_id,
            "image_url": f"/samples/{sample_id}.jpg",
            "width": nw,
            "height": nh,
            "location_hint": "none (clean reference board)",
            "bboxes": [],
            "is_golden": True,
            "description": "Clean defect-free golden reference PCB from PKU PCB_USED for false-call and pass-candidate verification.",
        })

    # 3. Generate 4 SMT Assembly Reference Cards so all 6 MVP classes are covered
    smt_cards = [
        ("smt_missing_comp_01", "missing_component", "SMT Missing Component (R12)", "BAT-SMT-201"),
        ("smt_polarity_err_01", "polarity_error", "SMT Polarity Reversal (Diode D3)", "BAT-SMT-202"),
        ("smt_tombstone_01", "tombstoning", "SMT Tombstoning (Cap C7)", "BAT-SMT-203"),
        ("smt_comp_shift_01", "component_shift", "SMT Component Shift (R5)", "BAT-SMT-204"),
    ]
    for sid, dclass, title, bid in smt_cards:
        samples.append(create_smt_macro_card(sid, dclass, title, bid))

    LABELS_PATH.write_text(json.dumps({"samples": samples}, indent=2), "utf-8")
    print(f"Prepared {len(samples)} sample images into {PUBLIC_SAMPLES_DIR} and wrote {LABELS_PATH}")


if __name__ == "__main__":
    main()

