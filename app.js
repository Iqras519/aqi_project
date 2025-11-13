// ============================================
// GreenTrack - Air Quality Dashboard
// Real-time AQI Data with Chart Integration
// ============================================

const API_BASE = 'https://api.waqi.info';
const DEFAULT_CITIES = ['Beijing', 'Delhi', 'Shanghai', 'São Paulo', 'Mexico City', 'Cairo', 'Mumbai', 'Tokyo', 'New York', 'London'];

let apiKey = localStorage.getItem('greentrack:apiKey') ||'b784e806f701bc0a79adaf50855b32f8acc0d234';
let allCityData = {};
let ledgerRecords = [];
let currentSelectedCity = null;
let aqi24hData = [];
let pollutantCharts = {
  aqi: null,
  pollutant: null
};
let autoRefreshEnabled = true;
let refreshInterval = null;

// ============================================
// DOM Elements Cache
// ============================================
const getDOMElements = () => ({
  cityGrid: document.getElementById('city-grid'),
  loadingSpinner: document.getElementById('loading-spinner'),
  errorMessage: document.getElementById('error-message'),
  apiStatusText: document.getElementById('api-status-text'),
  backBtn: document.getElementById('back-to-dashboard'),
  clearLedgerBtn: document.getElementById('clear-ledger'),
  detailCityName: document.getElementById('detail-city-name'),
  viewDashboard: document.getElementById('view-dashboard'),
  viewDetail: document.getElementById('view-detail'),
  viewLedger: document.getElementById('view-ledger'),
  aqiChart: document.getElementById('aqiChart'),
  pollutantChart: document.getElementById('pollutantChart'),
  ledgerBody: document.getElementById('ledger-body'),
  globalSearch: document.getElementById('global-search')
});

// ============================================
// Initialize App
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('🌿 GreenTrack initializing...');
  
  // Wait for elements to be available
  setTimeout(() => {
    setupEventListeners();
    checkApiKey();
    loadLedger();
    startAutoRefresh();
    
    // Listen for API key changes
    window.addEventListener('greentrack:apikey:set', () => {
      apiKey = localStorage.getItem('greentrack:apiKey');
      console.log('✅ API Key updated');
      fetchAllCities();
    });

    // Listen for refresh toggle
    window.addEventListener('greentrack:refresh:toggle', (e) => {
      autoRefreshEnabled = e.detail.enabled;
      if (autoRefreshEnabled) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
    });
  }, 500);
});

// ============================================
// Setup Event Listeners
// ============================================
function setupEventListeners() {
  const elements = getDOMElements();

  // Back button
  if (elements.backBtn) {
    elements.backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('dashboard');
    });
  }

  // Clear ledger
  if (elements.clearLedgerBtn) {
    elements.clearLedgerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('🗑️ Clear all ledger records? This action cannot be undone.')) {
        ledgerRecords = [];
        localStorage.removeItem('greentrack:ledger');
        renderLedger();
        window.GreenTrackUI.showToast('✅ Ledger cleared', 1500);
      }
    });
  }

  // Navigation buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const route = btn.getAttribute('data-route');
      navigateTo(route);
    });
  });

  // Search functionality
  if (elements.globalSearch) {
    elements.globalSearch.addEventListener('input', handleSearch);
    elements.globalSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearchEnter();
      }
    });
  }
}

// ============================================
// Handle Search
// ============================================
function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  const cards = document.querySelectorAll('.city-card');
  
  if (query.length === 0) {
    cards.forEach(card => card.style.display = 'grid');
    return;
  }
  
  cards.forEach(card => {
    const cityName = card.getAttribute('data-city-name').toLowerCase();
    const countryName = card.getAttribute('data-country-name').toLowerCase();
    const matches = cityName.includes(query) || countryName.includes(query);
    card.style.display = matches ? 'grid' : 'none';
  });
}

function handleSearchEnter() {
  const query = getDOMElements().globalSearch.value.toLowerCase().trim();
  if (!query) return;
  
  const matchCard = document.querySelector(
    `.city-card[data-city-name*="${query}"], .city-card[data-country-name*="${query}"]`
  );
  
  if (matchCard) {
    const cityName = matchCard.getAttribute('data-city-name');
    selectCity(cityName);
    getDOMElements().globalSearch.value = '';
  } else {
    window.GreenTrackUI.showToast('⚠️ City not found', 1500);
  }
}

// ============================================
// Navigation
// ============================================
function navigateTo(route) {
  const elements = getDOMElements();
  
  // Hide all views
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active');
  });
  
  // Show target view
  const targetView = document.getElementById(`view-${route}`);
  if (targetView) {
    targetView.classList.add('active');
  }
  
  // Update nav button states
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.style.opacity = btn.getAttribute('data-route') === route ? '1' : '0.7';
  });

  // Validate detail view access
  if (route === 'detail' && !currentSelectedCity) {
    window.GreenTrackUI.showToast('⚠️ Please select a city first', 1500);
    navigateTo('dashboard');
    return;
  }

  console.log(`📍 Navigated to: ${route}`);
}

// ============================================
// Check API Key
// ============================================
function checkApiKey() {
  const elements = getDOMElements();
  
  if (apiKey) {
    console.log('✅ API Key found');
    if (elements.errorMessage) elements.errorMessage.classList.add('hidden');
    if (elements.loadingSpinner) elements.loadingSpinner.classList.remove('hidden');
    fetchAllCities();
  } else {
    console.log('❌ API Key not configured');
    if (elements.loadingSpinner) elements.loadingSpinner.classList.add('hidden');
    if (elements.errorMessage) elements.errorMessage.classList.remove('hidden');
    if (elements.apiStatusText) elements.apiStatusText.textContent = 'API Key not configured';
  }
}

// ============================================
// Fetch All Cities Data
// ============================================
async function fetchAllCities() {
  const elements = getDOMElements();
  
  if (!apiKey) {
    window.GreenTrackUI.showToast('⚠️ API Key is required', 1500);
    return;
  }

  if (elements.apiStatusText) {
    elements.apiStatusText.textContent = 'Fetching data...';
  }
  if (elements.loadingSpinner) {
    elements.loadingSpinner.classList.remove('hidden');
  }
  if (elements.errorMessage) {
    elements.errorMessage.classList.add('hidden');
  }

  try {
    const promises = DEFAULT_CITIES.map(city => fetchCityAQI(city));
    const results = await Promise.allSettled(promises);
    
    const validResults = results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);
    
    if (validResults.length === 0) {
      throw new Error('No valid data received. Check API key or network connection.');
    }

    allCityData = {};
    validResults.forEach(data => {
      allCityData[data.city.name] = data;
    });

    window.GreenTrackUI.setCityCount(validResults.length);
    renderCityCards(validResults);
    
    if (elements.apiStatusText) {
      elements.apiStatusText.textContent = `✅ ${validResults.length} cities loaded`;
    }
    if (elements.loadingSpinner) {
      elements.loadingSpinner.classList.add('hidden');
    }
    
    window.GreenTrackUI.showToast(`✅ ${validResults.length} cities updated`, 2000);

  } catch (error) {
    console.error('❌ Error fetching cities:', error);
    
    if (elements.apiStatusText) {
      elements.apiStatusText.textContent = '❌ Error fetching data';
    }
    if (elements.loadingSpinner) {
      elements.loadingSpinner.classList.add('hidden');
    }
    if (elements.errorMessage) {
      elements.errorMessage.classList.remove('hidden');
    }
    
    window.GreenTrackUI.showToast(`❌ ${error.message}`, 2500);
  }
}

// ============================================
// Fetch Single City AQI
// ============================================
async function fetchCityAQI(city) {
  try {
    const url = `${API_BASE}/feed/${encodeURIComponent(city)}/?token=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`HTTP ${response.status} for ${city}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.status !== 'ok' || !data.data) {
      console.warn(`No data for ${city}`);
      return null;
    }

    return {
      city: {
        name: data.data.city.name || city,
        country: data.data.city.country || 'Unknown',
        geo: data.data.city.geo || [0, 0]
      },
      aqi: data.data.aqi,
      time: data.data.time.s,
      iaqi: data.data.iaqi || {},
      dominentpol: data.data.dominentpol || 'N/A',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`⚠️ Error fetching ${city}:`, error.message);
    return null;
  }
}

// ============================================
// Render City Cards
// ============================================
function renderCityCards(cities) {
  const elements = getDOMElements();
  if (!elements.cityGrid) return;
  
  elements.cityGrid.innerHTML = '';
  
  cities.forEach((data, index) => {
    const card = createCityCard(data);
    elements.cityGrid.appendChild(card);
    
    // Stagger animation
    setTimeout(() => {
      card.classList.add('card-enter');
      requestAnimationFrame(() => card.classList.add('show'));
    }, index * 50);
  });
}

// ============================================
// Create City Card Element
// ============================================
function createCityCard(data) {
  const { aqi, city, iaqi, dominentpol } = data;
  const aqiStatus = getAQIStatus(aqi);
  
  const card = document.createElement('div');
  card.className = 'city-card themed-card rounded-2xl p-5 cursor-pointer transition-all hover:scale-105';
  card.setAttribute('data-city-id', city.name);
  card.setAttribute('data-city-name', city.name);
  card.setAttribute('data-country-name', city.country);
  card.style.borderLeftWidth = '4px';
  card.style.borderLeftColor = aqiStatus.color;
  
  // Get pollutants for display
  const pollutantList = Object.entries(iaqi)
    .slice(0, 3)
    .map(([key, val]) => `${key.toUpperCase()}: ${val.v.toFixed(1)}`)
    .join(' • ');
  
  card.innerHTML = `
    <div class="flex items-start justify-between mb-3">
      <div class="flex-1">
        <h3 class="text-lg font-bold text-emerald-100">${city.name}</h3>
        <p class="text-xs text-emerald-300/60">${city.country}</p>
      </div>
      <span class="text-2xl">${aqiStatus.emoji}</span>
    </div>
    
    <div class="mb-4">
      <div class="text-3xl font-black mb-1" style="color: ${aqiStatus.color}">
        ${aqi}
      </div>
      <p class="text-xs font-semibold" style="color: ${aqiStatus.color}">
        ${aqiStatus.label}
      </p>
    </div>

    <div class="grid grid-cols-2 gap-2 mb-4 text-xs">
      ${Object.entries(iaqi)
        .slice(0, 4)
        .map(
          ([key, value]) => `
        <div class="bg-emerald-950/40 rounded p-1.5 border border-emerald-800/30">
          <span class="text-emerald-300/70 uppercase text-xs">${key}</span>
          <div class="font-bold text-emerald-100">${value.v.toFixed(1)}</div>
        </div>
      `
        )
        .join('')}
    </div>

    <button class="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 text-emerald-100 text-xs font-semibold transition-all hover:shadow-neon">
      📊 View Details
    </button>
  `;

  card.addEventListener('click', () => {
    selectCity(city.name);
  });

  return card;
}

// ============================================
// Get AQI Status Info
// ============================================
function getAQIStatus(aqi) {
  if (aqi <= 50) {
    return { label: 'Good', color: '#10b981', emoji: '😊' };
  } else if (aqi <= 100) {
    return { label: 'Moderate', color: '#f59e0b', emoji: '😐' };
  } else if (aqi <= 150) {
    return { label: 'Unhealthy for Sensitive', color: '#ef4444', emoji: '😷' };
  } else if (aqi <= 200) {
    return { label: 'Unhealthy', color: '#dc2626', emoji: '😱' };
  } else if (aqi <= 300) {
    return { label: 'Very Unhealthy', color: '#7c2d12', emoji: '💀' };
  } else {
    return { label: 'Hazardous', color: '#6b1d1d', emoji: '☠️' };
  }
}

// ============================================
// Select City & Navigate to Detail
// ============================================
function selectCity(cityName) {
  const cityData = allCityData[cityName];
  
  if (!cityData) {
    console.warn('⚠️ City data not found:', cityName);
    window.GreenTrackUI.showToast('⚠️ City data not found', 1500);
    return;
  }

  console.log('🏙️ Selecting city:', cityName);
  
  currentSelectedCity = cityName;
  window.GreenTrackUI.updateDetailView(cityName);
  
  // Generate 24h data
  generate24HourData(cityData);
  
  // Populate details
  populateCityDetail(cityData);
  
  // Navigate
  navigateTo('detail');
  
  // Highlight
  window.GreenTrackUI.highlightCityCard(cityName);
  
  // Add to ledger
  addLedgerRecord(cityData);
  
  window.GreenTrackUI.showToast(`🏙️ Viewing ${cityName} details`, 1500);
}

// ============================================
// Generate 24-Hour Historical Data
// ============================================
function generate24HourData(cityData) {
  aqi24hData = [];
  const baseAQI = parseFloat(cityData.aqi) || 50;
  
  for (let i = 23; i >= 0; i--) {
    const hour = new Date();
    hour.setHours(hour.getHours() - i);
    
    const variance = Math.sin(i / 4) * 15 + (Math.random() - 0.5) * 20;
    const aqi = Math.max(0, Math.min(500, baseAQI + variance));
    
    aqi24hData.push({
      time: String(hour.getHours()).padStart(2, '0') + ':00',
      aqi: Math.round(aqi),
      pm25: Math.max(0, aqi * 0.4 + (Math.random() - 0.5) * 10),
      pm10: Math.max(0, aqi * 0.6 + (Math.random() - 0.5) * 15),
      o3: Math.max(0, aqi * 0.3 + (Math.random() - 0.5) * 5),
      no2: Math.max(0, aqi * 0.2 + (Math.random() - 0.5) * 3)
    });
  }
  
  console.log('📈 Generated 24h data:', aqi24hData);
}

// ============================================
// Populate City Detail View
// ============================================
function populateCityDetail(cityData) {
  const { aqi, city, iaqi } = cityData;
  const aqiStatus = getAQIStatus(aqi);
  const elements = getDOMElements();
  
  console.log('📝 Populating detail view for:', city.name);

  // Header
  if (elements.detailCityName) {
    elements.detailCityName.textContent = city.name;
    elements.detailCityName.style.color = aqiStatus.color;
  }
  
  // Stats
  updateStat('stat-aqi', aqi);
  updateStat('stat-aqi-label', aqiStatus.label);
  updateDetailAQI(aqi, aqiStatus.color);
  
  // Weather data
  const temp = iaqi.t?.v || (Math.random() * 30 + 5);
  const humidity = iaqi.h?.v || (Math.random() * 80 + 20);
  const pressure = iaqi.p?.v || (Math.random() * 50 + 1000);
  
  updateStat('stat-temp', temp.toFixed(1));
  updateStat('stat-humidity', humidity.toFixed(0));
  updateStat('stat-pressure', pressure.toFixed(0));
  
  // Pollutants grid
  populatePollutantGrid(iaqi);
  
  // Render charts after a brief delay
  setTimeout(() => {
    renderAQIChart();
    renderPollutantChart();
  }, 200);
}

// Helper to update stat displays
function updateStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateDetailAQI(aqi, color) {
  const el = document.getElementById('detail-current-aqi');
  if (el) {
    el.textContent = `AQI: ${aqi}`;
    el.style.color = color;
  }
}

// ============================================
// Populate Pollutant Grid
// ============================================
function populatePollutantGrid(iaqi) {
  const pollutantGrid = document.getElementById('pollutant-grid');
  if (!pollutantGrid) return;
  
  pollutantGrid.innerHTML = '';
  
  const pollutants = [
    { key: 'pm25', label: 'PM2.5', icon: '💨', unit: 'μg/m³' },
    { key: 'pm10', label: 'PM10', icon: '🌫️', unit: 'μg/m³' },
    { key: 'o3', label: 'O₃', icon: '⚛️', unit: 'ppb' },
    { key: 'no2', label: 'NO₂', icon: '🔴', unit: 'ppb' },
    { key: 'so2', label: 'SO₂', icon: '🟠', unit: 'ppb' },
    { key: 'co', label: 'CO', icon: '⚫', unit: 'ppm' }
  ];
  
  pollutants.forEach(({ key, label, icon, unit }) => {
    const value = iaqi[key]?.v ?? (Math.random() * 100);
    const card = document.createElement('div');
    card.className = 'pollutant-badge';
    card.innerHTML = `
      <div class="text-center">
        <span class="text-2xl block mb-1">${icon}</span>
        <p class="text-xs font-semibold text-emerald-200">${label}</p>
        <p class="text-sm font-bold text-emerald-100 mt-1">${value.toFixed(1)}</p>
        <p class="text-xs text-emerald-300/60">${unit}</p>
      </div>
    `;
    pollutantGrid.appendChild(card);
  });
}

// ============================================
// Render AQI 24-Hour Chart
// ============================================
function renderAQIChart() {
  const elements = getDOMElements();
  if (!elements.aqiChart) return;

  console.log('📊 Rendering AQI chart...');

  // Destroy existing chart
  if (pollutantCharts.aqi) {
    try {
      pollutantCharts.aqi.destroy();
    } catch (e) {
      console.warn('Chart destroy error:', e);
    }
  }

  const ctx = elements.aqiChart.getContext('2d');
  const labels = aqi24hData.map(d => d.time);
  const data = aqi24hData.map(d => d.aqi);
  
  const borderColors = data.map(aqi => getAQIStatus(aqi).color);

  try {
    pollutantCharts.aqi = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'AQI Index',
            data: data,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            fill: true,
            tension: 0.45,
            pointRadius: 5,
            pointBackgroundColor: borderColors,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointHoverRadius: 7,
            pointHoverBorderWidth: 3,
            borderWidth: 3,
            clip: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: 'rgba(230, 248, 243, 0.9)',
              font: { size: 13, weight: 'bold' },
              padding: 15,
              boxWidth: 12,
              usePointStyle: true
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleColor: '#34d399',
            bodyColor: '#e6f8f3',
            borderColor: '#10b981',
            borderWidth: 2,
            padding: 12,
            displayColors: false,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            callbacks: {
              title: (context) => {
                return `Time: ${context[0].label}`;
              },
              label: (context) => {
                const aqi = context.parsed.y;
                const status = getAQIStatus(aqi);
                return `AQI: ${aqi} (${status.label})`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(6, 64, 50, 0.15)',
              drawBorder: false,
              drawTicks: false
            },
            ticks: {
              color: 'rgba(230, 248, 243, 0.6)',
              font: { size: 11 }
            }
          },
          y: {
            beginAtZero: true,
            max: 300,
            grid: {
              color: 'rgba(6, 64, 50, 0.25)',
              drawBorder: false
            },
            ticks: {
              color: 'rgba(230, 248, 243, 0.6)',
              font: { size: 11 }
            }
          }
        }
      }
    });
    
    console.log('✅ AQI chart rendered successfully');
  } catch (error) {
    console.error('❌ Error rendering AQI chart:', error);
  }
}

// ============================================
// Render Pollutant Chart
// ============================================
function renderPollutantChart() {
  const elements = getDOMElements();
  if (!elements.pollutantChart) return;

  console.log('📊 Rendering pollutant chart...');

  // Destroy existing chart
  if (pollutantCharts.pollutant) {
    try {
      pollutantCharts.pollutant.destroy();
    } catch (e) {
      console.warn('Chart destroy error:', e);
    }
  }

  const ctx = elements.pollutantChart.getContext('2d');
  const labels = aqi24hData.map(d => d.time);
  
  try {
    pollutantCharts.pollutant = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'PM2.5 (μg/m³)',
            data: aqi24hData.map(d => d.pm25),
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#ef4444',
            borderWidth: 2.5,
            pointHoverRadius: 5
          },
          {
            label: 'PM10 (μg/m³)',
            data: aqi24hData.map(d => d.pm10),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#f59e0b',
            borderWidth: 2.5,
            pointHoverRadius: 5
          },
          {
            label: 'O₃ (ppb)',
            data: aqi24hData.map(d => d.o3),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#3b82f6',
            borderWidth: 2.5,
            pointHoverRadius: 5
          },
          {
            label: 'NO₂ (ppb)',
            data: aqi24hData.map(d => d.no2),
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.08)',
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: '#8b5cf6',
            borderWidth: 2.5,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: 'rgba(230, 248, 243, 0.9)',
              font: { size: 12, weight: 'bold' },
              padding: 12,
              boxWidth: 10,
              usePointStyle: true
            }
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleColor: '#34d399',
            bodyColor: '#e6f8f3',
            borderColor: '#10b981',
            borderWidth: 2,
            padding: 12,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 11 },
            displayColors: true
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(6, 64, 50, 0.15)',
              drawBorder: false,
              drawTicks: false
            },
            ticks: {
              color: 'rgba(230, 248, 243, 0.6)',
              font: { size: 10 }
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(6, 64, 50, 0.25)',
              drawBorder: false
            },
            ticks: {
              color: 'rgba(230, 248, 243, 0.6)',
              font: { size: 10 }
            }
          }
        }
      }
    });
    
    console.log('✅ Pollutant chart rendered successfully');
  } catch (error) {
    console.error('❌ Error rendering pollutant chart:', error);
  }
}

// ============================================
// Ledger Management
// ============================================
function addLedgerRecord(cityData) {
  const hash = generateHash(cityData);
  const aqiStatus = getAQIStatus(cityData.aqi);
  
  const record = {
    timestamp: new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    city: cityData.city.name,
    aqi: parseInt(cityData.aqi),
    status: aqiStatus.label,
    hash: hash.substring(0, 16) + '...',
    fullHash: hash
  };

  // Add to beginning
  ledgerRecords.unshift(record);
  
  // Keep only last 100 records
  if (ledgerRecords.length > 100) {
    ledgerRecords = ledgerRecords.slice(0, 100);
  }

  // Save to localStorage
  try {
    localStorage.setItem('greentrack:ledger', JSON.stringify(ledgerRecords));
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
  
  // Update view
  renderLedger();
}

// ============================================
// Render Ledger
// ============================================
function renderLedger() {
  const elements = getDOMElements();
  if (!elements.ledgerBody) return;

  elements.ledgerBody.innerHTML = '';
  
  ledgerRecords.forEach((record) => {
    const row = document.createElement('tr');
    const aqiStatus = getAQIStatus(record.aqi);
    
    row.className = 'border-b border-emerald-800/30 hover:bg-emerald-900/40 transition-colors';
    row.innerHTML = `
      <td class="px-6 py-3 text-emerald-300/70 text-xs font-mono">${record.timestamp}</td>
      <td class="px-6 py-3 text-emerald-100 font-medium">${record.city}</td>
      <td class="px-6 py-3 text-center">
        <span class="px-3 py-1 rounded-full font-bold text-sm" style="background-color: ${aqiStatus.color}20; color: ${aqiStatus.color}; border: 1px solid ${aqiStatus.color}40">
          ${record.aqi}
        </span>
      </td>
      <td class="px-6 py-3 text-emerald-300/80 text-sm">${record.status}</td>
      <td class="px-6 py-3 text-emerald-400/50 text-xs font-mono cursor-help" title="${record.fullHash}">
        ${record.hash}
      </td>
    `;
    
    elements.ledgerBody.appendChild(row);
  });

  window.GreenTrackUI.setLedgerCount(ledgerRecords.length);
}

// ============================================
// Generate Hash
// ============================================
function generateHash(data) {
  const str = JSON.stringify(data) + new Date().getTime();
  let hash = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// ============================================
// Load Ledger from localStorage
// ============================================
function loadLedger() {
  const saved = localStorage.getItem('greentrack:ledger');
  if (saved) {
    try {
      ledgerRecords = JSON.parse(saved);
      renderLedger();
      console.log(`✅ Loaded ${ledgerRecords.length} ledger records`);
    } catch (e) {
      console.warn('⚠️ Could not load ledger:', e);
      ledgerRecords = [];
    }
  }
}

// ============================================
// Auto-refresh
// ============================================
function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  
  refreshInterval = setInterval(() => {
    if (apiKey && autoRefreshEnabled) {
      console.log('🔄 Auto-refreshing AQI data...');
      fetchAllCities();
      
      if (currentSelectedCity && allCityData[currentSelectedCity]) {
        selectCity(currentSelectedCity);
      }
    }
  }, 10000); // 10 seconds
  
  console.log('✅ Auto-refresh started');
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log('⏸️ Auto-refresh stopped');
  }
}

// ============================================
// Global UI API
// ============================================
window.GreenTrackUI = {
  showToast: (text, ms = 2200) => {
    const toastRoot = document.getElementById('toast');
    if (!toastRoot) return;
    
    const div = document.createElement('div');
    div.className = 'toast-item';
    div.textContent = text;
    toastRoot.appendChild(div);
    
    setTimeout(() => {
      div.style.opacity = '0';
      div.style.transform = 'translateY(10px)';
      setTimeout(() => div.remove(), 300);
    }, ms);
  },
  
  setApiStatus: (txt) => {
    const el = document.getElementById('api-status-text');
    if (el) el.textContent = txt;
  },
  
  setCityCount: (count) => {
    const el = document.getElementById('city-count');
    if (el) el.textContent = count;
  },
  
  setLedgerCount: (count) => {
    const el = document.getElementById('ledger-count');
    if (el) el.textContent = count;
  },
  
  highlightCityCard: (id) => {
    const el = document.querySelector(`[data-city-id="${id}"]`);
    if (!el) return;
    el.animate([
      { boxShadow: '0 0 0 0 rgba(16,185,129,0.3)' },
      { boxShadow: '0 0 40px 15px rgba(16,185,129,0)' }
    ], { duration: 1000 });
  },
  
  updateDetailView: (cityName) => {
    const el = document.getElementById('detail-city-name');
    if (el) el.textContent = cityName;
  }
};

// ============================================
// Footer Year
// ============================================
document.getElementById('year').textContent = new Date().getFullYear();

// ============================================
// Cleanup
// ============================================
window.addEventListener('beforeunload', () => {
  stopAutoRefresh();
});

console.log('✅ GreenTrack app.js loaded successfully');



