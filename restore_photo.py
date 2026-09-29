"""
Old photo restoration pipeline:
1. Crop to photo area (remove wooden background + watermark)
2. Restore: denoise, contrast, scratch removal, sharpen
3. Upscale to 60cm height @ 300dpi (7087px)
4. Save restored B&W version
5. Generate colorized version
"""

import cv2
import numpy as np
from PIL import Image
import os

SRC = r'D:\web\GiftRegistry\original_photo.jpg'
OUT_DIR = r'D:\web\GiftRegistry'

# Target: 60cm height at 300dpi
TARGET_HEIGHT_CM = 60
DPI = 300
TARGET_HEIGHT_PX = int(TARGET_HEIGHT_CM / 2.54 * DPI)  # 7087

print(f"Target size: {TARGET_HEIGHT_PX}px height @ {DPI}dpi")

# ---- Step 1: Load and crop ----
img = cv2.imread(SRC)
h, w = img.shape[:2]
print(f"Original: {w}x{h}")

# Convert to grayscale for processing
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Crop to photo area - remove wooden background, keep photo paper
# Photo paper scalloped edges: roughly y=75-1655, x=60-1215
# Crop slightly inside to avoid scalloped edge artifacts
crop_top, crop_bottom = 100, 1640
crop_left, crop_right = 80, 1200
cropped = gray[crop_top:crop_bottom, crop_left:crop_right]
print(f"Cropped: {cropped.shape[1]}x{cropped.shape[0]}")

# ---- Step 2: Restore ----

# 2a. Denoise - Non-local means
denoised = cv2.fastNlMeansDenoising(cropped, None, h=12, templateWindowSize=7, searchWindowSize=21)

# 2b. Detect and inpaint scratches/blemishes
# Use threshold to find very bright spots (scratches on dark areas) and very dark spots
# Create a mask of damaged areas
# Method: detect edges of scratches using morphological operations
kernel = np.ones((3, 3), np.uint8)

# Detect bright scratches (white lines on darker areas)
bright_mask = cv2.adaptiveThreshold(
    denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, -8
)
# Invert - we want dark scratches on light background too
dark_mask = cv2.adaptiveThreshold(
    denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, -8
)

# Combine damage mask
damage_mask = cv2.bitwise_or(bright_mask, dark_mask)

# Clean up mask with morphological operations
damage_mask = cv2.morphologyEx(damage_mask, cv2.MORPH_CLOSE, kernel, iterations=1)
damage_mask = cv2.morphologyEx(damage_mask, cv2.MORPH_OPEN, kernel, iterations=1)

# Inpaint damaged areas
inpainted = cv2.inpaint(denoised, damage_mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

# 2c. Contrast enhancement - CLAHE
clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
enhanced = clahe.apply(inpainted)

# 2d. Slight sharpening with unsharp mask
blurred = cv2.GaussianBlur(enhanced, (0, 0), 2.0)
sharpened = cv2.addWeighted(enhanced, 1.5, blurred, -0.5, 0)

# 2e. Final gentle denoise to reduce any artifacts from sharpening
final_bw = cv2.fastNlMeansDenoising(sharpened, None, h=4, templateWindowSize=5, searchWindowSize=15)

# ---- Step 3: Upscale to target size ----
# Calculate target width maintaining aspect ratio
aspect = final_bw.shape[1] / final_bw.shape[0]
target_width = int(TARGET_HEIGHT_PX * aspect)

print(f"Upscaling to: {target_width}x{TARGET_HEIGHT_PX}")

# Use Lanczos4 for high-quality upscaling
upscaled = cv2.resize(final_bw, (target_width, TARGET_HEIGHT_PX), interpolation=cv2.INTER_LANCZOS4)

# ---- Step 4: Save restored B&W version ----
bw_path = os.path.join(OUT_DIR, '老照片_修复放大_黑白.png')
# Save as PNG with DPI metadata
pil_bw = Image.fromarray(upscaled, mode='L')
pil_bw.save(bw_path, dpi=(DPI, DPI), quality=100)
print(f"Saved B&W: {bw_path}")
print(f"  Size: {target_width}x{TARGET_HEIGHT_PX} = {target_width/300*2.54:.1f}cm x {TARGET_HEIGHT_CM}cm @ {DPI}dpi")

# Also save as high-quality JPEG
bw_jpg_path = os.path.join(OUT_DIR, '老照片_修复放大_黑白.jpg')
pil_bw.save(bw_jpg_path, dpi=(DPI, DPI), quality=95)
print(f"Saved B&W JPG: {bw_jpg_path}")

# Copy to user's picture directory
user_pic_dir = r'D:\我的文档\图片'
if os.path.isdir(user_pic_dir):
    import shutil
    shutil.copy2(bw_path, os.path.join(user_pic_dir, '老照片_修复放大_黑白.png'))
    shutil.copy2(bw_jpg_path, os.path.join(user_pic_dir, '老照片_修复放大_黑白.jpg'))
    print(f"Copied to: {user_pic_dir}")

# ---- Step 5: Colorize ----
print("\nGenerating colorized version...")

# Load pre-trained colorization model
# Using OpenCV's DNN colorization model (caffe)
model_url_prototxt = "https://raw.githubusercontent.com/richzhang/colorization/master/colorization/resources/colorization_deploy_v2.prototxt"
model_url_weights = "https://github.com/richzhang/colorization/raw/master/colorization/resources/colorization_release_v2.caffemodel"
pts_url = "https://raw.githubusercontent.com/richzhang/colorization/master/colorization/resources/pts_in_hull.npy"

# Try local paths first, then download
import urllib.request
import tempfile

tmpdir = tempfile.gettempdir()
prototxt_path = os.path.join(tmpdir, 'colorization_deploy_v2.prototxt')
weights_path = os.path.join(tmpdir, 'colorization_release_v2.caffemodel')
pts_path = os.path.join(tmpdir, 'pts_in_hull.npy')

def download_if_needed(url, path):
    if not os.path.exists(path):
        print(f"  Downloading {os.path.basename(path)}...")
        urllib.request.urlretrieve(url, path)

try:
    download_if_needed(model_url_prototxt, prototxt_path)
    download_if_needed(model_url_weights, weights_path)
    download_if_needed(pts_url, pts_path)

    net = cv2.dnn.readNetFromCaffe(prototxt_path, weights_path)
    pts_in_hull = np.load(pts_path)

    # Add cluster centers as 1x1 conv layer
    pts_in_hull = pts_in_hull.transpose().reshape(2, 313, 1, 1).astype(np.float32)
    net.getLayer(net.getLayerId('class8_ab')).blobs = [pts_in_hull]
    net.getLayer(net.getLayerId('conv8_313_rh')).blobs = [np.full([1, 313], 2.606, dtype=np.float32)]

    # Convert to Lab color space
    img_rgb = cv2.cvtColor(upscaled, cv2.COLOR_GRAY2RGB)
    img_lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    img_lab /= 255.0

    # Extract L channel
    l_channel = img_lab[:, :, 0]

    # Resize L channel for network input
    l_resized = cv2.resize(l_channel, (224, 224))
    l_resized -= 50  # Center around 0

    # Forward pass
    net.setInput(cv2.dnn.blobFromImage(l_resized))
    ab_channel = net.forward()[0, :, :, :].transpose((1, 2, 0))

    # Resize ab back to original size
    ab_resized = cv2.resize(ab_channel, (upscaled.shape[1], upscaled.shape[0]))

    # Combine L + ab
    img_lab_out = np.concatenate([l_channel[:, :, np.newaxis], ab_resized], axis=2)
    img_lab_out[:, :, 0] = np.clip(img_lab_out[:, :, 0], 0, 1)
    img_lab_out[:, :, 1] = np.clip(img_lab_out[:, :, 1], -0.5, 0.5)
    img_lab_out[:, :, 2] = np.clip(img_lab_out[:, :, 2], -0.5, 0.5)

    # Convert back to RGB
    img_lab_out = (img_lab_out * 255).astype(np.uint8)
    colorized = cv2.cvtColor(img_lab_out, cv2.COLOR_LAB2RGB)

    # Save colorized version
    color_path = os.path.join(OUT_DIR, '老照片_修复放大_彩色.png')
    pil_color = Image.fromarray(colorized)
    pil_color.save(color_path, dpi=(DPI, DPI), quality=100)
    print(f"Saved colorized: {color_path}")

    color_jpg_path = os.path.join(OUT_DIR, '老照片_修复放大_彩色.jpg')
    pil_color.save(color_jpg_path, dpi=(DPI, DPI), quality=95)
    print(f"Saved colorized JPG: {color_jpg_path}")

    # Copy to user's picture directory
    if os.path.isdir(user_pic_dir):
        import shutil
        shutil.copy2(color_path, os.path.join(user_pic_dir, '老照片_修复放大_彩色.png'))
        shutil.copy2(color_jpg_path, os.path.join(user_pic_dir, '老照片_修复放大_彩色.jpg'))
        print(f"Copied colorized to: {user_pic_dir}")

    print("\nDone! All files saved.")

except Exception as e:
    print(f"Colorization model error: {e}")
    print("Will try alternative colorization approach...")

    # Fallback: simple sepia/warm tone colorization
    # Create a warm-toned version as fallback
    colorized_fallback = cv2.cvtColor(upscaled, cv2.COLOR_GRAY2BGR)

    # Apply warm sepia-like tones
    # Skin tones: warm brownish
    colorized_fallback[:, :, 0] = np.clip(upscaled * 0.85, 0, 255).astype(np.uint8)  # B reduced
    colorized_fallback[:, :, 1] = np.clip(upscaled * 0.95, 0, 255).astype(np.uint8)  # G slightly reduced
    colorized_fallback[:, :, 2] = np.clip(upscaled * 1.0, 0, 255).astype(np.uint8)  # R full

    # Add slight warm tint to lighter areas (skin)
    mask_skin = upscaled > 100
    colorized_fallback[mask_skin, 0] = np.clip(colorized_fallback[mask_skin, 0].astype(int) + 15, 0, 255).astype(np.uint8)
    colorized_fallback[mask_skin, 1] = np.clip(colorized_fallback[mask_skin, 1].astype(int) + 5, 0, 255).astype(np.uint8)

    color_path = os.path.join(OUT_DIR, '老照片_修复放大_彩色.png')
    pil_color = Image.fromarray(cv2.cvtColor(colorized_fallback, cv2.COLOR_BGR2RGB))
    pil_color.save(color_path, dpi=(DPI, DPI), quality=100)
    print(f"Saved fallback colorized: {color_path}")

    color_jpg_path = os.path.join(OUT_DIR, '老照片_修复放大_彩色.jpg')
    pil_color.save(color_jpg_path, dpi=(DPI, DPI), quality=95)
    print(f"Saved fallback colorized JPG: {color_jpg_path}")

    # Copy to user's picture directory
    if os.path.isdir(user_pic_dir):
        import shutil
        shutil.copy2(color_path, os.path.join(user_pic_dir, '老照片_修复放大_彩色.png'))
        shutil.copy2(color_jpg_path, os.path.join(user_pic_dir, '老照片_修复放大_彩色.jpg'))
        print(f"Copied fallback colorized to: {user_pic_dir}")
