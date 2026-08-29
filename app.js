document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        mode: 'short', 
        rates: {
            sports: { small: 15000, medium: 20000, large: 30000 },
            event: { small: 30000, medium: 40000, large: 60000 }
        },
        lightRate: 5000,
        size: 'medium',
        duration: 2,
        category: 'none',
        startDate: '',
        endDate: '',
        selectedDays: [],
        excludeHolidays: false,
        baseExcludeDates: '',
        baseAdjDays: 0,
        
        // Facilities State
        useLighting: false,
        lightStart: '',
        lightEnd: '',
        lightHours: 2,
        lightExcludeDates: '',
        lightAdjDays: 0,

        useCooling: false,
        coolingStart: '',
        coolingEnd: '',
        coolingHours: 2,
        coolingExcludeDates: '',
        coolingAdjDays: 0,

        useHeating: false,
        heatingStart: '',
        heatingEnd: '',
        heatingHours: 2,
        heatingExcludeDates: '',
        heatingAdjDays: 0,

        theme: 'dark'
    };

    /**
     * Date Helpers & Input Masking
     */
    function isValidDate(str) {
        if (!str || typeof str !== 'string' || str.length !== 10) return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
        const [y, m, d] = str.split('-').map(Number);
        if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return false;
        const dt = new Date(y, m - 1, d);
        return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
    }

    function formatAutoDate(raw, isDeleting) {
        if (!raw) return '';
        const digits = raw.replace(/\D/g, '').slice(0, 8);
        if (digits.length === 0) return '';

        if (digits.length < 4) {
            return digits;
        } else if (digits.length === 4) {
            return isDeleting ? digits : `${digits}-`;
        } else if (digits.length === 5) {
            return `${digits.slice(0, 4)}-${digits.slice(4)}`;
        } else if (digits.length === 6) {
            return isDeleting ? `${digits.slice(0, 4)}-${digits.slice(4)}` : `${digits.slice(0, 4)}-${digits.slice(4)}-`;
        } else {
            return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
        }
    }

    function setupDateMask(input, onChange) {
        if (!input) return;
        const wrap = input.closest('.date-input-wrap');
        const hiddenPicker = wrap ? wrap.querySelector('.native-picker') : null;
        const calBtn = wrap ? wrap.querySelector('.btn-cal') : null;

        let isDeleting = false;
        input.addEventListener('keydown', (e) => {
            isDeleting = (e.key === 'Backspace' || e.key === 'Delete');
        });

        input.addEventListener('input', () => {
            const oldVal = input.value;
            const formatted = formatAutoDate(oldVal, isDeleting);
            if (oldVal !== formatted) {
                input.value = formatted;
            }
            if (isValidDate(formatted)) {
                if (hiddenPicker) hiddenPicker.value = formatted;
                onChange(formatted);
            } else if (formatted === '') {
                if (hiddenPicker) hiddenPicker.value = '';
                onChange('');
            }
        });

        input.addEventListener('change', () => {
            const formatted = formatAutoDate(input.value, false);
            input.value = formatted;
            if (isValidDate(formatted)) {
                if (hiddenPicker) hiddenPicker.value = formatted;
                onChange(formatted);
            } else if (formatted === '') {
                if (hiddenPicker) hiddenPicker.value = '';
                onChange('');
            }
        });

        if (calBtn && hiddenPicker) {
            calBtn.addEventListener('click', (e) => {
                e.preventDefault();
                try {
                    if (hiddenPicker.showPicker) {
                        hiddenPicker.showPicker();
                    } else {
                        hiddenPicker.focus();
                        hiddenPicker.click();
                    }
                } catch (err) {
                    hiddenPicker.click();
                }
            });

            hiddenPicker.addEventListener('change', () => {
                if (hiddenPicker.value) {
                    input.value = hiddenPicker.value;
                    onChange(hiddenPicker.value);
                }
            });
        }
    }

    /**
     * Korea Astronomy and Space Science Institute (KASI) OpenAPI Key
     */
    const KASI_SERVICE_KEY = 'b113563a7b1c40fb60e0a94a853920c7bb87ff909735da575821a42e2de9e065';
    const apiHolidays = {}; // Cache: { 'YYYY-MM-DD': 'Holiday Name' }
    const loadedYears = new Set();

    /**
     * Fetch holidays from KASI OpenAPI with localStorage caching & fallback
     */
    async function fetchHolidaysForYear(year) {
        if (loadedYears.has(year)) return;
        const cacheKey = `kasi_holidays_${year}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                Object.assign(apiHolidays, parsed);
                loadedYears.add(year);
                return;
            } catch (e) {
                console.error('Cache parsing error', e);
            }
        }

        try {
            const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${KASI_SERVICE_KEY}&solYear=${year}&_type=json&numOfRows=100`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const data = await res.json();
            const items = data?.response?.body?.items?.item;
            const list = Array.isArray(items) ? items : (items ? [items] : []);
            
            const yearHolidays = {};
            list.forEach(item => {
                if (item.isHoliday === 'Y') {
                    const locdate = String(item.locdate);
                    const formatted = `${locdate.slice(0, 4)}-${locdate.slice(4, 6)}-${locdate.slice(6, 8)}`;
                    yearHolidays[formatted] = item.dateName;
                    apiHolidays[formatted] = item.dateName;
                }
            });

            localStorage.setItem(cacheKey, JSON.stringify(yearHolidays));
            loadedYears.add(year);
        } catch (err) {
            console.warn(`Failed to fetch official holidays for ${year} via OpenAPI, falling back to built-in calendar logic:`, err);
        }
    }

    async function ensureHolidaysForRange(startStr, endStr) {
        if (!isValidDate(startStr) || !isValidDate(endStr)) return;
        const startYear = parseInt(startStr.slice(0, 4), 10);
        const endYear = parseInt(endStr.slice(0, 4), 10);
        if (startYear < 2000 || startYear > 2099 || endYear < 2000 || endYear > 2099) return;
        if (Math.abs(endYear - startYear) > 3) return;

        const promises = [];
        for (let y = Math.min(startYear, endYear); y <= Math.max(startYear, endYear); y++) {
            if (!loadedYears.has(y)) {
                promises.push(fetchHolidaysForYear(y));
            }
        }
        if (promises.length > 0) {
            await Promise.all(promises);
            updateUI();
        }
    }

    /**
     * Lunar Holiday Database (2026-2035) Fallback
     * Includes Seollal (3 days), Chuseok (3 days), and Buddha's Birthday
     */
    const LUNAR_HOLIDAYS = {
        2026: ['2026-02-16', '2026-02-17', '2026-02-18', '2026-05-24', '2026-09-24', '2026-09-25', '2026-09-26'],
        2027: ['2027-02-06', '2027-02-07', '2027-02-08', '2027-05-13', '2027-09-14', '2027-09-15', '2027-09-16'],
        2028: ['2028-01-26', '2028-01-27', '2028-01-28', '2028-05-02', '2028-09-30', '2028-10-01', '2028-10-02'],
        2029: ['2029-02-12', '2029-02-13', '2029-02-14', '2029-05-20', '2029-09-21', '2029-09-22', '2029-09-23'],
        2030: ['2030-02-02', '2030-02-03', '2030-02-04', '2030-05-09', '2030-09-11', '2030-09-12', '2030-09-13'],
        2031: ['2031-01-22', '2031-01-23', '2031-01-24', '2031-05-28', '2031-09-30', '2031-10-01', '2031-10-02'],
        2032: ['2032-02-10', '2032-02-11', '2032-02-12', '2032-05-16', '2032-09-18', '2032-09-19', '2032-09-20'],
        2033: ['2033-01-30', '2033-01-31', '2033-02-01', '2033-05-06', '2033-09-07', '2033-09-08', '2033-09-09'],
        2034: ['2034-02-18', '2034-02-19', '2034-02-20', '2034-05-25', '2034-09-26', '2034-09-27', '2034-09-28'],
        2035: ['2035-02-07', '2035-02-08', '2035-02-09', '2035-05-15', '2035-09-15', '2035-09-16', '2035-09-17']
    };

    const $ = (id) => document.getElementById(id);

    // DOM Elements
    const btnShort = $('mode-short');
    const btnLong = $('mode-long');
    const weekdayContainer = $('weekday-selection-container');
    const dateLabel = $('date-label');
    const startDateInput = $('start-date');
    const endDateInput = $('end-date');
    const weekdayChecks = document.querySelectorAll('.day-check input');
    const excludeHolidaysCheck = $('exclude-holidays');
    const baseExcludeDatesInput = $('base-exclude-dates');
    const gymSizeSelect = $('gym-size');
    const durationInput = $('duration');
    const durationVal = $('duration-val');
    const categorySelect = $('category');

    // Facilities DOM
    const useLightingCheck = $('use-lighting');
    const lightingDetails = $('lighting-details');
    const lightStartInput = $('light-start');
    const lightEndInput = $('light-end');
    const lightHoursInput = $('light-hours');
    const lightExcludeDatesInput = $('light-exclude-dates');

    const useCoolingCheck = $('use-cooling');
    const coolingDetails = $('cooling-details');
    const coolingStartInput = $('cooling-start');
    const coolingEndInput = $('cooling-end');
    const coolingHoursInput = $('cooling-hours');
    const coolingExcludeDatesInput = $('cooling-exclude-dates');

    const useHeatingCheck = $('use-heating');
    const heatingDetails = $('heating-details');
    const heatingStartInput = $('heating-start');
    const heatingEndInput = $('heating-end');
    const heatingHoursInput = $('heating-hours');
    const heatingExcludeDatesInput = $('heating-exclude-dates');

    // Result DOM
    const resSessionCount = $('res-session-count');
    const resTotalHours = $('res-total-hours');
    const resBase = $('res-base');
    const baseMath = $('base-math');
    const discountedBaseRow = $('discounted-base-row');
    const resDiscountedBase = $('res-discounted-base');
    const discountedBaseMath = $('discounted-base-math');
    const lightingRow = $('lighting-row');
    const resLighting = $('res-lighting');
    const lightMath = $('light-math');
    const coolingRow = $('cooling-row');
    const resCooling = $('res-cooling');
    const coolingMath = $('cooling-math');
    const heatingRow = $('heating-row');
    const resHeating = $('res-heating');
    const heatingMath = $('heating-math');
    const holidayRow = $('holiday-row');
    const resHolidayCount = $('res-holiday-count');
    const holidayMath = $('holiday-math');
    const btnToggleHolidays = $('btn-toggle-holidays');
    const resSubtotal = $('res-subtotal');
    const resDiscountLabel = $('res-discount-label');
    const resDiscount = $('res-discount');
    const hvacTotalRow = $('hvac-total-row');
    const resHvacTotal = $('res-hvac-total');
    const resTotal = $('res-total');
    
    const themeToggle = $('theme-toggle');
    const modal = $('settings-modal');
    const btnSettings = $('btn-settings');
    const btnCloseModal = document.querySelector('.close-modal');
    const btnSaveSettings = $('btn-save-settings');
    const btnPrint = $('btn-print');

    // Auto clear placeholder on focus, restore on blur
    document.querySelectorAll('input[placeholder]').forEach(input => {
        const originalPlaceholder = input.getAttribute('placeholder');
        input.addEventListener('focus', () => {
            input.setAttribute('placeholder', '');
        });
        input.addEventListener('blur', () => {
            if (!input.value.trim()) {
                input.setAttribute('placeholder', originalPlaceholder);
            }
        });
    });

    if (btnToggleHolidays && holidayMath) {
        btnToggleHolidays.addEventListener('click', () => {
            holidayMath.classList.toggle('hidden');
            const isVisible = !holidayMath.classList.contains('hidden');
            btnToggleHolidays.innerHTML = isVisible ? '<i class="fas fa-times"></i> 닫기' : '<i class="fas fa-list-ul"></i> 목록';
        });
    }

    // Initialization
    initDates();
    loadSettings();
    applyTheme();
    ensureHolidaysForRange(state.startDate, state.endDate);
    updateUI();

    function initDates() {
        state.startDate = '';
        state.endDate = '';
        if (startDateInput) startDateInput.value = '';
        if (endDateInput) endDateInput.value = '';

        ['light', 'cooling', 'heating'].forEach(key => {
            state[`${key}Start`] = '';
            state[`${key}End`] = '';
            const sIn = $(`${key}-start`);
            const eIn = $(`${key}-end`);
            if (sIn) sIn.value = '';
            if (eIn) eIn.value = '';
        });

        state.selectedDays = [2, 4];
        weekdayChecks.forEach(check => {
            if (state.selectedDays.includes(parseInt(check.value))) check.checked = true;
        });
    }

    // Theme Logic
    if (themeToggle) themeToggle.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        applyTheme();
        saveSettings();
    });

    function applyTheme() {
        document.body.setAttribute('data-theme', state.theme);
        const icon = themeToggle.querySelector('i');
        if (state.theme === 'light') {
            icon.className = 'fas fa-sun';
            themeToggle.title = '다크 모드로 변경';
        } else {
            icon.className = 'fas fa-moon';
            themeToggle.title = '라이트 모드로 변경';
        }
    }

    // Event Listeners
    if (btnShort) btnShort.addEventListener('click', () => {
        state.mode = 'short';
        btnShort.classList.add('active');
        if (btnLong) btnLong.classList.remove('active');
        if (weekdayContainer) weekdayContainer.classList.add('hidden');
        updateUI();
    });

    if (btnLong) btnLong.addEventListener('click', () => {
        state.mode = 'long';
        btnLong.classList.add('active');
        if (btnShort) btnShort.classList.remove('active');
        if (weekdayContainer) weekdayContainer.classList.remove('hidden');
        if (state.category === 'none') {
            state.category = 'resident-long';
            if (categorySelect) categorySelect.value = 'resident-long';
        }
        updateUI();
    });

    setupDateMask(startDateInput, (val) => { 
        state.startDate = val; 
        ensureHolidaysForRange(state.startDate, state.endDate);
        updateUI(); 
    });
    setupDateMask(endDateInput, (val) => { 
        state.endDate = val; 
        ensureHolidaysForRange(state.startDate, state.endDate);
        updateUI(); 
    });
    if (excludeHolidaysCheck) excludeHolidaysCheck.addEventListener('change', (e) => { state.excludeHolidays = e.target.checked; updateUI(); });
    if (baseExcludeDatesInput) baseExcludeDatesInput.addEventListener('input', (e) => { state.baseExcludeDates = e.target.value; updateUI(); });

    weekdayChecks.forEach(check => {
        check.addEventListener('change', () => {
            state.selectedDays = Array.from(weekdayChecks).filter(c => c.checked).map(c => parseInt(c.value));
            updateUI();
        });
    });

    const setupFacility = (key, checkEl, detailsEl, startEl, endEl, hoursEl, excludeEl) => {
        if (checkEl) checkEl.addEventListener('change', (e) => {
            state[`use${key.charAt(0).toUpperCase() + key.slice(1)}`] = e.target.checked;
            if (detailsEl) detailsEl.classList.toggle('hidden', !e.target.checked);
            updateUI();
        });
        setupDateMask(startEl, (val) => { state[`${key}Start`] = val; updateUI(); });
        setupDateMask(endEl, (val) => { state[`${key}End`] = val; updateUI(); });
        if (hoursEl) hoursEl.addEventListener('input', (e) => { state[`${key}Hours`] = parseInt(e.target.value) || 0; updateUI(); });
        if (excludeEl) excludeEl.addEventListener('input', (e) => { state[`${key}ExcludeDates`] = e.target.value; updateUI(); });
    };

    setupFacility('light', useLightingCheck, lightingDetails, lightStartInput, lightEndInput, lightHoursInput, lightExcludeDatesInput);
    setupFacility('cooling', useCoolingCheck, coolingDetails, coolingStartInput, coolingEndInput, coolingHoursInput, coolingExcludeDatesInput);
    setupFacility('heating', useHeatingCheck, heatingDetails, heatingStartInput, heatingEndInput, heatingHoursInput, heatingExcludeDatesInput);

    if (gymSizeSelect) gymSizeSelect.addEventListener('change', (e) => { state.size = e.target.value; updateUI(); });
    if (durationInput) durationInput.addEventListener('input', (e) => {
        state.duration = parseInt(e.target.value);
        if (durationVal) durationVal.textContent = `${state.duration}시간`;
        updateUI();
    });
    if (categorySelect) categorySelect.addEventListener('change', (e) => { state.category = e.target.value; updateUI(); });

    if (btnSettings) btnSettings.addEventListener('click', () => {
        if ($('set-rate-small')) $('set-rate-small').value = state.rates.sports.small;
        if ($('set-rate-medium')) $('set-rate-medium').value = state.rates.sports.medium;
        if ($('set-rate-large')) $('set-rate-large').value = state.rates.sports.large;
        if ($('set-light-rate')) $('set-light-rate').value = state.lightRate;
        if (modal) modal.classList.add('active');
    });

    if (btnCloseModal) btnCloseModal.addEventListener('click', () => modal && modal.classList.remove('active'));
    if (btnSaveSettings) btnSaveSettings.addEventListener('click', () => {
        state.rates.sports.small = parseInt($('set-rate-small').value) || 0;
        state.rates.sports.medium = parseInt($('set-rate-medium').value) || 0;
        state.rates.sports.large = parseInt($('set-rate-large').value) || 0;
        state.lightRate = parseInt($('set-light-rate').value) || 0;
        saveSettings(); updateUI(); if (modal) modal.classList.remove('active');
    });

    const btnGuide = $('btn-guide');
    const guideModal = $('guide-modal');
    const btnCloseGuide = $('btn-close-guide');
    const btnGuideOk = $('btn-guide-ok');

    if (btnGuide && guideModal) {
        btnGuide.addEventListener('click', () => guideModal.classList.add('active'));
    }
    if (btnCloseGuide && guideModal) {
        btnCloseGuide.addEventListener('click', () => guideModal.classList.remove('active'));
    }
    if (btnGuideOk && guideModal) {
        btnGuideOk.addEventListener('click', () => guideModal.classList.remove('active'));
    }

    if (btnPrint) btnPrint.addEventListener('click', () => { window.print(); });

    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
        if (e.target === guideModal) guideModal.classList.remove('active');
    });

    function updateUI() {
        const isEvent = state.category === 'none';
        const rateSet = isEvent ? state.rates.event : state.rates.sports;
        const baseRate = rateSet[state.size];
        
        const allowedDays = state.mode === 'long' ? state.selectedDays : [0,1,2,3,4,5,6];
        const rawSessionDates = getSessionDates(state.startDate, state.endDate, allowedDays, state.excludeHolidays);
        
        const parseExcluded = (str) => {
            if (!str) return [];
            return str.split(',').map(s => {
                const raw = s.trim();
                if (!raw) return null;

                let reason = '';
                const matchParen = raw.match(/\((.*?)\)/);
                if (matchParen) {
                    reason = matchParen[1].trim();
                } else if (raw.includes(':')) {
                    const colonParts = raw.split(':');
                    reason = colonParts.slice(1).join(':').trim();
                }

                let datePart = raw.replace(/\(.*?\)/g, '').split(':')[0].trim().replace(/\./g, '-').replace(/\//g, '-');
                let formattedDate = '';
                const pureDigits = datePart.replace(/\D/g, '');
                if (pureDigits.length === 8) {
                    formattedDate = `${pureDigits.slice(0, 4)}-${pureDigits.slice(4, 6)}-${pureDigits.slice(6)}`;
                } else {
                    const parts = datePart.split('-');
                    if (parts.length === 3) {
                        const y = parts[0];
                        const m = parts[1].padStart(2, '0');
                        const d = parts[2].padStart(2, '0');
                        formattedDate = `${y}-${m}-${d}`;
                    } else {
                        formattedDate = datePart;
                    }
                }

                if (!/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) return null;

                return {
                    date: formattedDate,
                    reason: reason,
                    display: reason ? `${formattedDate}(${reason})` : formattedDate
                };
            }).filter(it => it !== null);
        };
        const baseExcludesList = parseExcluded(state.baseExcludeDates);
        const baseExcludesDates = baseExcludesList.map(it => it.date);
        const sessionDates = rawSessionDates.filter(d => !baseExcludesDates.includes(d));
        const totalSessions = Math.max(0, sessionDates.length);
        
        const calcFacSessions = (use, start, end, excludeStr) => {
            if (!use) return 0;
            const excludesList = parseExcluded(excludeStr);
            const excludesDates = excludesList.map(it => it.date);
            const count = sessionDates.filter(d => isWithinRange(d, start, end) && !excludesDates.includes(d)).length;
            return Math.max(0, count);
        };

        const lightSessions = calcFacSessions(state.useLighting, state.lightStart, state.lightEnd, state.lightExcludeDates);
        const coolingSessions = calcFacSessions(state.useCooling, state.coolingStart, state.coolingEnd, state.coolingExcludeDates);
        const heatingSessions = calcFacSessions(state.useHeating, state.heatingStart, state.heatingEnd, state.heatingExcludeDates);

        const hvacSurchargeRate = baseRate * 0.2;
        const totalHours = totalSessions * state.duration;
        const baseAmount = totalSessions * state.duration * baseRate;
        const lightingAmount = lightSessions * state.lightHours * state.lightRate;
        const coolingAmount = coolingSessions * state.coolingHours * hvacSurchargeRate;
        const heatingAmount = heatingSessions * state.heatingHours * hvacSurchargeRate;
        
        const subtotal = baseAmount + lightingAmount + coolingAmount + heatingAmount;
        const discountRate = getDiscountRate(state.category);
        const discountAmount = Math.floor(baseAmount * discountRate);
        const discountedBaseAmount = baseAmount - discountAmount;
        const total = discountedBaseAmount + lightingAmount + coolingAmount + heatingAmount;

        setText(resSessionCount, `${totalSessions}${state.mode === 'long' ? '회' : '일'}`);
        setText(resTotalHours, `${formatNumber(totalHours)}시간`);
        setText(resBase, `${formatNumber(baseAmount)}원`);
        setText(baseMath, `단가 ${formatNumber(baseRate)}원 × ${state.duration}시간 × ${totalSessions}${state.mode === 'long' ? '회' : '일'}`);

        if (discountRate > 0) {
            updateVisibility(true, discountedBaseRow);
            updateVisibility(true, discountedBaseMath);
            setText(resDiscountedBase, `${formatNumber(discountedBaseAmount)}원`);
            setText(discountedBaseMath, `기본 ${formatNumber(baseAmount)}원 - 감면액 ${formatNumber(discountAmount)}원`);
        } else {
            updateVisibility(false, discountedBaseRow);
            updateVisibility(false, discountedBaseMath);
        }

        const updateFacRow = (use, row, resEl, mathEl, val, mathText) => {
            updateVisibility(use, row);
            updateVisibility(use, mathEl);
            if (use) {
                setText(resEl, `${formatNumber(val)}원`);
                setText(mathEl, mathText);
            }
        };

        const sessT = state.mode === 'long' ? '회' : '일';
        updateFacRow(state.useLighting, lightingRow, resLighting, lightMath, lightingAmount, `단가 ${formatNumber(state.lightRate)}원 × ${state.lightHours}시간 × ${lightSessions}${sessT}`);
        updateFacRow(state.useCooling, coolingRow, resCooling, coolingMath, coolingAmount, `기본료 20%(${formatNumber(hvacSurchargeRate)}원) × ${state.coolingHours}시간 × ${coolingSessions}${sessT}`);
        updateFacRow(state.useHeating, heatingRow, resHeating, heatingMath, heatingAmount, `기본료 20%(${formatNumber(hvacSurchargeRate)}원) × ${state.heatingHours}시간 × ${heatingSessions}${sessT}`);

        // Holidays during period
        const holidaysInRange = [];
        if (state.startDate && state.endDate) {
            const curH = new Date(state.startDate);
            const lastH = new Date(state.endDate);
            while (curH <= lastH) {
                const dStr = curH.toISOString().split('T')[0];
                if (allowedDays.includes(curH.getDay()) && isHoliday(dStr)) {
                    const hName = apiHolidays[dStr] || '공휴일';
                    const m = curH.getMonth() + 1;
                    const d = curH.getDate();
                    holidaysInRange.push(`${m}/${d}(${hName})`);
                }
                curH.setDate(curH.getDate() + 1);
            }
        }

        // Excluded days breakdown (Holidays + Additional Excludes)
        const hCount = holidaysInRange.length;
        const validBaseExcludes = baseExcludesList.filter(it => rawSessionDates.includes(it.date));
        const eCount = validBaseExcludes.length;

        if (state.excludeHolidays) {
            const totalEx = hCount + eCount;
            if (hCount > 0 && eCount > 0) {
                setText(resHolidayCount, `${totalEx}일 제외 (공휴일 ${hCount} + 추가 ${eCount})`);
            } else if (hCount > 0) {
                setText(resHolidayCount, `${hCount}일 제외`);
            } else if (eCount > 0) {
                setText(resHolidayCount, `추가 ${eCount}일 제외`);
            } else {
                setText(resHolidayCount, `0일 제외`);
            }
        } else {
            if (eCount > 0) {
                setText(resHolidayCount, `추가 ${eCount}일 제외 (공휴일 미제외)`);
            } else if (hCount > 0) {
                setText(resHolidayCount, `${hCount}일 (미제외)`);
            } else {
                setText(resHolidayCount, `0일`);
            }
        }

        const hasExInfo = hCount > 0 || eCount > 0;
        updateVisibility(hasExInfo, btnToggleHolidays);

        if (hasExInfo) {
            let html = '';
            html += `<div class="pop-block"><strong>🏛️ 관공서 공휴일 (${hCount}일 ${state.excludeHolidays ? '제외' : '미제외'}):</strong><p>${hCount > 0 ? holidaysInRange.join(', ') : '선택 요일에 해당하는 공휴일 없음'}</p></div>`;
            if (eCount > 0) {
                html += `<div class="pop-block" style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.15);"><strong>✏️ 추가 제외 일자 (${eCount}일 제외):</strong><p>${validBaseExcludes.map(it => it.display).join(', ')}</p></div>`;
            }
            if (holidayMath) holidayMath.innerHTML = html;
        } else {
            if (holidayMath) holidayMath.innerHTML = '<p>제외일 없음</p>';
            updateVisibility(false, holidayMath);
        }

        setText(resSubtotal, `${formatNumber(subtotal)}원`);
        setText(resDiscountLabel, `${Math.round(discountRate * 100)}%`);
        setText(resDiscount, `-${formatNumber(discountAmount)}원`);

        // HVAC Total Row (Cooling + Heating)
        const hvacTotal = coolingAmount + heatingAmount;
        const showHvacTotal = state.useCooling || state.useHeating;
        updateVisibility(showHvacTotal, hvacTotalRow);
        if (showHvacTotal) {
            setText(resHvacTotal, `${formatNumber(hvacTotal)}원`);
        }

        animateNumber(resTotal, total);
        
        const resultBody = document.querySelector('.result-card .card-body');
        if (resultBody) {
            const now = new Date();
            resultBody.setAttribute('data-date', `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`);
        }
    }

    function setText(el, val) { if (el) el.textContent = val; }
    
    function isHoliday(dateStr) {
        if (!dateStr) return false;
        const year = parseInt(dateStr.slice(0, 4), 10);

        // 0. If official KASI OpenAPI holidays are loaded for this year, strictly use them
        if (loadedYears.has(year)) {
            return !!apiHolidays[dateStr];
        }

        // Fallback when offline or not yet loaded
        const date = new Date(dateStr);
        const month = date.getMonth() + 1;
        const day = date.getDate();

        // 1. Solar Fixed Holidays
        const solarHolidays = [
            '01-01', '03-01', '05-01', '05-05', '06-06', '07-17', '08-15', '10-03', '10-09', '12-25'
        ];
        const mmdd = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        if (solarHolidays.includes(mmdd)) return true;

        // 2. Substitute Holidays for Solar (if Sat/Sun)
        for (let h of solarHolidays) {
            const [hM, hD] = h.split('-').map(Number);
            const hDate = new Date(year, hM - 1, hD);
            const hDay = hDate.getDay();
            
            if (hDay === 0) { // Sunday -> Next Monday
                const subDate = new Date(year, hM - 1, hD + 1);
                if (subDate.toISOString().split('T')[0] === dateStr) return true;
            } else if (hDay === 6 && ['03-01', '05-05', '07-17', '08-15', '10-03', '10-09'].includes(h)) { // Saturday -> Next Monday
                const subDate = new Date(year, hM - 1, hD + 2);
                if (subDate.toISOString().split('T')[0] === dateStr) return true;
            }
        }

        // 3. Lunar Holidays (Seollal, Chuseok, Buddha's Birthday)
        if (LUNAR_HOLIDAYS[year] && LUNAR_HOLIDAYS[year].includes(dateStr)) return true;

        return false;
    }

    function getSessionDates(start, end, allowedDays, skipHolidays) {
        if (!isValidDate(start) || !isValidDate(end) || allowedDays.length === 0) return [];
        if (start > end) return [];

        const [sY, sM, sD] = start.split('-').map(Number);
        const [eY, eM, eD] = end.split('-').map(Number);
        const cur = new Date(sY, sM - 1, sD);
        const last = new Date(eY, eM - 1, eD);

        // Safety limit: max 3 years (1100 days) to prevent any runaway loops
        if ((last.getTime() - cur.getTime()) > 1200 * 86400000) return [];

        const dates = [];
        while (cur <= last) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;
            const isAllowedDay = allowedDays.includes(cur.getDay());
            if (isAllowedDay && !(skipHolidays && isHoliday(dateStr))) dates.push(dateStr);
            cur.setDate(cur.getDate() + 1);
        }
        return dates;
    }

    function isWithinRange(dateStr, start, end) { return start && end && dateStr >= start && dateStr <= end; }
    function updateVisibility(isActive, element) { if (element) element.classList.toggle('hidden', !isActive); }
    function animateNumber(element, target) {
        if (!element) return;
        const current = parseInt(element.textContent.replace(/,/g, '')) || 0;
        const duration = 500;
        const start = performance.now();
        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            element.textContent = formatNumber(Math.floor(progress * (target - current) + current));
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }
    function getDiscountRate(category) {
        switch (category) {
            case 'resident-long': return 0.6;
            case 'vulnerable': return 0.5;
            case 'worker-long': return 0.4;
            case 'official': return 1.0;
            default: return 0;
        }
    }
    function formatNumber(num) { return num.toLocaleString(); }
    function saveSettings() { localStorage.setItem('school-gym-rates-v5', JSON.stringify({ rates: state.rates, lightRate: state.lightRate, theme: state.theme })); }
    function loadSettings() {
        const saved = localStorage.getItem('school-gym-rates-v5');
        if (saved) {
            const data = JSON.parse(saved);
            if (data.rates) state.rates = data.rates;
            state.lightRate = data.lightRate;
            state.theme = data.theme || 'dark';
        }
    }
});
