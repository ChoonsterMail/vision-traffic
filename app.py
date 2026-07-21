"""
Flask API Server for Vehicle Detection System
==============================================
Provides REST API endpoints for:
  - Video upload
  - Async processing with progress tracking
  - Results retrieval (statistics + annotated video)
"""

import os
import uuid
import threading
import json
from pathlib import Path

from flask import (
    Flask, request, jsonify, render_template,
    send_file, Response
)

from detector import VehicleDetector


# ============================================================
# App Configuration
# ============================================================
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 MB
app.config['UPLOAD_FOLDER'] = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'uploads'
)
app.config['RESULTS_FOLDER'] = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'results'
)

# Create storage directories
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['RESULTS_FOLDER'], exist_ok=True)

# Allowed video file extensions
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'}

# In-memory task registry (task_id → task_info)
tasks = {}

# Initialize the detector once (model loaded at startup)
print("[Server] Initializing VehicleDetector...")
detector = VehicleDetector(model_name='yolov8n.pt', confidence=0.4)
print("[Server] VehicleDetector ready.")


# ============================================================
# Helper Functions
# ============================================================

def allowed_file(filename):
    """Check if the uploaded file has an allowed extension."""
    return (
        '.' in filename and
        filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def process_video_task(task_id, input_path, output_path, stats_path):
    """
    Background task: process video through the detector.
    Updates the task's status and progress in-place.
    """
    try:
        tasks[task_id]['status'] = 'processing'

        def progress_callback(progress):
            tasks[task_id]['progress'] = round(progress, 1)

        stats = detector.process_video(
            input_path, output_path, stats_path,
            progress_callback=progress_callback
        )

        tasks[task_id]['status'] = 'completed'
        tasks[task_id]['progress'] = 100
        tasks[task_id]['stats'] = stats

    except Exception as e:
        print(f"[Server] Task {task_id} failed: {e}")
        tasks[task_id]['status'] = 'error'
        tasks[task_id]['error'] = str(e)


# ============================================================
# Routes
# ============================================================

@app.route('/')
def index():
    """Serve the main web application page."""
    return render_template('index.html')


@app.route('/api/upload', methods=['POST'])
def upload_video():
    """
    Upload a video file for vehicle detection.

    Expects multipart form data with a 'video' file field.
    Returns a task_id for tracking processing progress.
    """
    # Validate request
    if 'video' not in request.files:
        return jsonify({'error': 'Không tìm thấy file video'}), 400

    file = request.files['video']

    if file.filename == '':
        return jsonify({'error': 'Chưa chọn file'}), 400

    if not allowed_file(file.filename):
        return jsonify({
            'error': f'Định dạng file không hỗ trợ. '
                     f'Vui lòng sử dụng: {", ".join(ALLOWED_EXTENSIONS)}'
        }), 400

    # Generate unique task ID
    task_id = str(uuid.uuid4())
    ext = file.filename.rsplit('.', 1)[1].lower()

    # File paths
    input_path = os.path.join(
        app.config['UPLOAD_FOLDER'], f'{task_id}.{ext}'
    )
    output_path = os.path.join(
        app.config['RESULTS_FOLDER'], f'{task_id}_result.mp4'
    )
    stats_path = os.path.join(
        app.config['RESULTS_FOLDER'], f'{task_id}_stats.json'
    )

    # Save uploaded file
    file.save(input_path)
    file_size = os.path.getsize(input_path)

    print(f"[Server] Video uploaded: {file.filename} "
          f"({file_size / 1024 / 1024:.1f} MB) → Task {task_id}")

    # Register task
    tasks[task_id] = {
        'status': 'queued',
        'progress': 0,
        'input_path': input_path,
        'output_path': output_path,
        'stats_path': stats_path,
        'filename': file.filename,
        'file_size': file_size,
    }

    # Start background processing
    thread = threading.Thread(
        target=process_video_task,
        args=(task_id, input_path, output_path, stats_path),
        daemon=True,
    )
    thread.start()

    return jsonify({
        'task_id': task_id,
        'message': 'Video đã được tải lên. Đang xử lý...',
    }), 202


@app.route('/api/status/<task_id>')
def get_status(task_id):
    """
    Get the processing status of a task.

    Returns:
        - status: "queued" | "processing" | "completed" | "error"
        - progress: 0.0 - 100.0
        - error: error message (if status == "error")
    """
    if task_id not in tasks:
        return jsonify({'error': 'Không tìm thấy task'}), 404

    task = tasks[task_id]
    response = {
        'status': task['status'],
        'progress': task.get('progress', 0),
    }

    if task['status'] == 'error':
        response['error'] = task.get('error', 'Unknown error')

    return jsonify(response)


@app.route('/api/results/<task_id>')
def get_results(task_id):
    """
    Get the analysis results for a completed task.

    Returns comprehensive statistics including:
        - Vehicle counts by type
        - Average confidence scores
        - Timeline data (detections per second)
        - Video metadata
    """
    if task_id not in tasks:
        return jsonify({'error': 'Không tìm thấy task'}), 404

    task = tasks[task_id]

    if task['status'] != 'completed':
        return jsonify({
            'error': 'Quá trình xử lý chưa hoàn tất',
            'status': task['status'],
        }), 400

    # Return stats (either from memory or from JSON file)
    if 'stats' in task:
        return jsonify(task['stats'])
    else:
        try:
            with open(task['stats_path'], 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        except FileNotFoundError:
            return jsonify({'error': 'File kết quả không tồn tại'}), 404


@app.route('/api/video/<task_id>')
def get_video(task_id):
    """
    Stream the annotated result video.
    Supports HTTP Range requests for seeking in the video player.
    """
    if task_id not in tasks:
        return jsonify({'error': 'Không tìm thấy task'}), 404

    task = tasks[task_id]

    if task['status'] != 'completed':
        return jsonify({
            'error': 'Quá trình xử lý chưa hoàn tất'
        }), 400

    output_path = task['output_path']

    if not os.path.exists(output_path):
        return jsonify({'error': 'File video kết quả không tồn tại'}), 404

    return send_file(
        output_path,
        mimetype='video/mp4',
        as_attachment=False,
        conditional=True,
    )


@app.route('/api/health')
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'active_tasks': len(tasks),
        'model': 'yolov8n',
    })


# ============================================================
# Error Handlers
# ============================================================

@app.errorhandler(413)
def file_too_large(e):
    """Handle file size exceeded error."""
    return jsonify({
        'error': 'File quá lớn. Giới hạn tối đa là 500MB.'
    }), 413


@app.errorhandler(500)
def internal_error(e):
    """Handle internal server errors."""
    return jsonify({
        'error': 'Lỗi hệ thống. Vui lòng thử lại sau.'
    }), 500


# ============================================================
# Main Entry Point
# ============================================================

if __name__ == '__main__':
    print("=" * 55)
    print("  🚗 VisionTraffic - Vehicle Detection System")
    print("  📡 Server running at http://localhost:5001")
    print("=" * 55)

    app.run(
        debug=True,
        host='0.0.0.0',
        port=5001,
        use_reloader=False,   # Prevent double model loading
    )
