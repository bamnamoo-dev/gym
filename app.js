document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        mode: 'short', 
        rates: {
            sports: { small: 15000, medium: 20000, large: 30000 },
            event: { small: 30000, medium: 40000, large: 60000 }
        },
        size: 'medium',
        purpose: 'sports',
        duration: 2,
        category: 'none',
        startDate: '',
        endDate: '',
        selectedDays: [],
        excludeHolidays: false,
        baseExcludeDates: '',
        
        // Facilities State (Cooling / Heating)
        useCooling: false,
        coolingStart: '',
        coolingEnd: '',
        coolingHours: 2,
        coolingExcludeDates: '',

        useHeating: false,
        heatingStart: '',
        heatingEnd: '',
        heatingHours: 2,
        heatingExcludeDates: '',

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
    const btnQuick1Year = $('btn-quick-1year');
    const weekdayChecks = document.querySelectorAll('.day-check input');
    const excludeHolidaysCheck = $('exclude-holidays');
    const baseExcludeDatesInput = $('base-exclude-dates');
    const gymSizeSelect = $('gym-size');
    const gymPurposeSelect = $('gym-purpose');
    const durationInput = $('duration');
    const durationVal = $('duration-val');
    const categorySelect = $('category');

    // Facilities DOM
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

    if (btnQuick1Year) {
        btnQuick1Year.addEventListener('click', () => {
            const now = new Date();
            const currYear = now.getFullYear();
            const currMonth = now.getMonth() + 1;
            const baseYear = currMonth <= 2 ? currYear - 1 : currYear;
            const nextYear = baseYear + 1;
            const lastDayFeb = new Date(nextYear, 2, 0).getDate();

            // 1. Switch to Long mode (정기 대관)
            state.mode = 'long';
            if (btnShort) btnShort.classList.remove('active');
            if (btnLong) btnLong.classList.add('active');
            if (weekdayContainer) weekdayContainer.classList.remove('hidden');

            // 2. Set 1-Year Base Dates (3/1 ~ 익년 2월말)
            state.startDate = `${baseYear}-03-01`;
            state.endDate = `${nextYear}-02-${lastDayFeb}`;
            if (startDateInput) startDateInput.value = state.startDate;
            if (endDateInput) endDateInput.value = state.endDate;

            // 3. Set Weekdays (선택된 요일이 없으면 토·일 기본 선택)
            const checkedDays = Array.from(weekdayChecks).filter(c => c.checked);
            if (checkedDays.length === 0) {
                weekdayChecks.forEach(check => {
                    if (check.value === '6' || check.value === '0') {
                        check.checked = true;
                    }
                });
                state.selectedDays = [6, 0];
            } else {
                state.selectedDays = checkedDays.map(c => parseInt(c.value));
            }

            // 4. Default Duration 2 Hours
            state.duration = 2;
            if (durationInput) durationInput.value = 2;
            if (durationVal) durationVal.textContent = '2시간';

            // 5. Exclude Holidays ON
            state.excludeHolidays = true;
            if (excludeHolidaysCheck) excludeHolidaysCheck.checked = true;

            // 6. Cooling (6월 1일 ~ 8월 31일, 하루 2시간)
            state.useCooling = true;
            state.coolingStart = `${baseYear}-06-01`;
            state.coolingEnd = `${baseYear}-08-31`;
            state.coolingHours = 2;
            if (useCoolingCheck) useCoolingCheck.checked = true;
            if (coolingDetails) coolingDetails.classList.remove('hidden');
            if (coolingStartInput) coolingStartInput.value = state.coolingStart;
            if (coolingEndInput) coolingEndInput.value = state.coolingEnd;
            if (coolingHoursInput) coolingHoursInput.value = 2;

            // 7. Heating (11월 1일 ~ 익년 2월말, 하루 2시간)
            state.useHeating = true;
            state.heatingStart = `${baseYear}-11-01`;
            state.heatingEnd = `${nextYear}-02-${lastDayFeb}`;
            state.heatingHours = 2;
            if (useHeatingCheck) useHeatingCheck.checked = true;
            if (heatingDetails) heatingDetails.classList.remove('hidden');
            if (heatingStartInput) heatingStartInput.value = state.heatingStart;
            if (heatingEndInput) heatingEndInput.value = state.heatingEnd;
            if (heatingHoursInput) heatingHoursInput.value = 2;

            ensureHolidaysForRange(state.startDate, state.endDate);
            updateUI();
        });
    }

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

    setupFacility('cooling', useCoolingCheck, coolingDetails, coolingStartInput, coolingEndInput, coolingHoursInput, coolingExcludeDatesInput);
    setupFacility('heating', useHeatingCheck, heatingDetails, heatingStartInput, heatingEndInput, heatingHoursInput, heatingExcludeDatesInput);

    if (gymSizeSelect) gymSizeSelect.addEventListener('change', (e) => { state.size = e.target.value; updateUI(); });
    if (gymPurposeSelect) gymPurposeSelect.addEventListener('change', (e) => { state.purpose = e.target.value; updateUI(); });
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
        if (modal) modal.classList.add('active');
    });

    if (btnCloseModal) btnCloseModal.addEventListener('click', () => modal && modal.classList.remove('active'));
    if (btnSaveSettings) btnSaveSettings.addEventListener('click', () => {
        state.rates.sports.small = parseInt($('set-rate-small').value) || 0;
        state.rates.sports.medium = parseInt($('set-rate-medium').value) || 0;
        state.rates.sports.large = parseInt($('set-rate-large').value) || 0;
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
        const rateSet = state.rates[state.purpose] || state.rates.sports;
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

        const coolingSessions = calcFacSessions(state.useCooling, state.coolingStart, state.coolingEnd, state.coolingExcludeDates);
        const heatingSessions = calcFacSessions(state.useHeating, state.heatingStart, state.heatingEnd, state.heatingExcludeDates);

        const hvacSurchargeRate = baseRate * 0.2;
        const totalHours = totalSessions * state.duration;
        const baseAmount = totalSessions * state.duration * baseRate;
        const coolingAmount = coolingSessions * state.coolingHours * hvacSurchargeRate;
        const heatingAmount = heatingSessions * state.heatingHours * hvacSurchargeRate;
        
        const subtotal = baseAmount + coolingAmount + heatingAmount;
        const discountRate = getDiscountRate(state.category);
        const discountAmount = Math.floor(baseAmount * discountRate);
        const discountedBaseAmount = baseAmount - discountAmount;
        const total = discountedBaseAmount + coolingAmount + heatingAmount;

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
        
        // Sync Print Document
        const now = new Date();
        const dateStrKr = `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월 ${String(now.getDate()).padStart(2, '0')}일`;
        setText($('print-issue-date'), dateStrKr);
        setText($('print-sign-date'), dateStrKr);

        const sizeLabel = state.size === 'small' ? '360㎡ 미만' : state.size === 'large' ? '720㎡ 이상' : '360㎡ 이상 ~ 720㎡ 미만';
        setText($('print-gym-size'), sizeLabel);

        const purposeLabel = state.purpose === 'sports' ? '기본 체육활동 (운동/동호회)' : '전용 행사목적 (체육대회/발표회)';
        setText($('print-purpose'), purposeLabel);

        const periodStr = (state.startDate && state.endDate) ? `${state.startDate} ~ ${state.endDate}` : '기간 미설정';
        setText($('print-period'), periodStr);

        const daysMap = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 0: '일' };
        const daysStr = state.mode === 'long' ? (state.selectedDays.length > 0 ? state.selectedDays.map(d => daysMap[d]).join(', ') : '요일 미선택') : '단기 대관';
        setText($('print-schedule'), `${daysStr} (회당 ${state.duration}시간)`);
        setText($('print-sessions'), `${totalSessions}${state.mode === 'long' ? '회' : '일'} / 총 ${formatNumber(totalHours)}시간`);
        
        const exSummary = resHolidayCount ? resHolidayCount.textContent : '0일 제외';
        setText($('print-excludes'), exSummary);

        const catLabels = {
            'resident-long': '지역 주민 (6개월+ / 60% 감면)',
            'vulnerable': '사회적 배려 대상 (50% 감면)',
            'worker-long': '관외 직장인 동호회 (40% 감면)',
            'official': '공식 행사 (100% 면제)',
            'none': '일반 (감면 미해당)'
        };
        setText($('print-category'), catLabels[state.category] || '일반');

        const coolingDetailStr = state.useCooling && state.coolingStart && state.coolingEnd ? `${state.coolingStart} ~ ${state.coolingEnd} (${coolingSessions}회 / ${coolingSessions * state.coolingHours}시간)` : '미사용';
        setText($('print-cooling-detail'), coolingDetailStr);

        const heatingDetailStr = state.useHeating && state.heatingStart && state.heatingEnd ? `${state.heatingStart} ~ ${state.heatingEnd} (${heatingSessions}회 / ${heatingSessions * state.heatingHours}시간)` : '미사용';
        setText($('print-heating-detail'), heatingDetailStr);

        // Calculation Table
        setText($('print-calc-base'), `단가 ${formatNumber(baseRate)}원 × ${state.duration}시간 × ${totalSessions}${state.mode === 'long' ? '회' : '일'}`);
        setText($('print-hours-base'), `${formatNumber(totalHours)}시간`);
        setText($('print-rate-base'), `${formatNumber(baseRate)}원`);
        setText($('print-amount-base'), `${formatNumber(baseAmount)}원`);

        updateVisibility(discountRate > 0, $('print-row-discount'));
        if (discountRate > 0) {
            setText($('print-calc-discount'), `${catLabels[state.category]} 감면 적용`);
            setText($('print-rate-discount'), `-${Math.round(discountRate * 100)}%`);
            setText($('print-amount-discount'), `-${formatNumber(discountAmount)}원`);
        }

        updateVisibility(state.useCooling, $('print-row-cooling'));
        if (state.useCooling) {
            setText($('print-calc-cooling'), `기본단가 20%(${formatNumber(hvacSurchargeRate)}원) × ${state.coolingHours}시간 × ${coolingSessions}회`);
            setText($('print-hours-cooling'), `${coolingSessions * state.coolingHours}시간`);
            setText($('print-rate-cooling'), `${formatNumber(hvacSurchargeRate)}원`);
            setText($('print-amount-cooling'), `${formatNumber(coolingAmount)}원`);
        }

        updateVisibility(state.useHeating, $('print-row-heating'));
        if (state.useHeating) {
            setText($('print-calc-heating'), `기본단가 20%(${formatNumber(hvacSurchargeRate)}원) × ${state.heatingHours}시간 × ${heatingSessions}회`);
            setText($('print-hours-heating'), `${heatingSessions * state.heatingHours}시간`);
            setText($('print-rate-heating'), `${formatNumber(hvacSurchargeRate)}원`);
            setText($('print-amount-heating'), `${formatNumber(heatingAmount)}원`);
        }

        setText($('print-amount-hvac'), `${formatNumber(hvacTotal)}원`);
        setText($('print-total-korean'), numberToKorean(total));
        setText($('print-amount-total'), formatNumber(total));
    }

    function numberToKorean(number) {
        if (!number || number === 0) return '금 영원정';
        const units = ['', '만', '억', '조'];
        const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
        const subUnits = ['', '십', '백', '천'];
        
        let numStr = String(Math.floor(number));
        let result = '';
        let unitIdx = 0;
        
        while (numStr.length > 0) {
            const chunk = numStr.slice(-4);
            numStr = numStr.slice(0, -4);
            let chunkStr = '';
            for (let i = 0; i < chunk.length; i++) {
                const d = parseInt(chunk[i]);
                const pos = chunk.length - i - 1;
                if (d > 0) {
                    chunkStr += digits[d] + subUnits[pos];
                }
            }
            if (chunkStr) {
                result = chunkStr + units[unitIdx] + ' ' + result;
            }
            unitIdx++;
        }
        return '금 ' + result.trim() + '원정';
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
    function saveSettings() { localStorage.setItem('school-gym-rates-v6', JSON.stringify({ rates: state.rates, theme: state.theme })); }
    function loadSettings() {
        const saved = localStorage.getItem('school-gym-rates-v6');
        if (saved) {
            const data = JSON.parse(saved);
            if (data.rates) state.rates = data.rates;
            state.theme = data.theme || 'dark';
        }
    }
});
