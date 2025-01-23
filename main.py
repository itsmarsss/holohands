import cv2
import numpy as np
from detector import HandDetector
from hand_processor import HandProcessor

class HandTrackingApp:
    def __init__(self):
        self.cap = cv2.VideoCapture(0)
        self.detector = HandDetector()
        self.processor = HandProcessor()
        cv2.namedWindow('Hand Tracking', cv2.WINDOW_NORMAL)
    
    def run(self):
        while self.cap.isOpened():
            success, frame = self.cap.read()
            if not success: continue
            
            frame = cv2.flip(frame, 1)
            composite = self._create_composite_frame(frame)
            
            cv2.imshow('Hand Tracking', composite)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        
        self.cap.release()
        cv2.destroyAllWindows()

    def _create_composite_frame(self, frame):
        composite = np.zeros((900, 1600, 3), dtype=np.uint8)
        composite[0:900, 0:800] = cv2.resize(frame, (800, 900))
        
        landmarks_list, handedness_list = self.detector.detect(frame)
        right_panel = np.zeros((900, 800, 3), dtype=np.uint8)
        
        if landmarks_list:
            for i, (landmarks, handedness) in enumerate(zip(landmarks_list, handedness_list)):
                processed_frame, hand_view, hand_type = self.processor.process_hand(
                    frame.copy(), landmarks, handedness)
                
                y_pos = 0 if hand_type == "Left" else 450
                right_panel[y_pos:y_pos+400, 200:600] = hand_view
        
        composite[0:900, 800:1600] = right_panel
        return composite

if __name__ == "__main__":
    app = HandTrackingApp()
    app.run()