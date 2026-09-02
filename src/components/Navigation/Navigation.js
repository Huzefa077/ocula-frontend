// This file shows the navigation links based on whether the user is signed in or signed out.
import React, { useEffect, useRef, useState } from 'react';
import BrandLogo from '../BrandLogo/BrandLogo';
import './Navigation.css';

const Navigation = ({
  onRouteChange,
  onGuestMode,
  isSignedIn,
  isAdmin = false,
  isGuest = false,
  route = 'landing',
  userName = 'Guest',
  onBackNavigation
}) => {
    const userMenuRef = useRef(null);
    // Mobile drawer state stays in Navigation because only the navbar needs to know whether it is open.
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const showBackToHome = route !== 'landing';
    const isDashboardArea = route === 'home' || route === 'guidelines';
    const isLanding = route === 'landing';
    const brand = (
      <div className="navigation-brand">
        <BrandLogo onClick={() => onRouteChange('landing')} />
      </div>
    );
    const closeUserMenu = () => {
      // The desktop account menu uses <details>, so closing it means setting open=false.
      if (userMenuRef.current) {
        userMenuRef.current.open = false;
      }
    };
    const closeMobileMenu = () => setIsMobileMenuOpen(false);
    const goToRoute = (nextRoute) => {
      // All route changes from the drawer should also collapse the drawer.
      closeMobileMenu();
      onRouteChange(nextRoute);
    };
    const startGuestMode = () => {
      closeMobileMenu();
      onGuestMode?.();
    };

    useEffect(() => {
      const closeMenuOnOutsideClick = (event) => {
        if (!userMenuRef.current || userMenuRef.current.contains(event.target)) return;

        userMenuRef.current.open = false;
      };

      // Empty dependency array is intentional: the listener only needs the stable ref object.
      document.addEventListener('mousedown', closeMenuOnOutsideClick);

      return () => {
        document.removeEventListener('mousedown', closeMenuOnOutsideClick);
      };
    }, []);

    const renderCenterNavigation = () => isDashboardArea ? (
      // Dashboard screens keep page links centered while the account menu stays on the right.
      <div className="navigation-anchor-links navigation-dashboard-links">
        <button onClick={() => goToRoute('guidelines')} type="button">
          User Guide
        </button>
        {showBackToHome && (
          <button onClick={() => goToRoute('landing')} type="button">
            Homepage
          </button>
        )}
      </div>
    ) : isLanding ? (
      <div className="navigation-anchor-links">
        <a href="#features" onClick={closeMobileMenu}>Features</a>
        <a href="#privacy" onClick={closeMobileMenu}>Privacy Engine</a>
        <a href="#faq" onClick={closeMobileMenu}>Architecture & FAQ</a>
      </div>
    ) : (
      <span className="navigation-page-label">{route === 'guidelines' ? 'User Guide' : 'Account'}</span>
    );

    const renderActionNavigation = (attachUserMenuRef = true) => isDashboardArea ? (
      // attachUserMenuRef is false inside the mobile drawer so the desktop <details> ref is not reused twice.
      <>
        {attachUserMenuRef ? (
          <details className="navigation-user-menu" ref={userMenuRef}>
            <summary>{isGuest ? 'Guest Mode' : userName}</summary>
            <div className="navigation-user-dropdown">
              {isAdmin && <span className="navigation-admin-badge">Admin</span>}
              {isGuest && <button onClick={() => { closeUserMenu(); goToRoute('signin'); }} type="button">Sign In</button>}
              <button onClick={() => { closeUserMenu(); goToRoute('signout'); }} type="button">{isGuest ? 'Exit Guest Mode' : 'Sign Out'}</button>
            </div>
          </details>
        ) : (
          <>
            {isGuest && <button onClick={() => goToRoute('signin')} className="navigation-link-button" type="button">Sign In</button>}
            <button onClick={() => goToRoute('signout')} className="navigation-link-button navigation-signout-button" type="button">{isGuest ? 'Exit Guest Mode' : 'Sign Out'}</button>
          </>
        )}
      </>
    ) : (
      <>
        {showBackToHome && (
          <button onClick={() => { closeMobileMenu(); onBackNavigation?.(); }} className="navigation-back-button" type="button">
            &lt; Back
          </button>
        )}
        {(!isSignedIn || isGuest) && <button onClick={() => goToRoute('signin')} className="navigation-link-button" type="button">Sign In</button>}
        {isLanding && isGuest && (
          <button onClick={() => goToRoute('register')} className="navigation-link-button navigation-register-button" type="button">
            Register
          </button>
        )}
        {isLanding ? (
          <>
            {isSignedIn && !isGuest && attachUserMenuRef && (
              <button onClick={() => goToRoute('signout')} className="navigation-link-button navigation-signout-button" type="button">
                Sign Out
              </button>
            )}
            <button onClick={isSignedIn ? () => goToRoute('home') : startGuestMode} className="navigation-link-button navigation-link-button-strong" type="button">
              {isSignedIn ? 'View Dashboard' : 'Launch App'}
            </button>
          </>
        ) : (
          <button onClick={() => goToRoute('register')} className="navigation-link-button navigation-register-button" type="button">
            Register
          </button>
        )}
      </>
    );

    return (
      <nav className="navigation navigation-sticky">
        <button
          className={isMobileMenuOpen ? 'navigation-menu-toggle navigation-menu-toggle-open' : 'navigation-menu-toggle'}
          onClick={() => setIsMobileMenuOpen((value) => !value)}
          type="button"
          aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileMenuOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        {brand}

        <div className="navigation-center">
          {renderCenterNavigation()}
        </div>

        <div className="navigation-links">
          {renderActionNavigation()}
        </div>

        {/* These compact labels keep signed-in context visible on mobile without crowding the drawer button. */}
        {isLanding && isSignedIn && !isGuest && (
          <button onClick={() => goToRoute('signout')} className="navigation-mobile-signout" type="button">
            Sign Out
          </button>
        )}
        {((isDashboardArea && isSignedIn) || (isLanding && isSignedIn && !isGuest)) && (
          <span className="navigation-mobile-user-name">{isGuest ? 'Guest' : userName}</span>
        )}

        {/* Keep the drawer mounted so CSS can animate both opening and closing smoothly. */}
        <div className={isMobileMenuOpen ? 'navigation-mobile-backdrop navigation-mobile-backdrop-open' : 'navigation-mobile-backdrop'} onClick={closeMobileMenu} aria-hidden="true"></div>
        <aside className={isMobileMenuOpen ? 'navigation-mobile-menu navigation-mobile-menu-open' : 'navigation-mobile-menu'} aria-label="Navigation menu">
          <div className="navigation-mobile-section">{renderCenterNavigation()}</div>
          <div className="navigation-mobile-section navigation-mobile-actions">{renderActionNavigation(false)}</div>
        </aside>
      </nav>
    );
}

export default Navigation;
