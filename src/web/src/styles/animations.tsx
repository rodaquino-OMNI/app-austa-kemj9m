import { keyframes, css, SerializedStyles } from '@emotion/react'; // @emotion/react ^11.11.0
import React from 'react';

// Animation Duration Constants
export const ANIMATION_DURATION_FAST = '150ms';
export const ANIMATION_DURATION_NORMAL = '300ms';
export const ANIMATION_DURATION_SLOW = '500ms';

// Animation Easing Functions
export const ANIMATION_EASING_DEFAULT = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const ANIMATION_EASING_ACCELERATE = 'cubic-bezier(0.4, 0, 1, 1)';
export const ANIMATION_EASING_DECELERATE = 'cubic-bezier(0, 0, 0.2, 1)';

// Accessibility Media Query
export const ANIMATION_REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';

// Animation Types
interface AnimationOptions {
  duration?: string;
  easing?: string;
  delay?: string;
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
  iterationCount?: number | 'infinite';
}

interface TransitionOptions {
  duration?: string;
  easing?: string;
  delay?: string;
  properties?: string[];
}

// Keyframe Animations
export const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

export const fadeOut = keyframes`
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
`;

export const slideIn = keyframes`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
`;

export const slideOut = keyframes`
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(100%);
  }
`;

export const pulse = keyframes`
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
`;

export const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

// Animation Creation Helper
export const createAnimation = (
  name: keyframes,
  options: AnimationOptions = {}
): SerializedStyles => {
  const {
    duration = ANIMATION_DURATION_NORMAL,
    easing = ANIMATION_EASING_DEFAULT,
    delay = '0ms',
    direction = 'normal',
    fillMode = 'both',
    iterationCount = 1
  } = options;

  return css`
    animation: ${name} ${duration} ${easing} ${delay} ${iterationCount} ${direction} ${fillMode};
    will-change: transform, opacity;
    
    ${ANIMATION_REDUCED_MOTION} {
      animation: none;
      transition: none;
    }
  `;
};

// Transition Creation Helper
export const createTransition = (
  properties: string[],
  options: TransitionOptions = {}
): SerializedStyles => {
  const {
    duration = ANIMATION_DURATION_NORMAL,
    easing = ANIMATION_EASING_DEFAULT,
    delay = '0ms'
  } = options;

  const transitionValue = properties
    .map(prop => `${prop} ${duration} ${easing} ${delay}`)
    .join(', ');

  return css`
    transition: ${transitionValue};
    will-change: ${properties.join(', ')};
    
    ${ANIMATION_REDUCED_MOTION} {
      transition: none;
    }
  `;
};

// Animation Wrapper Component
interface AnimationWrapperProps {
  children: React.ReactNode;
  animation: keyframes;
  options?: AnimationOptions;
  reducedMotion?: boolean;
}

export class AnimationWrapper extends React.Component<AnimationWrapperProps> {
  private readonly shouldReduceMotion: boolean;

  constructor(props: AnimationWrapperProps) {
    super(props);
    this.shouldReduceMotion = props.reducedMotion ?? (
      typeof window !== 'undefined' 
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
        : false
    );
  }

  applyAnimation(animationName: keyframes): SerializedStyles {
    if (this.shouldReduceMotion) {
      return css`
        animation: none;
        transition: none;
      `;
    }

    return createAnimation(animationName, this.props.options);
  }

  render() {
    return (
      <div css={this.applyAnimation(this.props.animation)}>
        {this.props.children}
      </div>
    );
  }
}

// Common Animation Presets
export const fadeInAnimation = createAnimation(fadeIn, {
  duration: ANIMATION_DURATION_NORMAL,
  easing: ANIMATION_EASING_DECELERATE
});

export const fadeOutAnimation = createAnimation(fadeOut, {
  duration: ANIMATION_DURATION_NORMAL,
  easing: ANIMATION_EASING_ACCELERATE
});

export const slideInAnimation = createAnimation(slideIn, {
  duration: ANIMATION_DURATION_NORMAL,
  easing: ANIMATION_EASING_DECELERATE
});

export const slideOutAnimation = createAnimation(slideOut, {
  duration: ANIMATION_DURATION_NORMAL,
  easing: ANIMATION_EASING_ACCELERATE
});

export const pulseAnimation = createAnimation(pulse, {
  duration: ANIMATION_DURATION_SLOW,
  easing: ANIMATION_EASING_DEFAULT,
  iterationCount: 'infinite'
});

export const spinAnimation = createAnimation(spin, {
  duration: ANIMATION_DURATION_NORMAL,
  easing: ANIMATION_EASING_DEFAULT,
  iterationCount: 'infinite'
});