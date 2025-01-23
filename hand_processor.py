import cv2
import numpy as np
import mediapipe as mp

class HandProcessor:
    def __init__(self):
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_hands = mp.solutions.hands
    
    def process_hand(self, frame, landmarks, handedness):
        h, w = frame.shape[:2]
        
        # Get hand type (corrected for mirroring)
        hand_type = "Right" if "Left" in handedness.classification[0].label else "Left"
        
        # Create ROI canvas
        roi_canvas = np.zeros((400, 400, 3), dtype=np.uint8)
        
        # Extract ROI coordinates
        x_coords = [lm.x * w for lm in landmarks.landmark]
        y_coords = [lm.y * h for lm in landmarks.landmark]
        min_x, max_x = min(x_coords), max(x_coords)
        min_y, max_y = min(y_coords), max(y_coords)
        
        # Draw landmarks on main frame
        self.mp_drawing.draw_landmarks(
            frame, landmarks, self.mp_hands.HAND_CONNECTIONS)
        
        # Process ROI
        if (max_x - min_x) > 0 and (max_y - min_y) > 0:
            roi = frame[int(min_y):int(max_y), int(min_x):int(max_x)]
            roi = self._scale_roi(roi)
            roi_canvas = self._overlay_landmarks(roi_canvas, roi, landmarks, min_x, min_y, w, h)
        
        return frame, roi_canvas, hand_type

    def _scale_roi(self, roi):
        h, w = roi.shape[:2]
        scale = min(400/w, 400/h)
        return cv2.resize(roi, (0,0), fx=scale, fy=scale)

    def _overlay_landmarks(self, canvas, roi, landmarks, min_x, min_y, img_w, img_h):
        h_roi, w_roi = roi.shape[:2]
        scale = min(400/w_roi, 400/h_roi)
        
        for lm in landmarks.landmark:
            x = int((lm.x * img_w - min_x) * scale)
            y = int((lm.y * img_h - min_y) * scale)
            cv2.circle(roi, (x, y), 3, (0,255,0), -1)
        
        # Center the ROI
        y_start = (400 - roi.shape[0]) // 2
        x_start = (400 - roi.shape[1]) // 2
        canvas[y_start:y_start+roi.shape[0], x_start:x_start+roi.shape[1]] = roi
        return canvas