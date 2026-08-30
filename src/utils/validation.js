// This file stores reusable validation helpers for email addresses and image URLs.
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const MAX_DATA_IMAGE_BYTES = 5 * 1024 * 1024;
const DATA_IMAGE_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i;

function isValidDataImage(value) {
  if (!DATA_IMAGE_PATTERN.test(value)) return false;

  const base64Part = value.split(',')[1] || '';
  const approximateBytes = Math.ceil((base64Part.replace(/\s/g, '').length * 3) / 4);

  return approximateBytes <= MAX_DATA_IMAGE_BYTES;
}

// We accept normal web image links and small data images pasted from local tools.
export const isValidImageUrl = (value) => {
  if (isValidDataImage(value)) return true;

  try {
    const url = new URL(value);
    //Valid links are the ones only starting with http or https
    return ['http:', 'https:'].includes(url.protocol);
  } catch (error) {
    return false;
  }
};
//Most of the image address we directly copy from the browser are invalid/encrypted
