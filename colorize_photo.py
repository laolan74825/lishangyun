"""
Colorization via intensity-based continuous color mapping.
No spatial region masks - pure grayscale-to-color lookup.
"""

import cv2
import numpy as np
from PIL import Image
import os

SRC_BW = r'D:\web\GiftRegistry\restored_bw.png'
OUT_DIR = r'D:\web\GiftRegistry'
DPI = 300

print("Loading...")
gray = cv2.imread(SRC_BW, cv2.IMREAD_GRAYSCALE)
h, w = gray.shape
gray_f = gray.astype(np.float32) / 255.0
smooth = cv2.GaussianBlur(gray, (41, 41), 0).astype(np.float32) / 255.0

# ---- Build a 256-entry color LUT ----
# Map grayscale intensity (0=black, 255=white) to natural colors
# Based on typical old portrait: dark=hat/clothes, mid=skin, bright=background/beard

lut = np.zeros((256, 3), dtype=np.float32)

for i in range(256):
    t = i / 255.0  # 0..1

    if t < 0.15:
        # Very dark: deep hat/clothing black-brown
        r = 0.06 + t * 0.8
        g = 0.05 + t * 0.8
        b = 0.06 + t * 0.9
    elif t < 0.30:
        # Dark: clothing/hat dark blue-brown
        s = (t - 0.15) / 0.15
        r = 0.18 + s * 0.12
        g = 0.17 + s * 0.13
        b = 0.22 + s * 0.10
    elif t < 0.45:
        # Dark-mid: transition from clothing to skin shadow
        s = (t - 0.30) / 0.15
        r = 0.30 + s * 0.18
        g = 0.30 + s * 0.14
        b = 0.32 + s * 0.06
    elif t < 0.65:
        # Mid: skin tones (Chinese elderly)
        s = (t - 0.45) / 0.20
        r = 0.48 + s * 0.22
        g = 0.44 + s * 0.16
        b = 0.38 + s * 0.10
    elif t < 0.80:
        # Bright-mid: light skin / beard transition
        s = (t - 0.65) / 0.15
        r = 0.70 + s * 0.12
        g = 0.60 + s * 0.12
        b = 0.48 + s * 0.12
    else:
        # Very bright: background paper / white beard
        s = (t - 0.80) / 0.20
        r = 0.82 + s * 0.10
        g = 0.72 + s * 0.12
        b = 0.60 + s * 0.16

    lut[i] = [r, g, b]

# Apply LUT
color_img = lut[gray]  # (h, w, 3) float32

# ---- Add spatial awareness via smooth blending ----
# The pure LUT approach loses spatial context (e.g., face vs background at same brightness)
# Add subtle spatial correction

Y, X = np.mgrid[0:h, 0:w]
ny = Y.astype(np.float32) / h
nx = X.astype(np.float32) / w

# Face center bias: slightly warmer in face area
face_bias = np.exp(-((nx-0.50)**2/(2*0.18**2) + (ny-0.34)**2/(2*0.13**2)))
face_bias = cv2.GaussianBlur((face_bias*255).astype(np.uint8), (101,101), 0).astype(np.float32)/255

# Apply warm tint to face area
color_img[:,:,0] += face_bias * 0.04  # more red
color_img[:,:,1] += face_bias * 0.01  # slight green
color_img[:,:,2] -= face_bias * 0.02  # less blue

# Clothing area bias: slightly cooler/more blue in lower portion
cloth_bias = np.zeros((h,w), dtype=np.float32)
cloth_bias[int(h*0.50):,:] = 1.0
cloth_bias = cv2.GaussianBlur((cloth_bias*255).astype(np.uint8), (101,101), 0).astype(np.float32)/255
cloth_dark = smooth < 0.40
cloth_combined = cloth_bias * cloth_dark.astype(np.float32)

color_img[:,:,0] -= cloth_combined * 0.03
color_img[:,:,1] -= cloth_combined * 0.01
color_img[:,:,2] += cloth_combined * 0.04

color_img = np.clip(color_img, 0, 1)
cu8 = (color_img * 255).astype(np.uint8)

# ---- Post-processing ----

# Saturation boost in skin areas
hsv = cv2.cvtColor(cu8, cv2.COLOR_RGB2HSV).astype(np.float32)
skin = (smooth > 0.35) & (smooth < 0.70)
hsv[skin, 1] = np.clip(hsv[skin, 1] * 1.25, 0, 255)
# Desaturate very dark and very bright areas
dark = smooth < 0.20
hsv[dark, 1] = np.clip(hsv[dark, 1] * 0.70, 0, 255)
bright = smooth > 0.75
hsv[bright, 1] = np.clip(hsv[bright, 1] * 0.80, 0, 255)

cu8 = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)

# Warm/cool color grading
cf = cu8.astype(np.float32)
warm = smooth > 0.40
cf[warm, 0] = np.clip(cf[warm, 0] * 1.03, 0, 255)
cf[warm, 2] = np.clip(cf[warm, 2] * 0.97, 0, 255)
cool = smooth < 0.25
cf[cool, 2] = np.clip(cf[cool, 2] * 1.05, 0, 255)
cf[cool, 0] = np.clip(cf[cool, 0] * 0.96, 0, 255)
cu8 = np.clip(cf, 0, 255).astype(np.uint8)

# Film grain
np.random.seed(42)
noise = np.random.normal(0, 1.8, cu8.shape).astype(np.float32)
cu8 = np.clip(cu8.astype(np.float32) + noise, 0, 255).astype(np.uint8)

# Vignette
cy_c, cx_c = h//2, w//2
Yg, Xg = np.ogrid[:h, :w]
dist = np.sqrt((Xg-cx_c)**2 + (Yg-cy_c)**2)
max_d = np.sqrt(cx_c**2 + cy_c**2)
vig = np.clip(1.0 - 0.08*(dist/max_d)**2, 0.92, 1.0)
cu8 = (cu8.astype(np.float32) * vig[:,:,np.newaxis]).astype(np.uint8)

# Save
def save_img(arr, path):
    Image.fromarray(arr).save(path, dpi=(DPI, DPI), quality=95)

png_path = os.path.join(OUT_DIR, '老照片_修复放大_彩色.png')
jpg_path = os.path.join(OUT_DIR, '老照片_修复放大_彩色.jpg')
save_img(cu8, png_path)
save_img(cu8, jpg_path)
print(f"Saved: {png_path}")
print(f"Saved: {jpg_path}")

user_dir = r'D:\我的文档\图片'
if os.path.isdir(user_dir):
    import shutil
    shutil.copy2(png_path, os.path.join(user_dir, '老照片_修复放大_彩色.png'))
    shutil.copy2(jpg_path, os.path.join(user_dir, '老照片_修复放大_彩色.jpg'))
    print(f"Copied to: {user_dir}")

print("Done!")
