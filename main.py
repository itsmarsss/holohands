import eventlet
eventlet.monkey_patch()

import cv2
from webserver import socketio, app
import mediapipe as mp

class HandDetector:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5)

    def detect(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(rgb)
        return self._serialize(results)

    def _serialize(self, results):
        if not results.multi_hand_landmarks:
            return []
        
        hands = []
        for idx, landmarks in enumerate(results.multi_hand_landmarks):
            hand = {
                'handedness': results.multi_handedness[idx].classification[0].label,
                'landmarks': [[lm.x, lm.y, lm.z] for lm in landmarks.landmark]
            }
            hands.append(hand)
        return hands

def main():
    detector = HandDetector()
    cap = cv2.VideoCapture(0)
    
    with app.app_context():
        while True:
            success, frame = cap.read()
            if not success:
                continue
            
            frame = cv2.flip(frame, 1)
            hands_data = detector.detect(frame)
            
            if hands_data:
                try:
                    socketio.emit('hand_data', hands_data)
                except Exception as e:
                    print(f"Emit error: {str(e)}")
            
            eventlet.sleep(0.001)

if __name__ == '__main__':
    main()