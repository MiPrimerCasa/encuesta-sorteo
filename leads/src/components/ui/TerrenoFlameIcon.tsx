interface TerrenoFlameIconProps {
  className?: string;
  size?: number;
}

/** Llamita animada — interés terreno / derivación a supervisor. */
export function TerrenoFlameIcon({ className = '', size = 14 }: TerrenoFlameIconProps) {
  return (
    <svg
      className={`mpc-flame-icon shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="mpc-flame-outer"
        d="M12 22C8.5 19.5 5 16 5 11c0-3.2 1.8-5.5 3.5-7.5.8 1.8 2.2 3 3.5 4.5C13 7 14.5 5 16 2c2 2.8 4 5.5 4 9 0 5-3.5 8.5-8 11z"
        fill="currentColor"
      />
      <path
        className="mpc-flame-inner"
        d="M12 19.5c-2.2-1.6-4-3.8-4-6.8 0-2 1.4-3.6 2.8-5 .6 1.4 1.4 2.4 2.2 3.4.5-1.4 1.3-2.4 2.2-3.8 1 1.4 2 2.8 2 5.2 0 2.8-2.2 5.2-5.2 7z"
        fill="#FEF9C3"
        opacity="0.95"
      />
    </svg>
  );
}
