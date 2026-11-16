export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className="mb-3 text-[#9c8f80]"
      >
        <circle
          cx="32"
          cy="32"
          r="26"
          stroke="#2d251d"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <path
          d="M18 39 C18 29, 26 22, 32 22 C38 22, 46 29, 46 39 Z"
          fill="#211c16"
          stroke="#e59a28"
          strokeOpacity="0.6"
          strokeWidth="1.5"
        />
        <path
          d="M20 39 H44"
          stroke="#e59a28"
          strokeOpacity="0.8"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="28" cy="31" r="1.5" fill="#e59a28" fillOpacity="0.7" />
        <circle cx="35" cy="34" r="1.5" fill="#e59a28" fillOpacity="0.5" />
      </svg>
      <p className="text-sm font-medium text-[#f4ede2]">{title}</p>
      <p className="mt-1 text-xs text-[#9c8f80] max-w-md">{description}</p>
    </div>
  );
}
