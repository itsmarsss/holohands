import cv2
import numpy as np
from detector import HandDetector
from hand_processor import HandProcessor

class HandTrackingApp:
    def __init__(self):
        self.cap = cv2.VideoCapture(0)
        self.detector = HandDetector()
        self.processor = HandProcessor()
        cv2.namedWindow('Hand Tracking System', cv2.WINDOW_NORMAL)
        cv2.resizeWindow('Hand Tracking System', 1600, 900)

    def run(self):
        while self.cap.isOpened():
            success, frame = self.cap.read()
            if not success: continue
            
            frame = cv2.flip(frame, 1)
            composite = np.zeros((900, 1600, 3), dtype=np.uint8)
            
            # Process main view with aspect ratio preservation
            main_view = self._get_aspect_ratio_main_view(frame)
            composite[0:900, 0:800] = main_view
            
            # Detect and process hands
            landmarks_list, handedness_list = self.detector.detect(frame)
            right_panel = np.zeros((900, 800, 3), dtype=np.uint8)
            
            if landmarks_list:
                grid_views = []
                processed_frame = frame.copy()
                
                for landmarks, handedness in zip(landmarks_list, handedness_list):
                    p_frame, grid = self.processor.process_hand(processed_frame, landmarks, handedness)
                    grid_views.append(grid)
                
                # Arrange grids safely
                for i, grid in enumerate(grid_views):
                    if grid is not None and grid.size > 0:
                        y_pos = i * 450
                        right_panel[y_pos:y_pos+400, 200:600] = cv2.resize(grid, (400, 400))
            
            composite[0:900, 800:1600] = right_panel
            cv2.imshow('Hand Tracking System', composite)
            
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        
        self.cap.release()
        cv2.destroyAllWindows()

    def _get_aspect_ratio_main_view(self, frame):
        h, w = frame.shape[:2]
        target_w, target_h = 800, 900
        scale = min(target_w/w, target_h/h)
        new_w, new_h = int(w*scale), int(h*scale)
        resized = cv2.resize(frame, (new_w, new_h))
        padded = np.zeros((target_h, target_w, 3), dtype=np.uint8)
        y_start = (target_h - new_h) // 2
        x_start = (target_w - new_w) // 2
        padded[y_start:y_start+new_h, x_start:x_start+new_w] = resized
        return padded

if __name__ == "__main__":
    app = HandTrackingApp()
    app.run()