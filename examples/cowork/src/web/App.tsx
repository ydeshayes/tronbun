import React, { useState, useEffect, useRef, useCallback } from "react";

// Types
interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Model {
  id: string;
  name: string;
}

// Styles
const styles = {
  container: {
    display: "flex",
    height: "100vh",
    backgroundColor: "#0f0f1a",
  } as React.CSSProperties,

  sidebar: {
    width: "280px",
    backgroundColor: "#16162a",
    borderRight: "1px solid #2a2a4a",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  } as React.CSSProperties,

  sidebarHeader: {
    padding: "16px",
    borderBottom: "1px solid #2a2a4a",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  } as React.CSSProperties,

  logo: {
    width: "32px",
    height: "32px",
    backgroundColor: "#6366f1",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
  } as React.CSSProperties,

  sidebarTitle: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#fff",
  } as React.CSSProperties,

  folderSection: {
    padding: "16px",
    borderBottom: "1px solid #2a2a4a",
  } as React.CSSProperties,

  folderLabel: {
    fontSize: "12px",
    color: "#888",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  } as React.CSSProperties,

  folderPath: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    backgroundColor: "#1e1e3a",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  } as React.CSSProperties,

  folderInput: {
    width: "100%",
    padding: "8px 12px",
    backgroundColor: "#1e1e3a",
    border: "1px solid #3a3a5a",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "13px",
    marginTop: "8px",
  } as React.CSSProperties,

  fileList: {
    flex: 1,
    overflow: "auto",
    padding: "8px",
  } as React.CSSProperties,

  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
    marginBottom: "2px",
  } as React.CSSProperties,

  fileIcon: {
    fontSize: "16px",
  } as React.CSSProperties,

  fileName: {
    flex: 1,
    fontSize: "13px",
    color: "#ddd",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as React.CSSProperties,

  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  } as React.CSSProperties,

  header: {
    padding: "16px 24px",
    borderBottom: "1px solid #2a2a4a",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } as React.CSSProperties,

  headerTitle: {
    fontSize: "16px",
    fontWeight: "500",
    color: "#fff",
  } as React.CSSProperties,

  settingsButton: {
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "1px solid #3a3a5a",
    borderRadius: "6px",
    color: "#aaa",
    cursor: "pointer",
    fontSize: "13px",
    transition: "all 0.2s",
  } as React.CSSProperties,

  chatContainer: {
    flex: 1,
    overflow: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  } as React.CSSProperties,

  welcomeContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "40px",
  } as React.CSSProperties,

  welcomeIcon: {
    width: "80px",
    height: "80px",
    backgroundColor: "#6366f1",
    borderRadius: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "36px",
    marginBottom: "24px",
  } as React.CSSProperties,

  welcomeTitle: {
    fontSize: "28px",
    fontWeight: "600",
    color: "#fff",
    marginBottom: "12px",
  } as React.CSSProperties,

  welcomeText: {
    fontSize: "15px",
    color: "#888",
    maxWidth: "500px",
    lineHeight: "1.6",
  } as React.CSSProperties,

  message: {
    maxWidth: "80%",
    padding: "12px 16px",
    borderRadius: "12px",
    lineHeight: "1.5",
    fontSize: "14px",
  } as React.CSSProperties,

  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#6366f1",
    color: "#fff",
  } as React.CSSProperties,

  assistantMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#1e1e3a",
    color: "#ddd",
  } as React.CSSProperties,

  inputContainer: {
    padding: "16px 24px",
    borderTop: "1px solid #2a2a4a",
  } as React.CSSProperties,

  inputWrapper: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-end",
  } as React.CSSProperties,

  textarea: {
    flex: 1,
    padding: "12px 16px",
    backgroundColor: "#1e1e3a",
    border: "1px solid #3a3a5a",
    borderRadius: "12px",
    color: "#fff",
    fontSize: "14px",
    resize: "none",
    minHeight: "48px",
    maxHeight: "150px",
    fontFamily: "inherit",
    lineHeight: "1.5",
  } as React.CSSProperties,

  sendButton: {
    padding: "12px 24px",
    backgroundColor: "#6366f1",
    border: "none",
    borderRadius: "12px",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    transition: "background-color 0.2s",
  } as React.CSSProperties,

  sendButtonDisabled: {
    backgroundColor: "#4a4a6a",
    cursor: "not-allowed",
  } as React.CSSProperties,

  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  } as React.CSSProperties,

  modalContent: {
    backgroundColor: "#1e1e3a",
    borderRadius: "16px",
    padding: "24px",
    width: "450px",
    maxWidth: "90%",
  } as React.CSSProperties,

  modalTitle: {
    fontSize: "20px",
    fontWeight: "600",
    color: "#fff",
    marginBottom: "20px",
  } as React.CSSProperties,

  formGroup: {
    marginBottom: "16px",
  } as React.CSSProperties,

  label: {
    display: "block",
    fontSize: "13px",
    color: "#aaa",
    marginBottom: "8px",
  } as React.CSSProperties,

  input: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "#16162a",
    border: "1px solid #3a3a5a",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
  } as React.CSSProperties,

  select: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "#16162a",
    border: "1px solid #3a3a5a",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    cursor: "pointer",
  } as React.CSSProperties,

  modalButtons: {
    display: "flex",
    gap: "12px",
    marginTop: "24px",
    justifyContent: "flex-end",
  } as React.CSSProperties,

  cancelButton: {
    padding: "10px 20px",
    backgroundColor: "transparent",
    border: "1px solid #3a3a5a",
    borderRadius: "8px",
    color: "#aaa",
    cursor: "pointer",
    fontSize: "14px",
  } as React.CSSProperties,

  saveButton: {
    padding: "10px 20px",
    backgroundColor: "#6366f1",
    border: "none",
    borderRadius: "8px",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  } as React.CSSProperties,

  loadingDots: {
    display: "flex",
    gap: "4px",
    padding: "8px 0",
  } as React.CSSProperties,

  dot: {
    width: "8px",
    height: "8px",
    backgroundColor: "#6366f1",
    borderRadius: "50%",
    animation: "bounce 1.4s infinite ease-in-out both",
  } as React.CSSProperties,

  apiKeyHint: {
    fontSize: "12px",
    color: "#666",
    marginTop: "8px",
  } as React.CSSProperties,

  parentFolder: {
    opacity: 0.7,
    fontStyle: "italic",
  } as React.CSSProperties,
};

// Add CSS animation for loading dots
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }
  .dot-1 { animation-delay: -0.32s; }
  .dot-2 { animation-delay: -0.16s; }
  .dot-3 { animation-delay: 0s; }

  .file-item:hover {
    background-color: #2a2a4a !important;
  }

  .settings-btn:hover {
    background-color: #2a2a4a !important;
    color: #fff !important;
  }

  .send-btn:hover:not(:disabled) {
    background-color: #5558e3 !important;
  }

  textarea:focus, input:focus, select:focus {
    outline: none;
    border-color: #6366f1 !important;
  }

  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: #16162a;
  }

  ::-webkit-scrollbar-thumb {
    background: #3a3a5a;
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #4a4a6a;
  }

  pre {
    background-color: #0f0f1a;
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 8px 0;
  }

  code {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 13px;
  }
`;
document.head.appendChild(styleSheet);

// Main App Component
const App: React.FC = () => {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [folderInputValue, setFolderInputValue] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [hasPendingPlan, setHasPendingPlan] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        const wd = await window.cowork.getWorkingDirectory();
        setWorkingDirectory(wd);
        setFolderInputValue(wd);

        const key = await window.cowork.getApiKey();
        setApiKey(key);

        const modelList = await window.cowork.getModels();
        setModels(modelList);

        const model = await window.cowork.getSelectedModel();
        setSelectedModel(model);

        // Load files after all other data is ready
        const fileList = await window.cowork.listFiles(wd);
        setFiles(fileList);
      } catch (error) {
        console.error("Init error:", error);
      }
    };
    init();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  const loadFiles = async (path: string) => {
    try {
      const fileList = await window.cowork.listFiles(path);
      setFiles(fileList);
    } catch (error) {
      console.error("Error loading files:", error);
    }
  };

  const handleFolderChange = async () => {
    const result = await window.cowork.selectFolder(folderInputValue);
    if (result.success) {
      setWorkingDirectory(result.path);
      loadFiles(result.path);
      setShowFolderInput(false);
    } else {
      alert("Invalid folder path");
    }
  };

  const handleFileClick = async (file: FileEntry) => {
    if (file.isDirectory) {
      const result = await window.cowork.selectFolder(file.path);
      if (result.success) {
        setWorkingDirectory(result.path);
        setFolderInputValue(result.path);
        loadFiles(result.path);
      }
    } else {
      // Read file and show in chat
      const content = await window.cowork.readFile(file.path);
      if (content.success) {
        const preview = content.content.slice(0, 500) + (content.content.length > 500 ? "..." : "");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `**${file.name}**\n\`\`\`\n${preview}\n\`\`\``,
            timestamp: new Date(),
          },
        ]);
      }
    }
  };

  const handleGoUp = async () => {
    const parentPath = workingDirectory.split("/").slice(0, -1).join("/") || "/";
    const result = await window.cowork.selectFolder(parentPath);
    if (result.success) {
      setWorkingDirectory(result.path);
      setFolderInputValue(result.path);
      loadFiles(result.path);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage, timestamp: new Date() }]);
    setIsLoading(true);

    const response = await window.cowork.sendMessage(userMessage);
    setIsLoading(false);

    if (response.success) {
      setMessages((prev) => [...prev, { role: "assistant", content: response.response, timestamp: new Date() }]);
      // Check if there's a pending plan
      const pending = await window.cowork.hasPendingPlan();
      setHasPendingPlan(pending);
      // Refresh file list in case AI made changes
      if (!pending) {
        loadFiles(workingDirectory);
      }
    } else {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${response.error}`, timestamp: new Date() },
      ]);
    }
  };

  const handleConfirmPlan = async () => {
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: "Yes, proceed.", timestamp: new Date() }]);

    const response = await window.cowork.sendMessage("yes");
    setIsLoading(false);
    setHasPendingPlan(false);

    if (response.success) {
      setMessages((prev) => [...prev, { role: "assistant", content: response.response, timestamp: new Date() }]);
      loadFiles(workingDirectory);
    } else {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${response.error}`, timestamp: new Date() },
      ]);
    }
  };

  const handleCancelPlan = async () => {
    await window.cowork.cancelPlan();
    setHasPendingPlan(false);
    setMessages((prev) => [...prev, { role: "assistant", content: "Plan cancelled.", timestamp: new Date() }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveSettings = async () => {
    await window.cowork.setApiKey(apiKey);
    await window.cowork.setModel(selectedModel);
    setShowSettings(false);
  };

  const formatMessage = (content: string) => {
    // Simple markdown-like formatting
    let formatted = content
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`{3}([\s\S]*?)`{3}/g, "<pre><code>$1</code></pre>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    return <div dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.logo}>C</div>
          <span style={styles.sidebarTitle}>Cowork</span>
        </div>

        <div style={styles.folderSection}>
          <div style={styles.folderLabel}>Working Folder</div>
          {showFolderInput ? (
            <div>
              <input
                style={styles.folderInput}
                value={folderInputValue}
                onChange={(e) => setFolderInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFolderChange()}
                onBlur={() => setShowFolderInput(false)}
                autoFocus
              />
            </div>
          ) : (
            <div
              style={styles.folderPath}
              onClick={() => setShowFolderInput(true)}
              className="file-item"
            >
              <span>{"\u{1F4C1}"}</span>
              <span style={{ ...styles.fileName, color: "#fff" }}>
                {workingDirectory.split("/").pop() || "/"}
              </span>
            </div>
          )}
        </div>

        <div style={styles.fileList}>
          {/* Parent directory */}
          <div
            style={{ ...styles.fileItem, ...styles.parentFolder }}
            onClick={handleGoUp}
            className="file-item"
          >
            <span style={styles.fileIcon}>{"\u{1F4C2}"}</span>
            <span style={styles.fileName}>..</span>
          </div>

          {files.map((file) => (
            <div
              key={file.path}
              style={styles.fileItem}
              onClick={() => handleFileClick(file)}
              className="file-item"
            >
              <span style={styles.fileIcon}>
                {file.isDirectory ? "\u{1F4C1}" : "\u{1F4C4}"}
              </span>
              <span style={styles.fileName}>{file.name}</span>
              {!file.isDirectory && (
                <span style={{ fontSize: "11px", color: "#666" }}>
                  {formatFileSize(file.size)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>
            AI File Assistant ({models.find((m) => m.id === selectedModel)?.name || "No model"})
          </span>
          <button
            style={styles.settingsButton}
            onClick={() => setShowSettings(true)}
            className="settings-btn"
          >
            Settings
          </button>
        </div>

        {messages.length === 0 ? (
          <div style={styles.welcomeContainer}>
            <div style={styles.welcomeIcon}>C</div>
            <h1 style={styles.welcomeTitle}>Welcome to Cowork</h1>
            <p style={styles.welcomeText}>
              I can help you manage files in your selected folder. Ask me to read, create, edit, or
              organize files. I'll explain what I'm doing and ask for confirmation before making
              significant changes.
            </p>
            {!apiKey && (
              <p style={{ ...styles.welcomeText, color: "#f59e0b", marginTop: "16px" }}>
                Please set your OpenRouter API key in Settings to get started.
              </p>
            )}
          </div>
        ) : (
          <div style={styles.chatContainer} ref={chatContainerRef}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.message,
                  ...(msg.role === "user" ? styles.userMessage : styles.assistantMessage),
                }}
              >
                {formatMessage(msg.content)}
              </div>
            ))}
            {isLoading && (
              <div style={{ ...styles.message, ...styles.assistantMessage }}>
                <div style={styles.loadingDots}>
                  <div style={styles.dot} className="dot-1" />
                  <div style={styles.dot} className="dot-2" />
                  <div style={styles.dot} className="dot-3" />
                </div>
              </div>
            )}
          </div>
        )}

        <div style={styles.inputContainer}>
          {hasPendingPlan ? (
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", alignItems: "center" }}>
              <span style={{ color: "#f59e0b", fontSize: "14px" }}>Confirm the plan above?</span>
              <button
                style={{
                  ...styles.sendButton,
                  backgroundColor: "#22c55e",
                }}
                onClick={handleConfirmPlan}
                disabled={isLoading}
                className="send-btn"
              >
                {"\u2713"} Confirm
              </button>
              <button
                style={{
                  ...styles.cancelButton,
                  padding: "12px 24px",
                }}
                onClick={handleCancelPlan}
                disabled={isLoading}
              >
                {"\u2717"} Cancel
              </button>
            </div>
          ) : (
            <div style={styles.inputWrapper}>
              <textarea
                ref={textareaRef}
                style={styles.textarea}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me to help with files..."
                rows={1}
              />
              <button
                style={{
                  ...styles.sendButton,
                  ...(isLoading || !input.trim() ? styles.sendButtonDisabled : {}),
                }}
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="send-btn"
              >
                Send
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={styles.modal} onClick={() => setShowSettings(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Settings</h2>

            <div style={styles.formGroup}>
              <label style={styles.label}>OpenRouter API Key</label>
              <input
                style={styles.input}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-..."
              />
              <p style={styles.apiKeyHint}>
                Get your free API key at{" "}
                <a href="https://openrouter.ai/keys" style={{ color: "#6366f1" }}>
                  openrouter.ai/keys
                </a>
              </p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Model</label>
              <select
                style={styles.select}
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.modalButtons}>
              <button
                style={styles.cancelButton}
                onClick={() => setShowSettings(false)}
              >
                Cancel
              </button>
              <button style={styles.saveButton} onClick={handleSaveSettings}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
