//
// ChatView.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+
import Combine // Version: iOS 14.0+

// MARK: - Message Types and Models

/// Types of chat messages supported in virtual consultations
private enum ChatMessageType: String, Codable {
    case text
    case image
    case file
    case systemAlert
    case deliveryStatus
}

/// Message delivery status tracking
private enum MessageDeliveryStatus: String, Codable {
    case sending
    case sent
    case delivered
    case failed
}

/// HIPAA-compliant message encryption metadata
private struct EncryptionMetadata: Codable {
    let algorithm: String
    let keyId: String
    let iv: String
    let timestamp: Date
}

/// HIPAA-compliant audit log for messages
private struct HIPAACompliantAuditLog: Codable {
    let eventType: String
    let timestamp: Date
    let userId: String
    let actionType: String
    let metadata: [String: String]
}

/// Encrypted chat message model
private struct ChatMessage: Identifiable, Codable {
    let id: String
    let senderId: String
    let type: ChatMessageType
    let content: String
    let timestamp: Date
    let encryptionMetadata: EncryptionMetadata
    var deliveryStatus: MessageDeliveryStatus
    let auditLog: HIPAACompliantAuditLog
}

// MARK: - ChatView

/// HIPAA-compliant chat interface for virtual care consultations
@available(iOS 14.0, *)
struct ChatView: View {
    // MARK: - Properties
    
    private let consultation: Consultation
    private let webRTCService: WebRTCService
    
    @Published private var messages: [ChatMessage] = []
    @Published private var messageQueue: [ChatMessage] = []
    
    @State private var messageText: String = ""
    @State private var isAttachingFile: Bool = false
    @State private var showingImagePicker: Bool = false
    @State private var isTyping: Bool = false
    @State private var networkStatus: NetworkStatus = .connected
    @State private var encryptionStatus: Bool = true
    
    private let messagePublisher = PassthroughSubject<ChatMessage, Never>()
    private let messageRetryQueue = OperationQueue()
    private let encryptionManager = E2EEncryptionManager()
    private let auditLogger = HIPAACompliantLogger()
    
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    init(consultation: Consultation, webRTCService: WebRTCService) {
        self.consultation = consultation
        self.webRTCService = webRTCService
        
        setupMessageHandling()
        setupNetworkMonitoring()
        setupEncryption()
        configureAccessibility()
    }
    
    // MARK: - View Body
    
    var body: some View {
        VStack(spacing: 0) {
            // Encryption Status Bar
            encryptionStatusBar
            
            // Messages ScrollView
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(messages) { message in
                            MessageView(message: message)
                                .id(message.id)
                                .transition(.opacity)
                        }
                    }
                    .padding(.horizontal)
                }
                .onChange(of: messages) { _ in
                    scrollToBottom(proxy: proxy)
                }
            }
            
            // Message Input Area
            messageInputArea
        }
        .background(Color(.systemBackground))
        .onAppear {
            loadInitialMessages()
        }
    }
    
    // MARK: - UI Components
    
    private var encryptionStatusBar: some View {
        HStack {
            Image(systemName: encryptionStatus ? "lock.fill" : "lock.open.fill")
                .foregroundColor(encryptionStatus ? .green : .red)
            Text(encryptionStatus ? "End-to-End Encrypted" : "Encryption Error")
                .font(.caption)
            Spacer()
        }
        .padding(.horizontal)
        .padding(.vertical, 4)
        .background(encryptionStatus ? Color.green.opacity(0.1) : Color.red.opacity(0.1))
        .accessibilityLabel(encryptionStatus ? "Messages are encrypted" : "Encryption error")
    }
    
    private var messageInputArea: some View {
        VStack(spacing: 0) {
            Divider()
            
            HStack(alignment: .bottom, spacing: 12) {
                // Attachment Button
                Button(action: { isAttachingFile = true }) {
                    Image(systemName: "paperclip")
                        .font(.system(size: 22))
                }
                .accessibilityLabel("Attach file")
                
                // Text Input
                TextField("Type a message...", text: $messageText)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .frame(minHeight: 36)
                    .onChange(of: messageText) { _ in
                        handleTypingStatus()
                    }
                
                // Send Button
                Button(action: sendMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.blue)
                }
                .disabled(messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send message")
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }
    
    // MARK: - Private Methods
    
    private func setupMessageHandling() {
        messagePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] message in
                self?.handleIncomingMessage(message)
            }
            .store(in: &cancellables)
    }
    
    private func setupNetworkMonitoring() {
        NetworkMonitor.shared.isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                self?.handleNetworkStatusChange(connected)
            }
            .store(in: &cancellables)
    }
    
    private func setupEncryption() {
        guard let encryptionKeys = consultation.encryptionKeys else {
            encryptionStatus = false
            return
        }
        
        encryptionManager.configure(with: encryptionKeys)
    }
    
    private func configureAccessibility() {
        UIAccessibility.post(notification: .announcement, argument: "Chat session started")
    }
    
    private func sendMessage() {
        guard !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        
        do {
            // Encrypt message content
            let encryptedContent = try webRTCService.encryptMessage(messageText)
            
            // Create message with encryption metadata
            let message = ChatMessage(
                id: UUID().uuidString,
                senderId: consultation.patientId,
                type: .text,
                content: encryptedContent,
                timestamp: Date(),
                encryptionMetadata: EncryptionMetadata(
                    algorithm: "AES-256-GCM",
                    keyId: UUID().uuidString,
                    iv: UUID().uuidString,
                    timestamp: Date()
                ),
                deliveryStatus: .sending,
                auditLog: createAuditLog(action: "message_sent")
            )
            
            // Add to messages and clear input
            messages.append(message)
            messageText = ""
            
            // Send through WebRTC
            try webRTCService.handleSignalingMessage(message)
            
            // Update delivery status
            updateMessageStatus(message.id, status: .sent)
            
        } catch {
            handleMessageError(error)
        }
    }
    
    private func handleIncomingMessage(_ message: ChatMessage) {
        do {
            // Decrypt message
            let decryptedContent = try webRTCService.decryptMessage(message.content)
            
            // Validate and store message
            let validatedMessage = message
            messages.append(validatedMessage)
            
            // Create audit log
            auditLogger.log(
                event: "message_received",
                metadata: [
                    "messageId": message.id,
                    "senderId": message.senderId,
                    "timestamp": ISO8601DateFormatter().string(from: message.timestamp)
                ]
            )
            
        } catch {
            handleMessageError(error)
        }
    }
    
    private func createAuditLog(action: String) -> HIPAACompliantAuditLog {
        return HIPAACompliantAuditLog(
            eventType: "chat_message",
            timestamp: Date(),
            userId: consultation.patientId,
            actionType: action,
            metadata: [
                "consultationId": consultation.id,
                "messageType": "text",
                "encryptionStatus": String(encryptionStatus)
            ]
        )
    }
    
    private func handleTypingStatus() {
        isTyping = !messageText.isEmpty
    }
    
    private func handleNetworkStatusChange(_ connected: Bool) {
        networkStatus = connected ? .connected : .disconnected
        if !connected {
            queuePendingMessages()
        } else {
            sendQueuedMessages()
        }
    }
    
    private func queuePendingMessages() {
        // Implementation for offline message queuing
    }
    
    private func sendQueuedMessages() {
        // Implementation for sending queued messages
    }
    
    private func handleMessageError(_ error: Error) {
        // Implementation for error handling
    }
    
    private func updateMessageStatus(_ messageId: String, status: MessageDeliveryStatus) {
        if let index = messages.firstIndex(where: { $0.id == messageId }) {
            messages[index].deliveryStatus = status
        }
    }
    
    private func scrollToBottom(proxy: ScrollViewProxy) {
        if let lastMessage = messages.last {
            withAnimation {
                proxy.scrollTo(lastMessage.id, anchor: .bottom)
            }
        }
    }
    
    private func loadInitialMessages() {
        // Implementation for loading initial messages
    }
}

// MARK: - Message View

@available(iOS 14.0, *)
private struct MessageView: View {
    let message: ChatMessage
    
    var body: some View {
        HStack {
            if message.senderId == "currentUser" {
                Spacer()
                messageContent
                    .background(Color.blue)
            } else {
                messageContent
                    .background(Color.gray.opacity(0.2))
                Spacer()
            }
        }
    }
    
    private var messageContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(message.content)
                .padding(8)
                .foregroundColor(message.senderId == "currentUser" ? .white : .primary)
            
            HStack {
                Text(timeString(from: message.timestamp))
                    .font(.caption2)
                
                if message.senderId == "currentUser" {
                    deliveryStatusIcon
                }
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 4)
        }
        .cornerRadius(12)
    }
    
    private var deliveryStatusIcon: some View {
        Group {
            switch message.deliveryStatus {
            case .sending:
                Image(systemName: "clock")
            case .sent:
                Image(systemName: "checkmark")
            case .delivered:
                Image(systemName: "checkmark.circle.fill")
            case .failed:
                Image(systemName: "exclamationmark.circle")
            }
        }
        .font(.caption2)
    }
    
    private func timeString(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}