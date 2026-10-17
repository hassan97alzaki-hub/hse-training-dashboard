import { useState } from 'react';
import { fileToBase64, validateImageFile, validateImageUrl } from '../lib/certificateGallery.js';

/**
 * CertificateUpload Component
 *
 * Form to add/edit certificate metadata:
 * - Certificate Number (required, unique)
 * - Title (required)
 * - Local image upload (JPEG/PNG, max 2 MB) OR external URL
 * - Summary (max 200 chars)
 * - Metadata (issuer, dates)
 *
 * Props:
 * - certificate: existing cert (for edit mode) or null (for add mode)
 * - onSave: callback with certificate data
 * - onCancel: callback to close form
 */
export function CertificateUpload({ certificate = null, onSave, onCancel, t = (key) => key }) {
  const [formData, setFormData] = useState({
    certificateNumber: certificate?.certificateNumber || '',
    title: certificate?.title || '',
    imageData: certificate?.imageData || null,
    imageUrl: certificate?.imageUrl || '',
    summary: certificate?.summary || '',
    issuer: certificate?.issuer || '',
    issuedDate: certificate?.issuedDate || '',
    expiryDate: certificate?.expiryDate || '',
  });

  const [uploadMode, setUploadMode] = useState(
    certificate?.imageData ? 'upload' : (certificate?.imageUrl ? 'url' : 'upload')
  );
  const [preview, setPreview] = useState(certificate?.imageData || null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageUpload = async (e) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    try {
      setIsLoading(true);
      const base64 = await fileToBase64(file);
      setPreview(base64);
      setFormData(prev => ({
        ...prev,
        imageData: base64,
        imageUrl: '', // clear URL when uploading
      }));
    } catch (err) {
      setError('Failed to read file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUrlChange = (e) => {
    const url = e.target.value;
    setFormData(prev => ({
      ...prev,
      imageUrl: url,
      imageData: null, // clear local when using URL
    }));
    setPreview(null);
  };

  const handleSave = () => {
    setError('');

    // Validation
    if (!formData.certificateNumber.trim()) {
      setError('Certificate Number is required');
      return;
    }

    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    if (uploadMode === 'upload' && !formData.imageData) {
      setError('Please upload an image');
      return;
    }

    if (uploadMode === 'url') {
      if (!formData.imageUrl.trim()) {
        setError('Please enter an image URL');
        return;
      }
      const urlValidation = validateImageUrl(formData.imageUrl);
      if (!urlValidation.valid) {
        setError(urlValidation.error);
        return;
      }
    }

    if (formData.summary && formData.summary.length > 200) {
      setError('Summary must be 200 characters or less');
      return;
    }

    onSave({
      certificateNumber: formData.certificateNumber.trim(),
      title: formData.title.trim(),
      imageData: uploadMode === 'upload' ? formData.imageData : null,
      imageUrl: uploadMode === 'url' ? formData.imageUrl.trim() : '',
      summary: formData.summary.trim(),
      issuer: formData.issuer.trim(),
      issuedDate: formData.issuedDate,
      expiryDate: formData.expiryDate,
    });
  };

  return (
    <div style={styles.modal}>
      <div style={styles.content}>
        <h3 style={styles.title}>
          {certificate ? t('editCertificate') : t('addNewCertificate')}
        </h3>

        {error && (
          <div style={styles.error}>{error}</div>
        )}

        <div style={styles.formGrid}>
          <label style={styles.label}>
            {t('certificateNumberRequired')}
            <input
              type="text"
              name="certificateNumber"
              value={formData.certificateNumber}
              onChange={handleInputChange}
              placeholder="e.g., CERT001-2026"
              disabled={!!certificate} // prevent edit
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            {t('titleRequired')}
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="e.g., H2S Safety Certificate"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            {t('issuer')}
            <input
              type="text"
              name="issuer"
              value={formData.issuer}
              onChange={handleInputChange}
              placeholder="e.g., SafetyPlus Training"
              style={styles.input}
            />
          </label>
        </div>

        <div style={styles.formGrid}>
          <label style={styles.label}>
            Issued Date
            <input
              type="date"
              name="issuedDate"
              value={formData.issuedDate}
              onChange={handleInputChange}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Expiry Date
            <input
              type="date"
              name="expiryDate"
              value={formData.expiryDate}
              onChange={handleInputChange}
              style={styles.input}
            />
          </label>
        </div>

        <div style={styles.divider} />

        <div style={styles.modeSelector}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              checked={uploadMode === 'upload'}
              onChange={() => setUploadMode('upload')}
            />
            {t('uploadImage')}
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              checked={uploadMode === 'url'}
              onChange={() => setUploadMode('url')}
            />
            {t('externalUrl')}
          </label>
        </div>

        {uploadMode === 'upload' ? (
          <div>
            <label style={styles.label}>
              {t('certificateImage')}
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleImageUpload}
                disabled={isLoading}
                style={styles.fileInput}
              />
            </label>

            {preview && (
              <div style={styles.previewContainer}>
                <img src={preview} alt="Certificate Preview" style={styles.previewImage} />
              </div>
            )}
          </div>
        ) : (
          <label style={styles.label}>
            {t('imageUrl')}
            <input
              type="url"
              name="imageUrl"
              value={formData.imageUrl}
              onChange={handleImageUrlChange}
              placeholder="https://example.com/certificate.jpg"
              style={styles.input}
            />
          </label>
        )}

        <div style={styles.divider} />

        <label style={styles.label}>
          {t('summaryCount').replace('{count}', formData.summary.length)}
          <textarea
            name="summary"
            value={formData.summary}
            onChange={handleInputChange}
            placeholder={t('summaryPlaceholder')}
            rows="3"
            maxLength="200"
            style={styles.textarea}
          />
        </label>

        <div style={styles.actions}>
          <button
            onClick={handleSave}
            style={{ ...styles.btn, ...styles.btnPrimary }}
            disabled={isLoading}
          >
            {certificate ? t('update') : t('addCertificate')}
          </button>
          <button
            onClick={onCancel}
            style={{ ...styles.btn, ...styles.btnGhost }}
          >
            {t('cancel')}
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
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px',
    borderRadius: '4px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
    marginBottom: '12px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    cursor: 'pointer',
    marginRight: '16px',
  },
  input: {
    marginTop: '4px',
    padding: '8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  },
  fileInput: {
    marginTop: '4px',
    padding: '8px',
    fontSize: '14px',
  },
  textarea: {
    marginTop: '4px',
    padding: '8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'monospace',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  previewContainer: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '4px',
    textAlign: 'center',
  },
  previewImage: {
    maxWidth: '100%',
    maxHeight: '300px',
    borderRadius: '4px',
  },
  divider: {
    height: '1px',
    backgroundColor: '#e5e7eb',
    margin: '16px 0',
  },
  modeSelector: {
    display: 'flex',
    gap: '16px',
    marginBottom: '16px',
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
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
  },
};
