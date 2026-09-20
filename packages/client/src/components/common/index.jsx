/**
 * Reusable UI Primitives — Button, Input, Card, Modal, Badge, Spinner.
 * All styled with design tokens from index.css.
 */

import './common.css';

// ─── Button ───
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  onClick,
  className = '',
  ...props
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${fullWidth ? 'btn--full' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading && <span className="btn__spinner" />}
      {children}
    </button>
  );
}

// ─── Input ───
export function Input({
  label,
  error,
  id,
  type = 'text',
  className = '',
  ...props
}) {
  return (
    <div className={`input-group ${error ? 'input-group--error' : ''} ${className}`}>
      {label && <label htmlFor={id} className="input-group__label">{label}</label>}
      <input
        id={id}
        type={type}
        className="input-group__input"
        {...props}
      />
      {error && <span className="input-group__error">{error}</span>}
    </div>
  );
}

// ─── Card ───
export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div className={`card ${hover ? 'card--hover' : ''} ${className}`} {...props}>
      {children}
    </div>
  );
}

Card.Header = function CardHeader({ children, className = '' }) {
  return <div className={`card__header ${className}`}>{children}</div>;
};

Card.Body = function CardBody({ children, className = '' }) {
  return <div className={`card__body ${className}`}>{children}</div>;
};

// ─── Badge ───
export function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span className={`badge badge--${variant} ${className}`}>
      {children}
    </span>
  );
}

// ─── Spinner ───
export function Spinner({ size = 'md', className = '' }) {
  return <div className={`spinner spinner--${size} ${className}`} />;
}

// ─── Modal ───
export function Modal({ isOpen, onClose, title, children, className = '' }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${className}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

// ─── Stat Card ───
export function StatCard({ label, value, icon, trend, className = '' }) {
  return (
    <div className={`stat-card ${className}`}>
      {icon && <div className="stat-card__icon">{icon}</div>}
      <div className="stat-card__content">
        <div className="stat-card__value">{value}</div>
        <div className="stat-card__label">{label}</div>
      </div>
      {trend && (
        <div className={`stat-card__trend stat-card__trend--${trend > 0 ? 'up' : 'down'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}

// ─── Empty State ───
export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__desc">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
