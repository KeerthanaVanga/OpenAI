/* eslint-disable no-undef */
import React, { useState, useRef, useEffect } from "react";
import { Send, Paperclip, FileText, Loader2, Copy, Check, Plus, Minimize2 } from "lucide-react";

const BASE_URL = import.meta.env.URL

const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [officeReady, setOfficeReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => scrollToBottom(), [messages]);

  // Wait for Office.js
  useEffect(() => {
    Office.onReady().then(() => {
       
      if (Office.context.host === Office.HostType.Word) {
        setOfficeReady(true);
      }
    });
  }, []);

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files);
    const newFiles = files.map((file) => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (fileId) => setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const sendMessage = async () => {
    if (!inputText.trim() && attachedFiles.length === 0) return;

    const userMessage = {
      id: Date.now(),
      type: "user",
      text: inputText,
      files: attachedFiles,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setAttachedFiles([]);
    setIsLoading(true);
    setStatusMessage("");

    try {
      const formData = new FormData();
      formData.append("prompt", inputText);
      attachedFiles.forEach((f) => formData.append("files", f.file));

      const response = await fetch(`${BASE_URL}/chat`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Server error");

      const aiMessage = {
        id: Date.now() + 1,
        type: "ai",
        text: data.output,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error:", error);
      const errorMessage = {
        id: Date.now() + 1,
        type: "error",
        text: `Error: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      setStatusMessage("Clipboard access blocked in Word add-in.");
    }
  };

  const insertToWord = async (text) => {
    if (!officeReady) {
      setStatusMessage("Word not ready yet or not running inside Word.");
      return;
    }

    try {
      await Word.run(async (context) => {
        const range = context.document.getSelection();
        range.insertText(text, Word.InsertLocation.replace);
        await context.sync();
      });
      setStatusMessage("Inserted into Word successfully ✅");
    } catch (error) {
      console.error("Failed to insert into Word:", error);
      setStatusMessage("Failed to insert into Word. See console for details.");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">AI</span>
            </div>
            AI Assistant Chat
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Ask questions, upload files, and get AI-powered responses
          </p>
          {statusMessage && (
            <p className="text-sm text-green-700 mt-1">{statusMessage}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-2xl font-bold">AI</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">Start a conversation</h3>
              <p className="text-gray-500 mb-6">
                Ask me anything or upload files for analysis
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-3xl rounded-2xl p-4 ${
                  message.type === "user"
                    ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white ml-12"
                    : message.type === "error"
                    ? "bg-red-50 border border-red-200 text-red-800 mr-12"
                    : "bg-white shadow-sm border border-gray-200 mr-12"
                }`}
              >
                {message.files && message.files.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {message.files.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 p-2 bg-white/10 rounded-lg"
                      >
                        {f.preview ? (
                          <img src={f.preview} alt={f.name} className="w-8 h-8 object-cover rounded" />
                        ) : (
                          <FileText className="w-5 h-5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.name}</p>
                          <p className="text-xs opacity-75">{formatFileSize(f.size)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</div>

                {message.type === "ai" && (
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => copyToClipboard(message.text, index)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                    >
                      {copiedIndex === index ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedIndex === index ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => insertToWord(message.text)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Insert to Word
                    </button>
                  </div>
                )}

                <div className="mt-2 text-xs opacity-60">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white shadow-sm border border-gray-200 rounded-2xl p-4 mr-12">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">AI</span>
                  </div>
                  <span className="text-sm font-medium text-gray-700">AI Assistant</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          {attachedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2 bg-gray-100 rounded-lg p-2 pr-1">
                  {f.preview ? (
                    <img src={f.preview} alt={f.name} className="w-8 h-8 object-cover rounded" />
                  ) : (
                    <FileText className="w-5 h-5 text-gray-600" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate max-w-32">{f.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(f.size)}</p>
                  </div>
                  <button
                    onClick={() => removeFile(f.id)}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    <Minimize2 className="w-3 h-3 text-gray-500 rotate-45" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask me anything..."
                className="w-full p-4 pr-12 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none transition-all duration-200 min-h-[56px] max-h-32"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Paperclip className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={sendMessage}
              disabled={isLoading || (!inputText.trim() && attachedFiles.length === 0)}
              className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt,.md"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
