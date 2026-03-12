import { createPortal } from 'react-dom';

import { useAppDispatch, useAppSelector } from '@/store/store';
import { dismissToast, selectToasts } from '@/store/slices/toast.slice';
import { Toast } from './Toast';
import styles from './ToastContainer.module.css';

export const ToastContainer = () => {
  const toasts = useAppSelector(selectToasts);
  const dispatch = useAppDispatch();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className={styles.container} role="region" aria-label="Notifications">
      {toasts.map((toastItem) => (
        <Toast
          key={toastItem.id}
          id={toastItem.id}
          variant={toastItem.variant}
          title={toastItem.title}
          description={toastItem.description}
          onDismiss={(id) => dispatch(dismissToast(id))}
        />
      ))}
    </div>,
    document.body,
  );
};
