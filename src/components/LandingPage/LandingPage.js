import React from 'react';
import FaceMeshOverlay from '../FaceMeshOverlay/FaceMeshOverlay';

const LandingPage = ({
  isSignedIn,
  isGuest,
  firstName,
  onGuestMode,
  onOpenDashboardTool,
  onRouteChange
}) => {
  const renderHeroPreview = (extraClassName = '') => (
    // The same preview card is reused once for desktop and once for the mobile hero layout.
    <button
      className={`surface-card hero-preview-card hero-preview-card-button ${extraClassName}`.trim()}
      onClick={() => onOpenDashboardTool('photo')}
      type="button"
      aria-label="Open Photo Scan and Blur"
    >
      <div className="hero-preview-toolbar">
        <span className="hero-preview-dot"></span>
        <span className="hero-preview-dot"></span>
        <span className="hero-preview-dot"></span>
      </div>
      <div className="hero-preview-image-frame">
        <img
          className="hero-preview-image"
          src={`${process.env.PUBLIC_URL}/images/model.png`}
          alt="AI face analysis preview"
        />
        <div className="mesh-reveal-layer">
          <FaceMeshOverlay />
        </div>
        <div className="hero-preview-scan-line scanner-bar" aria-hidden="true"></div>
      </div>
      <span className="hero-crosshair hero-crosshair-one"></span>
      <span className="hero-crosshair hero-crosshair-two"></span>
      <div className="hero-floating-tag hero-floating-tag-one">Age: ~27 | Neutral 96%</div>
      <div className="hero-floating-tag hero-floating-tag-two">Privacy Blur: Ready</div>
      <div className="hero-preview-footer">
        <span>Face detected: 0.42s</span>
      </div>
    </button>
  );

  return (
    // Landing page content lives here so App.js can focus on state, routing, and scan behavior.
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">Face analysis and privacy blur</p>
          <h1 className="landing-title">Face Detection & Privacy Blur</h1>
          {renderHeroPreview('hero-preview-card-mobile')}
          <p className="landing-subtitle">
            Analyze faces in uploaded photos, review AI estimates, and blur selected identities before exporting a privacy-safe image.
          </p>
          {(isSignedIn || isGuest) && (
            <div className="landing-return-message">
              <span>Hello,</span>
              <strong>{isGuest ? 'Guest' : firstName}</strong>
            </div>
          )}
          <div className="landing-actions">
            {(isSignedIn || isGuest) ? (
              <button className="button-pill button-primary landing-primary-button" onClick={() => onRouteChange('home')} type="button">
                View Dashboard
              </button>
            ) : (
              <>
                <button className="button-pill button-primary landing-primary-button" onClick={onGuestMode} type="button">
                  Try Guest Demo
                </button>
                <button className="button-pill button-muted landing-secondary-button" onClick={() => onRouteChange('signin')} type="button">
                  Sign In
                </button>
                <button className="button-pill button-muted landing-link-button" onClick={() => onRouteChange('register')} type="button">
                  Register
                </button>
              </>
            )}
          </div>
          <div className="landing-stats">
            <span>Multi-Face Photo Scan</span>
            <span>Selective Blur Export</span>
            <span>Client-Side Face Analysis</span>
          </div>
        </div>
        {renderHeroPreview('hero-preview-card-desktop')}
      </section>

      <section id="features" className="landing-section">
        <p className="landing-section-kicker">Features</p>
        <h2>Built for explainable visual AI demos</h2>
        <div className="landing-bento-grid">
          <article className="surface-card landing-bento-card">
            <span>01</span>
            <h3>Multi-Face Detection & Analysis</h3>
            <p>Upload a photo or paste an image link. Ocula finds every face in it and shows you each person's estimated age, gender, and emotion.</p>
            <button className="button-pill landing-card-link" onClick={() => onOpenDashboardTool('photo')} type="button">
              Open Photo Scan
            </button>
          </article>
          <article className="surface-card landing-bento-card">
            <span>02</span>
            <h3>Blur Faces for Privacy</h3>
            <p>Choose which faces to blur â€” one, a few, or everyone â€” then download a safe copy of the photo to share.</p>
            <button className="button-pill landing-card-link" onClick={() => onOpenDashboardTool('photo')} type="button">
              Open Blur Tool
            </button>
          </article>
        </div>
      </section>

      <section id="privacy" className="landing-section landing-privacy-showcase">
        <article className="surface-card landing-architecture-card landing-privacy-copy-card">
          <p className="landing-section-kicker">Privacy Engine</p>
          <h2>Blur only the faces you choose</h2>
          <p>Instead of blurring a whole photo, Ocula lets you pick exactly which faces to hide. That's useful for group photos, event pictures, or any image where only some people need their identity protected.</p>
        </article>
        <div className="privacy-preview-grid">
          <div className="surface-card privacy-preview-card privacy-preview-before">Original scan</div>
          <div className="surface-card privacy-preview-card privacy-preview-after">Selective blur ready</div>
        </div>
      </section>

      <section id="faq" className="landing-section">
        <p className="landing-section-kicker">Architecture & FAQ</p>
        <h2>How Ocula works</h2>
        <div className="faq-grid">
          <article className="surface-card faq-card">
            <h3>Where does face processing happen?</h3>
            <p>All face detection and blurring happens right in your browser â€” your photo is never sent to a server for that part. The backend only handles things like logging in, your account, and loading images from other websites.</p>
          </article>
          <article className="surface-card faq-card">
            <h3>Why do some image URLs fail?</h3>
            <p>Some websites block browsers from reading their images directly. If a pasted link doesn't work, try copying the direct image address instead, or just upload the photo from your device â€” that always works.</p>
          </article>
        </div>
      </section>
    </main>
  );
};

export default LandingPage;
