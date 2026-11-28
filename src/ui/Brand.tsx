/** The Suit Up mark (a short looping video, or its still frame when motion is reduced) and the wordmark. */
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Logo({ size }: { size: number }) {
  const style = { width: size, height: size };
  if (reduceMotion) return <img className="logo" style={style} src="./brand/logo-poster.png" alt="" />;
  return (
    <video className="logo" style={style} autoPlay loop muted playsInline disablePictureInPicture poster="./brand/logo-poster.png" aria-hidden="true">
      <source src="./brand/logo.webm" type="video/webm" />
      <source src="./brand/logo.mp4" type="video/mp4" />
    </video>
  );
}

export function Brand({ size = 28, onClick }: { size?: number; onClick?: () => void }) {
  const body = (
    <>
      <Logo size={size} />
      <span className="brand-name">Suit Up</span>
    </>
  );
  return onClick ? (
    <button className="brand" onClick={onClick} title="All documents">
      {body}
    </button>
  ) : (
    <span className="brand">{body}</span>
  );
}
