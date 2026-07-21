# 🚗 VisionTraffic - Hệ Thống AI Nhận Dạng Phương Tiện Giao Thông

![YOLOv8](https://img.shields.io/badge/YOLOv8-8.2.0-blue?style=for-the-badge&logo=yolo)
![Flask](https://img.shields.io/badge/Flask-3.0.0-black?style=for-the-badge&logo=flask)
![OpenCV](https://img.shields.io/badge/OpenCV-4.8.0-green?style=for-the-badge&logo=opencv)

**VisionTraffic** là một hệ thống ứng dụng web chuyên nghiệp tích hợp Trí Tuệ Nhân Tạo (Thị giác máy tính) để tự động phát hiện, phân loại và thống kê các phương tiện giao thông từ bất kỳ đoạn video nào do người dùng tải lên.

---

## 🌟 Các Tính Năng Nổi Bật

- 🎯 **Nhận diện chính xác 5 loại phương tiện:** Hỗ trợ nhận diện Ô tô (Car), Xe máy (Motorcycle), Xe bus (Bus), Xe tải (Truck), và Xe đạp (Bicycle) với độ chuẩn xác cực cao dựa trên model COCO pretrained.
- 🎨 **Giao diện Web siêu đẹp (Premium UI):** Thiết kế Dark Theme hiện đại, hiệu ứng kính mờ (Glassmorphism), có hỗ trợ kéo - thả (Drag & Drop) video trực quan.
- 📊 **Dashboard Thống Kê Chi Tiết:** Trực quan hoá kết quả bằng biểu đồ HTML5 Canvas (Biểu đồ cột, biểu đồ tròn, bảng chi tiết độ tin cậy) mà không phụ thuộc vào thư viện ngoài.
- ⚡ **Xử Lý Bất Đồng Bộ:** Xử lý video ngầm ở server giúp giao diện web luôn mượt mà, hiển thị thanh tiến độ (Progress bar) theo thời gian thực (Real-time).
- 📹 **Tích hợp HUD trên Video:** Vẽ viền (Bounding Box) cách điệu hiện đại và bảng thống kê overlay trực tiếp lên góc trái của video kết quả.

## 🛠️ Công Nghệ Sử Dụng

- **Trí Tuệ Nhân Tạo / Computer Vision:** YOLOv8 (Ultralytics), OpenCV, NumPy.
- **Backend:** Python 3, Flask REST API.
- **Frontend:** HTML5, Vanilla CSS3 (Custom Properties, Flexbox/Grid, Animations), Vanilla JavaScript (XHR, Canvas API).

## 🚀 Hướng Dẫn Cài Đặt Và Chạy Local

### 1. Yêu cầu hệ thống
- Cài đặt sẵn Python 3.10 trở lên.
- Cài đặt `ffmpeg` (tùy chọn, để hỗ trợ tốt nhất việc render video chuẩn H.264 trên trình duyệt).

### 2. Cài đặt môi trường
Clone mã nguồn về máy:
```bash
git clone https://github.com/ChoonsterMail/vision-traffic.git
cd vision-traffic
```

Cài đặt các thư viện cần thiết:
```bash
pip install -r requirements.txt
```

### 3. Khởi chạy ứng dụng
Chạy server Flask:
```bash
python app.py
```

Truy cập vào ứng dụng qua trình duyệt tại: **http://localhost:5001**

## 📂 Cấu Trúc Thư Mục
```text
vision-traffic/
│
├── app.py                 # File chạy chính của server Flask
├── detector.py            # Lõi AI xử lý và phân tích video với YOLOv8
├── requirements.txt       # Danh sách thư viện Python
├── .gitignore             # File loại trừ git
│
├── static/
│   ├── css/style.css      # Mã nguồn CSS giao diện (Dark Theme)
│   └── js/app.js          # Xử lý logic Frontend & render biểu đồ
│
└── templates/
    └── index.html         # Khung HTML giao diện ứng dụng
```

## 📝 Giấy phép (License)
Dự án được xây dựng với mục đích học tập và nghiên cứu AI ứng dụng.
