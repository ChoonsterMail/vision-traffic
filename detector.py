"""
Vehicle Detection Engine using YOLOv8
=====================================
Detects and classifies vehicles in video:
  - Ô tô (car)
  - Xe máy (motorcycle)
  - Xe bus (bus)
  - Xe tải (truck)
  - Xe đạp (bicycle)

Uses COCO pretrained YOLOv8 model for inference.
"""

import cv2
import numpy as np
import json
import os
import subprocess
import shutil
from pathlib import Path

try:
    from ultralytics import YOLO
except ImportError:
    raise ImportError(
        "Vui lòng cài đặt ultralytics: pip install ultralytics"
    )


# ============================================================
# Vehicle class mapping from COCO dataset
# COCO IDs: bicycle=1, car=2, motorcycle=3, bus=5, truck=7
# ============================================================
VEHICLE_CLASSES = {
    1: {
        'name': 'bicycle',
        'name_vi': 'Xe đạp',
        'emoji': '🚲',
        'color': (180, 105, 255),   # Purple (BGR for OpenCV)
        'hex': '#8b5cf6',
    },
    2: {
        'name': 'car',
        'name_vi': 'Ô tô',
        'emoji': '🚗',
        'color': (0, 200, 80),      # Green (BGR)
        'hex': '#10b981',
    },
    3: {
        'name': 'motorcycle',
        'name_vi': 'Xe máy',
        'emoji': '🏍️',
        'color': (255, 130, 0),     # Blue (BGR)
        'hex': '#3b82f6',
    },
    5: {
        'name': 'bus',
        'name_vi': 'Xe bus',
        'emoji': '🚌',
        'color': (0, 215, 255),     # Yellow (BGR)
        'hex': '#f59e0b',
    },
    7: {
        'name': 'truck',
        'name_vi': 'Xe tải',
        'emoji': '🚛',
        'color': (60, 60, 235),     # Red (BGR)
        'hex': '#ef4444',
    },
}

# Reverse lookup: Vietnamese name → vehicle info
VEHICLE_BY_NAME_VI = {
    v['name_vi']: {**v, 'coco_id': k}
    for k, v in VEHICLE_CLASSES.items()
}


class VehicleDetector:
    """
    Vehicle detection and classification engine using YOLOv8.

    Processes video files frame-by-frame:
      1. Run YOLOv8 inference on each frame
      2. Filter detections to vehicle classes only
      3. Annotate frames with styled bounding boxes, labels, and HUD
      4. Aggregate statistics (counts, confidence, per-second timeline)
      5. Output annotated video + JSON statistics file
    """

    def __init__(self, model_name='yolov8n.pt', confidence=0.4):
        """
        Initialize the detector.

        Args:
            model_name: YOLOv8 model variant. Options:
                        yolov8n (nano, fastest),
                        yolov8s (small),
                        yolov8m (medium),
                        yolov8l (large),
                        yolov8x (extra-large, most accurate)
            confidence: Minimum confidence threshold (0.0 - 1.0)
        """
        print(f"[VehicleDetector] Loading model: {model_name}")
        self.model = YOLO(model_name)
        self.confidence = confidence
        self.vehicle_class_ids = list(VEHICLE_CLASSES.keys())
        print(f"[VehicleDetector] Model loaded. Confidence threshold: {confidence}")

    def process_video(self, input_path, output_path, stats_path,
                      progress_callback=None):
        """
        Process a video file: detect vehicles, annotate, generate statistics.

        Args:
            input_path:        Path to the input video file
            output_path:       Path for the annotated output video (MP4)
            stats_path:        Path for the JSON statistics file
            progress_callback: Optional callable(progress: float) where
                               progress is 0.0 to 100.0

        Returns:
            dict: Comprehensive statistics about detected vehicles

        Raises:
            ValueError: If the video file cannot be opened
            RuntimeError: If the video writer fails to initialize
        """
        cap = cv2.VideoCapture(input_path)

        if not cap.isOpened():
            raise ValueError(f"Không thể mở video: {input_path}")

        # ── Video properties ──────────────────────────────────
        fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = max(int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), 1)

        print(f"[VehicleDetector] Video: {width}x{height} @ {fps}fps, "
              f"~{total_frames} frames, "
              f"~{total_frames / fps:.1f}s")

        # ── Video writer (temp file, will convert to H.264 later) ──
        temp_output = output_path + '.temp.mp4'
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(temp_output, fourcc, fps, (width, height))

        if not out.isOpened():
            cap.release()
            raise RuntimeError("Không thể tạo video writer. "
                               "Kiểm tra codec và đường dẫn output.")

        # ── Statistics accumulators ───────────────────────────
        vehicle_total_counts = {v['name_vi']: 0 for v in VEHICLE_CLASSES.values()}
        vehicle_confidences = {v['name_vi']: [] for v in VEHICLE_CLASSES.values()}
        detections_per_second = []

        frame_idx = 0
        current_second = -1
        second_detections = {}

        # ── Frame-by-frame processing ────────────────────────
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Run YOLOv8 inference
            results = self.model(frame, conf=self.confidence, verbose=False)

            frame_vehicle_count = {}

            for result in results:
                boxes = result.boxes
                if boxes is None:
                    continue

                for box in boxes:
                    cls_id = int(box.cls[0])

                    # Skip non-vehicle classes
                    if cls_id not in VEHICLE_CLASSES:
                        continue

                    conf = float(box.conf[0])
                    vehicle_info = VEHICLE_CLASSES[cls_id]
                    name_vi = vehicle_info['name_vi']
                    color = vehicle_info['color']

                    # Bounding box coordinates
                    x1, y1, x2, y2 = map(int, box.xyxy[0])

                    # Draw styled bounding box
                    self._draw_detection(frame, x1, y1, x2, y2,
                                         name_vi, conf, color)

                    # Accumulate counts
                    frame_vehicle_count[name_vi] = (
                        frame_vehicle_count.get(name_vi, 0) + 1
                    )
                    vehicle_total_counts[name_vi] += 1
                    vehicle_confidences[name_vi].append(conf)

            # Draw HUD overlay
            self._draw_hud(frame, frame_vehicle_count,
                           frame_idx, total_frames, fps)

            # ── Per-second aggregation for timeline chart ─────
            sec = frame_idx // fps if fps > 0 else 0
            if sec != current_second:
                if current_second >= 0 and second_detections:
                    detections_per_second.append({
                        'second': current_second,
                        'counts': dict(second_detections),
                    })
                current_second = sec
                second_detections = {}

            for name, count in frame_vehicle_count.items():
                second_detections[name] = (
                    second_detections.get(name, 0) + count
                )

            # Write annotated frame
            out.write(frame)
            frame_idx += 1

            # Report progress (every 3 frames to reduce overhead)
            if progress_callback and frame_idx % 3 == 0:
                progress = min(frame_idx / total_frames * 95, 95)
                progress_callback(round(progress, 1))

        # Save last second's data
        if second_detections:
            detections_per_second.append({
                'second': current_second,
                'counts': dict(second_detections),
            })

        cap.release()
        out.release()

        print(f"[VehicleDetector] Processed {frame_idx} frames. "
              f"Converting to H.264...")

        # ── Convert to H.264 for browser compatibility ────────
        if progress_callback:
            progress_callback(96)

        self._convert_to_h264(temp_output, output_path)

        if progress_callback:
            progress_callback(98)

        # ── Build final statistics ────────────────────────────
        stats = {
            'total_frames': frame_idx,
            'fps': fps,
            'resolution': f'{width}x{height}',
            'duration': round(frame_idx / fps, 1) if fps > 0 else 0,
            'vehicle_counts': {
                k: v for k, v in vehicle_total_counts.items() if v > 0
            },
            'total_detections': sum(vehicle_total_counts.values()),
            'confidence_avg': {
                k: round(sum(v) / len(v) * 100, 1)
                for k, v in vehicle_confidences.items() if v
            },
            'detections_per_second': detections_per_second,
            'vehicle_types_detected': len(
                [v for v in vehicle_total_counts.values() if v > 0]
            ),
            'vehicle_colors': {
                info['name_vi']: info['hex']
                for info in VEHICLE_CLASSES.values()
            },
        }

        # Save statistics to JSON
        with open(stats_path, 'w', encoding='utf-8') as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)

        if progress_callback:
            progress_callback(100)

        print(f"[VehicleDetector] Done! "
              f"Total detections: {stats['total_detections']}")
        return stats

    # ──────────────────────────────────────────────────────────
    # Private drawing helpers
    # ──────────────────────────────────────────────────────────

    @staticmethod
    def _draw_detection(frame, x1, y1, x2, y2, label_text, conf, color):
        """Draw a styled bounding box with label on the frame."""
        # Main rectangle
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # Corner accents for a modern look
        corner_len = min(20, (x2 - x1) // 4, (y2 - y1) // 4)
        t = 3  # corner thickness

        # Top-left
        cv2.line(frame, (x1, y1), (x1 + corner_len, y1), color, t)
        cv2.line(frame, (x1, y1), (x1, y1 + corner_len), color, t)
        # Top-right
        cv2.line(frame, (x2, y1), (x2 - corner_len, y1), color, t)
        cv2.line(frame, (x2, y1), (x2, y1 + corner_len), color, t)
        # Bottom-left
        cv2.line(frame, (x1, y2), (x1 + corner_len, y2), color, t)
        cv2.line(frame, (x1, y2), (x1, y2 - corner_len), color, t)
        # Bottom-right
        cv2.line(frame, (x2, y2), (x2 - corner_len, y2), color, t)
        cv2.line(frame, (x2, y2), (x2, y2 - corner_len), color, t)

        # Label text
        label = f"{label_text} {conf:.0%}"
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.55
        thickness = 1
        (tw, th), baseline = cv2.getTextSize(label, font, font_scale, thickness)

        # Semi-transparent label background
        overlay = frame.copy()
        cv2.rectangle(overlay,
                      (x1, y1 - th - 14),
                      (x1 + tw + 12, y1),
                      color, -1)
        cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

        # Label text (white on colored bg)
        cv2.putText(frame, label, (x1 + 6, y1 - 7),
                    font, font_scale, (255, 255, 255),
                    thickness, cv2.LINE_AA)

    @staticmethod
    def _draw_hud(frame, vehicle_counts, frame_idx, total_frames, fps):
        """Draw heads-up display overlay in the top-left corner."""
        h, w = frame.shape[:2]
        num_items = len(vehicle_counts)
        total_detected = sum(vehicle_counts.values()) if vehicle_counts else 0

        # Panel dimensions
        panel_w = 240
        panel_h = 50 + num_items * 28
        margin = 12

        # Semi-transparent background
        overlay = frame.copy()
        cv2.rectangle(overlay,
                      (margin, margin),
                      (margin + panel_w, margin + panel_h),
                      (10, 10, 10), -1)
        cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

        # Border
        cv2.rectangle(frame,
                      (margin, margin),
                      (margin + panel_w, margin + panel_h),
                      (0, 212, 255), 1)

        # Title
        cv2.putText(frame,
                    f"VEHICLE DETECTION [{total_detected}]",
                    (margin + 10, margin + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48,
                    (0, 212, 255), 1, cv2.LINE_AA)

        # Separator line
        cv2.line(frame,
                 (margin + 8, margin + 30),
                 (margin + panel_w - 8, margin + 30),
                 (0, 212, 255), 1)

        # Vehicle counts
        y_offset = margin + 50
        for name, count in vehicle_counts.items():
            if name in VEHICLE_BY_NAME_VI:
                color = VEHICLE_BY_NAME_VI[name]['color']
            else:
                color = (255, 255, 255)

            cv2.circle(frame, (margin + 18, y_offset - 4), 5, color, -1)
            cv2.putText(frame,
                        f"{name}: {count}",
                        (margin + 30, y_offset),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.44,
                        (230, 230, 230), 1, cv2.LINE_AA)
            y_offset += 28

        # Progress / timestamp (bottom-right corner)
        if fps > 0:
            time_str = f"{frame_idx / fps:.1f}s"
            cv2.putText(frame, time_str,
                        (w - 80, h - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                        (180, 180, 180), 1, cv2.LINE_AA)

    @staticmethod
    def _convert_to_h264(temp_path, output_path):
        """
        Convert video to H.264/AAC in MP4 container for browser playback.
        Falls back to the raw mp4v file if ffmpeg is unavailable.
        """
        if shutil.which('ffmpeg'):
            try:
                subprocess.run([
                    'ffmpeg', '-i', temp_path,
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '23',
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart',
                    '-an',           # no audio from the original
                    '-y', output_path
                ], check=True, capture_output=True, timeout=600)

                # Clean up temp file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                print("[VehicleDetector] H.264 conversion successful.")
                return
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
                print(f"[VehicleDetector] ffmpeg conversion failed: {e}. "
                      f"Using fallback codec.")

        # Fallback: just rename the temp file
        if os.path.exists(output_path):
            os.remove(output_path)
        if os.path.exists(temp_path):
            os.rename(temp_path, output_path)
        print("[VehicleDetector] Using mp4v fallback (install ffmpeg for "
              "better browser compatibility).")
