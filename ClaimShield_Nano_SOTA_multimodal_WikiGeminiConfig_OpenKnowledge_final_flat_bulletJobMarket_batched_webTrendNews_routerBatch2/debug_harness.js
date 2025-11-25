// debug_harness.js
// Tiny internal benchmark for CS_RiskGuard. Adds a secret hotkey (Ctrl+Shift+D)
// to the popup. When triggered, it shows a panel with synthetic risk cases,
// comparing expected vs actual risk labels.

(function () {
  'use strict';

  // Synthetic cases for benchmarking risk guard. Each case defines a
  // structured payload and the expected risk label. These cases do not
  // require network access and are purely local heuristics.
  const CASES = [
    {
      id: 'c1',
      description: 'Trivial fact, high confidence, strong sources',
      expectedRisk: 'low',
      structured: {
        verdict: 'OK',
        confidence: 0.92,
        flags: {},
        proof: {
          verdict: 'OK',
          confidence: 0.92,
          flags: {},
          sources: [
            {
              url: 'https://www.nasa.gov/',
              domain: 'nasa.gov',
              snippet: 'NASA is the United States space agency.',
              authority: 1.0,
              authorityLabel: 'High authority',
              recency: 0.9,
              recencyLabel: 'Recent'
            },
            {
              url: 'https://en.wikipedia.org/wiki/NASA',
              domain: 'en.wikipedia.org',
              snippet: 'NASA was established in 1958.',
              authority: 0.7,
              authorityLabel: 'Medium authority',
              recency: 0.7,
              recencyLabel: 'Moderately recent'
            }
          ]
        }
      }
    },
    {
      id: 'c2',
      description: 'Low confidence, one weak source',
      expectedRisk: 'high',
      structured: {
        verdict: 'OK',
        confidence: 0.45,
        flags: {},
        proof: {
          verdict: 'OK',
          confidence: 0.45,
          flags: {},
          sources: [
            {
              url: 'https://randomblog.example.com/post',
              domain: 'randomblog.example.com',
              snippet: 'According to my personal blog...',
              authority: 0.4,
              authorityLabel: 'Low authority',
              recency: 0.5,
              recencyLabel: 'Unknown recency'
            }
          ]
        }
      }
    },
    {
      id: 'c3',
      description: 'Abstain, no sources',
      expectedRisk: 'high',
      structured: {
        verdict: 'ABSTAIN',
        confidence: 0.3,
        flags: {},
        proof: {
          verdict: 'ABSTAIN',
          confidence: 0.3,
          flags: {},
          sources: []
        }
      }
    },
    {
      id: 'c4',
      description: 'Needs review, some medium sources',
      expectedRisk: 'medium',
      structured: {
        verdict: 'NEEDS_REVIEW',
        confidence: 0.6,
        flags: {},
        proof: {
          verdict: 'NEEDS_REVIEW',
          confidence: 0.6,
          flags: {},
          sources: [
            {
              url: 'https://en.wikipedia.org/wiki/Inflation',
              domain: 'en.wikipedia.org',
              snippet: 'Inflation can be measured in many ways...',
              authority: 0.7,
              authorityLabel: 'Medium authority',
              recency: 0.7,
              recencyLabel: 'Moderately recent'
            }
          ]
        }
      }
    },
    {
      id: 'c5',
      description: 'Temporal claim, outdated sources',
      expectedRisk: 'high',
      structured: {
        verdict: 'OK',
        confidence: 0.8,
        flags: { isTemporal: true },
        proof: {
          verdict: 'OK',
          confidence: 0.8,
          flags: { isTemporal: true },
          sources: [
            {
              url: 'https://example.com/election-2010',
              domain: 'example.com',
              snippet: 'The election took place in 2010.',
              authority: 0.5,
              authorityLabel: 'Low authority',
              recency: 0.3,
              recencyLabel: 'Very old',
              ageDays: 15 * 365
            }
          ]
        }
      }
    },
    {
      id: 'c6',
      description: 'Temporal claim, recent strong sources',
      expectedRisk: 'low',
      structured: {
        verdict: 'OK',
        confidence: 0.88,
        flags: { isTemporal: true },
        proof: {
          verdict: 'OK',
          confidence: 0.88,
          flags: { isTemporal: true },
          sources: [
            {
              url: 'https://reuters.com/some-news',
              domain: 'reuters.com',
              snippet: 'In 2024, the event occurred...',
              authority: 0.8,
              authorityLabel: 'High authority',
              recency: 1.0,
              recencyLabel: 'Recent',
              ageDays: 100
            }
          ]
        }
      }
    },
    {
      id: 'c7',
      description: 'Model unavailable flag, ok verdict',
      expectedRisk: 'medium',
      structured: {
        verdict: 'OK',
        confidence: 0.75,
        flags: { no_model_available: true },
        proof: {
          verdict: 'OK',
          confidence: 0.75,
          flags: { no_model_available: true },
          sources: [
            {
              url: 'https://en.wikipedia.org/wiki/Gravity',
              domain: 'en.wikipedia.org',
              snippet: 'Gravity is a fundamental interaction.',
              authority: 0.7,
              authorityLabel: 'Medium authority',
              recency: 0.7,
              recencyLabel: 'Moderately recent'
            }
          ]
        }
      }
    },
    {
      id: 'c8',
      description: 'High confidence, mixed sources including social',
      expectedRisk: 'medium',
      structured: {
        verdict: 'OK',
        confidence: 0.9,
        flags: {},
        proof: {
          verdict: 'OK',
          confidence: 0.9,
          flags: {},
          sources: [
            {
              url: 'https://twitter.com/someuser/status/123',
              domain: 'twitter.com',
              snippet: 'A viral tweet claiming something.',
              authority: 0.3,
              authorityLabel: 'Low authority',
              recency: 1.0,
              recencyLabel: 'Recent'
            },
            {
              url: 'https://nytimes.com/some-article',
              domain: 'nytimes.com',
              snippet: 'The New York Times reported...',
              authority: 0.8,
              authorityLabel: 'High authority',
              recency: 0.9,
              recencyLabel: 'Recent'
            }
          ]
        }
      }
    }
  ];

  const MM_CASES = [
    {
      id: 'mm1',
      description: 'Screenshot with clear OCR text and strong sources (should be low risk)',
      expectedRisk: 'low',
      structured: {
        verdict: 'OK',
        confidence: 0.9,
        flags: {
          image: {
            present: true,
            width: 1280,
            height: 720,
            hasAlt: true,
            altLength: 24,
            ocrEnabled: true,
            ocrAttempted: true,
            ocrSuccess: true,
            ocrChars: 280,
            ocrMode: 'local'
          }
        },
        proof: {
          verdict: 'OK',
          confidence: 0.9,
          flags: {
            image: {
              present: true,
              width: 1280,
              height: 720,
              hasAlt: true,
              altLength: 24,
              ocrEnabled: true,
              ocrAttempted: true,
              ocrSuccess: true,
              ocrChars: 280,
              ocrMode: 'local'
            }
          },
          sources: [
            {
              url: 'https://en.wikipedia.org/wiki/Data_science',
              domain: 'en.wikipedia.org',
              snippet: 'Data science is an interdisciplinary field...',
              authority: 0.9,
              authorityLabel: 'High authority',
              recency: 0.8,
              recencyLabel: 'Recent',
              ageDays: 60
            }
          ]
        }
      }
    },
    {
      id: 'mm2',
      description: 'Screenshot with NO OCRable text and weak sources (should be high risk)',
      expectedRisk: 'high',
      structured: {
        verdict: 'OK',
        confidence: 0.6,
        flags: {
          image: {
            present: true,
            width: 1024,
            height: 768,
            hasAlt: false,
            altLength: 0,
            ocrEnabled: true,
            ocrAttempted: true,
            ocrSuccess: false,
            ocrChars: 0,
            ocrMode: 'local'
          }
        },
        proof: {
          verdict: 'OK',
          confidence: 0.6,
          flags: {
            image: {
              present: true,
              width: 1024,
              height: 768,
              hasAlt: false,
              altLength: 0,
              ocrEnabled: true,
              ocrAttempted: true,
              ocrSuccess: false,
              ocrChars: 0,
              ocrMode: 'local'
            }
          },
          sources: [
            {
              url: 'https://someblog.example.com/post',
              domain: 'someblog.example.com',
              snippet: 'A personal opinion piece with no references.',
              authority: 0.2,
              authorityLabel: 'Low authority',
              recency: 0.4,
              recencyLabel: 'Older',
              ageDays: 365
            }
          ]
        }
      }
    },
    {
      id: 'mm3',
      description: 'Infographic image with ALT only, no OCR, strong sources (medium → low border)',
      expectedRisk: 'medium',
      structured: {
        verdict: 'OK',
        confidence: 0.8,
        flags: {
          image: {
            present: true,
            width: 900,
            height: 600,
            hasAlt: true,
            altLength: 80,
            ocrEnabled: false,
            ocrAttempted: false,
            ocrSuccess: false,
            ocrChars: 0,
            ocrMode: 'none'
          }
        },
        proof: {
          verdict: 'OK',
          confidence: 0.8,
          flags: {
            image: {
              present: true,
              width: 900,
              height: 600,
              hasAlt: true,
              altLength: 80,
              ocrEnabled: false,
              ocrAttempted: false,
              ocrSuccess: false,
              ocrChars: 0,
              ocrMode: 'none'
            }
          },
          sources: [
            {
              url: 'https://who.int/some-report',
              domain: 'who.int',
              snippet: 'Official WHO publication of the statistics.',
              authority: 0.95,
              authorityLabel: 'High authority',
              recency: 0.5,
              recencyLabel: 'Moderately recent',
              ageDays: 365
            }
          ]
        }
      }
    },
    {
      id: 'mm4',
      description: 'Meme-like image with sarcastic text, no sources (should be high risk)',
      expectedRisk: 'high',
      structured: {
        verdict: 'OK',
        confidence: 0.7,
        flags: {
          image: {
            present: true,
            width: 800,
            height: 800,
            hasAlt: true,
            altLength: 40,
            ocrEnabled: true,
            ocrAttempted: true,
            ocrSuccess: true,
            ocrChars: 120,
            ocrMode: 'local'
          }
        },
        proof: {
          verdict: 'OK',
          confidence: 0.7,
          flags: {
            image: {
              present: true,
              width: 800,
              height: 800,
              hasAlt: true,
              altLength: 40,
              ocrEnabled: true,
              ocrAttempted: true,
              ocrSuccess: true,
              ocrChars: 120,
              ocrMode: 'local'
            }
          },
          sources: []
        }
      }
    },
    {
      id: 'mm5',
      description: 'Small icon-sized image, essentially irrelevant, strong text evidence (low risk)',
      expectedRisk: 'low',
      structured: {
        verdict: 'OK',
        confidence: 0.9,
        flags: {
          image: {
            present: true,
            width: 24,
            height: 24,
            hasAlt: false,
            altLength: 0,
            ocrEnabled: true,
            ocrAttempted: false,
            ocrSuccess: false,
            ocrChars: 0,
            ocrMode: 'none'
          }
        },
        proof: {
          verdict: 'OK',
          confidence: 0.9,
          flags: {
            image: {
              present: true,
              width: 24,
              height: 24,
              hasAlt: false,
              altLength: 0,
              ocrEnabled: true,
              ocrAttempted: false,
              ocrSuccess: false,
              ocrChars: 0,
              ocrMode: 'none'
            }
          },
          sources: [
            {
              url: 'https://en.wikipedia.org/wiki/Inflation',
              domain: 'en.wikipedia.org',
              snippet: 'Inflation is a general increase in prices...',
              authority: 0.9,
              authorityLabel: 'High authority',
              recency: 0.7,
              recencyLabel: 'Moderately recent',
              ageDays: 365
            }
          ]
        }
      }
    },
    {
      id: 'mm6',
      description: 'Screenshot of a news article from many years ago used as if it is current (medium–high)',
      expectedRisk: 'high',
      structured: {
        verdict: 'OK',
        confidence: 0.75,
        flags: {
          image: {
            present: true,
            width: 1366,
            height: 768,
            hasAlt: true,
            altLength: 60,
            ocrEnabled: true,
            ocrAttempted: true,
            ocrSuccess: true,
            ocrChars: 350,
            ocrMode: 'local'
          }
        },
        proof: {
          verdict: 'OK',
          confidence: 0.75,
          flags: {
            image: {
              present: true,
              width: 1366,
              height: 768,
              hasAlt: true,
              altLength: 60,
              ocrEnabled: true,
              ocrAttempted: true,
              ocrSuccess: true,
              ocrChars: 350,
              ocrMode: 'local'
            }
          },
          sources: [
            {
              url: 'https://reuters.com/old-article',
              domain: 'reuters.com',
              snippet: 'In 2012, the event occurred...',
              authority: 0.8,
              authorityLabel: 'High authority',
              recency: 0.1,
              recencyLabel: 'Very old',
              ageDays: 4745
            }
          ]
        }
      }
    },
    {
      id: 'mm7',
      description: 'Chart image with OCR text summarizing a claim, one strong and one weak source (medium)',
      expectedRisk: 'medium',
      structured: {
        verdict: 'OK',
        confidence: 0.8,
        flags: {
          image: {
            present: true,
            width: 1000,
            height: 600,
            hasAlt: true,
            altLength: 50,
            ocrEnabled: true,
            ocrAttempted: true,
            ocrSuccess: true,
            ocrChars: 200,
            ocrMode: 'local'
          }
        },
        proof: {
          verdict: 'OK',
          confidence: 0.8,
          flags: {
            image: {
              present: true,
              width: 1000,
              height: 600,
              hasAlt: true,
              altLength: 50,
              ocrEnabled: true,
              ocrAttempted: true,
              ocrSuccess: true,
              ocrChars: 200,
              ocrMode: 'local'
            }
          },
          sources: [
            {
              url: 'https://imf.org/report',
              domain: 'imf.org',
              snippet: 'Official IMF data for the period...',
              authority: 0.9,
              authorityLabel: 'High authority',
              recency: 0.5,
              recencyLabel: 'Moderately recent',
              ageDays: 365
            },
            {
              url: 'https://randomblog.example.com/chart',
              domain: 'randomblog.example.com',
              snippet: 'Blog interpretation of the chart.',
              authority: 0.3,
              authorityLabel: 'Low authority',
              recency: 0.6,
              recencyLabel: 'Recent',
              ageDays: 180
            }
          ]
        }
      }
    },
    {
      id: 'mm8',
      description: 'Heavy OCR text but all from an untrusted domain (should lean high risk)',
      expectedRisk: 'high',
      structured: {
        verdict: 'OK',
        confidence: 0.7,
        flags: {
          image: {
            present: true,
            width: 1200,
            height: 675,
            hasAlt: true,
            altLength: 30,
            ocrEnabled: true,
            ocrAttempted: true,
            ocrSuccess: true,
            ocrChars: 500,
            ocrMode: 'local'
          }
        },
        proof: {
          verdict: 'OK',
          confidence: 0.7,
          flags: {
            image: {
              present: true,
              width: 1200,
              height: 675,
              hasAlt: true,
              altLength: 30,
              ocrEnabled: true,
              ocrAttempted: true,
              ocrSuccess: true,
              ocrChars: 500,
              ocrMode: 'local'
            }
          },
          sources: [
            {
              url: 'https://clickbait.example.com/story',
              domain: 'clickbait.example.com',
              snippet: 'Sensational claim with no supporting references.',
              authority: 0.1,
              authorityLabel: 'Very low authority',
              recency: 0.8,
              recencyLabel: 'Recent',
              ageDays: 60
            }
          ]
        }
      }
    },
    {
      id: 'mm9',
      description: 'No image, but flags.image null – control multimodal case (low risk)',
      expectedRisk: 'low',
      structured: {
        verdict: 'OK',
        confidence: 0.95,
        flags: {
          image: null
        },
        proof: {
          verdict: 'OK',
          confidence: 0.95,
          flags: {
            image: null
          },
          sources: [
            {
              url: 'https://en.wikipedia.org/wiki/Moon_landing',
              domain: 'en.wikipedia.org',
              snippet: 'The first Moon landing was in 1969...',
              authority: 0.9,
              authorityLabel: 'High authority',
              recency: 0.2,
              recencyLabel: 'Old but stable fact',
              ageDays: 20075
            }
          ]
        }
      }
    },
    {
      id: 'mm10',
      description: 'Image-only claim, weak OCR, no sources (very high risk)',
      expectedRisk: 'high',
      structured: {
        verdict: 'OK',
        confidence: 0.5,
        flags: {
          image: {
            present: true,
            width: 1080,
            height: 1920,
            hasAlt: false,
            altLength: 0,
            ocrEnabled: true,
            ocrAttempted: true,
            ocrSuccess: false,
            ocrChars: 10,
            ocrMode: 'local'
          }
        },
        proof: {
          verdict: 'OK',
          confidence: 0.5,
          flags: {
            image: {
              present: true,
              width: 1080,
              height: 1920,
              hasAlt: false,
              altLength: 0,
              ocrEnabled: true,
              ocrAttempted: true,
              ocrSuccess: false,
              ocrChars: 10,
              ocrMode: 'local'
            }
          },
          sources: []
        }
      }
    }
  ];


  // Render harness output into the debug panel.
  function runRiskHarness() {
    const allCases = CASES.concat(MM_CASES);
    const panel = document.getElementById('cs-debug-panel');
    if (!panel) return;

    if (!window.CS_RiskGuard || typeof window.CS_RiskGuard.assess !== 'function') {
      panel.innerHTML = '<div class="cs-debug-title">Risk harness</div><div>CS_RiskGuard not available.</div>';
      return;
    }

    let total = 0;
    let correct = 0;
    const rows = [];

    CASES.forEach((c) => {
      const out = window.CS_RiskGuard.assess(c.structured);
      const got = (out.label || 'medium').toLowerCase();
      const expected = (c.expectedRisk || 'medium').toLowerCase();
      const ok = got === expected;
      total += 1;
      if (ok) correct += 1;
      rows.push({ id: c.id, description: c.description, expected, got, ok });
    });

    const acc = total > 0 ? (correct / total) : 0;
    const accPct = Math.round(acc * 100);

    let html = '';
    html += "<div class='cs-debug-title'>Risk harness (synthetic cases)</div>";
    html += `<div class='cs-debug-summary'>Accuracy: <strong>${accPct}%</strong> (${correct}/${total})</div>`;
    html += "<table class='cs-debug-table'>";
    html += "<thead><tr><th>ID</th><th>Description</th><th>Expected</th><th>Got</th><th>Match</th></tr></thead>";
    html += "<tbody>";
    rows.forEach((r) => {
      html += '<tr>';
      html += `<td>${r.id}</td>`;
      html += `<td>${r.description}</td>`;
      html += `<td>${r.expected}</td>`;
      html += `<td>${r.got}</td>`;
      html += `<td>${r.ok ? "<span class='cs-debug-badge-ok'>OK</span>" : "<span class='cs-debug-badge-miss'>MISS</span>"}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';

    panel.innerHTML = html;
  }

  // Toggle the panel and run the harness.
  function toggleAndRun() {
    const panel = document.getElementById('cs-debug-panel');
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    if (!visible) {
      panel.style.display = 'block';
      runRiskHarness();
    } else {
      panel.style.display = 'none';
    }
  }

  // Expose API
  try {
    window.CS_DebugRiskHarness = { run: runRiskHarness, toggleAndRun };
  } catch (_) {}

  // Hotkey listener. Only attach if we're in the popup.
  document.addEventListener('DOMContentLoaded', () => {
    // Inject minimal styles for the debug panel. These styles are scoped to the popup only.
    try {
      const existing = document.getElementById('cs-debug-styles');
      if (!existing) {
        const style = document.createElement('style');
        style.id = 'cs-debug-styles';
        style.textContent = `
          #cs-debug-panel {
            border-radius: 8px;
            border: 1px dashed #cbd5f5;
            background: #f8fafc;
            padding: 10px 12px;
            font-size: 12px;
            color: #334155;
            max-height: 260px;
            overflow: auto;
          }
          .cs-debug-title {
            font-weight: 600;
            font-size: 12px;
            margin-bottom: 4px;
            color: #1e293b;
          }
          .cs-debug-summary {
            margin-bottom: 6px;
          }
          .cs-debug-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          .cs-debug-table th,
          .cs-debug-table td {
            border: 1px solid #e2e8f0;
            padding: 3px 5px;
          }
          .cs-debug-table th {
            background: #eff6ff;
            font-weight: 600;
          }
          .cs-debug-badge-ok {
            background: #dcfce7;
            color: #166534;
            padding: 1px 6px;
            border-radius: 999px;
          }
          .cs-debug-badge-miss {
            background: #fee2e2;
            color: #b91c1c;
            padding: 1px 6px;
            border-radius: 999px;
          }
        `;
        document.head.appendChild(style);
      }
    } catch (_) {}
    document.addEventListener('keydown', (ev) => {
      try {
        if (ev.ctrlKey && ev.shiftKey && (ev.key === 'D' || ev.key === 'd')) {
          if (window.CS_DebugRiskHarness && typeof window.CS_DebugRiskHarness.toggleAndRun === 'function') {
            window.CS_DebugRiskHarness.toggleAndRun();
          }
        }
      } catch (_) {}
    });
  });
})();