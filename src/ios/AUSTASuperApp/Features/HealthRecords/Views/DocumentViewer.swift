//
// DocumentViewer.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+
import PDFKit // Version: iOS 14.0+
import QuickLook // Version: iOS 14.0+

/// HIPAA-compliant document viewer error types
enum DocumentViewerError: LocalizedError {
    case unsupportedFormat
    case loadError
    case securityError
    case encryptionError
    case auditError
    case accessDenied
    
    var errorDescription: String? {
        switch self {
        case .unsupportedFormat: return "Document format is not supported"
        case .loadError: return "Failed to load document"
        case .securityError: return "Security validation failed"
        case .encryptionError: return "Document decryption failed"
        case .auditError: return "Failed to log audit event"
        case .accessDenied: return "Access denied to document"
        }
    }
}

/// HIPAA-compliant document viewer component
@available(iOS 14.0, *)
struct DocumentViewer: View {
    // MARK: - Properties
    
    private let healthRecord: HealthRecord
    @StateObject private var securityManager = SecurityManager.shared
    @StateObject private var auditLogger = AuditLogger()
    
    @State private var isLoading = true
    @State private var error: DocumentViewerError?
    @State private var zoomScale: CGFloat = 1.0
    @State private var documentData: Data?
    @State private var showShareSheet = false
    
    // MARK: - Initialization
    
    init(healthRecord: HealthRecord) {
        self.healthRecord = healthRecord
    }
    
    // MARK: - Body
    
    var body: some View {
        ZStack {
            // Main content
            if isLoading {
                loadingView
            } else if let error = error {
                errorView(error)
            } else {
                documentContentView
            }
        }
        .onAppear {
            loadDocument()
        }
        .alert(item: $error) { error in
            Alert(
                title: Text("Error"),
                message: Text(error.localizedDescription),
                dismissButton: .default(Text("OK"))
            )
        }
    }
    
    // MARK: - Private Views
    
    private var loadingView: some View {
        ProgressView("Loading document securely...")
            .progressViewStyle(CircularProgressViewStyle())
    }
    
    private func errorView(_ error: DocumentViewerError) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundColor(.red)
            Text(error.localizedDescription)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
    
    private var documentContentView: some View {
        VStack {
            // Document preview
            if let documentData = documentData {
                SecureDocumentPreview(data: documentData)
                    .scaleEffect(zoomScale)
                    .gesture(
                        MagnificationGesture()
                            .onChanged { scale in
                                zoomScale = scale.magnitude
                            }
                    )
            }
            
            // Controls
            HStack {
                Button(action: resetZoom) {
                    Image(systemName: "1.magnifyingglass")
                }
                
                Spacer()
                
                Button(action: { showShareSheet = true }) {
                    Image(systemName: "square.and.arrow.up")
                }
                .disabled(!canShare())
            }
            .padding()
        }
        .sheet(isPresented: $showShareSheet) {
            if let data = documentData {
                SecureShareSheet(documentData: data, healthRecord: healthRecord)
            }
        }
    }
    
    // MARK: - Private Methods
    
    @MainActor
    private func loadDocument() {
        Task {
            do {
                // Validate security state
                try await validateSecurity()
                
                // Load and decrypt document
                let result = try await loadSecureDocument()
                
                // Log access
                try await logDocumentAccess()
                
                // Update UI
                documentData = result
                isLoading = false
                
            } catch let error as DocumentViewerError {
                self.error = error
                isLoading = false
            } catch {
                self.error = .loadError
                isLoading = false
            }
        }
    }
    
    private func validateSecurity() async throws {
        // Validate security state
        let securityResult = securityManager.validateSecurityState()
        switch securityResult {
        case .success:
            break
        case .failure:
            throw DocumentViewerError.securityError
        }
        
        // Enforce HIPAA security policy
        let policyResult = securityManager.enforceSecurityPolicy(requiredLevel: .hipaa)
        switch policyResult {
        case .success:
            break
        case .failure:
            throw DocumentViewerError.securityError
        }
    }
    
    private func loadSecureDocument() async throws -> Data {
        guard let attachment = healthRecord.attachments.first else {
            throw DocumentViewerError.loadError
        }
        
        // Verify document integrity
        let integrityResult = try await verifyDocumentIntegrity(attachment)
        guard integrityResult else {
            throw DocumentViewerError.securityError
        }
        
        // Decrypt document data
        let decryptionResult = EncryptionManager.shared.decrypt(attachment.data)
        switch decryptionResult {
        case .success(let decryptedData):
            return decryptedData
        case .failure:
            throw DocumentViewerError.encryptionError
        }
    }
    
    private func verifyDocumentIntegrity(_ attachment: HealthRecord.HealthRecordAttachment) async throws -> Bool {
        let documentHash = attachment.hash
        let computedHash = attachment.data.sha256()
        return documentHash == computedHash
    }
    
    private func logDocumentAccess() async throws {
        let auditEvent = [
            "action": "document_viewed",
            "document_id": healthRecord.id,
            "timestamp": Date().timeIntervalSince1970,
            "user_id": healthRecord.patientId
        ]
        
        try await auditLogger.logSecurityEvent(auditEvent)
    }
    
    private func resetZoom() {
        withAnimation {
            zoomScale = 1.0
        }
    }
    
    private func canShare() -> Bool {
        // Check sharing permissions based on security policy
        return healthRecord.metadata.securityLabels.contains("SHAREABLE")
    }
}

// MARK: - Supporting Views

private struct SecureDocumentPreview: UIViewRepresentable {
    let data: Data
    
    func makeUIView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.autoScales = true
        pdfView.displayMode = .singlePage
        pdfView.displayDirection = .vertical
        
        if let document = PDFDocument(data: data) {
            pdfView.document = document
        }
        
        return pdfView
    }
    
    func updateUIView(_ uiView: PDFView, context: Context) {}
}

private struct SecureShareSheet: UIViewControllerRepresentable {
    let documentData: Data
    let healthRecord: HealthRecord
    
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("pdf")
        
        try? documentData.write(to: tempURL)
        
        let activityViewController = UIActivityViewController(
            activityItems: [tempURL],
            applicationActivities: nil
        )
        
        activityViewController.completionWithItemsHandler = { _, _, _, _ in
            try? FileManager.default.removeItem(at: tempURL)
        }
        
        return activityViewController
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Preview Provider

struct DocumentViewer_Previews: PreviewProvider {
    static var previews: some View {
        DocumentViewer(healthRecord: HealthRecord(
            id: "test_id",
            patientId: "patient_123",
            providerId: "provider_456",
            type: .diagnostic,
            date: Date(),
            content: [:]
        ))
    }
}