import React from 'react';

interface HubLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTextInIcon?: boolean;
  className?: string;
}

export const HubLogo: React.FC<HubLogoProps> = ({
  size = 'md',
  showTextInIcon = true,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-[9px]',
    md: 'w-10 h-10 rounded-[11px]',
    lg: 'w-14 h-14 rounded-[15px]',
    xl: 'w-20 h-20 rounded-[22px]',
  }[size];

  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center shrink-0 shadow-md select-none ${sizeClasses} ${className}`}
      style={{
        background:
          'linear-gradient(225deg, #27d7c4 0%, #19a9d8 38%, #1d64d6 74%, #203299 100%)',
      }}
    >
      {/* Inner subtle bevel frame matching the uploaded HUB app icon */}
      <div className="absolute inset-[7%] rounded-[22%] bg-black/10 pointer-events-none border border-white/15" />

      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full relative z-10"
      >
        <defs>
          <linearGradient id="hubRibbonGrad1" x1="20" y1="20" x2="180" y2="150" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#D7FFFE" />
            <stop offset="100%" stopColor="#8BF3EE" />
          </linearGradient>
          <linearGradient id="hubRibbonGrad2" x1="170" y1="30" x2="30" y2="145" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="50%" stopColor="#C8FBF9" />
            <stop offset="100%" stopColor="#7DE8E4" />
          </linearGradient>
          <filter id="hubSoftShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0A194E" floodOpacity="0.32" />
          </filter>
        </defs>

        <g filter="url(#hubSoftShadow)">
          {/* Left outer curved stroke */}
          <path
            d="M64 56 C 78 78, 78 106, 62 126"
            stroke="url(#hubRibbonGrad1)"
            strokeWidth="11"
            strokeLinecap="round"
          />

          {/* Left main pillar loop of the H */}
          <path
            d="M72 34 C 96 64, 96 112, 74 136 C 64 146, 56 134, 65 118"
            stroke="url(#hubRibbonGrad1)"
            strokeWidth="12.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Right main pillar loop of the H */}
          <path
            d="M116 74 C 125 46, 136 32, 145 40 C 153 47, 145 66, 136 80"
            stroke="url(#hubRibbonGrad2)"
            strokeWidth="12.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Right lower pillar and outer curve of the H */}
          <path
            d="M116 90 C 115 114, 122 138, 134 138 C 146 138, 138 106, 146 84"
            stroke="url(#hubRibbonGrad2)"
            strokeWidth="12.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Upper sweeping wave crossbar */}
          <path
            d="M90 76 C 118 82, 138 56, 168 54"
            stroke="url(#hubRibbonGrad1)"
            strokeWidth="13"
            strokeLinecap="round"
          />

          {/* Lower sweeping wave crossbar */}
          <path
            d="M36 113 C 66 112, 86 90, 115 92"
            stroke="url(#hubRibbonGrad2)"
            strokeWidth="13"
            strokeLinecap="round"
          />
        </g>

        {showTextInIcon && (
          <text
            x="100"
            y="175"
            textAnchor="middle"
            fill="#FFFFFF"
            fontFamily="'Syne', 'Plus Jakarta Sans', sans-serif"
            fontWeight="800"
            fontSize="36"
            letterSpacing="4"
          >
            HUB
          </text>
        )}
      </svg>
    </div>
  );
};
