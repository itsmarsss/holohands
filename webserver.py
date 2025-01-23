import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template
import cv2
import mediapipe as mp
import base64
import json
from eventlet import wsgi
from eventlet.websocket import WebSocketWSGI

app = Flask(__name__)

# MediaPipe setup with image dimensions
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5
)

@app.route('/')
def index():
    return render_template('index.html')

@WebSocketWSGI
def handle_websocket(ws):
    cap = cv2.VideoCapture(0)
    try:
        while True:
            success, frame = cap.read()
            if not success:
                break
            
            # Process frame with dimensions
            frame = cv2.flip(frame, 1)
            frame = cv2.resize(frame, (640, 480))
            h, w = frame.shape[:2]
            
            # Convert to base64
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            jpg_b64 = base64.b64encode(buffer).decode('utf-8')
            
            # Detect hands with image dimensions
            results = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            hands_data = []
            if results.multi_hand_landmarks:
                for idx, landmarks in enumerate(results.multi_hand_landmarks):
                    handedness = results.multi_handedness[idx].classification[0].label
                    # Convert connections to list of lists
                    connections = [[conn[0], conn[1]] for conn in mp_hands.HAND_CONNECTIONS]
                    hands_data.append({
                        'handedness': handedness,
                        'landmarks': [[lm.x * w, lm.y * h, lm.z] for lm in landmarks.landmark],
                        'connections': connections
                    })
            
            # Send combined data
            ws.send(json.dumps({
                'frame': jpg_b64,
                'hands': hands_data,
                'image_size': {'width': w, 'height': h}
            }))
            
            eventlet.sleep(0.033)
    finally:
        cap.release()

def combined_app(environ, start_response):
    path = environ['PATH_INFO']
    if path == '/ws':
        return handle_websocket(environ, start_response)
    return app(environ, start_response)

if __name__ == '__main__':
    wsgi.server(eventlet.listen(('0.0.0.0', 6969)), combined_app)