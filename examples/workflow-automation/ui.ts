/**
 * UI HTML and styling for the Workflow Automation App
 */

import type { AppState, Website, Workflow, WorkflowStep, PlaybackState } from "./types";

const PANEL_WIDTH = 350;

export function getControlPanelHtml(initialState: AppState): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Workflow Automation</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #eee;
            height: 100vh;
            overflow: hidden;
        }

        .app-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            width: ${PANEL_WIDTH}px;
        }

        /* Header */
        .header {
            background: #16213e;
            padding: 12px 15px;
            border-bottom: 1px solid #0f3460;
        }

        .header h1 {
            font-size: 16px;
            font-weight: 600;
            color: #e94560;
            margin-bottom: 10px;
        }

        /* Website Selector */
        .website-section {
            margin-bottom: 10px;
        }

        .website-section label {
            display: block;
            font-size: 11px;
            color: #888;
            margin-bottom: 4px;
        }

        .website-row {
            display: flex;
            gap: 6px;
        }

        .website-select {
            flex: 1;
            padding: 8px;
            border: 1px solid #0f3460;
            border-radius: 4px;
            background: #1a1a2e;
            color: #eee;
            font-size: 13px;
        }

        .btn {
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
        }

        .btn-small {
            padding: 6px 10px;
            font-size: 11px;
        }

        .btn-primary {
            background: #e94560;
            color: white;
        }

        .btn-primary:hover {
            background: #ff6b6b;
        }

        .btn-secondary {
            background: #0f3460;
            color: #eee;
        }

        .btn-secondary:hover {
            background: #1a4a7a;
        }

        .btn-success {
            background: #2ecc71;
            color: white;
        }

        .btn-success:hover {
            background: #27ae60;
        }

        .btn-warning {
            background: #f39c12;
            color: white;
        }

        .btn-warning:hover {
            background: #e67e22;
        }

        .btn-danger {
            background: #e74c3c;
            color: white;
        }

        .btn-danger:hover {
            background: #c0392b;
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Controls */
        .controls {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        .controls .btn {
            flex: 1;
            min-width: 70px;
        }

        /* Status Bar */
        .status-bar {
            padding: 8px 15px;
            background: #0f3460;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #666;
        }

        .status-indicator.idle { background: #666; }
        .status-indicator.recording { background: #e74c3c; animation: pulse 1s infinite; }
        .status-indicator.playing { background: #2ecc71; animation: pulse 1s infinite; }
        .status-indicator.paused { background: #f39c12; }
        .status-indicator.error { background: #e74c3c; }
        .status-indicator.waiting_user { background: #9b59b6; animation: pulse 0.5s infinite; }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* Main Content */
        .main-content {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
        }

        /* Section */
        .section {
            margin-bottom: 20px;
        }

        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .section-title {
            font-size: 13px;
            font-weight: 600;
            color: #e94560;
        }

        /* Steps List */
        .steps-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .step-item {
            background: #16213e;
            border: 1px solid #0f3460;
            border-radius: 6px;
            padding: 10px;
            position: relative;
        }

        .step-item.running {
            border-color: #2ecc71;
            box-shadow: 0 0 10px rgba(46, 204, 113, 0.3);
        }

        .step-item.success {
            border-color: #2ecc71;
            opacity: 0.8;
        }

        .step-item.error {
            border-color: #e74c3c;
            background: rgba(231, 76, 60, 0.1);
        }

        .step-number {
            position: absolute;
            top: -8px;
            left: -8px;
            width: 20px;
            height: 20px;
            background: #e94560;
            border-radius: 50%;
            font-size: 11px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .step-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 6px;
        }

        .step-action {
            font-size: 11px;
            font-weight: 600;
            color: #3498db;
            text-transform: uppercase;
        }

        .step-actions {
            display: flex;
            gap: 4px;
        }

        .step-actions button {
            padding: 2px 6px;
            font-size: 10px;
            background: transparent;
            border: 1px solid #0f3460;
            color: #888;
            border-radius: 3px;
            cursor: pointer;
        }

        .step-actions button:hover {
            border-color: #e94560;
            color: #e94560;
        }

        .step-description {
            font-size: 12px;
            color: #ccc;
            margin-bottom: 4px;
        }

        .step-selector {
            font-size: 10px;
            color: #666;
            font-family: monospace;
            word-break: break-all;
        }

        .step-value {
            font-size: 11px;
            color: #9b59b6;
            margin-top: 4px;
        }

        .step-value .variable {
            color: #f39c12;
            font-weight: 600;
        }

        .step-error {
            font-size: 10px;
            color: #e74c3c;
            margin-top: 6px;
            padding: 4px 6px;
            background: rgba(231, 76, 60, 0.1);
            border-radius: 3px;
        }

        /* Variables Section */
        .variables-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .variable-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .variable-name {
            font-size: 12px;
            color: #f39c12;
            font-weight: 600;
            min-width: 80px;
        }

        .variable-input {
            flex: 1;
            padding: 6px 8px;
            border: 1px solid #0f3460;
            border-radius: 4px;
            background: #1a1a2e;
            color: #eee;
            font-size: 12px;
        }

        /* Workflows Section */
        .workflow-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 10px;
            background: #16213e;
            border: 1px solid #0f3460;
            border-radius: 4px;
            margin-bottom: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .workflow-item:hover {
            border-color: #e94560;
        }

        .workflow-item.active {
            border-color: #2ecc71;
            background: rgba(46, 204, 113, 0.1);
        }

        .workflow-name {
            font-size: 12px;
            font-weight: 500;
        }

        .workflow-date {
            font-size: 10px;
            color: #666;
        }

        /* Modal */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: ${PANEL_WIDTH}px;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .modal {
            background: #16213e;
            border: 1px solid #0f3460;
            border-radius: 8px;
            padding: 20px;
            width: 320px;
            max-width: 95%;
            max-height: 80vh;
            overflow-y: auto;
        }

        .modal-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #e94560;
        }

        .modal-body {
            margin-bottom: 15px;
        }

        .modal-footer {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        .form-group {
            margin-bottom: 12px;
        }

        .form-group label {
            display: block;
            font-size: 11px;
            color: #888;
            margin-bottom: 4px;
        }

        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #0f3460;
            border-radius: 4px;
            background: #1a1a2e;
            color: #eee;
            font-size: 12px;
        }

        .form-group textarea {
            min-height: 60px;
            resize: vertical;
        }

        /* User Intervention Banner */
        .intervention-banner {
            background: linear-gradient(135deg, #9b59b6, #8e44ad);
            padding: 15px;
            text-align: center;
            animation: attention 1s infinite;
        }

        @keyframes attention {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
        }

        .intervention-banner h3 {
            font-size: 13px;
            margin-bottom: 8px;
        }

        .intervention-banner p {
            font-size: 11px;
            color: rgba(255,255,255,0.8);
            margin-bottom: 10px;
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 30px 20px;
            color: #666;
        }

        .empty-state-icon {
            font-size: 32px;
            margin-bottom: 10px;
        }

        .empty-state-text {
            font-size: 12px;
        }

        /* Progress Bar */
        .progress-bar {
            height: 4px;
            background: #0f3460;
            border-radius: 2px;
            overflow: hidden;
            margin-top: 8px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #e94560, #ff6b6b);
            transition: width 0.3s;
        }

        /* Hidden */
        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <div class="app-container">
        <!-- Header -->
        <div class="header">
            <h1>Workflow Automation</h1>

            <div class="website-section">
                <label>Website</label>
                <div class="website-row">
                    <select class="website-select" id="websiteSelect" onchange="handleWebsiteChange(this.value)">
                        <option value="">-- Select Website --</option>
                    </select>
                    <button class="btn btn-secondary btn-small" onclick="showAddWebsiteModal()">+</button>
                </div>
            </div>

            <div class="controls">
                <button class="btn btn-danger" id="recordBtn" onclick="toggleRecording()">
                    Record
                </button>
                <button class="btn btn-success" id="playBtn" onclick="togglePlayback()" disabled>
                    Play
                </button>
                <button class="btn btn-secondary" id="saveBtn" onclick="saveWorkflow()" disabled>
                    Save
                </button>
            </div>
        </div>

        <!-- Status Bar -->
        <div class="status-bar">
            <div class="status-indicator" id="statusIndicator"></div>
            <span id="statusText">Ready</span>
        </div>

        <!-- User Intervention Banner (hidden by default) -->
        <div class="intervention-banner hidden" id="interventionBanner">
            <h3>Manual Intervention Required</h3>
            <p id="interventionMessage">Please interact with the page to continue.</p>
            <button class="btn btn-primary" onclick="continueAfterIntervention()">Continue</button>
        </div>

        <!-- Main Content -->
        <div class="main-content">
            <!-- Steps Section -->
            <div class="section">
                <div class="section-header">
                    <span class="section-title">Steps</span>
                    <span id="stepCount" style="font-size: 11px; color: #666;">0 steps</span>
                </div>
                <div class="steps-list" id="stepsList">
                    <div class="empty-state" id="emptySteps">
                        <div class="empty-state-icon">📝</div>
                        <div class="empty-state-text">
                            No steps yet.<br>
                            Start recording to capture actions.
                        </div>
                    </div>
                </div>
            </div>

            <!-- Variables Section -->
            <div class="section" id="variablesSection">
                <div class="section-header">
                    <span class="section-title">Variables</span>
                </div>
                <div class="variables-list" id="variablesList">
                </div>
            </div>

            <!-- Saved Workflows Section -->
            <div class="section">
                <div class="section-header">
                    <span class="section-title">Saved Workflows</span>
                    <button class="btn btn-secondary btn-small" onclick="refreshWorkflows()">Refresh</button>
                </div>
                <div id="workflowsList">
                    <div class="empty-state" id="emptyWorkflows">
                        <div class="empty-state-text">No saved workflows</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Modals Container -->
    <div id="modalsContainer"></div>

    <script>
        // Ensure tronbun IPC is available (fallback initialization)
        if (typeof window.tronbun === 'undefined' && typeof __bunwebview_invoke !== 'undefined') {
            console.log('[UI] Initializing tronbun fallback...');
            window._bunwebview_pending = window._bunwebview_pending || {};
            window.tronbun = {
                invoke: function(channel, data) {
                    return new Promise(function(resolve, reject) {
                        var id = Math.random().toString(36).substring(2);
                        window._bunwebview_pending[id] = { resolve: resolve, reject: reject };
                        var request = JSON.stringify({
                            type: 'invoke',
                            channel: channel,
                            data: data,
                            id: id
                        });
                        console.log('[UI] Sending IPC request:', channel, id);
                        __bunwebview_invoke(id, request);
                        // Don't resolve here - wait for bunwebview_receive callback
                    });
                },
                send: function(channel, data) {
                    var request = JSON.stringify({
                        type: 'send',
                        channel: channel,
                        data: data
                    });
                    __bunwebview_invoke('', request);
                }
            };
            window.bunwebview_receive = function(message) {
                console.log('[UI] Received IPC message:', message);
                try {
                    var data = JSON.parse(message);
                    if (data.type === 'ipc:response' && data.id) {
                        var pending = window._bunwebview_pending && window._bunwebview_pending[data.id];
                        if (pending) {
                            delete window._bunwebview_pending[data.id];
                            pending.resolve(data.result);
                        }
                    } else if (data.type === 'ipc:error' && data.id) {
                        var pending = window._bunwebview_pending && window._bunwebview_pending[data.id];
                        if (pending) {
                            delete window._bunwebview_pending[data.id];
                            pending.reject(new Error(data.error));
                        }
                    }
                } catch (e) {
                    console.error('[UI] Failed to process IPC message:', e);
                }
            };
            console.log('[UI] tronbun fallback initialized');
        }

        // State
        let state = ${JSON.stringify(initialState)};

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[UI] DOM loaded, tronbun available:', typeof tronbun !== 'undefined');
            if (typeof tronbun === 'undefined') {
                console.error('[UI] tronbun is not defined! IPC will not work.');
                console.error('[UI] __bunwebview_invoke available:', typeof __bunwebview_invoke !== 'undefined');
            }
            updateUI();
        });

        // Update entire UI
        function updateUI() {
            updateWebsiteSelect();
            updateStepsList();
            updateVariablesList();
            updateWorkflowsList();
            updateStatus();
            updateButtons();
        }

        function updateWebsiteSelect() {
            const select = document.getElementById('websiteSelect');
            select.innerHTML = '<option value="">-- Select Website --</option>';
            state.websites.forEach(site => {
                const opt = document.createElement('option');
                opt.value = site.id;
                opt.textContent = site.name;
                if (state.currentWebsite?.id === site.id) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });
        }

        function updateStepsList() {
            const list = document.getElementById('stepsList');
            const empty = document.getElementById('emptySteps');
            const count = document.getElementById('stepCount');

            const steps = state.currentWorkflow?.steps || [];
            count.textContent = steps.length + ' step' + (steps.length !== 1 ? 's' : '');

            if (steps.length === 0) {
                empty.classList.remove('hidden');
                list.querySelectorAll('.step-item').forEach(el => el.remove());
                return;
            }

            empty.classList.add('hidden');

            // Clear existing steps
            list.querySelectorAll('.step-item').forEach(el => el.remove());

            steps.forEach((step, index) => {
                const item = document.createElement('div');
                item.className = 'step-item' + (step.status ? ' ' + step.status : '');
                item.innerHTML = \`
                    <div class="step-number">\${index + 1}</div>
                    <div class="step-header">
                        <span class="step-action">\${step.action}</span>
                        <div class="step-actions">
                            <button onclick="editStep('\${step.id}')" title="Edit">Edit</button>
                            <button onclick="retryStep('\${step.id}')" title="Retry">Retry</button>
                            <button onclick="deleteStep('\${step.id}')" title="Delete">Del</button>
                        </div>
                    </div>
                    <div class="step-description">\${escapeHtml(step.description)}</div>
                    \${step.selector ? '<div class="step-selector">' + escapeHtml(step.selector) + '</div>' : ''}
                    \${step.value ? '<div class="step-value">' + formatValue(step) + '</div>' : ''}
                    \${step.errorMessage ? '<div class="step-error">' + escapeHtml(step.errorMessage) + '</div>' : ''}
                \`;
                list.appendChild(item);
            });
        }

        function formatValue(step) {
            if (step.isVariable && step.variableName) {
                return '<span class="variable">{{' + step.variableName + '}}</span> = "' + escapeHtml(step.value || '') + '"';
            }
            return '"' + escapeHtml(step.value || '') + '"';
        }

        function updateVariablesList() {
            const list = document.getElementById('variablesList');
            const section = document.getElementById('variablesSection');
            const variables = state.currentWorkflow?.variables || {};
            const varNames = Object.keys(variables);

            if (varNames.length === 0) {
                section.classList.add('hidden');
                return;
            }

            section.classList.remove('hidden');
            list.innerHTML = '';

            varNames.forEach(name => {
                const item = document.createElement('div');
                item.className = 'variable-item';
                item.innerHTML = \`
                    <span class="variable-name">{{\${name}}}</span>
                    <input type="text" class="variable-input"
                           value="\${escapeHtml(state.variableValues[name] || variables[name] || '')}"
                           onchange="updateVariable('\${name}', this.value)" />
                \`;
                list.appendChild(item);
            });
        }

        function updateWorkflowsList() {
            const list = document.getElementById('workflowsList');
            const empty = document.getElementById('emptyWorkflows');

            if (state.workflows.length === 0) {
                empty.classList.remove('hidden');
                list.querySelectorAll('.workflow-item').forEach(el => el.remove());
                return;
            }

            empty.classList.add('hidden');
            list.querySelectorAll('.workflow-item').forEach(el => el.remove());

            state.workflows.forEach(wf => {
                const item = document.createElement('div');
                item.className = 'workflow-item' + (state.currentWorkflow?.id === wf.id ? ' active' : '');
                item.onclick = () => loadWorkflow(wf.id);
                item.innerHTML = \`
                    <div>
                        <div class="workflow-name">\${escapeHtml(wf.name)}</div>
                        <div class="workflow-date">\${formatDate(wf.updatedAt)}</div>
                    </div>
                    <button class="btn btn-danger btn-small" onclick="event.stopPropagation(); deleteWorkflow('\${wf.id}')">Del</button>
                \`;
                list.appendChild(item);
            });
        }

        function updateStatus() {
            const indicator = document.getElementById('statusIndicator');
            const text = document.getElementById('statusText');
            const banner = document.getElementById('interventionBanner');

            if (state.isRecording) {
                indicator.className = 'status-indicator recording';
                text.textContent = 'Recording... (' + state.recordedEvents.length + ' events)';
                banner.classList.add('hidden');
            } else if (state.playback.status === 'playing') {
                indicator.className = 'status-indicator playing';
                text.textContent = 'Playing step ' + (state.playback.currentStepIndex + 1) + '/' + state.playback.totalSteps;
                banner.classList.add('hidden');
            } else if (state.playback.status === 'paused') {
                indicator.className = 'status-indicator paused';
                text.textContent = 'Paused at step ' + (state.playback.currentStepIndex + 1);
                banner.classList.add('hidden');
            } else if (state.playback.status === 'waiting_user') {
                indicator.className = 'status-indicator waiting_user';
                text.textContent = 'Waiting for user...';
                banner.classList.remove('hidden');
                document.getElementById('interventionMessage').textContent =
                    state.playback.userPromptMessage || 'Please interact with the page to continue.';
            } else if (state.playback.status === 'error') {
                indicator.className = 'status-indicator error';
                text.textContent = 'Error: ' + (state.playback.errorMessage || 'Unknown error');
                banner.classList.add('hidden');
            } else if (state.playback.status === 'completed') {
                indicator.className = 'status-indicator idle';
                text.textContent = 'Workflow completed successfully!';
                banner.classList.add('hidden');
            } else {
                indicator.className = 'status-indicator idle';
                text.textContent = 'Ready';
                banner.classList.add('hidden');
            }
        }

        function updateButtons() {
            const recordBtn = document.getElementById('recordBtn');
            const playBtn = document.getElementById('playBtn');
            const saveBtn = document.getElementById('saveBtn');

            recordBtn.textContent = state.isRecording ? 'Stop' : 'Record';
            recordBtn.className = 'btn ' + (state.isRecording ? 'btn-warning' : 'btn-danger');
            recordBtn.disabled = !state.currentWebsite || state.playback.status === 'playing';

            const hasSteps = (state.currentWorkflow?.steps?.length || 0) > 0;
            playBtn.disabled = !hasSteps || state.isRecording;
            playBtn.textContent = state.playback.status === 'playing' ? 'Pause' :
                                  state.playback.status === 'paused' ? 'Resume' : 'Play';

            saveBtn.disabled = !hasSteps;
        }

        // Actions
        function toggleRecording() {
            tronbun.invoke(state.isRecording ? 'stop-recording' : 'start-recording');
        }

        function togglePlayback() {
            if (state.playback.status === 'playing') {
                tronbun.invoke('pause-playback');
            } else {
                tronbun.invoke('start-playback', { variables: state.variableValues });
            }
        }

        function continueAfterIntervention() {
            tronbun.invoke('continue-after-intervention');
        }

        function editStep(stepId) {
            const step = state.currentWorkflow?.steps?.find(s => s.id === stepId);
            if (!step) return;
            showEditStepModal(step);
        }

        function retryStep(stepId) {
            tronbun.invoke('retry-step', { stepId });
        }

        function deleteStep(stepId) {
            if (confirm('Delete this step?')) {
                tronbun.invoke('delete-step', { stepId });
            }
        }

        function updateVariable(name, value) {
            state.variableValues[name] = value;
            tronbun.invoke('update-variable', { name, value });
        }

        function saveWorkflow() {
            const name = prompt('Workflow name:', state.currentWorkflow?.name || 'My Workflow');
            if (name) {
                tronbun.invoke('save-workflow', { name });
            }
        }

        function loadWorkflow(workflowId) {
            tronbun.invoke('load-workflow', { workflowId });
        }

        function deleteWorkflow(workflowId) {
            if (confirm('Delete this workflow?')) {
                tronbun.invoke('delete-workflow', { workflowId });
            }
        }

        function refreshWorkflows() {
            tronbun.invoke('refresh-workflows');
        }

        // Website change handler (called from inline onchange)
        function handleWebsiteChange(websiteId) {
            console.log('[UI] handleWebsiteChange called with:', websiteId);
            console.log('[UI] tronbun available:', typeof tronbun !== 'undefined');
            if (typeof tronbun === 'undefined') {
                console.error('[UI] tronbun not available!');
                return;
            }
            tronbun.invoke('select-website', { websiteId })
                .then(result => {
                    console.log('[UI] select-website result:', result);
                    refreshState();
                })
                .catch(err => {
                    console.error('[UI] select-website error:', err);
                    refreshState();
                });
        }
        window.handleWebsiteChange = handleWebsiteChange;

        // Website management (also set up listener as backup)
        const websiteSelect = document.getElementById('websiteSelect');
        console.log('[UI] Setting up websiteSelect listener, element:', websiteSelect);
        if (websiteSelect) {
            websiteSelect.addEventListener('change', (e) => {
                const websiteId = e.target.value;
                console.log('[UI] Website dropdown changed, websiteId:', websiteId);
                console.log('[UI] tronbun available:', typeof tronbun !== 'undefined');
                if (typeof tronbun === 'undefined') {
                    console.error('[UI] tronbun not available, cannot invoke select-website');
                    return;
                }
                tronbun.invoke('select-website', { websiteId })
                    .then(result => {
                        console.log('[UI] select-website result:', result);
                        refreshState();
                    })
                    .catch(err => {
                        console.error('[UI] select-website error:', err);
                        refreshState();
                    });
            });
            console.log('[UI] websiteSelect listener attached successfully');
        } else {
            console.error('[UI] websiteSelect element not found!');
        }

        function showAddWebsiteModal() {
            showModal('Add Website', \`
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="newWebsiteName" placeholder="e.g., Google" />
                </div>
                <div class="form-group">
                    <label>URL</label>
                    <input type="text" id="newWebsiteUrl" placeholder="https://google.com" />
                </div>
                <div class="form-group">
                    <label>Username (optional)</label>
                    <input type="text" id="newWebsiteUsername" />
                </div>
                <div class="form-group">
                    <label>Password (optional)</label>
                    <input type="password" id="newWebsitePassword" />
                </div>
            \`, () => {
                const name = document.getElementById('newWebsiteName').value;
                const url = document.getElementById('newWebsiteUrl').value;
                const username = document.getElementById('newWebsiteUsername').value;
                const password = document.getElementById('newWebsitePassword').value;

                if (name && url) {
                    console.log('[UI] Invoking add-website:', name, url);
                    hideModal();
                    tronbun.invoke('add-website', { name, url, username, password })
                        .then(result => {
                            console.log('[UI] add-website result:', result);
                            // Refresh state to get the updated website list
                            refreshState();
                        })
                        .catch(err => {
                            console.error('[UI] add-website error:', err);
                            // Still try to refresh state
                            refreshState();
                        });
                }
            });
        }

        function showEditStepModal(step) {
            showModal('Edit Step', \`
                <div class="form-group">
                    <label>Action</label>
                    <select id="editStepAction">
                        <option value="navigate" \${step.action === 'navigate' ? 'selected' : ''}>Navigate</option>
                        <option value="click" \${step.action === 'click' ? 'selected' : ''}>Click</option>
                        <option value="type" \${step.action === 'type' ? 'selected' : ''}>Type</option>
                        <option value="wait" \${step.action === 'wait' ? 'selected' : ''}>Wait</option>
                        <option value="scroll" \${step.action === 'scroll' ? 'selected' : ''}>Scroll</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <input type="text" id="editStepDescription" value="\${escapeHtml(step.description)}" />
                </div>
                <div class="form-group">
                    <label>Selector</label>
                    <input type="text" id="editStepSelector" value="\${escapeHtml(step.selector || '')}" />
                </div>
                <div class="form-group">
                    <label>Value</label>
                    <input type="text" id="editStepValue" value="\${escapeHtml(step.value || '')}" />
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="editStepIsVariable" \${step.isVariable ? 'checked' : ''} />
                        Value is a variable
                    </label>
                </div>
                <div class="form-group">
                    <label>Variable Name</label>
                    <input type="text" id="editStepVariableName" value="\${escapeHtml(step.variableName || '')}" placeholder="e.g., email" />
                </div>
            \`, () => {
                tronbun.invoke('update-step', {
                    stepId: step.id,
                    updates: {
                        action: document.getElementById('editStepAction').value,
                        description: document.getElementById('editStepDescription').value,
                        selector: document.getElementById('editStepSelector').value,
                        value: document.getElementById('editStepValue').value,
                        isVariable: document.getElementById('editStepIsVariable').checked,
                        variableName: document.getElementById('editStepVariableName').value
                    }
                });
                hideModal();
            });
        }

        // Modal helpers
        function showModal(title, body, onConfirm) {
            const container = document.getElementById('modalsContainer');
            container.innerHTML = \`
                <div class="modal-overlay" onclick="hideModal()">
                    <div class="modal" onclick="event.stopPropagation()">
                        <div class="modal-title">\${title}</div>
                        <div class="modal-body">\${body}</div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
                            <button class="btn btn-primary" id="modalConfirmBtn">Confirm</button>
                        </div>
                    </div>
                </div>
            \`;
            document.getElementById('modalConfirmBtn').onclick = onConfirm;
        }

        function hideModal() {
            document.getElementById('modalsContainer').innerHTML = '';
        }

        // Helper functions
        function escapeHtml(str) {
            if (!str) return '';
            return str.replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;');
        }

        function formatDate(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        // IPC handler for state updates
        window.updateState = function(newState) {
            console.log('[UI] updateState called with', newState?.websites?.length, 'websites');
            state = newState;
            updateUI();
        };

        // Request state refresh from backend
        function refreshState() {
            console.log('[UI] Requesting state refresh...');
            if (typeof tronbun !== 'undefined') {
                tronbun.invoke('get-state')
                    .then(newState => {
                        if (newState && typeof newState === 'object') {
                            console.log('[UI] Got state refresh:', newState.websites?.length, 'websites');
                            state = newState;
                            updateUI();
                        }
                    })
                    .catch(err => {
                        console.error('[UI] Failed to refresh state:', err);
                    });
            }
        }

        // Refresh state periodically to ensure sync (fallback for push updates)
        setInterval(refreshState, 2000);
    </script>
</body>
</html>
    `;
}

export { PANEL_WIDTH };
