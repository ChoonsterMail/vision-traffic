/**
 * VisionTraffic - Frontend Application
 * =====================================
 * Handles:
 *   - Drag & drop file upload
 *   - Upload progress via XMLHttpRequest
 *   - Processing status polling
 *   - Results rendering (charts, tables, video)
 *   - UI state transitions
 */

(function () {
    'use strict';

    // ── Vehicle color mapping (matches backend) ───────────
    const VEHICLE_COLORS = {
        'Ô tô': '#10b981',
        'Xe máy': '#3b82f6',
        'Xe bus': '#f59e0b',
        'Xe tải': '#ef4444',
        'Xe đạp': '#8b5cf6',
    };

    const VEHICLE_EMOJIS = {
        'Ô tô': '🚗',
        'Xe máy': '🏍️',
        'Xe bus': '🚌',
        'Xe tải': '🚛',
        'Xe đạp': '🚲',
    };

    // ── Application State ─────────────────────────────────
    const state = {
        currentStep: 'upload',   // upload | processing | results
        selectedFile: null,
        taskId: null,
        pollTimer: null,
    };

    // ── DOM Element Cache ─────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const el = {
        // Sections
        uploadSection: null,
        processingSection: null,
        resultsSection: null,

        // Upload
        dropZone: null,
        fileInput: null,
        filePreview: null,
        fileName: null,
        fileSize: null,
        removeFileBtn: null,
        startAnalysisBtn: null,
        uploadProgressContainer: null,
        uploadProgressFill: null,
        uploadProgressText: null,
        uploadError: null,
        errorText: null,

        // Processing
        processingProgress: null,
        progressPercent: null,
        processingStatus: null,

        // Results
        newAnalysisBtn: null,
        resultVideo: null,
        barChartCanvas: null,
        pieChartCanvas: null,
        pieLegend: null,
        confidenceBars: null,
        detectionTbody: null,
    };


    // ═══════════════════════════════════════════════════════
    // Initialization
    // ═══════════════════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        cacheElements();
        bindEvents();
        console.log('[VisionTraffic] App initialized.');
    }

    function cacheElements() {
        el.uploadSection = $('#upload-section');
        el.processingSection = $('#processing-section');
        el.resultsSection = $('#results-section');

        el.dropZone = $('#drop-zone');
        el.fileInput = $('#file-input');
        el.filePreview = $('#file-preview');
        el.fileName = $('#file-name');
        el.fileSize = $('#file-size');
        el.removeFileBtn = $('#remove-file');
        el.startAnalysisBtn = $('#start-analysis');
        el.uploadProgressContainer = $('#upload-progress-container');
        el.uploadProgressFill = $('#upload-progress-fill');
        el.uploadProgressText = $('#upload-progress-text');
        el.uploadError = $('#upload-error');
        el.errorText = $('#error-text');

        el.processingProgress = $('#processing-progress');
        el.progressPercent = $('#progress-percent');
        el.processingStatus = $('#processing-status');

        el.newAnalysisBtn = $('#new-analysis');
        el.resultVideo = $('#result-video');
        el.barChartCanvas = $('#bar-chart');
        el.pieChartCanvas = $('#pie-chart');
        el.pieLegend = $('#pie-legend');
        el.confidenceBars = $('#confidence-bars');
        el.detectionTbody = $('#detection-tbody');
    }

    function bindEvents() {
        // Drag & Drop
        el.dropZone.addEventListener('dragover', handleDragOver);
        el.dropZone.addEventListener('dragleave', handleDragLeave);
        el.dropZone.addEventListener('drop', handleDrop);
        el.dropZone.addEventListener('click', () => el.fileInput.click());

        // File input
        el.fileInput.addEventListener('change', handleFileSelect);

        // Buttons
        el.removeFileBtn.addEventListener('click', handleRemoveFile);
        el.startAnalysisBtn.addEventListener('click', handleStartAnalysis);
        el.newAnalysisBtn.addEventListener('click', handleNewAnalysis);

        // Prevent browse button from bubbling to drop zone
        const browseBtn = $('#browse-btn');
        if (browseBtn) {
            browseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                el.fileInput.click();
            });
        }
    }


    // ═══════════════════════════════════════════════════════
    // Drag & Drop Handlers
    // ═══════════════════════════════════════════════════════

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        el.dropZone.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        el.dropZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        el.dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            selectFile(files[0]);
        }
    }

    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            selectFile(e.target.files[0]);
        }
    }


    // ═══════════════════════════════════════════════════════
    // File Selection
    // ═══════════════════════════════════════════════════════

    function selectFile(file) {
        hideError();

        // Validate file type
        const validTypes = [
            'video/mp4', 'video/avi', 'video/quicktime',
            'video/x-matroska', 'video/webm', 'video/x-ms-wmv',
            'video/x-flv', 'video/x-msvideo',
        ];

        const ext = file.name.split('.').pop().toLowerCase();
        const validExts = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'];

        if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
            showError('Định dạng file không hỗ trợ. Vui lòng chọn MP4, AVI, MOV, MKV hoặc WebM.');
            return;
        }

        // Validate file size (500 MB)
        if (file.size > 500 * 1024 * 1024) {
            showError('File quá lớn. Giới hạn tối đa là 500MB.');
            return;
        }

        state.selectedFile = file;

        // Update UI
        el.fileName.textContent = file.name;
        el.fileSize.textContent = formatFileSize(file.size);
        el.filePreview.classList.remove('hidden');
        el.dropZone.style.display = 'none';
        el.uploadProgressContainer.classList.add('hidden');
        el.startAnalysisBtn.disabled = false;
        el.startAnalysisBtn.innerHTML = '<span class="btn-icon">🔍</span> Bắt đầu phân tích';
    }

    function handleRemoveFile(e) {
        e.stopPropagation();
        state.selectedFile = null;
        el.fileInput.value = '';
        el.filePreview.classList.add('hidden');
        el.dropZone.style.display = '';
        hideError();
    }


    // ═══════════════════════════════════════════════════════
    // Upload & Analysis
    // ═══════════════════════════════════════════════════════

    function handleStartAnalysis() {
        if (!state.selectedFile) return;

        const file = state.selectedFile;

        // Show upload progress
        el.uploadProgressContainer.classList.remove('hidden');
        el.startAnalysisBtn.disabled = true;
        el.startAnalysisBtn.innerHTML = '<span class="btn-icon">⏳</span> Đang tải lên...';
        el.removeFileBtn.style.display = 'none';
        hideError();

        // Upload via XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('video', file);

        // Upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                el.uploadProgressFill.style.width = pct + '%';
                el.uploadProgressText.textContent = pct + '%';
            }
        });

        // Upload complete
        xhr.addEventListener('load', () => {
            if (xhr.status === 202) {
                const data = JSON.parse(xhr.responseText);
                state.taskId = data.task_id;
                console.log('[VisionTraffic] Upload OK. Task ID:', data.task_id);

                // Transition to processing
                showSection('processing');
                startPolling();
            } else {
                let errMsg = 'Lỗi khi tải video lên server.';
                try {
                    const errData = JSON.parse(xhr.responseText);
                    errMsg = errData.error || errMsg;
                } catch (_) {}
                showError(errMsg);
                resetUploadUI();
            }
        });

        // Network error
        xhr.addEventListener('error', () => {
            showError('Lỗi kết nối. Vui lòng kiểm tra server đang chạy (http://localhost:5001).');
            resetUploadUI();
        });

        xhr.addEventListener('abort', () => {
            showError('Upload đã bị hủy.');
            resetUploadUI();
        });

        xhr.open('POST', '/api/upload');
        xhr.send(formData);
    }

    function resetUploadUI() {
        el.startAnalysisBtn.disabled = false;
        el.startAnalysisBtn.innerHTML = '<span class="btn-icon">🔍</span> Bắt đầu phân tích';
        el.removeFileBtn.style.display = '';
        el.uploadProgressContainer.classList.add('hidden');
        el.uploadProgressFill.style.width = '0%';
        el.uploadProgressText.textContent = '0%';
    }


    // ═══════════════════════════════════════════════════════
    // Processing Status Polling
    // ═══════════════════════════════════════════════════════

    function startPolling() {
        if (state.pollTimer) clearInterval(state.pollTimer);

        state.pollTimer = setInterval(pollStatus, 1000);
    }

    function stopPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    async function pollStatus() {
        if (!state.taskId) return;

        try {
            const res = await fetch(`/api/status/${state.taskId}`);
            const data = await res.json();

            if (data.status === 'processing' || data.status === 'queued') {
                updateProcessingUI(data.progress || 0);
            } else if (data.status === 'completed') {
                stopPolling();
                updateProcessingUI(100);

                // Small delay for smooth transition
                setTimeout(() => fetchResults(), 600);
            } else if (data.status === 'error') {
                stopPolling();
                showSection('upload');
                showError(data.error || 'Đã xảy ra lỗi khi xử lý video.');
                resetUploadUI();
            }
        } catch (err) {
            console.error('[VisionTraffic] Poll error:', err);
        }
    }

    function updateProcessingUI(progress) {
        el.processingProgress.style.width = progress + '%';
        el.progressPercent.textContent = Math.round(progress) + '%';

        // Update status text and steps
        const stepInit = $('#step-init');
        const stepDetect = $('#step-detect');
        const stepAnnotate = $('#step-annotate');
        const stepExport = $('#step-export');

        if (progress < 5) {
            el.processingStatus.textContent = 'Đang khởi tạo mô hình AI...';
            setStepState(stepInit, 'active');
        } else if (progress < 30) {
            el.processingStatus.textContent = 'Đang phân tích các khung hình...';
            setStepState(stepInit, 'completed');
            setStepState(stepDetect, 'active');
        } else if (progress < 85) {
            el.processingStatus.textContent = 'Đang nhận dạng và chú thích phương tiện...';
            setStepState(stepInit, 'completed');
            setStepState(stepDetect, 'completed');
            setStepState(stepAnnotate, 'active');
        } else if (progress < 100) {
            el.processingStatus.textContent = 'Đang xuất video kết quả...';
            setStepState(stepInit, 'completed');
            setStepState(stepDetect, 'completed');
            setStepState(stepAnnotate, 'completed');
            setStepState(stepExport, 'active');
        } else {
            el.processingStatus.textContent = 'Hoàn tất! Đang tải kết quả...';
            setStepState(stepInit, 'completed');
            setStepState(stepDetect, 'completed');
            setStepState(stepAnnotate, 'completed');
            setStepState(stepExport, 'completed');
        }
    }

    function setStepState(stepEl, state) {
        if (!stepEl) return;
        stepEl.classList.remove('active', 'completed');
        if (state) stepEl.classList.add(state);
    }


    // ═══════════════════════════════════════════════════════
    // Results
    // ═══════════════════════════════════════════════════════

    async function fetchResults() {
        try {
            const res = await fetch(`/api/results/${state.taskId}`);
            const stats = await res.json();

            console.log('[VisionTraffic] Results:', stats);
            renderResults(stats);
            showSection('results');
        } catch (err) {
            console.error('[VisionTraffic] Results error:', err);
            showSection('upload');
            showError('Không thể tải kết quả. Vui lòng thử lại.');
            resetUploadUI();
        }
    }

    function renderResults(stats) {
        // ── Video Player ──────────────────────────────────
        const videoSrc = `/api/video/${state.taskId}`;
        el.resultVideo.src = videoSrc;
        const source = el.resultVideo.querySelector('source');
        if (source) source.src = videoSrc;
        el.resultVideo.load();

        // ── Summary Stats ─────────────────────────────────
        animateCounter($('#stat-total-detections'), stats.total_detections);
        animateCounter($('#stat-vehicle-types'), stats.vehicle_types_detected);
        $('#stat-duration').textContent = formatDuration(stats.duration);
        $('#stat-resolution').textContent = stats.resolution || '-';

        // ── Bar Chart ─────────────────────────────────────
        renderBarChart(el.barChartCanvas, stats.vehicle_counts);

        // ── Pie Chart ─────────────────────────────────────
        renderPieChart(el.pieChartCanvas, el.pieLegend, stats.vehicle_counts);

        // ── Confidence Bars ───────────────────────────────
        renderConfidenceBars(el.confidenceBars, stats.confidence_avg);

        // ── Detection Table ───────────────────────────────
        renderDetectionTable(el.detectionTbody, stats.vehicle_counts,
            stats.confidence_avg, stats.total_detections);
    }


    // ═══════════════════════════════════════════════════════
    // Chart: Bar Chart (Canvas)
    // ═══════════════════════════════════════════════════════

    function renderBarChart(canvas, vehicleCounts) {
        if (!canvas || !vehicleCounts) return;

        const entries = Object.entries(vehicleCounts).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Size
        const rect = canvas.parentElement.getBoundingClientRect();
        const W = rect.width;
        const H = Math.max(entries.length * 52 + 40, 200);

        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.scale(dpr, dpr);

        // Layout
        const labelWidth = 75;
        const valueWidth = 65;
        const padding = { top: 15, right: valueWidth + 15, bottom: 15, left: labelWidth + 10 };
        const chartW = W - padding.left - padding.right;
        const barHeight = 24;
        const barGap = 28;
        const maxVal = Math.max(...entries.map(e => e[1]));

        // Clear
        ctx.clearRect(0, 0, W, H);

        entries.forEach(([name, count], i) => {
            const y = padding.top + i * (barHeight + barGap);
            const barW = maxVal > 0 ? (count / maxVal) * chartW : 0;
            const color = VEHICLE_COLORS[name] || '#00d4ff';

            // Label
            ctx.fillStyle = '#8892a8';
            ctx.font = '500 13px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(name, padding.left - 10, y + barHeight / 2);

            // Bar background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            roundRect(ctx, padding.left, y, chartW, barHeight, 6);
            ctx.fill();

            // Bar fill with gradient
            if (barW > 0) {
                const grad = ctx.createLinearGradient(padding.left, 0, padding.left + barW, 0);
                grad.addColorStop(0, color);
                grad.addColorStop(1, adjustColorOpacity(color, 0.6));
                ctx.fillStyle = grad;
                roundRect(ctx, padding.left, y, Math.max(barW, 8), barHeight, 6);
                ctx.fill();
            }

            // Value
            ctx.fillStyle = color;
            ctx.font = '700 13px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(count.toLocaleString(), padding.left + chartW + 10, y + barHeight / 2);
        });
    }


    // ═══════════════════════════════════════════════════════
    // Chart: Pie Chart (Canvas)
    // ═══════════════════════════════════════════════════════

    function renderPieChart(canvas, legendEl, vehicleCounts) {
        if (!canvas || !vehicleCounts) return;

        const entries = Object.entries(vehicleCounts).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) return;

        const total = entries.reduce((sum, e) => sum + e[1], 0);
        if (total === 0) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        const size = 220;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        ctx.scale(dpr, dpr);

        const cx = size / 2;
        const cy = size / 2;
        const radius = (size / 2) - 10;
        const innerRadius = radius * 0.55; // Donut chart

        ctx.clearRect(0, 0, size, size);

        let startAngle = -Math.PI / 2;

        entries.forEach(([name, count]) => {
            const sliceAngle = (count / total) * Math.PI * 2;
            const endAngle = startAngle + sliceAngle;
            const color = VEHICLE_COLORS[name] || '#00d4ff';

            // Draw slice
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, endAngle);
            ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            // Gap between slices
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, endAngle);
            ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
            ctx.closePath();
            ctx.strokeStyle = '#060611';
            ctx.lineWidth = 2;
            ctx.stroke();

            startAngle = endAngle;
        });

        // Center text
        ctx.fillStyle = '#e8ecf4';
        ctx.font = '800 22px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total.toLocaleString(), cx, cy - 8);

        ctx.fillStyle = '#5a6478';
        ctx.font = '500 11px Inter, sans-serif';
        ctx.fillText('phát hiện', cx, cy + 12);

        // Legend
        if (legendEl) {
            legendEl.innerHTML = entries.map(([name, count]) => {
                const pct = ((count / total) * 100).toFixed(1);
                const color = VEHICLE_COLORS[name] || '#00d4ff';
                return `
                    <div class="pie-legend-item">
                        <span class="pie-legend-color" style="background:${color}"></span>
                        <span>${name} (${pct}%)</span>
                    </div>
                `;
            }).join('');
        }
    }


    // ═══════════════════════════════════════════════════════
    // Confidence Bars
    // ═══════════════════════════════════════════════════════

    function renderConfidenceBars(container, confidenceAvg) {
        if (!container || !confidenceAvg) return;

        const entries = Object.entries(confidenceAvg).sort((a, b) => b[1] - a[1]);

        container.innerHTML = entries.map(([name, value]) => {
            const color = VEHICLE_COLORS[name] || '#00d4ff';
            return `
                <div class="confidence-item">
                    <div class="confidence-header">
                        <span class="confidence-name">
                            ${VEHICLE_EMOJIS[name] || '🚗'} ${name}
                        </span>
                        <span class="confidence-value" style="color:${color}">
                            ${value}%
                        </span>
                    </div>
                    <div class="confidence-bar-track">
                        <div class="confidence-bar-fill"
                             style="width:0%; background:${color};"
                             data-target-width="${value}%">
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Animate bars after render
        requestAnimationFrame(() => {
            setTimeout(() => {
                container.querySelectorAll('.confidence-bar-fill').forEach(bar => {
                    bar.style.width = bar.dataset.targetWidth;
                });
            }, 100);
        });
    }


    // ═══════════════════════════════════════════════════════
    // Detection Table
    // ═══════════════════════════════════════════════════════

    function renderDetectionTable(tbody, vehicleCounts, confidenceAvg, totalDetections) {
        if (!tbody || !vehicleCounts) return;

        const entries = Object.entries(vehicleCounts).sort((a, b) => b[1] - a[1]);
        const maxCount = entries.length > 0 ? entries[0][1] : 1;

        tbody.innerHTML = entries.map(([name, count]) => {
            const pct = totalDetections > 0
                ? ((count / totalDetections) * 100).toFixed(1)
                : '0';
            const conf = confidenceAvg[name] ? confidenceAvg[name] + '%' : '-';
            const color = VEHICLE_COLORS[name] || '#00d4ff';
            const barWidth = ((count / maxCount) * 100).toFixed(0);

            return `
                <tr>
                    <td>
                        <span class="table-vehicle-name">
                            <span class="table-color-dot" style="background:${color}"></span>
                            ${VEHICLE_EMOJIS[name] || ''} ${name}
                        </span>
                    </td>
                    <td>
                        <div class="table-bar-cell">
                            <span>${count.toLocaleString()}</span>
                            <div class="table-mini-bar">
                                <div class="table-mini-bar-fill"
                                     style="width:${barWidth}%; background:${color};"></div>
                            </div>
                        </div>
                    </td>
                    <td>${pct}%</td>
                    <td style="color:${color}; font-weight:600">${conf}</td>
                </tr>
            `;
        }).join('');
    }


    // ═══════════════════════════════════════════════════════
    // UI State Management
    // ═══════════════════════════════════════════════════════

    function showSection(name) {
        state.currentStep = name;

        // Hide all sections
        el.uploadSection.classList.remove('active');
        el.uploadSection.classList.add('hidden');
        el.processingSection.classList.remove('active');
        el.processingSection.classList.add('hidden');
        el.resultsSection.classList.remove('active');
        el.resultsSection.classList.add('hidden');

        // Show target section
        const target = {
            upload: el.uploadSection,
            processing: el.processingSection,
            results: el.resultsSection,
        }[name];

        if (target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function handleNewAnalysis() {
        stopPolling();

        state.selectedFile = null;
        state.taskId = null;

        // Reset upload UI
        el.fileInput.value = '';
        el.filePreview.classList.add('hidden');
        el.dropZone.style.display = '';
        resetUploadUI();
        hideError();

        // Reset processing UI
        el.processingProgress.style.width = '0%';
        el.progressPercent.textContent = '0%';
        el.processingStatus.textContent = 'Đang khởi tạo mô hình AI';

        // Reset step indicators
        $$('.step').forEach(s => {
            s.classList.remove('active', 'completed');
        });
        const stepInit = $('#step-init');
        if (stepInit) stepInit.classList.add('active');

        showSection('upload');
    }


    // ═══════════════════════════════════════════════════════
    // Utility Functions
    // ═══════════════════════════════════════════════════════

    function showError(msg) {
        el.errorText.textContent = msg;
        el.uploadError.classList.remove('hidden');
    }

    function hideError() {
        el.uploadError.classList.add('hidden');
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
    }

    function formatDuration(seconds) {
        if (!seconds || seconds <= 0) return '0s';
        if (seconds < 60) return Math.round(seconds) + 's';
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        return `${m}m ${s}s`;
    }

    function animateCounter(element, target) {
        if (!element) return;

        const duration = 1200;
        const start = performance.now();
        const numTarget = typeof target === 'number' ? target : parseInt(target);

        if (isNaN(numTarget)) {
            element.textContent = target;
            return;
        }

        function update(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(numTarget * eased);

            element.textContent = current.toLocaleString();

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    /**
     * Draw a rounded rectangle path on the canvas.
     */
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /**
     * Adjust a hex color's opacity (returns rgba string).
     */
    function adjustColorOpacity(hex, opacity) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

})();
