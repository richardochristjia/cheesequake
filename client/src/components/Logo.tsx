import { useId } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Cheesequake "Telemetry Badge" brand mark: Basque cheesecake slice with
 * caramelized amber top, cream body, seismic pulse, and radar rings.
 */
export function Logo({ size = 36, className }: LogoProps) {
  const clipId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      data-testid="cheesequake-logo"
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M14 34.5 L26 20.5 C28.5 17.8 31.5 16.8 34.5 18.2 C37.2 19.4 39.2 18.8 41.8 20.4 C44.2 21.8 47.4 22.8 50 25 L14 34.5 Z" />
        </clipPath>
      </defs>

      {/* Badge background */}
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="15.5"
        fill="#211c16"
        stroke="#2d251d"
        strokeWidth="2"
      />

      {/* Concentric radar rings */}
      <circle cx="32" cy="32" r="24" stroke="#cfc3b4" strokeOpacity="0.45" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="17.5" stroke="#cfc3b4" strokeOpacity="0.28" strokeWidth="1.1" />
      <circle cx="32" cy="32" r="11" stroke="#cfc3b4" strokeOpacity="0.2" strokeWidth="1" />

      {/* Radar crosshairs */}
      <path
        d="M32 4 V16 M32 48 V60 M4 32 H16 M48 32 H60"
        stroke="#cfc3b4"
        strokeOpacity="0.34"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Basque cheesecake caramelized top */}
      <g clipPath={`url(#${clipId})`}>
        <path d="M12 15 H52 V37 H12 Z" fill="#b87718" />
        <path
          d="M13 31 C19 26, 25 29, 31 24 C36 20, 42 25, 51 22 L51 36 L13 36 Z"
          fill="#e59a28"
        />
        <path
          d="M21 23 C26 20, 31 23, 37 19.5 C41 17.5, 45 21, 50 20 L50 24.5 C44 23, 38 25.5, 32 23.5 C27 22, 23 25.5, 19 26 Z"
          fill="#7a4b10"
          fillOpacity="0.65"
        />
        <path
          d="M15 33 C21 29.5, 28 31.5, 35 28 C41 25, 46 27.5, 51 25.5 L51 36 L15 36 Z"
          fill="#b87718"
          fillOpacity="0.7"
        />
      </g>
      <path
        d="M14 34.5 L26 20.5 C28.5 17.8 31.5 16.8 34.5 18.2 C37.2 19.4 39.2 18.8 41.8 20.4 C44.2 21.8 47.4 22.8 50 25"
        stroke="#e59a28"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Cheesecake cream body & amber crust */}
      <path
        d="M14 35 L50 25 L50 39 L14 49 Z"
        fill="#f4ede2"
        stroke="#e59a28"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 35 L50 25" stroke="#b87718" strokeWidth="2.2" strokeLinecap="round" />

      {/* Seismic pulse waveform */}
      <path
        d="M14.5 41.8 L26 38.6 L28.4 36.2 L30.4 40.8 L33 27.5 L35.6 45.2 L38 33.8 L40 36.6 L42.4 34.1 L49.5 32.1"
        stroke="#110e0b"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
