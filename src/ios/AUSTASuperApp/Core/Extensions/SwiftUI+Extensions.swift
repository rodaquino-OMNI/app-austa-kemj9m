//
// SwiftUI+Extensions.swift
// AUSTA SuperApp
//
// Created by AUSTA Development Team
// Copyright © 2023 AUSTA Health. All rights reserved.
//

import SwiftUI // Version: iOS 14.0+
import AppConstants

// MARK: - View Extensions
public extension View {
    /// Applies consistent card styling with accessibility considerations
    func cardStyle(cornerRadius: CGFloat = 12) -> some View {
        self.modifier(CardStyleModifier(cornerRadius: cornerRadius))
    }
    
    /// Applies primary button styling with accessibility enhancements
    func primaryButtonStyle() -> some View {
        self.modifier(PrimaryButtonStyleModifier())
    }
    
    /// Applies secondary button styling with accessibility enhancements
    func secondaryButtonStyle() -> some View {
        self.modifier(SecondaryButtonStyleModifier())
    }
    
    /// Applies adaptive font sizing with accessibility scaling
    func adaptiveFont(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> some View {
        self.modifier(AdaptiveFontModifier(style: style, weight: weight))
    }
    
    /// Enhances view with comprehensive accessibility features
    func accessibilityStyle(label: String, hint: String? = nil) -> some View {
        self.modifier(AccessibilityStyleModifier(label: label, hint: hint))
    }
}

// MARK: - Color Extensions
public extension Color {
    /// Brand primary color with semantic meaning
    static let brandPrimary = Color("BrandPrimary")
    
    /// Brand secondary color with semantic meaning
    static let brandSecondary = Color("BrandSecondary")
    
    /// Success state color with high contrast
    static let accentSuccess = Color("AccentSuccess")
    
    /// Error state color with high contrast
    static let accentError = Color("AccentError")
    
    /// Semantic background color adapting to color scheme
    static var semanticBackground: Color {
        @Environment(\.colorScheme) var colorScheme
        return colorScheme == .dark ? Color("BackgroundDark") : Color("BackgroundLight")
    }
    
    /// High contrast text color for accessibility
    static var highContrastText: Color {
        @Environment(\.colorScheme) var colorScheme
        return colorScheme == .dark ? .white : .black
    }
}

// MARK: - Font Extensions
public extension Font {
    /// Large title font with dynamic type support
    static var titleLarge: Font {
        .custom("AUSTA-Bold", size: 28, relativeTo: .title)
    }
    
    /// Medium title font with dynamic type support
    static var titleMedium: Font {
        .custom("AUSTA-SemiBold", size: 24, relativeTo: .title2)
    }
    
    /// Large body font with dynamic type support
    static var bodyLarge: Font {
        .custom("AUSTA-Regular", size: 16, relativeTo: .body)
    }
    
    /// Medium body font with dynamic type support
    static var bodyMedium: Font {
        .custom("AUSTA-Regular", size: 14, relativeTo: .callout)
    }
    
    /// Accessibility-optimized title font
    static var accessibilityTitle: Font {
        .custom("AUSTA-Bold", size: 32, relativeTo: .largeTitle)
    }
    
    /// Dynamically scaled body font
    static func scaledBody(baseSize: CGFloat) -> Font {
        .custom("AUSTA-Regular", size: baseSize, relativeTo: .body)
    }
}

// MARK: - Custom View Modifiers
private struct CardStyleModifier: ViewModifier {
    let cornerRadius: CGFloat
    @Environment(\.colorScheme) private var colorScheme
    
    func body(content: Content) -> some View {
        content
            .background(Color.semanticBackground)
            .cornerRadius(cornerRadius)
            .shadow(color: colorScheme == .dark ? .clear : .black.opacity(0.1),
                   radius: 8, x: 0, y: 2)
            .accessibilityElement(children: .contain)
    }
}

private struct PrimaryButtonStyleModifier: ViewModifier {
    @Environment(\.isEnabled) private var isEnabled
    
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(isEnabled ? Color.brandPrimary : Color.gray.opacity(0.3))
            .foregroundColor(.white)
            .cornerRadius(8)
            .accessibilityAddTraits(.isButton)
            .minimumScaleFactor(0.8)
    }
}

private struct SecondaryButtonStyleModifier: ViewModifier {
    @Environment(\.isEnabled) private var isEnabled
    
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(Color.clear)
            .foregroundColor(isEnabled ? Color.brandPrimary : Color.gray)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isEnabled ? Color.brandPrimary : Color.gray, lineWidth: 1)
            )
            .accessibilityAddTraits(.isButton)
            .minimumScaleFactor(0.8)
    }
}

private struct AdaptiveFontModifier: ViewModifier {
    let style: Font.TextStyle
    let weight: Font.Weight
    @Environment(\.sizeCategory) private var sizeCategory
    
    func body(content: Content) -> some View {
        content
            .font(.system(style, design: .default).weight(weight))
            .lineSpacing(getLineSpacing())
            .minimumScaleFactor(0.7)
    }
    
    private func getLineSpacing() -> CGFloat {
        switch sizeCategory {
        case .accessibilityExtraExtraExtraLarge: return 12
        case .accessibilityExtraExtraLarge: return 10
        case .accessibilityExtraLarge: return 8
        case .accessibilityLarge: return 6
        default: return 4
        }
    }
}

private struct AccessibilityStyleModifier: ViewModifier {
    let label: String
    let hint: String?
    
    func body(content: Content) -> some View {
        content
            .accessibilityLabel(Text(label))
            .accessibilityHint(hint.map(Text.init))
            .accessibilityAddTraits(.isButton)
            .accessibilityRemoveTraits(.isImage)
            .accessibilityElement(children: .combine)
    }
}

// MARK: - Adaptive Layout Components
public struct AdaptiveStack<Content: View>: View {
    private let axis: Axis.Set
    private let spacing: CGFloat
    private let content: () -> Content
    @Environment(\.sizeCategory) private var sizeCategory
    
    public init(
        axis: Axis.Set = .vertical,
        spacing: CGFloat = 8,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.axis = axis
        self.spacing = spacing
        self.content = content
    }
    
    public var body: some View {
        GeometryReader { geometry in
            Group {
                if shouldUseVerticalLayout(geometry: geometry) {
                    VStack(spacing: adaptiveSpacing) {
                        content()
                    }
                } else {
                    HStack(spacing: adaptiveSpacing) {
                        content()
                    }
                }
            }
        }
    }
    
    private var adaptiveSpacing: CGFloat {
        switch sizeCategory {
        case .accessibilityExtraExtraExtraLarge: return spacing * 2.0
        case .accessibilityExtraExtraLarge: return spacing * 1.75
        case .accessibilityExtraLarge: return spacing * 1.5
        case .accessibilityLarge: return spacing * 1.25
        default: return spacing
        }
    }
    
    private func shouldUseVerticalLayout(geometry: GeometryProxy) -> Bool {
        let isCompactWidth = geometry.size.width < 500
        let isAccessibilityCategory = sizeCategory.isAccessibilityCategory
        return axis == .vertical || isCompactWidth || isAccessibilityCategory
    }
}

// MARK: - Helper Functions
private func adaptiveSpacing(_ geometry: GeometryProxy, _ sizeCategory: ContentSizeCategory) -> CGFloat {
    let baseSpacing: CGFloat = 8
    let widthMultiplier = geometry.size.width < 375 ? 0.8 : 1.0
    let accessibilityMultiplier = sizeCategory.isAccessibilityCategory ? 1.5 : 1.0
    return baseSpacing * widthMultiplier * accessibilityMultiplier
}

private func adaptivePadding(_ geometry: GeometryProxy) -> EdgeInsets {
    let baseValue: CGFloat = geometry.size.width < 375 ? 16 : 24
    return EdgeInsets(
        top: baseValue,
        leading: baseValue,
        bottom: baseValue,
        trailing: baseValue
    )
}