"""
image_processor.py — CamScanner-like image processing for invoice scans.
Converts one or more images into a cleaned, perspective-corrected PDF.
"""

import os
import cv2
import numpy as np
from PIL import Image
import img2pdf


# ---------------------------------------------------------------------------
# Image loading
# ---------------------------------------------------------------------------

def _load_image(image_path):
    """Load image via OpenCV; fall back to Pillow for unsupported formats (HEIC, WebP, etc.)."""
    ext = os.path.splitext(image_path)[1].lower()

    if ext in ('.heic', '.heif'):
        try:
            from pillow_heif import register_heif_opener
            register_heif_opener()
        except ImportError:
            raise ValueError(
                "HEIC requires pillow-heif: pip install pillow-heif"
            )

    # Try OpenCV first (fastest path)
    img = cv2.imread(image_path)
    if img is not None:
        return img

    # Fall back to Pillow
    pil_img = Image.open(image_path).convert('RGB')
    arr = np.array(pil_img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


# ---------------------------------------------------------------------------
# Perspective correction
# ---------------------------------------------------------------------------

def _order_points(pts):
    """Return (tl, tr, br, bl) in float32."""
    pts = pts.reshape(4, 2).astype(np.float32)
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).ravel()
    rect[0] = pts[np.argmin(s)]     # top-left
    rect[2] = pts[np.argmax(s)]     # bottom-right
    rect[1] = pts[np.argmin(diff)]  # top-right
    rect[3] = pts[np.argmax(diff)]  # bottom-left
    return rect


def _perspective_correct(img):
    """
    Detect the document outline and warp to a flat rectangle.
    Falls back to the original image if detection fails or the
    contour covers less than 20% of the frame.
    """
    h, w = img.shape[:2]
    img_area = h * w

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 75, 200)

    kernel = np.ones((3, 3), np.uint8)
    edged = cv2.dilate(edged, kernel, iterations=1)

    contours, _ = cv2.findContours(edged, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    doc_contour = None
    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(approx) > 0.20 * img_area:
            doc_contour = approx
            break

    if doc_contour is None:
        return img

    try:
        rect = _order_points(doc_contour)
        tl, tr, br, bl = rect

        max_w = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
        max_h = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))

        if max_w < 100 or max_h < 100:
            return img

        dst = np.array(
            [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
            dtype=np.float32,
        )
        M = cv2.getPerspectiveTransform(rect, dst)
        return cv2.warpPerspective(img, M, (max_w, max_h))
    except Exception:
        return img


# ---------------------------------------------------------------------------
# Enhancement pipeline
# ---------------------------------------------------------------------------

def _enhance(img):
    """Grayscale → adaptive threshold → denoise → contrast boost."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=11, C=2,
    )

    denoised = cv2.fastNlMeansDenoising(
        thresh, h=10, templateWindowSize=7, searchWindowSize=21
    )

    enhanced = cv2.convertScaleAbs(denoised, alpha=1.5, beta=20)
    return enhanced


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def process_invoice_images(image_paths, output_pdf_path):
    """
    Process a list of images into a single cleaned PDF.

    Per-image pipeline:
      1. Load (OpenCV → Pillow fallback for HEIC/WebP)
      2. Perspective correction (auto-detect document edges; skip if unreliable)
      3. Grayscale + adaptive threshold → clean B&W
      4. Denoise (fastNlMeansDenoising)
      5. Contrast boost (convertScaleAbs alpha=1.5, beta=20)
      6. Save as temp 200-DPI PNG

    All pages combined into a single PDF via img2pdf.

    Returns output_pdf_path on success; raises Exception on failure.
    """
    if not image_paths:
        raise ValueError("No images provided")

    temp_pngs = []
    try:
        for idx, img_path in enumerate(image_paths):
            img = _load_image(img_path)
            img = _perspective_correct(img)
            enhanced = _enhance(img)

            tmp_path = f"{output_pdf_path}.page{idx}.png"
            pil_out = Image.fromarray(enhanced)
            pil_out.save(tmp_path, 'PNG', dpi=(200, 200))
            temp_pngs.append(tmp_path)

        with open(output_pdf_path, 'wb') as f:
            f.write(img2pdf.convert(temp_pngs))

        return output_pdf_path

    finally:
        for tmp in temp_pngs:
            try:
                os.remove(tmp)
            except OSError:
                pass
