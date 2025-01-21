//
// UIKit+Extensions.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import UIKit // Version: iOS 14.0+
import AppConstants

// MARK: - UIView Extensions
public extension UIView {
    /// Adds a shadow effect to the view with healthcare-appropriate styling
    /// - Parameters:
    ///   - color: Shadow color (defaults to black at 20% opacity)
    ///   - offset: Shadow offset (defaults to 2pt vertical)
    ///   - radius: Shadow radius (defaults to 4pt)
    func addShadow(color: UIColor = .black.withAlphaComponent(0.2),
                   offset: CGSize = CGSize(width: 0, height: 2),
                   radius: CGFloat = 4) {
        layer.shadowColor = color.cgColor
        layer.shadowOffset = offset
        layer.shadowRadius = radius
        layer.shadowOpacity = 1
        layer.masksToBounds = false
    }
    
    /// Adds corner radius to the view
    /// - Parameter radius: Corner radius value (defaults to 8pt)
    func addCornerRadius(_ radius: CGFloat = 8) {
        layer.cornerRadius = radius
        layer.masksToBounds = true
    }
    
    /// Adds a border to the view
    /// - Parameters:
    ///   - color: Border color
    ///   - width: Border width (defaults to 1pt)
    func addBorder(color: UIColor, width: CGFloat = 1) {
        layer.borderColor = color.cgColor
        layer.borderWidth = width
    }
    
    /// Configures accessibility properties for the view
    /// - Parameters:
    ///   - label: Accessibility label
    ///   - hint: Accessibility hint
    ///   - traits: Accessibility traits
    func configureAccessibility(label: String,
                              hint: String? = nil,
                              traits: UIAccessibilityTraits = .none) {
        isAccessibilityElement = true
        accessibilityLabel = label
        accessibilityHint = hint
        accessibilityTraits = traits
    }
    
    /// Adds HIPAA-compliant blur effect for sensitive information
    /// - Parameter style: Blur style (defaults to regular)
    func addHIPAABlur(style: UIBlurEffect.Style = .regular) {
        let blurEffect = UIBlurEffect(style: style)
        let blurView = UIVisualEffectView(effect: blurEffect)
        blurView.frame = bounds
        blurView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(blurView)
    }
    
    /// Sets up semantic layout margins for consistent spacing
    func setupSemanticLayout() {
        layoutMargins = UIEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
        preservesSuperviewLayoutMargins = true
    }
}

// MARK: - UIColor Extensions
public extension UIColor {
    /// Brand primary color
    static let brandPrimary = UIColor(red: 0/255, green: 122/255, blue: 255/255, alpha: 1)
    
    /// Brand secondary color
    static let brandSecondary = UIColor(red: 88/255, green: 86/255, blue: 214/255, alpha: 1)
    
    /// Success state color
    static let accentSuccess = UIColor(red: 52/255, green: 199/255, blue: 89/255, alpha: 1)
    
    /// Error state color
    static let accentError = UIColor(red: 255/255, green: 59/255, blue: 48/255, alpha: 1)
    
    /// Critical action color
    static let criticalAction = UIColor(red: 255/255, green: 45/255, blue: 85/255, alpha: 1)
    
    /// Emergency background color
    static let emergencyBackground = UIColor(red: 255/255, green: 228/255, blue: 228/255, alpha: 1)
    
    /// High contrast primary color for accessibility
    static let highContrastPrimary = UIColor(red: 0/255, green: 64/255, blue: 221/255, alpha: 1)
    
    /// High contrast secondary color for accessibility
    static let highContrastSecondary = UIColor(red: 64/255, green: 64/255, blue: 64/255, alpha: 1)
}

// MARK: - UIFont Extensions
public extension UIFont {
    /// Returns scaled title large font
    static var titleLarge: UIFont {
        return scaledFont(for: .title1, weight: .bold)
    }
    
    /// Returns scaled title medium font
    static var titleMedium: UIFont {
        return scaledFont(for: .title2, weight: .semibold)
    }
    
    /// Returns scaled body large font
    static var bodyLarge: UIFont {
        return scaledFont(for: .body, weight: .regular)
    }
    
    /// Returns scaled body medium font
    static var bodyMedium: UIFont {
        return scaledFont(for: .callout, weight: .regular)
    }
    
    /// Returns scaled critical text font
    static var criticalText: UIFont {
        return scaledFont(for: .headline, weight: .bold)
    }
    
    /// Returns scaled emergency title font
    static var emergencyTitle: UIFont {
        return scaledFont(for: .title2, weight: .heavy)
    }
    
    /// Returns a scaled font based on the text style and weight
    /// - Parameters:
    ///   - textStyle: The base text style
    ///   - weight: The font weight
    /// - Returns: A scaled UIFont instance
    static func scaledFont(for textStyle: UIFont.TextStyle, weight: UIFont.Weight) -> UIFont {
        let metrics = UIFontMetrics(forTextStyle: textStyle)
        let baseFont = UIFont.systemFont(ofSize: adaptiveTextSize(for: textStyle), weight: weight)
        return metrics.scaledFont(for: baseFont)
    }
}

// MARK: - Private Font Helpers
private func adaptiveTextSize(for textStyle: UIFont.TextStyle) -> CGFloat {
    switch textStyle {
    case .largeTitle: return 34
    case .title1: return 28
    case .title2: return 22
    case .title3: return 20
    case .headline: return 17
    case .body: return 16
    case .callout: return 16
    case .subheadline: return 15
    case .footnote: return 13
    case .caption1: return 12
    case .caption2: return 11
    default: return 16
    }
}

// MARK: - UIButton Extensions
public extension UIButton {
    /// Applies primary button style
    func applyPrimaryStyle() {
        backgroundColor = .brandPrimary
        setTitleColor(.white, for: .normal)
        titleLabel?.font = .scaledFont(for: .headline, weight: .semibold)
        addCornerRadius(8)
        configureAccessibleTouchTarget()
    }
    
    /// Applies secondary button style
    func applySecondaryStyle() {
        backgroundColor = .brandSecondary
        setTitleColor(.white, for: .normal)
        titleLabel?.font = .scaledFont(for: .headline, weight: .medium)
        addCornerRadius(8)
        configureAccessibleTouchTarget()
    }
    
    /// Applies disabled button style
    func applyDisabledStyle() {
        backgroundColor = .systemGray4
        setTitleColor(.systemGray2, for: .normal)
        isEnabled = false
        configureAccessibleTouchTarget()
    }
    
    /// Applies emergency button style
    func applyEmergencyStyle() {
        backgroundColor = .criticalAction
        setTitleColor(.white, for: .normal)
        titleLabel?.font = .emergencyTitle
        addCornerRadius(8)
        configureAccessibleTouchTarget()
        addHapticFeedback()
    }
    
    /// Applies critical action button style
    func applyCriticalActionStyle() {
        backgroundColor = .criticalAction.withAlphaComponent(0.1)
        setTitleColor(.criticalAction, for: .normal)
        titleLabel?.font = .criticalText
        addCornerRadius(8)
        addBorder(color: .criticalAction)
        configureAccessibleTouchTarget()
    }
    
    /// Configures accessible touch target size
    func configureAccessibleTouchTarget() {
        let minSize: CGFloat = 44
        if bounds.size.width < minSize || bounds.size.height < minSize {
            let widthPadding = max(0, minSize - bounds.size.width)
            let heightPadding = max(0, minSize - bounds.size.height)
            contentEdgeInsets = UIEdgeInsets(
                top: heightPadding/2,
                left: widthPadding/2,
                bottom: heightPadding/2,
                right: widthPadding/2
            )
        }
    }
    
    /// Adds haptic feedback to button
    func addHapticFeedback() {
        let feedbackGenerator = UIImpactFeedbackGenerator(style: .medium)
        addTarget(self, action: #selector(generateHapticFeedback), for: .touchDown)
        feedbackGenerator.prepare()
    }
    
    @objc private func generateHapticFeedback() {
        let feedbackGenerator = UIImpactFeedbackGenerator(style: .medium)
        feedbackGenerator.impactOccurred()
    }
}