/**
 * Certificate Gallery: metadata store for certificate images, URLs, and summaries.
 *
 * Each certificate is identified by Certificate_Number and stores:
 * - Local image (base64 JPEG/PNG, max 2 MB)
 * - External URL (HTTP/HTTPS link to certificate)
 * - Summary text (200 chars max)
 * - Metadata (issuer, issued date, expiry date)
 *
 * Initial storage: in-memory Map. Future: localStorage or database.
 */

/**
 * Validate certificate metadata object.
 * @param {object} cert - Certificate data
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateCertificateMetadata(cert) {
  const errors = [];

  if (!cert || typeof cert !== 'object') {
    errors.push('Certificate data is required');
    return { valid: false, errors };
  }

  const { certificateNumber, title, imageData, imageUrl, summary } = cert;

  if (!certificateNumber || typeof certificateNumber !== 'string' || !certificateNumber.trim()) {
    errors.push('Certificate Number is required');
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push('Title is required');
  }

  if (imageData && typeof imageData !== 'string') {
    errors.push('Image data must be a base64 string');
  }

  if (imageUrl && typeof imageUrl !== 'string') {
    errors.push('Image URL must be a string');
  }

  if (!imageData && !imageUrl) {
    errors.push('At least one of image (local upload) or URL (external link) is required');
  }

  if (summary && typeof summary !== 'string') {
    errors.push('Summary must be a string');
  }

  if (summary && summary.length > 200) {
    errors.push('Summary must be 200 characters or less');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a certificate gallery store (in-memory).
 * Returns object with methods to add, get, update, delete, list certificates.
 * @returns {object} Gallery API
 */
export function createCertificateGallery() {
  const store = new Map(); // Certificate_Number → metadata

  return {
    /**
     * Add or update certificate metadata.
     * @param {string} certificateNumber - Unique identifier
     * @param {object} metadata - Certificate data (title, imageData, imageUrl, summary, etc)
     * @returns {{success: boolean, error?: string}}
     */
    set(certificateNumber, metadata) {
      const trimmedNumber = certificateNumber.trim();
      const validation = validateCertificateMetadata({
        certificateNumber: trimmedNumber,
        ...metadata,
      });

      if (!validation.valid) {
        return { success: false, error: validation.errors.join('; ') };
      }

      const existingCert = store.get(trimmedNumber);
      const cert = {
        certificateNumber: trimmedNumber,
        title: metadata.title.trim(),
        imageData: metadata.imageData || null,
        imageUrl: metadata.imageUrl || null,
        summary: metadata.summary?.trim() || '',
        issuer: metadata.issuer?.trim() || '',
        issuedDate: metadata.issuedDate || null,
        expiryDate: metadata.expiryDate || null,
        createdAt: existingCert ? existingCert.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.set(trimmedNumber, cert);
      return { success: true, cert };
    },

    /**
     * Get certificate metadata by number.
     * @param {string} certificateNumber
     * @returns {object|null}
     */
    get(certificateNumber) {
      return store.get(certificateNumber) || null;
    },

    /**
     * Delete certificate.
     * @param {string} certificateNumber
     * @returns {boolean}
     */
    delete(certificateNumber) {
      return store.delete(certificateNumber);
    },

    /**
     * List all certificates.
     * @returns {array}
     */
    list() {
      return Array.from(store.values());
    },

    /**
     * Check if certificate exists.
     * @param {string} certificateNumber
     * @returns {boolean}
     */
    has(certificateNumber) {
      return store.has(certificateNumber);
    },

    /**
     * Get size of store.
     * @returns {number}
     */
    size() {
      return store.size;
    },

    /**
     * Export gallery as JSON (for persistence).
     * @returns {string}
     */
    toJSON() {
      return JSON.stringify(Array.from(store.entries()));
    },

    /**
     * Import gallery from JSON.
     * @param {string} json
     * @returns {{success: boolean, error?: string}}
     */
    fromJSON(json) {
      try {
        const entries = JSON.parse(json);
        if (!Array.isArray(entries)) {
          return { success: false, error: 'Invalid JSON format' };
        }
        store.clear();
        for (const [key, value] of entries) {
          store.set(key, value);
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    /**
     * Clear all certificates.
     */
    clear() {
      store.clear();
    },
  };
}

/**
 * Compress JPEG/PNG image to base64 (simple approach: resize if needed).
 * For Phase 2B.1, we store as-is. Future: add compression/resize logic.
 * @param {File} file - Image file (JPEG/PNG)
 * @returns {Promise<string>} base64 string
 */
export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Validate image file (type, size).
 * @param {File} file
 * @returns {{valid: boolean, error?: string}}
 */
export function validateImageFile(file) {
  if (!file) return { valid: false, error: 'File is required' };

  const maxSizeBytes = 2 * 1024 * 1024; // 2 MB
  if (file.size > maxSizeBytes) {
    return { valid: false, error: 'Image must be 2 MB or smaller' };
  }

  const allowedTypes = ['image/jpeg', 'image/png'];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Only JPEG and PNG images are allowed' };
  }

  return { valid: true };
}

/**
 * Validate external image URL.
 * @param {string} url
 * @returns {{valid: boolean, error?: string}}
 */
export function validateImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must start with http:// or https://' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

// ===== Database-aware async functions =====

import { getDbService } from './db/dbService.js';

/**
 * Save certificate metadata to database.
 * @param {object} metadata - {certificateNumber, title, imageData, imageUrl, summary, issuer, issuedDate, expiryDate}
 * @returns {Promise<{success: boolean, cert?: object, error?: string}>}
 */
export async function saveCertificateWithDb(metadata) {
  const db = getDbService();

  // Validate
  const validation = validateCertificateMetadata({
    certificateNumber: metadata.certificateNumber,
    ...metadata,
  });

  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  const certNumber = metadata.certificateNumber.trim();

  // Check if exists
  const existing = await db.certificates.getByNumber(certNumber);

  const cert = {
    id: existing?.id || `cert_${certNumber}_${Date.now()}`,
    certificate_number: certNumber,
    title: metadata.title.trim(),
    image_data: metadata.imageData || null,
    image_url: metadata.imageUrl || null,
    summary: metadata.summary?.trim() || '',
    issuer: metadata.issuer?.trim() || '',
    issued_at: metadata.issuedDate || null,
    expires_at: metadata.expiryDate || null,
  };

  try {
    if (existing) {
      await db.certificates.update(existing.id, cert);
    } else {
      await db.certificates.add(cert);
    }
    return { success: true, cert };
  } catch (err) {
    return { success: false, error: `Failed to save certificate: ${err.message}` };
  }
}

/**
 * Get certificate from database.
 * @param {string} certificateNumber
 * @returns {Promise<object|null>}
 */
export async function getCertificateWithDb(certificateNumber) {
  const db = getDbService();
  try {
    return await db.certificates.getByNumber(certificateNumber.trim());
  } catch (err) {
    console.error('Failed to get certificate from DB:', err);
    return null;
  }
}

/**
 * Delete certificate from database.
 * @param {string} certificateNumber
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteCertificateWithDb(certificateNumber) {
  const db = getDbService();

  const existing = await db.certificates.getByNumber(certificateNumber.trim());
  if (!existing) {
    return { success: false, error: `Certificate "${certificateNumber}" not found` };
  }

  try {
    await db.certificates.delete(existing.id);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to delete certificate: ${err.message}` };
  }
}

/**
 * Load all certificates from database.
 * @returns {Promise<array>}
 */
export async function loadCertificatesFromDb() {
  const db = getDbService();
  try {
    const certs = await db.certificates.list();
    return certs;
  } catch (err) {
    console.error('Failed to load certificates from DB:', err);
    return [];
  }
}
