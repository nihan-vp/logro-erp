import { useEffect, useState } from 'react';
import { ToastContainer, type ToastPosition } from 'react-toastify';

const MOBILE_QUERY = '(max-width: 767px)';

export default function AppToasts() {
  const [position, setPosition] = useState<ToastPosition>('top-right');

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const updatePosition = () => {
      setPosition(media.matches ? 'top-center' : 'top-right');
    };

    updatePosition();
    media.addEventListener('change', updatePosition);
    return () => media.removeEventListener('change', updatePosition);
  }, []);

  return (
    <ToastContainer
      position={position}
      autoClose={3200}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      pauseOnFocusLoss={false}
      draggable={false}
      pauseOnHover
      theme="light"
      limit={3}
      role="alert"
      aria-live="polite"
      className="app-toast-container"
      toastClassName="app-toast"
      progressClassName="app-toast-progress"
    />
  );
}
