import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import Carousel from './Carousel';

/* ─────────────────────────────────────────────────────────────
   SUBSCRIPTION REQUEST FORM MODAL
───────────────────────────────────────────────────────────── */
function SubscriptionRequestForm({ plan, onClose }) {
  const [form, setForm] = useState({
    businessName: '', ownerName: '', phone: '', email: '', address: '', notes: '', businessType: 'retail'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const businessTypes = [
    { value: 'retail', label: '🛒 Retail Store', desc: 'General merchandise, supermarkets, shops' },
    { value: 'hotel', label: '🍽️ Hotel/Restaurant', desc: 'Food service, table management, kitchen' },
    { value: 'pharmacy', label: '💊 Pharmacy', desc: 'Medicine stock, prescriptions' },
    { value: 'electronics', label: '📱 Electronics', desc: 'Phones, computers, accessories' },
    { value: 'fashion', label: '👗 Fashion/Clothing', desc: 'Apparel, shoes, accessories' },
    { value: 'hardware', label: '🔧 Hardware Store', desc: 'Building materials, tools' },
    { value: 'beauty', label: '💄 Beauty/Salon', desc: 'Cosmetics, salon services' },
    { value: 'auto', label: '🚗 Auto Parts', desc: 'Car parts, accessories' },
    { value: 'bookshop', label: '📚 Bookshop/Stationery', desc: 'Books, office supplies' },
    { value: 'other', label: '🏪 Other', desc: 'General business' }
  ];

  const planLabels = {
    trial: 'Free Trial (7 days)',
    monthly_basic: 'Monthly Basic - KSh 850/month',
    monthly_premium: 'Monthly Premium - KSh 1,500/month',
    yearly_basic: 'Yearly Basic - KSh 8,500/year',
    yearly_premium: 'Yearly Premium - KSh 15,000/year'
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.businessName || !form.ownerName || !form.phone) {
      setError('Please fill in all required fields');
      return;
    }
    
    if (!supabase) {
      setError('Database connection not available');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      console.log('📝 Submitting subscription request:', {
        business_name: form.businessName,
        plan: plan
      });
      
      const { data, error: err } = await supabase.from('subscription_requests').insert([{
        business_name: form.businessName,
        owner_name: form.ownerName,
        phone: form.phone,
        email: form.email || null,
        address: form.address || null,
        plan: plan,
        business_type: form.businessType,
        notes: form.notes || null
      }]);
      
      if (err) {
        console.error('❌ Insert error:', err);
        throw err;
      }
      
      console.log('✅ Request submitted successfully');
      setSuccess(true);
      setTimeout(() => onClose(), 2500);
    } catch (err) {
      console.error('❌ Submission failed:', err);
      setError(err.message || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="ps-modal-overlay" onClick={onClose}>
        <div className="ps-modal-box ps-success-msg" onClick={e => e.stopPropagation()}>
          <div className="ps-success-icon">✓</div>
          <h3>Request Submitted!</h3>
          <p>Thank you! We'll review your request and get back to you within 24 hours.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-modal-overlay" onClick={onClose}>
      <div className="ps-modal-box" onClick={e => e.stopPropagation()}>
        <button className="ps-modal-close" onClick={onClose}>×</button>
        <h2>Request Subscription</h2>
        <p className="ps-modal-subtitle">Fill in your details below and we'll set up your store.</p>
        <div className="ps-plan-badge">{planLabels[plan]}</div>
        <form onSubmit={handleSubmit}>
          <label>
            Business Name <span className="req">*</span>
            <input type="text" value={form.businessName} onChange={e => setForm({...form, businessName: e.target.value})} placeholder="e.g. Mama Jane's Shop" required />
          </label>
          
          <label>
            Business Type <span className="req">*</span>
            <div className="ps-business-type-scroll">
              {businessTypes.map(type => (
                <div
                  key={type.value}
                  className={`ps-business-type-card ${form.businessType === type.value ? 'selected' : ''}`}
                  onClick={() => setForm({...form, businessType: type.value})}
                >
                  <div className="ps-business-type-label">{type.label}</div>
                  <div className="ps-business-type-desc">{type.desc}</div>
                </div>
              ))}
            </div>
          </label>
          
          <label>
            Owner Name <span className="req">*</span>
            <input type="text" value={form.ownerName} onChange={e => setForm({...form, ownerName: e.target.value})} placeholder="Your full name" required />
          </label>
          <label>
            Phone Number <span className="req">*</span>
            <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="e.g. 0712345678" required />
          </label>
          <label>
            Email (optional)
            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="your@email.com" />
          </label>
          <label>
            Business Address (optional)
            <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="City, street, building" />
          </label>
          <label>
            Additional Notes (optional)
            <textarea rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Anything else we should know?" />
          </label>
          {error && <div className="ps-form-error">{error}</div>}
          <div className="ps-modal-actions">
            <button type="button" className="ps-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="ps-btn-primary" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Request →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PUBLIC LANDING PAGE
   Sections: Home · Portals · Features · Pricing · Support
───────────────────────────────────────────────────────────── */
export default function PublicSite({ onEnterLogin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('trial');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);
  const [legalModal, setLegalModal] = useState(null); // 'terms' | 'privacy' | 'refund' | null
  const navRef = useRef(null);

  // ── Scroll listener ──
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Resize listener ──
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Handle browser back/forward buttons ──
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname.replace('/', '').toLowerCase();
      const validSections = ['home','portals','features','usecases','pricing','support'];
      if (validSections.includes(path)) {
        document.getElementById(path)?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    const path = window.location.pathname.replace('/', '').toLowerCase();
    const validSections = ['home','portals','features','usecases','pricing','support'];
    if (path && validSections.includes(path)) {
      // Small delay to let page render first
      setTimeout(() => {
        document.getElementById(path)?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }, []);

  // ── scrollTo: smooth scroll + update URL ──
  const scrollTo = id => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    // Update browser URL without reload
    window.history.pushState(null, '', `/${id}`);
    setMenuOpen(false);
  };

  // ── Track active section via IntersectionObserver ──
  useEffect(() => {
    const sections = ['home','portals','features','usecases','pricing','support'];
    const observers = sections.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            window.history.replaceState(null, '', `/${id}`);
          }
        },
        { threshold: 0.4 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, []);

  const navLinks = [
    ['home',     'Home'],
    ['portals',  'Portals'],
    ['features', 'Features'],
    ['usecases', 'Use Cases'],
    ['pricing',  'Pricing'],
    ['support',  'Support'],
  ];

  const openRequestForm = (plan = 'trial') => {
    setSelectedPlan(plan);
    setShowRequestForm(true);
  };

  // ── Legal content ──
  const LEGAL = {
    terms: {
      title: 'Terms of Service',
      updated: 'November 2026',
      sections: [
        { heading: '1. Acceptance of Terms', body: 'By accessing or using Vyro POS ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service. Vyro POS is operated by Vyro Social Ltd, registered in Kenya.' },
        { heading: '2. Description of Service', body: 'Vyro POS is a cloud-based point-of-sale system designed for Kenyan businesses. The Service includes inventory management, sales tracking, customer loyalty programs, expense tracking, and multi-store management. Features may be added or modified at any time.' },
        { heading: '3. Subscription & Payment', body: 'Access to the Service requires a paid subscription after the 7-day free trial. Subscription fees are billed in Kenyan Shillings (KSh) via M-Pesa or bank transfer. All payments are non-refundable except as outlined in our Refund Policy. We reserve the right to suspend access for non-payment.' },
        { heading: '4. User Responsibilities', body: 'You are responsible for maintaining the confidentiality of your login credentials. You agree not to share access with unauthorized users, attempt to reverse-engineer the software, use the Service for unlawful purposes, or upload malicious content. You are responsible for all activity under your account.' },
        { heading: '5. Data & Privacy', body: 'We collect and process business data (sales, products, customers) to provide the Service. Your data is stored securely and never sold to third parties. See our Privacy Policy for full details on data handling, retention, and your rights.' },
        { heading: '6. Uptime & Support', body: 'We aim for 99.5% uptime. Vyro POS works offline and syncs when connectivity is restored. Support is available via WhatsApp (+254 112 800 325) and email (admin@vyrosocial.com) during business hours (Mon–Fri, 8am–6pm EAT).' },
        { heading: '7. Termination', body: 'We may suspend or terminate your account for violation of these terms, non-payment, or fraudulent activity. You may cancel your subscription at any time; access continues until the end of the billing period.' },
        { heading: '8. Limitation of Liability', body: 'Vyro POS is provided "as is". We are not liable for lost profits, data loss, or indirect damages arising from use of the Service. Our total liability in any circumstance shall not exceed the amount paid for the current billing period.' },
        { heading: '9. Changes to Terms', body: 'We may update these terms at any time. Continued use of the Service after changes constitutes acceptance. We will notify users of material changes via email or in-app notice.' },
        { heading: '10. Governing Law', body: 'These terms are governed by the laws of Kenya. Any disputes shall be resolved in Kenyan courts.' },
      ]
    },
    privacy: {
      title: 'Privacy Policy',
      updated: 'November 2026',
      sections: [
        { heading: '1. Information We Collect', body: 'We collect information you provide directly: business name, owner name, phone number, email address, and payment details during registration. We also collect operational data you enter into the system — products, sales transactions, customer records, expenses, and inventory data.' },
        { heading: '2. How We Use Your Information', body: 'Your data is used to provide and improve the Service, process payments, send account-related communications, provide customer support, and generate reports for your business use. We do not use your business data for advertising or sell it to third parties.' },
        { heading: '3. Data Storage & Security', body: 'Your data is stored on secure servers provided by Supabase (PostgreSQL) with encryption at rest and in transit. We apply row-level security so each business can only access its own data. We retain your data for as long as your account is active plus 90 days after termination.' },
        { heading: '4. Offline Data', body: 'Vyro POS stores data locally on your device when offline (using browser localStorage). This local data syncs to our servers when connectivity is restored. You are responsible for the physical security of devices running Vyro POS.' },
        { heading: '5. Data Sharing', body: 'We do not sell or rent your personal or business data. We may share data with: (a) payment processors (M-Pesa/Safaricom) to process transactions; (b) service providers (hosting, analytics) under confidentiality agreements; (c) law enforcement when legally required.' },
        { heading: '6. Your Rights', body: 'You have the right to access, correct, export, or delete your data at any time. Contact us at admin@vyrosocial.com to exercise these rights. Data export is available in CSV format from within the dashboard.' },
        { heading: '7. Cookies', body: 'We use minimal cookies for session authentication only. We do not use tracking or advertising cookies. The Service uses browser localStorage for offline functionality.' },
        { heading: '8. Contact', body: 'For privacy concerns or data requests, contact our team at admin@vyrosocial.com or WhatsApp +254 112 800 325. We aim to respond within 2 business days.' },
      ]
    },
    refund: {
      title: 'Refund Policy',
      updated: 'November 2026',
      sections: [
        { heading: '1. Free Trial', body: 'Every new account receives a 7-day free trial with full access to all features. No credit card or payment is required during the trial period. The trial ends automatically — you will not be charged without explicitly subscribing.' },
        { heading: '2. Subscription Payments', body: 'All subscription payments (monthly or yearly) are processed manually via M-Pesa or bank transfer after admin approval. Payments are confirmed within 24 business hours. You will receive confirmation via WhatsApp or email.' },
        { heading: '3. Refund Eligibility', body: 'We offer refunds in the following circumstances: (a) Duplicate payment — if you are charged twice for the same period; (b) Service unavailability — if the Service is unavailable for more than 48 continuous hours in a billing period; (c) Incorrect charge — if you were charged an amount different from the agreed plan price.' },
        { heading: '4. Non-Refundable Cases', body: 'We do not offer refunds for: change of mind after activation, partial use of a subscription period, failure to use the Service, or subscription cancellation mid-period. Yearly plan discounts are contingent on completing the full year.' },
        { heading: '5. How to Request a Refund', body: 'To request a refund, contact us within 7 days of the charge via: WhatsApp: +254 112 800 325 or Email: admin@vyrosocial.com with subject "Refund Request". Include your business name, M-Pesa transaction code, and reason. We will review and respond within 3 business days.' },
        { heading: '6. Refund Processing', body: 'Approved refunds are processed back to the original M-Pesa number or bank account within 5–7 business days. We will confirm via WhatsApp or email when the refund is initiated.' },
        { heading: '7. Subscription Cancellation', body: 'You may cancel your subscription at any time by contacting us. Cancellation takes effect at the end of the current billing period. You retain full access until then. No partial refunds are issued for the remaining days in a cancelled period.' },
      ]
    }
  };

  return (
    <div className="ps-site">
      {showRequestForm && <SubscriptionRequestForm plan={selectedPlan} onClose={() => setShowRequestForm(false)} />}

      {/* ── LEGAL MODALS ── */}
      {legalModal && (
        <div className="ps-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setLegalModal(null); }}>
          <div className="ps-legal-modal">
            <div className="ps-legal-modal-header">
              <div className="ps-legal-modal-title">
                <p className="ps-legal-updated">Last updated: {LEGAL[legalModal].updated}</p>
                <h2>{LEGAL[legalModal].title}</h2>
              </div>
              <button className="ps-legal-close" onClick={() => setLegalModal(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="ps-legal-modal-body">
              {LEGAL[legalModal].sections.map(s => (
                <div key={s.heading} className="ps-legal-section">
                  <h3>{s.heading}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
            <div className="ps-legal-modal-footer">
              <p>Questions? Contact us at <a href="mailto:admin@vyrosocial.com">admin@vyrosocial.com</a> or WhatsApp <a href="https://wa.me/254112800325" target="_blank" rel="noopener noreferrer">+254 112 800 325</a></p>
            </div>
          </div>
        </div>
      )}

      <nav className={`ps-nav${scrolled ? ' scrolled' : ''}${menuOpen ? ' menu-open' : ''}`}>
        <div className="ps-nav-inner">
          {/* Logo — always left */}
          <a className="ps-logo" onClick={() => scrollTo('home')} style={{cursor:'pointer'}}>
            <img src="/logo.png" alt="Vyro POS" onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex';}} />
            <span className="ps-logo-fallback" style={{display:'none'}}>
              <span className="ps-logo-mark">V</span>
              <span className="ps-logo-text">Vyro<span>POS</span></span>
            </span>
          </a>

          {/* Desktop links — hidden on mobile */}
          {!isMobile && (
            <div className="ps-nav-links" style={{display:'flex'}}>
              <button className="ps-drawer-close" onClick={() => setMenuOpen(false)} style={{display:'none'}} />
              {navLinks.map(([id, label]) => (
                id === 'usecases'
                  ? <button key={id} onClick={() => scrollTo(id)} className="ps-nav-usecase">{label}</button>
                  : <button key={id} onClick={() => scrollTo(id)}>{label}</button>
              ))}
              <span className="ps-nav-divider" />
              <button className="ps-nav-cta" onClick={() => openRequestForm('trial')}>Sign up →</button>
            </div>
          )}

          {/* Burger — only on mobile */}
          {isMobile && (
            <button
              className="ps-burger-btn"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
            >
              <span className="ps-burger-bar" />
              <span className="ps-burger-bar" />
              <span className="ps-burger-bar short" />
            </button>
          )}
        </div>
      </nav>

      {/* Mobile drawer */}
      {isMobile && menuOpen && (
        <div className="ps-drawer-backdrop" onClick={() => setMenuOpen(false)} />
      )}
      {isMobile && menuOpen && (
        <div className="ps-drawer">
          {/* Nav links */}
          <nav className="ps-drawer-nav">
            {/* Close button at top */}
            <div className="ps-drawer-top">
              <span className="ps-drawer-top-label">Menu</span>
              <button className="ps-drawer-close-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {[
              ['home',     '🏠', 'Home'],
              ['portals',  '🔑', 'Portals'],
              ['features', '⚡', 'Features'],
              ['usecases', '🏪', 'Use Cases'],
              ['pricing',  '💳', 'Pricing'],
              ['support',  '💬', 'Support & FAQ'],
            ].map(([id, icon, label]) => (
              <button
                key={id}
                className={`ps-drawer-link${id === 'usecases' ? ' highlight' : ''}`}
                onClick={() => { scrollTo(id); setMenuOpen(false); }}
              >
                <span className="ps-drawer-link-icon">{icon}</span>
                <span className="ps-drawer-link-label">{label}</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{marginLeft:'auto',opacity:0.35,flexShrink:0}}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </nav>

          <div className="ps-drawer-divider" />

          {/* CTA */}
          <div className="ps-drawer-cta">
            <button className="ps-drawer-signup" onClick={() => { openRequestForm('trial'); setMenuOpen(false); }}>
              🚀 Start free trial
            </button>
            <div className="ps-drawer-contact">
              <a href="https://wa.me/254112800325" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.556 4.116 1.523 5.843L.057 23.5l5.806-1.463A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.368l-.36-.214-3.717.937.991-3.617-.235-.375A9.818 9.818 0 012.182 12c0-5.426 4.392-9.818 9.818-9.818 5.426 0 9.818 4.392 9.818 9.818 0 5.426-4.392 9.818-9.818 9.818z"/></svg>
                +254 112 800 325
              </a>
              <a href="mailto:admin@vyrosocial.com">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                admin@vyrosocial.com
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── HERO / HOME ── */}
      <section id="home" className="ps-hero">
        <div className="ps-hero-bg" />
        <div className="ps-hero-content">
          <span className="ps-badge">⚡ Built for Kenyan retail</span>
          <h1>The POS that runs<br />your <span className="ps-grad">entire store</span></h1>
          <p>Sell smarter, track inventory, reward loyal customers, and see your numbers — all from one clean dashboard. Works online or offline.</p>
          <div className="ps-hero-cta">
            <button className="ps-btn-primary" onClick={() => openRequestForm('trial')}>Get started — it's free →</button>
            <button className="ps-btn-ghost" onClick={() => scrollTo('features')}>Explore features</button>
          </div>
          <div className="ps-hero-stats">
            <div><strong>KSh 0</strong><span>7-day free trial</span></div>
            <div><strong>3 min</strong><span>to set up</span></div>
            <div><strong>Offline</strong><span>ready</span></div>
          </div>
        </div>
        <div className="ps-hero-visual">
          <div className="ps-mock-card">
            <div className="ps-mock-bar">
              <span className="ps-mock-dot r" /><span className="ps-mock-dot y" /><span className="ps-mock-dot g" />
              <span className="ps-mock-title">Vyro POS · Dashboard</span>
            </div>
            <div className="ps-mock-body">
              <div className="ps-mock-row"><span>Today's sales</span><b>KSh 48,200</b></div>
              <div className="ps-mock-row"><span>Transactions</span><b>127</b></div>
              <div className="ps-mock-row"><span>Low stock</span><b className="warn">3 items</b></div>
              <div className="ps-mock-chart">
                {[40,65,52,80,45,70,90].map((h,i) => (
                  <div key={i} style={{height:`${h}%`}} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PORTALS ── */}
      <section id="portals" className="ps-section">
        <div className="ps-section-head">
          <span className="ps-eyebrow">Choose your portal</span>
          <h2>One platform, three ways in</h2>
          <p>Select your role to access your workspace. Each portal is tailored to what you do.</p>
        </div>
        <div className="ps-portal-grid">
          <article className="ps-portal-card admin">
            <div className="ps-portal-icon">🛡️</div>
            <h3>Admin Portal</h3>
            <p>Full system control — manage stores, users, subscriptions, payments, and view activity logs across all locations.</p>
            <ul>
              <li>Multi-store dashboard</li>
              <li>User & role management</li>
              <li>Subscription & billing</li>
              <li>Cross-store revenue reports</li>
            </ul>
            <button onClick={() => onEnterLogin('admin')}>Login as Admin →</button>
          </article>

          <article className="ps-portal-card manager">
            <div className="ps-portal-icon">🏪</div>
            <h3>Manager Portal</h3>
            <p>Run your store day-to-day — products, purchases, expenses, customers, and reports at your fingertips.</p>
            <ul>
              <li>Inventory & product management</li>
              <li>Sales & expense tracking</li>
              <li>Supplier & customer records</li>
              <li>Loyalty program settings</li>
            </ul>
            <button onClick={() => onEnterLogin('manager')}>Login as Manager →</button>
          </article>

          <article className="ps-portal-card cashier">
            <div className="ps-portal-icon">💳</div>
            <h3>Cashier Portal</h3>
            <p>Fast, focused point of sale — ring up sales, apply discounts, manage the cart, and print receipts.</p>
            <ul>
              <li>Quick barcode scan</li>
              <li>Cart & checkout</li>
              <li>Customer lookup</li>
              <li>Digital receipts</li>
            </ul>
            <button onClick={() => onEnterLogin('cashier')}>Login as Cashier →</button>
          </article>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="ps-section alt">
        <div className="ps-section-inner">
        <div className="ps-section-head">
          <span className="ps-eyebrow">Everything included</span>
          <h2>Features that actually get used</h2>
          <p>No bloated enterprise tool. Just the tools a Kenyan shop needs to run smoothly.</p>
        </div>
        <Carousel
          itemsPerView={4}
          itemsPerViewTablet={2}
          itemsPerViewMobile={1}
          items={[
            ['🧾', 'Fast POS', 'Ring up sales with barcode scanning, quick search, and cart management. Supports M-Pesa, cash, card, and credit.'],
            ['📦', 'Inventory', 'Track stock levels, set low-stock alerts, record supplier purchases, and never run out unexpectedly.'],
            ['🎁', 'Loyalty Program', 'Customers earn points on every purchase. Configure rates, redemption thresholds, and apply discounts at checkout.'],
            ['📊', 'Sales Reports', 'Daily, weekly, and monthly breakdowns. See top products, payment method splits, and profit estimates.'],
            ['👥', 'Customer & Supplier CRM', 'Keep contact records, view purchase history per customer, and manage your supplier directory.'],
            ['💸', 'Expense Tracking', 'Log operating expenses by category with date filters and visual breakdowns.'],
            ['🏪', 'Multi-Store', 'Admins oversee every store from one dashboard. Each store gets its own isolated data and team.'],
            ['📡', 'Offline Ready', 'Keep selling even when the internet drops. Data syncs automatically when you reconnect.'],
          ].map(([icon, title, desc]) => (
            <article className="ps-feature-card" key={title}>
              <span className="ps-feature-icon">{icon}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </article>
          ))}
        />
        </div>
      </section>
      {/* ── WHERE TO USE ── */}
      <section id="usecases" className="ps-section alt">
        <div className="ps-section-inner">
          <div className="ps-section-head">
            <span className="ps-eyebrow">Built for every business</span>
            <h2>Where Vyro POS works best</h2>
            <p>From supermarkets to clinics — any business that sells, tracks stock, and serves customers.</p>
          </div>
          <Carousel
            itemsPerView={4}
            itemsPerViewTablet={2}
            itemsPerViewMobile={1}
            items={[
              {
                img: 'https://images.unsplash.com/photo-1601598851547-4302969d0614?w=600&q=80',
                title: 'Supermarkets',
                desc: 'Fast checkout, barcode scanning, loyalty points, and real-time stock across all aisles.',
                tag: '🛒 Retail',
              },
              {
                img: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&q=80',
                title: 'Boutiques & Fashion',
                desc: 'Manage clothing sizes, track variants, and reward loyal customers with points.',
                tag: '👗 Fashion',
              },
              {
                img: 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=600&q=80',
                title: 'Electronics Shops',
                desc: 'Sell high-value items, record serial numbers via barcode, and track supplier purchases.',
                tag: '📱 Electronics',
              },
              {
                img: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600&q=80',
                title: 'Hardware Stores',
                desc: 'Handle hundreds of SKUs, set low-stock alerts, and manage multiple suppliers easily.',
                tag: '🔧 Hardware',
              },
              {
                img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&q=80',
                title: 'Pharmacies',
                desc: 'Track medicine stock, set expiry-based low-stock alerts, and manage customer records.',
                tag: '💊 Pharmacy',
              },
              {
                img: 'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=600&q=80',
                title: 'Clinics & Health',
                desc: 'Bill patients, manage medical supplies inventory, and track daily revenue in one place.',
                tag: '🏥 Healthcare',
              },
              {
                img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&q=80',
                title: 'Hotels & Lodges',
                desc: 'Manage restaurant orders, bar stock, room service billing, and daily expense reports.',
                tag: '🏨 Hospitality',
              },
              {
                img: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=600&q=80',
                title: 'Cafés & Restaurants',
                desc: 'Quick checkout, manage ingredients stock, split payment methods, and track peak hours.',
                tag: '☕ F&B',
              },
            ].map(u => (
              <article key={u.title} className="ps-usecase-card">
                <div className="ps-usecase-img-wrap">
                  <img src={u.img} alt={u.title} className="ps-usecase-img" loading="lazy" />
                  <span className="ps-usecase-tag">{u.tag}</span>
                </div>
                <div className="ps-usecase-body">
                  <h3>{u.title}</h3>
                  <p>{u.desc}</p>
                </div>
              </article>
            ))}
          />
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="ps-section">
        <div className="ps-section-head">
          <span className="ps-eyebrow">Simple, honest pricing</span>
          <h2>Plans that grow with you</h2>
          <p>Start free for 7 days. No credit card required. Cancel anytime.</p>
        </div>
        <Carousel
          className="pricing-carousel"
          itemsPerView={3}
          itemsPerViewTablet={2}
          itemsPerViewMobile={1}
          items={[
            <article className="ps-price-card">
              <div className="ps-price-header">
                <h3>Free Trial</h3>
                <div className="ps-price"><span className="ps-price-curr">KSh</span><span className="ps-price-val">0</span><span className="ps-price-per">/ 7 days</span></div>
              </div>
              <div className="ps-price-body">
                <p className="ps-price-desc">Try everything, no commitment.</p>
                <ul>
                  <li>Up to 3 cashiers</li>
                  <li>Full POS features</li>
                  <li>Sales reporting</li>
                  <li>Inventory management</li>
                </ul>
                <button className="ps-btn-primary" onClick={() => openRequestForm('trial')}>Start free trial</button>
              </div>
            </article>,
            <article className="ps-price-card">
              <div className="ps-price-header">
                <h3>Monthly Basic</h3>
                <div className="ps-price"><span className="ps-price-curr">KSh</span><span className="ps-price-val">850</span><span className="ps-price-per">/ month</span></div>
              </div>
              <div className="ps-price-body">
                <p className="ps-price-desc">Essentials for a small shop.</p>
                <ul>
                  <li>Up to 3 cashiers</li>
                  <li>Full POS features</li>
                  <li>Sales reporting</li>
                  <li>Inventory management</li>
                  <li>Customer loyalty</li>
                  <li>Email support</li>
                </ul>
                <button className="ps-btn-primary" onClick={() => openRequestForm('monthly_basic')}>Get started →</button>
              </div>
            </article>,
            <article className="ps-price-card popular">
              <span className="ps-popular-badge">Most popular</span>
              <div className="ps-price-header">
                <h3>Monthly Premium</h3>
                <div className="ps-price"><span className="ps-price-curr">KSh</span><span className="ps-price-val">1,500</span><span className="ps-price-per">/ month</span></div>
              </div>
              <div className="ps-price-body">
                <p className="ps-price-desc">Everything you need to run a busy store.</p>
                <ul>
                  <li>Up to 5 cashiers</li>
                  <li>Full POS features</li>
                  <li>Sales reporting</li>
                  <li>Inventory management</li>
                  <li>Customer loyalty</li>
                  <li>Advanced analytics</li>
                  <li>Priority support</li>
                </ul>
                <button className="ps-btn-primary" onClick={() => openRequestForm('monthly_premium')}>Get started →</button>
              </div>
            </article>,
            <article className="ps-price-card">
              <span className="ps-save-badge">Save KSh 1,700</span>
              <div className="ps-price-header">
                <h3>Yearly Basic</h3>
                <div className="ps-price"><span className="ps-price-curr">KSh</span><span className="ps-price-val">8,500</span><span className="ps-price-per">/ year</span></div>
              </div>
              <div className="ps-price-body">
                <p className="ps-price-desc">2 months free on the basic plan.</p>
                <ul>
                  <li>Up to 3 cashiers</li>
                  <li>Full POS features</li>
                  <li>Sales reporting</li>
                  <li>Inventory management</li>
                  <li>Customer loyalty</li>
                  <li>Email support</li>
                </ul>
                <button className="ps-btn-primary" onClick={() => openRequestForm('yearly_basic')}>Choose yearly →</button>
              </div>
            </article>,
            <article className="ps-price-card">
              <span className="ps-save-badge">Save KSh 3,000</span>
              <div className="ps-price-header">
                <h3>Yearly Premium</h3>
                <div className="ps-price"><span className="ps-price-curr">KSh</span><span className="ps-price-val">15,000</span><span className="ps-price-per">/ year</span></div>
              </div>
              <div className="ps-price-body">
                <p className="ps-price-desc">3 months free — best overall value.</p>
                <ul>
                  <li>Up to 5 cashiers</li>
                  <li>Full POS features</li>
                  <li>Sales reporting</li>
                  <li>Inventory management</li>
                  <li>Customer loyalty</li>
                  <li>Advanced analytics</li>
                  <li>Priority support</li>
                </ul>
                <button className="ps-btn-primary" onClick={() => openRequestForm('yearly_premium')}>Choose yearly →</button>
              </div>
            </article>,
          ]}
        />
      </section>

      {/* ── SUPPORT ── */}
      <section id="support" className="ps-section alt">
        <div className="ps-section-inner">
        <div className="ps-section-head">
          <span className="ps-eyebrow">We've got your back</span>
          <h2>Support & help</h2>
          <p>Questions, issues, or just getting started — we're here.</p>
        </div>
        <div className="ps-support-grid">
          <article className="ps-support-card">
            <span className="ps-support-icon">💬</span>
            <h3>Chat with us</h3>
            <p>Get quick answers from our support team during business hours.</p>
            <a href="https://wa.me/254112800325" target="_blank" rel="noopener noreferrer">WhatsApp →</a>
          </article>
          <article className="ps-support-card">
            <span className="ps-support-icon">📧</span>
            <h3>Email support</h3>
            <p>Send us a detailed message and we'll respond within 24 hours.</p>
            <a href="mailto:admin@vyrosocial.com">admin@vyrosocial.com</a>
          </article>
          <article className="ps-support-card">
            <span className="ps-support-icon">📚</span>
            <h3>Help center</h3>
            <p>Browse guides, tutorials, and FAQs to get the most out of Vyro POS.</p>
            <button onClick={() => scrollTo('portals')}>View guides →</button>
          </article>
        </div>

        <div className="ps-faq">
          <h3>Frequently asked</h3>
          <details>
            <summary>Do I need internet to use Vyro POS?</summary>
            <p>No. Vyro POS works fully offline. Your sales and inventory are saved locally and sync to the cloud automatically when you reconnect.</p>
          </details>
          <details>
            <summary>Can I manage multiple stores?</summary>
            <p>Yes. Admins can create and manage multiple stores, each with their own team, products, and data — all from one dashboard.</p>
          </details>
          <details>
            <summary>What payment methods are supported?</summary>
            <p>M-Pesa, cash, card, and credit. You can see payment breakdowns in your reports.</p>
          </details>
          <details>
            <summary>How does the loyalty program work?</summary>
            <p>Customers earn points based on their spend (e.g. 1 point per KSh 1,000). You configure the earning rate and redemption threshold in settings.</p>
          </details>
          <details>
            <summary>Is there a free trial?</summary>
            <p>Yes — every new store gets a 7-day free trial with full features. No credit card required.</p>
          </details>
        </div>
        </div>
      </section>
      <footer className="ps-footer">
        <div className="ps-footer-inner">
          {/* 4-col grid */}
          <div className="ps-footer-grid">
            {/* Brand */}
            <div className="ps-footer-brand-col">
              <div className="ps-footer-brand">
                <img
                  src="/logo.png"
                  alt="Vyro POS"
                  onError={e => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <span className="ps-footer-logo-fallback" style={{display:'none'}}>
                  <span className="ps-footer-logo-mark">V</span>
                </span>
                <span>Vyro POS</span>
              </div>
              <p className="ps-footer-tagline">Sell · Track · Grow</p>
              <p className="ps-footer-desc">The all-in-one POS built for Kenyan businesses. Works online and offline.</p>
              <div className="ps-footer-socials">
                <a href="https://wa.me/254112800325" target="_blank" rel="noopener noreferrer" className="ps-footer-social" aria-label="WhatsApp">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.556 4.116 1.523 5.843L.057 23.5l5.806-1.463A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.368l-.36-.214-3.717.937.991-3.617-.235-.375A9.818 9.818 0 012.182 12c0-5.426 4.392-9.818 9.818-9.818 5.426 0 9.818 4.392 9.818 9.818 0 5.426-4.392 9.818-9.818 9.818z"/></svg>
                </a>
                <a href="mailto:admin@vyrosocial.com" className="ps-footer-social" aria-label="Email">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </a>
              </div>
            </div>

            {/* Quick links */}
            <div className="ps-footer-links-col">
              <h4 className="ps-footer-col-title">Quick links</h4>
              <nav className="ps-footer-nav">
                {[['home','Home'],['portals','Portals'],['features','Features'],['usecases','Use Cases'],['pricing','Pricing'],['support','Support & FAQ']].map(([id,label]) => (
                  <button key={id} onClick={() => scrollTo(id)}>{label}</button>
                ))}
              </nav>
            </div>

            {/* Support & Legal */}
            <div className="ps-footer-links-col">
              <h4 className="ps-footer-col-title">Support & Legal</h4>
              <nav className="ps-footer-nav">
                <a href="https://wa.me/254112800325" target="_blank" rel="noopener noreferrer">💬 WhatsApp Support</a>
                <a href="mailto:admin@vyrosocial.com">📧 Email Support</a>
                <button onClick={() => setLegalModal('terms')}>📄 Terms of Service</button>
                <button onClick={() => setLegalModal('privacy')}>🔒 Privacy Policy</button>
                <button onClick={() => setLegalModal('refund')}>💰 Refund Policy</button>
              </nav>
            </div>

            {/* Get started */}
            <div className="ps-footer-cta-col">
              <h4 className="ps-footer-col-title">Get started</h4>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:14,lineHeight:1.7,marginBottom:16}}>
                7-day free trial. No credit card. Cancel anytime.
              </p>
              <button
                className="ps-btn-primary"
                style={{width:'100%',marginBottom:12}}
                onClick={() => openRequestForm('trial')}
              >
                Start free trial →
              </button>
              <div className="ps-footer-contact">
                <a href="https://wa.me/254112800325" target="_blank" rel="noopener noreferrer">
                  📲 Chat on WhatsApp
                </a>
                <a href="mailto:admin@vyrosocial.com">
                  📧 admin@vyrosocial.com
                </a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="ps-footer-bottom">
            <p>© {new Date().getFullYear()} Vyro POS. Built for Kenyan retail.</p>
            <div className="ps-footer-bottom-links">
              <button onClick={() => setLegalModal('privacy')}>Privacy</button>
              <button onClick={() => setLegalModal('terms')}>Terms</button>
              <button onClick={() => setLegalModal('refund')}>Refunds</button>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
