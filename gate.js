/**
 * gate.js — Responsible AI Toolkit
 * Results-screen gating overlay for gated tools.
 *
 * HOW TO USE:
 * 1. Add this script just before </body>:
 *      <script src="./gate.js"></script>
 *
 * 2. Call RAIGate.init() once with your tool config:
 *      RAIGate.init({
 *        linkedInUrl:       'https://www.linkedin.com/in/abbas-al-mahdi/',
 *        toolNameEn:        'AI Readiness Checklist',
 *        toolNameAr:        'قائمة التحقق من جاهزية الذكاء الاصطناعي',
 *        formspreeEndpoint: 'https://formspree.io/f/xqegyzgd',
 *      });
 *
 * 3. Call RAIGate.trigger(data) from your React component when results are ready:
 *      if (window.RAIGate) window.RAIGate.trigger({
 *        score:    58,
 *        maxScore: 100,
 *        tier:     'Developing',
 *        answers:  answers,       // the full answers state object
 *        summary:  'Dim 1: 6/10 | Dim 2: 4/10 | ...',  // optional human-readable
 *      });
 *
 * 4. Call RAIGate.reset() in your retake/restart handler.
 *
 * What this does:
 *  - Fires a silent POST to Formspree with full results (Abbas gets an email)
 *  - Generates a session ID from the answers (for reference in conversations)
 *  - Displays score, tier, and session ID on the gate card
 *  - Pre-fills the mailto: link with score + session ID
 *  - Fully bilingual (EN/AR), respects dark/light theme
 */

(function (global) {
  'use strict';

  /* ── Config ──────────────────────────────────────────────────────────── */
  const DEFAULTS = {
    linkedInUrl:       'https://www.linkedin.com/in/abbas-al-mahdi/',
    emailAddress:      'abbasmahdi.ai@gmail.com',
    toolNameEn:        'this tool',
    toolNameAr:        'هذه الأداة',
    formspreeEndpoint: 'https://formspree.io/f/xqegyzgd',
    observeDelay:      400,
  };

  let cfg         = {};
  let gateShown   = false;
  let resultsData = {};

  /* ── Strings ─────────────────────────────────────────────────────────── */
  const COPY = {
    en: {
      headline:      'Your results are ready',
      scoreLabel:    'Your Score',
      sessionLabel:  'Session ID',
      sessionHint:   'Quote this when you reach out so I can pull up your exact results.',
      sub:           (name) => `To unlock your full ${name} report, including your section-by-section breakdown and prioritised recommendations, connect with Abbas Al Mahdi on LinkedIn.`,
      li:            'Connect on LinkedIn →',
      email:         'Send an Email',
      why:           'Why is this gated?',
      whyText:       'The full report includes scored benchmarks, gap analysis, and tailored recommendations, content normally delivered in a paid engagement. Connecting on LinkedIn is the only thing asked in return.',
      copy:          'Copy ID',
      copied:        'Copied ✓',
      back:          '← Return to toolkit',
    },
    ar: {
      headline:      'نتائجك جاهزة',
      scoreLabel:    'نتيجتك',
      sessionLabel:  'رقم الجلسة',
      sessionHint:   'أرسل هذا الرمز عند التواصل حتى أتمكن من استرجاع نتائجك الكاملة.',
      sub:         (name) => `للاطلاع على التقرير الكامل لـ${name}، بما في ذلك التقييم المُفصَّل والتوصيات المرتبة حسب الأولوية، تواصل مع عباس آل مهدي عبر LinkedIn.`,
      li:            'تواصل عبر LinkedIn ←',
      email:         'أرسل بريداً إلكترونياً',
      why:           'لماذا هذا التقرير محجوب؟',
      whyText:       'يتضمن التقرير الكامل معايير مُقيَّمة وتحليل فجوات وتوصيات مخصصة (محتوى يتم تقديمه عادة في إطار اتفاقيات مدفوعة). التواصل عبر LinkedIn هو الشيء الوحيد المطلوب في المقابل.',
      copy:          'نسخ',
      copied:        'تم النسخ ✓',
      back:          '← العودة إلى مجموعة الأدوات',
    }
  };

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function getLang() {
    return document.documentElement.lang === 'ar' ? 'ar' : 'en';
  }

  function isDark() {
    return document.documentElement.dataset.theme === 'dark';
  }

  /* ── Session ID ──────────────────────────────────────────────────────── */
  // Full: base64 of the serialised answers — losslessly reconstructable
  // Short: 'RAI-' + first 8 chars of full ID — for display and verbal reference
  function generateSessionId(answers) {
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify(answers || {}))));
    } catch (e) {
      return btoa(Date.now().toString());
    }
  }

  function generateShortCode(sessionId) {
    return 'RAI-' + sessionId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
  }

  /* ── Formspree silent notification ───────────────────────────────────── */
  function sendToFormspree(data, sessionId, shortCode) {
    if (!cfg.formspreeEndpoint) return;
    const lang = getLang();
    const toolName = lang === 'ar' ? cfg.toolNameAr : cfg.toolNameEn;

    const payload = {
      _subject:    '[RAI Toolkit] ' + cfg.toolNameEn + ' completed - ' + (data.score !== undefined ? data.score + '/' + (data.maxScore || 100) : 'unscored'),
      tool:        cfg.toolNameEn,
      tool_ar:     cfg.toolNameAr,
      score:       data.score !== undefined ? data.score + ' / ' + (data.maxScore || 100) : 'N/A',
      tier:        data.tier   || 'N/A',
      summary:     data.summary || 'N/A',
      session_id:  sessionId,
      short_code:  shortCode,
      language:    lang,
      timestamp:   new Date().toISOString(),
      page_url:    window.location.href,
    };

    fetch(cfg.formspreeEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify(payload),
    }).catch(function () {
      // Silent — do not surface Formspree errors to the user
    });
  }

  /* ── Build mailto: link ──────────────────────────────────────────────── */
  function buildMailto(data, sessionId, shortCode) {
    const lang   = getLang();
    const score  = data.score !== undefined ? data.score + '/' + (data.maxScore || 100) : '';
    const tier   = data.tier  || '';
    const tool   = lang === 'ar' ? cfg.toolNameAr : cfg.toolNameEn;

    const subject = cfg.toolNameEn + (score ? ' - Score: ' + score : '') + ' [' + shortCode + ']';

    const body = [
      'Hi Abbas,',
      '',
      'I just completed the ' + cfg.toolNameEn + '.',
      score ? 'Overall score: ' + score + (tier ? ' (' + tier + ')' : '') : '',
      data.summary ? 'Section breakdown: ' + data.summary : '',
      '',
      'Session ID: ' + shortCode,
      '(Full ID: ' + sessionId + ')',
      '',
      'Please use this to pull up my results.',
    ].filter(function (line, i, arr) {
      // Remove consecutive blank lines
      return !(line === '' && arr[i - 1] === '');
    }).join('\n');

    return 'mailto:' + cfg.emailAddress +
      '?subject=' + encodeURIComponent(subject) +
      '&body='    + encodeURIComponent(body);
  }

  /* ── CSS injection ───────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('rai-gate-styles')) return;
    const style = document.createElement('style');
    style.id = 'rai-gate-styles';
    style.textContent = `
      #rai-gate-overlay {
        position: fixed; inset: 0; z-index: 9000;
        display: flex; align-items: center; justify-content: center; padding: 20px;
        background: rgba(17,19,26,.72);
        backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
        animation: rai-gate-fadein .25s ease;
      }
      @keyframes rai-gate-fadein { from { opacity:0; } to { opacity:1; } }

      #rai-gate-card {
        background: var(--bg-infobox,#f8f9fa);
        border: 1px solid var(--border-blue,#72acf7);
        border-radius: 2px;
        padding: 32px 36px;
        max-width: 500px; width: 100%;
        box-shadow: 0 8px 40px rgba(0,0,0,.28);
        text-align: center;
      }
      [data-theme="dark"] #rai-gate-card { background:#1e2229; border-color:#4a6fa8; }

      #rai-gate-icon {
        width: 48px; height: 48px; margin: 0 auto 14px;
        background: var(--bg-hover,#eaf3ff); border-radius: 2px;
        display: flex; align-items: center; justify-content: center; font-size: 24px;
      }
      #rai-gate-headline {
        font-size: 19px; font-weight: 700; color: var(--text,#202122);
        margin-bottom: 16px; line-height: 1.3;
      }
      [data-theme="dark"] #rai-gate-headline { color:#eaecf0; }

      /* Score + session block */
      #rai-gate-score-block {
        background: var(--bg-sidebar,#f8f9fa);
        border: 1px solid var(--border-light,#eaecf0);
        border-radius: 2px;
        padding: 14px 16px;
        margin-bottom: 18px;
        text-align: start;
        display: none;   /* shown only when score data is available */
      }
      [data-theme="dark"] #rai-gate-score-block { background:#1a1d24; border-color:#2a2d36; }

      .rai-gate-score-row {
        display: flex; justify-content: space-between; align-items: baseline;
        gap: 12px; margin-bottom: 6px;
      }
      .rai-gate-score-label { font-size: 11px; font-weight: 700; color: var(--text-dim,#72777d); text-transform: uppercase; letter-spacing: .6px; }
      .rai-gate-score-value { font-size: 22px; font-weight: 900; color: var(--accent,#3366cc); line-height: 1; }
      .rai-gate-tier-pill {
        font-size: 11px; font-weight: 600; padding: 2px 8px;
        background: var(--bg-hover,#eaf3ff); color: var(--text-link,#3366cc);
        border: 1px solid var(--border-blue,#72acf7); border-radius: 2px;
      }
      [data-theme="dark"] .rai-gate-tier-pill { background:#1e2d45; color:#6ea8fe; border-color:#4a6fa8; }

      .rai-gate-session-row { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-light,#eaecf0); }
      [data-theme="dark"] .rai-gate-session-row { border-color:#2a2d36; }
      .rai-gate-session-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
      .rai-gate-session-code {
        font-family: 'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;
        font-size: 13px; font-weight: 700; color: var(--text,#202122);
        background: var(--bg-hover,#eaf3ff);
        border: 1px solid var(--border-blue,#72acf7);
        border-radius: 2px; padding: 5px 10px;
        display: block; word-break: break-all; margin-bottom: 6px;
        letter-spacing: .5px;
      }
      [data-theme="dark"] .rai-gate-session-code { background:#1e2d45; color:#6ea8fe; border-color:#4a6fa8; }
      .rai-gate-session-hint { font-size: 11px; color: var(--text-dim,#72777d); line-height: 1.5; }

      #rai-gate-copy-btn {
        background: transparent; border: 1px solid var(--border,#d4d5d9);
        color: var(--text-muted,#54595d); border-radius: 2px;
        padding: 3px 9px; font-size: 11px; font-weight: 600;
        cursor: pointer; font-family: inherit; transition: border-color .15s, color .15s;
        white-space: nowrap;
      }
      #rai-gate-copy-btn:hover { border-color: var(--accent,#3366cc); color: var(--accent,#3366cc); }

      /* Sub text */
      #rai-gate-sub { font-size: 13px; color: var(--text-muted,#54595d); line-height: 1.75; margin-bottom: 20px; }
      [data-theme="dark"] #rai-gate-sub { color:#a2a9b1; }

      /* Buttons */
      .rai-gate-actions { display: flex; flex-direction: column; gap: 9px; margin-bottom: 18px; }

      .rai-gate-btn-li {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        background: var(--accent,#3366cc); color: #fff;
        border: none; border-radius: 2px; padding: 11px 20px;
        font-size: 14px; font-weight: 600; cursor: pointer;
        font-family: inherit; text-decoration: none; transition: opacity .15s; width: 100%;
      }
      .rai-gate-btn-li:hover { opacity:.88; }
      [data-theme="dark"] .rai-gate-btn-li { background:#6ea8fe; color:#11131a; }

      .rai-gate-btn-email {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        background: transparent; border: 1px solid var(--border,#d4d5d9);
        color: var(--text-muted,#54595d); border-radius: 2px; padding: 10px 20px;
        font-size: 13px; font-weight: 600; cursor: pointer;
        font-family: inherit; text-decoration: none; transition: border-color .15s, color .15s; width: 100%;
      }
      .rai-gate-btn-email:hover { border-color: var(--accent,#3366cc); color: var(--accent,#3366cc); }
      [data-theme="dark"] .rai-gate-btn-email { border-color:#3a3d45; color:#a2a9b1; }

      /* Why disclosure */
      #rai-gate-why {
        font-size: 11px; font-weight: 600; color: var(--text-link,#3366cc);
        cursor: pointer; border: none; background: none; font-family: inherit;
        text-decoration: underline; text-decoration-style: dotted; margin-bottom: 0;
      }
      #rai-gate-why-text {
        display: none; font-size: 12px; color: var(--text-dim,#72777d);
        line-height: 1.65; margin-top: 10px; text-align: start;
        background: var(--bg-sidebar,#f8f9fa); border: 1px solid var(--border-light,#eaecf0);
        border-radius: 2px; padding: 10px 12px;
      }
      [data-theme="dark"] #rai-gate-why-text { background:#1a1d24; border-color:#2a2d36; }

      #rai-gate-back {
        display: block; margin-top: 14px; font-size: 12px;
        color: var(--text-dim,#72777d); text-decoration: none; cursor: pointer;
      }
      #rai-gate-back:hover { color: var(--accent,#3366cc); }

      .rai-gate-blurred { filter: blur(5px); pointer-events: none; user-select: none; }
    `;
    document.head.appendChild(style);
  }

  /* ── Build gate DOM ──────────────────────────────────────────────────── */
  function buildGate() {
    const lang      = getLang();
    const copy      = COPY[lang];
    const toolName  = lang === 'ar' ? cfg.toolNameAr : cfg.toolNameEn;
    const data      = resultsData;
    const hasScore  = data.score !== undefined;

    // Generate session IDs
    const sessionId  = generateSessionId(data.answers);
    const shortCode  = generateShortCode(sessionId);
    const mailtoHref = buildMailto(data, sessionId, shortCode);

    // Fire Formspree silently
    sendToFormspree(data, sessionId, shortCode);

    const overlay = document.createElement('div');
    overlay.id    = 'rai-gate-overlay';
    overlay.dir   = lang === 'ar' ? 'rtl' : 'ltr';

    // Score block HTML (only rendered if score data available)
    const scoreBlockHTML = hasScore ? `
      <div id="rai-gate-score-block" style="display:block">
        <div class="rai-gate-score-row">
          <span class="rai-gate-score-label">${copy.scoreLabel}</span>
          <div style="display:flex;align-items:baseline;gap:8px">
            <span class="rai-gate-score-value">${data.score}<span style="font-size:14px;font-weight:500;color:var(--text-muted,#54595d)"> / ${data.maxScore || 100}</span></span>
            ${data.tier ? `<span class="rai-gate-tier-pill">${data.tier}</span>` : ''}
          </div>
        </div>
        <div class="rai-gate-session-row">
          <div class="rai-gate-session-header">
            <span class="rai-gate-score-label">${copy.sessionLabel}</span>
            <button id="rai-gate-copy-btn" onclick="
              navigator.clipboard.writeText('${shortCode}').then(function(){
                var b=document.getElementById('rai-gate-copy-btn');
                b.textContent='${copy.copied}';
                setTimeout(function(){b.textContent='${copy.copy}';},2000);
              });
            ">${copy.copy}</button>
          </div>
          <code class="rai-gate-session-code">${shortCode}</code>
          <div class="rai-gate-session-hint">${copy.sessionHint}</div>
        </div>
      </div>
    ` : '';

    overlay.innerHTML = `
      <div id="rai-gate-card">
        <div id="rai-gate-icon">🔒</div>
        <div id="rai-gate-headline">${copy.headline}</div>
        ${scoreBlockHTML}
        <div id="rai-gate-sub">${copy.sub(toolName)}</div>
        <div class="rai-gate-actions">
          <a href="${cfg.linkedInUrl}" target="_blank" class="rai-gate-btn-li">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            ${copy.li}
          </a>
          <a id="rai-gate-email-btn" href="${mailtoHref}" class="rai-gate-btn-email">
            ✉ ${copy.email}
          </a>
        </div>
        <button id="rai-gate-why" onclick="document.getElementById('rai-gate-why-text').style.display='block';this.style.display='none';">
          ${copy.why}
        </button>
        <div id="rai-gate-why-text">${copy.whyText}</div>
        <a href="./index.html" id="rai-gate-back">${copy.back}</a>
      </div>
    `;

    document.body.appendChild(overlay);
    gateShown = true;

    // Keep gate text in sync if user toggles language while gate is open
    if (window.__raiSetLang) {
      const _orig = window.__raiSetLang;
      window.__raiSetLang = function (l) {
        _orig(l);
        const c2   = COPY[l];
        const name = l === 'ar' ? cfg.toolNameAr : cfg.toolNameEn;
        overlay.dir = l === 'ar' ? 'rtl' : 'ltr';
        var el;
        if ((el = document.getElementById('rai-gate-headline'))) el.textContent = c2.headline;
        if ((el = document.getElementById('rai-gate-sub')))      el.textContent = c2.sub(name);
        if ((el = document.getElementById('rai-gate-back')))     el.textContent = c2.back;
      };
    }
  }

  /* ── Public API ──────────────────────────────────────────────────────── */
  const RAIGate = {
    /**
     * Initialise the gate for a specific tool.
     * @param {object} options
     */
    init: function (options) {
      cfg = Object.assign({}, DEFAULTS, options);
      injectStyles();
    },

    /**
     * Trigger the gate. Pass results data so the gate can show score,
     * generate the session ID, and fire the Formspree notification.
     *
     * @param {object} data  { score, maxScore, tier, answers, summary }
     */
    trigger: function (data) {
      if (gateShown) return;
      resultsData = data || {};
      injectStyles();
      setTimeout(buildGate, cfg.observeDelay || 0);
    },

    /**
     * Reset the gate — call from retake/restart handlers.
     */
    reset: function () {
      var overlay = document.getElementById('rai-gate-overlay');
      if (overlay) overlay.remove();
      document.querySelectorAll('.rai-gate-blurred').forEach(function (el) {
        el.classList.remove('rai-gate-blurred');
      });
      gateShown   = false;
      resultsData = {};
    }
  };

  global.RAIGate = RAIGate;

})(window);
