import { describe, it, expect } from 'vitest';
import {
  validateCertificateMetadata,
  createCertificateGallery,
  validateImageUrl,
  validateImageFile,
} from '../src/lib/certificateGallery.js';

describe('certificateGallery.js', () => {
  describe('validateCertificateMetadata', () => {
    it('validates correct certificate object', () => {
      const cert = {
        certificateNumber: 'CERT001-2026',
        title: 'H2S Safety',
        imageData: 'data:image/png;base64,...',
        summary: 'Safety training certificate',
      };
      const result = validateCertificateMetadata(cert);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects missing certificate number', () => {
      const cert = {
        title: 'H2S Safety',
        imageData: 'data:image/png;base64,...',
      };
      const result = validateCertificateMetadata(cert);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Certificate Number');
    });

    it('rejects missing title', () => {
      const cert = {
        certificateNumber: 'CERT001',
        imageData: 'data:image/png;base64,...',
      };
      const result = validateCertificateMetadata(cert);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Title');
    });

    it('requires at least one image source (local or URL)', () => {
      const cert = {
        certificateNumber: 'CERT001',
        title: 'H2S Safety',
        summary: 'No image provided',
      };
      const result = validateCertificateMetadata(cert);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('image'))).toBe(true);
    });

    it('rejects summary over 200 chars', () => {
      const cert = {
        certificateNumber: 'CERT001',
        title: 'H2S Safety',
        imageData: 'data:image/png;base64,...',
        summary: 'a'.repeat(201),
      };
      const result = validateCertificateMetadata(cert);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('200'))).toBe(true);
    });

    it('accepts external URL only (no local image)', () => {
      const cert = {
        certificateNumber: 'CERT001',
        title: 'H2S Safety',
        imageUrl: 'https://example.com/cert.jpg',
      };
      const result = validateCertificateMetadata(cert);
      expect(result.valid).toBe(true);
    });

    it('accepts both local image and URL', () => {
      const cert = {
        certificateNumber: 'CERT001',
        title: 'H2S Safety',
        imageData: 'data:image/png;base64,...',
        imageUrl: 'https://example.com/cert.jpg',
      };
      const result = validateCertificateMetadata(cert);
      expect(result.valid).toBe(true);
    });
  });

  describe('createCertificateGallery', () => {
    it('creates a gallery store', () => {
      const gallery = createCertificateGallery();
      expect(gallery).toBeTruthy();
      expect(gallery.size()).toBe(0);
    });

    it('adds a certificate', () => {
      const gallery = createCertificateGallery();
      const result = gallery.set('CERT001', {
        title: 'H2S Safety',
        imageData: 'data:image/png;base64,...',
      });

      expect(result.success).toBe(true);
      expect(result.cert.certificateNumber).toBe('CERT001');
      expect(gallery.size()).toBe(1);
    });

    it('retrieves a certificate', () => {
      const gallery = createCertificateGallery();
      gallery.set('CERT001', {
        title: 'H2S Safety',
        imageData: 'data:image/png;base64,...',
      });

      const cert = gallery.get('CERT001');
      expect(cert).toBeTruthy();
      expect(cert.title).toBe('H2S Safety');
      expect(cert.certificateNumber).toBe('CERT001');
    });

    it('updates an existing certificate', () => {
      const gallery = createCertificateGallery();
      gallery.set('CERT001', {
        title: 'Old Title',
        imageData: 'data:image/png;base64,...',
      });

      const oldCert = gallery.get('CERT001');
      const updatedResult = gallery.set('CERT001', {
        title: 'New Title',
        imageData: oldCert.imageData,
      });

      expect(updatedResult.success).toBe(true);
      const newCert = gallery.get('CERT001');
      expect(newCert.title).toBe('New Title');
      expect(newCert.createdAt).toBe(oldCert.createdAt); // preserve original created date
      expect(newCert.updatedAt >= oldCert.updatedAt).toBe(true); // >= in case same millisecond
    });

    it('rejects invalid certificate', () => {
      const gallery = createCertificateGallery();
      const result = gallery.set('CERT001', {
        title: '', // empty title
        imageData: 'data:image/png;base64,...',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Title');
    });

    it('deletes a certificate', () => {
      const gallery = createCertificateGallery();
      gallery.set('CERT001', {
        title: 'H2S Safety',
        imageData: 'data:image/png;base64,...',
      });

      const deleted = gallery.delete('CERT001');
      expect(deleted).toBe(true);
      expect(gallery.get('CERT001')).toBeNull();
      expect(gallery.size()).toBe(0);
    });

    it('lists all certificates', () => {
      const gallery = createCertificateGallery();
      gallery.set('CERT001', { title: 'H2S', imageData: 'x' });
      gallery.set('CERT002', { title: 'PTW', imageUrl: 'https://example.com' });

      const list = gallery.list();
      expect(list.length).toBe(2);
      expect(list[0].certificateNumber).toBe('CERT001');
      expect(list[1].certificateNumber).toBe('CERT002');
    });

    it('checks certificate existence', () => {
      const gallery = createCertificateGallery();
      gallery.set('CERT001', { title: 'H2S', imageData: 'x' });

      expect(gallery.has('CERT001')).toBe(true);
      expect(gallery.has('CERT999')).toBe(false);
    });

    it('exports to JSON', () => {
      const gallery = createCertificateGallery();
      gallery.set('CERT001', { title: 'H2S', imageData: 'x' });
      gallery.set('CERT002', { title: 'PTW', imageUrl: 'https://example.com' });

      const json = gallery.toJSON();
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0][0]).toBe('CERT001');
    });

    it('imports from JSON', () => {
      const gallery = createCertificateGallery();
      gallery.set('CERT001', { title: 'H2S', imageData: 'x' });

      const json = gallery.toJSON();

      const gallery2 = createCertificateGallery();
      const result = gallery2.fromJSON(json);

      expect(result.success).toBe(true);
      expect(gallery2.size()).toBe(1);
      expect(gallery2.get('CERT001').title).toBe('H2S');
    });

    it('clears all certificates', () => {
      const gallery = createCertificateGallery();
      gallery.set('CERT001', { title: 'H2S', imageData: 'x' });
      gallery.set('CERT002', { title: 'PTW', imageUrl: 'https://example.com' });

      gallery.clear();
      expect(gallery.size()).toBe(0);
    });

    it('trims whitespace', () => {
      const gallery = createCertificateGallery();
      const result = gallery.set('  CERT001  ', {
        title: '  H2S Safety  ',
        imageData: 'x',
        summary: '  Summary  ',
      });

      expect(result.success).toBe(true);
      // The cert is stored with trimmed key
      const cert = gallery.get('CERT001');
      expect(cert.certificateNumber).toBe('CERT001');
      expect(cert.title).toBe('H2S Safety');
      expect(cert.summary).toBe('Summary');
    });
  });

  describe('validateImageUrl', () => {
    it('accepts valid HTTPS URLs', () => {
      const result = validateImageUrl('https://example.com/cert.jpg');
      expect(result.valid).toBe(true);
    });

    it('accepts valid HTTP URLs', () => {
      const result = validateImageUrl('http://example.com/cert.jpg');
      expect(result.valid).toBe(true);
    });

    it('rejects malformed URLs', () => {
      const result = validateImageUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('rejects non-HTTP/HTTPS URLs', () => {
      const result = validateImageUrl('ftp://example.com/cert.jpg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('http');
    });

    it('rejects empty string', () => {
      const result = validateImageUrl('');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateImageFile', () => {
    it('accepts JPEG files under 2 MB', () => {
      const file = new File(['jpeg data'], 'cert.jpg', { type: 'image/jpeg' });
      const result = validateImageFile(file);
      expect(result.valid).toBe(true);
    });

    it('accepts PNG files under 2 MB', () => {
      const file = new File(['png data'], 'cert.png', { type: 'image/png' });
      const result = validateImageFile(file);
      expect(result.valid).toBe(true);
    });

    it('rejects non-image files', () => {
      const file = new File(['data'], 'cert.pdf', { type: 'application/pdf' });
      const result = validateImageFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('JPEG');
    });

    it('rejects files over 2 MB', () => {
      // Create a file > 2 MB
      const bigData = new Uint8Array(2 * 1024 * 1024 + 1);
      const file = new File([bigData], 'cert.jpg', { type: 'image/jpeg' });
      const result = validateImageFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2 MB');
    });
  });
});
