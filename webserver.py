import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify
import cv2
import mediapipe as mp
import numpy as np
import base64
import json
from eventlet import wsgi
from eventlet.websocket import WebSocketWSGI
from io import BytesIO
from PIL import Image
from scipy.spatial.distance import cosine

app = Flask(__name__)

# MediaPipe setup
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.75,
    min_tracking_confidence=0.75
)

# Store hand symbols
hand_symbols = []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/save_handsymbol', methods=['POST'])
def save_handsymbol():
    data = request.json
    name = data['name']
    handedness = data['handedness']
    landmarks = data['landmarks']

    # Normalize points in reference to the WRIST position (index 0)
    wrist = landmarks[0]
    normalized_landmarks = [(lm[0] - wrist[0], lm[1] - wrist[1], lm[2] - wrist[2]) for lm in landmarks]

    # Rotate landmarks to a consistent orientation
    middle_finger_mcp = normalized_landmarks[9]
    angle = np.arctan2(middle_finger_mcp[1], middle_finger_mcp[0])
    rotation_matrix = np.array([
        [np.cos(-angle), -np.sin(-angle)],
        [np.sin(-angle), np.cos(-angle)]
    ])
    rotated_landmarks = [(np.dot(rotation_matrix, [lm[0], lm[1]]).tolist() + [lm[2]]) for lm in normalized_landmarks]

    # Flatten the normalized points into a 1-D array
    flattened_landmarks = [coord for lm in rotated_landmarks for coord in lm]

    # Store the normalized points in a 21 dimension vector
    hand_symbols.append({
        'name': name,
        'handedness': handedness,
        'landmarks': flattened_landmarks
    })

    return jsonify({'status': 'success'})

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
                    hand_landmarks = [[lm.x * w, lm.y * h, lm.z] for lm in landmarks.landmark]

                    # Normalize points in reference to the WRIST position (index 0)
                    wrist = hand_landmarks[0]
                    normalized_landmarks = [(lm[0] - wrist[0], lm[1] - wrist[1], lm[2] - wrist[2]) for lm in hand_landmarks]

                    # Rotate landmarks to a consistent orientation
                    middle_finger_mcp = normalized_landmarks[9]
                    angle = np.arctan2(middle_finger_mcp[1], middle_finger_mcp[0])
                    rotation_matrix = np.array([
                        [np.cos(-angle), -np.sin(-angle)],
                        [np.sin(-angle), np.cos(-angle)]
                    ])
                    rotated_landmarks = [(np.dot(rotation_matrix, [lm[0], lm[1]]).tolist() + [lm[2]]) for lm in normalized_landmarks]

                    # Flatten the normalized points into a 1-D array
                    flattened_landmarks = [coord for lm in rotated_landmarks for coord in lm]

                    # Check for matching symbols using cosine similarity
                    similarities = []
                    for symbol in hand_symbols:
                        if symbol['handedness'] == handedness:
                            similarity = 1 - cosine(flattened_landmarks, symbol['landmarks'])
                            similarities.append((symbol['name'], similarity))

                    # Sort similarities from highest to least
                    similarities.sort(key=lambda x: x[1], reverse=True)

                    hands_data.append({
                        'handedness': handedness,
                        'landmarks': hand_landmarks,
                        'connections': connections,
                        'detected_symbols': similarities
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