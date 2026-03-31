export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// We only accept normal web image links here.
export const isValidImageUrl = (value) => {
  try {
    const url = new URL(value);
    //Valid links are the ones only starting with http or https
    return ['http:', 'https:'].includes(url.protocol);
  } catch (error) {
    return false;
  }
};
//Most of the image address we directly copy from the browser are invalid/encrypted