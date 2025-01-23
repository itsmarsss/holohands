import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request
from flask_socketio import SocketIO
import webbrowser
import cv2
import mediapipe as mp
from threading import Timer

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# MediaPipe Hands setup
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

def send_hand_data(data):
    """Send data to all connected clients"""
    socketio.emit('hand_data', data)

def video_processing():
    """Main processing loop"""
    cap = cv2.VideoCapture(0)
    while True:
        success, frame = cap.read()
        if not success:
            continue
        
        # Process frame
        frame = cv2.flip(frame, 1)
        image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(image)
        
        # Prepare data for streaming
        hands_data = []
        if results.multi_hand_landmarks:
            for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                handedness = results.multi_handedness[idx].classification[0].label
                landmarks = [[lm.x, lm.y, lm.z] for lm in hand_landmarks.landmark]
                
                # Convert frozenset to list of lists
                connections = [[conn[0], conn[1]] for conn in mp_hands.HAND_CONNECTIONS]
                
                hands_data.append({
                    'handedness': handedness,
                    'landmarks': landmarks,
                    'connections': connections  # Now serializable
                })
        
        # Stream data to clients
        if hands_data:
            try:
                send_hand_data(hands_data)
            except Exception as e:
                print("Stream error:", e)
        
        print(hands_data)
        
        eventlet.sleep(0.001)  # Yield to other threads

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    print('Client connected:', request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected:', request.sid)

def start_processing():
    """Start video processing in eventlet thread"""
    socketio.start_background_task(video_processing)

if __name__ == '__main__':
    # Start processing when server starts
    Timer(1, start_processing).start()
    
    # Open browser automatically
    webbrowser.open('http://localhost:6969')
    
    # Start server
    socketio.run(app, host='0.0.0.0', port=6969, debug=False)