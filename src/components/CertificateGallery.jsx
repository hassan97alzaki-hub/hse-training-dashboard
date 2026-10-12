import { useState } from 'react';
import { X, Download } from 'lucide-react';
import { CertificateUpload } from './CertificateUpload.jsx';

/**
 * CertificateGallery Modal
 *
 * Displays certificate metadata and images/URLs.
 * Features:
 * - View local image or external URL
 * - Tabs if both exist (Local / External)
 * - Display summary, issuer, dates
 * - Download local image
 * - Edit/add metadata
 *
 * Props:
 * - certificate: cert data from gallery (or null to add new)
 * - certificateNumber: for identification (from table click)
 * - onClose: callback to close modal
 * - onSave: callback when certificate metadata is saved
 * - isNewCertificate: true if adding new, false if viewing existing
 */
export function CertificateGallery({
  certificate = null,
  certificateNumber = '',
  onClose,
  onSave,
  isNewCertificate = false,
}) {
  const [showEditForm, setShowEditForm] = useState(isNewCertificate);
  const [activeTab, setActiveTab] = useState(certificate?.imageData ? 'local' : 'url');

  const handleSave = (data) => {
    onSave(data);
    setShowEditForm(false);
  };

  if (showEditForm) {
    return (
      <CertificateUpload
        certificate={certificate}
        onSave={handleSave}
        onCancel={() => setShowEditForm(false)}
      />
    );
  }

  if (!certificate) {
    return (
      <div style={styles.modal}>
        <div style={styles.content}>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
          <div style={styles.emptyState}>
            <p>No certificate data found.</p>
            <button
              onClick={() => setShowEditForm(true)}
              style={{ ...styles.btn, ...styles.btnPrimary }}
            >
              Add Certificate Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasLocalImage = !!certificate.imageData;
  const hasExternalUrl = !!certificate.imageUrl;
  const showTabs = hasLocalImage && hasExternalUrl;

  const downloadImage = () => {
    if (!certificate.imageData) return;

    const link = document.createElement('a');
    link.href = certificate.imageData;
    link.download = `${certificateNumber || certificate.certificateNumber}.png`;
    link.click();
  };

  return (
    <div style={styles.modal}>
      <div style={styles.content}>
        <button style={styles.closeBtn} onClick={onClose}>
          <X size={20} />
        </button>

        <h3 style={styles.title}>{certificate.title}</h3>

        {certificate.issuer && (
          <p style={styles.issuer}>Issued by: {certificate.issuer}</p>
        )}

        <div style={styles.metadata}>
          {certificate.issuedDate && (
            <div style={styles.metadataItem}>
              <strong>Issued:</strong> {certificate.issuedDate}
            </div>
          )}
          {certificate.expiryDate && (
            <div style={styles.metadataItem}>
              <strong>Expires:</strong> {certificate.expiryDate}
            </div>
          )}
        </div>

        {certificate.summary && (
          <div style={styles.summary}>
            <strong>Summary:</strong>
            <p>{certificate.summary}</p>
          </div>
        )}

        {showTabs && (
          <div style={styles.tabs}>
            <button
              style={{
                ...styles.tab,
                borderBottom: activeTab === 'local' ? '2px solid #2563eb' : '1px solid #d1d5db',
                color: activeTab === 'local' ? '#2563eb' : '#6b7280',
              }}
              onClick={() => setActiveTab('local')}
            >
              Local Image
            </button>
            <button
              style={{
                ...styles.tab,
                borderBottom: activeTab === 'url' ? '2px solid #2563eb' : '1px solid #d1d5db',
                color: activeTab === 'url' ? '#2563eb' : '#6b7280',
              }}
              onClick={() => setActiveTab('url')}
            >
              External Link
            </button>
          </div>
        )}

        {(activeTab === 'local' && hasLocalImage) && (
          <div style={styles.imageContainer}>
            <img
              src={certificate.imageData}
              alt={certificate.title}
              style={styles.image}
            />
            <button
              onClick={downloadImage}
              style={{ ...styles.btn, ...styles.btnSecondary, marginTop: '12px' }}
            >
              <Download size={16} /> Download
            </button>
          </div>
        )}

        {(activeTab === 'url' && hasExternalUrl) && (
          <div style={styles.urlContainer}>
            <a
              href={certificate.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              {certificate.imageUrl}
            </a>
            <p style={styles.hint}>Click above to open in a new window</p>
          </div>
        )}

        {!hasLocalImage && !hasExternalUrl && (
          <p style={styles.empty}>No image or URL available.</p>
        )}

        <div style={styles.actions}>
          <button
            onClick={() => setShowEditForm(true)}
            style={{ ...styles.btn, ...styles.btnPrimary }}
          >
            {certificate.imageData || certificate.imageUrl ? 'Edit' : 'Add Image'}
          </button>
          <button
            onClick={onClose}
            style={{ ...styles.btn, ...styles.btnGhost }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '700px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    color: '#6b7280',
    transition: 'color 0.2s',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  issuer: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    color: '#6b7280',
  },
  metadata: {
    display: 'flex',
    gap: '16px',
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '4px',
  },
  metadataItem: {
    fontSize: '14px',
    color: '#374151',
  },
  summary: {
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '4px',
    borderLeft: '3px solid #2563eb',
  },
  tabs: {
    display: 'flex',
    gap: '16px',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: '16px',
  },
  tab: {
    padding: '8px 0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  imageContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '16px',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '400px',
    borderRadius: '4px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  urlContainer: {
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '4px',
    marginBottom: '16px',
  },
  link: {
    display: 'block',
    color: '#2563eb',
    textDecoration: 'none',
    wordBreak: 'break-all',
    fontSize: '14px',
    marginBottom: '8px',
  },
  hint: {
    margin: '0',
    fontSize: '12px',
    color: '#9ca3af',
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: '14px',
    margin: '16px 0',
  },
  emptyState: {
    textAlign: 'center',
    padding: '24px',
    color: '#9ca3af',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '16px',
  },
  btn: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  btnSecondary: {
    backgroundColor: '#6b7280',
    color: '#ffffff',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
  },
};
