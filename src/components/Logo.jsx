// The WGate app icon (the blue shield with the gate), used in headers and sign-in screens.
export default function Logo({ size = 32, className = '' }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icon-192.png`}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-lg ${className}`}
    />
  );
}