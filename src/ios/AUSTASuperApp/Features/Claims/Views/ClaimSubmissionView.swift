//
// ClaimSubmissionView.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+
import Combine // Version: iOS 14.0+

/// HIPAA-compliant view for secure insurance claim submission
@available(iOS 14.0, *)
public struct ClaimSubmissionView: View {
    
    // MARK: - View Model
    
    @StateObject private var viewModel: ClaimsViewModel
    
    // MARK: - State Properties
    
    @State private var claimType: ClaimType = .medical
    @State private var amount: String = ""
    @State private var policyNumber: String = ""
    @State private var description: String = ""
    @State private var selectedDocuments: [SecureDocument] = []
    @State private var showingDocumentPicker = false
    @State private var showingAlert = false
    @State private var alertMessage = ""
    @State private var isProcessing = false
    @State private var validationState: ValidationState = .idle
    
    // MARK: - Private Properties
    
    private let securityUtils: SecurityUtils
    private let validationUtils: ValidationUtils
    private let maxDocuments = 5
    private let maxFileSize: Int64 = 50 * 1024 * 1024 // 50MB
    
    // MARK: - Initialization
    
    public init(viewModel: ClaimsViewModel, securityUtils: SecurityUtils, validationUtils: ValidationUtils) {
        _viewModel = StateObject(wrappedValue: viewModel)
        self.securityUtils = securityUtils
        self.validationUtils = validationUtils
    }
    
    // MARK: - Body
    
    public var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Claim Type Selection
                    claimTypeSection
                    
                    // Policy Information
                    policySection
                    
                    // Amount Section
                    amountSection
                    
                    // Description Section
                    descriptionSection
                    
                    // Document Upload Section
                    documentSection
                    
                    // Submit Button
                    submitButton
                }
                .padding()
            }
            .navigationTitle("Submit Claim")
            .navigationBarTitleDisplayMode(.large)
            .alert(isPresented: $showingAlert) {
                Alert(
                    title: Text("Attention"),
                    message: Text(alertMessage),
                    dismissButton: .default(Text("OK"))
                )
            }
            .overlay(loadingOverlay)
        }
    }
    
    // MARK: - UI Components
    
    private var claimTypeSection: some View {
        VStack(alignment: .leading) {
            Text("Claim Type")
                .font(.headline)
            
            Picker("Claim Type", selection: $claimType) {
                Text("Medical").tag(ClaimType.medical)
                Text("Pharmacy").tag(ClaimType.pharmacy)
                Text("Dental").tag(ClaimType.dental)
                Text("Vision").tag(ClaimType.vision)
            }
            .pickerStyle(SegmentedPickerStyle())
        }
    }
    
    private var policySection: some View {
        VStack(alignment: .leading) {
            Text("Policy Information")
                .font(.headline)
            
            SecureTextField(
                "Policy Number",
                text: $policyNumber,
                validation: { validationUtils.sanitizeInput($0) }
            )
            .textContentType(.none)
            .keyboardType(.numberPad)
            .textInputAutocapitalization(.never)
            .disableAutocorrection(true)
        }
    }
    
    private var amountSection: some View {
        VStack(alignment: .leading) {
            Text("Claim Amount")
                .font(.headline)
            
            SecureTextField(
                "Amount",
                text: $amount,
                validation: { validationUtils.sanitizeInput($0) }
            )
            .keyboardType(.decimalPad)
            .onChange(of: amount) { newValue in
                validateAmount(newValue)
            }
        }
    }
    
    private var descriptionSection: some View {
        VStack(alignment: .leading) {
            Text("Description")
                .font(.headline)
            
            SecureTextEditor(
                text: $description,
                placeholder: "Enter claim details...",
                validation: { validationUtils.sanitizeInput($0) }
            )
            .frame(height: 100)
        }
    }
    
    private var documentSection: some View {
        VStack(alignment: .leading) {
            Text("Supporting Documents")
                .font(.headline)
            
            if !selectedDocuments.isEmpty {
                ForEach(selectedDocuments, id: \.id) { document in
                    DocumentRow(document: document) {
                        removeDocument(document)
                    }
                }
            }
            
            if selectedDocuments.count < maxDocuments {
                Button(action: { showingDocumentPicker = true }) {
                    Label("Add Document", systemImage: "doc.badge.plus")
                }
                .sheet(isPresented: $showingDocumentPicker) {
                    DocumentPicker(
                        selectedDocuments: $selectedDocuments,
                        maxDocuments: maxDocuments,
                        maxFileSize: maxFileSize,
                        onSelect: handleDocumentSelection
                    )
                }
            }
        }
    }
    
    private var submitButton: some View {
        Button(action: submitClaim) {
            if isProcessing {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle())
            } else {
                Text("Submit Claim")
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(isProcessing || !isFormValid)
    }
    
    private var loadingOverlay: some View {
        Group {
            if isProcessing {
                Color.black.opacity(0.4)
                    .edgesIgnoringSafeArea(.all)
                    .overlay(
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    )
            }
        }
    }
    
    // MARK: - Private Methods
    
    private func validateAmount(_ value: String) {
        guard !value.isEmpty else {
            validationState = .invalid
            return
        }
        
        guard let amount = Decimal(string: value),
              amount > 0,
              amount <= 1_000_000 else {
            validationState = .invalid
            return
        }
        
        validationState = .valid
    }
    
    private func handleDocumentSelection(_ urls: [URL]) {
        Task {
            do {
                for url in urls {
                    guard selectedDocuments.count < maxDocuments else { break }
                    
                    // Validate file size
                    let fileSize = try await url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    guard fileSize <= maxFileSize else {
                        throw ClaimValidationError.invalidDocuments
                    }
                    
                    // Create secure document
                    let document = try await createSecureDocument(from: url)
                    selectedDocuments.append(document)
                }
            } catch {
                showError("Failed to process document: \(error.localizedDescription)")
            }
        }
    }
    
    private func createSecureDocument(from url: URL) async throws -> SecureDocument {
        let data = try Data(contentsOf: url)
        let encryptedData = try securityUtils.encryptPHI(data)
        
        return SecureDocument(
            id: UUID().uuidString,
            encryptedData: encryptedData,
            contentType: url.pathExtension,
            hash: data.sha256(),
            timestamp: Date(),
            metadata: EncryptionMetadata(
                algorithm: "AES-256-GCM",
                keyId: UUID().uuidString,
                createdAt: Date(),
                iv: Data(),
                tag: Data()
            )
        )
    }
    
    private func removeDocument(_ document: SecureDocument) {
        selectedDocuments.removeAll { $0.id == document.id }
    }
    
    private func submitClaim() {
        guard validateForm() else { return }
        
        isProcessing = true
        
        Task {
            do {
                // Create secure claim object
                let claim = try Claim(
                    id: UUID().uuidString,
                    userId: UserContext.shared.userId,
                    policyNumber: policyNumber,
                    type: claimType,
                    amount: Decimal(string: amount) ?? 0,
                    securityContext: SecurityContext()
                )
                
                // Submit claim
                try await viewModel.submitClaim(claim, documents: selectedDocuments)
                
                DispatchQueue.main.async {
                    isProcessing = false
                    resetForm()
                    showSuccess()
                }
            } catch {
                DispatchQueue.main.async {
                    isProcessing = false
                    showError(error.localizedDescription)
                }
            }
        }
    }
    
    private func validateForm() -> Bool {
        guard !policyNumber.isEmpty,
              !amount.isEmpty,
              !description.isEmpty,
              validationState == .valid else {
            showError("Please fill in all required fields correctly")
            return false
        }
        
        return true
    }
    
    private func resetForm() {
        amount = ""
        policyNumber = ""
        description = ""
        selectedDocuments.removeAll()
        validationState = .idle
    }
    
    private func showError(_ message: String) {
        alertMessage = message
        showingAlert = true
    }
    
    private func showSuccess() {
        alertMessage = "Claim submitted successfully"
        showingAlert = true
    }
    
    private var isFormValid: Bool {
        !policyNumber.isEmpty &&
        !amount.isEmpty &&
        !description.isEmpty &&
        validationState == .valid
    }
}

// MARK: - Supporting Types

private enum ValidationState {
    case idle
    case valid
    case invalid
}

// MARK: - Preview Provider

@available(iOS 14.0, *)
struct ClaimSubmissionView_Previews: PreviewProvider {
    static var previews: some View {
        ClaimSubmissionView(
            viewModel: ClaimsViewModel(
                claimsService: ClaimsService(auditLogger: AuditLogger()),
                securityUtils: SecurityUtils(),
                performanceMonitor: PerformanceMonitor(),
                auditLogger: AuditLogger()
            ),
            securityUtils: SecurityUtils(),
            validationUtils: ValidationUtils()
        )
    }
}