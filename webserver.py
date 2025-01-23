import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template
import cv2
import mediapipe as mp
import numpy as np
import base64
import json
from eventlet import wsgi
from eventlet.websocket import WebSocketWSGI
from io import BytesIO
from PIL import Image

app = Flask(__name__)

# MediaPipe setup
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
    try:
        while True:
            message = ws.wait()
            if message is None:
                break

            # Decode the base64 image
            image_data = base64.b64decode(message.split(",")[1])
            image = Image.open(BytesIO(image_data))
            frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

            # Process frame
            h, w = frame.shape[:2]
            results = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            hands_data = []
            if results.multi_hand_landmarks:
                for idx, landmarks in enumerate(results.multi_hand_landmarks):
                    handedness = results.multi_handedness[idx].classification[0].label
                    connections = [[conn[0], conn[1]] for conn in mp_hands.HAND_CONNECTIONS]
                    hands_data.append({
                        'handedness': handedness,
                        'landmarks': [[lm.x * w, lm.y * h, lm.z] for lm in landmarks.landmark],
                        'connections': connections
                    })

            # Send hand landmarks data
            ws.send(json.dumps({
                'hands': hands_data,
                'image_size': {'width': w, 'height': h}
            }))

    except Exception as e:
        print("WebSocket error:", str(e))

def combined_app(environ, start_response):
    path = environ['PATH_INFO']
    if path == '/ws':
        return handle_websocket(environ, start_response)
    return app(environ, start_response)

if __name__ == '__main__':
    wsgi.server(eventlet.listen(('0.0.0.0', 6969)), combined_app)