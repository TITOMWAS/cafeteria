import React from 'react';

// Catches render-time crashes anywhere below it and shows a recovery screen
// instead of a blank page.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack);
  }

  handleReload = () => window.location.reload();

  handleHome = () => {
    this.setState({ error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.error) {
      return (
        <div className="page-padding">
          <div className="empty-state" style={{ minHeight: '60vh' }}>
            <div className="empty-state-icon">🍽️</div>
            <h3 style={{ fontFamily: 'var(--font-heading)' }}>Something went wrong</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: 420 }}>
              An unexpected error occurred while rendering this page. Your data is safe — try reloading.
            </p>
            <pre style={{
              fontSize: '0.72rem', color: 'var(--red)', background: 'var(--bg-sunken)',
              padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', maxWidth: 480,
              whiteSpace: 'pre-wrap', textAlign: 'left',
            }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" onClick={this.handleHome}>Back to Home</button>
              <button className="btn btn-secondary" onClick={this.handleReload}>Reload</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
