import React from 'react';

const HistoryDrawer = ({
  scanHistory,
  onClearHistory,
  onClose,
  onDeleteHistoryItem
}) => {
  const closeWhenBackdropIsClicked = (event) => {
    // Only close for backdrop clicks, not clicks inside the drawer itself.
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="history-overlay" role="presentation" onMouseDown={closeWhenBackdropIsClicked}>
      <section className="surface-card history-drawer" aria-label="Scan history">
        <div className="history-drawer-header">
          <div>
            <p className="dashboard-placeholder-label">Recent Scans</p>
            <h2>Scan History</h2>
          </div>
          <div className="history-actions">
            <button className="button-pill button-muted history-clear-button" onClick={onClearHistory} disabled={scanHistory.length === 0} type="button">
              Clear All
            </button>
            <button className="button-pill button-muted history-close-button" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>
        {scanHistory.length === 0 ? (
          <p className="history-empty">No scans yet. Run a photo scan and it will appear here.</p>
        ) : (
          <div className="history-list">
            {scanHistory.map((scan) => (
              <article key={scan.id} className="surface-card history-item">
                {scan.imageUrl ? (
                  <img src={scan.imageUrl} alt="Previous scan thumbnail" />
                ) : (
                  <div className="history-thumbnail-placeholder" aria-hidden="true">
                    Upload
                  </div>
                )}
                <div>
                  <strong>{scan.faceCount} face{scan.faceCount === 1 ? '' : 's'} detected</strong>
                  <p>{scan.timestamp}</p>
                  {scan.processingTimeMs ? <p>{scan.processingTimeMs}ms processing time</p> : null}
                </div>
                <button className="button-pill button-muted history-delete-button" onClick={() => onDeleteHistoryItem(scan.id)} type="button">
                  Delete
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default HistoryDrawer;
