# Lableit Export Formats

This document describes every dataset export format Lableit produces. It is
derived from `apps/api/src/exportService.ts`.

## How many formats are there?

There are **8 distinct export format IDs** in the code:

```
coco, yolo_detect, yolo_segment, voc, png_masks, createml, tfrecord_meta, labelme
```

The README lists **7 format names** — "COCO, YOLO, Pascal VOC, PNG Masks,
CreateML, TFRecord, LabelMe" — because **YOLO is split into two variants**:
`yolo_detect` (bounding boxes) and `yolo_segment` (polygons). Counting YOLO once
gives 7 named formats; counting both YOLO variants gives **8 selectable format
IDs**. The selectable count in the export UI / `GET /export/formats` is **8**.

## Common behavior

For every format:

- The export job downloads the project's images from object storage into an
  `images/` directory (named `JPEGImages/` for Pascal VOC) using a concurrency
  limit of 10 downloads at a time.
- **Original video files are excluded**; only images and video frames are
  exported.
- Annotations can be limited to selected classes via `includeClasses`.
- All output is packaged into a single ZIP named
  `YYYY-MM-DD_HHMM_<format>_<N>images.zip`.
- Coordinates from SAM3 are stored as boxes `[x1, y1, x2, y2]` and/or polygon
  point lists; each exporter converts these to the target convention.

---

## 1. COCO (`coco`)

A single COCO-style JSON file plus the images.

**Layout**
```
images/                 # downloaded source images
annotations.json        # COCO dataset
```

**Notes**
- `bbox` is `[x, y, width, height]` (converted from `[x1,y1,x2,y2]`), with
  `area = width * height`.
- `segmentation` uses polygon points when available; otherwise a rectangle
  polygon derived from the box, or an RLE `{ counts, size }` object.
- `categories` are 1-indexed in class order; `iscrowd` is always `0`.

**Sample (`annotations.json`)**
```json
{
  "info": { "description": "Lableit Export", "version": "1.0", "year": 2026 },
  "licenses": [{ "id": 1, "name": "Unknown", "url": "" }],
  "images": [{ "id": 1, "file_name": "frame_0001.jpg", "width": 1920, "height": 1080 }],
  "annotations": [
    { "id": 1, "image_id": 1, "category_id": 1, "bbox": [100, 50, 200, 150],
      "area": 30000, "segmentation": [[100,50,300,50,300,200,100,200]], "iscrowd": 0 }
  ],
  "categories": [{ "id": 1, "name": "person", "supercategory": "" }]
}
```

---

## 2. YOLO Detection (`yolo_detect`)

YOLO bounding-box labels (one `.txt` per image) plus `data.yaml` and
`classes.txt`.

**Layout**
```
images/                 # source images
labels/                 # one <image>.txt per image
classes.txt             # class names, one per line
data.yaml               # ultralytics-style dataset config (relative paths)
```

**Notes**
- Each label line is `class_index x_center y_center width height`, all
  normalized to `[0,1]` (6 decimal places). Classes are 0-indexed.
- `data.yaml` uses `path: .` with `train/val/test: images` for portability.

**Sample (`labels/frame_0001.txt`)**
```
0 0.104167 0.115741 0.104167 0.138889
```

**Sample (`data.yaml`)**
```yaml
path: .
train: images
val: images
test: images
nc: 2
names: ['person', 'car']
```

---

## 3. YOLO Segmentation (`yolo_segment`)

YOLO instance-segmentation labels (normalized polygon points) plus `data.yaml`
and `classes.txt`.

**Layout**
```
images/
labels/                 # one <image>.txt per image
classes.txt
data.yaml
```

**Notes**
- Each line is `class_index x1 y1 x2 y2 ...` with normalized polygon points.
- Uses the real polygon from SAM3 when available; otherwise derives a polygon
  from RLE or from the bounding box (4-corner polygon).

**Sample (`labels/frame_0001.txt`)**
```
0 0.052083 0.046296 0.156250 0.046296 0.156250 0.185185 0.052083 0.185185
```

---

## 4. Pascal VOC (`voc`)

One XML annotation file per image (Pascal VOC convention).

**Layout**
```
JPEGImages/             # source images (VOC convention)
Annotations/            # one <image>.xml per image
```

**Notes**
- Boxes are written as integer `xmin/ymin/xmax/ymax`. `<segmented>` is `0`.

**Sample (`Annotations/frame_0001.xml`)**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<annotation>
    <folder>images</folder>
    <filename>frame_0001.jpg</filename>
    <size><width>1920</width><height>1080</height><depth>3</depth></size>
    <segmented>0</segmented>
    <object>
        <name>person</name>
        <bndbox><xmin>100</xmin><ymin>50</ymin><xmax>300</xmax><ymax>200</ymax></bndbox>
    </object>
</annotation>
```

---

## 5. PNG Masks (`png_masks`)

Mask metadata plus a class-color mapping. (The current implementation writes
mask **metadata**, not rasterized PNG files.)

**Layout**
```
images/                 # source images
class_colors.txt        # "className: rgb(r, g, b)" per class
masks/
  mask_metadata.json    # per-image mask descriptors (RLE/polygon, class, confidence)
```

**Sample (`masks/mask_metadata.json`)**
```json
[
  {
    "image": "frame_0001.jpg",
    "width": 1920,
    "height": 1080,
    "masks": [
      { "classId": "cls_1", "className": "person",
        "rle": null, "polygon": [[100,50],[300,50],[300,200]], "confidence": 0.92 }
    ]
  }
]
```

**Sample (`class_colors.txt`)**
```
person: rgb(255, 0, 0)
car: rgb(0, 128, 255)
```

---

## 6. CreateML (`createml`)

Apple CreateML object-detection JSON (single file), for training on iOS/macOS.

**Layout**
```
images/
annotations.json        # CreateML array
```

**Notes**
- Coordinates use **center** `x, y` plus `width, height` (pixel units).

**Sample (`annotations.json`)**
```json
[
  {
    "image": "frame_0001.jpg",
    "annotations": [
      { "label": "person",
        "coordinates": { "x": 200, "y": 125, "width": 200, "height": 150 } }
    ]
  }
]
```

---

## 7. TFRecord metadata (`tfrecord_meta`)

TFRecord binaries require Python/TensorFlow, so Lableit exports the **metadata
and a conversion script** rather than the binary `.tfrecord` itself.

**Layout**
```
images/
label_map.pbtxt         # TF Object Detection label map
annotations.json        # per-image normalized boxes
create_tfrecord.py      # run this with TensorFlow to produce output.tfrecord
```

**Notes**
- Box coordinates in `annotations.json` are normalized to `[0,1]`.
- Class ids start at `1` (id `0` is reserved for background).

**Sample (`label_map.pbtxt`)**
```
item {
  id: 1
  name: 'person'
}
```

**Sample (`annotations.json`)**
```json
[
  {
    "filename": "frame_0001.jpg",
    "width": 1920, "height": 1080,
    "annotations": [
      { "class_name": "person", "class_id": 1,
        "xmin": 0.052, "ymin": 0.046, "xmax": 0.156, "ymax": 0.185 }
    ]
  }
]
```

Run `python create_tfrecord.py` (with TensorFlow + the TF Object Detection API
installed) to produce `output.tfrecord`.

---

## 8. LabelMe (`labelme`)

One LabelMe JSON file per image (polygons and/or rectangles).

**Layout**
```
images/
<image>.json            # one LabelMe file per image
```

**Notes**
- Uses real polygons from SAM3 when available (`shape_type: "polygon"`);
  otherwise emits a `rectangle` from the box. `imageData` is `null`
  (image not embedded). `version` is `5.0.1`.

**Sample (`frame_0001.json`)**
```json
{
  "version": "5.0.1",
  "flags": {},
  "shapes": [
    { "label": "person",
      "points": [[100,50],[300,50],[300,200],[100,200]],
      "group_id": null, "shape_type": "polygon", "flags": {} }
  ],
  "imagePath": "frame_0001.jpg",
  "imageData": null,
  "imageHeight": 1080,
  "imageWidth": 1920
}
```

---

## Choosing a format

| Goal | Use |
|------|-----|
| Detection + segmentation, widely supported | COCO |
| Ultralytics YOLO box training | YOLO Detection |
| Ultralytics YOLO segmentation training | YOLO Segmentation |
| Classic detection toolchains | Pascal VOC |
| Mask data for custom pipelines | PNG Masks (metadata) |
| Apple CreateML training | CreateML |
| TensorFlow Object Detection API | TFRecord metadata (+ script) |
| Re-import into LabelMe for hand-editing | LabelMe |
