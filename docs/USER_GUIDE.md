# Lableit User Guide

This guide walks through the end-to-end annotation workflow in Lableit: creating
a project, defining classes, uploading media, slicing video into frames, running
SAM3 text-prompt detection, reviewing and adjusting annotations, tuning
per-class thresholds, tagging, and exporting your dataset.

> **No sign-in:** Lableit has no accounts and no login. Open the app and you are
> already in, and everything you create belongs to that single local
> installation. This also means the app has no access control of its own, so
> keep it on your own machine or behind a proxy or VPN that does the
> authenticating. See [DEPLOYMENT.md](../DEPLOYMENT.md).

> **GPU note:** Automatic SAM3 detection requires an NVIDIA CUDA GPU. If no GPU
> is available, Lableit runs in **limited mode**: you can still manage projects,
> upload media, draw annotations by hand, tag assets, and export. Automatic
> detection is simply unavailable. See
> [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

---

## 1. Open the app and create a project

A project is the top-level container for your media, classes, and annotations.

1. Open the web app (locally `http://localhost:3000`). You land on the
   **Projects dashboard**; there is nothing to sign in to.
2. Click **New Project** (or the create button).
3. Enter a project **name** (1-100 characters).
4. The project opens. From the dashboard you can search projects and switch
   between grid and list views; clicking a project expands a full-width detail
   view with stats (assets, classes, labeled count) and asset thumbnails.

---

## 2. Define classes

Classes are the object categories you want to detect/annotate. Each class has a
**name**, a **color**, and a per-class **confidence threshold**.

1. Open the project and go to class management (in the dashboard detail view or
   the labeling page's **Control Panel**).
2. Click **Add class** and enter:
   - **Name** (up to 50 characters; must be unique within the project),
   - **Color** (pick from the palette or enter a hex code such as `#FF0000`),
   - **Threshold** (0.0-1.0; defaults to 0.5).
3. Save. Repeat for each class.

**Bulk class management (CSV):**
- **Export classes:** download a `name,color,threshold` CSV for the project.
- **Import classes:** upload a CSV with a `name` column (optional `color` and
  `threshold` columns). Duplicate or invalid rows are reported and skipped.

The class **name** is what SAM3 uses as the text prompt during detection, so
name classes the way you would describe the object (e.g. `person`, `car`,
`crack`).

---

## 3. Upload images and videos

1. Open the project's labeling page.
2. **Upload** by clicking the upload control or **drag-and-drop** files onto the
   page.
3. Supported file types:
   - Images: **JPG, JPEG, PNG**
   - Videos: **MP4, AVI, MOV, MKV, WebM**
   - Maximum file size: **500 MB** per file.
4. **Images** are added immediately as assets, and a 300x300 thumbnail is
   generated automatically.
5. **Videos** are uploaded but are **not** turned into assets yet, a video must
   be sliced into frames first (next step).

You can apply tags during upload (see §7) and bulk-delete assets later.

---

## 4. Slice video into frames

Videos must be sliced into still frames (using **ffmpeg**) before they can be
annotated.

1. After uploading a video, open the **Video Slice** dialog.
2. Choose a sampling **interval** (seconds between frames):
   - Preset buttons: **1, 2, 5, 10 s**, or
   - a custom slider (0.5-30 s) / numeric input for precise control.
3. The dialog estimates how many frames will be produced and warns if the count
   is large (>100).
4. Start slicing. A background job extracts frames at `fps = 1/interval`,
   uploads each frame as an image asset (with a thumbnail), records the frame
   timestamp, and then deletes the original uploaded video.
5. Progress is shown live (downloading → extracting → uploading frames).

Tags selected for slicing are applied to every extracted frame.

---

## 5. Run SAM3 text-prompt detection

This is the automatic-annotation step (requires a GPU; see the note at the top).

1. In the labeling page **Control Panel**, confirm your classes (their **names**
   are the text prompts).
2. Choose an **inference mode**:
   - **Boxes only**: bounding boxes,
   - **Masks only**: segmentation masks/polygons,
   - **Boxes + masks**: both (default).
3. Select which assets to run on (the current asset, a selection, or the whole
   project for a batch run).
4. Start detection. Lableit queues a job that, for each image:
   - sends a short-lived signed image URL plus the class names to the SAM3
     service,
   - receives detections (box and/or mask + confidence) per prompt,
   - filters each detection by its **per-class threshold**,
   - stores the surviving detections as `auto`-sourced annotations.
5. Progress is shown live. Video files are skipped automatically (only frames
   are processed).

If the SAM3 model is unavailable (no GPU / weights not downloaded), a batch run
aborts with a clear message instead of producing empty results.

---

## 6. Review and adjust on the canvas

Open an asset to review its annotations on the interactive **Annotation
Canvas**.

- **Boxes** are drawn with visible strokes and a subtle fill; **masks** are
  rendered as overlays.
- **Draw a new box:** click-drag on the canvas; assign it to a class. New
  manual annotations are stored with `source: manual` and confidence 1.0.
- **Edit:** change an annotation's class, geometry, or type.
- **Delete:** remove an individual annotation, or use **Clear All Annotations**
  (header button) to wipe every annotation in the project.
- **Navigate:** use the modal preview with previous/next and keyboard shortcuts;
  press the **?** button for the keyboard-shortcuts help.

The asset grid lets you filter by annotation status (All / Labeled / Unlabeled),
multi-select for bulk operations, and see annotation-count badges.

---

## 7. Per-class thresholds and tagging

**Per-class thresholds**
- Each class has a confidence threshold (0.0-1.0). During detection, a
  detection for a class is kept only if its confidence is at or above that
  class's threshold.
- Adjust thresholds via the per-class sliders in the Control Panel. Raise a
  threshold to reduce false positives; lower it to catch more (and noisier)
  detections. Re-run detection to apply.

**Tagging**
- Tags are project-scoped labels for organizing assets (each has a name and
  color).
- Apply tags during upload, during video slicing, to a single asset, or in bulk
  across many assets at once. Tags can also be removed individually or in bulk.

---

## 8. Export your dataset

1. Open the **Export** panel from the labeling page.
2. Choose an **export format** (see [EXPORT_FORMATS.md](./EXPORT_FORMATS.md) for
   the full list and layouts): COCO, YOLO (detection or segmentation), Pascal
   VOC, PNG masks (metadata), CreateML, TFRecord metadata, or LabelMe.
3. Optionally limit the export to specific classes.
4. Start the export. A background job downloads the images from storage,
   generates the annotation files in the chosen format, and packages everything
   into a ZIP. Original video files are excluded; only images and video frames
   are included.
5. Watch the live progress bar (fetching data → downloading images → creating
   archive → finalizing).
6. When complete, download the archive. The filename encodes the date, time,
   format, and image count, e.g. `2026-06-05_1430_coco_42images.zip`. Download
   links are secured with single-use, time-limited tokens.

---

## Tips

- Name classes the way you would describe the object out loud, that text is the
  SAM3 prompt.
- Use tags to slice large projects into manageable subsets, then export only the
  classes you need.
- If detection returns nothing, lower the relevant class threshold and confirm
  the inference service has a GPU and downloaded weights.
